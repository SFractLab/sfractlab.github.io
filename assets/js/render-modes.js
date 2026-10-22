/* Interactive figure: one computation of the Mandelbrot set, colored seven ways.

   Every pixel's critical orbit is followed once, with the derivative with
   respect to c, until |z| exceeds the chosen escape radius R or the
   iteration budget is used up. The pass keeps, per pixel, the escape step n,
   log|z_n|, the sign of Im z_n, |z'_n|, the stripe average, the orbit's
   closest approach to the axes and the number of steps spent. The modes
   only color these numbers differently:
     escape    bands by the escape step n
     smooth    the smooth count ν = n + 1 − log₂ log|z_n|
     binary    the sign of Im z_n: the n-th binary digit of the external angle
     distance  the distance estimate b = 2|z_n| log|z_n| / |z'_n|, with
               pixels where b is below the pixel size drawn as the set
     stripe    Härkönen's stripe average: the mean of ½ sin(s·arg z_k) + ½
               over z_1 … z_n, interpolated between the means up to z_(n−1)
               and z_n by the fractional part of the smooth count
     trap      an orbit trap: the orbit's closest approach to the real and
               imaginary axes, Pickover's cross, on a logarithmic scale
     work      the steps each pixel cost, with the cardioid and period-two
               tests and exact periodicity checking
   The pass runs on the background threads of AtlasKit.workerPool, in strips
   of rows. Clicking a pixel inspects its orbit. Built by AtlasKit.setUp for
   every <figure data-widget="render-modes">; data-mode chooses the first mode. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const ROWS_PER_TASK = 16;  // a strip of the pass
  const DIGITS_RADIUS = 1e6;  // the inspector reads angle digits past this radius

  const MODES = [
    ['escape', 'Escape time'],
    ['smooth', 'Smooth count'],
    ['binary', 'Binary decomposition'],
    ['distance', 'Distance estimate'],
    ['stripe', 'Stripe average'],
    ['trap', 'Orbit trap'],
    ['work', 'Work per pixel'],
  ];
  const STRIPE_DENSITY = 5;  // s, an integer: other values make the stripes jump where arg z does
  const TRAP_RANGE = 4;      // the trap's color runs over distances 1 to 10⁻⁴
  const RADII = [2, 16, 1000];
  const WINDOWS = [
    ['whole', 'The whole set', -0.7, 0, 3.2],
    ['seahorse', 'Seahorse valley', -0.75, 0.09, 0.08],
    ['tip-i', 'Around c = i', 0, 1, 0.14],
    ['elephant', 'Elephant valley', 0.2925, 0.0145, 0.012],
  ];

  // Colors on the dark plate: the interior, a cyclic palette for counts, and
  // the two colors of binary decomposition.
  const INTERIOR = [9, 19, 32];
  const PALETTE = [[13, 26, 45], [27, 75, 119], [30, 135, 151], [227, 232, 196], [236, 166, 100], [13, 26, 45]];
  const CREAM = [244, 236, 214];
  const NIGHT = [20, 42, 72];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // A cyclic position (any real number) as a palette color.
  function cyclic(position) {
    const t = ((position % 1) + 1) % 1 * 5;
    const index = Math.min(4, Math.floor(t));
    let blend = t - index;
    blend = blend * blend * (3 - 2 * blend);
    return PALETTE[index].map((value, k) => value * (1 - blend) + PALETTE[index + 1][k] * blend);
  }

  // A number for the readout: plain from 0.001 to 100 000, otherwise "1.2 × 10⁻¹⁶".
  function number(x, digits = 3) {
    if (x === 0) return '0';
    if (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e5) return formatNumber(x, digits);
    const exponent = Math.floor(Math.log10(Math.abs(x)));
    return `${formatNumber(x / 10 ** exponent, 2)} × 10<sup>${exponent < 0 ? '−' : ''}${Math.abs(exponent)}</sup>`;
  }

  // The stripe addend ½ sin(s·arg z) + ½ of one orbit point, as ½ Im((z/|z|)^s) + ½: s
  // multiplications cost less than atan2 and sin at every step of every pixel.
  function stripeAddend(x, y) {
    const r = Math.sqrt(x * x + y * y);
    const ux = x / r, uy = y / r;
    let px = ux, py = uy;
    for (let k = 1; k < STRIPE_DENSITY; k++) {
      const next = px * ux - py * uy;
      py = px * uy + py * ux;
      px = next;
    }
    return .5 * py + .5;
  }

  // Härkönen's interpolation between the stripe means S_(n−1) and S_n, from the sum of the
  // addends of z_1 … z_n, the last of them, and the fractional part d of the smooth count.
  function stripeAverage(sum, last, n, radius, logSize) {
    const full = sum / n;
    const before = n > 1 ? (sum - last) / (n - 1) : full;
    const d = Math.min(1, Math.max(0, 1 + Math.log2(Math.log(radius) / logSize)));
    return d * full + (1 - d) * before;
  }

  // Whether c lies in the main cardioid or the period-two disk (exact tests).
  function inCardioidOrDisk(x, y) {
    const q = (x - .25) ** 2 + y * y;
    return q * (q + x - .25) < .25 * y * y || (x + 1) ** 2 + y * y < .0625;
  }

  // The pass over rows firstRow … firstRow + rows − 1 of a picture of width × height pixels over
  // `view`, with escape radius `radius`: per pixel the numbers listed above, in typed arrays. Runs
  // in a worker.
  function passRows({view, budget, radius, width, height, firstRow, rows}) {
    const size = width * rows;
    const limit = radius * radius;
    const strip = {
      steps: new Int32Array(size),      // escape step, or −1 if the orbit did not escape
      logSize: new Float64Array(size),  // log|z_n| at escape
      upper: new Uint8Array(size),      // 1 if Im z_n > 0 at escape
      derivative: new Float64Array(size),
      stripe: new Float32Array(size),   // the stripe average, from 0 to 1
      trap: new Float32Array(size),     // the orbit's closest approach to the axes
      spent: new Int32Array(size),      // steps computed, with the shortcuts
      shortcut: new Uint8Array(size),   // 1 if a shortcut decided the pixel
    };
    for (let row = firstRow; row < firstRow + rows; row++) {
      const cy = view.top - (row + .5) * view.height / height;
      for (let col = 0; col < width; col++) {
        const cx = view.left + (col + .5) * view.width / width;
        const index = (row - firstRow) * width + col;
        if (inCardioidOrDisk(cx, cy)) {
          strip.steps[index] = -1;
          strip.shortcut[index] = 1;
          continue;
        }
        let zx = 0, zy = 0, dx = 0, dy = 0;
        let keptX = 0, keptY = 0, keepAt = 8;
        let n = 0;
        let escaped = false;
        let stripeSum = 0, addend = 0, nearest = Infinity;
        while (n < budget) {
          const ndx = 2 * (zx * dx - zy * dy) + 1;
          dy = 2 * (zx * dy + zy * dx);
          dx = ndx;
          const nx = zx * zx - zy * zy + cx;
          zy = 2 * zx * zy + cy;
          zx = nx;
          n++;
          addend = stripeAddend(zx, zy);
          stripeSum += addend;
          nearest = Math.min(nearest, Math.abs(zx), Math.abs(zy));
          if (zx * zx + zy * zy > limit) {
            escaped = true;
            break;
          }
          if (zx === keptX && zy === keptY) {
            strip.shortcut[index] = 1;  // an exact repeat: the orbit never escapes
            break;
          }
          if (n === keepAt) {
            keptX = zx;
            keptY = zy;
            keepAt *= 2;
          }
        }
        strip.spent[index] = n;
        if (escaped) {
          strip.steps[index] = n;
          strip.logSize[index] = .5 * Math.log(zx * zx + zy * zy);
          strip.upper[index] = zy > 0 ? 1 : 0;
          strip.derivative[index] = Math.sqrt(dx * dx + dy * dy);
          strip.stripe[index] = stripeAverage(stripeSum, addend, n, radius, strip.logSize[index]);
          strip.trap[index] = nearest;
        } else {
          strip.steps[index] = -1;
        }
      }
    }
    return strip;
  }

  const pool = kit.workerPool(passRows,
    {helpers: [stripeAddend, stripeAverage, inCardioidOrDisk], constants: {STRIPE_DENSITY}});

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
      const budget = kit.iterationBudget(v.width);
      const size = WIDTH * HEIGHT;
      const data = {
        view: v, budget, radius: state.radius, rows: 0,
        steps: new Int32Array(size), logSize: new Float64Array(size), upper: new Uint8Array(size),
        derivative: new Float64Array(size), stripe: new Float32Array(size), trap: new Float32Array(size),
        spent: new Int32Array(size), shortcut: new Uint8Array(size),
      };
      state.data = data;
      status.textContent = 'Computing…';
      const tasks = [];
      for (let firstRow = 0; firstRow < HEIGHT; firstRow += ROWS_PER_TASK) {
        tasks.push({view: v, budget, radius: state.radius, width: WIDTH, height: HEIGHT, firstRow,
          rows: Math.min(ROWS_PER_TASK, HEIGHT - firstRow)});
      }
      // Strips arrive in any order; data.rows counts the rows above the first missing one.
      const arrived = new Set();
      const started = performance.now();
      const done = await pool.run(tasks, () => request === generation, (task, strip) => {
        for (const [key, values] of Object.entries(strip)) data[key].set(values, task.firstRow * WIDTH);
        arrived.add(task.firstRow);
        while (arrived.has(data.rows)) data.rows = Math.min(HEIGHT, data.rows + ROWS_PER_TASK);
        paintSoon();
      });
      if (!done) return;
      data.seconds = (performance.now() - started) / 1000;
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

    function color(data, index) {
      const n = data.steps[index];
      if (state.mode === 'work') {
        const t = Math.log1p(data.spent[index]) / Math.log1p(data.budget);
        return t === 0 ? INTERIOR : cyclic(.62 * t);
      }
      if (n < 0) return INTERIOR;
      switch (state.mode) {
        case 'escape':
          return cyclic(n * .05);
        case 'smooth': {
          const smooth = n + 1 - Math.log2(Math.max(1e-300, data.logSize[index]));
          return cyclic(smooth * .05);
        }
        case 'binary':
          return data.upper[index] ? CREAM : NIGHT;
        case 'stripe': {
          // Stretched over the values in the picture: deep in, the stripes span a narrow range.
          const [low, high] = data.stripeRange;
          return cyclic(.62 * Math.min(1, Math.max(0, (data.stripe[index] - low) / (high - low))));
        }
        case 'trap': {
          const t = Math.min(1, Math.max(0, -Math.log10(data.trap[index]) / TRAP_RANGE));
          return cyclic(.62 * t);
        }
        default: {  // distance
          const b = 2 * Math.exp(data.logSize[index]) * data.logSize[index] / data.derivative[index];
          const pixel = data.view.width / WIDTH;
          if (b < pixel) return CREAM;
          const t = Math.min(1, Math.log(b / pixel) / Math.log(400));
          return [13 + 40 * t, 26 + 90 * t, 45 + 110 * t];
        }
      }
    }

    // The 1st and 99th percentiles of the stripe averages computed so far, from every 7th pixel.
    function stripeRange(data) {
      const values = [];
      for (let index = 0; index < data.rows * WIDTH; index += 7) {
        if (data.steps[index] >= 0) values.push(data.stripe[index]);
      }
      if (values.length < 2) return [0, 1];
      values.sort((a, b) => a - b);
      const low = values[Math.floor(.01 * (values.length - 1))], high = values[Math.ceil(.99 * (values.length - 1))];
      return high > low ? [low, high] : [0, 1];
    }

    function paint() {
      const data = state.data;
      if (!data) return;
      if (state.mode === 'stripe') data.stripeRange = stripeRange(data);
      const image = context.createImageData(WIDTH, HEIGHT);
      for (let index = 0; index < data.rows * WIDTH; index++) {
        const [r, g, b] = color(data, index);
        image.data[4 * index] = r;
        image.data[4 * index + 1] = g;
        image.data[4 * index + 2] = b;
        image.data[4 * index + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      describe();
    }

    function describe() {
      const data = state.data;
      const [, name] = state.window;
      let text = `${name} · ${data.budget.toLocaleString('en')} iterations per pixel at most · R = ${data.radius}`;
      if (state.mode === 'stripe') text += ` · stripe density <var>s</var> = ${STRIPE_DENSITY}`;
      if (state.mode === 'trap') text += ' · trap: the real and imaginary axes';
      text += '.';
      if (data.rows < HEIGHT) {
        status.textContent = `${text} Computing…`;
        return;
      }
      text += ` Computed in ${formatNumber(data.seconds, 2)} s.`;
      if (state.mode === 'work') {
        let spent = 0, without = 0;
        for (let index = 0; index < WIDTH * HEIGHT; index++) {
          spent += data.spent[index];
          without += data.steps[index] < 0 ? data.budget : data.steps[index];
        }
        text += ` The picture took ${spent.toLocaleString('en')} steps; without the cardioid and period-two tests and `
          + `the periodicity check it would have taken ${without.toLocaleString('en')}, `
          + `${formatNumber(without / Math.max(1, spent), without < 10 * spent ? 2 : 1)} times as many.`;
      }
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
      if (inCardioidOrDisk(c.re, c.im)) {
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
