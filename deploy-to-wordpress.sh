#!/bin/bash

# Build the StencilJS component
npm run build

# Create the dist directory in the WordPress plugin folder
mkdir -p wordpress-plugin/culturehack-search/dist

# Copy the build files to the WordPress plugin
cp -r dist/* wordpress-plugin/culturehack-search/dist/

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