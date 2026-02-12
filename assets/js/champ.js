/*
  CHAMP unified client (single runtime module)
  - One config file (data/config.json) with backward compatibility to data/site-config.json
  - One data model per section (events.json, links.json, gallery.json, ...)
  - Page detection via <body data-page="...">

  No frameworks. GitHub Pages friendly.
*/
(function () {
  'use strict';

  const TAG = '[CHAMP]';

  // ------------------------------
  // Core utilities
  // ------------------------------

  const U = {};
  const _cache = {
    config: null,
    configTried: false,
    json: new Map(),
  };

  function stripTrailingSlash(s) {
    return (s || '').replace(/\/+$/, '');
  }
  function stripLeadingSlash(s) {
    return (s || '').replace(/^\/+/, '');
  }

  U.base = function base() {
    // 1) Optional meta override
    const meta = document.querySelector('meta[name="champ-base"]');
    const metaBase = meta && meta.getAttribute('content') ? meta.getAttribute('content').trim() : '';
    if (metaBase) return stripTrailingSlash(metaBase);

    // 2) Optional config hint
    const hint = _cache.config?.site?.basePathHint;
    if (hint && typeof hint === 'string') {
      const cleaned = stripTrailingSlash(hint.trim());
      if (cleaned) {
        const p = window.location.pathname || '/';
        // Only trust the hint if the current path actually contains it
        if (p === cleaned || p.startsWith(cleaned + '/')) return cleaned;
      }
    }

    // 3) GH Pages heuristic: if path is /<repo>/..., use /<repo>
    const p = window.location.pathname || '/';
    const parts = p.split('/').filter(Boolean);
    if (parts.length >= 1) {
      const repo = parts[0];
      if (/champ/i.test(repo)) return '/' + repo;
    }

    return '';
  };

  U.joinUrl = function joinUrl(...parts) {
    const cleaned = parts
      .filter(Boolean)
      .map(String)
      .map((p, i) => (i === 0 ? stripTrailingSlash(p) : stripLeadingSlash(p)))
      .filter((p) => p.length > 0);

    const out = cleaned.join('/');
    if (!out) return '';
    return out.startsWith('/') || out.startsWith('http') ? out : '/' + out;
  };

  U.url = function url(path) {
    const p = String(path || '');
    if (!p) return U.base() || '';
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('/')) return p;
    return U.joinUrl(U.base(), p);
  };

  U.q = (sel, root = document) => root.querySelector(sel);

  U.setText = function setText(selOrEl, text) {
    const el = typeof selOrEl === 'string' ? U.q(selOrEl) : selOrEl;
    if (el) el.textContent = text == null ? '' : String(text);
  };

  U.setYear = function setYear(selOrId = '#year') {
    const el = typeof selOrId === 'string'
      ? (selOrId.startsWith('#') ? U.q(selOrId) : document.getElementById(selOrId))
      : selOrId;
    if (el) el.textContent = String(new Date().getFullYear());
  };

  U.escapeHtml = function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  U.cleanChampSubject = function cleanChampSubject(raw) {
    return (
      String(raw || '')
        .replace(/\[\s*CHAMP\s*:\s*[^\]]+\]/gi, '')
        .replace(/~?\[CHAMP[^\]]*\]~?/gi, '')
        .trim()
        .replace(/^[-–—:]+/, '')
        .trim() || '(no subject)'
    );
  };

  U.stripCidUrls = function stripCidUrls(html) {
    return String(html || '').replace(/src\s*=\s*["']cid:[^"']+["']/gi, 'src=""');
  };

  U.htmlToText = function htmlToText(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
  };

  U.truncateWords = function truncateWords(text, maxWords) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return { text: words.join(' '), truncated: false, words: words.length };
    return { text: words.slice(0, maxWords).join(' '), truncated: true, words: words.length };
  };

  U.safeAssetSrc = function safeAssetSrc(p) {
    const s = String(p || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/')) return s;
    return U.url(s);
  };

  U.getQueryParam = function getQueryParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(String(name)) || '';
    } catch {
      return '';
    }
  };

  async function fetchRaw(urlOrPath, { noCache = true, ...opts } = {}) {
    const resolved = U.url(urlOrPath);
    const final = noCache ? (resolved.includes('?') ? `${resolved}&v=${Date.now()}` : `${resolved}?v=${Date.now()}`) : resolved;
    const res = await fetch(final, { cache: noCache ? 'no-store' : 'default', ...opts });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Fetch failed (${res.status}): ${resolved}${txt ? ` — ${txt}` : ''}`);
    }
    return res;
  }

  U.fetchJson = async function fetchJson(urlOrPath, opts) {
    const key = `${urlOrPath}::${opts && opts.noCache === false ? 'cache' : 'nocache'}`;
    if (_cache.json.has(key)) return _cache.json.get(key);
    const p = (async () => {
      const res = await fetchRaw(urlOrPath, opts);
      return await res.json();
    })();
    _cache.json.set(key, p);
    return p;
  };

  U.fetchText = async function fetchText(urlOrPath, opts) {
    const res = await fetchRaw(urlOrPath, opts);
    return await res.text();
  };

  U.fetchJsonSoft = async function fetchJsonSoft(urlOrPath, fallback) {
    try {
      return await U.fetchJson(urlOrPath);
    } catch {
      return fallback;
    }
  };

  U.postJson = async function postJson(urlOrPath, body, { headers = {}, ...opts } = {}) {
    const resolved = U.url(urlOrPath);
    const res = await fetch(resolved, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body == null ? {} : body),
      ...opts
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`POST failed (${res.status}): ${resolved}${txt ? ` — ${txt}` : ''}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  };

  // ------------------------------
  // Config normalization
  // ------------------------------

  function normalizeConfig(raw) {
    const cfg = raw || {};

    // Support old site-config.json keys
    const siteName = cfg.site?.name || cfg.siteName || 'C.H.A.M.P.';
    const timezone = cfg.site?.timezone || cfg.calendar?.tz || cfg.calendar?.timezone || cfg.timezone || 'America/New_York';

    // suggestionBox: accept either endpoint or formspreeId
    const suggestionEndpoint =
      cfg.integrations?.formspree?.suggestionEndpoint ||
      cfg.suggestionBox?.endpoint ||
      (cfg.suggestionBox?.formspreeId ? `https://formspree.io/f/${cfg.suggestionBox.formspreeId}` : '') ||
      '';

    // endpoints
    const eventSubmission = cfg.integrations?.endpoints?.eventSubmission || cfg.eventSubmission?.endpoint || '';
    const gallerySubmission = cfg.integrations?.endpoints?.gallerySubmission || cfg.gallerySubmission?.endpoint || '';
    const news = cfg.integrations?.endpoints?.news || cfg.newsSubmission || {};

    const data = cfg.data || {
      news: {
        items: 'data/news/news.json',
        pinned: 'data/news/pinned.json',
        archived: 'data/news/archived.json'
      },
      events: 'data/events/events.json',
      links: 'data/links/links.json',
      gallery: 'data/gallery/gallery.json',
      proton: 'data/proton-feed.json',
      maps: 'data/maps/maps.json'
    };

    // NEW: repo info for admin links
    const repoOwner = cfg.repo?.owner || cfg.github?.owner || cfg.repoOwner || '';
    const repoName = cfg.repo?.name || cfg.github?.repo || cfg.repoName || '';

    return {
      site: {
        name: siteName,
        timezone,
        basePathHint: cfg.site?.basePathHint || cfg.basePathHint || '/champ-site'
      },
      repo: {
        owner: repoOwner,
        name: repoName
      },
      data,
      integrations: {
        formspree: { suggestionEndpoint },
        endpoints: {
          eventSubmission,
          gallerySubmission,
          news: {
            upsert: news.upsertEndpoint || news.upsert || '',
            archive: news.archiveEndpoint || news.archive || '',
            pin: news.pinEndpoint || news.pin || '',
            unpin: news.unpinEndpoint || news.unpin || ''
          }
        }
      }
    };
  }

  U.readConfig = async function readConfig() {
    if (_cache.config) return _cache.config;
    if (_cache.configTried) return _cache.config;

    _cache.configTried = true;

    // Prefer new config.json, fallback to legacy site-config.json
    const [a, b] = await Promise.all([
      U.fetchJsonSoft('data/config.json', null),
      U.fetchJsonSoft('data/site-config.json', null)
    ]);

    const raw = a || b || {};
    _cache.config = normalizeConfig(raw);
    return _cache.config;
  };

  // ------------------------------
  // Data loaders
  // ------------------------------

  async function loadEvents(cfg) {
    const data = await U.fetchJson(cfg.data.events);
    const items = Array.isArray(data.items) ? data.items : [];
    return items;
  }

  async function loadLinks(cfg) {
    const data = await U.fetchJson(cfg.data.links);
    const items = Array.isArray(data.items) ? data.items : [];
    return items;
  }

  async function loadGallery(cfg) {
    const data = await U.fetchJson(cfg.data.gallery);
    const items = Array.isArray(data.items) ? data.items : [];
    return items;
  }

  async function loadNews(cfg) {
    const [newsData, archivedData, pinnedData] = await Promise.all([
      U.fetchJson(cfg.data.news.items),
      U.fetchJsonSoft(cfg.data.news.archived, { archived: [] }),
      U.fetchJsonSoft(cfg.data.news.pinned, { pinned: [] })
    ]);

    const rawItems = Array.isArray(newsData.items) ? newsData.items : [];
    const archivedIds = new Set((archivedData.archived || archivedData.deleted || []).map(String));
    const pinnedIds = new Set((pinnedData.pinned || []).map(String));

    const items = rawItems
      .filter((it) => {
        const id = String(it.id);
        if (archivedIds.has(id)) return false;
        if (it.archivedAt && String(it.archivedAt).trim()) return false;
        return true;
      })
      .map((it) => ({ ...it, pinned: pinnedIds.has(String(it.id)) }));

    items.sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return String(b.date || '').localeCompare(String(a.date || ''));
    });

    return items;
  }

  async function loadProton(cfg) {
    const data = await U.fetchJsonSoft(cfg.data.proton, []);
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
    return items;
  }

  async function loadMaps(cfg) {
    const data = await U.fetchJsonSoft(cfg.data.maps, { items: [] });
    return Array.isArray(data.items) ? data.items : [];
  }

  // ------------------------------
  // Rendering primitives
  // ------------------------------

  function formatDate(dateStr, cfg) {
    const s = String(dateStr || '').trim();
    if (!s) return '';

    if (window.luxon?.DateTime) {
      const { DateTime } = window.luxon;
      const dt = DateTime.fromISO(s, { zone: cfg.site.timezone });
      if (dt.isValid) return dt.toLocaleString(DateTime.DATE_MED);
    }

    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return s;
    return d.toLocaleDateString();
  }

  function formatDateTime(dateStr, cfg) {
    const s = String(dateStr || '').trim();
    if (!s) return '';

    if (window.luxon?.DateTime) {
      const { DateTime } = window.luxon;
      const dt = DateTime.fromISO(s, { zone: cfg.site.timezone });
      if (dt.isValid) return dt.toLocaleString(DateTime.DATETIME_MED);
    }

    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return s;
    return d.toLocaleString();
  }

  function sanitizeHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');

    tmp.querySelectorAll('script, iframe, object, embed').forEach((n) => n.remove());

    tmp.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      });
    });

    tmp.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (/^javascript:/i.test(href)) a.removeAttribute('href');
      a.setAttribute('rel', 'noopener noreferrer');
      a.setAttribute('target', '_blank');
    });

    return tmp.innerHTML;
  }

  // ------------------------------
  // Page renderers
  // ------------------------------

  async function renderHome(cfg) {
    U.setYear('#year');

    // Upcoming events
    const eventsHost = U.q('#events-grid');
    const eventsStatus = U.q('#events-status');
    if (eventsHost) {
      try {
        U.setText(eventsStatus, 'Loading events…');
        const events = await loadEvents(cfg);

        const now = window.luxon?.DateTime
          ? window.luxon.DateTime.now().setZone(cfg.site.timezone)
          : null;

        const upcoming = events.filter((ev) => {
          const d = String(ev.date || '').trim();
          if (!d) return false;

          if (window.luxon?.DateTime && now) {
            const { DateTime } = window.luxon;
            let dt = DateTime.fromISO(d, { zone: cfg.site.timezone });
            if (ev.time) {
              const t = String(ev.time).trim();
              const tdt = DateTime.fromFormat(t, 'HH:mm', { zone: cfg.site.timezone });
              if (tdt.isValid) dt = dt.set({ hour: tdt.hour, minute: tdt.minute });
            }
            if (!dt.isValid) return false;
            if (ev.time) return dt >= now;
            return dt.endOf('day') >= now;
          }

          const date = new Date(d);
          if (!Number.isFinite(date.getTime())) return false;
          const today = new Date();
          if (ev.time) return date.getTime() >= today.getTime();
          const eod = new Date(date);
          eod.setHours(23, 59, 59, 999);
          return eod.getTime() >= today.getTime();
        });

        upcoming.sort((a, b) => String(a.sortKey || '').localeCompare(String(b.sortKey || '')));

        eventsHost.innerHTML = '';
        upcoming.slice(0, 10).forEach((ev) => {
          const a = document.createElement('a');
          a.className = 'event-card';
          a.href = `calendar/event/?id=${encodeURIComponent(ev.id)}`;

          const thumb = document.createElement('div');
          thumb.className = 'event-card-thumb';
          thumb.innerHTML = '<span>📅</span>';

          const body = document.createElement('div');
          body.className = 'event-card-body';

          const dateEl = document.createElement('div');
          dateEl.className = 'event-card-date';
          dateEl.textContent = formatDate(ev.date, cfg);

          const titleEl = document.createElement('h3');
          titleEl.className = 'event-card-title';
          titleEl.textContent = ev.title || '(untitled event)';

          const metaEl = document.createElement('div');
          metaEl.className = 'event-card-meta';
          const bits = [];
          if (ev.time) bits.push(ev.time);
          if (ev.location) bits.push(ev.location);
          metaEl.textContent = bits.join(' • ');

          body.appendChild(dateEl);
          body.appendChild(titleEl);
          if (metaEl.textContent) body.appendChild(metaEl);

          a.appendChild(thumb);
          a.appendChild(body);
          eventsHost.appendChild(a);
        });

        U.setText(eventsStatus, upcoming.length ? '' : 'No upcoming events.');
      } catch (e) {
        console.error(TAG, 'events failed', e);
        U.setText(eventsStatus, 'Error loading events.');
      }
    }

    // Latest news
    const newsHost = U.q('#news-grid');
    const newsStatus = U.q('#news-status');
    if (newsHost) {
      try {
        U.setText(newsStatus, 'Loading news…');
        const items = await loadNews(cfg);

        newsHost.innerHTML = '';
        items.slice(0, 10).forEach((it) => {
          const card = document.createElement('article');
          card.className = 'event-card news-tile';
          card.style.cursor = 'pointer';

          const thumb = document.createElement('div');
          thumb.className = 'event-card-thumb';
          thumb.innerHTML = '<span>📰</span>';

          const body = document.createElement('div');
          body.className = 'event-card-body';

          const dateEl = document.createElement('div');
          dateEl.className = 'event-card-date';
          dateEl.textContent = formatDateTime(it.date, cfg);

          const titleEl = document.createElement('h3');
          titleEl.className = 'event-card-title';
          titleEl.textContent = U.cleanChampSubject(it.subject || it.subjectRaw || '(no subject)');

          const metaEl = document.createElement('div');
          metaEl.className = 'event-card-meta';
          metaEl.textContent = it.from || '';

          const rawHtml = U.stripCidUrls(it.htmlBody || '');
          const fullText = rawHtml ? U.htmlToText(rawHtml) : String(it.snippet || '');
          const minSlice = U.truncateWords(fullText, 55);

          const excerptEl = document.createElement('div');
          excerptEl.className = 'event-card-meta';
          excerptEl.textContent = minSlice.text;

          const readMore = document.createElement('a');
          readMore.href = `news/article/?id=${encodeURIComponent(it.id)}`;
          readMore.className = 'news-read-more';
          readMore.textContent = 'Read More';
          readMore.addEventListener('click', (e) => e.stopPropagation());

          card.addEventListener('click', () => {
            window.location.href = readMore.href;
          });

          body.appendChild(dateEl);
          body.appendChild(titleEl);
          if (it.from) body.appendChild(metaEl);
          if (excerptEl.textContent) body.appendChild(excerptEl);
          body.appendChild(readMore);

          card.appendChild(thumb);
          card.appendChild(body);

          newsHost.appendChild(card);
        });

        U.setText(newsStatus, items.length ? '' : 'No news items yet.');
      } catch (e) {
        console.error(TAG, 'news failed', e);
        U.setText(newsStatus, 'Error loading news.');
      }
    }

    // Proton feed
    const protonList = U.q('#proton-feed');
    const protonStatus = U.q('#proton-status');
    if (protonList) {
      try {
        U.setText(protonStatus, 'Loading updates…');
        const posts = await loadProton(cfg);
        protonList.innerHTML = '';
        posts.slice(0, 6).forEach((p) => {
          const li = document.createElement('li');
          li.className = 'proton-item';

          const a = document.createElement('a');
          a.href = p.url || '#';
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = p.title || 'Untitled';

          const meta = document.createElement('div');
          meta.className = 'proton-meta';
          meta.textContent = p.date ? new Date(p.date).toLocaleDateString() : '';

          li.appendChild(a);
          li.appendChild(meta);
          protonList.appendChild(li);
        });

        U.setText(protonStatus, posts.length ? '' : 'No updates yet.');
      } catch (e) {
        console.error(TAG, 'proton failed', e);
        U.setText(protonStatus, 'Error loading updates.');
      }
    }

    // Suggestion box (optional)
    const suggestionMount = U.q('#suggestion-box');
    if (suggestionMount) {
      await renderSuggestionBox(cfg, suggestionMount);
    }
  }

  async function renderSuggestionBox(cfg, mountEl) {
    const endpoint = cfg.integrations.formspree.suggestionEndpoint;
    if (!endpoint) {
      mountEl.innerHTML = '';
      return;
    }

    mountEl.innerHTML = `
      <div class="event-card">
        <div class="event-card-body">
          <h3 class="event-card-title">Submit a suggestion</h3>
          <div class="event-card-meta">Suggest an event, link, topic, or project idea. We’ll review and post updates.</div>
          <form id="champ-suggestion-form">
            <textarea id="champ-suggestion-text" rows="4" placeholder="Keep it concise, include any links, and optionally your name/contact." required></textarea>
            <div class="suggestion-actions">
              <button type="submit" class="btn">Submit</button>
              <span id="champ-suggestion-status" class="event-card-meta"></span>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = U.q('#champ-suggestion-form');
    const textEl = U.q('#champ-suggestion-text');
    const statusEl = U.q('#champ-suggestion-status');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = (textEl?.value || '').trim();
      if (!message) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      U.setText(statusEl, 'Sending…');

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            page: window.location.href,
            timestamp: new Date().toISOString()
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (textEl) textEl.value = '';
        U.setText(statusEl, 'Thanks — submitted.');
      } catch (err) {
        console.error(TAG, 'suggestion submit failed', err);
        U.setText(statusEl, 'Sorry, something went wrong.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        setTimeout(() => U.setText(statusEl, ''), 6000);
      }
    });
  }

  function getNewsType(it) {
    const s = String(it?.type || '').trim().toLowerCase();
    const map = {
      announcement: 'announcement',
      announcements: 'announcement',
      update: 'updates',
      updates: 'updates',
      'field notes': 'field-notes',
      'field-notes': 'field-notes',
      fieldnotes: 'field-notes',
      'in the news': 'in-the-news',
      'in-the-news': 'in-the-news',
      idea: 'ideas',
      ideas: 'ideas',
      admin: 'admin',
      'q&a': 'qa',
      qa: 'qa'
    };
    return map[s] || 'field-notes';
  }

  function newsTypeLabel(t) {
    const labels = {
      announcement: 'Announcement',
      updates: 'Updates',
      'field-notes': 'Field Notes',
      'in-the-news': 'In the News',
      ideas: 'Ideas',
      admin: 'Admin',
      qa: 'Q&A'
    };
    return labels[t] || 'Field Notes';
  }

  async function renderNewsPage(cfg) {
    U.setYear('#year');

    const grid = U.q('#news-page-grid');
    const statusEl = U.q('#news-page-status');
    const filtersHost = U.q('#news-filters');
    if (!grid) return;

    const TYPE_ORDER = ['announcement', 'updates', 'field-notes', 'in-the-news', 'ideas', 'admin', 'qa'];

    function uniqueTypes(items) {
      const set = new Set(items.map((it) => getNewsType(it)));
      const known = TYPE_ORDER.filter((t) => set.has(t));
      const unknown = [...set].filter((t) => !TYPE_ORDER.includes(t)).sort();
      return [...known, ...unknown];
    }

    function sortItems(items, sortMode) {
      const out = [...items];
      out.sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (bp !== ap) return bp - ap;
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
      if (sortMode === 'oldest') out.reverse();
      return out;
    }

    function buildTile(it) {
      const type = getNewsType(it);

      const card = document.createElement('article');
      card.className = `news-article-card news-type-${type}`;
      card.style.cursor = 'pointer';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      const body = document.createElement('div');
      body.className = 'news-article-body';

      const tag = document.createElement('span');
      tag.className = `news-tag news-tag-${type}`;
      tag.textContent = newsTypeLabel(type);

      const metaBar = document.createElement('div');
      metaBar.className = 'news-article-meta';
      metaBar.textContent = `${formatDateTime(it.date, cfg)}${it.from ? ' · ' + it.from : ''}`;

      const title = document.createElement('h3');
      title.className = 'news-article-title';
      title.textContent = U.cleanChampSubject(it.subject || it.subjectRaw || '(no subject)');

      const rawHtml = U.stripCidUrls(it.htmlBody || '');
      const fullText = rawHtml ? U.htmlToText(rawHtml) : String(it.snippet || '');
      const minSlice = U.truncateWords(fullText, 60);
      const maxSlice = U.truncateWords(fullText, 300);

      const snipWrap = document.createElement('div');
      snipWrap.className = 'news-article-snippet';
      snipWrap.textContent = minSlice.text || 'Read more…';

      const readMore = document.createElement('a');
      readMore.href = `article/?id=${encodeURIComponent(it.id)}`;
      readMore.className = 'news-read-more';
      readMore.textContent = minSlice.truncated ? '...Read More' : 'Read More';
      readMore.addEventListener('click', (e) => e.stopPropagation());

      const hint = document.createElement('div');
      hint.className = 'news-expand-hint muted';
      hint.style.fontSize = '0.85rem';
      hint.style.marginTop = '6px';
      hint.textContent = minSlice.truncated ? 'Click to expand' : '';

      body.appendChild(tag);
      body.appendChild(metaBar);
      body.appendChild(title);
      body.appendChild(snipWrap);
      body.appendChild(readMore);
      if (hint.textContent) body.appendChild(hint);

      card.appendChild(body);

      card.addEventListener('click', () => {
        const expanded = card.classList.toggle('expanded');
        if (expanded) {
          snipWrap.textContent = maxSlice.text;
          readMore.textContent = maxSlice.truncated ? '...Read More' : 'Read More';
          hint.textContent = 'Click to collapse';
        } else {
          snipWrap.textContent = minSlice.text;
          readMore.textContent = minSlice.truncated ? '...Read More' : 'Read More';
          hint.textContent = minSlice.truncated ? 'Click to expand' : '';
        }
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });

      return card;
    }

    function mountFilters(types, onChange) {
      if (!filtersHost) return;
      filtersHost.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.className = 'news-filter-wrap';

      const label = document.createElement('div');
      label.className = 'news-filter-label';
      label.textContent = 'Filter:';

      const typeSel = document.createElement('select');
      typeSel.className = 'news-filter-select';
      typeSel.innerHTML = `<option value="all">All categories</option>`;
      types.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = newsTypeLabel(t);
        typeSel.appendChild(opt);
      });

      const sortSel = document.createElement('select');
      sortSel.className = 'news-sort-select';
      sortSel.innerHTML = `
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      `;

      const state = { type: 'all', sort: 'newest' };
      const emit = () => onChange({ ...state });

      typeSel.addEventListener('change', () => { state.type = typeSel.value; emit(); });
      sortSel.addEventListener('change', () => { state.sort = sortSel.value; emit(); });

      wrap.appendChild(label);
      wrap.appendChild(typeSel);
      wrap.appendChild(sortSel);
      filtersHost.appendChild(wrap);

      emit();
    }

    try {
      U.setText(statusEl, 'Loading news…');
      const items = await loadNews(cfg);
      if (!items.length) {
        grid.innerHTML = '';
        U.setText(statusEl, 'No news items yet.');
        return;
      }

      function render({ type, sort }) {
        const sorted = sortItems(items, sort);
        const filtered = type === 'all' ? sorted : sorted.filter((it) => getNewsType(it) === type);

        grid.innerHTML = '';
        if (!filtered.length) {
          U.setText(statusEl, 'No items match that filter.');
          return;
        }

        filtered.forEach((it) => grid.appendChild(buildTile(it)));
        U.setText(statusEl, '');
      }

      mountFilters(uniqueTypes(items), render);
    } catch (e) {
      console.error(TAG, 'news page failed', e);
      U.setText(statusEl, 'Error loading news.');
    }
  }

  async function renderNewsArticle(cfg) {
    U.setYear('#year');

    const host = U.q('#news-article');
    const statusEl = U.q('#news-article-status');
    if (!host) return;

    const id = U.getQueryParam('id');
    if (!id) {
      U.setText(statusEl, 'Missing article id.');
      return;
    }

    try {
      U.setText(statusEl, 'Loading article…');
      const items = await loadNews(cfg);
      const it = items.find((x) => String(x.id) === String(id));

      if (!it) {
        U.setText(statusEl, 'Article not found (it may be archived).');
        return;
      }

      const title = U.cleanChampSubject(it.subject || it.subjectRaw || '(no subject)');
      const meta = `${formatDateTime(it.date, cfg)}${it.from ? ' · ' + it.from : ''}`;
      const body = sanitizeHtml(U.stripCidUrls(it.htmlBody || ''));

      host.innerHTML = `
        <header class="front-section-header">
          <h2>${U.escapeHtml(title)}</h2>
          <p class="muted">${U.escapeHtml(meta)}</p>
        </header>
        <article class="card" style="padding: 16px">
          ${body || `<p class="muted">No content available.</p>`}
        </article>
      `;

      U.setText(statusEl, '');
    } catch (e) {
      console.error(TAG, 'article failed', e);
      U.setText(statusEl, 'Error loading article.');
    }
  }

  async function renderCalendar(cfg) {
    U.setYear('#year');

    const host = U.q('#calendar');
    const statusEl = U.q('#calendar-status');
    if (!host) return;

    if (!window.luxon?.DateTime) {
      U.setText(statusEl, 'Luxon not loaded; calendar view unavailable.');
      return;
    }

    const { DateTime } = window.luxon;

    function monthGrid(dt) {
      const start = dt.startOf('month');
      const firstDow = start.weekday % 7; // Sun=0
      const gridStart = start.minus({ days: firstDow });
      return Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
    }

    function render(view, events) {
      host.innerHTML = '';

      const header = document.createElement('div');
      header.className = 'header';
      header.innerHTML = `
        <button id="prev-month" aria-label="Previous Month">◀</button>
        <div><strong>${view.toFormat('MMMM yyyy')}</strong></div>
        <button id="next-month" aria-label="Next Month">▶</button>
      `;
      host.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'grid';

      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => {
        const h = document.createElement('div');
        h.className = 'dow';
        h.textContent = d;
        grid.appendChild(h);
      });

      const days = monthGrid(view);
      const todayKey = DateTime.now().setZone(cfg.site.timezone).toISODate();

      const byDay = new Map();
      events.forEach((ev) => {
        const key = String(ev.date || '').slice(0, 10);
        if (!key) return;
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(ev);
      });

      days.forEach((d) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (d.month !== view.month) cell.style.opacity = 0.45;

        const dateLabel = document.createElement('div');
        dateLabel.className = 'date';
        dateLabel.textContent = String(d.day);
        if (d.toISODate() === todayKey) dateLabel.style.color = '#fff';
        cell.appendChild(dateLabel);

        const items = byDay.get(d.toISODate()) || [];
        items.forEach((ev) => {
          const pill = document.createElement('a');
          pill.className = 'event-pill';
          pill.href = `event/?id=${encodeURIComponent(ev.id)}`;

          const ct = ev.time
            ? DateTime.fromFormat(String(ev.time), 'HH:mm', { zone: cfg.site.timezone }).toFormat('h:mm a')
            : '';
          const t = ev.time ? `@ ${ct}` : '';

          pill.innerHTML = `<span class="t">${U.escapeHtml(ev.title)}<br>${U.escapeHtml(t)}</span><br><span class="l">${U.escapeHtml(ev.location || '')}</span>`;
          cell.appendChild(pill);
        });

        grid.appendChild(cell);
      });

      host.appendChild(grid);

      host.querySelector('#prev-month')?.addEventListener('click', () => render(view.minus({ months: 1 }), events));
      host.querySelector('#next-month')?.addEventListener('click', () => render(view.plus({ months: 1 }), events));
    }

    try {
      U.setText(statusEl, 'Loading events…');
      const events = await loadEvents(cfg);
      const view = DateTime.now().setZone(cfg.site.timezone);
      render(view, events);
      U.setText(statusEl, '');
    } catch (e) {
      console.error(TAG, 'calendar failed', e);
      U.setText(statusEl, 'Error loading calendar.');
    }
  }

  async function renderEventDetail(cfg) {
    U.setYear('#year');

    const host = U.q('#event-detail');
    const statusEl = U.q('#event-status');
    if (!host) return;

    const id = U.getQueryParam('id');
    if (!id) {
      U.setText(statusEl, 'Missing event id.');
      return;
    }

    try {
      U.setText(statusEl, 'Loading event…');
      const events = await loadEvents(cfg);
      const ev = events.find((x) => String(x.id) === String(id));
      if (!ev) {
        U.setText(statusEl, 'Event not found.');
        return;
      }

      host.innerHTML = `
        <div class="event-detail-header">
          <p class="event-detail-date">${U.escapeHtml(formatDate(ev.date, cfg))}${ev.time ? ` • ${U.escapeHtml(ev.time)}` : ''}</p>
          <h2 class="event-detail-title">${U.escapeHtml(ev.title)}</h2>
          ${ev.location ? `<p class="event-detail-location">${U.escapeHtml(ev.location)}</p>` : ''}
        </div>
        <div class="event-detail-body">
          ${ev.description ? `<p>${U.escapeHtml(ev.description)}</p>` : `<p class="muted">No description provided.</p>`}
          ${ev.link ? `<p><a class="event-detail-link" href="${U.escapeHtml(ev.link)}" target="_blank" rel="noopener">Event link</a></p>` : ''}
          ${ev.contact ? `<p class="muted">Contact: ${U.escapeHtml(ev.contact)}</p>` : ''}
        </div>
      `;

      U.setText(statusEl, '');
    } catch (e) {
      console.error(TAG, 'event detail failed', e);
      U.setText(statusEl, 'Error loading event.');
    }
  }

  async function renderLinks(cfg) {
    U.setYear('#year');

    const grid = U.q('#links-grid');
    const statusEl = U.q('#links-status');
    const filterSel = U.q('#links-filter');
    if (!grid) return;

    try {
      U.setText(statusEl, 'Loading links…');
      const items = await loadLinks(cfg);

      const cats = [...new Set(items.map((x) => String(x.category || 'General')))].sort();
      if (filterSel) {
        filterSel.innerHTML = `<option value="all">All</option>`;
        cats.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c;
          filterSel.appendChild(opt);
        });
      }

      const render = () => {
        const cat = String(filterSel?.value || 'all');
        const filtered = cat === 'all' ? items : items.filter((x) => String(x.category || 'General') === cat);

        grid.innerHTML = '';
        filtered.forEach((it) => {
          const card = document.createElement('article');
          card.className = 'event-card';

          const body = document.createElement('div');
          body.className = 'event-card-body';

          const title = document.createElement('h3');
          title.className = 'event-card-title';
          title.textContent = it.title;

          const meta = document.createElement('div');
          meta.className = 'event-card-meta';
          meta.textContent = it.description || '';

          const a = document.createElement('a');
          a.className = 'news-read-more';
          a.href = it.url || '#';
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = 'Open';

          body.appendChild(title);
          if (meta.textContent) body.appendChild(meta);
          body.appendChild(a);
          card.appendChild(body);
          grid.appendChild(card);
        });

        U.setText(statusEl, filtered.length ? '' : 'No links match this filter.');
      };

      filterSel?.addEventListener('change', render);
      render();
    } catch (e) {
      console.error(TAG, 'links failed', e);
      U.setText(statusEl, 'Error loading links.');
    }
  }

  async function renderGallery(cfg) {
    U.setYear('#year');

    const grid = U.q('#gallery-grid');
    const statusEl = U.q('#gallery-status');
    const filterSel = U.q('#gallery-filter');
    if (!grid) return;

    function buildCard(meta) {
      const card = document.createElement('article');
      card.className = 'event-card gallery-card';

      const thumb = document.createElement('div');
      thumb.className = 'event-card-thumb';

      const img = document.createElement('img');
      img.alt = meta.description || 'Gallery image';
      img.loading = 'lazy';
      img.src = U.safeAssetSrc(meta.image || '');
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';

      img.addEventListener('error', () => {
        thumb.innerHTML = '<span>🖼️</span>';
      });

      thumb.appendChild(img);

      const body = document.createElement('div');
      body.className = 'event-card-body';

      const dateEl = document.createElement('div');
      dateEl.className = 'event-card-date';
      dateEl.textContent = meta.date ? new Date(meta.date).toLocaleDateString() : '';

      const descEl = document.createElement('div');
      descEl.className = 'event-card-title';
      descEl.textContent = meta.description || '';

      const byEl = document.createElement('div');
      byEl.className = 'event-card-meta';
      byEl.textContent = meta.submitted_by ? `Submitted by: ${meta.submitted_by}` : '';

      const tagsEl = document.createElement('div');
      tagsEl.className = 'event-card-meta';
      tagsEl.textContent = Array.isArray(meta.tags) && meta.tags.length ? `Tags: ${meta.tags.join(', ')}` : '';

      const open = document.createElement('a');
      open.className = 'news-read-more';
      open.href = U.safeAssetSrc(meta.image || '');
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = 'Open Image';

      body.appendChild(dateEl);
      body.appendChild(descEl);
      if (meta.submitted_by) body.appendChild(byEl);
      if (tagsEl.textContent) body.appendChild(tagsEl);
      body.appendChild(open);

      card.appendChild(thumb);
      card.appendChild(body);
      return card;
    }

    function uniqueTags(items) {
      const s = new Set();
      items.forEach((m) => (m.tags || []).forEach((t) => s.add(String(t).toLowerCase())));
      return [...s].sort();
    }

    try {
      U.setText(statusEl, 'Loading gallery…');
      const items = await loadGallery(cfg);

      const tags = uniqueTags(items);
      if (filterSel) {
        filterSel.innerHTML = '<option value="all">All</option>';
        tags.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          filterSel.appendChild(opt);
        });
      }

      const render = () => {
        const tag = String(filterSel?.value || 'all').toLowerCase();
        const filtered =
          tag === 'all'
            ? items
            : items.filter((m) => (m.tags || []).some((x) => String(x).toLowerCase() === tag));

        grid.innerHTML = '';
        filtered.forEach((m) => grid.appendChild(buildCard(m)));
        U.setText(statusEl, filtered.length ? '' : 'No images match this filter.');
      };

      filterSel?.addEventListener('change', render);
      render();
    } catch (e) {
      console.error(TAG, 'gallery failed', e);
      U.setText(statusEl, 'Error loading gallery.');
    }
  }

  async function renderFeedback(cfg) {
    U.setYear('#year');

    const suggestionMount = U.q('#suggestion-box');
    if (suggestionMount) await renderSuggestionBox(cfg, suggestionMount);

    const eventForm = U.q('#submit-event-form');
    const eventStatus = U.q('#submit-event-status');
    if (eventForm) {
      const endpoint = cfg.integrations.endpoints.eventSubmission;

      if (!endpoint) {
        U.setText(eventStatus, 'Event submission endpoint not configured (set integrations.endpoints.eventSubmission in data/config.json).');
      } else {
        eventForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(eventForm);
          const payload = {
            title: String(fd.get('title') || '').trim(),
            date: String(fd.get('date') || '').trim(),
            time: String(fd.get('time') || '').trim(),
            location: String(fd.get('location') || '').trim(),
            description: String(fd.get('description') || '').trim(),
            link: String(fd.get('link') || '').trim(),
            contact: String(fd.get('contact') || '').trim(),
            page: window.location.href,
            timestamp: new Date().toISOString()
          };

          if (!payload.title || !payload.date) {
            U.setText(eventStatus, 'Title and date are required.');
            return;
          }

          const btn = eventForm.querySelector('button[type="submit"]');
          if (btn) btn.disabled = true;
          U.setText(eventStatus, 'Submitting…');

          try {
            await U.postJson(endpoint, payload);
            eventForm.reset();
            U.setText(eventStatus, 'Submitted. Thanks!');
          } catch (err) {
            console.error(TAG, 'event submit failed', err);
            U.setText(eventStatus, err.message || String(err));
          } finally {
            if (btn) btn.disabled = false;
            setTimeout(() => U.setText(eventStatus, ''), 8000);
          }
        });
      }
    }
  }

  async function renderMaps(cfg) {
    U.setYear('#year');

    const grid = U.q('#maps-grid');
    const statusEl = U.q('#maps-status');
    if (!grid) return;

    try {
      U.setText(statusEl, 'Loading maps…');
      const items = await loadMaps(cfg);
      grid.innerHTML = '';

      items.forEach((m) => {
        const card = document.createElement('article');
        card.className = 'event-card';
        const body = document.createElement('div');
        body.className = 'event-card-body';

        const title = document.createElement('h3');
        title.className = 'event-card-title';
        title.textContent = m.title || 'Map';

        const meta = document.createElement('div');
        meta.className = 'event-card-meta';
        meta.textContent = m.description || '';

        body.appendChild(title);
        if (meta.textContent) body.appendChild(meta);

        if (m.url) {
          const a = document.createElement('a');
          a.className = 'news-read-more';
          a.href = m.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = 'Open';
          body.appendChild(a);
        }

        card.appendChild(body);
        grid.appendChild(card);
      });

      U.setText(statusEl, items.length ? '' : 'No maps yet.');
    } catch (e) {
      console.error(TAG, 'maps failed', e);
      U.setText(statusEl, 'Error loading maps.');
    }
  }

  // ------------------------------
  // Admin (NEW)
  // ------------------------------

  function setHref(id, href) {
    const a = document.getElementById(id);
    if (!a) return;
    a.href = href;
  }

  function buildIssueFormUrl(cfg, templateFile) {
    const owner = cfg?.repo?.owner || '';
    const name = cfg?.repo?.name || '';
    if (!owner || !name) return '';
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/new?template=${encodeURIComponent(templateFile)}`;
  }

  async function renderAdmin(cfg) {
    U.setYear('#year');

    // Optional status element on the admin page
    const statusEl = U.q('#admin-status');

    const owner = cfg?.repo?.owner || '';
    const name = cfg?.repo?.name || '';

    if (!owner || !name) {
      const msg =
        'Repo info is not configured. Set "repo.owner" and "repo.name" in data/config.json to enable Admin submission links.';
      U.setText(statusEl, msg);

      // Disable/hard-set to "#" so the UI is obvious
      setHref('admin-submit-event', '#');
      setHref('admin-submit-news', '#');
      setHref('admin-submit-link', '#');
      setHref('admin-submit-gallery', '#');
      return;
    }

    // Inject links to GitHub Issue Form templates
    setHref('admin-submit-event', buildIssueFormUrl(cfg, 'submit_event.yml'));
    setHref('admin-submit-news', buildIssueFormUrl(cfg, 'submit_news.yml'));
    setHref('admin-submit-link', buildIssueFormUrl(cfg, 'submit_link.yml'));
    setHref('admin-submit-gallery', buildIssueFormUrl(cfg, 'submit_gallery.yml'));

    U.setText(statusEl, '');
  }

  // ------------------------------
  // Boot
  // ------------------------------

  async function boot() {
    try {
      const cfg = await U.readConfig();
      const page = document.body?.dataset?.page || '';

      switch (page) {
        case 'home':
          await renderHome(cfg);
          break;
        case 'news':
          await renderNewsPage(cfg);
          break;
        case 'news-article':
          await renderNewsArticle(cfg);
          break;
        case 'calendar':
          await renderCalendar(cfg);
          break;
        case 'event':
          await renderEventDetail(cfg);
          break;
        case 'gallery':
          await renderGallery(cfg);
          break;
        case 'links':
          await renderLinks(cfg);
          break;
        case 'feedback':
          await renderFeedback(cfg);
          break;
        case 'maps':
          await renderMaps(cfg);
          break;
        case 'admin': // NEW
          await renderAdmin(cfg);
          break;
        default:
          U.setYear('#year');
          break;
      }

      try {
        console.log(TAG, 'boot ok', { page, base: U.base() });
      } catch {}
    } catch (e) {
      console.error(TAG, 'boot failed', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.Champ = { U };
})();
