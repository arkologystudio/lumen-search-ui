#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const readline = require('readline');

// Add timestamp to logs
const log = {
  info: message => console.log(`[INFO] [${new Date().toISOString()}] ${message}`),
  success: message => console.log(`[SUCCESS] [${new Date().toISOString()}] \x1b[32m${message}\x1b[0m`),
  warn: message => console.log(`[WARNING] [${new Date().toISOString()}] \x1b[33m${message}\x1b[0m`),
  error: message => console.error(`[ERROR] [${new Date().toISOString()}] \x1b[31m${message}\x1b[0m`),
  debug: message => console.log(`[DEBUG] [${new Date().toISOString()}] \x1b[36m${message}\x1b[0m`),
  data: (label, data) => {
    console.log(`[DATA] [${new Date().toISOString()}] ${label}:`);
    console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  },
};

log.info('Starting CultureHack content indexer');

// Default configuration
const DEFAULT_CONFIG = {
  wp_rest_url: 'http://culturehack.test/wp-json/wp/v2',
  embedding_api_url: 'http://localhost:3000',
  auth_endpoint: '/api/auth/token',
  embedding_endpoint: '/api/embedding/receive-modules',
  batch_size: 25,
  post_types: ['post', 'page', 'curriculum'],
  delay_between_batches: 1000, // ms
  debug_mode: false,
};

// Command line arguments
const args = process.argv.slice(2);
let configPath = './indexer-config.json';

log.info('Parsing command line arguments');

// Check for config file path in arguments
const configArgIndex = args.findIndex(arg => arg === '--config' || arg === '-c');
if (configArgIndex !== -1 && args.length > configArgIndex + 1) {
  configPath = args[configArgIndex + 1];
  log.info(`Using custom config path: ${configPath}`);
}

// Check for debug mode
const debugMode = args.includes('--debug') || args.includes('-d');
if (debugMode) {
  log.info('Debug mode enabled');
}

// Load configuration
let config = { ...DEFAULT_CONFIG, debug_mode: debugMode };
log.info(`Attempting to load configuration from ${configPath}`);
try {
  if (fs.existsSync(configPath)) {
    log.info(`Config file found at ${configPath}`);
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...userConfig, debug_mode: debugMode || userConfig.debug_mode };
    log.success(`Loaded configuration from ${configPath}`);
  } else {
    log.warn(`No config file found at ${configPath}, using defaults`);
  }
} catch (error) {
  log.error(`Error loading config file: ${error.message}`);
  log.info('Using default configuration');
}

// Override config with command line arguments
log.info('Processing command line overrides');

const wpUrlArgIndex = args.findIndex(arg => arg === '--wp-url');
if (wpUrlArgIndex !== -1 && args.length > wpUrlArgIndex + 1) {
  config.wp_rest_url = args[wpUrlArgIndex + 1];
  log.info(`WordPress URL overridden: ${config.wp_rest_url}`);
}

const apiUrlArgIndex = args.findIndex(arg => arg === '--api-url');
if (apiUrlArgIndex !== -1 && args.length > apiUrlArgIndex + 1) {
  config.embedding_api_url = args[apiUrlArgIndex + 1];
  log.info(`Embedding API URL overridden: ${config.embedding_api_url}`);
}

const batchSizeArgIndex = args.findIndex(arg => arg === '--batch-size');
if (batchSizeArgIndex !== -1 && args.length > batchSizeArgIndex + 1) {
  config.batch_size = parseInt(args[batchSizeArgIndex + 1], 10);
  log.info(`Batch size overridden: ${config.batch_size}`);
}

const postTypesArgIndex = args.findIndex(arg => arg === '--post-types');
if (postTypesArgIndex !== -1 && args.length > postTypesArgIndex + 1) {
  config.post_types = args[postTypesArgIndex + 1].split(',').map(type => type.trim());
  log.info(`Post types overridden: ${config.post_types.join(', ')}`);
}

const delayArgIndex = args.findIndex(arg => arg === '--delay');
if (delayArgIndex !== -1 && args.length > delayArgIndex + 1) {
  config.delay_between_batches = parseInt(args[delayArgIndex + 1], 10);
  log.info(`Batch delay overridden: ${config.delay_between_batches}ms`);
}

// Add a flag to discover all post types
const discoverTypesArg = args.includes('--discover-types');
if (discoverTypesArg) {
  log.info('Post type discovery enabled - will query WordPress for all public post types');
  config.discover_post_types = true;
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  log.info('Displaying help information');
  console.log(`
Usage: node index-content.js [options]

Options:
  --config, -c <path>      Path to configuration file (default: ./indexer-config.json)
  --wp-url <url>           WordPress REST API URL
  --api-url <url>          Embedding API URL
  --batch-size <number>    Number of posts to process in each batch
  --post-types <types>     Comma-separated list of post types to index
  --delay <ms>             Delay between batches in milliseconds
  --discover-types         Automatically detect all public post types from WordPress
  --debug, -d              Enable verbose debug logging
  --help, -h               Show this help message

Example:
  node index-content.js --wp-url https://mysite.com/wp-json/wp/v2 --batch-size 50

Configuration file example (indexer-config.json):
${JSON.stringify(DEFAULT_CONFIG, null, 2)}
  `);
  process.exit(0);
}

// Create a readline interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Display the current configuration and ask for confirmation
log.info('Final configuration:');
log.data('Configuration', config);

rl.question('Do you want to continue with this configuration? (y/n): ', async answer => {
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    log.info('Indexing cancelled by user');
    rl.close();
    return;
  }

  log.info('User confirmed configuration');
  rl.close();
  await indexAllContent(config);
});

/**
 * Get authentication token from the embedding service
 */
async function getAuthToken(config) {
  log.info('Getting authentication token');

  const authUrl = `${config.embedding_api_url}${config.auth_endpoint}`;
  log.info(`Authentication endpoint: ${authUrl}`);

  try {
    log.info('Sending authentication request');
    if (config.debug_mode) {
      log.debug('Auth request payload:');
      log.debug(JSON.stringify({ source: 'wp_indexer' }));
    }

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'wp_indexer' }),
    });

    if (!response.ok) {
      log.error(`Auth failed with status: ${response.status}`);
      if (config.debug_mode) {
        try {
          const errorBody = await response.text();
          log.debug(`Auth error response: ${errorBody}`);
        } catch (e) {
          log.debug('Could not read error response body');
        }
      }
      throw new Error(`Auth failed: ${response.status}`);
    }

    const data = await response.json();
    if (config.debug_mode) {
      log.debug('Auth response received');
      // Don't log the actual token for security, but log if it was received
      log.debug(`Token received: ${data.token ? 'Yes' : 'No'}`);
    }

    log.success('Authentication successful');
    return data.token || data;
  } catch (error) {
    log.error(`Authentication error: ${error.message}`);
    if (error.stack && config.debug_mode) {
      log.debug(`Error stack: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Discover available post types from WordPress
 */
async function discoverPostTypes(config) {
  log.info('Discovering available post types from WordPress');

  try {
    // First try the standard WordPress REST API types endpoint
    const response = await fetch(`${config.wp_rest_url}/types`, { method: 'GET' });

    if (!response.ok) {
      log.error(`Failed to retrieve post types: ${response.status}`);

      // Fallback: try without the "/wp/v2" part which might be already in the URL
      const baseUrl = config.wp_rest_url.replace(/\/wp\/v2$/, '');
      log.info(`Trying alternate URL for types: ${baseUrl}/wp/v2/types`);

      const fallbackResponse = await fetch(`${baseUrl}/wp/v2/types`, { method: 'GET' });
      if (!fallbackResponse.ok) {
        log.error(`Fallback also failed: ${fallbackResponse.status}`);
        return null;
      }

      const fallbackData = await fallbackResponse.json();
      log.info(`Successfully retrieved types from fallback URL`);
      processTypes(fallbackData);
    } else {
      const typesData = await response.json();
      log.info(`Successfully retrieved types from primary URL`);
      return processTypes(typesData);
    }
  } catch (error) {
    log.error(`Error discovering post types: ${error.message}`);
    if (config.debug_mode && error.stack) {
      log.debug(`Error stack: ${error.stack}`);
    }

    // Fallback to our list of known types
    log.warn('Falling back to predefined list of common post types');
    const commonTypes = ['post', 'page', 'curriculum'];
    return {
      availableTypes: commonTypes,
      postTypeMap: commonTypes.reduce((map, type) => {
        map[type] = type === 'curriculum' ? 'curriculum' : `${type}s`;
        return map;
      }, {}),
    };
  }

  // Helper function to process the types data
  function processTypes(typesData) {
    // Create a map of post type to rest_base
    const postTypeMap = {};
    const availableTypes = [];

    log.debug('Processing discovered types:');

    Object.entries(typesData).forEach(([key, type]) => {
      // Add types with rest_base (REST API enabled)
      if (type.rest_base) {
        postTypeMap[key] = type.rest_base;
        availableTypes.push(key);
        log.debug(`- ${key}: REST API enabled, base: ${type.rest_base}`);
      }
      // Also include any custom post types, even if not fully REST-enabled
      else if (key !== 'attachment' && key !== 'nav_menu_item' && key !== 'wp_block' && !key.startsWith('wp_')) {
        postTypeMap[key] = key; // Try the key directly as fallback
        availableTypes.push(key);
        log.debug(`- ${key}: Custom type, no direct REST API, will try with name`);
      }
    });

    if (availableTypes.length === 0) {
      log.warn('No suitable post types found, using defaults');
      const defaultTypes = ['post', 'page', 'curriculum'];
      defaultTypes.forEach(type => {
        if (!postTypeMap[type]) {
          availableTypes.push(type);
          postTypeMap[type] = type === 'curriculum' ? 'curriculum' : `${type}s`;
        }
      });
    }

    log.success(`Discovered ${availableTypes.length} post types: ${availableTypes.join(', ')}`);
    return { availableTypes, postTypeMap };
  }
}

/**
 * Fetch posts from WordPress REST API
 */
async function getPosts(config, page = 1, postType = 'post', postTypeMap = {}) {
  // Determine the REST endpoint for this post type
  // If we have a postTypeMap, use it, otherwise try to pluralize by adding 's'
  const endpoint = postTypeMap[postType] || `${postType}s`;

  const requestUrl = `${config.wp_rest_url}/${endpoint}?page=${page}&per_page=${config.batch_size}&_embed=true`;
  log.info(`Fetching ${postType} items from WordPress (page ${page})`);
  log.info(`Request URL: ${requestUrl}`);

  try {
    const startTime = Date.now();
    const response = await fetch(requestUrl, { method: 'GET' });
    const endTime = Date.now();

    log.info(`WordPress API response received in ${endTime - startTime}ms`);

    if (!response.ok) {
      // Special case for curriculum post type - try the custom endpoint
      if (postType === 'curriculum') {
        log.warn(`Standard API failed for curriculum, trying custom endpoint`);
        return await getCurriculumFromCustomEndpoint(config, page);
      }

      // If the first attempt failed with the mapped endpoint, try alternate forms
      if (page === 1 && postTypeMap[postType]) {
        log.warn(`Endpoint ${endpoint} failed, trying alternate forms of ${postType}`);

        // Try without pluralization
        const singularEndpoint = postType;
        const singularUrl = `${config.wp_rest_url}/${singularEndpoint}?page=${page}&per_page=${config.batch_size}&_embed=true`;
        log.info(`Trying singular endpoint: ${singularUrl}`);

        try {
          const altResponse = await fetch(singularUrl, { method: 'GET' });
          if (altResponse.ok) {
            log.success(`Alternate endpoint ${singularEndpoint} succeeded`);
            // Update the map for future requests
            postTypeMap[postType] = singularEndpoint;

            const totalPages = parseInt(altResponse.headers.get('X-WP-TotalPages') || '1', 10);
            const totalPosts = parseInt(altResponse.headers.get('X-WP-Total') || '0', 10);
            const posts = await altResponse.json();

            return { posts, totalPages, totalPosts };
          }
        } catch (e) {
          log.debug(`Alternate form failed: ${e.message}`);
        }
      }

      log.error(`Failed to fetch posts with status: ${response.status}`);
      if (config.debug_mode) {
        try {
          const errorBody = await response.text();
          log.debug(`WordPress API error response: ${errorBody}`);
        } catch (e) {
          log.debug('Could not read error response body');
        }
      }
      throw new Error(`Failed to fetch posts: ${response.status}`);
    }

    // Extract pagination info
    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
    const totalPosts = parseInt(response.headers.get('X-WP-Total') || '0', 10);
    log.info(`WordPress API headers: Total posts: ${totalPosts}, Total pages: ${totalPages}`);

    // Parse response body
    const posts = await response.json();
    log.success(`Successfully fetched ${posts.length} ${postType} items`);

    if (config.debug_mode && posts.length > 0) {
      log.debug('First post details:');
      const firstPost = posts[0];
      log.debug(`ID: ${firstPost.id}, Title: ${firstPost.title?.rendered || '(no title)'}`);
      log.debug(`Content length: ${firstPost.content?.rendered?.length || 0} chars`);
    }

    return { posts, totalPages, totalPosts };
  } catch (error) {
    log.error(`Error fetching ${postType}: ${error.message}`);
    if (error.stack && config.debug_mode) {
      log.debug(`Error stack: ${error.stack}`);
    }
    return { posts: [], totalPages: 0, totalPosts: 0 };
  }
}

/**
 * Special function to fetch curriculum content from the custom endpoint
 */
async function getCurriculumFromCustomEndpoint(config, page = 1) {
  const baseUrl = config.wp_rest_url.replace(/\/wp\/v2$/, '');
  const customUrl = `${baseUrl}/nhtbl/v1/curriculum-blocks`;

  log.info(`Fetching curriculum from custom endpoint: ${customUrl}`);

  try {
    const response = await fetch(customUrl);

    if (!response.ok) {
      log.error(`Custom endpoint failed with status: ${response.status}`);
      return { posts: [], totalPages: 0, totalPosts: 0 };
    }

    const blocks = await response.json();
    log.success(`Custom endpoint returned ${blocks.length} curriculum blocks`);

    // Calculate pagination based on batch size
    const batchSize = config.batch_size;
    const totalBlocks = blocks.length;
    const totalPages = Math.ceil(totalBlocks / batchSize);

    // Apply pagination manually
    const startIndex = (page - 1) * batchSize;
    const endIndex = Math.min(startIndex + batchSize, totalBlocks);
    const pageBlocks = blocks.slice(startIndex, endIndex);

    // Convert to WordPress API format
    const formattedPosts = pageBlocks.map(block => ({
      id: block.id,
      title: { rendered: `Curriculum Block ${block.id}` },
      content: { rendered: formatBlocksContent(block.blocks) },
      link: block.permalink,
      // Add any other fields needed by sendBatchToEmbeddingService
    }));

    return {
      posts: formattedPosts,
      totalPages,
      totalPosts: totalBlocks,
    };
  } catch (error) {
    log.error(`Error fetching from custom endpoint: ${error.message}`);
    return { posts: [], totalPages: 0, totalPosts: 0 };
  }
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

      return '';
    })
    .join('\n\n');
}

/**
 * Send a batch of posts to the embedding service
 */
async function sendBatchToEmbeddingService(config, posts, token) {
  log.info(`Preparing to send ${posts.length} posts to embedding service`);

  try {
    // Format posts for the embedding service
    log.info('Formatting posts for embedding service');
    const formattedPosts = posts.map(post => ({
      id: post.id.toString(),
      title: post.title.rendered,
      content: post.content.rendered,
      url: post.link,
    }));

    if (config.debug_mode) {
      log.debug(`Formatted post count: ${formattedPosts.length}`);
      if (formattedPosts.length > 0) {
        log.debug('First formatted post:');
        const firstPost = formattedPosts[0];
        log.debug(`ID: ${firstPost.id}, Title: ${firstPost.title.substring(0, 30)}...`);
        log.debug(`Content length: ${firstPost.content.length} chars, URL: ${firstPost.url}`);
      }
    }

    const embeddingUrl = `${config.embedding_api_url}${config.embedding_endpoint}`;
    log.info(`Sending batch to embedding endpoint: ${embeddingUrl}`);

    const startTime = Date.now();
    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ posts: formattedPosts }),
    });
    const endTime = Date.now();

    log.info(`Embedding API response received in ${endTime - startTime}ms`);

    if (!response.ok) {
      log.error(`Failed to index batch with status: ${response.status}`);
      if (config.debug_mode) {
        try {
          const errorBody = await response.text();
          log.debug(`Embedding API error response: ${errorBody}`);
        } catch (e) {
          log.debug('Could not read error response body');
        }
      }
      throw new Error(`Failed to index batch: ${response.status}`);
    }

    const responseData = await response.json();
    log.success(`Successfully indexed batch of ${posts.length} posts`);

    if (config.debug_mode) {
      log.debug('Embedding API response:');
      log.debug(JSON.stringify(responseData).substring(0, 200) + '...');
    }

    return responseData;
  } catch (error) {
    log.error(`Error sending batch to embedding service: ${error.message}`);
    if (error.stack && config.debug_mode) {
      log.debug(`Error stack: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Delay function to wait between batches
 */
function delay(ms) {
  return new Promise(resolve => {
    log.info(`Waiting ${ms}ms before next batch`);
    setTimeout(resolve, ms);
  });
}

/**
 * Main function to index all content
 */
async function indexAllContent(config) {
  log.info('======== STARTING CONTENT INDEXING PROCESS ========');
  try {
    // Get authentication token
    const token = await getAuthToken(config);

    // Get post type information
    let postTypeMap = {};

    // First, try to discover all post types
    const typeInfo = await discoverPostTypes(config);
    if (typeInfo) {
      postTypeMap = typeInfo.postTypeMap || {};

      // Use discovered types if auto-discovery is enabled
      if (config.discover_post_types) {
        config.post_types = typeInfo.availableTypes;
        log.info(`Using discovered post types: ${config.post_types.join(', ')}`);
      }
    } else {
      log.warn('Post type discovery failed, using configured types without endpoint mapping');
    }

    let totalIndexed = 0;
    let startTime = Date.now();

    // Process each post type
    for (const postType of config.post_types) {
      log.info(`\n======== PROCESSING POST TYPE: ${postType} ========`);

      // Get first batch and determine total pages
      const { posts, totalPages, totalPosts } = await getPosts(config, 1, postType, postTypeMap);

      if (totalPosts === 0) {
        log.warn(`No ${postType} items found to index`);
        continue;
      }

      log.info(`Found ${totalPosts} ${postType} items (${totalPages} pages) to index`);

      // Process first batch
      if (posts.length > 0) {
        await sendBatchToEmbeddingService(config, posts, token);
        totalIndexed += posts.length;
        log.success(`Indexed batch 1/${totalPages} of ${postType} (${posts.length} items)`);
        log.info(`Progress: ${Math.round((posts.length / totalPosts) * 100)}% of ${postType} complete`);
      }

      // Process remaining batches
      for (let page = 2; page <= totalPages; page++) {
        // Add delay between batches to avoid overloading the server
        if (config.delay_between_batches > 0) {
          await delay(config.delay_between_batches);
        }

        const { posts } = await getPosts(config, page, postType, postTypeMap);
        if (posts.length > 0) {
          await sendBatchToEmbeddingService(config, posts, token);
          totalIndexed += posts.length;
          const postTypeProgress = Math.round((page / totalPages) * 100);
          log.success(`Indexed batch ${page}/${totalPages} of ${postType}`);
          log.info(`Progress: ${postTypeProgress}% of ${postType} complete (${totalIndexed} total items indexed)`);
        }
      }

      log.success(`Completed indexing all ${postType} items`);
    }

    const endTime = Date.now();
    const totalTimeMin = ((endTime - startTime) / 1000 / 60).toFixed(2);

    log.info(`\n======== INDEXING COMPLETE ========`);
    log.success(`Successfully indexed ${totalIndexed} total items across all post types`);
    log.info(`Total processing time: ${totalTimeMin} minutes`);

    // Save an example config file if it doesn't exist
    if (!fs.existsSync(configPath)) {
      log.info(`Creating example configuration file at ${configPath}`);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      log.success(`Created example configuration file at ${configPath}`);
    }
  } catch (error) {
    log.error(`Indexing process failed: ${error.message}`);
    if (error.stack && config.debug_mode) {
      log.debug(`Error stack: ${error.stack}`);
    }
    process.exit(1);
  }
}
