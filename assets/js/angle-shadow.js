/* Interactive figure: the orbit of a real starting point under x ↦ x² − 2,
   the map at c = −2, seen through the angle θ with x = 2 cos 2πθ.

   A point at the angle θ on a circle casts its shadow straight down onto the
   interval [−2, 2] drawn below the circle, on the same horizontal scale: the
   shadow is x = 2 cos 2πθ. One step of the map doubles the angle, so the point
   jumps to 2θ and its shadow to x² − 2. Earlier values stay as dots on the
   line. An optional second start 10⁻¹⁰ away, in gold, has its dots on a rail
   below the line: the two orbits agree for about 30 steps, then part.

   The orbits are computed with whole numbers, as fixed-point numbers with
   PRECISION binary digits. On the interval |f′(x)| = 2|x| ≤ 4, so an error
   grows at most fourfold per step: after MAX_STEPS steps it is still below
   2^−200, and every value shown is exact. The angles come from these values:
   θₙ is whichever of ±arccos(xₙ/2)/2π (mod 1) lies nearer to 2θₙ₋₁.

   Built by AtlasKit.setUp for every <figure data-widget="angle-shadow">.
   Data attribute: data-x0, the starting point (default "0.3"). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber, subscript} = kit;

  const WIDTH = 480;
  const HEIGHT = 404;
  const CENTER = {x: 240, y: 162};
  const RADIUS = 120;
  const LINE = 340;          // the number line from −2 to 2
  const RAIL = LINE + 20;    // the second start's dots
  const PRECISION = 1200n;   // binary digits of the fixed-point numbers
  const MAX_STEPS = 500;
  const SLOW_STEPS = 40;     // the first steps are played slowly, the rest quickly
  const SLOW = 300;          // milliseconds per step
  const FAST = 60;
  const ONE = 1n << PRECISION;
  const TWO = 2n * ONE;
  const TEN_TO_TEN = 10n ** 10n;
  const NEARBY = (2n * ONE + TEN_TO_TEN) / (2n * TEN_TO_TEN);  // 10⁻¹⁰, rounded
  const SUPERSCRIPTS = {'−': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The integer square root of a positive whole number, by Newton's method from above.
  function squareRoot(n) {
    let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
    for (;;) {
      const next = (x + n / x) >> 1n;
      if (next >= x) return x;
      x = next;
    }
  }

  const GOLDEN = (ONE + squareRoot(5n * ONE * ONE)) / 2n;  // (1 + √5)/2 = 2 cos 2π/10
  const PRESETS = [
    ['0.3', parse('0.3')],
    ['(1 + √5)/2', GOLDEN, 'x₀ = (1 + √5)/2 ≈ 1.618034, the golden ratio'],
    ['−1', -ONE],
    ['0', 0n],
  ];

  // A typed decimal as a fixed-point number, rounded to the nearest; null if it is none.
  function parse(text) {
    if (!text.trim()) return null;
    const match = /^\s*([-−+]?)(\d*)(?:\.(\d*))?\s*$/.exec(text);
    if (match && (match[2] || match[3])) {
      const fraction = match[3] || '';
      const scale = 10n ** BigInt(fraction.length);
      const size = (BigInt((match[2] || '0') + fraction) * ONE * 2n + scale) / (2n * scale);
      return match[1] === '-' || match[1] === '−' ? -size : size;
    }
    const value = Number(text);  // such as 1e-5
    return Number.isFinite(value) ? BigInt(Math.round(value * 2 ** 52)) * (ONE >> 52n) : null;
  }

  const toNumber = (x, bits = 60n) => Number(x >> (PRECISION - bits)) / 2 ** Number(bits);

  // "3.2 × 10⁻⁹" below a thousandth, otherwise a decimal.
  function formatSmall(value) {
    if (value === 0) return '0';
    if (value >= 1e-3) return formatNumber(value, 3);
    const [mantissa, exponent] = value.toExponential(1).split('e');
    const power = String(Number(exponent)).replace('-', '−').replace(/./g, digit => SUPERSCRIPTS[digit]);
    return `${formatNumber(Number(mantissa), 1)} × 10${power}`;
  }

  function orbitOf(start) {
    const values = [start];
    let x = start;
    for (let n = 0; n < MAX_STEPS; n++) {
      x = ((x * x) >> PRECISION) - TWO;
      values.push(x);
    }
    const numbers = values.map(value => toNumber(value));
    const turns = x => Math.acos(Math.max(-1, Math.min(1, x / 2))) / (2 * Math.PI);  // in [0, 1/2]
    const angles = [turns(numbers[0])];
    for (let n = 1; n < numbers.length; n++) {
      const upper = turns(numbers[n]);
      const doubled = (2 * angles[n - 1]) % 1;
      const gap = t => Math.min(Math.abs(t - doubled), 1 - Math.abs(t - doubled));
      angles.push(gap(upper) <= gap(1 - upper) ? upper : (1 - upper) % 1);
    }
    return {values, numbers, angles};
  }

  const shadowX = x => CENTER.x + RADIUS * x / 2;
  const pointAt = turns => ({
    x: CENTER.x + RADIUS * Math.cos(2 * Math.PI * turns),
    y: CENTER.y - RADIUS * Math.sin(2 * Math.PI * turns),
  });

  kit.setUp('angle-shadow', (figure, id) => {
    const state = {start: 0n, name: '', orbits: [], second: false, shown: 0, timer: null};
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- controls ------------------------------------------------------------

    const startRow = element('div', 'widget-controls');
    const point = element('div', 'widget-point');
    const input = element('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '-2';
    input.max = '2';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', 'Starting point x₀, between −2 and 2');
    input.addEventListener('input', () => {
      const value = parse(input.value);
      if (value !== null) setStart(value);
    });
    const name = element('var', null, 'x');
    name.append(element('sub', null, '0'));
    point.append(name, ' = ', input);
    const presets = element('div', 'widget-angles');
    for (const [label, value, title] of PRESETS) {
      const button = element('button', 'widget-button widget-button-quiet', label);
      button.type = 'button';
      button.addEventListener('click', () => setStart(value, title));
      presets.append(button);
    }
    startRow.append(point, presets);

    const playRow = element('div', 'widget-controls');
    const stepButton = element('button', 'widget-button', 'Step');
    stepButton.type = 'button';
    stepButton.addEventListener('click', () => {
      stop();
      show(state.shown + 1);
    });
    const playButton = element('button', 'widget-button', 'Play');
    playButton.type = 'button';
    playButton.addEventListener('click', () => (state.timer ? stop() : play()));
    const toggle = element('label', 'shadow-toggle');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      state.second = checkbox.checked;
      show(state.shown);
    });
    toggle.append(checkbox, 'Second start 10⁻¹⁰ away');
    playRow.append(stepButton, playButton, toggle);

    // --- drawing -------------------------------------------------------------

    const drawing = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'widget-plane shadow-plane', 'aria-hidden': 'true'});
    kit.svg('circle', {cx: CENTER.x, cy: CENTER.y, r: RADIUS, class: 'doubling-circle'}, drawing);
    for (const [turns, text] of [[0, '0'], [.25, '1/4'], [.5, '1/2'], [.75, '3/4']]) {
      const outside = {x: CENTER.x + (RADIUS + 22) * Math.cos(2 * Math.PI * turns),
        y: CENTER.y - (RADIUS + 22) * Math.sin(2 * Math.PI * turns) + 5};
      kit.svg('text', {x: outside.x, y: outside.y, 'text-anchor': 'middle', class: 'plane-tick'}, drawing).textContent = text;
    }
    const rail = kit.svg('line', {x1: shadowX(-2), y1: RAIL, x2: shadowX(2), y2: RAIL, class: 'shadow-rail'}, drawing);
    kit.svg('line', {x1: shadowX(-2), y1: LINE, x2: shadowX(2), y2: LINE, class: 'shadow-line'}, drawing);
    for (let x = -2; x <= 2; x++) {
      kit.svg('line', {x1: shadowX(x), y1: LINE - 6, x2: shadowX(x), y2: LINE + 6, class: 'shadow-line'}, drawing);
      kit.svg('text', {x: shadowX(x), y: LINE + 50, 'text-anchor': 'middle', class: 'plane-tick'}, drawing)
        .textContent = formatNumber(x);
    }
    const marker = kit.svg('marker', {id: `${id}-arrow`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6,
      markerHeight: 6, orient: 'auto-start-reverse', class: 'arrow shadow-first'}, kit.svg('defs', {}, drawing));
    kit.svg('path', {d: 'M 0 0 L 10 5 L 0 10 z'}, marker);
    const trail = kit.svg('g', {}, drawing);
    const current = kit.svg('g', {}, drawing);
    const readout = element('div', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    function draw() {
      trail.replaceChildren();
      current.replaceChildren();
      rail.style.display = state.second ? '' : 'none';
      const n = state.shown;
      // The second start first, so that the first one stays on top while they agree.
      for (const index of state.second ? [1, 0] : [0]) {
        const {numbers, angles} = state.orbits[index];
        const y = index ? RAIL : LINE;
        const kind = index ? 'shadow-second' : 'shadow-first';
        for (let k = 0; k < n; k++) {
          kit.svg('circle', {cx: shadowX(numbers[k]), cy: y, r: 3.75, class: `shadow-trail ${kind}`}, trail);
        }
        const at = pointAt(angles[n]);
        const shadow = {x: shadowX(numbers[n]), y};
        if (index === 0 && n > 0) {
          // The jump from the previous angle to its double, stopping short of the point.
          const from = pointAt(angles[n - 1]);
          const length = Math.hypot(at.x - from.x, at.y - from.y);
          if (length > 1) {
            const shorten = Math.min(.5, 9 / length);
            kit.svg('line', {x1: from.x, y1: from.y, x2: at.x - (at.x - from.x) * shorten, y2: at.y - (at.y - from.y) * shorten,
              class: `shadow-chord ${kind}`, 'marker-end': `url(#${id}-arrow)`}, current);
          }
        }
        kit.svg('line', {x1: at.x, y1: at.y, x2: shadow.x, y2: shadow.y, class: `shadow-drop ${kind}`}, current);
        kit.svg('circle', {cx: at.x, cy: at.y, r: index ? 8.5 : 6, class: `shadow-point ${kind}`}, current);
        kit.svg('circle', {cx: shadow.x, cy: shadow.y, r: index ? 9.75 : 8.25, class: `shadow-point ${kind}`}, current);
        if (index === 0) {
          kit.placeLabels(current, [{...at, text: `θ${subscript(n)}`, className: 'plane-label shadow-label'}], CENTER, 18);
          // xₙ above the line, to the right of the dashed line that ends at it.
          kit.svg('text', {x: shadow.x + 10, y: LINE - 14, class: 'plane-label shadow-label'}, current)
            .textContent = `x${subscript(n)}`;
        }
      }
    }

    function describe() {
      const n = state.shown;
      const [first, second] = state.orbits;
      const value = orbit => formatNumber(orbit.numbers[n], 6);
      const angle = orbit => formatNumber(orbit.angles[n], 4);
      const step = n === 0
        ? `Start: ${state.name}, at the angle θ₀ = ${angle(first)} of a turn. Press Play or Step to follow its orbit under `
          + '<var>x</var> ↦ <var>x</var><sup>2</sup> − 2.'
        : `Step ${n}: x${subscript(n)} = ${value(first)}, at the angle θ${subscript(n)} = ${angle(first)} of a turn`
          + `${n === MAX_STEPS ? '; the figure stops here' : ''}. Start: ${state.name}.`;
      let text = `<p>${step}</p>`;
      if (state.second) {
        const sign = second.values[0] > first.values[0] ? '+' : '−';
        const distance = toNumber(second.values[n] > first.values[n] ? second.values[n] - first.values[n]
          : first.values[n] - second.values[n], 200n);
        text += `<p>Second start x₀ ${sign} 10⁻¹⁰: x${subscript(n)} = ${value(second)}. `
          + `The two orbits are ${formatSmall(distance)} apart.</p>`;
      }
      readout.innerHTML = text;  // built only from numbers formatted above and fixed text
    }

    function show(steps) {
      state.shown = Math.max(0, Math.min(steps, MAX_STEPS));
      stepButton.disabled = state.shown >= MAX_STEPS;
      draw();
      describe();
    }

    function play() {
      if (state.shown >= MAX_STEPS) show(0);
      if (reducedMotion) {
        show(MAX_STEPS);
        return;
      }
      playButton.textContent = 'Pause';
      readout.setAttribute('aria-live', 'off');  // no announcement for every step
      const tick = () => {
        show(state.shown + 1);
        if (state.shown >= MAX_STEPS) stop();
        else state.timer = setTimeout(tick, state.shown < SLOW_STEPS ? SLOW : FAST);
      };
      state.timer = setTimeout(tick, SLOW);
    }

    function stop() {
      clearTimeout(state.timer);
      state.timer = null;
      playButton.textContent = 'Play';
      readout.setAttribute('aria-live', 'polite');
    }

    // A new start clears the orbit; a start outside [−2, 2] is kept within it.
    function setStart(value, title = null) {
      stop();
      const kept = value > TWO ? TWO : value < -TWO ? -TWO : value;
      state.start = kept;
      state.name = title || `x₀ = ${formatNumber(toNumber(kept), 10)}${kept === value ? '' : ' (kept within [−2, 2])'}`;
      const nearby = kept + NEARBY <= TWO ? kept + NEARBY : kept - NEARBY;
      state.orbits = [orbitOf(kept), orbitOf(nearby)];
      if (input !== document.activeElement || kept !== value) input.value = formatNumber(toNumber(kept), 10);
      show(0);
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [startRow, playRow, drawing, readout]) figure.insertBefore(part, caption);
    setStart(parse(figure.dataset.x0 || '0.3') ?? parse('0.3'));
  });
})();
