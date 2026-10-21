/* Interactive figure: zoom into the Mandelbrot set.

   One canvas shows a window of the parameter plane, described by its centre
   and width (the height is three quarters of the width). Drag to move,
   click to zoom in and Shift-click to zoom out, or use the buttons, the
   keyboard (arrows, + and −), or the wheel with Ctrl or ⌘ held. The
   iteration budget grows with the magnification.

   Ordinary double-precision numbers run out when neighbouring pixels are
   only a few representable numbers apart; the viewer stops zooming there
   and says so. Built by AtlasKit.setUp for every <figure data-widget="zoom">;
   data-example chooses the first window (default "whole").

   A link to the page ending in #zoom=<re>,<im>,<width>, for example
   gallery.html#zoom=-0.75,0.09,0.08, opens the page's first viewer on that
   window (centre re + im·i, the given width) and scrolls to it; following
   such a link on the same page moves the viewer again. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 720;
  const HEIGHT = 540;
  const PREVIEW = 4;           // the preview is drawn at a quarter of the resolution
  const FULL_WIDTH = 3.2;      // the whole set
  const ZOOM_STEP = 2;
  const PAN_STEP = .1;         // arrow keys move by a tenth of the width
  const CLICK_DISTANCE = 4;    // pointer movement below this counts as a click
  const LIMIT_PIXEL_ULPS = 4;  // smallest pixel size, in representable steps near the centre

  // Windows as {centre, width}; most are the windows of the atlas's plates.
  const EXAMPLES = [
    ['whole', 'The whole set', -.7, 0, FULL_WIDTH],
    ['minibrot', 'Period-3 copy (plate in Minibrots)', -1.765, 0, .07],
    ['seahorse', 'Seahorse valley (plate in the tour)', -.75, .09, .08],
    ['misiurewicz', 'Around c = i (plate in Special points)', 0, 1, .14],
    ['cusp', 'The cusp c = 1/4 (plate in the gallery)', .25, 0, .1],
    ['spiral', 'A deep spiral in seahorse valley', -.743643887037151, .131825904205330, 2e-9],
  ];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The window in a "#zoom=re,im,width" address, or null.
  function linkedWindow() {
    const match = /^#zoom=([^,]+),([^,]+),([^,]+)$/.exec(decodeURIComponent(location.hash));
    if (!match) return null;
    const [re, im, width] = match.slice(1).map(Number);
    return [re, im, width].every(Number.isFinite) && width > 0 ? {centre: {re, im}, width} : null;
  }

  // The smallest width at which pixels are still LIMIT_PIXEL_ULPS
  // representable steps apart near the centre.
  function minimumWidth(centre) {
    const size = Math.max(1, Math.abs(centre.re), Math.abs(centre.im));
    return WIDTH * LIMIT_PIXEL_ULPS * Number.EPSILON * size;
  }

  // A positive number for the status line: plain between 0.01 and 100 000,
  // otherwise as "2 × 10⁻⁹".
  function magnitude(x) {
    if (x >= .01 && x < 1e5) return formatNumber(x, 3);
    const exponent = Math.floor(Math.log10(x));
    const mantissa = x / 10 ** exponent;
    return `${formatNumber(mantissa, 2)} × 10<sup>${exponent < 0 ? '−' : ''}${Math.abs(exponent)}</sup>`;
  }

  kit.setUp('zoom', (figure) => {
    figure.classList.add('widget-plate');
    const first = EXAMPLES.find(example => example[0] === figure.dataset.example) || EXAMPLES[0];
    const state = {centre: {re: first[2], im: first[3]}, width: first[4]};
    let generation = 0;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const exampleLabel = element('label', null, 'Window');
    const select = element('select');
    for (const [key, name] of EXAMPLES) {
      const option = element('option', null, name);
      option.value = key;
      select.append(option);
    }
    const custom = element('option', null, 'Your own window');
    custom.value = 'custom';
    select.append(custom);
    select.value = first[0];
    exampleLabel.append(select);
    const buttons = element('div', 'plate-buttons');
    function button(text, onClick, quiet = false) {
      const node = element('button', quiet ? 'plate-button-quiet' : null, text);
      node.type = 'button';
      node.addEventListener('click', onClick);
      buttons.append(node);
      return node;
    }
    const zoomInButton = button('Zoom in', () => zoomAt(state.centre, 1 / ZOOM_STEP));
    button('Zoom out', () => zoomAt(state.centre, ZOOM_STEP));
    button('Whole set', () => show(EXAMPLES[0]), true);
    controls.append(exampleLabel, buttons);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view zoom-view');
    view.tabIndex = 0;
    view.setAttribute('role', 'img');
    view.setAttribute('aria-label', 'Zoomable picture of the Mandelbrot set. Arrow keys move the window, '
      + 'plus and minus zoom in and out; the status below gives the window.');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    view.append(canvas);
    const preview = document.createElement('canvas');
    preview.width = WIDTH / PREVIEW;
    preview.height = HEIGHT / PREVIEW;
    const previewContext = preview.getContext('2d');
    const status = element('p', 'plate-verdict');
    status.setAttribute('aria-live', 'polite');
    const hint = element('p', 'plate-caption zoom-hint', 'Hold Ctrl or ⌘ to zoom with the wheel.');
    hint.hidden = true;

    const height = () => state.width * HEIGHT / WIDTH;
    const windowOf = () => ({left: state.centre.re - state.width / 2, top: state.centre.im + height() / 2,
      width: state.width, height: height()});
    // The parameter c under a canvas position (in canvas pixels).
    const pointAt = (x, y) => ({re: state.centre.re + (x / WIDTH - .5) * state.width,
      im: state.centre.im - (y / HEIGHT - .5) * height()});

    function describe(seconds) {
      const atLimit = state.width <= minimumWidth(state.centre) * 1.0001;
      const magnification = FULL_WIDTH / state.width;
      const decimals = Math.max(4, Math.ceil(-Math.log10(state.width)) + 3);
      const shownMagnification = magnification >= 10 && magnification < 1e5
        ? Math.round(magnification).toLocaleString('en') : magnitude(magnification);
      let text = `Center ${format(state.centre, decimals)} · width ${magnitude(state.width)} · magnification `
        + `${shownMagnification} · ${kit.iterationBudget(state.width).toLocaleString('en')} iterations per pixel.`;
      text += seconds === null ? ' Drawing…' : ` Drawn in ${formatNumber(seconds, 1)} s.`;
      if (atLimit) {
        text += ' Zooming stops here: neighboring pixels are now only a few representable numbers apart, so '
          + 'further zooming would show rounding errors rather than the set.';
      } else if (state.width < 100 * minimumWidth(state.centre)) {
        text += ' This is close to the limit of the computer’s arithmetic.';
      }
      zoomInButton.disabled = atLimit;
      status.innerHTML = text;  // built only from numbers formatted above
    }

    async function render() {
      const request = ++generation;
      const isCurrent = () => request === generation;
      const budget = kit.iterationBudget(state.width);
      describe(null);
      const started = performance.now();
      const quick = await kit.renderEscapeTime(previewContext, windowOf(), null, budget, isCurrent, {repeats: true});
      if (!quick) return;
      context.imageSmoothingEnabled = true;
      context.drawImage(preview, 0, 0, WIDTH, HEIGHT);
      const image = await kit.renderEscapeTime(context, windowOf(), null, budget, isCurrent, {repeats: true});
      if (image) describe((performance.now() - started) / 1000);
    }

    // Shows the old picture moved and scaled at once, while the new one is drawn.
    function transformPicture(dx, dy, scale) {
      const copy = document.createElement('canvas');
      copy.width = WIDTH;
      copy.height = HEIGHT;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      context.fillStyle = '#091320';
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.drawImage(copy, dx, dy, WIDTH * scale, HEIGHT * scale);
    }

    function setWindow(centre, width, picture) {
      const limited = Math.max(width, minimumWidth(centre));
      state.centre = centre;
      state.width = Math.min(limited, 4 * FULL_WIDTH);
      const example = EXAMPLES.find(([, , re, im, w]) => re === centre.re && im === centre.im && w === state.width);
      select.value = example ? example[0] : 'custom';
      if (picture) transformPicture(...picture);
      render();
    }

    // Zooms by `factor` (below 1 zooms in) keeping the point `fixed` in place.
    function zoomAt(fixed, factor) {
      const width = Math.max(state.width * factor, minimumWidth(state.centre));
      const actual = width / state.width;
      const centre = {re: fixed.re + (state.centre.re - fixed.re) * actual, im: fixed.im + (state.centre.im - fixed.im) * actual};
      const scale = 1 / actual;
      const fixedX = (fixed.re - state.centre.re) / state.width * WIDTH + WIDTH / 2;
      const fixedY = (state.centre.im - fixed.im) / height() * HEIGHT + HEIGHT / 2;
      setWindow(centre, width, [fixedX - fixedX * scale, fixedY - fixedY * scale, scale]);
    }

    function show([, , re, im, width]) {
      setWindow({re, im}, width, null);
    }

    // --- input ---------------------------------------------------------------

    select.addEventListener('change', () => {
      const example = EXAMPLES.find(([key]) => key === select.value);
      if (example) show(example);
    });

    // Positions are measured against the view, not the canvas: while dragging,
    // the canvas itself is shifted with a CSS transform.
    const toCanvas = event => {
      const box = view.getBoundingClientRect();
      return {x: (event.clientX - box.left) / box.width * WIDTH, y: (event.clientY - box.top) / box.height * HEIGHT,
        scale: WIDTH / box.width};
    };
    let drag = null;
    view.addEventListener('pointerdown', event => {
      event.preventDefault();
      view.focus();
      view.setPointerCapture(event.pointerId);
      drag = {start: toCanvas(event), moved: 0, shift: event.shiftKey};
    });
    view.addEventListener('pointermove', event => {
      if (!drag) return;
      const now = toCanvas(event);
      drag.moved = Math.hypot(now.x - drag.start.x, now.y - drag.start.y) / now.scale;
      canvas.style.transform = drag.moved >= CLICK_DISTANCE
        ? `translate(${(now.x - drag.start.x) / now.scale}px, ${(now.y - drag.start.y) / now.scale}px)` : '';
    });
    const finish = event => {
      if (!drag) return;
      const end = toCanvas(event);
      canvas.style.transform = '';
      if (drag.moved < CLICK_DISTANCE) {
        zoomAt(pointAt(drag.start.x, drag.start.y), drag.shift || event.shiftKey ? ZOOM_STEP : 1 / ZOOM_STEP);
      } else {
        const dx = end.x - drag.start.x;
        const dy = end.y - drag.start.y;
        setWindow({re: state.centre.re - dx / WIDTH * state.width, im: state.centre.im + dy / HEIGHT * height()},
          state.width, [dx, dy, 1]);
      }
      drag = null;
    };
    view.addEventListener('pointerup', finish);
    view.addEventListener('pointercancel', () => {
      canvas.style.transform = '';
      drag = null;
    });

    let hintTimer = null;
    view.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) {
        hint.hidden = false;
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => { hint.hidden = true; }, 1500);
        return;  // the page scrolls as usual
      }
      event.preventDefault();
      const {x, y} = toCanvas(event);
      zoomAt(pointAt(x, y), event.deltaY < 0 ? 1 / 1.25 : 1.25);
    }, {passive: false});

    view.addEventListener('keydown', event => {
      const moves = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]};
      if (moves[event.key]) {
        const [right, up] = moves[event.key];
        setWindow({re: state.centre.re + right * PAN_STEP * state.width, im: state.centre.im + up * PAN_STEP * state.width},
          state.width, [-right * PAN_STEP * WIDTH, up * PAN_STEP * state.width / height() * HEIGHT, 1]);
      } else if (event.key === '+' || event.key === '=') {
        zoomAt(state.centre, 1 / ZOOM_STEP);
      } else if (event.key === '-' || event.key === '_') {
        zoomAt(state.centre, ZOOM_STEP);
      } else {
        return;
      }
      event.preventDefault();
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, hint, status]) figure.insertBefore(part, caption);

    // Only the page's first viewer answers to #zoom= links.
    const linkable = figure === document.querySelector('figure[data-widget="zoom"]');
    const showLinked = () => {
      const linked = linkable && linkedWindow();
      if (!linked) return false;
      setWindow(linked.centre, linked.width, null);
      // After the figure is revealed: it is still hidden while being built.
      requestAnimationFrame(() => figure.scrollIntoView({block: 'start'}));
      return true;
    };
    if (linkable) window.addEventListener('hashchange', showLinked);
    if (!showLinked()) render();
  });
})();
