import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseKeyValueTxt(txt) {
  const lines = String(txt || '').split(/\r?\n/);
  const out = {};
  let currentKey = null;
  const pushLine = (k, v) => {
    if (!k) return;
    if (out[k] == null) out[k] = v;
    else out[k] += `\n${v}`;
  };

  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z\s\-]*)\s*:\s*(.*)\s*$/);
    if (m) {
      currentKey = m[1].trim().toLowerCase().replace(/\s+/g, '_');
      pushLine(currentKey, m[2].trim());
    } else if (currentKey && line.trim()) {
      // continuation lines for long description
      pushLine(currentKey, line.trim());
    }
  }
  return out;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function buildEvents() {
  const srcDir = path.join(ROOT, 'content', 'events');
  const outPath = path.join(ROOT, 'data', 'events', 'events.json');
  ensureDir(path.dirname(outPath));

  const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.txt')).sort();
  const items = [];

  for (const file of files) {
    const full = path.join(srcDir, file);
    const kv = parseKeyValueTxt(readText(full));
    const title = kv.title || kv.event || file.replace(/\.txt$/i, '');
    const date = kv.date || kv.when || kv.on || '';
    const time = kv.time || '';
    const location = kv.location || kv.where || '';
    const link = kv.link || kv.url || '';
    const contact = kv.contact || kv.submitted_by || kv.submittedby || kv.submitted || '';

    // Description is either explicit description field (possibly multi-line) or leftover
    let description = kv.description || '';

    const id = file;
    const sortKey = `${date || '9999-12-31'}T${time || '00:00'}`;

    items.push({
      id,
      title,
      date,
      time,
      location,
      link,
      contact,
      description,
      sortKey,
      source: 'content/events'
    });
  }

  items.sort((a,b)=>String(a.sortKey).localeCompare(String(b.sortKey)));

  fs.writeFileSync(outPath, JSON.stringify({ items }, null, 2));
  console.log(`Wrote ${items.length} events -> ${path.relative(ROOT, outPath)}`);
}

function buildLinks() {
  const srcDir = path.join(ROOT, 'content', 'links');
  const outPath = path.join(ROOT, 'data', 'links', 'links.json');
  ensureDir(path.dirname(outPath));

  const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.txt')).sort();
  const items = [];

  for (const file of files) {
    const full = path.join(srcDir, file);
    const kv = parseKeyValueTxt(readText(full));

    const title = kv.title || file.replace(/\.txt$/i, '');
    const url = kv.url || kv.link || '';
    const description = kv.description || '';
    const category = kv.category || 'General';

    items.push({
      id: file,
      title,
      url,
      description,
      category,
      sortKey: `${category}::${title}`,
      source: 'content/links'
    });
  }

  items.sort((a,b)=>String(a.sortKey).localeCompare(String(b.sortKey)));

  fs.writeFileSync(outPath, JSON.stringify({ items }, null, 2));
  console.log(`Wrote ${items.length} links -> ${path.relative(ROOT, outPath)}`);
}

function normalizeGallery() {
  const metaDir = path.join(ROOT, 'gallery', 'meta');
  const legacyIndex = path.join(ROOT, 'gallery', 'index.json');
  const outPath = path.join(ROOT, 'data', 'gallery', 'gallery.json');
  ensureDir(path.dirname(outPath));

  let items = [];

  // Preferred: gallery/meta/*.json
  if (fs.existsSync(metaDir) && fs.statSync(metaDir).isDirectory()) {
    const files = fs.readdirSync(metaDir).filter((f) => f.toLowerCase().endsWith('.json')).sort();
    for (const file of files) {
      const full = path.join(metaDir, file);
      try {
        const obj = JSON.parse(readText(full));
        if (obj && typeof obj === 'object') items.push(obj);
      } catch (e) {
        console.warn('Error reading gallery meta file', file, e);
      }
    }
  } else if (fs.existsSync(legacyIndex)) {
    // Backward compatibility: gallery/index.json
    try {
      const raw = JSON.parse(readText(legacyIndex));
      items = Array.isArray(raw.items) ? raw.items : [];
    } catch (e) {
      console.warn('Error reading legacy gallery/index.json', e);
    }
  }

  // Newest-first by date or id
  items.sort((a, b) => {
    const da = a?.date || a?.id || '';
    const db = b?.date || b?.id || '';
    return String(db).localeCompare(String(da));
  });

  // Normalize image paths: prefer paths relative to site root.
  const norm = items.map(it => {
    const img = String(it.image || '').trim();
    let image = img;
    // If image starts with "images/" but file lives in gallery/images, prefix "gallery/".
    if (image.startsWith('images/')) image = `gallery/${image}`;
    // If already starts with "gallery/" keep.
    // If empty or absolute keep.
    return {
      ...it,
      image,
    };
  });

  fs.writeFileSync(outPath, JSON.stringify({ items: norm }, null, 2));
  console.log(`Wrote ${norm.length} gallery items -> ${path.relative(ROOT, outPath)}`);
}

function buildMapsPlaceholder() {
  const outPath = path.join(ROOT, 'data', 'maps', 'maps.json');
  ensureDir(path.dirname(outPath));
  if (fs.existsSync(outPath)) return;
  const example = {
    items: [
      {
        id: 'north-shore-forays',
        title: 'North Shore Foray Spots (placeholder)',
        description: 'Add GeoJSON layers or embedded maps here later.',
        type: 'placeholder',
        url: ''
      }
    ]
  };
  fs.writeFileSync(outPath, JSON.stringify(example, null, 2));
  console.log(`Wrote maps placeholder -> ${path.relative(ROOT, outPath)}`);
}

buildEvents();
buildLinks();
normalizeGallery();
buildMapsPlaceholder();
