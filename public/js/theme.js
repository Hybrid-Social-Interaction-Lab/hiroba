// Theme management: dark/light switching persisted in localStorage.
// The initial data-theme is set by an inline <head> snippet to avoid FOUC;
// this file handles toggling and toggle-button icons.
(function () {
  const STORAGE_KEY = 'hiroba-theme';

  // Lucide "sun" and "moon" paths, embedded so admin.html (no Lucide) works too.
  const SUN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  const MOON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

  function getTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function updateIcons() {
    // Sun in dark mode ("switch to light"), moon in light mode ("switch to dark")
    const icon = getTheme() === 'light' ? MOON_SVG : SUN_SVG;
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.innerHTML = icon;
      btn.title = getTheme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    });
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, getTheme());
    } catch (e) {
      /* private mode etc. — theme still applies for this page */
    }
    updateIcons();
  }

  function toggle() {
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
  }

  // Follow OS preference changes only while the user hasn't chosen manually.
  try {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        document.documentElement.dataset.theme = e.matches ? 'light' : 'dark';
        updateIcons();
      }
    });
  } catch (e) {
    /* matchMedia unavailable */
  }

  function init() {
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', toggle);
    });
    updateIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HirobaTheme = { getTheme, setTheme, toggle };
})();
