/* Interactive figure: zoom into the Mandelbrot set, or into the filled Julia
   set of one of its parameters.

   One canvas shows a window of the parameter plane, described by its centre
   and width (the height is three quarters of the width), at 720 × 540
   pixels or, on a larger screen, at up to 1.5 times that (AtlasKit.fitCanvas).
   Drag to move, click to zoom in and Shift-click to zoom out, or use the
   buttons, the keyboard (arrows, + and −), or the wheel with Ctrl or ⌘ held.
   The iteration budget grows with the magnification.

   The coloring menu offers AtlasKit's colorings of the whole orbit, those of
   the render modes in "Computing the pictures", all from one pass with
   escape radius R = 1000. The pass computes only what the coloring chosen
   needs: the distance estimate needs the derivative, the stripe average its
   stripes and the orbit trap its distances, and the stripe average makes the
   pass several times slower. Choosing a coloring whose numbers the picture
   lacks draws again; any other change of coloring only repaints.
   "Switch to
   Julia set" shows the filled Julia set of the parameter at the centre of the
   picture, in the same coloring and with at least the same budget; the
   button then switches back to the Mandelbrot window that was left.

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
  const JULIA_WIDTH = 4.2;     // a whole filled Julia set, as in the gallery's Julia pictures
  const RADIUS = 1000;         // the escape radius of the colorings
  const ZOOM_STEP = 2;
  const PAN_STEP = .1;         // arrow keys move by a tenth of the width
  const CLICK_DISTANCE = 4;    // pointer movement below this counts as a click
  const LIMIT_PIXEL_ULPS = 4;  // smallest pixel size, in representable steps near the centre

  // Windows as {centre, width}; most are the windows of the atlas's plates.
  const EXAMPLES = [
    ['whole', 'The whole set', -.7, 0, FULL_WIDTH],
    ['minibrot', 'Period-3 copy (plate in Minibrots)', -1.765, 0, .07],
    ['seahorse', 'Seahorse valley (a stop of the tour)', -.75, .09, .08],
    ['misiurewicz', 'Around c = i (plate in the gallery)', 0, 1, .14],
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

  // The smallest width at which `pixels` pixels across are still
  // LIMIT_PIXEL_ULPS representable steps apart near the centre.
  function minimumWidth(centre, pixels) {
    const size = Math.max(1, Math.abs(centre.re), Math.abs(centre.im));
    return pixels * LIMIT_PIXEL_ULPS * Number.EPSILON * size;
  }

  // The decimals of the centre in the status line, more as the window shrinks.
  const decimalsFor = width => Math.max(4, Math.ceil(-Math.log10(width)) + 3);

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
    // julia is null in the parameter plane, or the parameter c of the Julia set shown; left is the
    // Mandelbrot window that was left for it. data is the finished pass of the picture shown, and
    // drawingHas the numbers that the pass being drawn computes (AtlasKit.numbersFor).
    const state = {centre: {re: first[2], im: first[3]}, width: first[4], coloring: 'smooth',
      julia: null, left: null, juliaBudget: 0, juliaDecimals: 4, data: null, seconds: null, drawingHas: null};
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
    const coloringLabel = element('label', null, 'Coloring');
    const coloringSelect = element('select');
    for (const [key, name] of kit.COLORINGS) {
      const option = element('option', null, name);
      option.value = key;
      coloringSelect.append(option);
    }
    coloringSelect.value = state.coloring;
    coloringLabel.append(coloringSelect);
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
    button('Whole set', () => (state.julia ? setWindow({re: 0, im: 0}, JULIA_WIDTH, null) : show(EXAMPLES[0])), true);
    const planeButton = button('Switch to Julia set', () => (state.julia ? leaveJulia(state.left) : enterJulia()));
    controls.append(exampleLabel, coloringLabel, buttons);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view zoom-view');
    view.tabIndex = 0;
    view.setAttribute('role', 'img');
    const describeView = () => view.setAttribute('aria-label', `Zoomable picture of ${state.julia ? 'a filled Julia set'
      : 'the Mandelbrot set'}. Arrow keys move the window, plus and minus zoom in and out; the status below gives `
      + 'the window.');
    describeView();
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
    const fullWidth = () => (state.julia ? JULIA_WIDTH : FULL_WIDTH);
    const magnification = () => fullWidth() / state.width;
    // The budget for the magnification; a Julia set keeps at least that of the window it came from.
    const budget = () => Math.max(kit.iterationBudget(FULL_WIDTH / magnification()), state.julia ? state.juliaBudget : 0);
    // Any radius of at least max(2, |c|) proves escape in a Julia set.
    const radius = () => (state.julia ? Math.max(RADIUS, Math.hypot(state.julia.re, state.julia.im) + 1) : RADIUS);
    const windowOf = () => ({left: state.centre.re - state.width / 2, top: state.centre.im + height() / 2,
      width: state.width, height: height()});
    // The parameter c under a canvas position (in canvas pixels).
    const pointAt = (x, y) => ({re: state.centre.re + (x / canvas.width - .5) * state.width,
      im: state.centre.im - (y / canvas.height - .5) * height()});
    const smallest = centre => minimumWidth(centre, canvas.width);

    function describe(seconds) {
      const atLimit = state.width <= smallest(state.centre) * 1.0001;
      const times = magnification();
      const shownMagnification = times >= 10 && times < 1e5 ? Math.round(times).toLocaleString('en') : magnitude(times);
      const plane = state.julia ? `Filled Julia set of <var>c</var> = ${format(state.julia, state.juliaDecimals)}`
        : 'Mandelbrot set';
      const coloring = kit.COLORINGS.find(([key]) => key === state.coloring)[1];
      let text = `${plane} · Center ${format(state.centre, decimalsFor(state.width))} · width ${magnitude(state.width)} · `
        + `magnification ${shownMagnification} · ${budget().toLocaleString('en')} iterations per pixel · ${coloring} · `
        + `R = ${formatNumber(radius(), 0)}${kit.coloringDetail(state.coloring)}.`;
      text += seconds === null ? ' Drawing…' : ` Drawn in ${formatNumber(seconds, 1)} s.`;
      if (seconds !== null && state.coloring === 'work' && state.data) text += ` ${kit.workSummary(state.data)}`;
      if (atLimit) {
        text += ' Zooming stops here: neighboring pixels are now only a few representable numbers apart, so '
          + 'further zooming would show rounding errors rather than the set.';
      } else if (state.width < 100 * smallest(state.centre)) {
        text += ' This is close to the limit of the computer’s arithmetic.';
      }
      zoomInButton.disabled = atLimit;
      status.innerHTML = text;  // built only from numbers formatted above
    }

    // At the size the screen calls for (AtlasKit.fitCanvas), a preview at a quarter of the
    // resolution, scaled up, then the full picture.
    async function render() {
      const request = ++generation;
      const isCurrent = () => request === generation;
      if (kit.fitCanvas(canvas, WIDTH, HEIGHT)) {
        preview.width = canvas.width / PREVIEW;
        preview.height = canvas.height / PREVIEW;
      }
      state.data = null;
      describe(null);
      const started = performance.now();
      const coloring = state.coloring;
      state.drawingHas = kit.numbersFor(coloring);
      const pass = (width, height) => kit.orbitPass(windowOf(), state.julia, budget(), radius(), width, height,
        isCurrent, {coloring});
      const quick = await pass(preview.width, preview.height);
      if (!quick) return;
      kit.paintOrbits(previewContext, quick, state.coloring);
      context.imageSmoothingEnabled = true;
      context.drawImage(preview, 0, 0, canvas.width, canvas.height);
      const data = await pass(canvas.width, canvas.height);
      if (!data) return;
      state.data = data;
      state.seconds = (performance.now() - started) / 1000;
      kit.paintOrbits(context, data, state.coloring);
      describe(state.seconds);
    }

    // Changing the coloring repaints the finished picture, unless the picture, finished or still
    // being drawn, lacks numbers the coloring needs; a picture being drawn gets the coloring when done.
    coloringSelect.addEventListener('change', () => {
      state.coloring = coloringSelect.value;
      if (!kit.canPaint(state.data ? state.data.has : state.drawingHas, state.coloring)) {
        render();
        return;
      }
      if (state.data) kit.paintOrbits(context, state.data, state.coloring);
      describe(state.data ? state.seconds : null);
    });

    // Shows the old picture moved and scaled at once, while the new one is drawn.
    function transformPicture(dx, dy, scale) {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      context.fillStyle = '#091320';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(copy, dx, dy, canvas.width * scale, canvas.height * scale);
    }

    function setWindow(centre, width, picture) {
      const limited = Math.max(width, smallest(centre));
      state.centre = centre;
      state.width = Math.min(limited, 4 * fullWidth());
      const example = !state.julia && EXAMPLES.find(([, , re, im, w]) => re === centre.re && im === centre.im
        && w === state.width);
      select.value = example ? example[0] : 'custom';
      if (picture) transformPicture(...picture);
      render();
    }

    // Switches between the planes; the other plane's picture is not moved or scaled into the new one.
    function switchPlane(julia) {
      state.julia = julia;
      planeButton.textContent = julia ? 'Switch back to last Mandelbrot set' : 'Switch to Julia set';
      describeView();
      context.fillStyle = '#091320';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    // The filled Julia set of the parameter at the centre, whole.
    function enterJulia() {
      state.left = {centre: state.centre, width: state.width};
      state.juliaBudget = budget();
      state.juliaDecimals = decimalsFor(state.width);
      switchPlane(state.centre);
      setWindow({re: 0, im: 0}, JULIA_WIDTH, null);
    }

    // Back to the parameter plane, on the window `to`.
    function leaveJulia(to) {
      switchPlane(null);
      setWindow(to.centre, to.width, null);
    }

    // Zooms by `factor` (below 1 zooms in) keeping the point `fixed` in place.
    function zoomAt(fixed, factor) {
      const width = Math.max(state.width * factor, smallest(state.centre));
      const actual = width / state.width;
      const centre = {re: fixed.re + (state.centre.re - fixed.re) * actual, im: fixed.im + (state.centre.im - fixed.im) * actual};
      const scale = 1 / actual;
      const fixedX = (fixed.re - state.centre.re) / state.width * canvas.width + canvas.width / 2;
      const fixedY = (state.centre.im - fixed.im) / height() * canvas.height + canvas.height / 2;
      setWindow(centre, width, [fixedX - fixedX * scale, fixedY - fixedY * scale, scale]);
    }

    function show([, , re, im, width]) {
      setWindow({re, im}, width, null);
    }

    // --- input ---------------------------------------------------------------

    // The windows are windows of the Mandelbrot set: choosing one leaves a Julia set.
    select.addEventListener('change', () => {
      const example = EXAMPLES.find(([key]) => key === select.value);
      if (!example) return;
      if (state.julia) leaveJulia({centre: {re: example[2], im: example[3]}, width: example[4]});
      else show(example);
    });

    // Positions are measured against the view, not the canvas: while dragging,
    // the canvas itself is shifted with a CSS transform.
    const toCanvas = event => {
      const box = view.getBoundingClientRect();
      return {x: (event.clientX - box.left) / box.width * canvas.width,
        y: (event.clientY - box.top) / box.height * canvas.height, scale: canvas.width / box.width};
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
        setWindow({re: state.centre.re - dx / canvas.width * state.width,
          im: state.centre.im + dy / canvas.height * height()},
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
          state.width, [-right * PAN_STEP * canvas.width, up * PAN_STEP * state.width / height() * canvas.height, 1]);
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

    // Only the page's first viewer answers to #zoom= links, which are windows of the Mandelbrot set.
    const linkable = figure === document.querySelector('figure[data-widget="zoom"]');
    const showLinked = () => {
      const linked = linkable && linkedWindow();
      if (!linked) return false;
      if (state.julia) leaveJulia(linked);
      else setWindow(linked.centre, linked.width, null);
      // After the figure is revealed: it is still hidden while being built.
      requestAnimationFrame(() => figure.scrollIntoView({block: 'start'}));
      return true;
    };
    if (linkable) window.addEventListener('hashchange', showLinked);
    if (!showLinked()) render();
  });
})();
