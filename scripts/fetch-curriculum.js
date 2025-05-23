#!/usr/bin/env node

const fetch = require('node-fetch');

// Configuration - change these to match your environment
const WP_REST_URL = 'http://culturehack.test/wp-json/wp/v2';
const CUSTOM_API_URL = 'http://culturehack.test/wp-json/nhtbl/v1/curriculum-blocks';

async function main() {
  console.log('====== Curriculum Content Fetch Test ======\n');

  // 1. Try standard WordPress REST API first
  try {
    console.log('Method 1: Trying standard WordPress REST API');
    console.log(`URL: ${WP_REST_URL}/curriculum\n`);

    const standardResponse = await fetch(`${WP_REST_URL}/curriculum`);

    console.log(`Response status: ${standardResponse.status} (${standardResponse.statusText})`);

    if (standardResponse.ok) {
      const posts = await standardResponse.json();
      console.log(`Found ${posts.length} curriculum posts via standard API`);

      if (posts.length > 0) {
        console.log('\nExample of first post:');
        console.log(`ID: ${posts[0].id}`);
        console.log(`Title: ${posts[0].title.rendered}`);
        console.log(`URL: ${posts[0].link}`);
        console.log(`Content length: ${posts[0].content.rendered.length} chars`);
        console.log(`Content sample: ${posts[0].content.rendered.substring(0, 100)}...\n`);
      }
    } else {
      console.log('Failed to fetch from standard API\n');
    }
  } catch (error) {
    console.error(`Error with standard API: ${error.message}\n`);
  }

  // 2. Try custom API endpoint
  try {
    console.log('Method 2: Trying custom API endpoint');
    console.log(`URL: ${CUSTOM_API_URL}\n`);

    const customResponse = await fetch(CUSTOM_API_URL);

    console.log(`Response status: ${customResponse.status} (${customResponse.statusText})`);

    if (customResponse.ok) {
      const blocks = await customResponse.json();
      console.log(`Found ${blocks.length} curriculum blocks via custom API`);

      if (blocks.length > 0) {
        console.log('\nExample of first block:');
        console.log(`ID: ${blocks[0].id}`);
        console.log(`Permalink: ${blocks[0].permalink}`);

        // Format and show content from blocks
        let blockContent = formatBlocksContent(blocks[0].blocks);
        console.log(`Extracted content length: ${blockContent.length} chars`);
        console.log(`Content sample: ${blockContent.substring(0, 100)}...\n`);

        // Create a formatted post object that matches what we'd send to the embedding service
        const formattedPost = {
          id: blocks[0].id.toString(),
          title: `Curriculum Block ${blocks[0].id}`,
          content: blockContent,
          url: blocks[0].permalink,
        };

        console.log('Formatted post for embedding service:');
        console.log(JSON.stringify(formattedPost, null, 2).substring(0, 300) + '...\n');
      }
    } else {
      console.log('Failed to fetch from custom API\n');
    }
  } catch (error) {
    console.error(`Error with custom API: ${error.message}\n`);
  }

  console.log('====== Test Complete ======');
}

/**
 * Format blocks content into HTML
 */
function formatBlocksContent(blocks) {
  if (!blocks || !Array.isArray(blocks)) {
    return '';
  }

  return blocks
    .map(block => {
      // Handle text blocks
      if (block.innerContent && block.innerContent.length > 0) {
        return block.innerContent.join('\n');
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

      // Try to extract anything that might be content
      if (typeof block === 'object') {
        return JSON.stringify(block);
      }

      return '';
    })
    .join('\n\n');
}

main().catch(error => {
  console.error('Script failed:', error);
});
