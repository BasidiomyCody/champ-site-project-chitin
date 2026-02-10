// gallery/scripts/build-gallery-index.js
const fs = require('fs');
const path = require('path');

// __dirname = <repo>/gallery/scripts
const repoRoot = path.join(__dirname, '..', '..');
const metaDir = path.join(repoRoot, 'gallery', 'meta');
const outPath = path.join(repoRoot, 'gallery', 'index.json');

function main() {
  if (!fs.existsSync(metaDir)) {
    console.log('No gallery/meta directory found, skipping.');
    return;
  }

  const files = fs.readdirSync(metaDir).filter((f) => f.endsWith('.json'));
  const items = [];

  for (const file of files) {
    const full = path.join(metaDir, file);
    try {
      const raw = fs.readFileSync(full, 'utf8');
      const obj = JSON.parse(raw);
      items.push(obj);
    } catch (e) {
      console.warn('Error reading gallery meta file', file, e);
    }
  }

  // newest first by date or id
  items.sort((a, b) => {
    const da = a.date || a.id || '';
    const db = b.date || b.id || '';
    return db.localeCompare(da);
  });

  const out = { items };

  // 🔑 This guarantees valid JSON
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Gallery index written to ${outPath} with ${items.length} items.`);
}

main();
