#!/usr/bin/env node

const fetch = require('node-fetch');

// Configuration - change these to match your environment
const WP_REST_URL = 'http://culturehack.test/wp-json';
const CUSTOM_API_URL = 'http://culturehack.test/wp-json/nhtbl/v1';

async function main() {
  console.log('====== WordPress API Test ======');

  // 1. Check for standard post types
  try {
    console.log('\n== Checking available post types ==');
    const typesResponse = await fetch(`${WP_REST_URL}/wp/v2/types`);

    if (!typesResponse.ok) {
      console.error(`Error fetching post types: ${typesResponse.status}`);
    } else {
      const types = await typesResponse.json();
      console.log('Available post types:');
      Object.entries(types).forEach(([key, type]) => {
        console.log(`- ${key} (${type.rest_base}): ${type.name}`);
      });
    }
  } catch (error) {
    console.error('Error checking post types:', error.message);
  }

  // 2. Count posts for each standard post type
  try {
    console.log('\n== Counting standard posts ==');
    const postTypes = ['post', 'page', 'curriculum'];

    for (const type of postTypes) {
      try {
        const countResponse = await fetch(`${WP_REST_URL}/wp/v2/${type}s?per_page=1`);

        if (countResponse.status === 404) {
          console.log(`- ${type}: Post type not available via REST API`);
          continue;
        }

        if (!countResponse.ok) {
          console.log(`- ${type}: Error ${countResponse.status}`);
          continue;
        }

        const totalPosts = countResponse.headers.get('X-WP-Total');
        console.log(`- ${type}: ${totalPosts} posts`);
      } catch (e) {
        console.log(`- ${type}: Error - ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Error counting posts:', error.message);
  }

  // 3. Check if custom route exists
  try {
    console.log('\n== Checking custom route ==');
    const customResponse = await fetch(`${CUSTOM_API_URL}/curriculum-blocks`);

    if (!customResponse.ok) {
      console.error(`Custom route error: ${customResponse.status}`);
    } else {
      const blocks = await customResponse.json();
      console.log(`Custom route returned ${blocks.length} curriculum blocks`);

      if (blocks.length > 0) {
        console.log('First item example:');
        console.log(JSON.stringify(blocks[0], null, 2).substring(0, 300) + '...');
      }
    }
  } catch (error) {
    console.error('Error checking custom route:', error.message);
  }

  // 4. Try alternative URLs
  try {
    console.log('\n== Checking alternative routes ==');

    // Try some variations
    const alternatives = [
      { name: 'curriculum (singular)', url: `${WP_REST_URL}/wp/v2/curriculum` },
      { name: 'curriculum_post', url: `${WP_REST_URL}/wp/v2/curriculum_post` },
      { name: 'curriculum-post', url: `${WP_REST_URL}/wp/v2/curriculum-post` },
      { name: 'curriculums', url: `${WP_REST_URL}/wp/v2/curriculums` },
      { name: 'curricula', url: `${WP_REST_URL}/wp/v2/curricula` },
    ];

    for (const alt of alternatives) {
      try {
        const response = await fetch(alt.url);
        console.log(`- ${alt.name}: ${response.status} (${response.statusText})`);

        if (response.ok) {
          const data = await response.json();
          console.log(`  Found ${Array.isArray(data) ? data.length : 'non-array'} items`);
        }
      } catch (e) {
        console.log(`- ${alt.name}: Error - ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Error checking alternatives:', error.message);
  }
}

main().catch(error => {
  console.error('Script failed:', error);
});
