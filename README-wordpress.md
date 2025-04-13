# CultureHack Semantic Search

This project contains a StencilJS-based semantic search component that can be easily integrated into WordPress sites.

## Project Structure

- `src/` - StencilJS component source code
- `wordpress-plugin/` - WordPress plugin files
- `deploy-to-wordpress.sh` - Deployment script for WordPress integration

## Development

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm start
```

### Environment Variables

Create a `.env` file in the project root with the following variables:

```
API_URL=http://localhost:3000
```

This URL is only used during development. When deployed to WordPress, the URL is configured through the WordPress admin.

## WordPress Integration

### Building and Deploying the Component

The project includes a deployment script that builds the component and packages it for WordPress:

```bash
# Make the script executable (if needed)
chmod +x ./deploy-to-wordpress.sh

# Standard deployment (builds component and prepares plugin files)
./deploy-to-wordpress.sh

# Create a distributable zip file ready for WordPress upload
./deploy-to-wordpress.sh --zip
```

The script performs the following actions:
- Builds the StencilJS component
- Creates the necessary plugin directory structure
- Copies the built files to the WordPress plugin folder
- Optionally packages everything into a zip file ready for WordPress installation

After running the script, the WordPress plugin will be available in:
- Folder: `wordpress-plugin/culturehack-search/` 
- Zip (if using --zip option): `wordpress-plugin/culturehack-search.zip`

### Installing in WordPress

1. Upload the `culturehack-search` folder to your WordPress plugin directory (`/wp-content/plugins/`).
   - Or upload the `culturehack-search.zip` file through the WordPress admin interface (Plugins > Add New > Upload Plugin).
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. Configure the API URL in Settings > CultureHack Search.

### Using the Search Component

#### Shortcode

Add the search component anywhere using the shortcode:

```
[culturehack_search]
```

#### Widget

1. Go to Appearance > Widgets in your WordPress admin.
2. Drag the "CultureHack Search" widget to any widget area.
3. Optionally add a title.
4. Save the widget.

#### PHP Code

Add the search component directly in your theme files:

```php
<?php 
if (function_exists('culturehack_search_shortcode')) {
    echo culturehack_search_shortcode();
}
?>
```

#### Direct HTML

If you need to add the component directly in your HTML:

```html
<culturehack-search></culturehack-search>
```

## API Requirements

The search component expects an API endpoint that:

1. Accepts POST requests with a JSON body containing a `query` parameter
2. Returns results in the format:
   ```json
   {
     "results": [
       {
         "id": "string",
         "title": "string",
         "content": "string",
         "url": "string",
         "metadata": {
           "matchingBlocks": [
             {
               "blockId": "string",
               "content": "string",
               "score": 0,
               "url": "string"
             }
           ]
         }
       }
     ]
   }
   ``` 