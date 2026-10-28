/* Interactive figure: parameter rays of the Mandelbrot set.

   For each angle θ = p/q, in turns, the parameter ray is followed inward from
   far out (AtlasKit.parameterRay), as the rays chapter describes: the point of the ray at radius r
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

    // Draws the rays traced so far: each as a path from where it enters the
    // window (with a margin) to its last point, with its angle where it enters.
    function drawRays() {
      overlay.replaceChildren();
      kit.drawRays(overlay, state.rays.map(ray => ({points: ray.points, text: name(ray.angle), end: ray.done})),
        plane(), WIDTH, HEIGHT);
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
          generator: kit.parameterRay(angle, info.periodic ? DEPTH_PERIODIC : DEPTH_PREPERIODIC)};
      });
      describe();
      for (const ray of state.rays) {
        for (;;) {
          let finished = false;
          for (let k = 0; k < HALVINGS_PER_FRAME * kit.RAY_STEPS; k++) {
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
