const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASSETS_DIR = 'assets';
const MIN_SIZE = 300 * 1024; // 300KB

function walk(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walk(filePath, fileList);
    } else if (file.toLowerCase().endsWith('.webp')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allWebp = walk(ASSETS_DIR);
console.log(`Found ${allWebp.length} webp files in ${ASSETS_DIR}.`);

for (const filePath of allWebp) {
  const stats = fs.statSync(filePath);
  if (stats.size > MIN_SIZE) {
    const output = filePath + '.tmp.webp';
    console.log(`Optimizing: ${filePath} (${(stats.size/1024).toFixed(1)} KB)`);
    try {
      // Use sharp directly via npx
      // webp({quality: 65, effort: 6}) is much smaller
      const cmd = `npx -y sharp-cli -i "${filePath}" -o "${output}" resize 1600 --withoutEnlargement webp --quality 65`;
      execSync(cmd, { stdio: 'inherit' });
      
      const newStats = fs.statSync(output);
      console.log(`  Done: ${(newStats.size/1024).toFixed(1)} KB (Saved: ${((1 - newStats.size/stats.size)*100).toFixed(1)}%)`);
      
      fs.unlinkSync(filePath);
      fs.renameSync(output, filePath);
    } catch (err) {
      console.error(`  Error optimizing ${filePath}: ${err.message}`);
      if (fs.existsSync(output)) fs.unlinkSync(output);
    }
  }
}
