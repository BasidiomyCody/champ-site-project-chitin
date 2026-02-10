# C.H.A.M.P. - PROJECT CHITIN - [ignon]

This repository is a **static** site intended for GitHub Pages.

The refactor goal was to make the site operational with **fewer moving parts**:

- **One runtime JS bundle:** `assets/js/champ.js`
- **One config:** `data/config.json` (with backward compatibility to `data/site-config.json`)
- **One JSON per section:**
  - News: `data/news/news.json` (+ pinned / archived)
  - Events: `data/events/events.json`
  - Links: `data/links/links.json`
  - Gallery: `data/gallery/gallery.json`
  - Proton feed: `data/proton-feed.json`
  - Maps: `data/maps/maps.json`

The landing page consumes the *same JSON* as each section page.

---

## Local dev

Open the folder with VS Code and use any static server:

- VS Code extension **Live Server**
- or `python -m http.server 8000`

---

## Content editing model

### Events
- Source of truth: `content/events/*.txt`
- Build step: `npm run build:data` compiles into `data/events/events.json`

### Links
- Source of truth: `content/links/*.txt`
- Build step: `npm run build:data` compiles into `data/links/links.json`

### Gallery
- Source of truth: `gallery/index.json` + `gallery/images/...`
- Build step: normalizes into `data/gallery/gallery.json`

### News
- Source of truth: `data/news/news.json`
  - This is often produced by an external pipeline (email ingest, docs export, etc.).

---

## Integrations

Configure these in `data/config.json`:

- `integrations.formspree.suggestionEndpoint` for the suggestion box
- `integrations.endpoints.eventSubmission` for automated event submissions
- `integrations.endpoints.gallerySubmission` for automated gallery submissions
- `integrations.endpoints.news.*` for optional admin actions

If a submission endpoint is **not** configured, the site falls back to showing an email-ready template.

---

## Build/check

```bash
npm install
npm run build:data
npm run check
```

---

## Deploy

This repo includes a GitHub Pages workflow under `.github/workflows/pages.yml`.

In GitHub:
1. Settings → Pages → Source: **GitHub Actions**
2. Push to `main` → workflow deploys

