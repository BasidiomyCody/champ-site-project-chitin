import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const DIRS = {
  events: path.join(ROOT, 'content', 'events'),
  links: path.join(ROOT, 'content', 'links'),
  news: path.join(ROOT, 'content', 'news'),
  galleryMeta: path.join(ROOT, 'gallery', 'meta'),
  galleryImages: path.join(ROOT, 'gallery', 'images'),
};

const NEWS_TYPES = new Set([
  'announcement',
  'updates',
  'field-notes',
  'in-the-news',
  'ideas',
  'admin',
  'qa',
]);

// ----------------- small utilities -----------------

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listFiles(dir, ext) {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(ext))
    .sort((a, b) => a.localeCompare(b));
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function readJson(p) {
  const raw = readText(p);
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
}

// EXACT behavior style to your build-data parser:
// - "Key: value" -> key lowercased + spaces -> underscores
// - continuation lines append to previous key if non-empty
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
      pushLine(currentKey, line.trim());
    }
  }
  return out;
}

function nonEmpty(s) {
  return String(s || '').trim().length > 0;
}

function isIsoDate(s) {
  const v = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;

  const dt = new Date(`${v}T00:00:00Z`);
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === v;
}

function isHHmmOptional(s) {
  const v = String(s || '').trim();
  if (!v) return true; // optional
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [hh, mm] = v.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function isHttpUrlRequired(s) {
  const v = String(s || '').trim();
  if (!v) return false;
  return /^https?:\/\/\S+$/i.test(v);
}

function isHttpUrlOptional(s) {
  const v = String(s || '').trim();
  if (!v) return true;
  return /^https?:\/\/\S+$/i.test(v);
}

function filenameIsoDatePrefix(name) {
  const m = String(name || '').match(/^(\d{4}-\d{2}-\d{2})-/);
  return m ? m[1] : '';
}

function rel(p) {
  return path.relative(ROOT, p);
}

function pushErr(errors, file, msg) {
  errors.push({ file, msg });
}

function pushWarn(warnings, file, msg) {
  warnings.push({ file, msg });
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  if (x == null) return [];
  return [x];
}

// Resolve gallery image with your normalization rules:
// - if image is "images/foo.jpg" -> physically in gallery/images/foo.jpg (build will rewrite to "gallery/images/foo.jpg")
// - if image is "gallery/images/foo.jpg" -> file is gallery/images/foo.jpg
// - if image is "gallery/..." -> file is repo-root/gallery/...
// - if image is http(s) -> external OK
// - if image is bare filename -> assume gallery/images/<filename>
function resolveGalleryImage(image) {
  const v = String(image || '').trim();
  if (!v) return null;

  if (/^https?:\/\//i.test(v)) return { kind: 'url', value: v };

  if (v.startsWith('images/')) {
    return { kind: 'file', value: path.join(DIRS.galleryImages, v.slice('images/'.length)) };
  }

  if (v.startsWith('gallery/images/')) {
    return { kind: 'file', value: path.join(DIRS.galleryImages, v.slice('gallery/images/'.length)) };
  }

  if (v.startsWith('gallery/')) {
    return { kind: 'file', value: path.join(ROOT, v) };
  }

  if (!v.includes('/') && !v.includes('\\')) {
    return { kind: 'file', value: path.join(DIRS.galleryImages, v) };
  }

  return { kind: 'file', value: path.join(ROOT, v) };
}

// ----------------- validators -----------------

function validateEvents(errors, warnings) {
  const files = listFiles(DIRS.events, '.txt');
  const seen = new Set();

  for (const file of files) {
    const fp = path.join(DIRS.events, file);
    const kv = parseKeyValueTxt(readText(fp));

    const title = kv.title || kv.event || file.replace(/\.txt$/i, '');
    const dateRaw = kv.date || kv.when || kv.on || '';
    const dateFromName = filenameIsoDatePrefix(file);
    const date = dateRaw || dateFromName; // if missing in file, accept filename prefix

    const time = kv.time || '';
    const location = kv.location || kv.where || '';
    const link = kv.link || kv.url || '';
    const contact = kv.contact || kv.submitted_by || kv.submittedby || kv.submitted || '';
    const description = kv.description || '';

    // id is filename in build-data
    if (seen.has(file)) pushErr(errors, fp, `Duplicate event filename/id "${file}".`);
    seen.add(file);

    // Filename convention (recommended)
    if (!/^\d{4}-\d{2}-\d{2}-.+\.txt$/i.test(file)) {
      pushWarn(warnings, fp, `Recommended filename: "YYYY-MM-DD-slug.txt" (got "${file}").`);
    }

    // Hard requirements for stable calendar behavior
    if (!nonEmpty(date)) pushErr(errors, fp, `Missing date. Add "Date:" or use filename prefix "YYYY-MM-DD-...".`);
    if (nonEmpty(date) && !isIsoDate(date)) pushErr(errors, fp, `Invalid date "${date}". Expected YYYY-MM-DD.`);

    if (!isHHmmOptional(time)) pushErr(errors, fp, `Invalid time "${time}". Expected HH:mm (24h).`);

    // Optional-but-important warnings
    if (!nonEmpty(title)) pushWarn(warnings, fp, `Missing "Title:" (will fallback to filename).`);
    if (!nonEmpty(location)) pushWarn(warnings, fp, `Missing "Location:" (recommended for calendar tiles).`);
    if (!nonEmpty(description)) pushWarn(warnings, fp, `Missing "Description:" (recommended for event detail page).`);

    if (!isHttpUrlOptional(link)) pushErr(errors, fp, `Invalid link "${link}". Expected http(s)://...`);
    // contact is free-form; no strict validation
    void contact;
  }

  return files.length;
}

function validateLinks(errors, warnings) {
  const files = listFiles(DIRS.links, '.txt');
  const seen = new Set();

  for (const file of files) {
    const fp = path.join(DIRS.links, file);
    const kv = parseKeyValueTxt(readText(fp));

    const title = kv.title || file.replace(/\.txt$/i, '');
    const url = kv.url || kv.link || '';
    const description = kv.description || '';
    const category = kv.category || 'General';

    if (seen.has(file)) pushErr(errors, fp, `Duplicate link filename/id "${file}".`);
    seen.add(file);

    // Hard requirements: link must be usable
    if (!nonEmpty(url)) pushErr(errors, fp, `Missing URL. Add "URL:" or "Link:"`);
    if (nonEmpty(url) && !isHttpUrlRequired(url)) pushErr(errors, fp, `Invalid URL "${url}". Expected http(s)://...`);

    // Soft requirements
    if (!nonEmpty(title)) pushWarn(warnings, fp, `Missing "Title:" (will fallback to filename).`);
    if (!nonEmpty(category)) pushWarn(warnings, fp, `Missing "Category:" (will fallback to "General").`);
    if (!nonEmpty(description)) pushWarn(warnings, fp, `No "Description:" provided (optional, but recommended).`);
  }

  return files.length;
}

function validateNews(errors, warnings) {
  // NOTE: your build-data snippet does not build news from content/news,
  // but your submission pipeline may create these files.
  // We validate if directory exists; otherwise skip silently.
  if (!isDir(DIRS.news)) return 0;

  const files = listFiles(DIRS.news, '.json');
  const seenIds = new Set();

  for (const file of files) {
    const fp = path.join(DIRS.news, file);
    let obj;
    try {
      obj = readJson(fp);
    } catch (e) {
      pushErr(errors, fp, e.message);
      continue;
    }

    const id = String(obj.id || '').trim();
    const title = String(obj.title || '').trim();
    const date = String(obj.date || '').trim();
    const type = String(obj.type || '').trim();
    const summary = String(obj.summary || '').trim();
    const body = String(obj.body || '').trim();
    const thumb = String(obj.thumb || '').trim();

    // Basic structural validation
    if (!id) pushErr(errors, fp, `Missing required field "id".`);
    if (!title) pushErr(errors, fp, `Missing required field "title".`);
    if (!date) pushErr(errors, fp, `Missing required field "date".`);
    if (date && !isIsoDate(date)) pushErr(errors, fp, `Invalid date "${date}". Expected YYYY-MM-DD.`);

    if (!type) pushErr(errors, fp, `Missing required field "type".`);
    if (type && !NEWS_TYPES.has(type)) {
      pushErr(errors, fp, `Invalid type "${type}". Must be one of: ${[...NEWS_TYPES].join(', ')}`);
    }

    if (!summary) pushWarn(warnings, fp, `Missing "summary" (recommended).`);
    if (!body) pushWarn(warnings, fp, `Missing "body" (recommended).`);

    if (thumb && !isHttpUrlOptional(thumb)) pushErr(errors, fp, `Invalid thumb "${thumb}". Expected http(s)://...`);

    if (id) {
      if (seenIds.has(id)) pushErr(errors, fp, `Duplicate news id "${id}".`);
      seenIds.add(id);
    }

    // Filename convention warning
    if (!/^\d{4}-\d{2}-\d{2}-.+\.json$/i.test(file)) {
      pushWarn(warnings, fp, `Recommended filename: "YYYY-MM-DD-slug.json" (got "${file}").`);
    }
  }

  return files.length;
}

function validateGallery(errors, warnings) {
  const files = listFiles(DIRS.galleryMeta, '.json');
  const seenIds = new Set();

  for (const file of files) {
    const fp = path.join(DIRS.galleryMeta, file);
    let obj;
    try {
      obj = readJson(fp);
    } catch (e) {
      pushErr(errors, fp, e.message);
      continue;
    }

    const filenameBase = file.replace(/\.json$/i, '');

    // id is OPTIONAL: fall back to filename base (matches how your repo behaves today)
    const id = String(obj.id || filenameBase).trim();

    // title is OPTIONAL: warn if missing; try common alternates if present
    const title =
      String(obj.title || obj.name || obj.caption || '').trim();

    const date = String(obj.date || '').trim();

    // image is REQUIRED for a gallery item to display
    const image = String(obj.image || obj.image_filename || obj.src || '').trim();

    const credit = String(obj.credit || obj.submitted_by || obj.submittedby || '').trim();
    const description = String(obj.description || '').trim();

    const tags = asArray(obj.tags).map((t) => String(t).trim()).filter(Boolean);

    // Required checks
    if (!id) pushErr(errors, fp, `Missing "id" and could not derive from filename.`);
    if (!image) {
      pushErr(errors, fp, `Missing required field "image".`);
    } else {
      const resolved = resolveGalleryImage(image);
      if (!resolved) {
        pushErr(errors, fp, `Invalid image value "${image}".`);
      } else if (resolved.kind === 'url') {
        if (!isHttpUrlRequired(resolved.value)) {
          pushErr(errors, fp, `Invalid image URL "${resolved.value}". Expected http(s)://...`);
        }
      } else if (resolved.kind === 'file') {
        if (!exists(resolved.value)) {
          pushErr(errors, fp, `Image file does not exist: ${rel(resolved.value)} (from "${image}")`);
        }
      }
    }

    // Date: recommended
    if (date && !isIsoDate(date)) pushErr(errors, fp, `Invalid date "${date}". Expected YYYY-MM-DD.`);
    if (!date) pushWarn(warnings, fp, `Missing "date" (recommended for sorting).`);

    // Title: recommended (NOT required)
    if (!title) pushWarn(warnings, fp, `Missing "title" (optional; recommended for future UI).`);

    // Tags sanity
    if (obj.tags != null && !Array.isArray(obj.tags)) {
      pushWarn(warnings, fp, `"tags" is not an array. Prefer: ["tag1","tag2"]`);
    }
    for (const t of tags) {
      if (t.length > 64) pushWarn(warnings, fp, `Tag is very long (>64 chars): "${t.slice(0, 80)}..."`);
    }

    // Uniqueness by id (derived or explicit)
    if (id) {
      if (seenIds.has(id)) pushErr(errors, fp, `Duplicate gallery id "${id}".`);
      seenIds.add(id);
    }

    // Filename recommendation: only warn if there IS an explicit id that doesn't match
    if (obj.id && String(obj.id).trim() && file !== `${String(obj.id).trim()}.json`) {
      pushWarn(warnings, fp, `Recommended filename "${String(obj.id).trim()}.json" (got "${file}").`);
    }

    // Optional niceties
    if (!credit) pushWarn(warnings, fp, `No "credit"/"submitted_by" provided (optional, recommended).`);
    if (!description) pushWarn(warnings, fp, `No "description" provided (optional, recommended).`);
  }

  return files.length;
}


// ----------------- main -----------------

const errors = [];
const warnings = [];

const counts = {
  events: validateEvents(errors, warnings),
  links: validateLinks(errors, warnings),
  news: validateNews(errors, warnings),
  gallery: validateGallery(errors, warnings),
};

const total = counts.events + counts.links + counts.news + counts.gallery;

console.log(`\n[validate-content] Checked ${total} source files`);
console.log(`- events:  ${counts.events}`);
console.log(`- links:   ${counts.links}`);
console.log(`- news:    ${counts.news}`);
console.log(`- gallery: ${counts.gallery}`);

if (warnings.length) {
  console.log(`\n[validate-content] WARNINGS (${warnings.length})`);
  for (const w of warnings.slice(0, 200)) {
    console.log(`- ${rel(w.file)}: ${w.msg}`);
  }
  if (warnings.length > 200) console.log(`- ...and ${warnings.length - 200} more warnings`);
}

if (errors.length) {
  console.error(`\n[validate-content] ERRORS (${errors.length})`);
  for (const e of errors.slice(0, 200)) {
    console.error(`- ${rel(e.file)}: ${e.msg}`);
  }
  if (errors.length > 200) console.error(`- ...and ${errors.length - 200} more errors`);
  console.error('\n[validate-content] FAIL');
  process.exit(1);
}

console.log('\n[validate-content] OK');
process.exit(0);
