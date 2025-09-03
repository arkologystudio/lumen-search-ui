# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lumen Search UI is a semantic search component built with StencilJS that can be integrated into any website or application. It features embedding-based search capabilities and includes a WordPress plugin for easy integration.

## Common Development Commands

```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:3333)
npm start

# Build for production
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test.watch

# Generate new StencilJS component
npm run generate

# Deploy to WordPress (requires executable permissions)
./deploy-to-wordpress.sh

# Create WordPress plugin zip
./deploy-to-wordpress.sh --zip
```

## Architecture and Project Structure

### Technology Stack
- **Framework**: StencilJS 4.22.2 - Web component compiler
- **Testing**: Jest with Puppeteer for E2E tests
- **Build**: TypeScript with ES2017 target
- **Routing**: stencil-router-v2

### Key Components

1. **lumen-search** (src/components/lumen-search/lumen-search.tsx)
   - Main search component that handles API integration
   - Supports both standalone and WordPress environments
   - Configurable via props: `api-url`, `site-id`, `top-k`, `enable-placeholders`, `embedded-mode`
   - Manages authentication tokens and search state

2. **search-result** (src/components/search-result/search-result.tsx)
   - Displays individual search results with title, content preview, and URL
   - Shows matching content blocks with scores

3. **search-placeholders** (src/components/search-placeholders/search-placeholders.tsx)
   - Animated placeholder suggestions when search is empty
   - Configurable via WordPress settings or component props

4. **app-root** (src/components/app-root/app-root.tsx)
   - Root component for standalone deployment
   - Provides development environment for testing

### API Integration

The component communicates with a semantic search API that expects:
- **Auth endpoint**: `POST /auth/token` - Returns JWT token
- **Search endpoint**: `POST /embedding/search` - Requires query, siteId, topK parameters
- **Response format**: Returns results with postId, postTitle, postUrl, chunks with scores

### Environment Configuration

- **API_URL**: Set in `.env` file for development or via WordPress settings in production
- StencilJS config (stencil.config.ts) loads environment variables via dotenv
- WordPress integration uses `LumenSearchSettings` global object

### WordPress Integration

The project includes WordPress plugin files in `wordpress-plugin/` directory:
- Plugin provides admin settings page for API configuration
- Supports shortcode `[lumen_search]`, widget, and direct PHP integration
- Built files are copied to plugin directory via deployment script

### Build Output

StencilJS generates multiple output targets:
- **www**: Development server output
- **dist**: Distribution bundles for web components
- **dist-custom-elements**: Custom elements bundle for framework integration

## Testing Approach

- Unit tests using Jest and Stencil test utilities
- E2E tests using Puppeteer
- Test files located alongside components in `test/` subdirectories
- Mock window and document objects for component testing

## TypeScript Configuration

- JSX factory set to `h` (Stencil's hyperscript)
- Strict type checking with `noUnusedLocals` and `noUnusedParameters`
- ES2017 target with DOM and ES2015 libs