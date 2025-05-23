#!/usr/bin/env node

const fs = require('fs');
const fetch = require('node-fetch');
const readline = require('readline');

// Configuration - default values, will prompt for confirmation
const DEFAULT_CONFIG = {
  wp_rest_url: 'http://culturehack.test/wp-json/wp/v2',
  custom_api_url: 'http://culturehack.test/wp-json/nhtbl/v1',
  embedding_api_url: 'http://localhost:3000',
  auth_endpoint: '/api/auth/token',
  embedding_endpoint: '/api/embedding/receive-modules',
  batch_size: 25,
  delay_between_batches: 1000, // ms
};

console.log('=== Curriculum Content Indexer ===');
console.log('This script will index all curriculum content from both:');
console.log('1. Standard WordPress API (curriculum post type)');
console.log('2. Custom API endpoint (curriculum-blocks)');

// Create a readline interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Display the current configuration and ask for confirmation
console.log('\nCurrent configuration:');
console.log(JSON.stringify(DEFAULT_CONFIG, null, 2));
console.log('\n');

rl.question('Do you want to continue with this configuration? (y/n): ', async answer => {
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('Indexing cancelled');
    rl.close();
    return;
  }

  rl.close();
  await indexAllCurriculum(DEFAULT_CONFIG);
});

async function indexAllCurriculum(config) {
  try {
    console.log('\n=== Starting Curriculum Indexing Process ===');

    // Get authentication token
    console.log('Getting authentication token...');
    const token = await getAuthToken(config);
    console.log('Authentication successful!');

    // 1. Get curriculum posts from standard WP API
    console.log('\n=== Fetching from Standard WordPress API ===');
    const standardPosts = await getCurriculumPosts(config);
    console.log(`Found ${standardPosts.length} curriculum posts via standard API`);

    // 2. Get curriculum blocks from custom API
    console.log('\n=== Fetching from Custom API ===');
    const customBlocks = await getCurriculumBlocks(config);
    console.log(`Found ${customBlocks.length} curriculum blocks via custom API`);

    // 3. Process and combine all content
    const allContent = [...formatStandardPosts(standardPosts), ...formatCustomBlocks(customBlocks)];

    console.log(`\nTotal curriculum content to index: ${allContent.length} items`);

    // 4. Send to embedding service in batches
    await sendInBatches(config, allContent, token);

    console.log('\n=== Indexing Complete! ===');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function getAuthToken(config) {
  try {
    const response = await fetch(`${config.embedding_api_url}${config.auth_endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'wp_indexer' }),
    });

    if (!response.ok) {
      throw new Error(`Auth failed: ${response.status}`);
    }

    const data = await response.json();
    return data.token || data;
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

async function getCurriculumPosts(config) {
  try {
    console.log(`Fetching from: ${config.wp_rest_url}/curriculum`);
    const response = await fetch(`${config.wp_rest_url}/curriculum`);

    if (!response.ok) {
      console.error(`Error fetching curriculum posts: ${response.status}`);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching curriculum posts:', error.message);
    return [];
  }
}

async function getCurriculumBlocks(config) {
  try {
    console.log(`Fetching from: ${config.custom_api_url}/curriculum-blocks`);
    const response = await fetch(`${config.custom_api_url}/curriculum-blocks`);

    if (!response.ok) {
      console.error(`Error fetching curriculum blocks: ${response.status}`);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching curriculum blocks:', error.message);
    return [];
  }
}

function formatStandardPosts(posts) {
  return posts.map(post => ({
    id: post.id.toString(),
    title: post.title.rendered || `Curriculum ${post.id}`,
    content: post.content.rendered || '',
    url: post.link,
    source: 'standard_api',
  }));
}

function formatCustomBlocks(blocks) {
  return blocks.map(block => ({
    id: `block-${block.id}`,
    title: `Curriculum Block ${block.id}`,
    content: formatBlocksContent(block.blocks),
    url: block.permalink,
    source: 'custom_api',
  }));
}

function formatBlocksContent(blocks) {
  if (!blocks || !Array.isArray(blocks)) {
    return '';
  }

  return blocks
    .map(block => {
      // Handle text blocks
      if (block.innerContent && block.innerContent.length > 0) {
        return block.innerContent.filter(Boolean).join('\n');
      }

      // Handle nested blocks
      if (block.innerBlocks && block.innerBlocks.length > 0) {
        return formatBlocksContent(block.innerBlocks);
      }

      // Extract any attributes with content
      if (block.attrs) {
        const contentFields = ['content', 'text', 'description', 'title'];
        for (const field of contentFields) {
          if (block.attrs[field]) {
            return block.attrs[field];
          }
        }
      }

      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

async function sendInBatches(config, allContent, token) {
  const batchSize = config.batch_size;
  const totalBatches = Math.ceil(allContent.length / batchSize);

  console.log(`Sending content in ${totalBatches} batches (${batchSize} items per batch)`);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, allContent.length);
    const batch = allContent.slice(start, end);

    console.log(`\nProcessing batch ${i + 1}/${totalBatches} (items ${start + 1}-${end})`);

    try {
      const response = await fetch(`${config.embedding_api_url}${config.embedding_endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ posts: batch }),
      });

      if (!response.ok) {
        console.error(`Failed to index batch ${i + 1}: ${response.status}`);
        continue;
      }

      console.log(`Successfully indexed batch ${i + 1}`);

      // Add delay between batches except for the last one
      if (i < totalBatches - 1) {
        console.log(`Waiting ${config.delay_between_batches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, config.delay_between_batches));
      }
    } catch (error) {
      console.error(`Error processing batch ${i + 1}:`, error.message);
    }
  }
}
