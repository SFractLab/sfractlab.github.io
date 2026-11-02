/* Interactive figure: where the orbit of 0 lands after each passage through the gate near −1/2.

   Deep in seahorse valley the orbit of 0 creeps through the gate near −1/2 and comes out. Between two
   passages it moves almost as under z² − 3/4: if it lands inside the filled Julia set of −3/4, it creeps
   back for another passage; if it lands outside, it escapes. The figure draws that filled Julia set
   around −1/2, light gray with its edge in red, and over it, for each parameter of the first window of
   the passages figure (valley-passages.js), a dot where its orbit lands after the first, second or third
   passage, in the color of its number of passages there. After the first passage the dots form a bent
   copy of the valley; after each passage those of the parameters that escape next lie outside the set,
   the others inside.

   A landing is the first point of the orbit at least AWAY from −1/2 after it has come within NEAR of
   −1/2, or the point after it if that one lies below the real axis, so that all landings lie above it.
   Nearer to −1/2 the orbit still feels the difference between c and −3/4: at a distance of 0.15, only 39%
   of the parameters that escape after one passage land outside (notes/scripts/landing-figure/).

   A menu picks an example parameter, and a click or tap on a dot picks the parameter that landed there.
   Its orbit is drawn as white dots, with numbered badges at its landings. The status line gives, for the
   passage shown, the share of the landings that lie on the side their number of passages predicts, and
   follows the orbit.

   Built by AtlasKit.setUp for every <figure data-widget="landing">. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const ROWS_PER_TASK = 12;
  // The parameters: the first window of the passages figure, one per pixel of its design size.
  const VALLEY = {re: -0.7500234, im: 0.00635796, width: 0.000139};
  const COLUMNS = 640;
  const ROWS = 480;
  const BUDGET = 6000;
  const NEAR = .08;
  const AWAY = .45;
  const LANDINGS = 3;      // landings kept for each parameter, one menu entry each
  const BADGES = 4;        // landings marked on the orbit of the chosen parameter
  // The dynamical plane around the landings, with the gate at −1/2 near the bottom.
  const FRAME = {left: -1.03, top: .7, width: 1.12, height: .84};
  // z lies in the filled Julia set of −3/4 once Re 1/(z + 1/2)² > PETAL: there w = 1/(z + 1/2)² grows by
  // about 4 every two steps, so the orbit stays and creeps into −1/2.
  const PETAL = 25;
  const JULIA_BUDGET = 3000;
  // One passage, two, three, four, five or more, and not escaped: the colors of the passages figure.
  const PASSAGE_COLORS = [[227, 232, 196], [236, 166, 100], [30, 135, 151], [27, 75, 119], [125, 132, 140]];
  const PASSAGE_NAMES = ['one passage', 'two', 'three', 'four', 'five or more'];
  const COLOR_NAMES = ['cream', 'orange', 'teal', 'blue', 'gray'];
  const INTERIOR = [9, 19, 32];
  const INSIDE = [200, 207, 217];
  const OUTSIDE = [44, 62, 88];
  const EDGE = [255, 92, 112];
  const ORDINALS = ['first', 'second', 'third'];
  const COUNTS = ['one', 'two', 'three', 'four'];
  // Key, name in the menu and parameter of the examples, each deep inside its region.
  const EXAMPLES = [
    ['one', 'One passage: the middle of the valley', {re: -0.7500282867, im: 0.0063624123}],
    ['ghost', 'Two passages: a ghost bulb', {re: -0.7500708555, im: 0.0063730545}],
    ['lobe', 'Two passages: a small lobe beside it', {re: -0.7500582586, im: 0.0063800045}],
    ['three', 'Three passages', {re: -0.7500771539, im: 0.0063939045}],
  ];
  const PICKED = 'picked';

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // --- one orbit, in a background thread or on the page ----------------------------

  // The orbit of 0 at c = cx + i·cy: {escape, lands}, with the step at which |z| first exceeds 2 (0 if
  // not within BUDGET) and the first `limit` landings as x, y and step, one after the other. With an
  // array `orbit`, its points are pushed onto it as x, y.
  function follow(cx, cy, limit, orbit) {
    let x = 0;
    let y = 0;
    let near = false;
    let pending = false;   // the first point AWAY from −1/2 lay below the real axis: take the next one
    const lands = [];
    for (let n = 1; n <= BUDGET; n++) {
      const next = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = next;
      if (orbit) orbit.push(x, y);
      if (x * x + y * y > 4) return {escape: n, lands};
      const distance = (x + .5) * (x + .5) + y * y;
      if (pending || (near && distance >= AWAY * AWAY && y > 0)) {
        if (lands.length < 3 * limit) lands.push(x, y, n);
        near = false;
        pending = false;
      } else if (near && distance >= AWAY * AWAY) {
        pending = true;
        near = false;
      }
      if (!pending && distance < NEAR * NEAR) near = true;
    }
    return {escape: 0, lands};
  }

  // Whether x + iy lies in the filled Julia set of −3/4: 1 once its orbit reaches the petal of −1/2
  // (or the budget runs out), 0 if it escapes.
  function inJulia(x, y) {
    for (let k = 0; k < JULIA_BUDGET; k++) {
      const u = x + .5;
      const size = u * u + y * y;
      if (u * u - y * y > PETAL * size * size) return 1;   // Re 1/u² = Re ū² / |u|⁴
      if (x * x + y * y > 4) return 0;
      const next = x * x - y * y - .75;
      y = 2 * x * y;
      x = next;
    }
    return 1;
  }

  // The number of passages at c: the escape step in units of the passage time π/|c + 3/4|, rounded, as in
  // the passages figure; 0 if the orbit has not escaped.
  function passagesAt(cx, cy, escape) {
    return escape ? Math.min(255, Math.max(1, Math.round(escape * Math.hypot(cx + .75, cy) / Math.PI))) : 0;
  }

  // Rows firstRow … firstRow + rows − 1 of the parameters, with their passages, landings and whether each
  // landing lies in the filled Julia set; or, for task.julia, rows of the canvas as that set's 0s and 1s.
  // Runs in a worker.
  function landingRows(task) {
    const {firstRow, rows} = task;
    if (task.julia) {
      const {view, width} = task;
      const size = view.width / width;
      const inside = new Uint8Array(width * rows);
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < width; column++) {
          inside[row * width + column] = inJulia(view.left + (column + .5) * size, view.top - (firstRow + row + .5) * size);
        }
      }
      return {inside};
    }
    const size = VALLEY.width / COLUMNS;
    const left = VALLEY.re - VALLEY.width / 2;
    const top = VALLEY.im + size * ROWS / 2;
    const passages = new Uint8Array(rows * COLUMNS);
    const lands = new Float32Array(rows * COLUMNS * 2 * LANDINGS).fill(NaN);
    const inside = new Uint8Array(rows * COLUMNS * LANDINGS);
    for (let row = 0; row < rows; row++) {
      const cy = top - (firstRow + row + .5) * size;
      for (let column = 0; column < COLUMNS; column++) {
        const cx = left + (column + .5) * size;
        if (inCardioidOrPeriodTwoDisk(cx, cy)) continue;
        const index = row * COLUMNS + column;
        const orbit = follow(cx, cy, LANDINGS, null);
        passages[index] = passagesAt(cx, cy, orbit.escape);
        for (let j = 0; 3 * j < orbit.lands.length; j++) {
          const [x, y] = orbit.lands.slice(3 * j, 3 * j + 2);
          lands[2 * (index * LANDINGS + j)] = x;
          lands[2 * (index * LANDINGS + j) + 1] = y;
          inside[index * LANDINGS + j] = inJulia(x, y);
        }
      }
    }
    return {passages, lands, inside};
  }

  const pool = kit.workerPool(landingRows, {
    helpers: [follow, inJulia, passagesAt, kit.inCardioidOrPeriodTwoDisk],
    constants: {VALLEY, COLUMNS, ROWS, BUDGET, NEAR, AWAY, LANDINGS, PETAL, JULIA_BUDGET},
  });

  // The parameters' passages and landings, computed once for the page, when a figure first needs them.
  const data = {
    passages: new Uint8Array(COLUMNS * ROWS),
    lands: new Float32Array(COLUMNS * ROWS * 2 * LANDINGS).fill(NaN),
    inside: new Uint8Array(COLUMNS * ROWS * LANDINGS),
    done: false,
  };
  let pass = null;
  const listeners = [];
  function parameters(onPart) {
    listeners.push(onPart);
    if (!pass) {
      const tasks = [];
      for (let firstRow = 0; firstRow < ROWS; firstRow += ROWS_PER_TASK) {
        tasks.push({firstRow, rows: Math.min(ROWS_PER_TASK, ROWS - firstRow)});
      }
      pass = pool.run(tasks, () => true, (task, result) => {
        data.passages.set(result.passages, task.firstRow * COLUMNS);
        data.lands.set(result.lands, task.firstRow * COLUMNS * 2 * LANDINGS);
        data.inside.set(result.inside, task.firstRow * COLUMNS * LANDINGS);
        for (const listener of listeners) listener();
      }).then(done => {
        data.done = done;
        return done;
      });
    }
    return pass;
  }

  // --- the figure -------------------------------------------------------------

  kit.setUp('landing', (figure) => {
    figure.classList.add('widget-plate');
    const state = {landing: 0, example: EXAMPLES[1][0], picked: null};
    const julias = new Map();
    let generation = 0;
    let owners = null;   // for each pixel of the canvas, the parameter whose dot is there, or −1

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
      select.addEventListener('change', () => onChange(select.value));
      label.append(select);
      return [label, select];
    }
    const [landingLabel] = menu('Landings after', 'landing',
      ORDINALS.map((ordinal, j) => [String(j), `the ${ordinal} passage`]), key => {
        state.landing = Number(key);
        show();
      });
    const [exampleLabel, exampleSelect] = menu('Orbit of 0 for', 'example',
      [...EXAMPLES, [PICKED, 'The dot you picked']], key => {
        state.example = key;
        describe(mark());
      });
    const pickedOption = exampleSelect.querySelector(`option[value="${PICKED}"]`);
    pickedOption.hidden = true;
    pickedOption.disabled = true;
    exampleSelect.value = state.example;
    controls.append(landingLabel, exampleLabel);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.setAttribute('aria-hidden', 'true');
    const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay'});
    overlay.setAttribute('role', 'img');
    view.append(canvas, overlay);
    const legend = element('p', 'plate-caption passages-legend');
    legend.innerHTML = PASSAGE_NAMES.map((name, k) => `<span class="passages-swatch passages-${k + 1}"></span> ${name}`)
      .join(' ') + ' <span class="passages-swatch passages-0"></span> not escaped'
      + ' <span class="passages-swatch landing-julia"></span> filled Julia set of −3/4'
      + ' <span class="passages-swatch landing-edge"></span> its edge';
    const status = element('p', 'plate-verdict landing-status');
    status.setAttribute('aria-live', 'polite');

    // The chosen parameter and its orbit: the points, the escape step, the passages and the landings,
    // each with its step and whether it lies in the filled Julia set.
    function chosen() {
      const c = state.example === PICKED ? state.picked : EXAMPLES.find(([key]) => key === state.example)[2];
      const points = [];
      const {escape, lands} = follow(c.re, c.im, Infinity, points);
      const landings = [];
      for (let j = 0; 3 * j < lands.length; j++) {
        const [re, im, step] = lands.slice(3 * j, 3 * j + 3);
        landings.push({re, im, step, inside: inJulia(re, im) === 1});
      }
      return {c, points, escape, landings, passages: passagesAt(c.re, c.im, escape)};
    }

    // The ring at the gate, then the orbit of the chosen parameter as white dots on dark halos, up to its
    // escape or its BADGES-th landing, and numbered badges at its landings. All keep their size on screen.
    function mark() {
      overlay.replaceChildren();
      const orbit = chosen();
      const plane = new kit.Plane(FRAME, WIDTH, HEIGHT);
      const unit = Math.max(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      const inside = point => point.x >= 0 && point.x <= WIDTH && point.y >= 0 && point.y <= HEIGHT;
      const last = orbit.landings.length > BADGES ? orbit.landings[BADGES - 1].step : orbit.points.length / 2;
      const points = [];
      for (let k = 0; k < last; k++) points.push(plane.toScreen({re: orbit.points[2 * k], im: orbit.points[2 * k + 1]}));
      for (const [className, radius] of [['implosion-orbit-halo', 2.6 * unit], ['implosion-orbit', 1.6 * unit]]) {
        const trail = kit.svg('g', {class: className}, overlay);
        for (const point of points) {
          if (inside(point)) kit.svg('circle', {cx: point.x, cy: point.y, r: radius}, trail);
        }
      }
      const gate = plane.toScreen({re: -.5, im: 0});
      const ring = 6 * unit;
      kit.svg('circle', {class: 'flower-ring-halo', cx: gate.x, cy: gate.y, r: ring, 'stroke-width': .72 * ring}, overlay);
      kit.svg('circle', {class: 'flower-ring', cx: gate.x, cy: gate.y, r: ring, 'stroke-width': .31 * ring}, overlay);
      const badge = 11 * unit;
      const badges = kit.svg('g', {class: 'flower-badges'}, overlay);
      orbit.landings.slice(0, BADGES).forEach((landing, j) => {
        const point = plane.toScreen(landing);
        if (!inside(point)) return;
        const group = kit.svg('g', {class: 'flower-point', 'data-landing': j + 1, 'data-inside': landing.inside}, badges);
        kit.svg('circle', {class: 'flower-badge', cx: point.x, cy: point.y, r: badge, 'stroke-width': 1.5 * unit}, group);
        kit.svg('text', {class: 'flower-number', x: point.x, y: point.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': 14 * unit}, group).textContent = String(j + 1);
      });
      return orbit;
    }

    // --- the status line -------------------------------------------------------

    const percent = (part, whole) => `${formatNumber(whole ? 100 * part / whole : 0, 1)}%`;

    // For the passage shown: how many parameters land after it, and the shares on the predicted side.
    function summary() {
      if (!data.done) return 'Computing the landings…';
      const j = state.landing;
      let landed = 0;
      let last = 0;
      let lastOutside = 0;
      let again = 0;
      let againInside = 0;
      for (let index = 0; index < COLUMNS * ROWS; index++) {
        if (Number.isNaN(data.lands[2 * (index * LANDINGS + j)])) continue;
        landed++;
        const passages = data.passages[index];
        const inside = data.inside[index * LANDINGS + j];
        if (passages === j + 1) {
          last++;
          lastOutside += 1 - inside;
        } else if (passages > j + 1 || passages === 0) {
          again++;
          againInside += inside;
        }
      }
      const whom = j === 0 ? `of the ${(COLUMNS * ROWS).toLocaleString('en')} parameters of the passages figure’s first window`
        : `of the parameters that pass a ${ORDINALS[j]} time`;
      return `Landings after the ${ORDINALS[j]} passage: ${landed.toLocaleString('en')}, ${whom}. `
        + `Of those that escape right after it (${last.toLocaleString('en')}), ${percent(lastOutside, last)} landed outside the filled `
        + `Julia set of −3/4; of those that pass again or do not escape within ${BUDGET.toLocaleString('en')} steps `
        + `(${again.toLocaleString('en')}), ${percent(againInside, again)} landed inside.`;
    }

    // The chosen parameter's orbit in words.
    function story(orbit) {
      const {c, escape, landings, passages} = orbit;
      const color = passages ? COLOR_NAMES[Math.min(passages, COLOR_NAMES.length) - 1] : 'dark';
      const count = passages ? `${COUNTS[passages - 1] || passages.toLocaleString('en')} passage${passages > 1 ? 's' : ''}` : 'not escaped';
      const parts = landings.slice(0, BADGES).map((landing, j) => `${landing.inside ? 'inside' : 'outside'}`
        + `${j ? '' : ' the filled Julia set of −3/4'} after ${landing.step.toLocaleString('en')} steps (${j + 1})`);
      const more = landings.length > BADGES ? `, and ${landings.length - BADGES} more times inside` : '';
      const end = escape ? `It escapes after ${escape.toLocaleString('en')} steps.`
        : `It has not escaped after ${BUDGET.toLocaleString('en')} steps.`;
      return `The orbit of 0 for c = ${format(c, 8)} (${count}, ${color} in the figure above) lands ${parts.join(', then ')}${more}. ${end}`;
    }

    function describe(orbit = chosen()) {
      status.textContent = `${summary()} ${story(orbit)}`;
      overlay.setAttribute('aria-label', `The filled Julia set of −3/4 around −1/2, with a dot where the orbit of each parameter `
        + `of seahorse valley lands after its ${ORDINALS[state.landing]} passage, colored by its number of passages, and the `
        + 'orbit of 0 of one parameter; the text below describes them.');
    }

    // --- the picture -----------------------------------------------------------

    // The filled Julia set's 0s and 1s for the canvas size shown, computed once.
    async function juliaOf(request, width, height) {
      const key = `${width} ${height}`;
      if (julias.has(key)) return julias.get(key);
      const inside = new Uint8Array(width * height);
      const tasks = [];
      for (let firstRow = 0; firstRow < height; firstRow += ROWS_PER_TASK) {
        tasks.push({julia: true, view: FRAME, width, firstRow, rows: Math.min(ROWS_PER_TASK, height - firstRow)});
      }
      const done = await pool.run(tasks, () => request === generation, (part, result) => {
        inside.set(result.inside, part.firstRow * width);
      });
      if (!done) return null;
      julias.set(key, inside);
      return inside;
    }

    // Paints the filled Julia set, the dots of the landings shown, and the set's edge over them. Each dot
    // covers a square of at least one pixel of the design size. Where the landings spread apart, a pixel
    // left between dots takes the dot of a neighbor: first if it has dots on three or four sides, then if
    // it has dots on two opposite sides.
    function paint(julia) {
      const {width, height} = canvas;
      const j = state.landing;
      const dot = Math.max(1, Math.ceil(width / WIDTH));
      const dots = new Int32Array(width * height).fill(-1);
      for (let index = 0; index < COLUMNS * ROWS; index++) {
        const x = data.lands[2 * (index * LANDINGS + j)];
        if (Number.isNaN(x)) continue;
        const y = data.lands[2 * (index * LANDINGS + j) + 1];
        const column = Math.floor((x - FRAME.left) / FRAME.width * width);
        const row = Math.floor((FRAME.top - y) / FRAME.height * height);
        for (let r = row; r < row + dot; r++) {
          for (let s = column; s < column + dot; s++) {
            if (r >= 0 && r < height && s >= 0 && s < width) dots[r * width + s] = index;
          }
        }
      }
      owners = dots;
      for (const opposite of [false, true]) {
        const before = owners.slice();
        for (let row = 1; row < height - 1; row++) {
          for (let column = 1; column < width - 1; column++) {
            const here = row * width + column;
            if (before[here] >= 0) continue;
            const [left, right, up, down] = [here - 1, here + 1, here - width, here + width].map(other => before[other]);
            if (opposite) {
              if (left >= 0 && right >= 0) owners[here] = left;
              else if (up >= 0 && down >= 0) owners[here] = up;
            } else if ((left >= 0) + (right >= 0) + (up >= 0) + (down >= 0) >= 3) {
              owners[here] = Math.max(left, right, up, down);
            }
          }
        }
      }
      const image = context.createImageData(width, height);
      for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
          const here = row * width + column;
          const inside = julia[here];
          let color;
          if ((column + 1 < width && julia[here + 1] !== inside) || (row + 1 < height && julia[here + width] !== inside)) {
            color = EDGE;
          } else if (owners[here] >= 0) {
            const passages = data.passages[owners[here]];
            color = passages ? PASSAGE_COLORS[Math.min(passages, PASSAGE_COLORS.length) - 1] : INTERIOR;
          } else {
            color = inside ? INSIDE : OUTSIDE;
          }
          image.data.set(color, 4 * here);
          image.data[4 * here + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
    }

    // Paints at the next animation frame, once however many parts of the pass arrive before it.
    let pending = false;
    function paintSoon(julia) {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (julia.length === canvas.width * canvas.height) paint(julia);
      });
    }

    async function show() {
      const request = ++generation;
      delete figure.dataset.drawn;
      describe(mark());
      if (!near) return;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      const julia = await juliaOf(request, canvas.width, canvas.height);
      if (!julia || request !== generation) return;
      if (!data.done) {
        paint(julia);
        if (!await parameters(() => {
          if (request === generation) paintSoon(julia);
        }) || request !== generation) return;
      }
      paint(julia);
      describe();
      figure.dataset.drawn = '';
    }

    // A click or tap on a dot picks the parameter that landed there: the nearest dot within 8 pixels on
    // screen.
    overlay.addEventListener('click', event => {
      if (!owners || !data.done) return;
      const box = overlay.getBoundingClientRect();
      const scale = canvas.width / box.width;
      const x = (event.clientX - box.left) * scale;
      const y = (event.clientY - box.top) * scale;
      const reach = 8 * scale;
      let best = -1;
      let nearest = Infinity;
      for (let row = Math.max(0, Math.floor(y - reach)); row <= Math.min(canvas.height - 1, y + reach); row++) {
        for (let column = Math.max(0, Math.floor(x - reach)); column <= Math.min(canvas.width - 1, x + reach); column++) {
          const owner = owners[row * canvas.width + column];
          const distance = Math.hypot(column + .5 - x, row + .5 - y);
          if (owner >= 0 && distance < nearest && distance <= reach) {
            best = owner;
            nearest = distance;
          }
        }
      }
      if (best < 0) return;
      const size = VALLEY.width / COLUMNS;
      state.picked = {
        re: VALLEY.re - VALLEY.width / 2 + (best % COLUMNS + .5) * size,
        im: VALLEY.im + size * ROWS / 2 - (Math.floor(best / COLUMNS) + .5) * size,
      };
      state.example = PICKED;
      pickedOption.hidden = false;
      pickedOption.disabled = false;
      exampleSelect.value = PICKED;
      describe(mark());
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, legend, status]) figure.insertBefore(part, caption);
    describe(mark());
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
