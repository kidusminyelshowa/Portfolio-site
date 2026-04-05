const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const ASSETS_DIR = 'assets';
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png'];
const VIDEO_EXTS = ['.mp4', '.mov'];

/**
 * Recursively find all files in a directory.
 */
function walk(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walk(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allFiles = walk(ASSETS_DIR);
const stats = { images: 0, videos: 0, errors: [], skipped: 0 };

console.log(`Found ${allFiles.length} files in ${ASSETS_DIR}.`);

for (const filePath of allFiles) {
  const ext = path.extname(filePath).toLowerCase();
  const dirName = path.dirname(filePath);
  const baseName = path.basename(filePath, ext);
  
  if (IMAGE_EXTS.includes(ext)) {
    if (baseName === 'favicon') {
      console.log(`Skipping favicon: ${filePath}`);
      continue;
    }
    const output = path.join(dirName, baseName + '.webp');
    if (fs.existsSync(output)) {
      console.log(`Skipping image: ${filePath} (already converted)`);
      // Delete original if it still exists and output does
      try { fs.unlinkSync(filePath); console.log(`Deleted original: ${filePath}`); } catch(e) {}
      stats.skipped++;
      continue;
    }
    console.log(`Converting image: ${filePath} -> ${output}`);
    try {
      execSync(`npx -y sharp-cli -i "${filePath}" -o "${output}"`, { stdio: 'inherit' });
      stats.images++;
      fs.unlinkSync(filePath);
      console.log(`Deleted original: ${filePath}`);
    } catch (err) {
      console.error(`Error converting image ${filePath}: ${err.message}`);
      stats.errors.push({ file: filePath, error: err.message });
    }
  } else if (VIDEO_EXTS.includes(ext)) {
    const output = path.join(dirName, baseName + '.webm');
    if (fs.existsSync(output)) {
      console.log(`Skipping video: ${filePath} (already converted)`);
      try { fs.unlinkSync(filePath); console.log(`Deleted original: ${filePath}`); } catch(e) {}
      stats.skipped++;
      continue;
    }
    console.log(`Converting video: ${filePath} -> ${output}`);
    try {
      // Improved video conversion with better escaping
      // Using -c:v libvpx-vp9 for high quality but slower.
      // Actually, for portfolio, libvpx (VP8) is faster and usually good enough at crf 10
      // But user wants "optimized small sized". Let's use VP9 with -crf 35
      const cmd = `npx -y -p @ffmpeg-installer/ffmpeg -c "ffmpeg -y -i \\"${filePath}\\" -c:v libvpx-vp9 -crf 35 -b:v 0 -b:a 96k -c:a libopus \\"${output}\\""`;
      execSync(cmd, { stdio: 'inherit' });
      stats.videos++;
      fs.unlinkSync(filePath);
      console.log(`Deleted original: ${filePath}`);
    } catch (err) {
      console.error(`Error converting video ${filePath}: ${err.message}`);
      stats.errors.push({ file: filePath, error: err.message });
    }
  }
}

console.log('--- Conversion Summary ---');
console.log(`Images converted: ${stats.images}`);
console.log(`Videos converted: ${stats.videos}`);
console.log(`Skipped (already converted): ${stats.skipped}`);
console.log(`Errors encountered: ${stats.errors.length}`);
if (stats.errors.length > 0) {
  console.log('Errors:', stats.errors);
}
