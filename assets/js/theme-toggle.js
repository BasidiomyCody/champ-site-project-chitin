/* assets/js/modules/theme-toggle.js
   Requires: champ-utils.js (window.U / window.ChampUtils)
*/
(function () {
  const U = window.ChampUtils || window.U;
  if (!U) {
    console.warn('[CHAMP theme-toggle] Missing champ-utils.js (ChampUtils).');
    return;
  }

  const STORAGE_KEY = 'champ_theme'; // 'dark' | 'light'

  function getPreferredTheme() {
    const saved = (localStorage.getItem(STORAGE_KEY) || '').trim().toLowerCase();
    if (saved === 'dark' || saved === 'light') return saved;

    // Default: follow OS preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    localStorage.setItem(STORAGE_KEY, t);

    const btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      const isDark = t === 'dark';
      btn.setAttribute('aria-pressed', String(isDark));

      const label = btn.querySelector('.theme-toggle-label');
      if (label) label.textContent = isDark ? 'Dark' : 'Light';
    }
  }

  function toggleTheme() {
    const current = (document.documentElement.dataset.theme || 'dark').toLowerCase();
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getPreferredTheme());

    const btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;

    btn.addEventListener('click', toggleTheme);
  });
})();
