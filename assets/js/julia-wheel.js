/* Interactive figure: the wheel at α in the Julia set of a satellite bulb.

   At the center of the p/q bulb of the main cardioid, the orbit of the critical
   point 0 is a cycle of period q, and its q points lie in the q lobes of the
   filled Julia set that meet at the fixed point α = (1 − √(1 − 4c))/2, with the
   principal square root. The figure draws the Julia set around α by the distance
   estimate, as the Julia-centers figure does, rings α, numbers the points of the
   cycle 0, 1, …, q − 1 in the order the map visits them (k marks f_c^k(0)), and
   joins each to the next by an arrow. The window is centered on α and the cycle
   together, and has the same width for every bulb. Around α the numbers advance by p places
   at every step: the map turns the q arms at α by p of q places.

   One bulb sits on the period-two disk instead, and its cycle has period 2q. There
   the old two-cycle a, b, the roots of z² + z + c + 1, repels, and q lobes meet at
   each of its points: two wheels. The map carries the cycle from one to the other,
   the even points around a and the odd ones around b. Each wheel gets one half of
   the picture, on a window around it and its points, and its arrows join each
   point to the one two steps on: every two steps the wheel turns by p of q places.

   Built by AtlasKit.setUp for every <figure data-widget="julia-wheel">;
   data-example chooses the first bulb (a key of EXAMPLES). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  // Width of the window. With a margin of 0.15 around α and the cycle, the 1/4 bulb needs 1.506
  // (its height, 0.829 + 0.3, over 3/4), the others less.
  const SPAN = 1.52;
  // On the period-two disk, the width of each half's window, in multiples of the distance from the
  // center of its wheel to the furthest of its points.
  const PANEL = 2.2;
  const BUDGET = 1000;
  const RADIUS = 1000;  // escape radius for the distance estimate

  // Key, name in the menu, p, q, and the center of the p/q bulb (a root of f_c^q(0) = 0, found by
  // Newton's method; around α its cycle advances by p places, as checked when the bulbs were chosen).
  // A seventh entry of 2 marks a bulb on the period-two disk: its center is a root of f_c^2q(0) = 0.
  const EXAMPLES = [
    ['1-3', '1/3 bulb, Douady’s rabbit', 1, 3, -0.122561166876654, 0.744861766619744],
    ['1-4', '1/4 bulb', 1, 4, 0.282271390766914, 0.530060617578525],
    ['1-5', '1/5 bulb', 1, 5, 0.379513588015924, 0.334932305597498],
    ['2-5', '2/5 bulb', 2, 5, -0.504340175446244, 0.562765761452982],
    ['3-8', '3/8 bulb', 3, 8, -0.359102390112449, 0.617353453398827],
    ['disk-1-3', '1/3 bulb on the period-two disk', 1, 3, -1.138000666650965, 0.240332401262098, 2],
  ];
  const COUNTS = {3: 'three', 4: 'four', 5: 'five', 6: 'six', 8: 'eight'};
  const PLACES = {1: 'one place', 2: 'two places', 3: 'three places'};
  const TIMES = {1: 'once', 2: 'twice', 3: 'three times'};

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The principal square root of x + iy, from real square roots.
  function sqrt(x, y) {
    const size = Math.hypot(x, y);
    const re = Math.sqrt((size + x) / 2);
    const im = Math.sqrt(Math.max(0, (size - x) / 2));
    return {re, im: y < 0 ? -im : im};
  }

  // α = (1 − √(1 − 4c))/2.
  function alphaOf(c) {
    const root = sqrt(1 - 4 * c.re, -4 * c.im);
    return {re: (1 - root.re) / 2, im: -root.im / 2};
  }

  // The points a and b of the two-cycle, (−1 ± √(−3 − 4c))/2; a is the one nearer to 0.
  function twoCycleOf(c) {
    const root = sqrt(-3 - 4 * c.re, -4 * c.im);
    const ends = [{re: (-1 + root.re) / 2, im: root.im / 2}, {re: (-1 - root.re) / 2, im: -root.im / 2}];
    return Math.hypot(ends[0].re, ends[0].im) <= Math.hypot(ends[1].re, ends[1].im) ? ends : ends.reverse();
  }

  // A window of the given width, centered on the points, for a picture `pixels` wide and HEIGHT high.
  function windowAround(points, width, pixels) {
    const xs = points.map(z => z.re);
    const ys = points.map(z => z.im);
    const height = width * HEIGHT / pixels;
    return {left: (Math.min(...xs) + Math.max(...xs) - width) / 2, top: (Math.min(...ys) + Math.max(...ys) + height) / 2,
      width, height};
  }

  // The distance from a point to the segment from a to b.
  function distance(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
  }

  // The points 0, c, f_c(c), … of the critical cycle, q of them.
  function cycleOf(c, q) {
    const points = [];
    let z = {re: 0, im: 0};
    for (let k = 0; k < q; k++) {
      points.push(z);
      z = {re: z.re * z.re - z.im * z.im + c.re, im: 2 * z.re * z.im + c.im};
    }
    return points;
  }

  kit.setUp('julia-wheel', (figure) => {
    figure.classList.add('widget-plate');
    const first = EXAMPLES.find(([key]) => key === figure.dataset.example) || EXAMPLES[0];
    const state = {example: first};
    let generation = 0;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const exampleLabel = element('label', null, 'Julia set');
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
    controls.append(exampleLabel);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay wheel-overlay'});
    overlay.setAttribute('role', 'img');
    view.append(canvas, overlay);
    const status = element('p', 'plate-verdict wheel-status');
    status.setAttribute('aria-live', 'polite');
    // Strips are painted here first, then copied onto the picture down to the first one missing.
    const buffer = element('canvas');
    const bufferContext = buffer.getContext('2d');

    const parameter = () => ({re: state.example[4], im: state.example[5]});
    const onDisk = () => state.example[6] === 2;

    // The wheels: the name and point of each center, the steps k of the cycle around it, the part of
    // the picture it is drawn in (from x, `pixels` wide, in the overlay's units) and its window.
    function wheels() {
      const c = parameter();
      if (!onDisk()) {
        const cycle = cycleOf(c, state.example[3]);
        const alpha = alphaOf(c);
        return [{name: 'α', center: alpha, steps: cycle.map((z, k) => k), x: 0, pixels: WIDTH,
          window: windowAround([alpha, ...cycle], SPAN, WIDTH)}];
      }
      const cycle = cycleOf(c, 2 * state.example[3]);
      return twoCycleOf(c).map((center, side) => {
        const steps = cycle.map((z, k) => k).filter(k => k % 2 === side);
        const reach = Math.max(...steps.map(k => Math.hypot(cycle[k].re - center.re, cycle[k].im - center.im)));
        return {name: 'ab'[side], center, steps, x: side * WIDTH / 2, pixels: WIDTH / 2,
          window: windowAround([center, ...steps.map(k => cycle[k])], PANEL * reach, WIDTH / 2)};
      });
    }

    // Arrows from each point of a wheel to the next one on it, then the ring at its center, then the
    // numbered badges, in the overlay's own units; all keep their size on screen. The label of the
    // center goes above or below the ring, to its right or left, wherever it keeps furthest from the
    // arrows and badges without leaving its part of the picture.
    function mark() {
      overlay.replaceChildren();
      const [, name, , q] = state.example;
      const c = parameter();
      const unit = Math.max(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      const badge = 11 * unit;
      const size = 18.75 * unit;
      const cycle = cycleOf(c, onDisk() ? 2 * q : q);
      const all = wheels();
      if (all.length > 1) {
        kit.svg('line', {class: 'wheel-divider', x1: WIDTH / 2, y1: 0, x2: WIDTH / 2, y2: HEIGHT, 'stroke-width': 3 * unit},
          overlay);
      }
      const arrows = kit.svg('g', {class: 'wheel-arrows'}, overlay);
      const badges = [];
      for (const wheel of all) {
        const plane = new kit.Plane(wheel.window, wheel.pixels, HEIGHT);
        const screen = z => {
          const point = plane.toScreen(z);
          return {x: point.x + wheel.x, y: point.y};
        };
        const points = wheel.steps.map(k => screen(cycle[k]));
        const segments = [];
        points.forEach((from, i) => {
          const to = points[(i + 1) % points.length];
          const length = Math.hypot(to.x - from.x, to.y - from.y);
          const ux = (to.x - from.x) / length;
          const uy = (to.y - from.y) / length;
          const start = {x: from.x + ux * (badge + 4 * unit), y: from.y + uy * (badge + 4 * unit)};
          const tip = {x: to.x - ux * (badge + 4 * unit), y: to.y - uy * (badge + 4 * unit)};
          const head = 11 * unit;
          const base = {x: tip.x - ux * head, y: tip.y - uy * head};
          const wing = 5 * unit;
          const headPath = `M${tip.x} ${tip.y}L${base.x - uy * wing} ${base.y + ux * wing}`
            + `L${base.x + uy * wing} ${base.y - ux * wing}Z`;
          const group = kit.svg('g', {class: 'wheel-arrow', 'data-from': wheel.steps[i],
            'data-to': wheel.steps[(i + 1) % points.length]}, arrows);
          const line = {x1: start.x, y1: start.y, x2: base.x, y2: base.y};
          segments.push([start, tip]);
          kit.svg('line', {...line, class: 'wheel-halo', 'stroke-width': 5.5 * unit}, group);
          kit.svg('path', {d: headPath, class: 'wheel-halo', 'stroke-width': 3.5 * unit}, group);
          kit.svg('line', {...line, class: 'wheel-line', 'stroke-width': 2 * unit}, group);
          kit.svg('path', {d: headPath, class: 'wheel-head'}, group);
        });
        const center = screen(wheel.center);
        const ring = kit.svg('g', {class: 'wheel-alpha', 'data-name': wheel.name}, overlay);
        kit.svg('circle', {class: 'wheel-ring-halo', cx: center.x, cy: center.y, r: 10.5 * unit,
          'stroke-width': 7.5 * unit}, ring);
        kit.svg('circle', {class: 'wheel-ring', cx: center.x, cy: center.y, r: 10.5 * unit,
          'stroke-width': 3.3 * unit}, ring);
        const spots = [[1, -1], [-1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
          // The label's middle, about half a character beside and half its height above the baseline.
          const x = center.x + sx * (14 * unit + .3 * size);
          const y = center.y + (sy < 0 ? -12 * unit : 12 * unit + .7 * size) - .35 * size;
          const fits = x - .5 * size >= wheel.x && x + .5 * size <= wheel.x + wheel.pixels;
          const room = Math.min(...segments.map(([a, b]) => distance({x, y}, a, b)),
            ...points.map(point => Math.hypot(x - point.x, y - point.y) - badge));
          return {sx, sy, room: fits ? room : -Infinity};
        });
        const spot = spots.reduce((best, next) => next.room > best.room + .5 ? next : best);
        kit.svg('text', {class: 'wheel-label', x: center.x + spot.sx * 14 * unit,
          y: center.y + (spot.sy < 0 ? -12 * unit : 12 * unit + .7 * size), 'text-anchor': spot.sx < 0 ? 'end' : 'start',
          'font-size': size, 'stroke-width': 5 * unit}, ring).textContent = wheel.name;
        wheel.steps.forEach((k, i) => badges.push([k, points[i]]));
      }
      for (const [k, point] of badges.sort(([j], [k]) => j - k)) {
        const group = kit.svg('g', {class: 'wheel-point', 'data-step': k}, overlay);
        kit.svg('circle', {class: 'wheel-badge', cx: point.x, cy: point.y, r: badge, 'stroke-width': 1.5 * unit}, group);
        kit.svg('text', {class: 'wheel-number', x: point.x, y: point.y, 'text-anchor': 'middle',
          'dominant-baseline': 'central', 'font-size': 14 * unit}, group).textContent = String(k);
      }
      overlay.setAttribute('aria-label', onDisk()
        ? `The Julia set of the center of the ${name}, in two halves: around the point a of its old two-cycle on `
          + `the left, and around b, enlarged, on the right, with the ${2 * q} points of the orbit of 0 numbered in `
          + 'the order the map visits them; the text below says how they turn around a and b.'
        : `The Julia set of the center of the ${name}, around its fixed point α, with the ${q} points of the orbit `
          + 'of 0 numbered in the order the map visits them; the text below says how they turn around α.');
    }

    function describe() {
      const [, , p, q] = state.example;
      const c = parameter();
      if (onDisk()) {
        const [a, b] = wheels();
        status.textContent = `c ≈ ${format(c, 4)}, the center of the ${p}/${q} bulb on the period-two disk. The orbit `
          + `of 0 is a cycle of period ${2 * q}. The old two-cycle, a ≈ ${format(a.center, 4)} and `
          + `b ≈ ${format(b.center, 4)}, now repels, and ${COUNTS[q]} lobes meet at each of its points. Each step `
          + 'carries the orbit from one wheel to the other, so the even points lie around a and the odd ones around '
          + `b. Every two steps it moves ${PLACES[p]} further counterclockwise around its wheel, a turn of ${p}/${q}, `
          + `so in ${COUNTS[2 * q]} steps it goes around each wheel ${TIMES[p]}. The wheel at b is smaller: the `
          + `right half shows it ${formatNumber(a.window.width / b.window.width, 2)} times enlarged.`;
        return;
      }
      status.textContent = `c ≈ ${format(c, 4)}, the center of the ${p}/${q} bulb. The orbit of 0 is a cycle of `
        + `period ${q}, with one point in each of the ${COUNTS[q]} lobes that meet at α ≈ ${format(alphaOf(c), 4)}. `
        + `Each step carries it ${PLACES[p]} further counterclockwise around α, a turn of ${p}/${q}, so in `
        + `${COUNTS[q]} steps it goes around α ${TIMES[p]}.`;
    }

    // --- the pass ------------------------------------------------------------

    async function show() {
      const request = ++generation;
      delete figure.dataset.drawn;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      context.clearRect(0, 0, canvas.width, canvas.height);
      mark();
      status.textContent = `The ${state.example[2]}/${state.example[3]} bulb${onDisk() ? ' on the period-two disk' : ''}. `
        + 'Computing…';
      // One pass for each wheel, painted into its part of the picture.
      for (const wheel of wheels()) {
        const x = Math.round(canvas.width * wheel.x / WIDTH);
        const width = Math.round(canvas.width * (wheel.x + wheel.pixels) / WIDTH) - x;
        const pass = await kit.orbitPass(wheel.window, parameter(), BUDGET, RADIUS, width, canvas.height,
          () => request === generation, {coloring: 'distance', onStrip: partial => paintSoon(partial, x, request)});
        if (!pass) return;
        paint(pass, x);
      }
      describe();
      figure.dataset.drawn = '';
    }

    // Paints at the next animation frame, once however many strips arrive before it.
    let pending = null;
    function paintSoon(partial, x, request) {
      if (pending) {
        pending = {partial, x, request};
        return;
      }
      pending = {partial, x, request};
      requestAnimationFrame(() => {
        const latest = pending;
        pending = null;
        if (latest.partial.rows < latest.partial.height && latest.request === generation) paint(latest.partial, latest.x);
      });
    }

    function paint(data, x) {
      if (buffer.width !== data.width || buffer.height !== data.height) {
        buffer.width = data.width;
        buffer.height = data.height;
      }
      data.thickness = 1;
      kit.paintOrbits(bufferContext, data, 'distance');
      if (data.rows) context.drawImage(buffer, 0, 0, data.width, data.rows, x, 0, data.width, data.rows);
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, status]) figure.insertBefore(part, caption);
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
