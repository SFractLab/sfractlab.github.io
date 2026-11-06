/* Interactive figure: the circle of angles squeezed onto the Mandelbrot set.

   Each parameter ray meets the curve on which the escape potential of the
   parameter plane is G (an equipotential of M) at the point c with
   Φ(c) = e^(G + 2πiθ). For G = 3 the curve is almost a circle; as G falls it
   hugs M ever more closely. The figure follows 4,096 evenly spaced angles and
   the ends of Lavaurs' chords down to G = 0.00005 by Newton's method on
   f_c^n(c) = Φ(c)^(2^n), and draws at each level the curve, Lavaurs' chords up
   to period 5 as straight lines between the points of their two angles, and
   the regions of the Lavaurs figure: the one bounded by the chords of the
   primary bulbs and the one behind the chord from 1/3 to 2/3 (both up to
   period 9), which become the main cardioid and the period-two disk.

   Built by AtlasKit.setUp for every <figure data-widget="squeeze">; computed
   when the figure comes near the screen. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  const WIDTH = 440;
  const HEIGHT = 400;
  const PAD_X = 50;            // drawing units between the curve and the sides, room for the labels 1/2 and 0
  const PAD_Y = 26;            // and between the curve and the top and bottom
  const GRID = 4096;           // evenly spaced angles k/4096
  const SHOWN_PERIOD = 5;      // the chords drawn
  const REGION_PERIOD = 9;     // the chords that bound the two regions
  const HIGH = 3;              // the potential of the first level
  const LOW = 5e-5;            // and of the last
  const LEVELS = 41;
  const START = 5;             // the potential where each ray is started, at e^(5 + 2πiθ)
  const STEPS_PER_HALVING = 6; // continuation steps per halving of the potential
  const LOG_R = Math.log(1e4); // n is chosen so that |Φ(c)^(2^n)| ≥ 10⁴
  const PAUSE = 150;           // milliseconds between levels while playing
  const MASK_VIEW = {left: -2.15, top: 1.3, width: 2.8, height: 2.6};
  const MASK_SIZE = [280, 260];

  const LEVEL_VALUES = Array.from({length: LEVELS}, (_, k) => HIGH * (LOW / HIGH) ** (k / (LEVELS - 1)));

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // A potential or a distance in words: 3, 0.0123, 5 × 10⁻⁵.
  function amount(x) {
    if (x >= 10) return formatNumber(x, 1);
    if (x >= 1e-3) return formatNumber(x, x >= .1 ? 3 : 4);
    const exponent = Math.floor(Math.log10(x));
    return `${formatNumber(x / 10 ** exponent, 1)} × 10<sup>−${-exponent}</sup>`;
  }

  // The chords that lie behind no other chord inside (low, high), each [period, a, b, k1, k2, q],
  // sorted by a: they bound the region of the lamination just inside the chord from low to high, or the
  // middle region when there is none.
  function outermost(chords, behind) {
    const [low, high] = behind ? [behind[1], behind[2]] : [0, 1];
    const inside = chords.filter(c => c !== behind && low < c[1] && c[2] < high);
    return inside.filter(c => !inside.some(d => d[1] < c[1] && c[2] < d[2])).sort((c, d) => c[1] - d[1]);
  }

  // The angles followed: the grid and the ends of the chords drawn or bounding a region, as
  // {num, den, value}, sorted by value, and the index of each by "num/den".
  function anglesFor(chords) {
    const list = Array.from({length: GRID}, (_, k) => ({num: k, den: GRID, value: k / GRID}));
    for (const [, a, b, k1, k2, q] of chords) list.push({num: k1, den: q, value: a}, {num: k2, den: q, value: b});
    const index = new Map();
    const angles = list.sort((x, y) => x.value - y.value).filter(angle => {
      const key = `${angle.num}/${angle.den}`;
      if (index.has(key)) return false;
      index.set(key, -1);
      return true;
    });
    angles.forEach((angle, i) => index.set(`${angle.num}/${angle.den}`, i));
    return {angles, index};
  }

  // For every angle, the points where its parameter ray meets the curves of the potentials in
  // LEVEL_VALUES: [x, y] at (level · count + i) · 2. The ray is followed inwards from potential START,
  // STEPS_PER_HALVING steps per halving and through every level, by Newton's method on
  // f_c^n(c) = e^(2^n (p + 2πiθ)), with n the smallest whole number for which e^(2^n p) ≥ 10⁴; the
  // angle 2^n θ is kept exactly, as a numerator over the angle's denominator.
  function follow(angles) {
    const count = angles.length;
    const points = new Float64Array(LEVELS * count * 2);
    const schedule = [];
    for (let p = START; p > LOW; p *= 2 ** (-1 / STEPS_PER_HALVING)) schedule.push([p, -1]);
    LEVEL_VALUES.forEach((value, level) => schedule.push([value, level]));
    schedule.sort((x, y) => y[0] - x[0]);
    angles.forEach(({num, den, value}, i) => {
      let cx = Math.exp(START) * Math.cos(2 * Math.PI * value);
      let cy = Math.exp(START) * Math.sin(2 * Math.PI * value);
      let m = num;
      let n = 0;
      for (const [p, level] of schedule) {
        const need = Math.max(1, Math.ceil(Math.log2(LOG_R / p)));
        while (n < need) {
          m = (2 * m) % den;
          n++;
        }
        const size = Math.exp(p * 2 ** n);
        const wx = size * Math.cos(2 * Math.PI * m / den);
        const wy = size * Math.sin(2 * Math.PI * m / den);
        for (let iteration = 0; iteration < 8; iteration++) {
          let zx = 0, zy = 0, dx = 0, dy = 0;
          for (let k = 0; k <= n; k++) {
            [dx, dy] = [2 * (zx * dx - zy * dy) + 1, 2 * (zx * dy + zy * dx)];
            [zx, zy] = [zx * zx - zy * zy + cx, 2 * zx * zy + cy];
          }
          // The Newton step (z − w) / z′.
          const ex = zx - wx, ey = zy - wy, norm = dx * dx + dy * dy;
          const sx = (ex * dx + ey * dy) / norm, sy = (ey * dx - ex * dy) / norm;
          cx -= sx;
          cy -= sy;
          if (Math.hypot(sx, sy) < 1e-13 * (1 + Math.hypot(cx, cy))) break;
        }
        if (level >= 0) {
          points[(level * count + i) * 2] = cx;
          points[(level * count + i) * 2 + 1] = cy;
        }
      }
    });
    return points;
  }

  kit.setUp('squeeze', (figure, id) => {
    const shown = kit.lavaursChords(SHOWN_PERIOD);
    const all = kit.lavaursChords(REGION_PERIOD);
    const gold = all.find(([n]) => n === 2);
    const middleChords = outermost(all, null);
    const diskChords = outermost(all, gold);
    const {angles, index} = anglesFor([...shown, ...middleChords, ...diskChords]);
    const count = angles.length;
    const at = (num, den) => index.get(`${num}/${den}`);

    // The boundary of a region as indices into the angles: from low to high along the curve, jumping
    // across each chord that bounds it.
    function region(chords, low, high) {
      const indices = [];
      let i = at(...low);
      for (const [, , , k1, k2, q] of chords) {
        for (; i <= at(k1, q); i++) indices.push(i);
        i = at(k2, q);
      }
      for (; i <= at(...high); i++) indices.push(i);
      return indices;
    }
    const middle = region(middleChords, [0, GRID], [GRID - 1, GRID]);
    const disk = region(diskChords, [gold[3], gold[5]], [gold[4], gold[5]]);
    const named = [['0', at(0, GRID)], ['1/2', at(GRID / 2, GRID)], ['1/3', at(gold[3], gold[5])],
      ['2/3', at(gold[4], gold[5])]];

    const state = {points: null, level: 0, timer: null};
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'widget-controls');
    const levelLabel = element('label', 'widget-point squeeze-level', 'Potential');
    const slider = element('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(LEVELS - 1);
    slider.step = '1';
    slider.value = '0';
    slider.id = `${id}-level`;
    const output = element('output');
    output.htmlFor = slider.id;
    slider.addEventListener('input', () => {
      stop();
      show(Number(slider.value));
    });
    levelLabel.append(slider, output);
    const playButton = element('button', 'widget-button', 'Play');
    playButton.type = 'button';
    playButton.addEventListener('click', () => (state.timer ? stop() : play()));
    controls.append(levelLabel, playButton);

    // --- drawing -------------------------------------------------------------

    const drawing = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'widget-plane squeeze-plane',
      'aria-hidden': 'true'});
    const defs = kit.svg('defs', {}, drawing);
    const mask = kit.svg('mask', {id: `${id}-silhouette`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: WIDTH,
      height: HEIGHT}, defs);
    const maskImage = kit.svg('image', {preserveAspectRatio: 'none'}, mask);
    kit.svg('rect', {width: WIDTH, height: HEIGHT, class: 'squeeze-silhouette', mask: `url(#${id}-silhouette)`},
      drawing);
    const layer = kit.svg('g', {}, drawing);

    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    function draw() {
      layer.replaceChildren();
      const base = state.level * count * 2;
      const X = i => state.points[base + 2 * i];
      const Y = i => state.points[base + 2 * i + 1];
      // The view: the curve, fitted into the drawing.
      let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
      for (let i = 0; i < count; i++) {
        minX = Math.min(minX, X(i));
        maxX = Math.max(maxX, X(i));
        minY = Math.min(minY, Y(i));
        maxY = Math.max(maxY, Y(i));
      }
      const scale = Math.min((WIDTH - 2 * PAD_X) / (maxX - minX), (HEIGHT - 2 * PAD_Y) / (maxY - minY));
      const [midX, midY] = [(minX + maxX) / 2, (minY + maxY) / 2];
      const sx = x => WIDTH / 2 + (x - midX) * scale;
      const sy = y => HEIGHT / 2 - (y - midY) * scale;
      // A path through the points, leaving out those within half a unit of the last one kept.
      const path = (indices, close) => {
        let d = '';
        let [lx, ly] = [Infinity, Infinity];
        indices.forEach((i, k) => {
          const [x, y] = [sx(X(i)), sy(Y(i))];
          if (k && k < indices.length - 1 && Math.hypot(x - lx, y - ly) < .5) return;
          d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
          [lx, ly] = [x, y];
        });
        return close ? `${d}Z` : d;
      };
      // M behind, placed in the same view.
      maskImage.setAttribute('x', sx(MASK_VIEW.left).toFixed(1));
      maskImage.setAttribute('y', sy(MASK_VIEW.top).toFixed(1));
      maskImage.setAttribute('width', (MASK_VIEW.width * scale).toFixed(1));
      maskImage.setAttribute('height', (MASK_VIEW.height * scale).toFixed(1));
      kit.svg('path', {d: path(middle, true), class: 'squeeze-middle'}, layer);
      kit.svg('path', {d: path(disk, true), class: 'squeeze-disk'}, layer);
      for (const [n, , , k1, k2, q] of shown) {
        const [i, j] = [at(k1, q), at(k2, q)];
        kit.svg('line', {x1: sx(X(i)).toFixed(1), y1: sy(Y(i)).toFixed(1), x2: sx(X(j)).toFixed(1),
          y2: sy(Y(j)).toFixed(1), class: n === 2 ? 'squeeze-chord squeeze-gold' : 'squeeze-chord'}, layer);
      }
      kit.svg('path', {d: path([...Array(count).keys()], true), class: 'squeeze-curve'}, layer);
      kit.placeLabels(layer, named.map(([text, i]) => ({x: sx(X(i)), y: sy(Y(i)), text,
        className: `plane-label squeeze-label${text.includes('3') ? ' squeeze-gold-label' : ''}`})),
      {x: WIDTH / 2, y: HEIGHT / 2}, 14);
    }

    function describe() {
      const base = state.level * count * 2;
      const point = i => [state.points[base + 2 * i], state.points[base + 2 * i + 1]];
      const [a, b] = [point(at(gold[3], gold[5])), point(at(gold[4], gold[5]))];
      const apart = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const potential = LEVEL_VALUES[state.level];
      let text = `The curve on which the escape potential is ${amount(potential)} (an equipotential of <var>M</var>)`;
      text += state.level === 0
        ? `: almost the circle of radius <var>e</var><sup>3</sup> ≈ 20, here scaled down to fit. Each angle sits where `
          + 'its parameter ray crosses the curve, and the chords join these points with straight lines. '
        : ', drawn at its own scale. ';
      text += `The ends of the gold chord, at 1/3 and 2/3, are ${amount(apart)} apart; both rays land at −3/4, the root `
        + 'of the period-two disk.';
      if (state.level === 0) text += ' Press Play or move the slider to lower the potential.';
      if (state.level === LEVELS - 1) {
        text += ' Even this close to <var>M</var> the ends of each chord are still apart. They meet only in the limit, and '
          + 'slowly: every chord ends at the root of a component, and rays come in to a root only very slowly.';
      }
      readout.innerHTML = text;  // built from numbers and fixed text
      output.innerHTML = amount(potential);
      figure.dataset.level = String(state.level);
      figure.dataset.potential = String(potential);
      figure.dataset.gold = `${a.join(',')};${b.join(',')}`;
    }

    function show(level) {
      state.level = Math.max(0, Math.min(level, LEVELS - 1));
      slider.value = String(state.level);
      draw();
      describe();
    }

    function play() {
      if (state.level >= LEVELS - 1) show(0);
      if (reducedMotion) {
        show(LEVELS - 1);
        return;
      }
      playButton.textContent = 'Pause';
      readout.setAttribute('aria-live', 'off');  // no announcement for every level
      const tick = () => {
        show(state.level + 1);
        if (state.level >= LEVELS - 1) stop();
        else state.timer = setTimeout(tick, PAUSE);
      };
      state.timer = setTimeout(tick, PAUSE);
    }

    function stop() {
      clearTimeout(state.timer);
      state.timer = null;
      playButton.textContent = 'Play';
      readout.setAttribute('aria-live', 'polite');
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, drawing, readout]) figure.insertBefore(part, caption);
    readout.textContent = 'Following the rays…';
    slider.disabled = true;
    playButton.disabled = true;
    kit.whenNear(figure, () => {
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = MASK_SIZE;
      canvas.getContext('2d').putImageData(kit.mandelbrotMask(MASK_VIEW, ...MASK_SIZE, 200), 0, 0);
      maskImage.setAttribute('href', canvas.toDataURL('image/png'));
      state.points = follow(angles);
      slider.disabled = false;
      playButton.disabled = false;
      show(0);
      figure.dataset.drawn = '';
    });
  });
})();
