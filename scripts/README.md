# Culture Hack Semantic Search Indexing Scripts

This directory contains scripts for indexing WordPress content in the semantic search embedding service.

## Getting Started

Before running any scripts, install the required dependencies:

```bash
cd scripts
npm install
```

## Available Scripts

### Portable Indexer (Recommended)

`portable-indexer.js` is the main indexing script that works with any WordPress site using only the standard WordPress REST API.

Features:
- Works with any WordPress site without requiring custom API endpoints
- Extracts both full posts and individual content blocks
- Auto-detects available post types
- Configurable logging levels

To run:

```bash
cd scripts
node portable-indexer.js
```

You'll be prompted to enter:
1. WordPress site URL
2. Embedding service URL
3. Log level (DEBUG, INFO, WARN, ERROR)

### Other Scripts

- `fetch-curriculum.js` - Test script to compare standard and custom WordPress API endpoints
- `index-all-curriculum.js` - Script to index curriculum content from both sources
- `direct-fetch.js` - Simple script to test direct fetching from WordPress

## Troubleshooting

If you encounter errors:

1. Make sure dependencies are installed: `npm install`
2. Check the WordPress site is accessible and has REST API enabled
3. Verify the embedding service is running
4. Set log level to DEBUG for more detailed information

## CultureHack Search Content Indexer

This tool fetches content from a WordPress site and sends it to the CultureHack embedding service for indexing.

## Prerequisites

- Node.js (v14 or newer recommended)
- NPM or Yarn

## Installation

1. Install the required dependencies:

```bash
npm install node-fetch
```

Or if you prefer Yarn:

```bash
yarn add node-fetch
```

## Usage

### Basic Usage

Run the script with default settings:

```bash
./index-content.js
```

### Command Line Options

```
--config, -c <path>      Path to configuration file (default: ./indexer-config.json)
--wp-url <url>           WordPress REST API URL
--api-url <url>          Embedding API URL
--batch-size <number>    Number of posts to process in each batch
--post-types <types>     Comma-separated list of post types to index
--delay <ms>             Delay between batches in milliseconds
--help, -h               Show this help message
```

### Examples

Index content from a specific WordPress site:

```bash
./index-content.js --wp-url https://mysite.com/wp-json/wp/v2
```

Index content with custom settings:

```bash
./index-content.js --wp-url https://mysite.com/wp-json/wp/v2 --api-url https://api.culturehack.io --batch-size 50 --post-types post,page
```

Use a configuration file:

```bash
./index-content.js --config my-config.json
```

## Configuration File

You can create a JSON configuration file with the following structure:

```json
{
  "wp_rest_url": "https://example.com/wp-json/wp/v2",
  "embedding_api_url": "https://api.culturehack.io",
  "auth_endpoint": "/api/auth/token",
  "embedding_endpoint": "/api/embedding/index",
  "batch_size": 25,
  "post_types": ["post", "page"],
  "delay_between_batches": 1000
}
```

An example configuration file is provided at `indexer-config.example.json`.

## How It Works

1. The script connects to your WordPress site's REST API to fetch published posts
2. It retrieves posts in batches to avoid overwhelming the server
3. Each batch is sent to the embedding service for indexing
4. The script tracks progress and provides feedback in the console

## Troubleshooting

If you encounter any issues:

1. Check that your WordPress REST API is accessible and not protected
2. Verify that your embedding service is running and correctly configured
3. If you get timeout errors, try using a smaller batch size or increasing the delay between batches
4. Make sure you have adequate permissions to access both the WordPress API and embedding service

## License

This script is part of the CultureHack Search WordPress plugin, licensed under the same terms.

# WordPress Content Indexer

A portable tool to extract content from any WordPress site and prepare it for semantic search embedding.

## Features

- **Portable**: Uses only the standard WordPress REST API, no custom plugins needed
- **Incremental Indexing**: Only fetches posts that have been updated since last run
- **Content Chunking**: Automatically splits long content into semantic chunks with overlap
- **Proper Block Parsing**: Uses the WordPress block parser for accurate Gutenberg block extraction
- **Rich Metadata**: Extracts taxonomies, custom fields, and other metadata
- **Content Validation**: Detects non-readable content like links and embeds
- **Environment Variables**: Configuration via .env file or command line
- **Robust Logging**: File-based logging with rotation and statistics

## Installation

1. Make sure you have Node.js installed (v14+ recommended)
2. Install dependencies: `npm install`
3. Copy `.env.sample` to `.env` and configure it for your site
4. Run the script: `node portable-indexer.js`

## Configuration Options

The script can be configured via environment variables or through the interactive prompts:

| Variable | Description | Default |
|----------|-------------|---------|
| WP_REST_URL | WordPress REST API URL | http://culturehack.test/wp-json/wp/v2 |
| EMBEDDING_API_URL | URL of your embedding service | http://localhost:3000 |
| EMBEDDING_ENDPOINT | Endpoint to send content for embedding | /api/embedding/receive-modules |
| EMBEDDING_API_KEY | API key for the embedding service | (none) |
| POST_TYPES | WordPress post types to index | post,page,curriculum |
| BATCH_SIZE | Number of items per batch | 25 |
| EXTRACT_BLOCKS | Extract individual blocks | true |
| INCLUDE_FULL_POSTS | Include complete posts | true |
| INCLUDE_TAXONOMIES | Include taxonomy data | true |
| INCLUDE_META | Include post meta fields | true |
| INCREMENTAL_INDEXING | Only fetch recent content | true |
| LOG_LEVEL | Logging verbosity (DEBUG,INFO,WARN,ERROR) | DEBUG |
| OUTPUT_TO_FILE | Save output to file instead of API | true |
| FILTER_INVALID_CONTENT | Remove invalid content | false |
| MAX_CONTENT_LENGTH | Maximum words per content chunk | 1000 |

## Output Format

When writing to a file, the script produces a JSON array of content items with this structure:

```json
[
  {
    "id": "post-123",
    "title": "Example Post",
    "content": "This is the content of the post...",
    "url": "https://example.com/post/123",
    "source": "wp_post",
    "is_valid": true,
    "content_type": "text",
    "metadata": {
      "excerpt": "Short excerpt...",
      "categories": [1, 5, 7],
      "tags": [12, 45]
    }
  },
  {
    "id": "post-123-block-1",
    "title": "Paragraph Block from Example Post",
    "content": "This is content from a block...",
    "url": "https://example.com/post/123#block-1",
    "source": "wp_block",
    "post_id": 123,
    "block_type": "paragraph",
    "is_valid": true,
    "content_type": "text"
  }
]
```

## Development

### Adding Support for More Block Types

The script includes both native WordPress block parser and DOM-based fallback extraction. To improve handling of specific block types, modify the `extractBlocksFromPost` function.

### Adding Custom Post Types

By default, the script handles `post`, `page`, and `curriculum` post types. Add more by setting the `POST_TYPES` environment variable or adding them to the defaults. 