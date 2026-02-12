import fs from "node:fs";
import path from "node:path";

function readEventPayload() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) throw new Error("Missing GITHUB_EVENT_PATH");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function getLabelPrefix(labels) {
  const names = (labels || []).map((l) => l.name);
  const hit = names.find((n) => n.startsWith("submission:"));
  return hit ? hit.split(":")[1] : null; // event|news|link|gallery
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFileSafe(fp, text) {
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, text.endsWith("\n") ? text : text + "\n", "utf8");
}

function parseIssueForm(body) {
  // GitHub Issue Forms render as Markdown headings like:
  // ### Event title
  // value
  // We'll parse "### <label>" blocks.
  const out = {};
  const lines = (body || "").split(/\r?\n/);
  let key = null;
  let buf = [];

  function flush() {
    if (!key) return;
    const val = buf.join("\n").trim();
    out[key] = val;
    key = null;
    buf = [];
  }

  for (const line of lines) {
    const m = line.match(/^###\s+(.*)\s*$/);
    if (m) {
      flush();
      key = m[1].trim();
      continue;
    }
    if (key !== null) buf.push(line);
  }
  flush();
  return out;
}

function pick(map, ...names) {
  for (const n of names) {
    if (map[n] && map[n].trim()) return map[n].trim();
  }
  return "";
}

function buildEvent(fields) {
  const title = pick(fields, "Event title", "Title");
  const date = pick(fields, "Date (YYYY-MM-DD)", "Date");
  const time = pick(fields, "Time (24h, optional)", "Time (24h)", "Time");
  const location = pick(fields, "Location");
  const description = pick(fields, "Description");
  const link = pick(fields, "Link (optional)", "Link");
  const contact = pick(fields, "Contact (optional)", "Contact");

  if (!title || !date || !location || !description) {
    throw new Error("Missing required event fields (title/date/location/description).");
  }

  const slug = slugify(title);
  const filename = `${date}-${slug}.txt`;
  const fp = path.join("content", "events", filename);

  const txt =
`Title: ${title}
Date: ${date}
Time: ${time}
Location: ${location}
Description: ${description}
Link: ${link}
Contact: ${contact}
`;

  writeFileSafe(fp, txt);
  return fp;
}

function buildLink(fields) {
  const title = pick(fields, "Link title", "Title");
  const url = pick(fields, "URL", "Url");
  const category = pick(fields, "Category");
  const description = pick(fields, "Description (optional)", "Description");

  if (!title || !url || !category) throw new Error("Missing required link fields.");

  const slug = slugify(title);
  const fp = path.join("content", "links", `${slug}.txt`);

  const txt =
`Title: ${title}
URL: ${url}
Category: ${category}
Description: ${description}
`;

  writeFileSafe(fp, txt);
  return fp;
}

function buildNews(fields) {
  const title = pick(fields, "Title");
  const date = pick(fields, "Date (YYYY-MM-DD)", "Date");
  const type = pick(fields, "Type");
  const summary = pick(fields, "Summary (1–3 sentences)", "Summary");
  const body = pick(fields, "Body (markdown ok)", "Body");
  const thumb = pick(fields, "Thumbnail URL (optional)", "Thumbnail");

  if (!title || !date || !type || !summary || !body) {
    throw new Error("Missing required news fields.");
  }

  const slug = slugify(title);
  const fp = path.join("content", "news", `${date}-${slug}.json`);

  const obj = {
    id: `${date}-${slug}`,
    title,
    date,
    type,
    summary,
    body,
    thumb,
    pinned: false,
    archived: false
  };

  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  return fp;
}

function buildGallery(fields) {
  const title = pick(fields, "Title");
  const date = pick(fields, "Date (YYYY-MM-DD)", "Date");
  const imageUrl = pick(fields, "Image URL (Google Drive share link, Imgur, etc.)", "Image URL");
  const credit = pick(fields, "Photographer / credit (optional)", "Credit");
  const tags = pick(fields, "Tags (comma-separated)", "Tags");
  const description = pick(fields, "Description (optional)", "Description");

  if (!title || !date || !imageUrl) throw new Error("Missing required gallery fields.");

  // Note: we can’t fetch the image in this workflow (keep it simple).
  // We create a meta JSON that points to an external image URL for now.
  const id = `ext-${date}-${slugify(title)}`;
  const fp = path.join("gallery", "meta", `${id}.json`);

  const obj = {
    id,
    title,
    date,
    image: imageUrl,
    credit,
    tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    description
  };

  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  return fp;
}

const payload = readEventPayload();
const issue = payload.issue;
const kind = getLabelPrefix(issue.labels);
if (!kind) {
  console.log("No submission:* label found; exiting.");
  process.exit(0);
}

const fields = parseIssueForm(issue.body);

let created = null;
if (kind === "event") created = buildEvent(fields);
else if (kind === "link") created = buildLink(fields);
else if (kind === "news") created = buildNews(fields);
else if (kind === "gallery") created = buildGallery(fields);
else throw new Error(`Unknown submission kind: ${kind}`);

console.log(`Created/updated: ${created}`);
