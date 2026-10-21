/* Page interface: colour theme, chapter menu, current-section highlight and
   printed answers to the exercises.
   Loaded without `defer` so the saved theme applies before the first paint.
   Progressive enhancement only: without JavaScript the page follows the
   system theme and the chapter list is always shown. */
(() => {
  'use strict';
  const root = document.documentElement;
  const STORAGE_KEY = 'atlas-theme';
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_NAMES = {auto: 'Auto', light: 'Light', dark: 'Dark'};

  // Storage can be unavailable (private windows, blocked site data); the
  // theme choice then lasts only until the next page.
  function savedTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return THEMES.includes(value) ? value : 'auto';
    } catch {
      return 'auto';
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* keep the choice for this page only */
    }
  }

  function applyTheme(theme) {
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }

  applyTheme(savedTheme());
  root.classList.add('js');

  function setUpThemeButton() {
    const button = document.querySelector('.theme-button');
    const name = button && button.querySelector('.theme-name');
    if (!name) return;
    let theme = savedTheme();
    name.textContent = THEME_NAMES[theme];
    button.addEventListener('click', () => {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      applyTheme(theme);
      saveTheme(theme);
      name.textContent = THEME_NAMES[theme];
    });
  }

  function setUpMenu() {
    const header = document.querySelector('.site-header');
    const button = document.querySelector('.menu-button');
    if (!header || !button) return;
    const setOpen = open => {
      header.classList.toggle('nav-open', open);
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', () => setOpen(!header.classList.contains('nav-open')));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && header.classList.contains('nav-open')) {
        setOpen(false);
        button.focus();
      }
    });
  }

  // Marks the table-of-contents entry of the section being read: the last
  // section heading above the upper third of the window.
  function setUpSectionHighlight() {
    const links = new Map();
    for (const link of document.querySelectorAll('.toc a[href^="#"]')) {
      const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      if (heading) links.set(heading, link);
    }
    if (!links.size) return;
    const headings = [...links.keys()];
    let current = null;
    function update() {
      const limit = window.innerHeight / 3;
      let active = null;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > limit) break;
        active = links.get(heading);
      }
      if (active === current) return;
      if (current) current.removeAttribute('aria-current');
      if (active) active.setAttribute('aria-current', 'location');
      current = active;
    }
    let scheduled = false;
    window.addEventListener('scroll', () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        update();
      });
    }, {passive: true});
    update();
  }

  // Exercises print with their answers: the closed ones are opened for
  // printing and closed again afterwards.
  function setUpPrintedAnswers() {
    let opened = [];
    window.addEventListener('beforeprint', () => {
      opened = [...document.querySelectorAll('.exercises details:not([open])')];
      for (const details of opened) details.open = true;
    });
    window.addEventListener('afterprint', () => {
      for (const details of opened) details.open = false;
      opened = [];
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setUpThemeButton();
    setUpMenu();
    setUpSectionHighlight();
    setUpPrintedAnswers();
  });
})();
