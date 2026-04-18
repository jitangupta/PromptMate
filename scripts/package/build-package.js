const fs = require('fs-extra');
const archiver = require('archiver');
const path = require('path');

async function main() {
  const root = path.resolve(__dirname, '../../');
  const outDir = path.join(root, 'promptmate-dist');
  const zipFile = path.join(root, 'promptmate-dist.zip');

  // clean up old output
  await fs.remove(outDir);
  await fs.remove(zipFile);

  // recreate folder
  await fs.mkdirp(outDir);

  // copy your dist, icons, popup, styles (referenced by manifest content_scripts) and manifest.json
  for (const item of ['dist', 'icons', 'popup', 'styles', 'manifest.json']) {
    await fs.copy(path.join(root, item), path.join(outDir, item));
  }

  // zip it up
  const output = fs.createWriteStream(zipFile);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);
  archive.directory(outDir, false);
  await archive.finalize();

  console.log(`✅  Built and zipped to ${zipFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});