/* Interactive figure: parameter rays of the Mandelbrot set.

   For each angle θ = p/q, in turns, the parameter ray is followed inward from
   far out, as the rays chapter describes: the point of the ray at radius r
   satisfies f_c^n(c) ≈ (r e^(2πiθ))^(2^n) once that is large, so the radius
   is lowered a little at a time and c corrected by Newton's method. Periodic
   angles land at roots of hyperbolic components, slowly, so their rays are
   followed further; strictly preperiodic angles land at Misiurewicz points,
   quickly. The readout states what the angle's doubling orbit implies, which
   is a theorem, and where the computed ray ends, which is a computation.

   Built by AtlasKit.setUp for every <figure data-widget="rays">.
   Data attribute: data-angles, fractions separated by commas (default "1/7, 2/7"). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, doublingOrbit, binary} = kit;

  const WIDTH = 720;
  const HEIGHT = 540;
  const WHOLE = {left: -2.25, top: 1.35, width: 3.6, height: 2.7};
  const CLOSE = .3;              // width of the window around a landing point
  const START = 256;             // rays are followed inward from |Φ(c)| = START
  const STEPS = 4;               // points per halving of the potential
  const DEPTH_PERIODIC = 300;    // halvings followed: periodic rays land slowly,
  const DEPTH_PREPERIODIC = 60;  // preperiodic ones quickly
  const HALVINGS_PER_FRAME = 15;
  const MAX_DENOMINATOR = 100000;
  const MAX_ANGLES = 6;

  // An example may set the window of "Zoom to the landing point": its width,
  // and its centre when that is not where the first ray ends.
  const EXAMPLES = [
    ['1/7, 2/7', 'Root of the 1/3 bulb · 1/7, 2/7'],
    ['1/3, 2/3', 'Root of the period-two disk · 1/3, 2/3'],
    ['0', 'The cusp 1/4 · 0'],
    ['1/2', 'The tip −2 · 1/2'],
    ['1/6', 'The point i · 1/6'],
    ['5/12, 7/12', 'Two rays at a Misiurewicz point · 5/12, 7/12'],
    ['9/56, 11/56, 15/56', 'Three rays at a branch point · 9/56, 11/56, 15/56'],
    ['9/31, 10/31', 'Root of the 2/5 bulb · 9/31, 10/31'],
    ['7/15, 8/15', 'Real period-four copy · 7/15, 8/15', {width: CLOSE / 8}],  // a small copy, eight times as close
    ['1/5, 4/15', 'A period-four copy · 1/5, 4/15'],
    // All four landing points, from −3/4 to near the Feigenbaum point −1.4012.
    ['1/3, 2/5, 7/17, 106/257', 'Toward the Feigenbaum point · 1/3, 2/5, 7/17, 106/257',
      {width: 1.25, centre: {re: -1.225, im: 0}}],
  ];

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // "1/7, 2/7" → [{p: 1, q: 7}, {p: 2, q: 7}], reduced modulo 1; null if any
  // part is not a fraction with a denominator up to MAX_DENOMINATOR.
  function parseAngles(text) {
    const parts = text.split(/[,;]/).map(part => part.trim()).filter(Boolean);
    if (!parts.length || parts.length > MAX_ANGLES) return null;
    const angles = [];
    for (const part of parts) {
      const match = /^(\d{1,15})(?:\s*\/\s*(\d{1,6}))?$/.exec(part);
      if (!match) return null;
      const q = Number(match[2] ?? 1);
      if (!q || q > MAX_DENOMINATOR) return null;
      const p = Number(match[1]) % q;
      const d = gcd(p, q) || q;
      angles.push({p: p / d, q: q / d});
    }
    return angles;
  }

  const name = ({p, q}) => (p === 0 ? '0' : `${p}/${q}`);

  // Whether n steps of z ↦ z² + c from the critical value c stay below 10³⁰.
  function settles(cr, ci, n) {
    let zr = cr;
    let zi = ci;
    for (let k = 0; k < n; k++) {
      const next = zr * zr - zi * zi + cr;
      zi = 2 * zr * zi + ci;
      zr = next;
      if (!(zr * zr + zi * zi < 1e60)) return false;
    }
    return true;
  }

  // One Newton step towards f_c^n(c) = target, with the derivative of f_c^n(c)
  // with respect to c; a step so long that the orbit runs away is halved.
  function newtonStep(c, n, target) {
    let zr = c.re;
    let zi = c.im;
    let dr = 1;
    let di = 0;
    for (let k = 0; k < n; k++) {
      const ndr = 2 * (zr * dr - zi * di) + 1;
      di = 2 * (zr * di + zi * dr);
      dr = ndr;
      const next = zr * zr - zi * zi + c.re;
      zi = 2 * zr * zi + c.im;
      zr = next;
    }
    const er = zr - target.re;
    const ei = zi - target.im;
    const size = dr * dr + di * di;
    let sr = (er * dr + ei * di) / size;
    let si = (ei * dr - er * di) / size;
    for (let halvings = 0; halvings < 40; halvings++) {
      if (Number.isFinite(sr) && Number.isFinite(si) && settles(c.re - sr, c.im - si, n)) {
        return {re: c.re - sr, im: c.im - si};
      }
      sr /= 2;
      si /= 2;
    }
    return c;
  }

  // The parameter ray at angle p/q as a generator of its points, STEPS per
  // halving of the potential, for `depth` halvings.
  function* rayPoints({p, q}, depth) {
    let c = {re: START * Math.cos(2 * Math.PI * p / q), im: START * Math.sin(2 * Math.PI * p / q)};
    let n = 0;
    let numerator = p;  // 2ⁿθ mod 1 = numerator / q, kept exact
    for (let step = 1; step <= depth * STEPS; step++) {
      while (n < Math.ceil(step / STEPS)) {
        numerator = numerator * 2 % q;
        n++;
      }
      const size = START ** (2 ** (n - step / STEPS));
      const angle = 2 * Math.PI * numerator / q;
      const target = {re: size * Math.cos(angle), im: size * Math.sin(angle)};
      for (let k = 0; k < 3; k++) c = newtonStep(c, n, target);
      yield c;
    }
  }

  // What the doubling orbit of the angle says about where its ray lands.
  function landing(angle) {
    const {digits, preperiod, period} = doublingOrbit(angle.p, angle.q);
    // Long binary expansions are left out; the preperiod and period say what matters.
    const expansion = angle.p === 0 || digits.length > 32 ? name(angle) : `${name(angle)} = ${binary(digits, preperiod)}`;
    if (angle.p === 0) {
      return {periodic: true, text: '0 is fixed under doubling: its ray lands at the cusp 1/4 of the main cardioid.'};
    }
    if (preperiod === 0) {
      return {periodic: true, text: `${expansion} is periodic under doubling, with period ${period}: its ray lands `
        + `at the root of a component of period ${period}.`};
    }
    const steps = preperiod === 1 ? 'one doubling' : `${preperiod} doublings`;
    return {periodic: false, text: `${expansion} is preperiodic: after ${steps} it repeats with period ${period}. `
      + 'Its ray lands at a Misiurewicz point.'};
  }

  kit.setUp('rays', (figure) => {
    figure.classList.add('widget-plate');
    const state = {angles: parseAngles(figure.dataset.angles || '1/7, 2/7') || parseAngles('1/7, 2/7'),
      rays: [], view: WHOLE, close: false, zoom: {}};
    let generation = 0;
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const exampleLabel = element('label', null, 'Example');
    const select = element('select');
    for (const [angles, title] of EXAMPLES) {
      const option = element('option', null, title);
      option.value = angles;
      select.append(option);
    }
    const custom = element('option', null, 'Your own angles');
    custom.value = 'custom';
    select.append(custom);
    exampleLabel.append(select);
    const anglesLabel = element('label', null, 'Angles in turns, such as 1/7, 2/7');
    const input = element('input', 'rays-angles');
    input.type = 'text';
    input.spellcheck = false;
    input.setAttribute('autocomplete', 'off');
    anglesLabel.append(input);
    const buttons = element('div', 'plate-buttons');
    const closeButton = element('button', null, 'Zoom to the landing point');
    closeButton.type = 'button';
    const wholeButton = element('button', 'plate-button-quiet', 'Whole set');
    wholeButton.type = 'button';
    buttons.append(closeButton, wholeButton);
    controls.append(exampleLabel, anglesLabel, buttons);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay rays-overlay'});
    overlay.setAttribute('role', 'img');
    view.append(canvas, overlay);
    const status = element('div', 'plate-verdict rays-readout');
    status.setAttribute('aria-live', 'polite');

    const plane = () => new kit.Plane(state.view, WIDTH, HEIGHT);

    async function renderPicture() {
      const request = ++generation;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);  // the rays are drawn in the overlay's own units
      const budget = state.close ? 1200 : 400;
      await kit.renderEscapeTime(context, state.view, null, budget, () => request === generation, {repeats: true});
    }

    // Where the segment from `outside` to `inside` enters the window.
    function edgeCrossing(outside, inside) {
      const entering = (from, to, low, high) => (from < low ? (low - from) / (to - from)
        : from > high ? (high - from) / (to - from) : 0);
      const t = Math.max(entering(outside.x, inside.x, 0, WIDTH), entering(outside.y, inside.y, 0, HEIGHT));
      return {x: outside.x + t * (inside.x - outside.x), y: outside.y + t * (inside.y - outside.y)};
    }

    // Draws the rays traced so far: each as a path from where it enters the
    // window (with a margin) to its last point, with its angle where it enters.
    function drawRays() {
      overlay.replaceChildren();
      const map = plane();
      // Labels keep their size on screen however wide the picture is shown.
      const unit = Math.max(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      const labels = [];
      const inside = ({x, y}, margin) => x >= -margin && x <= WIDTH + margin && y >= -margin && y <= HEIGHT + margin;
      for (const ray of state.rays) {
        const screen = ray.points.map(point => map.toScreen(point));
        const first = screen.findIndex(point => inside(point, 0));
        if (first < 0) continue;
        const shown = screen.slice(Math.max(0, first - 1)).filter(point => inside(point, WIDTH));
        kit.svg('path', {class: 'rays-path', d: `M ${shown.map(({x, y}) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`},
          overlay);
        const end = shown[shown.length - 1];
        if (ray.done) kit.svg('circle', {class: 'rays-end', cx: end.x, cy: end.y, r: 4 * unit}, overlay);
        const entry = first > 0 ? edgeCrossing(screen[first - 1], screen[first]) : screen[first];
        labels.push({x: Math.min(WIDTH - 24 * unit, Math.max(24 * unit, entry.x)),
          y: Math.min(HEIGHT - 10 * unit, Math.max(22 * unit, entry.y)), text: name(ray.angle), path: shown});
      }
      // A label that would overlap one placed before it moves inward, past that
      // label, and so stays where its ray enters: down along the left and right
      // edges and the top, up along the bottom. Two labels whose rays enter the
      // top or the bottom close together go on either side of the two rays
      // instead, moved inward until they fit.
      const halfWidth = label => (4.5 * label.text.length + 4) * unit;
      const placed = [];
      const free = (label, x, y, others) => !others.some(other => Math.abs(other.y - y) < 18 * unit
        && Math.abs(other.x - x) < halfWidth(other) + halfWidth(label));
      // Where a ray's path first comes to the height y, or null.
      const xAt = (path, y) => {
        for (let i = 1; i < path.length; i++) {
          const [a, b] = [path[i - 1], path[i]];
          if (a.y !== b.y && (a.y - y) * (b.y - y) <= 0) return a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x);
        }
        return null;
      };
      // Rows from the edge inward, the labels' middles 5 units above their baselines.
      function besideEachOther(first, second, step) {
        const others = placed.filter(other => other !== first);
        for (let row = 0, y = first.y; row < 20; row++, y += step) {
          const one = xAt(first.path, y - 5 * unit), two = xAt(second.path, y - 5 * unit);
          if (one === null || two === null) return false;
          const [left, right] = one < two ? [first, second] : [second, first];
          const leftX = Math.min(one, two) - 2 * unit - halfWidth(left);
          const rightX = Math.max(one, two) + 2 * unit + halfWidth(right);
          if (leftX - halfWidth(left) >= 0 && rightX + halfWidth(right) <= WIDTH
              && free(left, leftX, y, others) && free(right, rightX, y, others)) {
            Object.assign(left, {x: leftX, y});
            Object.assign(right, {x: rightX, y});
            return true;
          }
        }
        return false;
      }
      for (const label of labels) {
        label.onSide = label.x <= 24 * unit || label.x >= WIDTH - 24 * unit;
        if (label.onSide) label.x = label.x <= 24 * unit ? halfWidth(label) + 4 * unit : WIDTH - halfWidth(label) - 4 * unit;
        const step = !label.onSide && label.y > HEIGHT / 2 ? -18 * unit : 18 * unit;
        const partner = placed.find(other => !free(label, label.x, label.y, [other]));
        if (partner && !label.onSide && !partner.onSide && !partner.paired && partner.y === label.y
            && besideEachOther(partner, label, step)) {
          partner.paired = label.paired = true;
        } else {
          for (let tries = 0; tries < 20; tries++) {
            const clash = placed.find(other => !free(label, label.x, label.y, [other]));
            if (!clash) break;
            label.y = clash.y + step;
          }
        }
        placed.push(label);
      }
      for (const label of labels) {
        kit.svg('text', {class: 'rays-label', x: label.x, y: label.y, 'text-anchor': 'middle',
          'font-size': 15 * unit, 'stroke-width': 4 * unit}, overlay).textContent = label.text;
      }
    }

    function describe() {
      const lines = state.rays.map(ray => {
        const ends = ray.done ? ` The computed ray ends near <var>c</var> ≈ ${format(ray.points[ray.points.length - 1], 4)}.`
          : ' Tracing…';
        return `<p>${ray.landing.text}${ends}</p>`;
      });
      if (state.rays.some(ray => ray.landing.periodic && ray.done)) {
        lines.push('<p>Rays at periodic angles approach their landing point slowly, so their computed ends stop '
          + 'short of it.</p>');
      }
      status.innerHTML = lines.join('');  // built from numbers and fixed text
      overlay.setAttribute('aria-label', `Parameter rays at ${state.rays.map(ray => name(ray.angle)).join(', ')} `
        + 'over the Mandelbrot set; the text below says where they land.');
      closeButton.disabled = !state.rays.length || !state.rays.every(ray => ray.done);
      wholeButton.disabled = !state.close;
    }

    // Traces all rays, a few halvings per frame, and redraws as they grow.
    async function trace() {
      const request = generation;
      state.rays = state.angles.map(angle => {
        const info = landing(angle);
        return {angle, landing: info, points: [], done: false,
          generator: rayPoints(angle, info.periodic ? DEPTH_PERIODIC : DEPTH_PREPERIODIC)};
      });
      describe();
      for (const ray of state.rays) {
        for (;;) {
          let finished = false;
          for (let k = 0; k < HALVINGS_PER_FRAME * STEPS; k++) {
            const next = ray.generator.next();
            if (next.done) {
              finished = true;
              break;
            }
            ray.points.push(next.value);
          }
          ray.done = finished;
          if (!reducedMotion || finished) drawRays();
          if (finished) break;
          if (!reducedMotion) await new Promise(requestAnimationFrame);
          if (request !== generation) return;
        }
        describe();
      }
    }

    async function setAngles(angles) {
      state.angles = angles;
      state.close = false;
      state.view = WHOLE;
      input.value = angles.map(name).join(', ');
      const example = EXAMPLES.find(([text]) => text === input.value);
      select.value = example ? example[0] : 'custom';
      state.zoom = (example && example[2]) || {};
      input.removeAttribute('aria-invalid');
      const picture = renderPicture();
      await trace();
      await picture;
    }

    async function setView(close) {
      state.close = close;
      if (close) {
        const centre = state.zoom.centre || state.rays[0].points[state.rays[0].points.length - 1];
        const width = state.zoom.width || CLOSE;
        state.view = {left: centre.re - width / 2, top: centre.im + width * HEIGHT / WIDTH / 2, width,
          height: width * HEIGHT / WIDTH};
      } else {
        state.view = WHOLE;
      }
      drawRays();
      describe();
      await renderPicture();
    }

    select.addEventListener('change', () => {
      const angles = parseAngles(select.value);
      if (angles) setAngles(angles);
    });
    input.addEventListener('change', () => {
      const angles = parseAngles(input.value);
      if (angles) setAngles(angles);
      else input.setAttribute('aria-invalid', 'true');
    });
    closeButton.addEventListener('click', () => setView(true));
    window.addEventListener('resize', drawRays);
    kit.whenResized(() => {
      if (!kit.fitsScreen(canvas, WIDTH, HEIGHT)) renderPicture();
    });
    wholeButton.addEventListener('click', () => setView(false));

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, status]) figure.insertBefore(part, caption);
    setAngles(state.angles);
  });
})();
