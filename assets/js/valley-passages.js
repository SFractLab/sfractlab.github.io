/* Interactive figure: deep in seahorse valley, colored by escape step or by passages.

   Near −3/4 the orbit of 0 creeps past the point −1/2 through a narrow gate; one passage takes
   about π/|c + 3/4| steps. A parameter outside the set may pass once and escape, or come back for
   a second, third, … passage first, so its escape step lies close to a multiple of that time.
   The pass is AtlasKit.orbitPass, on the background threads, in strips of rows. The escape-time
   coloring is AtlasKit's bands; the passage coloring gives each multiple a color of its own.
   Built by AtlasKit.setUp for every <figure data-widget="passages">; data-coloring chooses the
   first coloring ("escape" or "passages"). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const RADIUS = 2;
  const BUDGET = 3000;  // six passages at these heights, where one takes about 494 steps
  // Key, name, center, width and the width as the status line writes it.
  const WINDOWS = [
    ['both', 'Both sides of the valley', -0.7500234, 0.00635796, 0.000139, '1.39 × 10⁻⁴'],
    ['disk', 'Beside the period-two disk', -0.7500667, 0.0063811, 0.0000533, '5.33 × 10⁻⁵'],
    ['cardioid', 'Beside the main cardioid', -0.7499834, 0.0063674, 0.0000533, '5.33 × 10⁻⁵'],
  ];
  const COLORINGS = [['escape', 'Escape time'], ['passages', 'Passages']];
  // One passage, two, three, four, five or more; the class names are the legend's swatches.
  const PASSAGE_COLORS = [[227, 232, 196], [236, 166, 100], [30, 135, 151], [27, 75, 119], [125, 132, 140]];
  const PASSAGE_NAMES = ['one passage', 'two', 'three', 'four', 'five or more'];
  const INTERIOR = [9, 19, 32];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The number of passages for each pixel of a pass: its escape step in units of the passage
  // time at that pixel, rounded; 0 where it has not escaped.
  function passages(data) {
    const counts = new Uint8Array(data.width * data.height);
    const {left, top, width, height} = data.view;
    for (let y = 0; y < data.rows; y++) {
      const im = top - (y + .5) * height / data.height;
      for (let x = 0; x < data.width; x++) {
        const index = y * data.width + x;
        const n = data.steps[index];
        if (n < 0) continue;
        const re = left + (x + .5) * width / data.width;
        const time = Math.PI / Math.hypot(re + .75, im);
        counts[index] = Math.max(1, Math.min(PASSAGE_COLORS.length, Math.round(n / time)));
      }
    }
    return counts;
  }

  kit.setUp('passages', (figure) => {
    figure.classList.add('widget-plate');
    const first = COLORINGS.find(([key]) => key === figure.dataset.coloring);
    const state = {window: WINDOWS[0], coloring: (first || COLORINGS[0])[0], data: null};
    let generation = 0;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const windowLabel = element('label', null, 'Window');
    const windowSelect = element('select');
    for (const [key, name] of WINDOWS) {
      const option = element('option', null, name);
      option.value = key;
      windowSelect.append(option);
    }
    windowSelect.addEventListener('change', () => {
      state.window = WINDOWS.find(([key]) => key === windowSelect.value);
      show();
    });
    windowLabel.append(windowSelect);

    const buttons = element('div', 'plate-buttons');
    const coloringButtons = COLORINGS.map(([key, name]) => {
      const node = element('button', null, name);
      node.type = 'button';
      node.dataset.coloring = key;
      node.addEventListener('click', () => setColoring(key));
      buttons.append(node);
      return node;
    });
    controls.append(windowLabel, buttons);

    // The chosen coloring's button is filled, the other quiet.
    function setColoring(key) {
      state.coloring = key;
      for (const node of coloringButtons) {
        const chosen = node.dataset.coloring === key;
        node.classList.toggle('plate-button-quiet', !chosen);
        node.setAttribute('aria-pressed', String(chosen));
      }
      legend.hidden = key !== 'passages';
      show();
    }

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Escape-time picture of seahorse valley deep down, between the period-two '
      + 'disk on the left and the main cardioid on the right; the text below names the window and gives the '
      + 'share of pixels for each number of passages.');
    view.append(canvas);
    const legend = element('p', 'plate-caption passages-legend');
    legend.innerHTML = PASSAGE_NAMES.map((name, k) => `<span class="passages-swatch passages-${k + 1}"></span> ${name}`)
      .join(' ') + ' <span class="passages-swatch passages-0"></span> not escaped';
    const status = element('p', 'plate-verdict passages-status');
    status.setAttribute('aria-live', 'polite');
    // Strips are painted here first, then copied onto the picture down to the first one missing,
    // so that the rows still being computed keep the previous picture.
    const buffer = element('canvas');
    const bufferContext = buffer.getContext('2d');

    // The window's name, center and width, so that a printed figure says where it is.
    const place = () => {
      const [, name, re, im, , width] = state.window;
      return `${name}, center ${format({re, im}, 8)}, width ${width}`;
    };

    const windowView = () => {
      const [, , re, im, width] = state.window;
      const height = width * HEIGHT / WIDTH;
      return {left: re - width / 2, top: im + height / 2, width, height};
    };

    // --- the pass ------------------------------------------------------------

    async function show() {
      const request = ++generation;
      const resized = kit.fitCanvas(canvas, WIDTH, HEIGHT);
      const data = state.data;
      if (data && !resized && data.window === state.window && data.width === canvas.width
        && data.height === canvas.height) {
        paint(data);
        describe(data);
        return;
      }
      if (!data || data.window !== state.window) context.clearRect(0, 0, canvas.width, canvas.height);
      status.textContent = `${place()}. Computing…`;
      const pass = await kit.orbitPass(windowView(), null, BUDGET, RADIUS, canvas.width, canvas.height,
        () => request === generation, {coloring: 'escape', onStrip: partial => paintSoon(partial)});
      if (!pass) return;
      pass.window = state.window;
      state.data = pass;
      paint(pass);
      describe(pass);
    }

    // Paints at the next animation frame, once however many strips arrive before it.
    let pending = null;
    function paintSoon(partial) {
      if (pending) {
        pending = partial;
        return;
      }
      pending = partial;
      requestAnimationFrame(() => {
        const latest = pending;
        pending = null;
        if (latest.rows < latest.height && latest.width === canvas.width) paint(latest);
      });
    }

    function paint(data) {
      if (buffer.width !== data.width || buffer.height !== data.height) {
        buffer.width = data.width;
        buffer.height = data.height;
      }
      if (state.coloring === 'escape') {
        kit.paintOrbits(bufferContext, data, 'escape');
      } else {
        const counts = passages(data);
        const image = bufferContext.createImageData(data.width, data.height);
        for (let index = 0; index < data.rows * data.width; index++) {
          const [r, g, b] = counts[index] ? PASSAGE_COLORS[counts[index] - 1] : INTERIOR;
          image.data.set([r, g, b, 255], 4 * index);
        }
        bufferContext.putImageData(image, 0, 0);
      }
      if (data.rows) context.drawImage(buffer, 0, 0, data.width, data.rows, 0, 0, data.width, data.rows);
    }

    function describe(data) {
      const counts = passages(data);
      const shares = new Array(PASSAGE_COLORS.length + 1).fill(0);
      for (const k of counts) shares[k]++;
      const percent = k => `${formatNumber(100 * shares[k] / counts.length, 1)}%`;
      const time = Math.round(Math.PI / Math.hypot(state.window[2] + .75, state.window[3]));
      status.textContent = `${place()} · iteration limit ${BUDGET.toLocaleString('en')} · one passage `
        + `about ${time} steps at the center. Escaped after one passage: ${percent(1)}; two: ${percent(2)}; `
        + `three: ${percent(3)}; four: ${percent(4)}; five or more: ${percent(5)}; not escaped (dark): ${percent(0)}.`;
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, legend, status]) figure.insertBefore(part, caption);
    setColoring(state.coloring);
    kit.whenResized(() => {
      if (!kit.fitsScreen(canvas, WIDTH, HEIGHT)) show();
    });
  });
})();
