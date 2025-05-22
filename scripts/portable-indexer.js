#!/usr/bin/env node

const fetch = require('node-fetch');
const readline = require('readline');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Function to sanitize HTML content
function sanitizeHtml(html) {
  if (!html) return '';

  // Use JSDOM to parse HTML and extract text content
  const dom = new JSDOM(html);
  const text = dom.window.document.body.textContent || '';

  // Normalize whitespace
  return text.replace(/\s+/g, ' ').trim();
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

// Logger setup with levels and timestamps
const Logger = {
  LEVELS: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },
  level: 0, // Default to INFO level
  logToFile: false,
  logFile: null,

  getTimestamp() {
    return new Date().toISOString();
  },

  setLevel(level) {
    this.level = level;
  },

  debug(message) {
    if (this.level <= this.LEVELS.DEBUG) {
      console.log(`[DEBUG] ${this.getTimestamp()}: ${message}`);
    }
  },

  info(message) {
    if (this.level <= this.LEVELS.INFO) {
      console.log(`[INFO] ${this.getTimestamp()}: ${message}`);
    }
  },

  warn(message) {
    if (this.level <= this.LEVELS.WARN) {
      console.warn(`[WARN] ${this.getTimestamp()}: ${message}`);
    }
  },

  error(message, error = null) {
    if (this.level <= this.LEVELS.ERROR) {
      console.error(`[ERROR] ${this.getTimestamp()}: ${message}`);
      if (error && error.stack) {
        console.error(error.stack);
      }
    }
  },
};

// Configuration with defaults
const DEFAULT_CONFIG = {
  wp_rest_url: 'http://culturehack.test/wp-json/wp/v2',
  embedding_api_url: 'http://localhost:3000',
  embedding_endpoint: '/api/embedding/receive-modules',
  embedding_api_key: 'eaa44b7f1bf5997c9a0aa67af7a458b7fbc98dce140ec46099dcf9dca751f690',
  post_types: ['post', 'page', 'curriculum'],
  batch_size: 25,
  delay_between_batches: 1000,
  extract_blocks: true,
  include_full_posts: true,
  log_level: 'DEBUG', // Can be DEBUG, INFO, WARN, ERROR
  output_to_file: true, // Write content to JSON file instead of sending to embedding service
  output_file: './extracted-content.json', // Path to output file
  filter_invalid_content: false, // Mark invalid content but don't filter it out by default
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

async function indexAllContent(config) {
  try {
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

    // Process each post type
    let totalIndexed = 0;
    let allItems = [];

    for (const postType of postTypesToProcess) {
      Logger.info(`\n=== Processing post type: ${postType} ===`);

      // Fetch all posts of this type
      const allPosts = await getAllPosts(config, postType);
      Logger.info(`Found ${allPosts.length} ${postType} items`);
      Logger.debug(`First post ID: ${allPosts.length > 0 ? allPosts[0].id : 'none'}`);

      if (allPosts.length === 0) continue;

      // Process posts and extract blocks
      const items = [];

      // Add full posts if configured to do so
      if (config.include_full_posts) {
        items.push(...formatPosts(allPosts, postType));
        Logger.info(`Added ${allPosts.length} full ${postType} items`);
      }

      // Extract and add blocks if configured to do so
      if (config.extract_blocks) {
        let totalBlocks = 0;
        for (const post of allPosts) {
          Logger.debug(`Extracting blocks from post ID ${post.id}`);
          const blocks = extractBlocksFromPost(post);
          if (blocks.length > 0) {
            items.push(...blocks);
            totalBlocks += blocks.length;
            Logger.info(`Extracted ${blocks.length} blocks from ${postType} ID ${post.id}`);
          } else {
            Logger.debug(`No blocks found in post ID ${post.id}`);
          }
        }
        Logger.info(`Total blocks extracted: ${totalBlocks}`);
      }

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

    Logger.info(`\n=== Indexing Complete! Total items indexed: ${totalIndexed} ===`);
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

async function getAllPosts(config, postType) {
  let page = 1;
  const allPosts = [];
  const perPage = 100; // Maximum allowed by WordPress

  Logger.info(`Fetching all ${postType} items...`);

  while (true) {
    try {
      const url = `${config.wp_rest_url}/${postType}?page=${page}&per_page=${perPage}`;
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

  return allPosts;
}

function formatPosts(posts, postType) {
  Logger.debug(`Formatting ${posts.length} ${postType} posts`);

  return posts.map(post => {
    const sanitizedContent = post.content?.rendered ? sanitizeHtml(post.content.rendered) : '';
    const sanitizedTitle = post.title?.rendered ? sanitizeHtml(post.title.rendered) : `${postType.charAt(0).toUpperCase() + postType.slice(1)} ${post.id}`;

    const isInvalid = isInvalidContent(sanitizedContent);

    return {
      id: `${postType}-${post.id}`,
      title: sanitizedTitle,
      content: sanitizedContent,
      url: post.link,
      source: `wp_${postType}`,
      is_valid: !isInvalid,
      content_type: isInvalid ? 'non_readable' : 'text',
    };
  });
}

function extractBlocksFromPost(post) {
  const blocks = [];

  if (!post.content?.rendered) {
    Logger.debug(`Post ${post.id} has no content`);
    return blocks;
  }

  try {
    // Use JSDOM to parse the HTML content
    const dom = new JSDOM(post.content.rendered);
    const document = dom.window.document;

    // 1. Extract Gutenberg blocks (wp-block-* classes)
    const gutenbergBlocks = document.querySelectorAll('[class*="wp-block-"]');
    Logger.debug(`Found ${gutenbergBlocks.length} Gutenberg blocks in post ${post.id}`);

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
          id: `post-${post.id}-block-${index + 1}`,
          title: sanitizeHtml(`${blockType.charAt(0).toUpperCase() + blockType.slice(1)} Block from ${post.title?.rendered || 'Post ' + post.id}`),
          content: content,
          url: `${post.link}#block-${index + 1}`,
          source: 'wp_block',
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
    const invalidItems = items.filter(item => item.is_valid === false);
    Logger.info(`Found ${invalidItems.length} invalid items out of ${items.length} total items`);

    // Filter out invalid content if configured to do so
    let filteredItems = items;
    if (config.filter_invalid_content) {
      filteredItems = items.filter(item => item.is_valid === true);
      Logger.info(`Filtering out invalid content: ${items.length - filteredItems.length} items removed`);
    } else {
      Logger.info(`Including all items in output file (invalid items are marked but not filtered)`);
    }

    // Write the content to file
    fs.writeFileSync(config.output_file, JSON.stringify(filteredItems, null, 2), 'utf8');

    Logger.info(`Successfully wrote ${filteredItems.length} items to ${config.output_file}`);
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
        try {
          const errorText = await response.text();
          Logger.error(`Error details: ${errorText.substring(0, 200)}...`);
        } catch (e) {
          // Ignore error reading response body
        }
        continue;
      }

      Logger.info(`Successfully indexed batch ${i + 1}`);

      // Add delay between batches except for the last one
      if (i < totalBatches - 1) {
        Logger.info(`Waiting ${config.delay_between_batches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, config.delay_between_batches));
      }
    } catch (error) {
      Logger.error(`Error processing batch ${i + 1}:`, error);
    }
  }
}
