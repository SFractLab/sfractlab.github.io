/* Interactive figure: the Mandelbrot set with different iteration limits.

   Every pixel's critical orbit is followed until |z| exceeds 2 or the limit is
   reached: the pass of AtlasKit.orbitPass, on the background threads, in
   strips of rows, colored in bands by the escape step (AtlasKit's escape-time
   coloring). Dark pixels have not escaped within the limit. A pass with a
   higher limit contains every lower one, so lowering the limit only repaints.
   Built by AtlasKit.setUp for every <figure data-widget="iteration-limit">;
   data-limit chooses the first limit. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const RADIUS = 2;
  const LIMITS = [20, 100, 300, 1000];
  const MAX_LIMIT = 10000;  // typed limits stop here, so that a picture takes at most a second or two
  const WINDOWS = [
    ['whole', 'The whole set', -0.7, 0, 3.2],
    ['seahorse', 'Seahorse valley', -0.7445, 0.12, 0.03],
    ['neck', 'The neck at −3/4', -0.75, 0.06, 0.12],
  ];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // A pass as it would have been with a lower limit: later escapes count as not escaped.
  function limited(data, limit) {
    if (limit >= data.budget) return data;
    return {...data, steps: data.steps.map(n => (n > limit ? -1 : n))};
  }

  kit.setUp('iteration-limit', (figure) => {
    figure.classList.add('widget-plate');
    const first = Math.round(Number(figure.dataset.limit));
    const state = {
      window: WINDOWS[0],
      limit: first >= 1 && first <= MAX_LIMIT ? first : LIMITS[1],
      data: null,  // the last finished pass, with the window it shows
    };
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

    const limitLabel = element('label', null, 'Iteration limit');
    const field = element('input');
    field.type = 'number';
    field.min = '1';
    field.max = String(MAX_LIMIT);
    field.step = '1';
    field.inputMode = 'numeric';
    field.setAttribute('aria-label', `Iteration limit, 1 to ${MAX_LIMIT.toLocaleString('en')}`);
    field.addEventListener('change', () => {
      const value = Number(field.value);
      if (field.value.trim() === '' || !Number.isFinite(value) || value < 1) {
        field.value = String(state.limit);
        return;
      }
      setLimit(Math.min(MAX_LIMIT, Math.round(value)));
    });
    limitLabel.append(field);

    const buttons = element('div', 'plate-buttons');
    const limitButtons = LIMITS.map(limit => {
      const node = element('button', null, limit.toLocaleString('en'));
      node.type = 'button';
      node.dataset.limit = String(limit);
      node.addEventListener('click', () => setLimit(limit));
      buttons.append(node);
      return node;
    });
    controls.append(windowLabel, limitLabel, buttons);

    // The chosen limit's button is filled, the others quiet; a typed limit leaves all quiet.
    function setLimit(limit) {
      state.limit = limit;
      field.value = String(limit);
      for (const node of limitButtons) {
        const chosen = Number(node.dataset.limit) === limit;
        node.classList.toggle('plate-button-quiet', !chosen);
        node.setAttribute('aria-pressed', String(chosen));
      }
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
    canvas.setAttribute('aria-label', 'Escape-time picture of the Mandelbrot set. Dark pixels have not escaped '
      + 'within the iteration limit; the text below names the window and the limit and says how many pixels are dark.');
    view.append(canvas);
    const status = element('p', 'plate-verdict limit-status');
    status.setAttribute('aria-live', 'polite');
    // Strips are painted here first, then copied onto the picture down to the first one missing,
    // so that the rows still being computed keep the previous picture.
    const buffer = element('canvas');
    const bufferContext = buffer.getContext('2d');

    // The window's name, center and width, so that a printed figure says where it is.
    const place = () => {
      const [, name, re, im, width] = state.window;
      return `${name}, center ${format({re, im}, 4)}, width ${formatNumber(width, 4)}`;
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
        && data.height === canvas.height && data.budget >= state.limit) {
        paint(data);
        describe(data);
        return;
      }
      if (!data || data.window !== state.window) context.clearRect(0, 0, canvas.width, canvas.height);
      status.textContent = `${place()} · iteration limit ${state.limit.toLocaleString('en')}. Computing…`;
      const pass = await kit.orbitPass(windowView(), null, state.limit, RADIUS, canvas.width, canvas.height,
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
      kit.paintOrbits(bufferContext, limited(data, state.limit), 'escape');
      if (data.rows) context.drawImage(buffer, 0, 0, data.width, data.rows, 0, 0, data.width, data.rows);
    }

    function describe(data) {
      let dark = 0;
      for (const n of data.steps) if (n < 0 || n > state.limit) dark++;
      const share = dark / data.steps.length;
      const verdict = share === 1 ? 'No pixel has escaped: the whole picture is dark.'
        : share === 0 ? 'Every pixel has escaped.'
          : `${formatNumber(Math.min(99.9, Math.max(.1, 100 * share)), 1)}% of the pixels have not escaped (dark).`;
      status.textContent = `${place()} · iteration limit ${state.limit.toLocaleString('en')} · `
        + `escape radius ${RADIUS}. ${verdict}`;
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, status]) figure.insertBefore(part, caption);
    setLimit(state.limit);
    kit.whenResized(() => {
      if (!kit.fitsScreen(canvas, WIDTH, HEIGHT)) show();
    });
  });
})();
