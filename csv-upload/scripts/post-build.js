import { copyFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const standaloneDir = join(projectRoot, '.next', 'standalone');

// Helper function to recursively copy directory
function copyDirectory(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log('Post-build: Starting deployment file preparation...');
  console.log('Project root:', projectRoot);
  console.log('Standalone dir:', standaloneDir);
  
  // Check if standalone directory exists
  if (!existsSync(standaloneDir)) {
    console.error('❌ Standalone directory not found!');
    console.error('Expected at:', standaloneDir);
    process.exit(1);
  }
  
  // Copy .deployment file
  const deploymentSrc = join(projectRoot, '.deployment');
  if (existsSync(deploymentSrc)) {
    copyFileSync(deploymentSrc, join(standaloneDir, '.deployment'));
    console.log('✓ Copied .deployment file');
  } else {
    console.warn('⚠ .deployment file not found at:', deploymentSrc);
  }
  
  // Copy web.config file
  const webConfigSrc = join(projectRoot, 'web.config');
  if (existsSync(webConfigSrc)) {
    copyFileSync(webConfigSrc, join(standaloneDir, 'web.config'));
    console.log('✓ Copied web.config file');
  } else {
    console.warn('⚠ web.config file not found at:', webConfigSrc);
  }
  
  // Copy iisnode.yml file
  const iisnodeYmlSrc = join(projectRoot, 'iisnode.yml');
  if (existsSync(iisnodeYmlSrc)) {
    copyFileSync(iisnodeYmlSrc, join(standaloneDir, 'iisnode.yml'));
    console.log('✓ Copied iisnode.yml file');
  } else {
    console.warn('⚠ iisnode.yml file not found at:', iisnodeYmlSrc);
  }
  
  // Copy static folder
  const staticSrc = join(projectRoot, '.next', 'static');
  const staticDest = join(standaloneDir, '.next', 'static');
  
  if (existsSync(staticSrc)) {
    // Remove existing static folder if it exists
    if (existsSync(staticDest)) {
      rmSync(staticDest, { recursive: true, force: true });
    }
    
    copyDirectory(staticSrc, staticDest);
    console.log('✓ Copied .next/static folder to standalone build');
  } else {
    console.warn('⚠ Static folder not found at:', staticSrc);
  }
  
  // Copy public folder if it exists
  const publicSrc = join(projectRoot, 'public');
  const publicDest = join(standaloneDir, 'public');
  
  if (existsSync(publicSrc)) {
    if (existsSync(publicDest)) {
      rmSync(publicDest, { recursive: true, force: true });
    }
    copyDirectory(publicSrc, publicDest);
    console.log('✓ Copied public folder to standalone build');
  } else {
    console.log('ℹ No public folder found (this is OK if you don\'t have one)');
  }
  
  console.log('✓ Build preparation complete! Ready to deploy from:');
  console.log('  ' + standaloneDir);
} catch (error) {
  console.error('❌ Failed to copy deployment files:');
  console.error(error);
  console.error('Stack:', error.stack);
  process.exit(1);
}
