/* Interactive figure: a map of the Mandelbrot set in which every pixel is
   proved outside, proved inside, or marked undecided.

   Each pixel is enclosed in a disk P of parameters. Ball arithmetic (a center
   and a radius) encloses z_n for every c in P at once; every rounding error
   is bounded with the outward-rounding rule of Rump, Zimmermann, Boldo and
   Melquiond (BIT 49, 2009): a computed value c is within φ|c| + η of its
   neighbors, with φ = 2⁻⁵³ + 2⁻¹⁰⁵ and η = 2⁻¹⁰⁷⁴. A pixel is
     outside    if at some step the whole ball lies beyond radius 2: every c
                in P escapes (c with |c| > 2 lie outside the set anyway);
     inside     if P lies in the period-two disk or the main cardioid, or if
                p steps map a small disk around an attracting cycle into
                itself for every c in P and the ball of the orbit of 0 falls
                into that disk: the orbit then stays bounded;
     undecided  otherwise.
   Pixels proved inside lie in the set, and every pixel that meets the set is
   inside or undecided, which bounds the area of the set from both sides.
   The program allows for every rounding error, by outward rounding or by
   safety margins far larger than the errors, but is not formally verified.

   Built by AtlasKit.setUp for every <figure data-widget="certified">. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  const BUDGET = 2000;
  const ROWS_PER_FRAME = 12;
  const SIZES = [[192, 144], [384, 288], [768, 576]];
  const WINDOWS = [
    ['whole', 'The whole set', {left: -2.2, top: 1.2, width: 3.2, height: 2.4}],
    ['bulb', 'Around the 1/3 bulb', {left: -0.3, top: 0.9, width: 0.4, height: 0.3}],
  ];
  const COLORS = [[20, 42, 72], [227, 232, 196], [236, 120, 80]];  // outside, inside, undecided

  // Outward rounding (Rump, Zimmermann, Boldo and Melquiond, Algorithm 1).
  const U = 2 ** -53;
  const PHI = U + 2 ** -105;
  const ETA = 2 ** -1074;
  const up = x => x + (PHI * Math.abs(x) + ETA);
  const down = x => x - (PHI * Math.abs(x) + ETA);
  const absUp = (x, y) => up(Math.sqrt(up(up(x * x) + up(y * y))));
  const absDown = (x, y) => down(Math.sqrt(Math.max(0, down(down(x * x) + down(y * y)))));

  // One step of z ↦ z² + c for a ball (zx + i zy, r) and all c within rho of
  // cx + i cy: the new center, and a radius that covers 2|z|r + r² + rho plus
  // the rounding error of the new center (a generous bound for + − × of doubles).
  let NX = 0, NY = 0, NR = 0;
  function ballStep(zx, zy, r, cx, cy, rho) {
    const a = zx * zx, b = zy * zy, xy = zx * zy;
    const nx = (a - b) + cx, ny = (xy + xy) + cy;
    const e = up(4 * U * up(up(a + b) + up(Math.abs(cx) + Math.abs(nx)))
      + 4 * U * up(up(2 * Math.abs(xy)) + up(Math.abs(cy) + Math.abs(ny))) + 4 * ETA);
    NX = nx;
    NY = ny;
    NR = up(up(up(2 * absUp(zx, zy) * r) + up(r * r)) + up(rho + e));
  }
  const contained = (zx, zy, r, tx, ty, radius) => up(absUp(zx - tx, zy - ty) + r) < radius * (1 - 1e-12);

  // Whether the disk of radius rho around c lies in the period-two disk or the
  // main cardioid. The cardioid is |λ| < 1 with λ(c) = 1 − √(1 − 4c), and on
  // the disk |λ′| = 2/|√(1 − 4c)| ≤ 2/√(|1 − 4c| − 4rho). The relative margin
  // of 10⁻⁹ is far larger than the rounding errors of these few operations.
  function analytic(cx, cy, rho) {
    if (up(absUp(cx + 1, cy) + rho) < .25 * (1 - 1e-12)) return true;
    const wx = 1 - 4 * cx, wy = -4 * cy;
    const size = Math.sqrt(wx * wx + wy * wy);
    const margin = size - 4 * rho;
    if (margin <= 0) return false;
    const sx = Math.sqrt((size + wx) / 2);
    const sy = (wy < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (size - wx) / 2));
    const bound = Math.sqrt((1 - sx) ** 2 + sy * sy) + 2 * rho / Math.sqrt(margin);
    return bound * (1 + 1e-9) + 1e-12 < 1;
  }

  // An attracting cycle at the center, found numerically: [period, point].
  function findCycle(cx, cy) {
    let x = 0, y = 0;
    for (let n = 0; n < BUDGET; n++) {
      const t = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = t;
      if (x * x + y * y > 4) return null;
    }
    let wx = x, wy = y;
    for (let p = 1; p <= 128; p++) {
      const t = wx * wx - wy * wy + cx;
      wy = 2 * wx * wy + cy;
      wx = t;
      const dx = wx - x, dy = wy - y;
      if (dx * dx + dy * dy < 1e-20 * Math.max(1, x * x + y * y)) return [p, x, y];
    }
    return null;
  }

  const TRAP_RADII = [3e-1, 1e-1, 3e-2, 1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 1e-5, 1e-6, 1e-7];

  // 0 outside, 1 inside, 2 undecided.
  function classify(cx, cy, rho) {
    if (analytic(cx, cy, rho)) return 1;
    const traps = [];
    const cycle = findCycle(cx, cy);
    if (cycle) {
      const [p, tx, ty] = cycle;
      for (const radius of TRAP_RADII) {
        let x = tx, y = ty, r = radius, ok = true;
        for (let k = 0; k < p; k++) {
          ballStep(x, y, r, cx, cy, rho);
          x = NX;
          y = NY;
          r = NR;
          if (r > 4) {
            ok = false;
            break;
          }
        }
        if (ok && contained(x, y, r, tx, ty, radius)) traps.push([tx, ty, radius]);
      }
    }
    let zx = 0, zy = 0, r = 0;
    for (let n = 1; n <= BUDGET; n++) {
      ballStep(zx, zy, r, cx, cy, rho);
      zx = NX;
      zy = NY;
      r = NR;
      if (down(absDown(zx, zy) - r) > 2) return 0;
      if (r > 4) break;
      for (const [tx, ty, radius] of traps) if (contained(zx, zy, r, tx, ty, radius)) return 1;
    }
    return 2;
  }

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  kit.setUp('certified', (figure) => {
    figure.classList.add('widget-plate');
    const state = {size: SIZES[1], window: WINDOWS[0]};
    let generation = 0;

    const controls = element('div', 'plate-controls');
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
    }
    select('Window', WINDOWS.map(([key, name]) => [key, name]), state.window[0], value => {
      state.window = WINDOWS.find(([key]) => key === value);
      draw();
    });
    select('Grid', SIZES.map(([w, h]) => [`${w}`, `${w} × ${h} pixels`]), `${state.size[0]}`, value => {
      state.size = SIZES.find(([w]) => `${w}` === value);
      draw();
    });

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    view.append(canvas);
    const legend = element('p', 'plate-caption certified-legend');
    legend.innerHTML = '<span class="certified-swatch certified-outside"></span> proved outside '
      + '<span class="certified-swatch certified-inside"></span> proved inside '
      + '<span class="certified-swatch certified-undecided"></span> undecided';
    const status = element('p', 'plate-verdict');
    status.setAttribute('aria-live', 'polite');

    async function draw() {
      const request = ++generation;
      const [width, height] = state.size;
      const [, name, v] = state.window;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      const image = context.createImageData(width, height);
      const dx = v.width / width, dy = v.height / height;
      const rho = up(.5 * Math.sqrt(dx * dx + dy * dy) * (1 + 1e-9));
      const counts = [0, 0, 0];
      const started = performance.now();
      status.textContent = `${name}: computing…`;
      for (let row = 0; row < height; row++) {
        const cy = v.top - (row + .5) * dy;
        for (let col = 0; col < width; col++) {
          const verdict = classify(v.left + (col + .5) * dx, cy, rho);
          counts[verdict]++;
          image.data.set([...COLORS[verdict], 255], 4 * (row * width + col));
        }
        if (row % ROWS_PER_FRAME === ROWS_PER_FRAME - 1 || row === height - 1) {
          context.putImageData(image, 0, 0);
          await new Promise(requestAnimationFrame);
          if (request !== generation) return;
        }
      }
      const total = width * height;
      const share = k => formatNumber(100 * counts[k] / total, 1);
      let text = `${name}, ${width} × ${height} pixels, in ${formatNumber((performance.now() - started) / 1000, 2)} s: `
        + `${share(0)}% proved outside, ${share(1)}% proved inside, ${share(2)}% undecided.`;
      if (state.window[0] === 'whole') {
        // The window contains the whole set, so these bound its area.
        const pixel = dx * dy;
        const low = Math.floor(counts[1] * pixel * 1000) / 1000;
        const high = Math.ceil((counts[1] + counts[2]) * pixel * 1000) / 1000;
        text += ` So the area of the Mandelbrot set is at least ${formatNumber(low, 3)} and at most `
          + `${formatNumber(high, 3)}.`;
      }
      status.textContent = text;
      figure.dataset.counts = counts.join(',');
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, legend, status]) figure.insertBefore(part, caption);
    draw();
  });
})();
