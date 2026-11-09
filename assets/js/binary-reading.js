/* Interactive figure: reading an external angle from a picture.

   The picture is binary decomposition with exact angles. Band n holds the parameters outside the
   Mandelbrot set whose potential G_M(c) lies between 2^−n and 2^(−n+1) (band 1: above 1/2), and the
   parameter rays at the angles k/2^n cut it into 2^n cells; a cell is light where the n-th binary
   digit of the external angle θ is 0 and dark where it is 1. That digit is the sign of
   Im φ_c(z_n), since arg φ_c(z_n) = 2^(n−1)·2πθ: the orbit of 0 runs on until |z_N| > 10^10, where
   φ_c(z_N) and z_N agree far better than a pixel needs, and is pulled back, φ_c(z_k) being the
   square root of φ_c(z_(k+1)) closer to z_k. Binary decomposition with a large escape radius R
   draws the same kind of pattern from z_n itself, but its first bands lie far outside, at
   potential log R.

   The ray at the chosen angle θ, a fraction from the buttons or typed, is followed inward by
   Newton's method (AtlasKit.newtonStep), and the cells it crosses, one in each band, are lit and
   outlined: their colors, from the outside in, are the binary digits of θ. A click on a point
   outside the set reads its angle the same way: its ray is followed outward to far away, where
   Φ_M(c) ≈ c + 1/2 gives θ, and the cells along it are lit.

   Built by AtlasKit.setUp for every <figure data-widget="binary-reading">; data-angle chooses the
   first angle (default 1/3). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber, newtonStep} = kit;

  const WIDTH = 720;
  const HEIGHT = 600;
  const VIEW = {left: -2.8, top: 1.8333, width: 4.4, height: 3.6667};
  const BANDS = 12;             // bands read along a chosen ray
  const MAX_BANDS = 24;         // a clicked point deeper than this is too close to the set
  const BIG = 1e10;             // φ_c(z) = z for the picture once |z| > BIG
  const KEEP = 16;              // orbit points kept for the pullback (it needs about 6)
  const BUDGET = 1500;          // steps before a pixel counts as in the set
  const FAR = 4;                // rays start at potential 4, |Φ| ≈ 55, outside the picture
  const LARGE = Math.log(1e5);  // Newton's method aims at Φ(c)^(2^n) with modulus at least e^LARGE
  const PER_HALVING = 8;        // ray points per halving of the potential
  const ARC_STEP = .2;          // radians that the target turns per step along an equipotential
  const MAX_DENOMINATOR = 100000;
  const DYADIC = 2 ** 48;       // a clicked point's angle is kept as a fraction k/2^48
  const PRESETS = ['1/3', '1/7', '5/12', '1/5', '3/11'];
  const ZOOM = 4;               // each zoom magnifies 4 times,
  const MAX_ZOOM = 3;           // up to 64 times,
  const MORE_BANDS = 4;         // and follows the ray 4 bands deeper
  const ROWS_PER_TASK = 12;
  const COLORS = {zero: [244, 236, 214], one: [20, 42, 72], set: [30, 135, 151]};

  // Rows firstRow … firstRow + rows − 1 of the picture, as RGBA bytes. Runs in a worker.
  function readingRows({left, top, pixel, width, firstRow, rows}) {
    const pixels = new Uint8ClampedArray(4 * width * rows);
    const kept = new Float64Array(2 * KEEP);
    for (let row = 0; row < rows; row++) {
      const ci = top - (firstRow + row + .5) * pixel;
      for (let column = 0; column < width; column++) {
        const cr = left + (column + .5) * pixel;
        let color = COLORS.set;
        // The main cardioid and the period-two disk, by the exact tests.
        const q = (cr - .25) * (cr - .25) + ci * ci;
        const inside = q * (q + cr - .25) < ci * ci / 4 || (cr + 1) * (cr + 1) + ci * ci < 1 / 16;
        if (!inside) {
          let zr = 0;
          let zi = 0;
          let dr = 0;
          let di = 0;
          let n = 0;
          let size = 0;
          while (n < BUDGET) {
            const ndr = 2 * (zr * dr - zi * di) + 1;
            di = 2 * (zr * di + zi * dr);
            dr = ndr;
            const next = zr * zr - zi * zi + cr;
            zi = 2 * zr * zi + ci;
            zr = next;
            n++;
            kept[2 * (n % KEEP)] = zr;
            kept[2 * (n % KEEP) + 1] = zi;
            size = zr * zr + zi * zi;
            if (size > BIG * BIG) break;
          }
          // Outside, unless the distance estimate puts the pixel's center within a pixel of the set.
          const modulus = Math.sqrt(size);
          if (size > BIG * BIG && 2 * modulus * Math.log(modulus) / Math.hypot(dr, di) >= pixel) {
            const potential = Math.log(modulus) / 2 ** (n - 1);
            const band = Math.max(1, Math.floor(-Math.log2(potential)) + 1);
            let wr = zr;
            let wi = zi;
            for (let k = n - 1; k >= band; k--) {
              const m = Math.hypot(wr, wi);
              let sr = Math.sqrt((m + wr) / 2);
              let si = Math.sqrt(Math.max(0, (m - wr) / 2));
              if (wi < 0) si = -si;
              if (sr * kept[2 * (k % KEEP)] + si * kept[2 * (k % KEEP) + 1] < 0) {
                sr = -sr;
                si = -si;
              }
              wr = sr;
              wi = si;
            }
            color = wi < 0 ? COLORS.one : COLORS.zero;
          }
        }
        const offset = 4 * (row * width + column);
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = 255;
      }
    }
    return {pixels};
  }

  const pool = kit.workerPool(readingRows, {constants: {BIG, KEEP, BUDGET, COLORS}});

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const potentialOf = band => 2 ** -band;  // the inner edge of band n

  // "5/12" → {p: 5, q: 12}, reduced modulo 1; a whole number counts as 0. Null unless a fraction with a
  // denominator up to MAX_DENOMINATOR.
  function parseAngle(text) {
    const match = /^\s*(\d{1,15})\s*(?:\/\s*(\d{1,6})\s*)?$/.exec(text);
    if (!match) return null;
    const q = match[2] === undefined ? 1 : Number(match[2]);
    if (!q || q > MAX_DENOMINATOR) return null;
    const p = Number(match[1]) % q;
    const d = gcd(p, q);
    return {p: p / d, q: q / d};
  }

  // The first `count` binary digits of p/q, by doubling the numerator exactly.
  function digitsOf({p, q}, count) {
    const digits = [];
    let r = p;
    for (let k = 0; k < count; k++) {
      r *= 2;
      digits.push(r >= q ? 1 : 0);
      r %= q;
    }
    return digits;
  }

  // 2^n·(p/q) modulo 1, exactly.
  function doubled({p, q}, n) {
    let r = p;
    for (let k = 0; k < n; k++) r = (2 * r) % q;
    return r / q;
  }

  // Newton's method solves f_c^n(c) = Φ(c)^(2^n) at the level n that makes its modulus large.
  const levelFor = potential => Math.max(0, Math.ceil(Math.log2(LARGE / potential)));

  // c moved to the point of potential G whose angle, doubled n times, is `turns` (mod 1).
  function correct(c, potential, n, turns) {
    const size = Math.exp(2 ** n * potential);
    const target = {re: size * Math.cos(2 * Math.PI * turns), im: size * Math.sin(2 * Math.PI * turns)};
    for (let k = 0; k < 3; k++) c = newtonStep(c, n, target);
    return c;
  }

  // The ray at angle p/q from potential FAR down to the lowest of `stops`, as [{potential, c}], with
  // PER_HALVING points per halving of the potential and a point at each stop.
  function ray(angle, stops) {
    const t = angle.p / angle.q;
    const far = Math.exp(FAR);
    let c = {re: far * Math.cos(2 * Math.PI * t) - .5, im: far * Math.sin(2 * Math.PI * t)};
    let potential = FAR;
    const points = [{potential, c}];
    for (const stop of [...stops].sort((a, b) => b - a)) {
      while (potential > stop) {
        potential = Math.max(stop, potential * 2 ** (-1 / PER_HALVING));
        const n = levelFor(potential);
        c = correct(c, potential, n, doubled(angle, n));
        points.push({potential, c});
      }
    }
    return points;
  }

  // The equipotential of potential G from angle t0 to t1 (turns), from its point `start` at t0.
  function arc(start, potential, t0, t1) {
    if (potential >= FAR) {  // far outside the picture, Φ(c) ≈ c + 1/2
      return Array.from({length: 33}, (_, k) => {
        const t = t0 + (t1 - t0) * k / 32;
        return {re: Math.exp(potential) * Math.cos(2 * Math.PI * t) - .5, im: Math.exp(potential) * Math.sin(2 * Math.PI * t)};
      });
    }
    const n = levelFor(potential);
    const steps = Math.max(2, Math.ceil(Math.abs(t1 - t0) * 2 ** n * 2 * Math.PI / ARC_STEP));
    const every = Math.max(1, Math.floor(steps / 48));
    const points = [start];
    let c = start;
    for (let s = 1; s <= steps; s++) {
      const t = t0 + (t1 - t0) * s / steps;
      c = correct(c, potential, n, ((2 ** n * t) % 1 + 1) % 1);
      if (s % every === 0 || s === steps) points.push(c);
    }
    return points;
  }

  // The cells that the ray at θ crosses in bands 1 … depth, each as a closed outline: the ray at
  // k/2^n inward from the band's outer edge, the inner equipotential to (k + 1)/2^n, that ray
  // outward and the outer equipotential back.
  function cells(angle, depth) {
    const digits = digitsOf(angle, depth);
    const outlines = [];
    let k = 0;
    for (let n = 1; n <= depth; n++) {
      k = 2 * k + digits[n - 1];
      const q = 2 ** n;
      const outer = n === 1 ? FAR : potentialOf(n - 1);
      const inner = potentialOf(n);
      // A ray's points within the band, from its outer edge inward.
      const side = p => ray({p, q}, [outer, inner]).filter(({potential}) => potential <= outer).map(({c}) => c);
      const left = side(k);
      const right = side(k + 1);
      const inward = arc(left[left.length - 1], inner, k / q, (k + 1) / q);
      const back = arc(right[0], outer, (k + 1) / q, k / q);
      outlines.push([...left, ...inward.slice(1), ...[...right].reverse().slice(1), ...back.slice(1)]);
    }
    return {digits, outlines};
  }

  // The external angle of c, in turns, if its orbit escapes: c is moved outward along its ray to
  // potential FAR, keeping Ψ = Φ(c)^(2^n) of modulus between e^LARGE and e^(2·LARGE), and Ψ is then
  // rooted down to Φ(c): each square root is the one closer to f_c^(n−1)(c), which is reliable that
  // far out. Returns {turns, potential, band} or null if the orbit stays bounded.
  function angleOf(c) {
    const orbit = [];
    let z = {re: 0, im: 0};
    for (let k = 0; k < BUDGET; k++) {
      z = {re: z.re * z.re - z.im * z.im + c.re, im: 2 * z.re * z.im + c.im};
      orbit.push(z);
      if (Math.hypot(z.re, z.im) > BIG) break;
    }
    const last = orbit[orbit.length - 1];
    if (!(Math.hypot(last.re, last.im) > BIG)) return null;
    const potential = Math.log(Math.hypot(last.re, last.im)) / 2 ** (orbit.length - 1);
    const band = Math.max(1, Math.floor(-Math.log2(potential)) + 1);
    // f_x^n(x), the point that Ψ approximates at level n.
    const iterate = (x, n) => {
      let w = x;
      for (let k = 0; k < n; k++) w = {re: w.re * w.re - w.im * w.im + x.re, im: 2 * w.re * w.im + x.im};
      return w;
    };
    const rootNear = (w, near) => {
      const m = Math.hypot(w.re, w.im);
      let r = {re: Math.sqrt((m + w.re) / 2), im: Math.sqrt(Math.max(0, (m - w.re) / 2)) * (w.im < 0 ? -1 : 1)};
      if (r.re * near.re + r.im * near.im < 0) r = {re: -r.re, im: -r.im};
      return r;
    };
    let x = c;
    let n = orbit.length - 1;  // f_c^n(c) = z_(n+1), the last point
    let psi = last;
    let g = potential;
    const settle = () => {
      while (n > 0 && 2 ** n * g > 2 * LARGE) {
        psi = rootNear(psi, iterate(x, n - 1));
        n--;
      }
    };
    settle();
    while (g < FAR) {
      const next = Math.min(FAR, g * 2 ** (1 / PER_HALVING));
      const grow = Math.exp(2 ** n * (next - g));
      psi = {re: psi.re * grow, im: psi.im * grow};
      for (let k = 0; k < 3; k++) x = newtonStep(x, n, psi);
      g = next;
      settle();
    }
    while (n > 0) {
      psi = rootNear(psi, iterate(x, n - 1));
      n--;
    }
    const turns = ((Math.atan2(psi.im, psi.re) / (2 * Math.PI)) % 1 + 1) % 1;
    return {turns, potential, band};
  }

  // Digits as text, one by one.
  const spaced = digits => digits.join('\u202f');

  kit.setUp('binary-reading', (figure) => {
    figure.classList.add('widget-plate');
    let plane = new kit.Plane(VIEW, WIDTH, HEIGHT);
    // The angle shown, the clicked point whose angle it is (or null) and that point's band, the point that
    // the arrow keys move from, the ray, digits and cells drawn, how often the view has been zoomed and
    // the window, and the first and last band with a badge.
    const state = {angle: null, point: null, band: 0, cursor: null, geometry: null, zoom: 0, view: VIEW, badges: null};

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const angleLabel = element('label', null, 'Angle in turns, such as 1/3');
    const input = element('input', 'reading-angle');
    input.type = 'text';
    input.spellcheck = false;
    input.setAttribute('autocomplete', 'off');
    angleLabel.append(input);
    const buttons = element('div', 'plate-buttons');
    for (const preset of PRESETS) {
      const button = element('button', 'plate-button-quiet', preset);
      button.type = 'button';
      button.addEventListener('click', () => {
        input.value = preset;
        chooseAngle(parseAngle(preset));
      });
      buttons.append(button);
    }
    const zoomButtons = element('div', 'plate-buttons');
    const zoomButton = element('button', null, 'Zoom in along the ray');
    zoomButton.type = 'button';
    zoomButton.addEventListener('click', () => setZoom(state.zoom + 1));
    const wholeButton = element('button', 'plate-button-quiet', 'Whole set');
    wholeButton.type = 'button';
    wholeButton.addEventListener('click', () => setZoom(0));
    zoomButtons.append(zoomButton, wholeButton);
    controls.append(angleLabel, buttons, zoomButtons);
    input.addEventListener('change', () => {
      const angle = parseAngle(input.value);
      if (angle) chooseAngle(angle);
      else input.setAttribute('aria-invalid', 'true');
    });

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay reading-overlay'});
    overlay.setAttribute('aria-hidden', 'true');
    view.setAttribute('role', 'img');
    view.append(canvas, overlay);
    const readout = element('div', 'plate-verdict reading-readout');
    readout.setAttribute('aria-live', 'polite');

    // Marks keep about their size on screen, a little smaller on a phone.
    function unit() {
      const shown = overlay.getBoundingClientRect().width || WIDTH;
      return Math.max(1, WIDTH / shown) * Math.min(1, Math.max(.75, shown / 480));
    }

    // The middle, along the ray, of its part in band n that lies in the picture at least `margin` from
    // its edges; null if there is none.
    function middleOf(traced, band, margin) {
      const outer = band === 1 ? Infinity : potentialOf(band - 1);
      const points = traced.filter(({potential}) => potential <= outer && potential >= potentialOf(band))
        .map(({c}) => plane.toScreen(c))
        .filter(({x, y}) => x >= margin && y >= margin && x <= WIDTH - margin && y <= HEIGHT - margin);
      if (points.length < 2) return null;
      const lengths = [0];
      for (let k = 1; k < points.length; k++) {
        lengths.push(lengths[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
      }
      const half = lengths[lengths.length - 1] / 2;
      const k = lengths.findIndex(length => length >= half);
      if (k === 0) return points[0];
      const t = (half - lengths[k - 1]) / (lengths[k] - lengths[k - 1] || 1);
      return {x: points[k - 1].x + t * (points[k].x - points[k - 1].x), y: points[k - 1].y + t * (points[k].y - points[k - 1].y)};
    }

    const pathOf = (points, close = false) => `M${points.map(c => {
      const {x, y} = plane.toScreen(c);
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join('L')}${close ? 'Z' : ''}`;

    function draw() {
      overlay.replaceChildren();
      const {geometry} = state;
      if (!geometry) return;
      const u = unit();
      // The outlines of the cells, from band 1 inward until they become too small to see.
      for (const outline of geometry.outlines) {
        const screen = outline.map(c => plane.toScreen(c));
        const xs = screen.map(({x}) => x);
        const ys = screen.map(({y}) => y);
        if (Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 12 * u) break;
        const d = pathOf(outline, true);
        kit.svg('path', {d, class: 'reading-cell-halo'}, overlay);
        kit.svg('path', {d, class: 'reading-cell'}, overlay);
      }
      const path = pathOf(geometry.ray.map(({c}) => c));
      kit.svg('path', {d: path, class: 'rays-halo'}, overlay);
      kit.svg('path', {d: path, class: 'rays-path'}, overlay);
      // A badge with the digit of each band, from the first band in the picture inward while there is room
      // for them; the first is named.
      const radius = 9 * u;
      const spots = [];
      for (let k = 0; k < geometry.digits.length; k++) {
        const spot = middleOf(geometry.ray, k + 1, radius);
        const previous = spots[spots.length - 1];
        if (!spot && !spots.length) continue;
        if (!spot || (previous && Math.hypot(previous.x - spot.x, previous.y - spot.y) < 2 * radius + 3 * u)) break;
        spots.push({...spot, band: k + 1});
      }
      for (const {x, y, band} of spots) {
        const digit = geometry.digits[band - 1];
        const badge = kit.svg('g', {class: `reading-badge reading-digit-${digit}`}, overlay);
        kit.svg('circle', {cx: x, cy: y, r: radius, 'stroke-width': 1.5 * u}, badge);
        kit.svg('text', {x, y: y + 4.5 * u, 'text-anchor': 'middle', 'font-size': 13 * u}, badge).textContent = digit;
      }
      state.badges = spots.length ? [spots[0].band, spots[spots.length - 1].band] : null;
      if (spots.length) {
        // Beside the first badge, across the ray, on the side with more room.
        const [first, next] = [spots[0], spots[1] || plane.toScreen(geometry.ray[geometry.ray.length - 1].c)];
        const length = Math.hypot(next.x - first.x, next.y - first.y) || 1;
        let across = {x: (first.y - next.y) / length, y: (next.x - first.x) / length};
        if ((across.x < 0 && first.x < 90 * u) || (across.x > 0 && first.x > WIDTH - 90 * u)) {
          across = {x: -across.x, y: -across.y};
        }
        const gap = radius + 5 * u;
        kit.svg('text', {x: first.x + across.x * gap, y: first.y + across.y * gap + 5 * u * (1 + across.y),
          'text-anchor': across.x >= 0 ? 'start' : 'end', 'font-size': 14 * u, 'stroke-width': 4 * u,
          class: 'rays-label reading-band'}, overlay).textContent = `band ${first.band}`;
      }
      if (state.point) {
        const {x, y} = plane.toScreen(state.point);
        kit.svg('circle', {cx: x, cy: y, r: 6 * u, class: 'orbit-marker reading-point', 'stroke-width': 2 * u}, overlay);
      }
    }

    function describe() {
      const {geometry, angle, point} = state;
      const digits = geometry.digits;
      const depth = digits.length;
      let text;
      if (point) {
        const value = formatNumber(angle.p / angle.q, 5);
        text = `<p><var>c</var> ≈ ${format(point, 4)} lies in band ${state.band}, in a ${digits[state.band - 1] ? 'dark' : 'light'} `
          + `cell. Along its ray, from the outside in, the cells of bands 1 to ${depth} read ${spaced(digits)}, so `
          + `<var>θ</var> ≈ 0.${digits.join('')}…₂ ≈ ${value}. The cell of <var>c</var> itself gives digit ${state.band}.</p>`;
      } else {
        const orbit = kit.doublingOrbit(angle.p, angle.q);
        const name = angle.p === 0 ? '0' : `${angle.p}/${angle.q}`;
        // Long expansions are cut short.
        const expansion = orbit.digits.length <= 24 ? kit.binary(orbit.digits, orbit.preperiod)
          : `0.${digitsOf(angle, 24).join('')}…₂`;
        text = `<p><var>θ</var> = ${name} = ${expansion} in binary. Along its ray, from the `
          + `outside in, the cells of bands 1 to ${depth} read ${spaced(digits)}: the first ${depth} digits of <var>θ</var>, `
          + 'one in each band.</p>';
        // A denominator 2^k: the ray is an edge of cells from band k on.
        if (angle.p !== 0 && (angle.q & (angle.q - 1)) === 0) {
          const k = Math.log2(angle.q);
          const head = digitsOf(angle, k);
          const other = [...head.slice(0, -1), 0];
          text += `<p>${name} has a second binary expansion, 0.${other.join('')}111…₂. From band ${k} on, its ray runs `
            + `along edges of cells, and the figure outlines those on the side of 0.${head.join('')}000…₂.</p>`;
        }
      }
      if (state.zoom) {
        const [first, last] = state.badges || [];
        text += `<p>Magnified ${ZOOM ** state.zoom} times along the ray`
          + (!state.badges ? ', where its cells are too small for badges.</p>'
            : first === last ? `: the badge shows band ${first}.</p>` : `: the badges show bands ${first} to ${last}.</p>`);
      }
      readout.innerHTML = text;  // built from numbers and fixed text
      view.setAttribute('aria-label', 'Binary decomposition of the Mandelbrot set, with the ray at angle '
        + `${formatNumber(angle.p / angle.q, 5)} and the cells it crosses outlined; their digits are listed below. `
        + 'Click a point outside the set, or use the arrow keys, to read its angle.');
    }

    // The ray, digits and cells of the angle, 12 bands deep, 4 more for each zoom, and at least to the
    // clicked point's band.
    function trace() {
      const depth = Math.max(BANDS + MORE_BANDS * state.zoom, state.band);
      const stops = [];
      for (let n = 1; n <= depth; n++) stops.push(potentialOf(n));
      const {digits, outlines} = cells(state.angle, depth);
      state.geometry = {ray: ray(state.angle, stops), digits, outlines};
    }

    function show() {
      figure.dataset.shown = state.point ? 'point' : `${state.angle.p}/${state.angle.q}`;
      figure.dataset.digits = state.geometry.digits.join('');
      if (state.point) figure.dataset.band = String(state.band);
      else delete figure.dataset.band;
      figure.dataset.zoom = String(state.zoom);
      zoomButton.disabled = state.zoom >= MAX_ZOOM;
      wholeButton.disabled = state.zoom === 0;
      draw();
      describe();
    }

    function choose(angle, point = null, band = 0) {
      input.removeAttribute('aria-invalid');
      Object.assign(state, {angle, point, band});
      trace();
      show();
    }

    // A chosen angle is shown on the whole set.
    function chooseAngle(angle) {
      const zoomed = state.zoom > 0;
      Object.assign(state, {zoom: 0, view: VIEW});
      plane = new kit.Plane(VIEW, WIDTH, HEIGHT);
      choose(angle);
      if (zoomed && near) render();
    }

    // The window, 4^zoom times narrower than the whole set: around the clicked point, or around the deep
    // end of the ray, with the ray coming in across it.
    function setZoom(zoom) {
      state.zoom = Math.max(0, Math.min(MAX_ZOOM, zoom));
      trace();
      const width = VIEW.width / ZOOM ** state.zoom;
      const height = width * HEIGHT / WIDTH;
      let centre = state.point;
      if (!centre) {
        const points = state.geometry.ray;
        const end = points[points.length - 1].c;
        let far = end;
        for (let k = points.length - 1; k >= 0; k--) {
          far = points[k].c;
          if (Math.hypot(far.re - end.re, far.im - end.im) >= .6 * width) break;
        }
        centre = {re: (end.re + far.re) / 2, im: (end.im + far.im) / 2};
      }
      state.view = state.zoom ? {left: centre.re - width / 2, top: centre.im + height / 2, width, height} : VIEW;
      plane = new kit.Plane(state.view, WIDTH, HEIGHT);
      show();
      if (near) render();
    }

    function pick(c) {
      state.cursor = c;
      const found = angleOf(c);
      if (!found) {
        readout.innerHTML = `<p><var>c</var> ≈ ${format(c, 4)} did not escape within ${BUDGET.toLocaleString('en')} steps: `
          + 'it lies in the Mandelbrot set, or very close to it, and has no external angle to read. Choose a point '
          + 'outside.</p>';
        return;
      }
      if (found.band > MAX_BANDS) {
        readout.innerHTML = `<p><var>c</var> ≈ ${format(c, 4)} lies in band ${found.band}, where the cells are far `
          + 'smaller than a pixel. Choose a point farther from the set.</p>';
        return;
      }
      input.value = '';
      choose({p: Math.round(found.turns * DYADIC) % DYADIC, q: DYADIC}, c, found.band);
    }

    overlay.addEventListener('click', event => {
      const box = overlay.getBoundingClientRect();
      pick(plane.fromScreen((event.clientX - box.left) / box.width * WIDTH, (event.clientY - box.top) / box.height * HEIGHT));
    });
    // Keyboard: the arrow keys move the point by 8 units (1 with Shift).
    view.tabIndex = 0;
    view.addEventListener('keydown', event => {
      const moves = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
      if (!moves[event.key]) return;
      event.preventDefault();
      const step = event.shiftKey ? 1 : 8;
      const from = state.cursor ? plane.toScreen(state.cursor) : {x: WIDTH * .2, y: HEIGHT * .2};
      pick(plane.fromScreen(Math.min(WIDTH, Math.max(0, from.x + moves[event.key][0] * step)),
        Math.min(HEIGHT, Math.max(0, from.y + moves[event.key][1] * step))));
    });

    // --- the picture -----------------------------------------------------------

    let round = 0;
    async function render() {
      const current = ++round;
      delete figure.dataset.drawn;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      const width = canvas.width;
      const height = canvas.height;
      const {left, top} = state.view;
      const pixel = state.view.width / width;
      const tasks = [];
      for (let firstRow = 0; firstRow < height; firstRow += ROWS_PER_TASK) {
        tasks.push({left, top, pixel, width, firstRow, rows: Math.min(ROWS_PER_TASK, height - firstRow)});
      }
      const done = await pool.run(tasks, () => current === round && canvas.width === width, (task, {pixels}) => {
        context.putImageData(new ImageData(pixels, task.width, task.rows), 0, task.firstRow);
      });
      if (done && current === round) figure.dataset.drawn = '';
    }

    let near = false;
    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, readout]) figure.insertBefore(part, caption);
    input.value = figure.dataset.angle || '1/3';
    choose(parseAngle(input.value) || {p: 1, q: 3});
    kit.whenNear(figure, () => {
      near = true;
      render();
    });
    kit.whenResized(() => {
      if (near && !kit.fitsScreen(canvas, WIDTH, HEIGHT)) render();
      draw();
      describe();
    });
  });
})();
