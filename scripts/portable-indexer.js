#!/usr/bin/env node

/* package.json:
{
  "dependencies": {
    "node-fetch": "^2.6.7",
    "jsdom": "^22.1.0",
    "dotenv": "^16.0.3",
    "@wordpress/block-serialization-default-parser": "^4.20.0"
  }
}
*/

const fetch = require('node-fetch');
const readline = require('readline');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Add dotenv support

// Function to sanitize HTML content
function sanitizeHtml(html) {
  if (!html) return '';

  // Use JSDOM to parse HTML and extract text content
  const dom = new JSDOM(html);
  const text = dom.window.document.body.textContent || '';

  // Normalize whitespace
  return text.replace(/\s+/g, ' ').trim();
}

// Logger setup with levels and timestamps
const Logger = {
  LEVELS: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },
  level: 0, // Default to DEBUG level
  logToFile: false,
  logFile: null,
  stats: {
    apiCalls: 0,
    apiSuccesses: 0,
    apiFailures: 0,
    indexedItems: 0,
    errors: 0,
  },

  setupFileLogging(config) {
    if (!config.logToFile) return;

    this.logToFile = true;
    this.logFile = config.log_file;

    // Check if log file exists and if it's too large
    if (fs.existsSync(this.logFile)) {
      const stats = fs.statSync(this.logFile);
      if (stats.size > config.max_log_size) {
        // Create a backup with timestamp and start fresh
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFile = `${this.logFile}.${timestamp}.backup`;
        fs.renameSync(this.logFile, backupFile);
        this.info(`Log file rotated to ${backupFile}`);
      }
    }

    // Ensure log directory exists
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Write a header to the log file
    fs.writeFileSync(this.logFile, `=== Indexer Log Started at ${this.getTimestamp()} ===\n`, { flag: 'a' });
  },

  getTimestamp() {
    return new Date().toISOString();
  },

  setLevel(level) {
    this.level = level;
  },

  debug(message) {
    if (this.level <= this.LEVELS.DEBUG) {
      console.log(`[DEBUG] ${this.getTimestamp()}: ${message}`);
      this.writeToLog('DEBUG', message);
    }
  },

  info(message) {
    if (this.level <= this.LEVELS.INFO) {
      console.log(`[INFO] ${this.getTimestamp()}: ${message}`);
      this.writeToLog('INFO', message);
    }
  },

  warn(message) {
    if (this.level <= this.LEVELS.WARN) {
      console.warn(`[WARN] ${this.getTimestamp()}: ${message}`);
      this.writeToLog('WARN', message);
    }
  },

  error(message, error = null) {
    if (this.level <= this.LEVELS.ERROR) {
      console.error(`[ERROR] ${this.getTimestamp()}: ${message}`);
      this.writeToLog('ERROR', message);
      if (error && error.stack) {
        console.error(error.stack);
        this.writeToLog('ERROR', error.stack);
      }
      this.stats.errors++;
    }
  },

  writeToLog(level, message) {
    if (!this.logToFile || !this.logFile) return;

    try {
      fs.appendFileSync(this.logFile, `[${level}] ${this.getTimestamp()}: ${message}\n`);
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  },

  recordApiCall(success = true) {
    this.stats.apiCalls++;
    if (success) {
      this.stats.apiSuccesses++;
    } else {
      this.stats.apiFailures++;
    }
  },

  incrementIndexedItems(count = 1) {
    this.stats.indexedItems += count;
  },

  summarizeStats() {
    return {
      timestamp: this.getTimestamp(),
      apiCalls: this.stats.apiCalls,
      apiSuccesses: this.stats.apiSuccesses,
      apiFailures: this.stats.apiFailures,
      successRate: this.stats.apiCalls > 0 ? ((this.stats.apiSuccesses / this.stats.apiCalls) * 100).toFixed(2) + '%' : 'N/A',
      indexedItems: this.stats.indexedItems,
      errors: this.stats.errors,
    };
  },

  logStats() {
    const stats = this.summarizeStats();
    this.info('=== Indexing Statistics ===');
    this.info(JSON.stringify(stats, null, 2));
    return stats;
  },
};

// Try to load WordPress block parser if available
let BlockParser = null;
try {
  BlockParser = require('@wordpress/block-serialization-default-parser');
  Logger.info('WordPress block parser loaded successfully');
} catch (error) {
  Logger.warn('WordPress block parser not available. Using fallback parser. Install @wordpress/block-serialization-default-parser package for better results.');
}

// Function to check if content is non-readable text
function isInvalidContent(content, element = null) {
  if (!content || content.length === 0) return true;

  //   // Check for very short content that might just be a link
  //   if (content.length < 20) {
  //     // Consider short content invalid unless it appears to be a complete sentence
  //     return !/[A-Z].*[.!?]$/.test(content);
  //   }

  // Check if element contains iframes, videos, or other embeds
  if (element) {
    if (element.querySelector('iframe, video, embed, object')) {
      return true;
    }

    // If it's a link-only content
    if (element.tagName === 'A' || (element.children.length === 1 && element.children[0].tagName === 'A')) {
      return true;
    }
  }

  // Better URL detection logic
  // Check if content consists primarily of URLs
  const urlPattern = /https?:\/\/\S+/g;
  const urls = content.match(urlPattern) || [];

  // If we found URLs, analyze how much of the content is URLs
  if (urls.length > 0) {
    // Total length of all URLs
    const urlTextLength = urls.reduce((sum, url) => sum + url.length, 0);

    // If URLs make up more than 70% of the content, mark as invalid
    if (urlTextLength / content.length > 0.7) {
      return true;
    }

    // If the content is just URLs with some separators (spaces, commas, etc.)
    const contentWithoutUrls = content.replace(urlPattern, '').trim();
    const nonUrlContent = contentWithoutUrls.replace(/[\s,|;]+/g, '');

    // If there's very little content after removing URLs and separators
    if (nonUrlContent.length < 20) {
      return true;
    }
  }

  // Check if content looks like just a single URL
  if (/^https?:\/\/\S+$/.test(content.trim())) {
    return true;
  }

  // Check for very low ratio of letters to total content length
  const letterCount = (content.match(/[a-zA-Z]/g) || []).length;
  const letterRatio = letterCount / content.length;
  if (letterRatio < 0.3) {
    // Arbitrary threshold
    return true;
  }

  // Look for actual sentences in the content
  // Real content typically has sentences with capitals and punctuation
  const sentences = content.match(/[A-Z][^.!?]*[.!?]/g) || [];
  if (sentences.length === 0 && content.length > 30) {
    return true;
  }

  return false;
}

// Configuration with defaults and environment variable support
const DEFAULT_CONFIG = {
  wp_rest_url: process.env.WP_REST_URL || 'http://culturehack.test/wp-json/wp/v2',
  embedding_api_url: process.env.EMBEDDING_API_URL || 'http://localhost:3000',
  embedding_endpoint: process.env.EMBEDDING_ENDPOINT || '/api/embedding/receive-modules',
  embedding_api_key: process.env.EMBEDDING_API_KEY || 'eaa44b7f1bf5997c9a0aa67af7a458b7fbc98dce140ec46099dcf9dca751f690',
  post_types: (process.env.POST_TYPES || 'post,page,curriculum').split(','),
  batch_size: parseInt(process.env.BATCH_SIZE || '25', 10),
  delay_between_batches: parseInt(process.env.DELAY_BETWEEN_BATCHES || '1000', 10),
  extract_blocks: process.env.EXTRACT_BLOCKS !== 'false',
  include_full_posts: process.env.INCLUDE_FULL_POSTS !== 'false',
  log_level: process.env.LOG_LEVEL || 'DEBUG',
  output_to_file: process.env.OUTPUT_TO_FILE !== 'false',
  output_file: process.env.OUTPUT_FILE || './extracted-content.json',
  filter_invalid_content: process.env.FILTER_INVALID_CONTENT === 'true',
  include_taxonomies: process.env.INCLUDE_TAXONOMIES !== 'false', // Add taxonomy support
  include_meta: process.env.INCLUDE_META !== 'false', // Add meta field support
  incremental_indexing: process.env.INCREMENTAL_INDEXING !== 'false', // Incremental indexing
  last_run_file: process.env.LAST_RUN_FILE || './last-run.json', // File to store last run info
  max_content_length: parseInt(process.env.MAX_CONTENT_LENGTH || '1000', 10), // Max words per chunk
  max_log_size: parseInt(process.env.MAX_LOG_SIZE || '10', 10) * 1024 * 1024, // Max log size in MB
  log_file: process.env.LOG_FILE || './indexer.log', // Log file path
};

// Create a readline interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

Logger.info('=== Portable WordPress Content Indexer ===');
Logger.info('This script will:');
Logger.info('1. Fetch content using only the standard WordPress REST API');
Logger.info('2. Extract and index both full posts and individual content blocks');
Logger.info('3. Work with any WordPress site without requiring custom endpoints');

// Display the configuration and ask for confirmation
Logger.info('\nCurrent configuration:');
Logger.info(JSON.stringify(DEFAULT_CONFIG, null, 2));
Logger.info('\n');

rl.question('Use all default settings? (y/n): ', useDefaults => {
  if (useDefaults.toLowerCase() === 'y') {
    Logger.info('Using all default settings');
    rl.close();
    indexAllContent(DEFAULT_CONFIG);
    return;
  }

  rl.question('Enter WordPress site URL (or press Enter for default): ', async siteUrl => {
    if (siteUrl && siteUrl.trim()) {
      // Normalize the URL and update the configuration
      let baseUrl = siteUrl.trim();
      if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

      // If URL doesn't contain wp-json, add it
      if (!baseUrl.includes('/wp-json')) {
        baseUrl = `${baseUrl}/wp-json/wp/v2`;
      } else if (!baseUrl.includes('/wp/v2')) {
        baseUrl = `${baseUrl}/wp/v2`;
      }

      DEFAULT_CONFIG.wp_rest_url = baseUrl;
      Logger.info(`\nUsing WordPress API URL: ${DEFAULT_CONFIG.wp_rest_url}`);
    }

    rl.question('Enter embedding service URL (or press Enter for default): ', async embeddingUrl => {
      if (embeddingUrl && embeddingUrl.trim()) {
        DEFAULT_CONFIG.embedding_api_url = embeddingUrl.trim();
        Logger.info(`\nUsing embedding service URL: ${DEFAULT_CONFIG.embedding_api_url}`);
      }

      rl.question('Enter API key for embedding service (or press Enter for default): ', apiKey => {
        if (apiKey && apiKey.trim()) {
          DEFAULT_CONFIG.embedding_api_key = apiKey.trim();
          Logger.info(`API key set (first 5 chars: ${DEFAULT_CONFIG.embedding_api_key.substring(0, 5)}...)`);
        }

        rl.question('Log level (DEBUG, INFO, WARN, ERROR) [default: DEBUG]: ', logLevel => {
          if (logLevel && ['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(logLevel.toUpperCase())) {
            DEFAULT_CONFIG.log_level = logLevel.toUpperCase();
            Logger.setLevel(Logger.LEVELS[DEFAULT_CONFIG.log_level]);
            Logger.info(`Log level set to: ${DEFAULT_CONFIG.log_level}`);
          } else {
            Logger.setLevel(Logger.LEVELS.DEBUG); // Ensure debug level is set
          }

          rl.question('Write content to file instead of sending to embedding service? (y/n) [default: y]: ', writeToFile => {
            DEFAULT_CONFIG.output_to_file = writeToFile.toLowerCase() !== 'n';

            if (DEFAULT_CONFIG.output_to_file) {
              rl.question('Output file path [default: ./extracted-content.json]: ', filePath => {
                if (filePath && filePath.trim()) {
                  DEFAULT_CONFIG.output_file = filePath.trim();
                }
                Logger.info(`Content will be written to: ${DEFAULT_CONFIG.output_file}`);

                rl.question('Filter out invalid content from output file? (y/n) [default: n]: ', filterInvalid => {
                  DEFAULT_CONFIG.filter_invalid_content = filterInvalid.toLowerCase() === 'y';
                  Logger.info(`Invalid content will be ${DEFAULT_CONFIG.filter_invalid_content ? 'filtered out' : 'marked but included'} in the output`);

                  rl.question('Continue with this configuration? (y/n): ', async answer => {
                    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
                      Logger.info('Indexing cancelled');
                      rl.close();
                      return;
                    }

                    rl.close();
                    await indexAllContent(DEFAULT_CONFIG);
                  });
                });
              });
            } else {
              rl.question('Continue with this configuration? (y/n): ', async answer => {
                if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
                  Logger.info('Indexing cancelled');
                  rl.close();
                  return;
                }

                rl.close();
                await indexAllContent(DEFAULT_CONFIG);
              });
            }
          });
        });
      });
    });
  });
});

async function processContentInBatches(posts, postType, config) {
  const totalPosts = posts.length;
  // Use smaller batches for large content sets
  const batchSize = Math.min(5, Math.ceil(totalPosts / 10));
  const allItems = [];
  let totalBlocks = 0;

  Logger.info(`Processing ${totalPosts} ${postType} items in batches of ${batchSize}`);

  // Process in small batches to avoid memory issues
  for (let i = 0; i < totalPosts; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, totalPosts);
    Logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalPosts / batchSize)} (items ${i + 1}-${batchEnd})`);

    // Get a slice of posts for this batch and clear references to help GC
    const batch = posts.slice(i, batchEnd);

    // Add full posts if configured to do so
    if (config.include_full_posts) {
      try {
        const formattedPosts = formatPosts(batch, postType);
        allItems.push(...formattedPosts);
        Logger.info(`Added ${batch.length} full ${postType} items`);
      } catch (error) {
        Logger.error(`Error formatting posts in batch ${Math.floor(i / batchSize) + 1}:`, error);
      }
    }

    // Extract and add blocks if configured to do so
    if (config.extract_blocks) {
      let batchBlocks = 0;

      // Process posts one by one to avoid memory issues
      for (let j = 0; j < batch.length; j++) {
        const post = batch[j];
        try {
          Logger.debug(`Extracting blocks from post ID ${post.id}`);
          const blocks = extractBlocksFromPost(post);

          if (blocks.length > 0) {
            // Write blocks directly to file if possible to avoid keeping in memory
            if (config.output_to_file && blocks.length > 20) {
              // If we have a lot of blocks, write them immediately to avoid memory issues
              const tempFile = `${config.output_file}.part.${postType}.${post.id}.json`;
              try {
                const tempDir = path.dirname(tempFile);
                if (!fs.existsSync(tempDir)) {
                  fs.mkdirSync(tempDir, { recursive: true });
                }

                // Write blocks to temp file and record their count
                fs.writeFileSync(tempFile, JSON.stringify(blocks, null, 2), 'utf8');
                Logger.debug(`Wrote ${blocks.length} blocks from post ${post.id} to temp file ${tempFile}`);

                // Just store a reference to the file
                allItems.push({
                  _temp_file_ref: tempFile,
                  _block_count: blocks.length,
                });
              } catch (error) {
                Logger.error(`Error writing blocks to temp file:`, error);
                allItems.push(...blocks); // Fall back to keeping in memory
              }
            } else {
              // Otherwise add to our in-memory collection
              allItems.push(...blocks);
            }

            batchBlocks += blocks.length;
            totalBlocks += blocks.length;
            Logger.incrementIndexedItems(blocks.length);
            Logger.info(`Extracted ${blocks.length} blocks from ${postType} ID ${post.id}`);
          } else {
            Logger.debug(`No blocks found in post ID ${post.id}`);
          }

          // Force garbage collection for each post to prevent memory build-up
          if (global.gc && j % 2 === 1) {
            try {
              global.gc();
            } catch (e) {
              /* ignore */
            }
          }
        } catch (error) {
          Logger.error(`Error extracting blocks from post ${post.id}:`, error);
        }
      }

      Logger.info(`Extracted ${batchBlocks} blocks in this batch`);
    }

    // Force garbage collection after each batch
    if (global.gc) {
      try {
        global.gc();
        Logger.debug('Garbage collection completed');
      } catch (e) {
        /* ignore */
      }
    }
  }

  Logger.info(`Total blocks extracted from ${postType}: ${totalBlocks}`);
  return allItems;
}

async function indexAllContent(config) {
  try {
    // Setup file logging if enabled
    if (config.logToFile !== false) {
      Logger.setupFileLogging(config);
    }

    Logger.info('\n=== Starting Content Indexing Process ===');
    Logger.debug(`Using configuration: ${JSON.stringify(config)}`);

    // First, discover available post types
    Logger.info('\nDiscovering available post types...');
    const availableTypes = await discoverPostTypes(config);
    Logger.debug(`Available post types: ${JSON.stringify(availableTypes)}`);

    // Filter to only use the post types specified in config
    const postTypesToProcess = config.post_types.filter(type => availableTypes.includes(type));

    if (postTypesToProcess.length === 0) {
      Logger.error('None of the specified post types are available through the REST API.');
      Logger.info(`Available types: ${availableTypes.join(', ')}`);
      Logger.info('Please check your configuration and try again.');
      return;
    }

    Logger.info(`Will process these post types: ${postTypesToProcess.join(', ')}`);

    // Get authentication token only if we're sending to the embedding service
    let token = null;
    if (!config.output_to_file) {
      Logger.info('\nUsing API key for authentication...');
      try {
        token = config.embedding_api_key;
        Logger.info('API key configured successfully');
        Logger.debug(`API key length: ${token.length}`);
      } catch (error) {
        Logger.error('API key configuration failed. Cannot proceed with sending to embedding service.');
        if (!config.output_to_file) {
          return;
        }
        Logger.info('Will continue with content extraction but will not send to embedding service.');
      }
    } else {
      Logger.info('File output enabled - skipping API authentication');
    }

    // Load last run data for incremental indexing
    const lastRunData = config.incremental_indexing ? loadLastRunData(config) : null;

    // Process each post type
    let totalIndexed = 0;
    let allItems = [];

    // Current run data to save
    const currentRunData = {
      timestamp: new Date().toISOString(),
      indexed_posts: {},
    };

    for (const postType of postTypesToProcess) {
      Logger.info(`\n=== Processing post type: ${postType} ===`);

      // Fetch all posts of this type
      const allPosts = await getAllPosts(config, postType, lastRunData);
      Logger.info(`Found ${allPosts.length} ${postType} items`);
      currentRunData.indexed_posts[postType] = allPosts.length;

      if (allPosts.length === 0) continue;
      Logger.debug(`First post ID: ${allPosts.length > 0 ? allPosts[0].id : 'none'}`);

      // Process items in manageable batches
      const items = await processContentInBatches(allPosts, postType, config);

      Logger.info(`\nTotal content items for ${postType}: ${items.length}`);
      if (items.length === 0) {
        Logger.warn(`No content items found for ${postType}, skipping`);
        continue;
      }

      // Send to embedding service in batches or collect for file output
      if (!config.output_to_file) {
        await sendInBatches(config, items, token);
      } else {
        allItems.push(...items);
      }
      totalIndexed += items.length;
    }

    // If we're outputting to file, write all items at once
    if (config.output_to_file && allItems.length > 0) {
      await writeContentToFile(config, allItems);
    }

    // Save current run data
    if (config.incremental_indexing) {
      saveLastRunData(config, currentRunData);
    }

    Logger.info(`\n=== Indexing Complete! Total items indexed: ${totalIndexed} ===`);

    // Log final statistics
    Logger.logStats();
  } catch (error) {
    Logger.error('Error during indexing process:', error);
    process.exit(1);
  }
}

async function discoverPostTypes(config) {
  try {
    // Extract base URL without /wp/v2
    const baseUrl = config.wp_rest_url.replace(/\/wp\/v2$/, '');
    const typesUrl = `${baseUrl}/wp/v2/types`;

    Logger.info(`Fetching post types from: ${typesUrl}`);
    const response = await fetch(typesUrl);

    if (!response.ok) {
      Logger.error(`Failed to retrieve post types: ${response.status}`);
      // Return some common defaults as fallback
      return ['post', 'page'];
    }

    const typesData = await response.json();
    Logger.debug(`Post types data: ${JSON.stringify(typesData)}`);

    // Filter for types with REST API support
    const availableTypes = Object.entries(typesData)
      .filter(([, type]) => type.rest_base) // Has REST support
      .map(([key]) => key);

    Logger.info(`Discovered post types: ${availableTypes.join(', ')}`);
    return availableTypes;
  } catch (error) {
    Logger.error(`Error discovering post types:`, error);
    // Return some common defaults as fallback
    return ['post', 'page'];
  }
}

// Function to load the last run data
function loadLastRunData(config) {
  try {
    if (fs.existsSync(config.last_run_file)) {
      const data = JSON.parse(fs.readFileSync(config.last_run_file, 'utf8'));
      Logger.info(`Loaded last run data from ${config.last_run_file}`);
      Logger.debug(`Last run: ${data.timestamp}`);
      return data;
    }
  } catch (error) {
    Logger.error(`Error loading last run data:`, error);
  }

  return { timestamp: null, indexed_posts: {} };
}

// Function to save the current run data
function saveLastRunData(config, data) {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(config.last_run_file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(config.last_run_file, JSON.stringify(data, null, 2), 'utf8');

    Logger.info(`Saved run data to ${config.last_run_file}`);
  } catch (error) {
    Logger.error(`Error saving run data:`, error);
  }
}

async function getAllPosts(config, postType, lastRunData) {
  let page = 1;
  const allPosts = [];
  const perPage = 100; // Maximum allowed by WordPress
  let totalFetched = 0;

  Logger.info(`Fetching all ${postType} items...`);

  // Determine if we're doing incremental indexing
  let modifiedAfter = null;
  if (config.incremental_indexing && lastRunData && lastRunData.timestamp) {
    modifiedAfter = new Date(lastRunData.timestamp);
    Logger.info(`Incremental indexing: fetching only posts modified after ${modifiedAfter.toISOString()}`);
  }

  while (true) {
    try {
      // Build API URL with parameters, properly handling endpoints
      // WordPress API endpoints vary - posts is for post type, but pages for page type
      let restBase = postType;

      // Handle special cases for endpoints
      if (postType === 'post') {
        restBase = 'posts';
      } else if (postType === 'page') {
        restBase = 'pages';
      }

      // Construct the URL
      let url = `${config.wp_rest_url}/${restBase}?page=${page}&per_page=${perPage}`;

      // Add modified_after parameter for incremental indexing
      if (modifiedAfter) {
        url += `&after=${modifiedAfter.toISOString()}`;
      }

      // Add fields parameter to include taxonomies and meta if needed
      const fields = ['author', 'id', 'excerpt', 'title', 'content', 'link', 'modified'];

      if (config.include_taxonomies) {
        fields.push('categories', 'tags');
      }

      if (config.include_meta) {
        fields.push('meta');
      }

      url += `&_fields=${fields.join(',')}`;

      Logger.info(`Fetching ${postType} page ${page}...`);
      Logger.debug(`API URL: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 400 && page > 1) {
          // This is normal when we've reached the end of pagination
          Logger.debug(`End of pagination reached for ${postType}`);
          break;
        }
        Logger.error(`Error fetching ${postType} page ${page}: ${response.status}`);
        try {
          const errorText = await response.text();
          Logger.debug(`Error details: ${errorText.substring(0, 200)}`);
        } catch (e) {
          // Ignore error reading response body
        }
        break;
      }

      const posts = await response.json();

      if (posts.length === 0) {
        Logger.debug(`No more posts found for ${postType}`);
        break; // No more posts
      }

      allPosts.push(...posts);
      totalFetched += posts.length;
      Logger.info(`Fetched ${posts.length} items from page ${page}`);

      // Check if we've reached the last page
      const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
      Logger.debug(`Total pages for ${postType}: ${totalPages}, current page: ${page}`);

      if (page >= totalPages) {
        Logger.info(`Reached last page (${page}/${totalPages}) for ${postType}`);
        break;
      }

      page++;
    } catch (error) {
      Logger.error(`Error fetching ${postType} page ${page}:`, error);
      break;
    }
  }

  Logger.info(`Finished fetching ${postType}: ${totalFetched} items retrieved`);
  return allPosts;
}

// Function to chunk long content into smaller pieces - with minimal memory usage
function chunkContent(title, content, maxWords = 1000, overlapWords = 100) {
  if (!content || content.length < 500) {
    // Short content doesn't need chunking
    return [
      {
        title,
        content,
        is_chunk: false,
      },
    ];
  }

  // Process content as a string, avoiding large array creation
  const totalChunks = Math.ceil(content.length / 5000); // Rough estimate
  Logger.debug(`Chunking content with approx. ${content.length / 5} words into ~${totalChunks} chunks`);

  const chunks = [];
  const chunkSize = maxWords * 6; // Approximate characters per chunk

  // Process content in chunks without creating a giant array first
  let startPos = 0;
  let chunkNum = 1;

  // Find natural breakpoints
  const findBreakpoint = (text, position) => {
    // Try to find sentence endings
    const endSearch = Math.min(position + 200, text.length);
    const segment = text.substring(position, endSearch);

    // Look for sentence end
    const sentenceEndMatch = segment.match(/[.!?]\s/);
    if (sentenceEndMatch) {
      return position + sentenceEndMatch.index + 2; // Include period and space
    }

    // Look for paragraph break
    const paraMatch = segment.match(/\n\s*\n/);
    if (paraMatch) {
      return position + paraMatch.index + paraMatch[0].length;
    }

    // Fall back to a space
    const spaceMatch = segment.match(/\s/);
    if (spaceMatch) {
      return position + spaceMatch.index + 1;
    }

    // Worst case, just cut at the position
    return position;
  };

  while (startPos < content.length) {
    // Determine a good breakpoint near the target chunk size
    const targetEnd = Math.min(startPos + chunkSize, content.length);
    const actualEnd = findBreakpoint(content, targetEnd);

    // Extract this chunk
    const chunkContent = content.substring(startPos, actualEnd);
    const chunkTitle = totalChunks > 1 ? `${title} (Part ${chunkNum})` : title;

    chunks.push({
      title: chunkTitle,
      content: chunkContent,
      is_chunk: totalChunks > 1,
      chunk_num: chunkNum,
      total_chunks: totalChunks,
    });

    // Set start position for next chunk with overlap
    const overlapSize = Math.min(overlapWords * 6, chunkContent.length / 3);
    startPos = Math.max(0, actualEnd - overlapSize);

    chunkNum++;

    // Force garbage collection to help with memory (every 5 chunks)
    if (global.gc && chunkNum % 5 === 0) {
      try {
        global.gc();
      } catch (e) {
        /* ignore */
      }
    }
  }

  return chunks;
}

function formatPosts(posts, postType) {
  Logger.debug(`Formatting ${posts.length} ${postType} posts`);

  const formattedPosts = [];

  posts.forEach(post => {
    const sanitizedContent = post.content?.rendered ? sanitizeHtml(post.content.rendered) : '';
    const sanitizedTitle = post.title?.rendered ? sanitizeHtml(post.title.rendered) : `${postType.charAt(0).toUpperCase() + postType.slice(1)} ${post.id}`;

    const isInvalid = isInvalidContent(sanitizedContent);

    // Extract meta data and taxonomies
    const metadata = {};

    // Add excerpt if available
    if (post.excerpt?.rendered) {
      metadata.excerpt = sanitizeHtml(post.excerpt.rendered);
    }

    // Add taxonomy data if available
    if (post.categories && post.categories.length > 0) {
      metadata.categories = post.categories;
    }

    if (post.tags && post.tags.length > 0) {
      metadata.tags = post.tags;
    }

    // Add custom fields if available
    if (post.meta) {
      metadata.meta = post.meta;
    }

    // Base post object
    const basePost = {
      id: `${postType}-${post.id}`,
      title: sanitizedTitle,
      url: post.link,
      source: `wp_${postType}`,
      is_valid: !isInvalid,
      content_type: isInvalid ? 'non_readable' : 'text',
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      post_id: post.id,
    };

    // Chunk long content
    const chunks = chunkContent(sanitizedTitle, sanitizedContent, DEFAULT_CONFIG.max_content_length, Math.floor(DEFAULT_CONFIG.max_content_length * 0.1));

    if (chunks.length === 1) {
      // No chunking needed, use original post
      formattedPosts.push({
        ...basePost,
        content: sanitizedContent,
      });
    } else {
      // Add each chunk as a separate post
      chunks.forEach((chunk, index) => {
        formattedPosts.push({
          ...basePost,
          id: `${postType}-${post.id}-chunk-${index + 1}`,
          title: chunk.title,
          content: chunk.content,
          chunk_info: {
            is_chunk: true,
            chunk_num: index + 1,
            total_chunks: chunks.length,
          },
        });
      });

      Logger.debug(`Split post ${post.id} into ${chunks.length} chunks`);
    }
  });

  return formattedPosts;
}

// Function to extract blocks from content using WordPress block parser
function parseGutenbergBlocks(content) {
  if (!content) return [];

  // Use WordPress parser if available
  if (BlockParser) {
    try {
      const parsedBlocks = BlockParser.parse(content);
      Logger.debug(`Parsed ${parsedBlocks.length} blocks using WordPress parser`);
      return parsedBlocks;
    } catch (error) {
      Logger.error(`Error parsing blocks with WordPress parser:`, error);
      // Fall back to regex-based parsing
    }
  }

  // Fallback: Simple regex-based parsing
  const blocks = [];
  const blockRegex = /<!-- wp:([^\s]+)(?:\s+(\{.*?\}))?\s+-->([\s\S]*?)<!-- \/wp:\1 -->/g;

  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const [, blockName, attributesJSON, innerContent] = match;

    let attributes = {};
    if (attributesJSON) {
      try {
        attributes = JSON.parse(attributesJSON);
      } catch (error) {
        Logger.debug(`Failed to parse block attributes: ${attributesJSON}`);
      }
    }

    blocks.push({
      blockName,
      attrs: attributes,
      innerBlocks: [],
      innerHTML: innerContent,
      innerContent: [innerContent],
    });
  }

  Logger.debug(`Parsed ${blocks.length} blocks using fallback parser`);
  return blocks;
}

function extractBlocksFromPost(post) {
  const blocks = [];

  if (!post.content?.rendered) {
    Logger.debug(`Post ${post.id} has no content`);
    return blocks;
  }

  try {
    // Try parsing with Gutenberg parser first
    const parsedBlocks = parseGutenbergBlocks(post.content.rendered);

    if (parsedBlocks && parsedBlocks.length > 0) {
      Logger.debug(`Found ${parsedBlocks.length} Gutenberg blocks in post ${post.id} using parser`);

      // Process each block
      parsedBlocks.forEach((block, index) => {
        // Skip empty or null blocks
        if (!block || !block.blockName) return;

        // Get block type and name
        const blockType = block.blockName.replace('core/', '');

        // Extract content from the block
        let content;

        // Handle different block types appropriately
        if (block.innerHTML) {
          // For regular blocks, use innerHTML
          content = sanitizeHtml(block.innerHTML);
        } else if (block.innerContent && block.innerContent.length) {
          // For blocks with innerContent array, join them
          content = sanitizeHtml(block.innerContent.join(''));
        } else {
          // For other blocks, try to extract text from attributes
          content = block.attrs
            ? Object.values(block.attrs)
                .filter(val => typeof val === 'string')
                .join(' ')
            : '';
        }

        // Check if this is valid, readable content
        const isInvalid = isInvalidContent(content);

        // Don't add completely empty blocks
        if (!content) return;

        // Create block object
        const blockObject = {
          id: `post-${post.id}-block-${index + 1}`,
          title: sanitizeHtml(`${blockType.charAt(0).toUpperCase() + blockType.slice(1)} Block from ${post.title?.rendered || 'Post ' + post.id}`),
          content: content,
          url: `${post.link}#block-${index + 1}`,
          source: 'wp_block',
          post_id: post.id,
          block_type: blockType,
          is_valid: !isInvalid,
          content_type: isInvalid ? 'non_readable' : 'text',
        };

        // Extract any metadata from block attributes
        if (block.attrs && Object.keys(block.attrs).length > 0) {
          blockObject.block_attrs = {};

          // Copy non-sensitive attributes, excluding any that might contain credentials
          Object.entries(block.attrs).forEach(([key, value]) => {
            // Skip properties that might contain sensitive data
            if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) {
              return;
            }

            // Only include string, number, or boolean values
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
              blockObject.block_attrs[key] = value;
            }
          });
        }

        // Add to blocks array
        blocks.push(blockObject);
      });

      // If we parsed blocks successfully, return them
      if (blocks.length > 0) {
        return blocks;
      }
    }

    // Fallback: Use DOM parsing if block parsing failed or returned no blocks
    // This is the original code that uses JSDOM to extract blocks
    const dom = new JSDOM(post.content.rendered);
    const document = dom.window.document;

    // 1. Extract Gutenberg blocks (wp-block-* classes)
    const gutenbergBlocks = document.querySelectorAll('[class*="wp-block-"]');
    Logger.debug(`Found ${gutenbergBlocks.length} Gutenberg blocks in post ${post.id} using DOM`);

    gutenbergBlocks.forEach((element, index) => {
      // Get the block type from class
      const classList = Array.from(element.classList);
      const blockTypeClass = classList.find(cls => cls.startsWith('wp-block-'));
      const blockType = blockTypeClass ? blockTypeClass.replace('wp-block-', '') : 'unknown';

      // Get the text content (already sanitized by textContent)
      const content = element.textContent.trim();

      // Check if this is valid, readable content
      const isInvalid = isInvalidContent(content, element);

      if (content && (!isInvalid || blockType.includes('embed'))) {
        blocks.push({
          id: `post-${post.id}-dom-block-${index + 1}`,
          title: sanitizeHtml(`${blockType.charAt(0).toUpperCase() + blockType.slice(1)} Block from ${post.title?.rendered || 'Post ' + post.id}`),
          content: content,
          url: `${post.link}#block-${index + 1}`,
          source: 'wp_block_dom',
          post_id: post.id,
          block_type: blockType,
          is_valid: !isInvalid,
          content_type: isInvalid ? 'non_readable' : 'text',
        });
      } else {
        Logger.debug(`Skipping invalid or empty block ${index + 1} of post ${post.id}`);
      }
    });

    // 2. If no Gutenberg blocks found, try to extract paragraphs
    if (blocks.length === 0) {
      const paragraphs = document.querySelectorAll('p');
      Logger.debug(`No Gutenberg blocks found, extracting from ${paragraphs.length} paragraphs`);

      paragraphs.forEach((p, index) => {
        const content = p.textContent.trim();
        const isInvalid = isInvalidContent(content, p);

        if (content && !isInvalid) {
          blocks.push({
            id: `post-${post.id}-p-${index + 1}`,
            title: sanitizeHtml(`Paragraph ${index + 1} from ${post.title?.rendered || 'Post ' + post.id}`),
            content: content,
            url: `${post.link}#p-${index + 1}`,
            source: 'wp_paragraph',
            post_id: post.id,
            is_valid: true,
            content_type: 'text',
          });
        }
      });
    }

    // 3. If still no blocks, try headings with their following content
    if (blocks.length === 0) {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      Logger.debug(`No paragraphs found, extracting from ${headings.length} headings`);

      headings.forEach((heading, index) => {
        let content = heading.textContent.trim();

        // Get the next sibling's content if it exists
        let nextElement = heading.nextElementSibling;
        if (nextElement) {
          content += '\n\n' + nextElement.textContent.trim();
        }

        const isInvalid = isInvalidContent(content);

        if (content && !isInvalid) {
          blocks.push({
            id: `post-${post.id}-section-${index + 1}`,
            title: heading.textContent.trim(),
            content: content,
            url: `${post.link}#section-${index + 1}`,
            source: 'wp_section',
            post_id: post.id,
            is_valid: true,
            content_type: 'text',
          });
        }
      });
    }

    Logger.debug(`Extracted ${blocks.length} total blocks from post ${post.id}`);
  } catch (error) {
    Logger.error(`Error extracting blocks from post ${post.id}:`, error);
  }

  return blocks;
}

async function writeContentToFile(config, items) {
  try {
    Logger.info(`Writing content to file: ${config.output_file}`);

    // Create directory if it doesn't exist
    const dir = path.dirname(config.output_file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Count invalid content
    const tempFileRefs = items.filter(item => item._temp_file_ref);
    const memoryItems = items.filter(item => !item._temp_file_ref);

    Logger.info(`Processing ${memoryItems.length} items in memory and ${tempFileRefs.length} temp files`);

    const invalidItems = memoryItems.filter(item => item.is_valid === false);
    Logger.info(`Found ${invalidItems.length} invalid items out of ${memoryItems.length} in-memory items`);

    // Filter out invalid content if configured to do so
    let filteredItems = memoryItems;
    if (config.filter_invalid_content) {
      filteredItems = memoryItems.filter(item => item.is_valid === true);
      Logger.info(`Filtering out invalid content: ${memoryItems.length - filteredItems.length} items removed`);
    } else {
      Logger.info(`Including all items in output file (invalid items are marked but not filtered)`);
    }

    // Handle temp files - read and merge content
    let totalFromTempFiles = 0;

    // Open output file for writing
    const outputStream = fs.createWriteStream(config.output_file);

    // Write array start
    outputStream.write('[\n');

    // Write memory items first
    let isFirst = true;

    // Write memory items
    for (let i = 0; i < filteredItems.length; i++) {
      if (!isFirst) {
        outputStream.write(',\n');
      } else {
        isFirst = false;
      }

      outputStream.write(JSON.stringify(filteredItems[i], null, 2));
    }

    // Process temp files one by one
    for (const fileRef of tempFileRefs) {
      try {
        const tempItems = JSON.parse(fs.readFileSync(fileRef._temp_file_ref, 'utf8'));
        totalFromTempFiles += fileRef._block_count || 0;

        // Filter items if needed
        const filteredTempItems = config.filter_invalid_content ? tempItems.filter(item => item.is_valid !== false) : tempItems;

        // Write each item
        for (let i = 0; i < filteredTempItems.length; i++) {
          if (!isFirst) {
            outputStream.write(',\n');
          } else {
            isFirst = false;
          }

          outputStream.write(JSON.stringify(filteredTempItems[i], null, 2));
        }

        // Delete temp file after processing
        fs.unlinkSync(fileRef._temp_file_ref);
      } catch (error) {
        Logger.error(`Error processing temp file ${fileRef._temp_file_ref}:`, error);
      }
    }

    // Write array end
    outputStream.write('\n]');
    outputStream.end();

    Logger.info(`Successfully wrote ${filteredItems.length + totalFromTempFiles} items to ${config.output_file}`);
    return true;
  } catch (error) {
    Logger.error(`Error writing content to file:`, error);
    return false;
  }
}

async function sendInBatches(config, items, token) {
  // If output to file is enabled, write to file instead of sending to API
  if (config.output_to_file) {
    Logger.info(`Output to file enabled, writing ${items.length} items to ${config.output_file}`);
    await writeContentToFile(config, items);
    return;
  }

  // Check if we have a token
  if (!token) {
    Logger.error('No API key available. Cannot send to embedding service.');
    return;
  }

  const batchSize = config.batch_size;
  const totalBatches = Math.ceil(items.length / batchSize);

  Logger.info(`Sending content in ${totalBatches} batches (${batchSize} items per batch)`);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, items.length);
    const batch = items.slice(start, end);

    Logger.info(`\nProcessing batch ${i + 1}/${totalBatches} (items ${start + 1}-${end})`);
    Logger.debug(`Batch ${i + 1} first item ID: ${batch[0]?.id}`);

    try {
      const endpoint = `${config.embedding_api_url}${config.embedding_endpoint}`;
      Logger.debug(`Sending batch to endpoint: ${endpoint}`);
      Logger.debug(`Using authentication header: x-api-key (${token.substring(0, 5)}...)`);

      // Record this API call attempt
      Logger.stats.apiCalls++;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': token,
        },
        body: JSON.stringify({ posts: batch }),
      });

      if (!response.ok) {
        Logger.error(`Failed to index batch ${i + 1}: ${response.status} ${response.statusText}`);
        Logger.stats.apiFailures++;

        try {
          const errorText = await response.text();
          Logger.error(`Error details: ${errorText.substring(0, 200)}...`);
        } catch (e) {
          // Ignore error reading response body
        }
        continue;
      }

      // Record successful API call
      Logger.stats.apiSuccesses++;
      Logger.incrementIndexedItems(batch.length);
      Logger.info(`Successfully indexed batch ${i + 1}`);

      // Add delay between batches except for the last one
      if (i < totalBatches - 1) {
        Logger.info(`Waiting ${config.delay_between_batches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, config.delay_between_batches));
      }
    } catch (error) {
      Logger.error(`Error processing batch ${i + 1}:`, error);
      Logger.stats.apiFailures++;
    }
  }
}
