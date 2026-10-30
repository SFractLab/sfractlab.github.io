/* Interactive figure: a Siegel disk.

   At c = λ/2 − λ²/4 with λ = e^(2πiθ), the fixed point z* = λ/2 of z² + c has multiplier λ. For the
   four angles θ of the figure, whose continued fraction digits are all bounded, the map is a rotation
   in disguise near z*: a straightening coordinate w = φ(z), with φ(z*) = 0 and φ′(z*) = 1, carries it
   to w ↦ λw on the Siegel disk, so every orbit there runs around a closed curve |φ| = constant, and
   each step moves it on by θ of a turn. The figure draws the filled Julia set around the disk. A point
   that does not escape is colored by the angle of φ(z), and in light and dark rings by |φ(z)|, so the
   rings are the closed curves and each color runs from z* to the edge. The pieces that the map carries
   onto the disk (its preimages) show the same pattern, since φ there is φ of the point they land on,
   turned back. Numbered labels follow an orbit started on one ring, and dots the orbit of 0, which
   runs along the edge, for as many steps as the slider says; dark labels mark the steps after which
   the orbit is nearer to a whole number of turns than after any earlier one.

   φ(z) is the weighted average of λ^(−k)·(z_k − z*) over the first AVERAGE steps of the orbit, with the
   weights exp(−1/(t(1 − t))), t = k/AVERAGE, which converge faster than any power of AVERAGE for such
   orbits (Das and Yorke, 2018); checked in Python, φ(f(z)) = λ·φ(z) holds to 10⁻⁹ or better at 600
   steps. A point is outside once |z| > 2 within BUDGET steps.

   Built by AtlasKit.setUp for every <figure data-widget="siegel">; data-example chooses the first
   angle (a key of EXAMPLES). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const ROWS_PER_TASK = 12;
  const AVERAGE = 600;     // the steps averaged for φ
  const BUDGET = 3000;     // the steps after which a point counts as not escaping
  const RINGS = 8;         // light rings from z* to the edge
  const START = 3 / 4;     // the ring of the orbit with labels, as a part of the way to the edge
  const MAX_STEPS = 1000;  // the steps of the orbits that the slider reaches
  const FIRST = 8;         // the steps shown at first
const LABELED = 20;      // the steps that may get a label besides the last and those nearer than all before
  // The slider's positions: every n up to 20, then 20 per tenfold up to MAX_STEPS.
  const STEPS = [...new Set([...Array.from({length: 21}, (_, n) => n),
    ...Array.from({length: 34}, (_, k) => Math.round(10 ** ((k + 27) / 20)))])].filter(n => n <= MAX_STEPS);

  const GOLDEN = (Math.sqrt(5) - 1) / 2;
  // The angle with continued fraction digits `digits`, then 1, 1, 1, …
  const angle = digits => digits.reduceRight((x, a) => 1 / (a + x), GOLDEN);
  // Key, name in the menu, θ, and the window: its center and width.
  const EXAMPLES = [
    ['golden', 'Golden mean · digits 1, 1, 1, …', GOLDEN, {re: -.356, im: -.279}, 1.15],
    ['silver', 'Silver mean · digits 2, 2, 2, …', Math.SQRT2 - 1, {re: -.398, im: .214}, 1.15],
    ['near-1-3', 'Near 1/3 · digits 2, 1, 30, 1, 1, …', angle([2, 1, 30]), {re: -.3, im: .294}, 1.4],
    ['near-2-5', 'Near 2/5 · digits 2, 2, 30, 1, 1, …', angle([2, 2, 30]), {re: -.389, im: .221}, 1.25],
  ];
  // The light and dark shades of the colors around the disk, counterclockwise from the direction of
  // the critical point 0, and the colors of escaping points, from quick to slow.
  const LIGHT = [[120, 214, 218], [246, 196, 120], [240, 150, 130], [190, 170, 236], [170, 220, 140]];
  const DARK = [[24, 96, 110], [140, 86, 24], [140, 62, 48], [80, 64, 140], [60, 110, 50]];
  const OUTSIDE = [[12, 24, 40], [40, 70, 105]];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // --- one point, in a background thread or on the page ---------------------------

  // The straightening coordinate of x0 + iy0 and its derivative, as {phi: [re, im], derivative: [re, im]},
  // or {steps} if the orbit escapes after that many steps.
  function straighten(task, x0, y0) {
    const [cx, cy] = task.c;
    const [zx, zy] = task.fixed;
    const [mr, mi] = [task.lambda[0], -task.lambda[1]];  // 1/λ
    const weights = task.weights;
    let x = x0;
    let y = y0;
    let dx = 1;   // the derivative of the orbit point by the start
    let dy = 0;
    let lr = 1;   // λ^(−k)
    let li = 0;
    let ar = 0;
    let ai = 0;
    let br = 0;
    let bi = 0;
    for (let k = 0; k < BUDGET; k++) {
      if (x * x + y * y > 4) return {steps: k};
      if (k < AVERAGE) {
        const w = weights[k];
        const ux = x - zx;
        const uy = y - zy;
        ar += w * (ux * lr - uy * li);
        ai += w * (ux * li + uy * lr);
        br += w * (dx * lr - dy * li);
        bi += w * (dx * li + dy * lr);
        const nx = 2 * (x * dx - y * dy);
        dy = 2 * (x * dy + y * dx);
        dx = nx;
        const nl = lr * mr - li * mi;
        li = lr * mi + li * mr;
        lr = nl;
      }
      const next = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = next;
    }
    return {phi: [ar, ai], derivative: [br, bi]};
  }

  // Rows firstRow … firstRow + rows − 1 of the picture, as RGBA bytes. Runs in a worker.
  function siegelRows(task) {
    const {view, width, firstRow, rows, radius, turn} = task;
    const pixels = new Uint8ClampedArray(width * rows * 4);
    const size = view.width / width;
    const count = LIGHT.length;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < width; column++) {
        const point = straighten(task, view.left + (column + .5) * size, view.top - (firstRow + row + .5) * size);
        const offset = (row * width + column) * 4;
        if (point.phi) {
          const [pr, pi] = point.phi;
          // The color by the angle of φ, blended between neighbors; a ring per 1/RINGS of the way to the
          // edge, faded to its middle shade where it is under 2 pixels wide.
          const around = (((Math.atan2(pi, pr) - turn) / (2 * Math.PI)) % 1 + 1) % 1 * count;
          const one = Math.floor(around) % count;
          const other = (one + 1) % count;
          const share = around - Math.floor(around);
          const band = radius / (RINGS * Math.hypot(...point.derivative) * size);
          const fade = Math.min(1, Math.max(0, (band - 2) / 4));
          const shade = .5 + .5 * Math.cos(2 * Math.PI * RINGS * Math.hypot(pr, pi) / radius) * fade;
          for (let i = 0; i < 3; i++) {
            const light = LIGHT[one][i] + (LIGHT[other][i] - LIGHT[one][i]) * share;
            const dark = DARK[one][i] + (DARK[other][i] - DARK[one][i]) * share;
            pixels[offset + i] = dark + (light - dark) * shade;
          }
        } else {
          const t = Math.min(1, Math.log(1 + point.steps) / Math.log(1000));
          for (let i = 0; i < 3; i++) pixels[offset + i] = OUTSIDE[0][i] + (OUTSIDE[1][i] - OUTSIDE[0][i]) * t;
        }
        pixels[offset + 3] = 255;
      }
    }
    return {pixels};
  }

  const pool = kit.workerPool(siegelRows, {
    helpers: [straighten],
    constants: {AVERAGE, BUDGET, RINGS, LIGHT, DARK, OUTSIDE},
  });

  // The weights of the average for φ, adding up to 1.
  const WEIGHTS = (() => {
    const raw = Array.from({length: AVERAGE}, (_, k) => (k === 0 ? 0 : Math.exp(-1 / ((k / AVERAGE) * (1 - k / AVERAGE)))));
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map(w => w / sum);
  })();

  // The distance from a whole number.
  const offWhole = x => Math.abs(x - Math.round(x));

  // --- the figure -------------------------------------------------------------

  kit.setUp('siegel', (figure, id) => {
    figure.classList.add('widget-plate');
    const first = EXAMPLES.find(([key]) => key === figure.dataset.example) || EXAMPLES[0];
    const state = {example: first, n: FIRST};
    const cache = new Map();
    let generation = 0;

    // The parameter, φ at 0, the two orbits, the steps that come back nearer than all before, and the
    // window of the example shown.
    function current() {
      const [key, , theta, center, width] = state.example;
      if (!cache.has(key)) {
        const lambda = {re: Math.cos(2 * Math.PI * theta), im: Math.sin(2 * Math.PI * theta)};
        const fixed = {re: lambda.re / 2, im: lambda.im / 2};
        const c = {re: fixed.re - (lambda.re * lambda.re - lambda.im * lambda.im) / 4, im: fixed.im - lambda.re * lambda.im / 2};
        const task = {c: [c.re, c.im], fixed: [fixed.re, fixed.im], lambda: [lambda.re, lambda.im], weights: WEIGHTS};
        // 0 lies on the edge: |φ(0)| is the radius of the straightened disk, and its angle starts the colors.
        const [er, ei] = straighten(task, 0, 0).phi;
        task.radius = Math.hypot(er, ei);
        task.turn = Math.atan2(ei, er);
        // The start: the point with φ = START·φ(0), by Newton's method from z* + START·φ(0).
        const target = [START * er, START * ei];
        let z = {re: fixed.re + target[0], im: fixed.im + target[1]};
        for (let round = 0; round < 12; round++) {
          const {phi: [pr, pi], derivative: [dr, di]} = straighten(task, z.re, z.im);
          const [fr, fi] = [pr - target[0], pi - target[1]];
          const size = dr * dr + di * di;
          z = {re: z.re - (fr * dr + fi * di) / size, im: z.im - (fi * dr - fr * di) / size};
        }
        const orbit = start => {
          const points = [start];
          for (let k = 0; k < MAX_STEPS; k++) {
            const p = points[k];
            points.push({re: p.re * p.re - p.im * p.im + c.re, im: 2 * p.re * p.im + c.im});
          }
          return points;
        };
        const records = [];
        for (let k = 1, best = 1; k <= MAX_STEPS; k++) {
          if (offWhole(k * theta) < best) {
            best = offWhole(k * theta);
            records.push(k);
          }
        }
        const view = {left: center.re - width / 2, top: center.im + width * 3 / 8, width, height: width * 3 / 4};
        cache.set(key, {task, theta, c, fixed, inside: orbit(z), critical: orbit({re: 0, im: 0}), records, view});
      }
      return cache.get(key);
    }

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const exampleLabel = element('label', null, 'Angle θ');
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
    const stepsLabel = element('label', 'flower-steps', 'Steps of the orbits');
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
    const status = element('p', 'plate-verdict siegel-status');
    status.setAttribute('aria-live', 'polite');

    // The ring at z*, the orbit of 0 as dots, then the orbit with numbered labels. All keep their size on
    // screen.
    function mark() {
      overlay.replaceChildren();
      const {fixed, inside: orbit, critical, records, view: frame} = current();
      const plane = new kit.Plane(frame, WIDTH, HEIGHT);
      const unit = Math.max(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      const center = plane.toScreen(fixed);
      const ring = 9 * unit;
      const n = state.n;
      const within = point => point.x >= 0 && point.x <= WIDTH && point.y >= 0 && point.y <= HEIGHT;

      const edge = kit.svg('g', {class: 'siegel-critical'}, overlay);
      for (const z of critical.slice(0, n + 1)) {
        const point = plane.toScreen(z);
        if (within(point)) kit.svg('circle', {cx: point.x, cy: point.y, r: 2.2 * unit, 'stroke-width': unit}, edge);
      }
      kit.svg('circle', {class: 'flower-ring-halo', cx: center.x, cy: center.y, r: ring, 'stroke-width': .72 * ring}, overlay);
      kit.svg('circle', {class: 'flower-ring', cx: center.x, cy: center.y, r: ring, 'stroke-width': .31 * ring}, overlay);

      const badge = 11 * unit;
      const points = orbit.slice(0, n + 1).map(z => plane.toScreen(z));
      const nearer = new Set(records.filter(k => k <= n));
      // The first LABELED steps, those nearer than all before and the last may get a label. Steps that land
      // almost on the same spot, as every q steps near p/q, share one: a step joins the first group under
      // whose label it would lie, if that has fewer than three steps.
      const groups = [];
      points.forEach((point, k) => {
        if (!within(point) || !(k <= LABELED || nearer.has(k) || k === n)) return;
        const group = groups.find(({at, steps}) => steps.length < 3 && Math.hypot(point.x - at.x, point.y - at.y) < badge);
        if (group) group.steps.push(k);
        else groups.push({at: point, steps: [k]});
      });
      // A label is a circle for one short number and a pill as wide as its text for more. The labels are
      // placed in turn, the start's first, then those with a step nearer than all before, the last
      // step's, and the others by their first step, each if its box keeps clear of the ring and of the
      // labels placed; all other steps get dots.
      for (const group of groups) {
        group.text = group.steps.join(', ');
        group.size = 14 * unit * (group.text.length >= 3 ? .85 : 1) * (group.text.length >= 7 ? .9 : 1);
        group.half = Math.max(badge, (group.text.length * .58 * group.size + badge) / 2);
      }
      const rank = group => (group.steps[0] === 0 ? 0 : group.steps.some(k => nearer.has(k)) ? 1 : group.steps.includes(n) ? 2 : 3);
      const placed = [];
      for (const group of [...groups].sort((a, b) => rank(a) - rank(b) || a.steps[0] - b.steps[0])) {
        const {at, half} = group;
        const dx = Math.max(0, Math.abs(at.x - center.x) - half);
        const dy = Math.max(0, Math.abs(at.y - center.y) - badge);
        if (Math.hypot(dx, dy) < ring + 2 * unit) continue;
        if (placed.some(other => Math.abs(at.x - other.at.x) < half + other.half + .2 * badge
          && Math.abs(at.y - other.at.y) < 2.2 * badge)) continue;
        placed.push(group);
      }
      const labeled = new Set(placed.flatMap(({steps}) => steps));
      const dots = kit.svg('g', {class: 'flower-dots'}, overlay);
      points.forEach((point, k) => {
        if (within(point) && !labeled.has(k)) {
          kit.svg('circle', {class: 'flower-dot', cx: point.x, cy: point.y, r: 2.5 * unit, 'stroke-width': unit}, dots);
        }
      });
      const badges = kit.svg('g', {class: 'flower-badges'}, overlay);
      for (const {at, steps, text, size, half} of placed) {
        const group = kit.svg('g', {class: `siegel-point${steps.some(k => nearer.has(k)) ? ' siegel-nearer' : ''}`,
          'data-steps': steps.join(' ')}, badges);
        if (steps.includes(n)) {
          const margin = 3 * unit;
          kit.svg('rect', {class: 'siegel-current', x: at.x - half - margin, y: at.y - badge - margin, width: 2 * (half + margin),
            height: 2 * (badge + margin), rx: badge + margin, 'stroke-width': 3 * unit}, group);
        }
        kit.svg('rect', {class: 'flower-badge', x: at.x - half, y: at.y - badge, width: 2 * half, height: 2 * badge,
          rx: badge, 'stroke-width': 1.5 * unit}, group);
        kit.svg('text', {class: 'flower-number', x: at.x, y: at.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': size}, group).textContent = text;
      }
      const last = points[n];
      if (within(last) && !labeled.has(n)) {
        kit.svg('circle', {class: 'flower-now', cx: last.x, cy: last.y, r: 5 * unit, 'stroke-width': 1.5 * unit}, overlay);
      }

      slider.value = String(STEPS.reduce((best, value, index) => (Math.abs(value - n) < Math.abs(STEPS[best] - n) ? index : best), 0));
      shown.textContent = n.toLocaleString('en');
      describe();
    }

    // A list in words: "1, 2 and 3".
    const listed = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

    function describe() {
      const [key] = state.example;
      const {theta, c, fixed, records} = current();
      const n = state.n;
      const parameter = `c ≈ ${format(c, 4)}, and the map turns the disk around the fixed point ≈ ${format(fixed, 4)} `
        + 'by θ of a turn at every step.';
      const intro = {
        golden: `θ = (√5 − 1)/2 ≈ ${formatNumber(theta, 6)}, the golden mean. Its continued fraction has every digit 1, and its `
          + 'fractions 1/1, 1/2, 2/3, 3/5, 5/8, 8/13, … have the Fibonacci numbers as denominators. ',
        silver: `θ = √2 − 1 ≈ ${formatNumber(theta, 6)}, the silver mean. Its continued fraction has every digit 2, and its `
          + 'fractions 1/2, 2/5, 5/12, 12/29, 29/70, … have denominators that grow a little faster. ',
        'near-1-3': `θ ≈ ${formatNumber(theta, 6)}, with continued fraction digits 2, 1, 30, 1, 1, 1, … Its fractions are 1/2, `
          + '1/3, 31/92, 32/95, 63/187, …: 1/3 is so close that the next fraction needs a denominator about 30 times '
          + 'larger. The map is almost parabolic, and the disk has three arms, much like the three petals at the root '
          + 'of the 1/3 bulb close by. ',
        'near-2-5': `θ ≈ ${formatNumber(theta, 6)}, with continued fraction digits 2, 2, 30, 1, 1, 1, … Its fractions are 1/2, `
          + '2/5, 61/152, 63/157, 124/309, …: 2/5 is so close that the next fraction needs a denominator about 30 times '
          + 'larger. The map is almost parabolic, and the disk has five arms, much like the five petals at the root '
          + 'of the 2/5 bulb close by. ',
      }[key];
      let step;
      if (n === 0) {
        step = 'The numbered orbit starts on one of the closed curves; move the slider to follow it.';
      } else {
        const turns = n * theta;
        const off = offWhole(turns);
        const digits = Math.max(3, Math.ceil(-Math.log10(off)) + 1);
        const so = records.filter(k => k <= n);
        step = `After ${n.toLocaleString('en')} step${n === 1 ? '' : 's'} the point has gone ${n === 1 ? '' : n}θ ≈ `
          + `${formatNumber(turns, digits)} turns around its curve, ${formatNumber(off, digits)} of a turn from a whole number`
          + `${n > 1 && so[so.length - 1] === n ? ', nearer than after any earlier step' : ''}.`
          + (so.length > 1 ? ` The steps that came nearer than all before: ${listed(so.map(k => k.toLocaleString('en')))}.` : '');
      }
      status.innerHTML = `${intro}${parameter} ${step}`;
      overlay.setAttribute('aria-label', 'The filled Julia set around a Siegel disk, colored by the straightening '
        + `coordinate in rings around the fixed point, with an orbit on one ring and the orbit of 0 along the edge for ${n} `
        + 'steps; the text below describes it.');
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
