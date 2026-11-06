/* Interactive figure: the kneading sequence of an angle, one step at a time.

   For θ = p/q the two angles that doubling sends to θ, θ/2 and (θ + 1)/2,
   lie opposite each other, so they cut the circle along a diameter: the half
   that contains θ is the 1-side, the other the 0-side. The figure follows
   θ, 2θ, 4θ, … and writes 1 or 0 for the side each lies on, or ⋆ when one
   lands on a cut (Schleicher, Definition 2.4). Everything is computed with
   whole numbers, by AtlasKit.doublingOrbit and AtlasKit.kneading.

   Built by AtlasKit.setUp for every <figure data-widget="kneading">;
   data-angle chooses the first angle (a fraction such as 1/7). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {subscript, doublingOrbit, kneading} = kit;

  const WIDTH = 440;
  const HEIGHT = 380;
  const CENTER = {x: WIDTH / 2, y: HEIGHT / 2};
  const RADIUS = 135;
  const MAX_DENOMINATOR = 100000;
  const MAX_STEPS = 24;        // the most symbols shown
  const LABELLED = 6;          // the angles named in the drawing: θ, 2θ, …, 32θ
  const ARROWS = 5;            // the latest doublings drawn as arrows
  const PRESETS = ['1/7', '3/7', '7/15', '2/5', '1/5', '1/3', '1/6'];
  const PAUSE = 800;           // milliseconds between steps while playing
  const SIDES = {'1': 'one', '0': 'zero', '⋆': 'star'};

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const reduced = (n, q) => `${n / gcd(n, q)}/${q / gcd(n, q)}`;
  const named = (n, q) => (n === 0 ? '0' : reduced(n, q));

  // "3/7" → {p: 3, q: 7}, reduced modulo 1; null unless it is a fraction strictly between 0 and 1 (mod 1).
  function parseAngle(text) {
    const match = /^\s*(\d{1,15})\s*\/\s*(\d{1,6})\s*$/.exec(text);
    if (!match) return null;
    const q = Number(match[2]);
    if (!q || q > MAX_DENOMINATOR) return null;
    const p = Number(match[1]) % q;
    if (p === 0) return null;
    const d = gcd(p, q);
    return {p: p / d, q: q / d};
  }

  // The k-th angle of the orbit, 2^(k−1)θ, by name: θ, 2θ, 4θ, …, as text or with a superscript.
  const power = k => (k === 1 ? 'θ' : `${2 ** (k - 1)}θ`);
  const powerHTML = k => (k <= 11 ? `${power(k)}` : `2<sup>${k - 1}</sup>θ`).replace('θ', '<var>θ</var>');

  const pointAt = turns => ({
    x: CENTER.x + RADIUS * Math.cos(2 * Math.PI * turns),
    y: CENTER.y - RADIUS * Math.sin(2 * Math.PI * turns),
  });

  kit.setUp('kneading', (figure, id) => {
    const state = {angle: null, orbit: null, symbols: [], steps: 1, shown: 1, timer: null};
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- controls ------------------------------------------------------------

    const angleRow = element('div', 'widget-controls');
    const field = element('label', 'widget-point');
    field.append(element('var', null, 'θ'), ' = ');
    const input = element('input', 'angle-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'Angle as a fraction of a turn, such as 3/7');
    input.addEventListener('change', () => choose(input.value));
    field.append(input);
    const presets = element('div', 'widget-angles');
    for (const preset of PRESETS) {
      const button = element('button', 'widget-button widget-button-quiet', preset);
      button.type = 'button';
      button.addEventListener('click', () => {
        input.value = preset;
        choose(preset);
      });
      presets.append(button);
    }
    angleRow.append(field, presets);

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
    playRow.append(stepButton, playButton);

    // --- drawing -------------------------------------------------------------

    const drawing = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'widget-plane kneading-plane',
      'aria-hidden': 'true'});
    const halves = kit.svg('g', {}, drawing);
    kit.svg('circle', {cx: CENTER.x, cy: CENTER.y, r: RADIUS, class: 'kneading-circle'}, drawing);
    kit.svg('text', {x: CENTER.x + RADIUS + 12, y: CENTER.y + 5, class: 'plane-tick'}, drawing).textContent = '0';
    const defs = kit.svg('defs', {}, drawing);
    const marker = kit.svg('marker', {id: `${id}-arrow`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6,
      markerHeight: 6, orient: 'auto-start-reverse', class: 'arrow kneading-arrow'}, defs);
    kit.svg('path', {d: 'M 0 0 L 10 5 L 0 10 z'}, marker);
    const layer = kit.svg('g', {}, drawing);

    const sequence = element('p', 'kneading-sequence');
    const readout = element('div', 'widget-readout');
    const setup = element('p');
    const step = element('p');
    step.setAttribute('aria-live', 'polite');
    readout.append(setup, step);

    function drawHalves() {
      halves.replaceChildren();
      const {p, q} = state.angle;
      const low = p / (2 * q);
      const [a, b] = [pointAt(low), pointAt(low + .5)];
      const arc = to => `A${RADIUS} ${RADIUS} 0 0 0 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
      // Counterclockwise from θ/2 to (θ + 1)/2 is the 1-side, on to θ/2 again the 0-side.
      kit.svg('path', {d: `M${a.x.toFixed(2)} ${a.y.toFixed(2)}${arc(b)}Z`, class: 'kneading-half kneading-one'}, halves);
      kit.svg('path', {d: `M${b.x.toFixed(2)} ${b.y.toFixed(2)}${arc(a)}Z`, class: 'kneading-half kneading-zero'}, halves);
      for (const [turns, text, side] of [[low + .25, '1-side', 'one'], [low + .75, '0-side', 'zero']]) {
        kit.svg('text', {x: CENTER.x + .58 * RADIUS * Math.cos(2 * Math.PI * turns),
          y: CENTER.y - .58 * RADIUS * Math.sin(2 * Math.PI * turns) + 6, 'text-anchor': 'middle',
          class: `kneading-side kneading-${side}`}, halves).textContent = text;
      }
      kit.svg('line', {x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'kneading-cut-line'}, halves);
      // The names of the cuts inside the circle, beside the ends of the diameter on the 0-side, so that
      // the name of an angle that lands on a cut fits outside.
      const across = {x: Math.cos(2 * Math.PI * (low + .75)), y: -Math.sin(2 * Math.PI * (low + .75))};
      for (const [turns, text] of [[low, 'θ/2'], [low + .5, '(θ + 1)/2']]) {
        const along = {x: Math.cos(2 * Math.PI * turns), y: -Math.sin(2 * Math.PI * turns)};
        const label = kit.svg('text', {'text-anchor': 'middle', class: 'plane-label kneading-cut-label'}, halves);
        label.textContent = text;
        const box = label.getBBox();
        const extent = direction => Math.abs(direction.x) * box.width / 2 + Math.abs(direction.y) * box.height / 2;
        const inward = RADIUS - 28 - extent(along);
        const aside = extent(across) + 6;
        const x = CENTER.x + inward * along.x + aside * across.x;
        const y = CENTER.y + inward * along.y + aside * across.y;
        label.setAttribute('x', x.toFixed(1));
        label.setAttribute('y', y.toFixed(1));
        const placed = label.getBBox();  // move the middle of the text, not its baseline, to (x, y)
        label.setAttribute('y', (y + y - (placed.y + placed.height / 2)).toFixed(1));
      }
    }

    function draw() {
      layer.replaceChildren();
      const {p, q} = state.angle;
      const cuts = [pointAt(p / (2 * q)), pointAt((p + q) / (2 * q))];
      const at = state.orbit.numerators.slice(0, state.shown).map(n => pointAt(n / q));
      // The latest doublings, the last one strongest.
      at.forEach((to, index) => {
        if (!index || index < at.length - ARROWS) return;
        const from = at[index - 1];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length < 1) return;
        const shorten = Math.min(.5, 9 / length);
        kit.svg('line', {x1: from.x, y1: from.y, x2: to.x - (to.x - from.x) * shorten, y2: to.y - (to.y - from.y) * shorten,
          class: `kneading-chord${index === at.length - 1 ? ' kneading-latest' : ''}`, 'marker-end': `url(#${id}-arrow)`},
        layer);
      });
      for (const cut of cuts) kit.svg('circle', {cx: cut.x, cy: cut.y, r: 5, class: 'kneading-cut'}, layer);
      at.forEach(({x, y}, index) => {
        const side = SIDES[state.symbols[index]];
        if (side === 'star') kit.svg('circle', {cx: x, cy: y, r: 10, class: 'kneading-ring'}, layer);
        kit.svg('circle', {cx: x, cy: y, r: index === 0 ? 6.5 : 5, class: `kneading-point kneading-${side}`}, layer);
      });
      kit.placeLabels(layer, at.slice(0, LABELLED).map((point, index) => ({...point, text: power(index + 1),
        className: 'plane-label kneading-label'})), CENTER, 18);
    }

    function describeSetup() {
      const {p, q} = state.angle;
      const {preperiod, period} = state.orbit;
      const kind = preperiod === 0 ? `has period ${period}` : 'is strictly preperiodic';
      setup.innerHTML = `<var>θ</var> = ${p}/${q} ${kind}. Doubling sends both <var>θ</var>/2 = ${reduced(p, 2 * q)} and `
        + `(<var>θ</var> + 1)/2 = ${reduced(p + q, 2 * q)} to <var>θ</var>. They lie opposite each other and cut the circle `
        + 'into two halves: the 1-side, which contains <var>θ</var>, and the 0-side.';
    }

    function describeStep() {
      const {p, q} = state.angle;
      const {numerators, preperiod, period} = state.orbit;
      const k = state.shown;
      const n = numerators[k - 1];
      const symbol = state.symbols[k - 1];
      const where = symbol === '⋆'
        ? `is the cut ${2 * n === p ? '<var>θ</var>/2' : '(<var>θ</var> + 1)/2'}`
        : `lies on the ${symbol}-side${k === 1 ? ', as it always does' : ''}`;
      let text = `Step ${k}: ${powerHTML(k)} = ${named(n, q)} ${where}, so ν${subscript(k)} = ${symbol}.`;
      const done = state.symbols.slice(0, k).join('');
      if (k < state.steps) {
        if (k === 1) text += ' Press Step or Play to double it.';
      } else if (state.steps < numerators.length) {
        text += ` The figure stops after ${MAX_STEPS} steps`
          + (preperiod === 0 ? `; <var>θ</var> has period ${period}, so ⋆ comes at step ${period}.` : '.');
      } else if (preperiod === 0) {
        text += ` <var>θ</var> has period ${period}, so the symbols repeat from here on; one period, ${done}, is `
          + `the kneading sequence of ${p}/${q}.`;
      } else {
        const cycle = state.symbols.slice(preperiod, preperiod + period).join('');
        const repeated = (done + cycle.repeat(Math.ceil(8 / period))).slice(0, Math.max(k + period, 10));
        text += ` The next double, ${named(numerators[preperiod], q)}, already came at step ${preperiod + 1}, so the angles and `
          + `the symbols repeat from here on: the kneading sequence of ${p}/${q} is ${repeated}…, with no ⋆, since an `
          + 'angle on a cut returns to <var>θ</var> one step later, and a strictly preperiodic angle never returns.';
      }
      step.innerHTML = text;  // built only from whole numbers and fixed text
      sequence.replaceChildren(element('var', null, 'ν'), ' = ');
      for (const symbol of state.symbols.slice(0, k)) {
        sequence.append(element('span', `kneading-symbol kneading-${SIDES[symbol]}`, symbol));
      }
      if (k === state.steps && state.steps < numerators.length) sequence.append('…');
    }

    function show(steps) {
      state.shown = Math.max(1, Math.min(steps, state.steps));
      stepButton.disabled = state.shown >= state.steps;
      figure.dataset.step = String(state.shown);
      draw();
      describeStep();
    }

    function play() {
      if (state.shown >= state.steps) show(1);
      if (reducedMotion) {
        show(state.steps);
        return;
      }
      playButton.textContent = 'Pause';
      step.setAttribute('aria-live', 'off');  // no announcement for every step
      const tick = () => {
        show(state.shown + 1);
        if (state.shown >= state.steps) stop();
        else state.timer = setTimeout(tick, PAUSE);
      };
      state.timer = setTimeout(tick, PAUSE);
    }

    function stop() {
      clearTimeout(state.timer);
      state.timer = null;
      playButton.textContent = 'Play';
      step.setAttribute('aria-live', 'polite');
    }

    function choose(text) {
      const angle = parseAngle(text);
      input.classList.toggle('angle-invalid', !angle);
      if (!angle) {
        step.textContent = 'Type a fraction strictly between 0 and 1, such as 3/7, with a denominator up to 100,000.';
        return;
      }
      stop();
      state.angle = angle;
      state.orbit = doublingOrbit(angle.p, angle.q);
      state.steps = Math.min(state.orbit.numerators.length, MAX_STEPS);
      state.symbols = kneading(angle, state.steps);
      figure.dataset.shown = `${angle.p}/${angle.q}`;
      drawHalves();
      describeSetup();
      show(1);
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [angleRow, playRow, drawing, sequence, readout]) figure.insertBefore(part, caption);
    input.value = figure.dataset.angle || '1/7';
    if (!parseAngle(input.value)) input.value = '1/7';
    choose(input.value);
  });
})();
