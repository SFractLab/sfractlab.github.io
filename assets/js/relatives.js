/* Interactive figure: relatives of the Mandelbrot set.

   Two planes, as in the explorer: the parameter plane of a family, colored by
   the fate of its critical orbit, and the dynamical plane of the parameter c
   chosen there. The families:
     power      z^d + c, d = 2 … 8: the Multibrot sets
     conjugate  z̄^d + c, d = 2 … 8: the tricorn and the multicorns
     ship       (|x| + i|y|)² + c: the Burning Ship
     newton     Newton's map for p_c(z) = (z − 1)(z² + z + c), whose free
                critical point is 0 (Curry, Garnett and Sullivan)
   In the first three, a pixel is dark if its orbit has not left the disk of
   radius max(2, |c|) within the budget; beyond that radius escape is certain,
   since every step has |step(z)| = |z|^d. For Newton's method, a pixel is
   colored by the root its orbit comes within 10⁻⁶ of, and dark if it reaches
   no root within the budget.

   Built by AtlasKit.setUp for every <figure data-widget="relatives">.
   data-family and data-degree choose the family, data-c ("re,im") the first
   parameter, and data-window ("re,im,width") the first window of the
   parameter plane; without it the whole plane is shown. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber, subscript} = kit;

  const WIDTH = 480;
  const HEIGHT = 360;
  const ROWS_PER_FRAME = 24;
  const JULIA_BUDGET = 250;
  const NEWTON_BUDGET = 120;
  const CLOSE = 1e-12;          // |z − root|² below which Newton's method has found the root
  const INTERIOR = [9, 19, 32];
  const ROOT_COLORS = [[95, 199, 207], [249, 197, 121], [232, 138, 122]];

  const FAMILIES = [
    ['power', 'Multibrot: zᵈ + c'],
    ['conjugate', 'Tricorn and multicorns: z̄ᵈ + c'],
    ['ship', 'Burning Ship: (|x| + i|y|)² + c'],
    ['newton', 'Newton’s method for (z − 1)(z² + z + c)'],
  ];
  const DEGREES = [2, 3, 4, 5, 6, 7, 8];

  // The whole parameter plane of each family, as a centre and a width.
  function wholeWindow(family, degree) {
    if (family === 'newton') return {re: 0, im: 0, width: 5.4};
    if (family === 'ship') return {re: -.45, im: -.5, width: 3.4};
    if (degree === 2) return family === 'power' ? {re: -.6, im: 0, width: 3.2} : {re: -.4, im: 0, width: 4.7};
    return {re: 0, im: 0, width: degree === 3 ? 3.9 : 3.5};
  }

  const viewOf = ({re, im, width}) => ({left: re - width / 2, top: im + width * HEIGHT / WIDTH / 2, width,
    height: width * HEIGHT / WIDTH});

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function parseNumbers(text, count) {
    const values = (text || '').split(',').map(Number);
    return values.length === count && values.every(Number.isFinite) ? values : null;
  }

  // The principal square root of x + iy, from real square roots.
  function sqrt(x, y) {
    const size = Math.sqrt(x * x + y * y);
    const im = Math.sqrt(Math.max(0, (size - x) / 2));
    return [Math.sqrt((size + x) / 2), y < 0 ? -im : im];
  }

  // The roots of p_c: 1 and (−1 ± √(1 − 4c))/2.
  function newtonRoots(cx, cy) {
    const [sx, sy] = sqrt(1 - 4 * cx, -4 * cy);
    return [[1, 0], [(-1 + sx) / 2, sy / 2], [(-1 - sx) / 2, -sy / 2]];
  }

  // The escape step of the orbit of z under the family's map, or −1 if it has
  // not left radius max(2, |c|) within the budget, or has come back exactly to
  // a value kept at steps 8, 16, 32, … (then it is periodic and never escapes).
  // `last` receives |z|² at escape.
  const last = {size: 0};
  function escapeStep(family, degree, zx, zy, cx, cy, budget) {
    const limit = Math.max(4, cx * cx + cy * cy);
    let keptX = zx, keptY = zy, keepAt = 8;
    for (let n = 1; n <= budget; n++) {
      let px, py;
      if (family === 'ship') {
        px = zx * zx - zy * zy;
        py = 2 * Math.abs(zx * zy);
      } else {
        const bx = zx, by = family === 'conjugate' ? -zy : zy;
        px = bx;
        py = by;
        for (let k = 1; k < degree; k++) {
          const t = px * bx - py * by;
          py = px * by + py * bx;
          px = t;
        }
      }
      zx = px + cx;
      zy = py + cy;
      const size = zx * zx + zy * zy;
      if (size > limit) {
        last.size = size;
        return n;
      }
      if (zx === keptX && zy === keptY) return -1;
      if (n === keepAt) {
        keptX = zx;
        keptY = zy;
        keepAt *= 2;
      }
    }
    return -1;
  }

  // Newton's map N(z) = (2z³ + c)/(3z² + c − 1) from z: the index of the root
  // reached and the steps taken, as [index, steps]; [−2, steps] if the orbit
  // lands on ∞, a repelling fixed point, where p′ vanishes; [−1, budget] if it
  // reaches no root.
  function newtonFate(zx, zy, cx, cy, roots, budget) {
    for (let n = 1; n <= budget; n++) {
      const x2 = zx * zx - zy * zy, y2 = 2 * zx * zy;
      const nx = 2 * (x2 * zx - y2 * zy) + cx, ny = 2 * (x2 * zy + y2 * zx) + cy;
      const dx = 3 * x2 + cx - 1, dy = 3 * y2 + cy;
      const d = dx * dx + dy * dy;
      if (d === 0) return [-2, n];
      zx = (nx * dx + ny * dy) / d;
      zy = (ny * dx - nx * dy) / d;
      for (let k = 0; k < 3; k++) {
        const ex = zx - roots[k][0], ey = zy - roots[k][1];
        if (ex * ex + ey * ey < CLOSE) return [k, n];
      }
    }
    return [-1, budget];
  }

  function paintRoot(data, offset, color, steps) {
    const shade = .4 + .6 * Math.max(0, 1 - steps / 30);
    data[offset] = color[0] * shade;
    data[offset + 1] = color[1] * shade;
    data[offset + 2] = color[2] * shade;
    data[offset + 3] = 255;
  }

  function paintInterior(data, offset) {
    data.set([...INTERIOR, 255], offset);
  }

  kit.setUp('relatives', (figure) => {
    figure.classList.add('widget-plate');
    const family = FAMILIES.some(([key]) => key === figure.dataset.family) ? figure.dataset.family : 'power';
    const degree = DEGREES.includes(Number(figure.dataset.degree)) ? Number(figure.dataset.degree) : 2;
    const [cRe, cIm] = parseNumbers(figure.dataset.c, 2) || [0, 1];
    const [wRe, wIm, wWidth] = parseNumbers(figure.dataset.window, 3) || [];
    const state = {
      family, degree, c: {re: cRe, im: cIm},
      window: wWidth > 0 ? {re: wRe, im: wIm, width: wWidth} : wholeWindow(family, degree),
    };
    let mapGeneration = 0, juliaGeneration = 0;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const fieldRow = element('div', 'plate-controls plate-fields');
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
    select('Family', FAMILIES, state.family, value => {
      state.family = value;
      update();
    });
    const degreeSelect = select('Degree d', DEGREES.map(d => [String(d), String(d)]), String(state.degree), value => {
      state.degree = Number(value);
      update();
    });

    const buttons = element('div', 'plate-buttons');
    function button(text, onClick, quiet = false) {
      const node = element('button', quiet ? 'plate-button-quiet' : null, text);
      node.type = 'button';
      node.addEventListener('click', onClick);
      buttons.append(node);
      return node;
    }
    button('Zoom in around c', () => {
      state.window = {re: state.c.re, im: state.c.im, width: state.window.width / 4};
      drawMap();
    });
    button('Zoom out', () => {
      const whole = wholeWindow(state.family, state.degree);
      state.window = state.window.width * 4 >= whole.width ? whole : {...state.window, width: state.window.width * 4};
      drawMap();
    }, true);
    button('Whole plane', () => {
      state.window = wholeWindow(state.family, state.degree);
      drawMap();
    }, true);
    controls.append(buttons);

    function numberField(shortName, fullName, part) {
      const label = element('label');
      label.innerHTML = `<span>${shortName}</span>`;  // fixed markup such as Re(<var>c</var>)
      const input = element('input');
      input.setAttribute('aria-label', fullName);
      input.type = 'number';
      input.step = '0.01';
      input.inputMode = 'decimal';
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (input.value.trim() !== '' && Number.isFinite(value) && Math.abs(value) <= 4) {
          state.c = {...state.c, [part]: value};
          drawMarker();
          drawJulia();
        }
      });
      label.append(input);
      fieldRow.append(label);
      return input;
    }
    const fields = {
      re: numberField('Re(<var>c</var>)', 'Real part of c', 're'),
      im: numberField('Im(<var>c</var>)', 'Imaginary part of c', 'im'),
    };

    // --- panels --------------------------------------------------------------

    function panel(title, label) {
      const box = element('div', 'plate-panel');
      const heading = element('h3');
      heading.innerHTML = title;  // fixed markup with <var>
      const view = element('div', 'plate-view');
      const canvas = element('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', label);
      const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay', 'aria-hidden': 'true'});
      view.append(canvas, overlay);
      const caption = element('p', 'plate-caption');
      box.append(heading, view, caption);
      return {box, context: canvas.getContext('2d'), overlay, caption};
    }
    const map = panel('Parameter plane · choose <var>c</var>',
      'The parameter plane of the chosen family; the ring marks the chosen parameter c.');
    const julia = panel('Dynamical plane of <var>c</var>',
      'The dynamical plane of the chosen parameter: starting points colored by the fate of their orbits.');
    if (!map.context || !julia.context) return;
    const panels = element('div', 'plate-grid');
    panels.append(map.box, julia.box);
    const verdict = element('p', 'plate-verdict');
    verdict.setAttribute('aria-live', 'polite');

    // Filled Julia sets of higher degree are smaller.
    const juliaWindow = () => {
      const degree = state.family === 'power' || state.family === 'conjugate' ? state.degree : 2;
      return {re: 0, im: 0, width: degree === 2 ? 4.2 : degree === 3 ? 4 : 3.6};
    };
    const range = (view) => {
      const digits = Math.max(2, Math.ceil(-Math.log10(view.width)) + 1);
      return `Re: ${formatNumber(view.left, digits)} to ${formatNumber(view.left + view.width, digits)} · `
        + `Im: ${formatNumber(view.top - view.height, digits)} to ${formatNumber(view.top, digits)}`;
    };
    const mapBudget = () => {
      const whole = wholeWindow(state.family, state.degree);
      const budget = kit.iterationBudget(3.2 * state.window.width / whole.width);
      return state.family === 'newton' ? Math.min(400, Math.round(budget * NEWTON_BUDGET / 300)) : budget;
    };

    // --- drawing -------------------------------------------------------------

    // Draws one plane row by row, a few rows per frame, at the size the screen calls for
    // (AtlasKit.fitCanvas; the overlays keep the units of 480 × 360). In the parameter plane
    // each pixel is c and the orbit starts at the critical point 0; in the
    // dynamical plane each pixel is a starting point z for the chosen c.
    async function render(target, view, parameter, budget, isCurrent) {
      const {context} = target;
      kit.fitCanvas(context.canvas, WIDTH, HEIGHT);
      const {width: columns, height: rows} = context.canvas;
      const image = context.createImageData(columns, rows);
      const {family: kind, degree: d} = state;
      const fixedRoots = parameter && kind === 'newton' ? newtonRoots(parameter.re, parameter.im) : null;
      for (let row = 0; row < rows; row++) {
        const y = view.top - (row + .5) * view.height / rows;
        for (let col = 0; col < columns; col++) {
          const x = view.left + (col + .5) * view.width / columns;
          const [zx, zy, cx, cy] = parameter ? [x, y, parameter.re, parameter.im] : [0, 0, x, y];
          const offset = 4 * (row * columns + col);
          if (kind === 'newton') {
            const [index, steps] = newtonFate(zx, zy, cx, cy, fixedRoots || newtonRoots(cx, cy), budget);
            if (index < 0) paintInterior(image.data, offset);
            // In the parameter plane the two roots other than 1 trade places
            // along the cut of the square root, so they share one color.
            else paintRoot(image.data, offset, ROOT_COLORS[parameter ? index : Math.min(index, 1)], steps);
          } else {
            const n = escapeStep(kind, d, zx, zy, cx, cy, budget);
            kit.paint(image.data, offset, n < 0 ? null : n, last.size, kind === 'ship' ? 2 : d);
          }
        }
        if (row % ROWS_PER_FRAME === ROWS_PER_FRAME - 1 || row === rows - 1) {
          if (!isCurrent()) return false;
          context.putImageData(image, 0, 0);
          await new Promise(requestAnimationFrame);
          if (!isCurrent()) return false;
        }
      }
      return true;
    }

    async function drawMap() {
      const request = ++mapGeneration;
      const view = viewOf(state.window);
      const budget = mapBudget();
      map.caption.textContent = `${range(view)} · ${budget.toLocaleString('en')} steps`;
      drawMarker();
      const done = await render(map, view, null, budget, () => request === mapGeneration);
      if (done) figure.dataset.mapDrawn = `${state.family},${state.degree}`;
    }

    async function drawJulia() {
      const request = ++juliaGeneration;
      const view = viewOf(juliaWindow());
      const budget = state.family === 'newton' ? NEWTON_BUDGET : JULIA_BUDGET;
      julia.caption.textContent = `${range(view)} · ${budget.toLocaleString('en')} steps`;
      fields.re.value = Number(state.c.re.toFixed(6));
      fields.im.value = Number(state.c.im.toFixed(6));
      describe();
      julia.overlay.replaceChildren();
      if (state.family === 'newton') {
        const plane = new kit.Plane(view, WIDTH, HEIGHT);
        for (const [x, y] of newtonRoots(state.c.re, state.c.im)) {
          const {x: sx, y: sy} = plane.toScreen({re: x, im: y});
          kit.svg('circle', {cx: sx, cy: sy, r: 5, class: 'orbit-marker'}, julia.overlay);
        }
      }
      const done = await render(julia, view, state.c, budget, () => request === juliaGeneration);
      if (done) figure.dataset.juliaDrawn = `${state.family},${state.degree},${state.c.re},${state.c.im}`;
    }

    function drawMarker() {
      map.overlay.replaceChildren();
      const plane = new kit.Plane(viewOf(state.window), WIDTH, HEIGHT);
      const {x, y} = plane.toScreen(state.c);
      kit.svg('circle', {cx: x, cy: y, r: 6, class: 'orbit-marker'}, map.overlay);
    }

    // The verdict on the chosen parameter, from its critical orbit.
    function describe() {
      const {family: kind, degree: d, c} = state;
      const where = `For <var>c</var> = ${format(c, 4)}`;
      if (kind === 'newton') {
        const roots = newtonRoots(c.re, c.im);
        const [index, steps] = newtonFate(0, 0, c.re, c.im, roots, 4 * NEWTON_BUDGET);
        if (index === -2) {
          verdict.innerHTML = `${where}, <var>p</var>′ vanishes on the orbit of the critical point 0, so Newton’s map `
            + `sends it to ∞ after ${steps} step${steps === 1 ? '' : 's'}. ∞ is a repelling fixed point, so 0 lies in `
            + 'the Julia set and reaches no root. The rings on the right mark the three roots.';
        } else if (index < 0) {
          verdict.innerHTML = `${where}, Newton’s method started at the critical point 0 reaches no root within `
            + `${4 * NEWTON_BUDGET} steps, which suggests that 0 is attracted to a cycle other than the roots. Then so `
            + 'is a whole open set of starting points: the dark regions on the right, where the method fails.';
        } else {
          const root = format({re: roots[index][0], im: roots[index][1]}, 3);
          verdict.innerHTML = `${where}, Newton’s method started at the critical point 0 reaches the root ${root} `
            + `after ${steps} step${steps === 1 ? '' : 's'}. The rings on the right mark the three roots.`;
        }
        return;
      }
      const budget = 4 * JULIA_BUDGET;
      const n = escapeStep(kind, d, 0, 0, c.re, c.im, budget);
      const name = kind === 'power' ? (d === 2 ? 'the Mandelbrot set' : `the Multibrot set <var>M</var>${subscript(d)}`)
        : kind === 'conjugate' ? (d === 2 ? 'the tricorn' : `the multicorn of degree ${d}`) : 'the Burning Ship set';
      if (n > 0) {
        verdict.innerHTML = `${where}, the orbit of 0 escapes at step ${n}, so <var>c</var> lies outside ${name}`
          + (kind === 'ship' ? '. No theorem describes the picture on the right.'
            : ', and the filled Julia set on the right is a Cantor set.');
      } else {
        verdict.innerHTML = `${where}, the orbit of 0 has not escaped within ${budget.toLocaleString('en')} steps, which `
          + `suggests that <var>c</var> lies in ${name}`
          + (kind === 'ship' ? '. No theorem describes the picture on the right.'
            : ' and that the filled Julia set on the right is connected.');
      }
    }

    function update() {
      degreeSelect.disabled = state.family === 'ship' || state.family === 'newton';
      state.window = wholeWindow(state.family, state.degree);
      drawMap();
      drawJulia();
    }

    map.overlay.addEventListener('click', event => {
      const box = map.overlay.getBoundingClientRect();
      const plane = new kit.Plane(viewOf(state.window), WIDTH, HEIGHT);
      const c = plane.fromScreen((event.clientX - box.left) / box.width * WIDTH,
        (event.clientY - box.top) / box.height * HEIGHT);
      // Round to a few digits more than the window needs.
      const digits = Math.max(4, 3 - Math.floor(Math.log10(state.window.width)));
      state.c = {re: Number(c.re.toFixed(digits)), im: Number(c.im.toFixed(digits))};
      drawMarker();
      drawJulia();
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, fieldRow, panels, verdict]) figure.insertBefore(part, caption);
    degreeSelect.disabled = state.family === 'ship' || state.family === 'newton';
    drawMap();
    drawJulia();
    kit.whenResized(() => {
      if (!kit.fitsScreen(map.context.canvas, WIDTH, HEIGHT)) drawMap();
      if (!kit.fitsScreen(julia.context.canvas, WIDTH, HEIGHT)) drawJulia();
    });
  });
})();
