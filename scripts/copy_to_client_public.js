const fs = require('fs').promises;
const path = require('path');

async function copyDir(src, dest) {
  try {
    const entries = await fs.readdir(src, { withFileTypes: true });
    await fs.mkdir(dest, { recursive: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (err) {
    // If src doesn't exist, skip silently
    if (err.code !== 'ENOENT') throw err;
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const clientPublic = path.join(repoRoot, 'client', 'public');
  await fs.mkdir(clientPublic, { recursive: true });

  console.log('Copying assets to client/public/...')
  await copyDir(path.join(repoRoot, 'assets'), path.join(clientPublic, 'assets'));
  await copyDir(path.join(repoRoot, 'css'), path.join(clientPublic, 'css'));
  await copyDir(path.join(repoRoot, 'js'), path.join(clientPublic, 'js'));
  console.log('Copy complete.')
}

main().catch(err => { console.error(err); process.exit(1) });
