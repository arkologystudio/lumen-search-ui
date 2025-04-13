#!/bin/bash

# Build the StencilJS component
npm run build

# Set the destination directory path
DEST_DIR="wordpress-plugin/culturehack-search/dist"

# Check if the destination directory exists and remove its contents if it does
if [ -d "$DEST_DIR" ]; then
  echo "Destination directory exists. Cleaning it before copying new files..."
  rm -rf "$DEST_DIR"/*
else
  # Create the dist directory in the WordPress plugin folder
  mkdir -p "$DEST_DIR"
fi

# Copy the build files to the WordPress plugin
cp -r dist/* "$DEST_DIR"/

# Check if the loader file exists in the build output, if not create it
if [ ! -f "$DEST_DIR/culturehack-search/culturehack-search.js" ]; then
  echo "Creating loader file for WordPress integration..."
  
  # Create loader file
  cat > "$DEST_DIR/culturehack-search.js" << 'EOF'
// This loader file imports the StencilJS component modules
document.addEventListener('DOMContentLoaded', function() {
  // Load ESM modules
  const script = document.createElement('script');
  script.type = 'module';
  script.src = `${new URL(document.currentScript.src).pathname.replace('culturehack-search.js', 'culturehack-search.esm.js')}`;
  document.head.appendChild(script);
  
  // Initialize component with API URL from WordPress
  if (typeof CulturehackSearchSettings !== 'undefined' && CulturehackSearchSettings.api_url) {
    document.addEventListener('DOMContentLoaded', function() {
      const searchElements = document.querySelectorAll('culturehack-search');
      searchElements.forEach(elem => {
        elem.setAttribute('api-url', CulturehackSearchSettings.api_url);
      });
    });
  }
});
EOF
fi

echo "Deployment complete. WordPress plugin is ready in wordpress-plugin/culturehack-search/"

# Check if --zip flag is provided
if [[ "$1" == "--zip" ]]; then
  # Create a zip archive for distribution
  PLUGIN_DIR="wordpress-plugin/culturehack-search"
  cd wordpress-plugin
  ZIP_NAME="culturehack-search.zip"
  
  # Remove old zip file if exists
  if [ -f "$ZIP_NAME" ]; then
    rm "$ZIP_NAME"
  fi
  
  # Create new zip file
  zip -r "$ZIP_NAME" culturehack-search
  
  cd ..
  echo "Plugin packaged to wordpress-plugin/$ZIP_NAME"
  echo "You can upload this zip file directly through the WordPress admin interface."
else
  echo "To create a distributable zip file, run: ./deploy-to-wordpress.sh --zip"
fi 