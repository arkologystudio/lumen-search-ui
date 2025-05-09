// scripts/package-wp-plugin.js
import { execSync } from 'child_process';
import { rmSync, mkdirSync, cpSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

const PLUGIN_NAME = 'culturehack-search';
const PLUGIN_ROOT = './wordpress-plugin';
const PLUGIN_DIR = join(PLUGIN_ROOT, PLUGIN_NAME);

try {
  // 1) Build Stencil (produces `www/build/`)
  console.log('Building Stencil components...');
  execSync('npm run build', { stdio: 'inherit' });

  // 2) Clear out old plugin folder, re-create
  console.log('Setting up plugin directory structure...');
  rmSync(PLUGIN_DIR, { recursive: true, force: true });
  mkdirSync(join(PLUGIN_DIR, 'build'), { recursive: true });

  // 3) Copy the required files to the plugin
  console.log('Copying component files...');

  // Find all the build files
  const allBuildFiles = execSync('find www/build -type f', { encoding: 'utf8' }).trim().split('\n');
  console.log('Available build files:');
  allBuildFiles.forEach(file => console.log(` - ${file}`));

  // Copy ALL build files to ensure we don't miss any required files
  allBuildFiles.forEach(file => {
    if (file && existsSync(file)) {
      const destPath = join(PLUGIN_DIR, 'build', file.replace('www/build/', ''));
      const destDir = dirname(destPath);

      // Create destination directory if it doesn't exist
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      cpSync(file, destPath);
      console.log(`Copied: ${file} -> ${destPath}`);
    }
  });

  // 4) Copy PHP files and loader
  console.log('Copying PHP files and loader...');

  // Main plugin file
  cpSync(join(PLUGIN_ROOT, `${PLUGIN_NAME}.php`), join(PLUGIN_DIR, `${PLUGIN_NAME}.php`));

  // 5) Create a README with usage instructions
  console.log('Creating README...');
  const readmeContent = readFileSync(join(PLUGIN_ROOT, 'README.md'), 'utf8');
  writeFileSync(join(PLUGIN_DIR, 'README.md'), readmeContent);

  // 6) Add a .htaccess file to ensure proper content types for module files
  console.log('Creating .htaccess for proper MIME types...');
  const htaccessContent = `
# Ensure correct MIME types for JavaScript modules
<IfModule mod_mime.c>
  AddType text/javascript js
  AddType text/javascript mjs
  AddType text/javascript esm.js
</IfModule>

# Allow cross-origin access for modules if needed
<IfModule mod_headers.c>
  <FilesMatch "\\.(js|mjs|esm\\.js)$">
    Header set Access-Control-Allow-Origin "*"
  </FilesMatch>
</IfModule>
`;
  writeFileSync(join(PLUGIN_DIR, '.htaccess'), htaccessContent);

  // 7) Zip it up
  console.log('Creating ZIP archive...');
  execSync(`cd ${PLUGIN_ROOT} && zip -r ${PLUGIN_NAME}.zip ${PLUGIN_NAME}`, { stdio: 'inherit' });

  console.log(`✅ Plugin built → ${PLUGIN_ROOT}/${PLUGIN_NAME} (+ .zip)`);
  console.log(`\nTo test locally:`);
  console.log(`1. Place the plugin in your WordPress plugins directory (commonly /wp-content/plugins/ or /app/plugins/)`);
  console.log(`2. Activate the plugin and use the [culturehack_search] shortcode`);
  console.log(`3. If files are still not found, check the actual URLs in your browser console and verify file paths`);
} catch (e) {
  console.error('❌ Failed to build plugin:', e);
  process.exit(1);
}
