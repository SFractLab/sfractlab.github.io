/* Interactive figure: one computation of the Mandelbrot set, colored seven ways.

   Every pixel's critical orbit is followed once, with the derivative with
   respect to c, until |z| exceeds the chosen escape radius R or the
   iteration budget is used up: the pass of AtlasKit.orbitPass, on the
   background threads, in strips of rows. The modes are AtlasKit's
   colorings, which only color the numbers the pass keeps; atlas-kit.js
   describes them. Clicking a pixel inspects its orbit. Built by
   AtlasKit.setUp for every <figure data-widget="render-modes">; data-mode
   chooses the first mode. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber, stripeAddend, stripeAverage, STRIPE_DENSITY} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const DIGITS_RADIUS = 1e6;  // the inspector reads angle digits past this radius

  const MODES = kit.COLORINGS;
  const RADII = [2, 16, 1000];
  const WINDOWS = [
    ['whole', 'The whole set', -0.7, 0, 3.2],
    ['seahorse', 'Seahorse valley', -0.75, 0.09, 0.08],
    ['tip-i', 'Around c = i', 0, 1, 0.14],
    ['elephant', 'Elephant valley', 0.2925, 0.0145, 0.012],
  ];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // A number for the readout: plain from 0.001 to 100 000, otherwise "1.2 × 10⁻¹⁶".
  function number(x, digits = 3) {
    if (x === 0) return '0';
    if (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e5) return formatNumber(x, digits);
    const exponent = Math.floor(Math.log10(Math.abs(x)));
    return `${formatNumber(x / 10 ** exponent, 2)} × 10<sup>${exponent < 0 ? '−' : ''}${Math.abs(exponent)}</sup>`;
  }

  kit.setUp('render-modes', (figure) => {
    figure.classList.add('widget-plate');
    const state = {
      mode: MODES.some(([key]) => key === figure.dataset.mode) ? figure.dataset.mode : 'smooth',
      radius: 1000,
      window: WINDOWS[0],
      data: null,
      picked: null,
    };
    let generation = 0;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    function select(label, options, value, onChange) {
      const wrapper = element('label', null, label);
      const node = element('select');
      for (const [key, name] of options) {
        const option = element('option', null, name);
        option.value = key;
        node.append(option);
      }
      node.value = value;
      node.addEventListener('change', () => onChange(node.value));
      wrapper.append(node);
      controls.append(wrapper);
      return node;
    }
    select('Coloring', MODES, state.mode, value => {
      state.mode = value;
      paint();
    });
    select('Escape radius R', RADII.map(r => [String(r), String(r)]), String(state.radius), value => {
      state.radius = Number(value);
      compute();
    });
    select('Window', WINDOWS.map(([key, name]) => [key, name]), state.window[0], value => {
      state.window = WINDOWS.find(([key]) => key === value);
      state.picked = null;
      overlay.replaceChildren();
      inspector.textContent = 'Click a pixel to inspect its orbit.';
      compute();
    });

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay'});
    overlay.setAttribute('aria-hidden', 'true');
    view.setAttribute('role', 'img');
    view.setAttribute('aria-label', 'Picture of the Mandelbrot set in the chosen coloring. Click a pixel, or use the '
      + 'arrow keys, to inspect its orbit; the text below describes the picture and the inspected pixel.');
    view.append(canvas, overlay);
    const status = element('p', 'plate-verdict render-status');
    status.setAttribute('aria-live', 'polite');
    const inspector = element('p', 'plate-verdict render-inspector');
    inspector.setAttribute('aria-live', 'polite');
    inspector.textContent = 'Click a pixel to inspect its orbit.';

    const windowView = () => {
      const [, , re, im, width] = state.window;
      const height = width * HEIGHT / WIDTH;
      return {left: re - width / 2, top: im + height / 2, width, height};
    };

    // --- the pass ------------------------------------------------------------

    async function compute() {
      const request = ++generation;
      const v = windowView();
      status.textContent = 'Computing…';
      // The picture is painted as strips arrive, down to the first one still missing.
      const data = await kit.orbitPass(v, null, kit.iterationBudget(v.width), state.radius, WIDTH, HEIGHT,
        () => request === generation, {onStrip: partial => {
          state.data = partial;
          paintSoon();
        }});
      if (!data) return;
      state.data = data;
      paint();
      if (state.picked) inspect(state.picked);
    }

    // Paints at the next animation frame, once however many strips arrive before it.
    let paintPending = false;
    function paintSoon() {
      if (paintPending) return;
      paintPending = true;
      requestAnimationFrame(() => {
        paintPending = false;
        if (state.data.rows < HEIGHT) paint();
      });
    }

    // --- coloring ------------------------------------------------------------

    function paint() {
      if (!state.data) return;
      kit.paintOrbits(context, state.data, state.mode);
      describe();
    }

    function describe() {
      const data = state.data;
      const [, name] = state.window;
      const coloring = MODES.find(([key]) => key === state.mode)[1];
      let text = `${coloring} · ${name} · ${data.budget.toLocaleString('en')} iterations per pixel at most · `
        + `R = ${data.radius}${kit.coloringDetail(state.mode)}.`;
      if (data.rows < HEIGHT) {
        status.innerHTML = `${text} Computing…`;  // built from numbers and fixed text
        return;
      }
      text += ` Computed in ${formatNumber(data.seconds, 2)} s.`;
      if (state.mode === 'work') text += ` ${kit.workSummary(data)}`;
      status.innerHTML = text;  // built from numbers and fixed text
    }

    // --- inspector -----------------------------------------------------------

    function inspect({col, row}) {
      const v = windowView();
      const c = {re: v.left + (col + .5) * v.width / WIDTH, im: v.top - (row + .5) * v.height / HEIGHT};
      overlay.replaceChildren();
      kit.svg('circle', {cx: col + .5, cy: row + .5, r: 7, class: 'orbit-marker'}, overlay);
      const budget = kit.iterationBudget(v.width);
      const where = `<var>c</var> ≈ ${format(c, 4 + Math.max(0, Math.ceil(-Math.log10(v.width))))}`;
      if (kit.inCardioidOrPeriodTwoDisk(c.re, c.im)) {
        inspector.innerHTML = `${where} lies in the main cardioid or the period-two disk, by the exact tests: it is in `
          + 'the Mandelbrot set, and no iteration was needed.';
        return;
      }
      let zx = 0, zy = 0, dx = 0, dy = 0, n = 0;
      const limit = state.radius * state.radius;
      let escapedAt = 0, logSize = 0;
      let farAt = 0, farLog = 0, farDerivative = 0;  // at R = 1000, for the potential and distance
      let stripeSum = 0, addend = 0, nearest = Infinity, nearestAt = 0;
      while (n < budget + 100) {
        const ndx = 2 * (zx * dx - zy * dy) + 1;
        dy = 2 * (zx * dy + zy * dx);
        dx = ndx;
        const nx = zx * zx - zy * zy + c.re;
        zy = 2 * zx * zy + c.im;
        zx = nx;
        n++;
        if (!escapedAt) {
          addend = stripeAddend(zx, zy);
          stripeSum += addend;
          if (Math.min(Math.abs(zx), Math.abs(zy)) < nearest) {
            nearest = Math.min(Math.abs(zx), Math.abs(zy));
            nearestAt = n;
          }
        }
        if (!escapedAt && zx * zx + zy * zy > limit) {
          escapedAt = n;
          logSize = .5 * Math.log(zx * zx + zy * zy);
        }
        if (!farAt && zx * zx + zy * zy > 1e6) {
          farAt = n;
          farLog = .5 * Math.log(zx * zx + zy * zy);
          farDerivative = Math.sqrt(dx * dx + dy * dy);
        }
        if (zx * zx + zy * zy > DIGITS_RADIUS * DIGITS_RADIUS) break;
        if (!escapedAt && n >= budget) break;
      }
      if (!escapedAt) {
        inspector.innerHTML = `${where} has not escaped within ${budget.toLocaleString('en')} steps. That suggests, `
          + 'but does not prove, that it is in the Mandelbrot set.';
        return;
      }
      // Digits of the external angle: the sign of Im z_k is the k-th binary digit.
      const digits = [];
      const first = n;
      while (digits.length < 8 && Number.isFinite(zx) && Number.isFinite(zy) && zx * zx + zy * zy < 1e300) {
        digits.push(zy > 0 ? 0 : 1);
        const nx = zx * zx - zy * zy + c.re;
        zy = 2 * zx * zy + c.im;
        zx = nx;
      }
      // The potential and the distance estimate always use R = 1000, where they are reliable.
      const smooth = escapedAt + 1 - Math.log2(logSize);
      const farSmooth = farAt + 1 - Math.log2(farLog);
      const b = 2 * Math.exp(farLog) * farLog / farDerivative;
      inspector.innerHTML = `${where} escapes at step <var>n</var> = ${escapedAt} (<var>R</var> = ${state.radius}), `
        + `with smooth count ν = ${formatNumber(smooth, 3)}. With <var>R</var> = 1000, the potential is `
        + `<var>G</var><sub>M</sub>(<var>c</var>) ≈ 2<sup>2 − ν</sup> = ${number(2 ** (2 - farSmooth))}, and the distance `
        + `estimate <var>b</var> = ${number(b)} puts the distance to the set between about ${number(b / 4)} and `
        + `${number(b)}. `
        + `Binary digits ${first} to ${first + digits.length - 1} of the external angle: ${digits.join('')}. `
        + `Stripe average (<var>s</var> = ${STRIPE_DENSITY}): ${formatNumber(stripeAverage(stripeSum, addend, escapedAt,
          state.radius, logSize), 3)}; closest approach to the axes: ${number(nearest)}, at step ${nearestAt}.`;
    }

    view.addEventListener('click', event => {
      const box = view.getBoundingClientRect();
      const col = Math.min(WIDTH - 1, Math.max(0, Math.floor((event.clientX - box.left) / box.width * WIDTH)));
      const row = Math.min(HEIGHT - 1, Math.max(0, Math.floor((event.clientY - box.top) / box.height * HEIGHT)));
      state.picked = {col, row};
      inspect(state.picked);
    });
    // Keyboard: the arrow keys move the inspected pixel by 8 pixels (1 with Shift).
    view.tabIndex = 0;
    view.addEventListener('keydown', event => {
      const moves = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
      if (!moves[event.key]) return;
      event.preventDefault();
      const step = event.shiftKey ? 1 : 8;
      const {col, row} = state.picked || {col: WIDTH / 2, row: HEIGHT / 2};
      state.picked = {col: Math.min(WIDTH - 1, Math.max(0, col + moves[event.key][0] * step)),
        row: Math.min(HEIGHT - 1, Math.max(0, row + moves[event.key][1] * step))};
      inspect(state.picked);
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, status, inspector]) figure.insertBefore(part, caption);
    compute();
  });
})();
