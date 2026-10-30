/* Interactive figure: the Leau–Fatou flower of a parabolic fixed point.

   At c = λ/2 − λ²/4 with λ = e^(2πip/q), the fixed point z* = λ/2 of z² + c has multiplier λ. In the
   coordinate u = z − z*, q steps of the map are F(u) = u + a·u^(q+1) + … with a ≠ 0: q attracting
   petals, around the directions where a·u^q is negative, alternate with q repelling directions, where
   it is positive, and each step of the map turns them by p places counterclockwise. The figure draws
   the filled Julia set around z*. A point that does not escape is colored by the petal its orbit lies
   in once it has crept close to z*, counted after a multiple of q steps, so that each step carries
   one color p colors on; and in light and dark bands, one per step of the map, which crowd together
   toward z*. Dashed arrows point along the attracting directions into z*, dotted ones along the
   repelling directions away from it, and numbered badges follow the orbit of 0 for as many steps as
   the slider says.

   The bands are those of the Fatou coordinate Φ, in which F adds exactly 1. Near z*,
   Φ(u) = Σ e_j·u^j (j = −q … q, j ≠ 0) + β·log u, with the coefficients chosen so that
   Φ(F(u)) − Φ(u) − 1 has no terms below u^(2q+1) (fatouSeries); where |q·a·u^q| < 1/NEAR this holds
   to about 10⁻⁴. A point is attracted once Re Φ > STOP: from there F only adds 1 to Φ, and the orbit
   creeps in. Along the repelling directions orbits leave z* as slowly as others approach it, so a
   point with Re Φ < −JUMP_FROM is carried at once to Re Φ ≈ −JUMP_TO, m steps of F later, by solving
   Φ(u′) = Φ(u) + m with Newton's method. Checked in Python against plain iteration of up to 400,000
   steps, for 120 points in the repelling half of each flower: the same outcome, petal and number of
   steps, and Φ within 0.002.

   Built by AtlasKit.setUp for every <figure data-widget="flower">; data-example chooses the first
   parabolic point (a key of EXAMPLES). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const ROWS_PER_TASK = 12;
  const BUDGET = 20000;    // steps per pixel, a jump counted as 30
  const NEAR = 50;         // Φ is used where |q·a·u^q| < 1/NEAR
  const STOP = 30;
  const JUMP_FROM = 120;
  const JUMP_TO = 60;
  const MAX_STEPS = 1000;  // the steps of the orbit of 0 that the slider reaches
  const FIRST = 10;        // the steps shown at first
  // The slider's positions: every n up to 20, then 20 per tenfold up to MAX_STEPS.
  const STEPS = [...new Set([...Array.from({length: 21}, (_, n) => n),
    ...Array.from({length: 34}, (_, k) => Math.round(10 ** ((k + 27) / 20)))])].filter(n => n <= MAX_STEPS);

  // Key, name in the menu, p and q, and the window: its center (null for the fixed point) and width.
  const EXAMPLES = [
    ['cusp', 'c = 1/4, the cusp · one petal', 0, 1, {re: 0, im: 0}, 2],
    ['half', 'c = −3/4 · two petals', 1, 2, {re: -.45, im: 0}, 2],
    ['1-3', 'Root of the 1/3 bulb · three petals', 1, 3, null, 1.3],
    ['2-5', 'Root of the 2/5 bulb · five petals', 2, 5, null, .9],
  ];
  // The light and dark shade of each petal's color, counterclockwise from the first attracting
  // direction, and the colors of escaping points, from quick to slow.
  const LIGHT = [[120, 214, 218], [246, 196, 120], [240, 150, 130], [190, 170, 236], [170, 220, 140]];
  const DARK = [[24, 96, 110], [140, 86, 24], [140, 62, 48], [80, 64, 140], [60, 110, 50]];
  const COLORS = ['teal', 'amber', 'coral', 'violet', 'green'];
  const OUTSIDE = [[12, 24, 40], [40, 70, 105]];
  const PLACES = {1: 'one place', 2: 'two places'};
  const COUNTS = {1: 'one petal', 2: 'two petals', 3: 'three petals', 5: 'five petals'};

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // --- the Fatou coordinate ----------------------------------------------------

  const plus = (a, b) => ({re: a.re + b.re, im: a.im + b.im});
  const times = (a, b) => ({re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re});
  const scaled = (a, s) => ({re: a.re * s, im: a.im * s});
  const over = (a, b) => {
    const size = b.re * b.re + b.im * b.im;
    return {re: (a.re * b.re + a.im * b.im) / size, im: (a.im * b.re - a.re * b.im) / size};
  };
  const zero = () => ({re: 0, im: 0});

  // The product of two power series, up to the term in u^order.
  function product(a, b, order) {
    const out = Array.from({length: order + 1}, zero);
    a.forEach((x, i) => b.forEach((y, j) => {
      if (i + j <= order) out[i + j] = plus(out[i + j], times(x, y));
    }));
    return out;
  }

  // The parabolic point of p/q: c, z*, and the coefficients of the Fatou coordinate. q steps of the
  // map are F(u) = u·(1 + A(u)), A(u) = a·u^q + …; then Φ(F(u)) − Φ(u) =
  // Σ e_j·u^j·((1 + A)^j − 1) + β·log(1 + A), and requiring it to be 1 + O(u^(2q+1)) fixes, term by
  // term from u^0 to u^2q, e_(−q), …, e_(−1), β, e_1, …, e_q, each from the ones before.
  function fatouSeries(p, q) {
    const lambda = {re: Math.cos(2 * Math.PI * p / q), im: Math.sin(2 * Math.PI * p / q)};
    const fixed = scaled(lambda, .5);
    const c = plus(fixed, scaled(times(lambda, lambda), -.25));
    const top = 2 * q;            // the terms matched, u^0 … u^top
    const length = top + q + 1;   // the terms of A needed, since (1 + A)^j is needed for j ≥ −q
    // F(u) − z*, by q steps of u ↦ 2z*·u + u².
    let series = Array.from({length: length + 1}, (_, i) => ({re: i === 1 ? 1 : 0, im: 0}));
    for (let step = 0; step < q; step++) {
      const square = product(series, series, length);
      series = series.map((term, i) => plus(times(scaled(fixed, 2), term), square[i]));
    }
    const A = series.slice(1);
    A[0] = zero();
    const a = A[q];
    // A^0, A^1, …: A^n starts at u^(nq).
    const powers = [Array.from({length}, (_, i) => ({re: i === 0 ? 1 : 0, im: 0}))];
    for (let n = 1; n * q < length; n++) powers.push(product(powers[n - 1], A, length - 1));
    const binomial = j => {
      const out = powers[0].map(term => ({...term}));
      let coefficient = 1;
      for (let n = 1; n < powers.length; n++) {
        coefficient *= (j - n + 1) / n;
        powers[n].forEach((term, i) => { out[i] = plus(out[i], scaled(term, coefficient)); });
      }
      return out;
    };
    const logarithm = Array.from({length}, zero);
    for (let n = 1; n < powers.length; n++) {
      powers[n].forEach((term, i) => { logarithm[i] = plus(logarithm[i], scaled(term, (n % 2 ? 1 : -1) / n)); });
    }
    const terms = new Map();  // j → [e_j, (1 + A)^j]
    let beta = zero();
    for (let power = 0; power <= top; power++) {
      let known = {re: power === 0 ? -1 : 0, im: 0};
      for (const [j, [e, expansion]] of terms) {
        if (power - j > 0 && power - j < length) known = plus(known, times(e, expansion[power - j]));
      }
      const j = power - q;
      if (j === 0) {
        beta = scaled(over(known, a), -1);
        continue;
      }
      known = plus(known, times(beta, logarithm[power]));
      terms.set(j, [scaled(over(known, scaled(a, j)), -1), binomial(j)]);
    }
    const qa = scaled(a, q);
    const angle = Math.atan2(a.im, a.re);
    return {
      p, q, c: [c.re, c.im], fixed: [fixed.re, fixed.im], qa: [qa.re, qa.im], beta: [beta.re, beta.im],
      e: [...terms].map(([j, [e]]) => [j, e.re, e.im]),
      repelling: -angle / q,                // the first repelling direction, where a·u^q > 0
      attracting: (Math.PI - angle) / q,    // the first attracting one, where a·u^q < 0
    };
  }

  // --- one pixel, in a background thread ------------------------------------------

  // The nearest of `count` evenly spaced directions from `start` to `angle`: its index and angle.
  function nearest(angle, start, count) {
    const step = 2 * Math.PI / count;
    const index = ((Math.round((angle - start) / step) % count) + count) % count;
    return [index, start + index * step];
  }

  // Φ(u) and Φ′(u) as [re Φ, im Φ, re Φ′, im Φ′], with the branch of log u around the direction theta.
  function fatou(task, ux, uy, theta) {
    const size = ux * ux + uy * uy;
    const up = [[1, 0]];
    const down = [[1, 0]];
    for (let j = 1; j <= task.q + 1; j++) {
      const [ur, ui] = up[j - 1];
      up.push([ur * ux - ui * uy, ur * uy + ui * ux]);
      const [dr, di] = down[j - 1];
      down.push([(dr * ux + di * uy) / size, (di * ux - dr * uy) / size]);
    }
    let re = 0;
    let im = 0;
    let dre = 0;
    let dim = 0;
    for (const [j, er, ei] of task.e) {
      const [pr, pi] = j >= 0 ? up[j] : down[-j];
      re += er * pr - ei * pi;
      im += er * pi + ei * pr;
      const [qr, qi] = j - 1 >= 0 ? up[j - 1] : down[1 - j];
      dre += j * (er * qr - ei * qi);
      dim += j * (er * qi + ei * qr);
    }
    const [br, bi] = task.beta;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const angle = theta + Math.atan2(uy * cos - ux * sin, ux * cos + uy * sin);
    const logSize = Math.log(size) / 2;
    re += br * logSize - bi * angle;
    im += br * angle + bi * logSize;
    dre += br * down[1][0] - bi * down[1][1];
    dim += br * down[1][1] + bi * down[1][0];
    return [re, im, dre, dim];
  }

  // The u near the direction theta with Φ(u) = tr + i·ti, by Newton's method from u = ux + i·uy after
  // three rounds of u = (−1/(q·a·(Φ − β·log u)))^(1/q); null if it does not converge.
  function solve(task, tr, ti, ux, uy, theta) {
    const {q} = task;
    const [ar, ai] = task.qa;
    const [br, bi] = task.beta;
    let gx = ux;
    let gy = uy;
    for (let round = 0; round < 3; round++) {
      const angle = theta + Math.atan2(gy * Math.cos(theta) - gx * Math.sin(theta), gx * Math.cos(theta) + gy * Math.sin(theta));
      const logSize = Math.log(gx * gx + gy * gy) / 2;
      const wr = tr - (br * logSize - bi * angle);
      const wi = ti - (br * angle + bi * logSize);
      const pr = ar * wr - ai * wi;
      const pi = ar * wi + ai * wr;
      const size = pr * pr + pi * pi;
      const base = Math.atan2(pi / size, -pr / size) / q;
      const phase = base + Math.round((theta - base) / (2 * Math.PI / q)) * 2 * Math.PI / q;
      const radius = Math.pow(1 / Math.sqrt(size), 1 / q);
      gx = radius * Math.cos(phase);
      gy = radius * Math.sin(phase);
    }
    for (let round = 0; round < 30; round++) {
      const [fr, fi, dr, di] = fatou(task, gx, gy, theta);
      const er = fr - tr;
      const ei = fi - ti;
      const size = dr * dr + di * di;
      const sx = (er * dr + ei * di) / size;
      const sy = (ei * dr - er * di) / size;
      gx -= sx;
      gy -= sy;
      if (Math.hypot(sx, sy) < 1e-15 * Math.hypot(gx, gy)) break;
    }
    const [fr, fi] = fatou(task, gx, gy, theta);
    return Math.hypot(fr - tr, fi - ti) < 1e-9 * Math.hypot(tr, ti) + 1e-9 ? [gx, gy] : null;
  }

  // What the orbit of x + iy does: {inside: true, petal, phi, gradient, steps} once it is attracted,
  // with phi = Re Φ − steps/q and gradient = |dΦ/dz| at the start; {inside: false, steps} once it
  // escapes; {inside: null} if BUDGET runs out first.
  function classify(task, x0, y0) {
    const {q} = task;
    const [cx, cy] = task.c;
    const [zx, zy] = task.fixed;
    const strength = Math.hypot(task.qa[0], task.qa[1]);
    let x = x0;
    let y = y0;
    let dx = 1;   // the derivative of the orbit point by the start
    let dy = 0;
    let k = 0;
    let work = 0;
    while (work < BUDGET) {
      if (k % q === 0) {
        const ux = x - zx;
        const uy = y - zy;
        if (strength * Math.pow(ux * ux + uy * uy, q / 2) * NEAR < 1) {
          const angle = Math.atan2(uy, ux);
          const theta = nearest(angle, task.repelling, 2 * q)[1];
          const [fr, fi, dr, di] = fatou(task, ux, uy, theta);
          if (fr > STOP) {
            let petal = nearest(angle, task.attracting, q)[0];
            if (Math.abs(fi) > fr) {
              // Near the edge of a petal: follow the orbit until it points into one.
              const ahead = solve(task, fr + Math.ceil(4 * Math.abs(fi)), fi, ux, uy,
                task.attracting + petal * 2 * Math.PI / q);
              if (ahead) petal = nearest(Math.atan2(ahead[1], ahead[0]), task.attracting, q)[0];
            }
            return {inside: true, petal, phi: fr - k / q, gradient: Math.hypot(dr, di) * Math.hypot(dx, dy), steps: k};
          }
          if (fr < -JUMP_FROM) {
            const m = Math.floor(-fr - JUMP_TO);
            const landed = solve(task, fr + m, fi, ux, uy, theta);
            if (landed) {
              // The derivative of m steps of F is Φ′(u)/Φ′(u′).
              const [, , er, ei] = fatou(task, landed[0], landed[1], theta);
              const size = er * er + ei * ei;
              const qr = (dr * er + di * ei) / size;
              const qi = (di * er - dr * ei) / size;
              const nx = dx * qr - dy * qi;
              dy = dx * qi + dy * qr;
              dx = nx;
              x = zx + landed[0];
              y = zy + landed[1];
              k += q * m;
              work += 30;
              continue;
            }
          }
        }
      }
      if (x * x + y * y > 4) return {inside: false, steps: k};
      const nx = 2 * (x * dx - y * dy);
      dy = 2 * (x * dy + y * dx);
      dx = nx;
      const next = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = next;
      k++;
      work++;
    }
    return {inside: null, steps: k};
  }

  // Rows firstRow … firstRow + rows − 1 of the picture, as RGBA bytes. Runs in a worker.
  function flowerRows(task) {
    const {view, width, firstRow, rows, q} = task;
    const pixels = new Uint8ClampedArray(width * rows * 4);
    const size = view.width / width;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < width; column++) {
        const point = classify(task, view.left + (column + .5) * size, view.top - (firstRow + row + .5) * size);
        const offset = (row * width + column) * 4;
        if (point.inside) {
          // A band per step of the map, faded to its middle shade where it is under 2 pixels wide.
          const band = 1 / (point.gradient * q * size);
          const fade = band > 0 ? Math.min(1, Math.max(0, (band - 2) / 4)) : 0;
          const shade = .5 + .5 * Math.cos(2 * Math.PI * q * point.phi) * fade;
          for (let i = 0; i < 3; i++) pixels[offset + i] = DARK[point.petal][i] + (LIGHT[point.petal][i] - DARK[point.petal][i]) * shade;
        } else {
          const t = point.inside === false ? Math.min(1, Math.log(1 + point.steps) / Math.log(1000)) : 0;
          for (let i = 0; i < 3; i++) pixels[offset + i] = OUTSIDE[0][i] + (OUTSIDE[1][i] - OUTSIDE[0][i]) * t;
        }
        pixels[offset + 3] = 255;
      }
    }
    return {pixels};
  }

  const pool = kit.workerPool(flowerRows, {
    helpers: [classify, fatou, solve, nearest],
    constants: {BUDGET, NEAR, STOP, JUMP_FROM, JUMP_TO, LIGHT, DARK, OUTSIDE},
  });

  // --- the figure -------------------------------------------------------------

  kit.setUp('flower', (figure, id) => {
    figure.classList.add('widget-plate');
    const first = EXAMPLES.find(([key]) => key === figure.dataset.example) || EXAMPLES[0];
    const state = {example: first, n: FIRST};
    const cache = new Map();
    let generation = 0;

    // The Fatou coordinate, the orbit of 0 and the window of the example shown.
    function current() {
      const [key, , p, q, center, width] = state.example;
      if (!cache.has(key)) {
        const task = fatouSeries(p, q);
        const c = {re: task.c[0], im: task.c[1]};
        const orbit = [{re: 0, im: 0}];
        for (let k = 0; k < MAX_STEPS; k++) {
          const z = orbit[k];
          orbit.push({re: z.re * z.re - z.im * z.im + c.re, im: 2 * z.re * z.im + c.im});
        }
        const fixed = {re: task.fixed[0], im: task.fixed[1]};
        const middle = center || fixed;
        const view = {left: middle.re - width / 2, top: middle.im + width * 3 / 8, width, height: width * 3 / 4};
        cache.set(key, {task, c, fixed, orbit, view, start: classify(task, 0, 0).petal});
      }
      return cache.get(key);
    }

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const exampleLabel = element('label', null, 'Parabolic point');
    const select = element('select');
    for (const [key, name] of EXAMPLES) {
      const option = element('option', null, name);
      option.value = key;
      select.append(option);
    }
    select.value = first[0];
    select.addEventListener('change', () => {
      state.example = EXAMPLES.find(([key]) => key === select.value);
      show();
    });
    exampleLabel.append(select);
    const stepsLabel = element('label', 'flower-steps', 'Steps of the orbit of 0');
    const stepsRow = element('span');
    const slider = element('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(STEPS.length - 1);
    slider.step = '1';
    slider.id = `${id}-steps`;
    const shown = element('output');
    shown.htmlFor = slider.id;
    slider.addEventListener('input', () => {
      state.n = STEPS[Number(slider.value)];
      mark();
    });
    stepsRow.append(slider, shown);
    stepsLabel.append(stepsRow);
    const buttons = element('div', 'plate-buttons');
    for (const [text, label, by] of [['◀', 'One step fewer', -1], ['▶', 'One step more', 1]]) {
      const node = element('button', 'plate-button-quiet', text);
      node.type = 'button';
      node.setAttribute('aria-label', label);
      node.addEventListener('click', () => {
        state.n = Math.min(MAX_STEPS, Math.max(0, state.n + by));
        mark();
      });
      buttons.append(node);
    }
    controls.append(exampleLabel, stepsLabel, buttons);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay flower-overlay'});
    overlay.setAttribute('role', 'img');
    view.append(canvas, overlay);
    const status = element('p', 'plate-verdict flower-status');
    status.setAttribute('aria-live', 'polite');

    // The distance from a point to the segment from a to b.
    function distance(point, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
    }

    // An arrow from `from` to `to`, in screen units, dashed or dotted, with its head at `to`.
    function arrow(layer, from, to, kind, unit) {
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const ux = (to.x - from.x) / length;
      const uy = (to.y - from.y) / length;
      const head = 10 * unit;
      const wing = 4.5 * unit;
      const base = {x: to.x - ux * head, y: to.y - uy * head};
      const tip = `M${to.x} ${to.y}L${base.x - uy * wing} ${base.y + ux * wing}L${base.x + uy * wing} ${base.y - ux * wing}Z`;
      const group = kit.svg('g', {class: `flower-${kind}`}, layer);
      const line = {x1: from.x, y1: from.y, x2: base.x, y2: base.y};
      kit.svg('line', {...line, class: 'flower-halo', 'stroke-width': 5 * unit}, group);
      kit.svg('path', {d: tip, class: 'flower-halo', 'stroke-width': 3 * unit}, group);
      kit.svg('line', {...line, class: 'flower-line', 'stroke-width': 2 * unit,
        'stroke-dasharray': kind === 'in' ? `${7 * unit} ${5 * unit}` : `${.1 * unit} ${5 * unit}`}, group);
      kit.svg('path', {d: tip, class: 'flower-head'}, group);
    }

    // The arrows along the 2q directions, the ring at z*, then the orbit of 0: a numbered badge at each
    // point that keeps clear of the badges before it, of the ring and of the arrows, a dot at the others,
    // and the point after n steps marked. All keep their size on screen.
    function mark() {
      overlay.replaceChildren();
      const {task, fixed, orbit, view: frame} = current();
      const {q} = task;
      const plane = new kit.Plane(frame, WIDTH, HEIGHT);
      const unit = Math.max(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      const center = plane.toScreen(fixed);
      const ring = 9 * unit;
      const arrows = kit.svg('g', {class: 'flower-arrows'}, overlay);
      const segments = [];
      for (let j = 0; j < 2 * q; j++) {
        const angle = task.repelling + j * Math.PI / q;
        const point = r => ({x: center.x + r * Math.cos(angle), y: center.y - r * Math.sin(angle)});
        const near = point(ring + 4 * unit);
        const far = point(Math.max(60, 25 + 30 * unit));  // 60 units, and about 40 pixels on a phone
        segments.push([near, far]);
        if (j % 2) arrow(arrows, far, near, 'in', unit);
        else arrow(arrows, near, far, 'out', unit);
      }
      kit.svg('circle', {class: 'flower-ring-halo', cx: center.x, cy: center.y, r: ring, 'stroke-width': .72 * ring}, overlay);
      kit.svg('circle', {class: 'flower-ring', cx: center.x, cy: center.y, r: ring, 'stroke-width': .31 * ring}, overlay);

      const n = state.n;
      const badge = 11 * unit;
      const inside = point => point.x >= 0 && point.x <= WIDTH && point.y >= 0 && point.y <= HEIGHT;
      const points = orbit.slice(0, n + 1).map(z => plane.toScreen(z));
      const placed = [];
      const dots = kit.svg('g', {class: 'flower-dots'}, overlay);
      const badges = kit.svg('g', {class: 'flower-badges'}, overlay);
      points.forEach((point, k) => {
        if (!inside(point)) return;
        const clear = Math.hypot(point.x - center.x, point.y - center.y) >= ring + badge + 2 * unit
          && placed.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= 2.2 * badge)
          && segments.every(([a, b]) => distance(point, a, b) >= badge + 3 * unit);
        if (!clear) {
          kit.svg('circle', {class: 'flower-dot', cx: point.x, cy: point.y, r: 2.5 * unit, 'stroke-width': unit}, dots);
          return;
        }
        placed.push(point);
        const group = kit.svg('g', {class: 'flower-point', 'data-step': k}, badges);
        kit.svg('circle', {class: 'flower-badge', cx: point.x, cy: point.y, r: badge, 'stroke-width': 1.5 * unit}, group);
        kit.svg('text', {class: 'flower-number', x: point.x, y: point.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': 14 * unit * (k >= 100 ? .7 : k >= 10 ? .85 : 1)}, group).textContent = String(k);
      });
      const last = points[n];
      if (inside(last)) kit.svg('circle', {class: 'flower-now', cx: last.x, cy: last.y, r: 5 * unit, 'stroke-width': 1.5 * unit}, overlay);

      slider.value = String(STEPS.reduce((best, value, index) => (Math.abs(value - n) < Math.abs(STEPS[best] - n) ? index : best), 0));
      shown.textContent = n.toLocaleString('en');
      describe();
    }

    function describe() {
      const [key, , p, q] = state.example;
      const {c, fixed, orbit, start} = current();
      const n = state.n;
      const z = orbit[n];
      const distance = Math.hypot(z.re - fixed.re, z.im - fixed.im);
      const digits = Math.max(4, Math.ceil(-Math.log10(distance)) + 2);
      const point = format(fixed, 4);
      const intro = {
        cusp: 'c = 1/4. The fixed point 1/2 has multiplier 1 and one petal: points creep in from the left, inside the '
          + 'filled Julia set, and escape along the repelling direction to the right.',
        half: 'c = −3/4. The fixed point −1/2 has multiplier −1 and two petals along the real axis, which the map swaps '
          + 'at every step; the repelling directions point up and down.',
      }[key] || `c ≈ ${format(c, 4)}, the root of the ${p}/${q} bulb. The fixed point ≈ ${point} has multiplier `
        + `e<sup>${2 * p}π<var>i</var>/${q}</sup> and ${COUNTS[q]}, which the map turns by ${PLACES[p]} `
        + 'counterclockwise at every step.';
      const where = q === 1 ? '' : `, in the ${COLORS[(start + p * n) % q]} region`;
      status.innerHTML = `${intro} After ${n.toLocaleString('en')} step${n === 1 ? '' : 's'} the orbit of 0 is at `
        + `<var>z</var><sub>${n}</sub> ≈ ${format(z, digits)}, ${formatNumber(distance, digits)} from the fixed point${where}.`;
      overlay.setAttribute('aria-label', `The filled Julia set around a parabolic fixed point, colored by its ${COUNTS[q]}, `
        + `with arrows along the attracting and repelling directions and the orbit of 0 for ${n} steps; the text below `
        + 'describes it.');
    }

    // --- the picture -----------------------------------------------------------

    async function show() {
      const request = ++generation;
      delete figure.dataset.drawn;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      context.clearRect(0, 0, canvas.width, canvas.height);
      mark();
      const {task, view: frame} = current();
      const {width, height} = canvas;
      const tasks = [];
      for (let firstRow = 0; firstRow < height; firstRow += ROWS_PER_TASK) {
        tasks.push({...task, view: frame, width, height, firstRow, rows: Math.min(ROWS_PER_TASK, height - firstRow)});
      }
      const done = await pool.run(tasks, () => request === generation, (part, {pixels}) => {
        context.putImageData(new ImageData(pixels, width, part.rows), 0, part.firstRow);
      });
      if (done && request === generation) figure.dataset.drawn = '';
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, status]) figure.insertBefore(part, caption);
    mark();
    // The picture is computed when the figure first comes near the screen.
    let near = false;
    kit.whenNear(figure, () => {
      near = true;
      show();
    });
    kit.whenResized(() => {
      if (!near) return;
      if (!kit.fitsScreen(canvas, WIDTH, HEIGHT)) show();
      else mark();
    });
  });
})();
