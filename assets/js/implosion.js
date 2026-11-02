/* Interactive figure: parabolic implosion at the cusp c = 1/4.

   At c = 1/4 + ε with ε > 0, the parabolic fixed point 1/2 of c = 1/4 has split into the two fixed
   points 1/2 ± i√ε, and in u = z − 1/2 the map is u ↦ u + u² + ε: an orbit passes between them, through
   the gate, in about π/√ε steps. The figure sets π/√ε = N + σ (the steps through the gate, and the
   phase σ, its fractional part) and draws the plane around the cauliflower, the filled Julia set of
   c = 1/4. A point is colored by the number of times its orbit passes through the gate before it
   escapes: dark blue for none, as outside the cauliflower, then teal, amber, coral, violet and green
   for one, two, three, four and five or more; and in light and dark bands, one per step before the
   first passage. A thin cream line is the edge of the cauliflower. Rings mark the two fixed points,
   and white dots the orbit of 0, which is real and creeps through the gate along the real axis, with
   numbered badges where there is room.

   A menu switches to the other side of the cusp, c = 1/4 − δ with π/√δ = N: there the two fixed points
   1/2 ± √δ lie on the real axis, the left one attracts, and the gate is closed. Points that settle
   near it are gray, in bands of the approximate Fatou coordinate
   Φ(u) = log(u − √δ) / log(1 + 2√δ) + log(u + √δ) / log(1 − 2√δ) of u ↦ u + u² − δ, which grows by one
   at each step near either fixed point, where the map multiplies the distance by 1 ± 2√δ, and by
   about one in between (to within 0.02 at 30 steps, where the flow's log((u − √δ)/(u + √δ)) / (2√δ) is
   off by 0.26): once the orbit comes within √δ of the attracting point, the band is k − Re Φ(u_k), and a
   band is 1 / (|Φ′(u_k)|·|dz_k/dz₀|) wide. The orbit of 0 creeps up to the attracting point and stays. Flipping the menu shows the jump at 1/4: the solid
   filled Julia set below turns to dust above, and the lobes appear.

   A step from z to z′ passes through the gate when Re z < 1/2 ≤ Re z′, z lies within 2√ε of 1/2, and
   the segment from z to z′ crosses the line Re z = 1/2 between the fixed points. The bands use the
   time of the first passage, interpolated within its step, and fade to their middle shade where they
   are under 2 pixels wide: a band is about |z′ − z| / |dz/dz₀| wide there. A point is inside the
   cauliflower when its orbit at c = 1/4 reaches the disk of radius PETAL that touches 1/2 from the left;
   in w = −1/(z − 1/2) that disk is the half-plane Re w > 1/(2·PETAL), where w ↦ w + 1 + 1/(w − 1) only
   moves on to the right.

   Built by AtlasKit.setUp for every <figure data-widget="implosion">; data-gate chooses the first
   number of steps through the gate (one of GATES), and the figure starts above the cusp. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const ROWS_PER_TASK = 12;
  // The slider's numbers of steps through the gate. Below about 30 the gate is so wide that orbits jump
  // over parts of it, and the test for a passage no longer matches the picture of a narrow gate.
  const GATES = [30, 50, 100, 200, 500, 1000];
  const PHASES = 10;       // the phase runs over 0, 0.1, …, 0.9
  const PASSES = 5;        // passages counted; more share the last color
  const EDGE_BUDGET = 3000;
  const PETAL = .05;
  // Key and name in the menu of the two sides of the cusp.
  const SIDES = [['above', 'c = 1/4 + ε (gate open)'], ['below', 'c = 1/4 − δ (gate closed)']];
  // Key, name in the menu, and the window: its center and width.
  const WINDOWS = [
    ['whole', 'The whole cauliflower', {re: 0, im: 0}, 2.8],
    ['gate', 'The gate, magnified 4 times', {re: .5, im: 0}, .7],
  ];
  // The light and dark shade of the colors for one, two, three, four and five or more passages, and
  // the colors of points that escape without passing, from quick to slow: those of the flower.
  const LIGHT = [[120, 214, 218], [246, 196, 120], [240, 150, 130], [190, 170, 236], [170, 220, 140]];
  const DARK = [[24, 96, 110], [140, 86, 24], [140, 62, 48], [80, 64, 140], [60, 110, 50]];
  const OUTSIDE = [[12, 24, 40], [40, 70, 105]];
  // The light and dark shade of the points that settle at the attracting fixed point below the cusp.
  const SETTLED = [[222, 228, 236], [92, 102, 118]];
  const EDGE = [255, 241, 200];

  const SUPERSCRIPT = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
  // A positive number with two significant digits: 0.099, 0.0025 or 9.9·10⁻⁶.
  function scientific(x) {
    let exponent = Math.floor(Math.log10(x));
    if (exponent >= -3) return formatNumber(x, Math.max(2, 1 - exponent));
    if (Math.round(x / 10 ** exponent * 10) >= 100) exponent++;
    return `${formatNumber(x / 10 ** exponent, 1)}·10${String(exponent).replace(/[-\d]/g, ch => SUPERSCRIPT[ch])}`;
  }

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // --- one pixel, in a background thread --------------------------------------------

  // The orbit of x0 + iy0 at c = task.c: {passes, steps, first, width}, with the number of passages
  // through the gate (at most PASSES), the steps until it escapes (or the budget, or the step of the
  // last passage counted), the time of the first passage and the width of a band there.
  function passages(task, x0, y0) {
    const {c, root, budget} = task;
    let x = x0;
    let y = y0;
    let dx = 1;   // the derivative of the orbit point by the start, until the first passage
    let dy = 0;
    let passes = 0;
    let first = 0;
    let width = 0;
    for (let k = 0; k < budget; k++) {
      if (x * x + y * y > 4) return {passes, steps: k, first, width};
      const nx = x * x - y * y + c;
      const ny = 2 * x * y;
      if (x < .5 && nx >= .5 && (x - .5) * (x - .5) + y * y < 4 * root * root) {
        const share = (.5 - x) / (nx - x);
        if (Math.abs(y + share * (ny - y)) < root) {
          if (passes === 0) {
            first = k + share;
            width = Math.hypot(nx - x, ny - y) / Math.hypot(dx, dy);
          }
          passes++;
          if (passes === PASSES) return {passes, steps: k, first, width};
        }
      }
      if (passes === 0) {
        const ndx = 2 * (x * dx - y * dy);
        dy = 2 * (x * dy + y * dx);
        dx = ndx;
      }
      x = nx;
      y = ny;
    }
    return {passes, steps: budget, first, width};
  }

  // The orbit of x0 + iy0 at c = task.c below the cusp, where 1/2 − √δ attracts: {settles, steps, time,
  // width}, with whether it comes within √δ of that point, the steps until it does (or escapes, or the
  // budget runs out), the band k − Re Φ(u_k) there and the width of a band.
  function settles(task, x0, y0) {
    const {c, root, budget} = task;
    const attracting = Math.log(1 - 2 * root);
    const repelling = Math.log(1 + 2 * root);
    let x = x0;
    let y = y0;
    let dx = 1;
    let dy = 0;
    for (let k = 0; k < budget; k++) {
      const u = x - .5;
      const far = (u - root) * (u - root) + y * y;
      const near = (u + root) * (u + root) + y * y;
      if (near < root * root) {
        const time = k - Math.log(far) / (2 * repelling) - Math.log(near) / (2 * attracting);
        // Φ′(u) = 1/((u − √δ)·log(1 + 2√δ)) + 1/((u + √δ)·log(1 − 2√δ))
        const slope = Math.hypot((u - root) / (far * repelling) + (u + root) / (near * attracting),
          y / (far * repelling) + y / (near * attracting));
        return {settles: true, steps: k, time, width: 1 / (slope * Math.hypot(dx, dy))};
      }
      if (x * x + y * y > 4) return {settles: false, steps: k, time: 0, width: 0};
      const ndx = 2 * (x * dx - y * dy);
      dy = 2 * (x * dy + y * dx);
      dx = ndx;
      const nx = x * x - y * y + c;
      y = 2 * x * y;
      x = nx;
    }
    return {settles: false, steps: budget, time: 0, width: 0};
  }

  // Whether x0 + iy0 lies in the cauliflower, the filled Julia set of c = 1/4: 1 if its orbit reaches
  // the petal at 1/2 (or the budget runs out), 0 if it escapes.
  function cauliflower(x0, y0) {
    let x = x0;
    let y = y0;
    for (let k = 0; k < EDGE_BUDGET; k++) {
      if ((x - .5 + PETAL) * (x - .5 + PETAL) + y * y < PETAL * PETAL) return 1;
      if (x * x + y * y > 4) return 0;
      const next = x * x - y * y + .25;
      y = 2 * x * y;
      x = next;
    }
    return 1;
  }

  // Rows firstRow … firstRow + rows − 1, as RGBA bytes of the picture or, for task.edge, as the
  // cauliflower's 0s and 1s. Runs in a worker.
  function implosionRows(task) {
    const {view, width, firstRow, rows} = task;
    const size = view.width / width;
    if (task.edge) {
      const inside = new Uint8Array(width * rows);
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < width; column++) {
          inside[row * width + column] = cauliflower(view.left + (column + .5) * size, view.top - (firstRow + row + .5) * size);
        }
      }
      return {inside};
    }
    const pixels = new Uint8ClampedArray(width * rows * 4);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < width; column++) {
        const x = view.left + (column + .5) * size;
        const y = view.top - (firstRow + row + .5) * size;
        const offset = (row * width + column) * 4;
        pixels[offset + 3] = 255;
        if (task.below) {
          const point = settles(task, x, y);
          if (point.settles) {
            const fade = Math.min(1, Math.max(0, (point.width / size - 2) / 4));
            const shade = .5 + .5 * Math.cos(2 * Math.PI * point.time) * fade;
            for (let i = 0; i < 3; i++) pixels[offset + i] = SETTLED[1][i] + (SETTLED[0][i] - SETTLED[1][i]) * shade;
          } else {
            const t = point.steps < task.budget ? Math.min(1, Math.log(1 + point.steps) / Math.log(1000)) : 0;
            for (let i = 0; i < 3; i++) pixels[offset + i] = OUTSIDE[0][i] + (OUTSIDE[1][i] - OUTSIDE[0][i]) * t;
          }
          continue;
        }
        const point = passages(task, x, y);
        if (point.passes > 0) {
          const color = point.passes - 1;
          const fade = Math.min(1, Math.max(0, (point.width / size - 2) / 4));
          const shade = .5 + .5 * Math.cos(2 * Math.PI * point.first) * fade;
          for (let i = 0; i < 3; i++) pixels[offset + i] = DARK[color][i] + (LIGHT[color][i] - DARK[color][i]) * shade;
        } else {
          const t = point.steps < task.budget ? Math.min(1, Math.log(1 + point.steps) / Math.log(1000)) : 0;
          for (let i = 0; i < 3; i++) pixels[offset + i] = OUTSIDE[0][i] + (OUTSIDE[1][i] - OUTSIDE[0][i]) * t;
        }
      }
    }
    return {pixels};
  }

  const pool = kit.workerPool(implosionRows, {
    helpers: [passages, settles, cauliflower],
    constants: {PASSES, EDGE_BUDGET, PETAL, LIGHT, DARK, OUTSIDE, SETTLED},
  });

  // --- the figure -------------------------------------------------------------

  kit.setUp('implosion', (figure, id) => {
    figure.classList.add('widget-plate');
    const firstGate = GATES.includes(Number(figure.dataset.gate)) ? Number(figure.dataset.gate) : 100;
    const state = {side: 'above', window: WINDOWS[0], gate: firstGate, phase: 0};
    const edges = new Map();
    let generation = 0;
    let drawn = '';   // the window and canvas size of the picture on the canvas

    // The parameter, the fixed points and the orbit of 0 for the side, gate and phase shown.
    function current() {
      const below = state.side === 'below';
      const steps = below ? state.gate : state.gate + state.phase / PHASES;   // π/√ε or π/√δ
      const root = Math.PI / steps;
      const epsilon = root * root;
      const budget = Math.round((PASSES + 1) * (steps + 200));
      const orbit = [0];
      if (below) {
        // The orbit of 0 is real: it creeps up to the attracting fixed point 1/2 − √δ, comes within √δ
        // of it, and stays; it is drawn until it is within √δ/100.
        const c = .25 - epsilon;
        const attracting = .5 - root;
        let settled = null;
        while (attracting - orbit[orbit.length - 1] > root / 100) {
          const x = orbit[orbit.length - 1];
          if (settled === null && attracting - x < root) settled = orbit.length - 1;
          orbit.push(x * x + c);
        }
        return {below, steps, root, epsilon, c, orbit, settled, budget,
          fixed: [{re: attracting, im: 0}, {re: .5 + root, im: 0}]};
      }
      // The orbit of 0 is real: it creeps up to 1/2, through the gate, and away.
      const c = .25 + epsilon;
      let passage = null;
      while (Math.abs(orbit[orbit.length - 1]) <= 2) {
        const x = orbit[orbit.length - 1];
        const next = x * x + c;
        if (passage === null && x < .5 && next >= .5) passage = orbit.length - 1;
        orbit.push(next);
      }
      return {below, steps, root, epsilon, c, orbit, passage, escape: orbit.length - 1, budget,
        fixed: [{re: .5, im: root}, {re: .5, im: -root}]};
    }

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    function menu(text, name, entries, onChange) {
      const label = element('label', null, text);
      const select = element('select');
      select.name = name;
      for (const [key, entry] of entries) {
        const option = element('option', null, entry);
        option.value = key;
        select.append(option);
      }
      select.addEventListener('change', () => {
        onChange(select.value);
        show();
      });
      label.append(select);
      return label;
    }
    const sideLabel = menu('Parameter', 'side', SIDES, key => {
      state.side = key;
    });
    const windowLabel = menu('Window', 'window', WINDOWS, key => {
      state.window = WINDOWS.find(([other]) => other === key);
    });

    function slider(text, count, value, onInput) {
      const label = element('label', 'flower-steps', text);
      const row = element('span');
      const input = element('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(count - 1);
      input.step = '1';
      input.value = String(value);
      input.id = `${id}-${text.toLowerCase().replace(/\W+/g, '-')}`;
      const output = element('output');
      output.htmlFor = input.id;
      input.addEventListener('input', () => {
        onInput(Number(input.value));
        show();
      });
      row.append(input, output);
      label.append(row);
      return [label, input, output];
    }
    const [gateLabel, , gateShown] = slider('Steps through the gate', GATES.length, GATES.indexOf(firstGate), index => {
      state.gate = GATES[index];
    });
    // Below the cusp there is no gate and no phase: the slider sets π/√δ, the same distance from 1/4.
    const [phaseLabel, phaseInput, phaseShown] = slider('Phase', PHASES, 0, index => {
      state.phase = index;
    });
    controls.append(sideLabel, windowLabel, gateLabel, phaseLabel);

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
    const status = element('p', 'plate-verdict implosion-status');
    status.setAttribute('aria-live', 'polite');

    const frameOf = ([, , center, width]) => ({left: center.re - width / 2, top: center.im + width * 3 / 8, width, height: width * 3 / 4});

    // The rings at the two fixed points, then the orbit of 0: white dots, and numbered badges at the
    // start, at the step before the passage, at the last step in the window and wherever else they keep
    // clear of the rings and of each other. All keep their size on screen.
    function mark() {
      overlay.replaceChildren();
      const data = current();
      const plane = new kit.Plane(frameOf(state.window), WIDTH, HEIGHT);
      const unit = Math.max(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      const inside = point => point.x >= 0 && point.x <= WIDTH && point.y >= 0 && point.y <= HEIGHT;
      const ring = 6 * unit;
      const posts = data.fixed.map(point => plane.toScreen(point));

      const points = data.orbit.map(x => plane.toScreen({re: x, im: 0}));
      // White dots on dark halos, so that where they crowd near the gate they merge into a white line.
      for (const [className, radius] of [['implosion-orbit-halo', 3.4 * unit], ['implosion-orbit', 2.2 * unit]]) {
        const trail = kit.svg('g', {class: className}, overlay);
        points.forEach(point => {
          if (inside(point)) kit.svg('circle', {cx: point.x, cy: point.y, r: radius}, trail);
        });
      }
      for (const post of posts) {
        kit.svg('circle', {class: 'flower-ring-halo', cx: post.x, cy: post.y, r: ring, 'stroke-width': .72 * ring}, overlay);
        kit.svg('circle', {class: 'flower-ring implosion-post', cx: post.x, cy: post.y, r: ring, 'stroke-width': .31 * ring}, overlay);
      }
      const badge = 11 * unit;
      const lastInside = points.reduce((last, point, k) => (inside(point) ? k : last), 0);
      const order = data.below ? [0, data.settled, ...points.keys()] : [0, data.passage, lastInside, ...points.keys()];
      const placed = [];
      const badges = kit.svg('g', {class: 'flower-badges'}, overlay);
      for (const k of new Set(order)) {
        const point = points[k];
        if (!inside(point)) continue;
        const clear = posts.every(post => Math.hypot(point.x - post.x, point.y - post.y) >= ring + badge + 2 * unit)
          && placed.every(other => Math.abs(point.x - other.x) >= 2.2 * badge);
        if (!clear) continue;
        placed.push(point);
        const group = kit.svg('g', {class: 'flower-point', 'data-step': k}, badges);
        kit.svg('circle', {class: 'flower-badge', cx: point.x, cy: point.y, r: badge, 'stroke-width': 1.5 * unit}, group);
        kit.svg('text', {class: 'flower-number', x: point.x, y: point.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': 14 * unit * (k >= 1000 ? .6 : k >= 100 ? .7 : k >= 10 ? .85 : 1)}, group).textContent = String(k);
      }

      gateLabel.firstChild.textContent = data.below ? 'Closeness to 1/4 (π/√δ)' : 'Steps through the gate';
      gateShown.textContent = state.gate.toLocaleString('en');
      phaseInput.disabled = data.below;
      phaseShown.textContent = data.below ? '–' : formatNumber(state.phase / PHASES, 1);
      describe(data);
    }

    function describe(data) {
      const {steps, root, epsilon, passage, escape} = data;
      const sum = formatNumber(steps, 1);
      if (data.below) {
        const settled = data.settled.toLocaleString('en');
        status.innerHTML = `c = 1/4 − δ with π/√δ = ${sum}, so δ ≈ ${scientific(epsilon)}. The parabolic fixed point 1/2 `
          + 'of c = 1/4 has split into two fixed points on the real axis (orange rings): '
          + `1/2 − ${formatNumber(root, 4)} attracts and 1/2 + ${formatNumber(root, 4)} repels. The gate is closed. `
          + `The orbit of 0 creeps up to the attracting point, comes within ${formatNumber(root, 4)} of it after ${settled} `
          + 'steps, and stays; so does every gray point. The filled Julia set is solid.';
        overlay.setAttribute('aria-label', `The plane around the cauliflower at c = 1/4 − δ with π/√δ = ${sum}: the points `
          + 'that settle at the attracting fixed point are gray, with the orbit of 0; the text below describes it.');
        return;
      }
      status.innerHTML = `c = 1/4 + ε with π/√ε = ${sum}, so ε ≈ ${scientific(epsilon)}. The `
        + 'parabolic fixed point 1/2 of c = 1/4 has split into the two fixed points '
        + `1/2 ± ${formatNumber(root, 4)}<var>i</var> (orange rings), and the gate between them is open. The orbit of 0 `
        + `creeps through it between steps ${passage.toLocaleString('en')} and ${(passage + 1).toLocaleString('en')} and leaves `
        + `the disk of radius 2 after ${escape.toLocaleString('en')} steps; ${escape.toLocaleString('en')}·√ε ≈ `
        + `${formatNumber(escape * root, 3)}, which approaches π as ε shrinks.`;
      overlay.setAttribute('aria-label', `The plane around the cauliflower at c = 1/4 + ε with π/√ε = ${sum}, colored by `
        + 'the number of passages through the gate between the two fixed points, with the orbit of 0; the text below '
        + 'describes it.');
    }

    // --- the picture -----------------------------------------------------------

    // The cauliflower's 0s and 1s for the window and canvas size shown, computed once.
    async function edgeOf(request, frame, width, height) {
      const key = `${state.window[0]} ${width} ${height}`;
      if (edges.has(key)) return edges.get(key);
      const inside = new Uint8Array(width * height);
      const tasks = [];
      for (let firstRow = 0; firstRow < height; firstRow += ROWS_PER_TASK) {
        tasks.push({edge: true, view: frame, width, height, firstRow, rows: Math.min(ROWS_PER_TASK, height - firstRow)});
      }
      const done = await pool.run(tasks, () => request === generation, (part, result) => {
        inside.set(result.inside, part.firstRow * width);
      });
      if (!done) return null;
      edges.set(key, inside);
      return inside;
    }

    async function show() {
      const request = ++generation;
      delete figure.dataset.drawn;
      mark();
      if (!near) return;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      const frame = frameOf(state.window);
      const {width, height} = canvas;
      if (drawn !== `${state.window[0]} ${width} ${height}`) {
        context.clearRect(0, 0, width, height);
        drawn = `${state.window[0]} ${width} ${height}`;
      }
      const inside = await edgeOf(request, frame, width, height);
      if (!inside || request !== generation) return;
      const {below, c, root, budget} = current();
      const tasks = [];
      for (let firstRow = 0; firstRow < height; firstRow += ROWS_PER_TASK) {
        tasks.push({below, c, root, budget, view: frame, width, height, firstRow, rows: Math.min(ROWS_PER_TASK, height - firstRow)});
      }
      // The edge of the cauliflower: the pixels whose right or lower neighbor lies on its other side.
      const edge = (row, column) => {
        const here = inside[row * width + column];
        return (column + 1 < width && inside[row * width + column + 1] !== here)
          || (row + 1 < height && inside[(row + 1) * width + column] !== here);
      };
      const done = await pool.run(tasks, () => request === generation, (part, {pixels}) => {
        for (let row = 0; row < part.rows; row++) {
          for (let column = 0; column < width; column++) {
            if (!edge(part.firstRow + row, column)) continue;
            const offset = (row * width + column) * 4;
            for (let i = 0; i < 3; i++) pixels[offset + i] = .2 * pixels[offset + i] + .8 * EDGE[i];
          }
        }
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
