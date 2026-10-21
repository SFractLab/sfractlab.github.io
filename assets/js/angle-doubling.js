/* Interactive figure: angle doubling θ ↦ 2θ mod 1, angles in full turns.

   Squaring doubles arguments, so external rays at angle θ map to the rays at
   2θ. For a fraction θ = p/q the orbit p/q → 2p/q → 4p/q → … (mod 1) is
   computed exactly with whole numbers: its numerators are p·2ⁿ mod q, which
   are also the remainders of the long division that gives θ in binary. So
   the orbit and the binary digits share their preperiod and period, and
   doubling shifts the digits one place left.

   Built by AtlasKit.setUp for every <figure data-widget="angle-doubling">.
   Data attribute: data-angle as "p/q" (default "1/3"). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {subscript, doublingOrbit, binary} = kit;

  const SIZE = 360;
  const RADIUS = 140;
  const MAX_DENOMINATOR = 99;
  const MAX_DRAWN = 24;       // orbit points drawn and listed
  const TICKS_UP_TO = 36;     // ticks at the multiples of 1/q for q up to this
  const PRESETS = ['0/1', '1/2', '1/3', '1/6', '1/7', '2/7', '1/5', '1/12'];

  // Where the parameter rays at some angles land, as stated in the chapters
  // and the literature they cite. Keys are reduced fractions.
  const LANDINGS = {
    '0/1': 'The parameter ray at 0 lands at the cusp <var>c</var> = 1/4.',
    '1/2': 'The parameter ray at 1/2 lands at the tip <var>c</var> = −2.',
    '1/3': 'The parameter rays at 1/3 and 2/3 both land at <var>c</var> = −3/4, the root of the period-two disk.',
    '2/3': 'The parameter rays at 1/3 and 2/3 both land at <var>c</var> = −3/4, the root of the period-two disk.',
    '1/7': 'The parameter rays at 1/7 and 2/7 land together at the root of the period-three bulb, <var>c</var> = −1/8 + (3√3/8)<var>i</var>.',
    '2/7': 'The parameter rays at 1/7 and 2/7 land together at the root of the period-three bulb, <var>c</var> = −1/8 + (3√3/8)<var>i</var>.',
    '1/6': 'The parameter ray at 1/6 lands at the Misiurewicz parameter <var>c</var> = <var>i</var>.',
    '5/6': 'The parameter ray at 5/6 lands at the Misiurewicz parameter <var>c</var> = −<var>i</var>.',
  };

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const fraction = (n, q) => {
    const d = gcd(n, q);
    return `${n / d}/${q / d}`;
  };

  kit.setUp('angle-doubling', (figure, id) => {
    const [startP, startQ] = (figure.dataset.angle || '1/3').split('/').map(Number);
    const state = {p: 1, q: 3};
    const center = {x: SIZE / 2, y: SIZE / 2};
    const pointAt = turns => ({
      x: center.x + RADIUS * Math.cos(2 * Math.PI * turns),
      y: center.y - RADIUS * Math.sin(2 * Math.PI * turns),
    });

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'widget-controls');
    const point = element('div', 'widget-point');
    const inputs = ['numerator', 'denominator'].map(part => {
      const input = element('input');
      input.type = 'number';
      input.step = '1';
      input.min = part === 'numerator' ? '0' : '1';
      input.max = String(MAX_DENOMINATOR);
      input.setAttribute('aria-label', `${part === 'numerator' ? 'Numerator' : 'Denominator'} of the angle θ, in full turns`);
      input.addEventListener('input', () => {
        const p = Number(inputs[0].value);
        const q = Number(inputs[1].value);
        if (Number.isInteger(p) && Number.isInteger(q) && p >= 0 && q >= 1 && q <= MAX_DENOMINATOR) update(p, q);
      });
      return input;
    });
    point.append(element('var', null, 'θ'), ' = ', inputs[0], ' / ', inputs[1], ' of a full turn');
    const presets = element('div', 'widget-angles');
    for (const preset of PRESETS) {
      const [p, q] = preset.split('/').map(Number);
      const button = element('button', 'widget-button widget-button-quiet', q === 1 ? '0' : preset);
      button.type = 'button';
      button.addEventListener('click', () => update(p, q));
      presets.append(button);
    }
    controls.append(point, presets);

    // --- drawing -------------------------------------------------------------

    const drawing = kit.svg('svg', {viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'widget-plane doubling-plane', 'aria-hidden': 'true'});
    kit.svg('circle', {cx: center.x, cy: center.y, r: RADIUS, class: 'doubling-circle'}, drawing);
    for (const [turns, text] of [[0, '0'], [.25, '1/4'], [.5, '1/2'], [.75, '3/4']]) {
      const outside = {x: center.x + (RADIUS + 22) * Math.cos(2 * Math.PI * turns), y: center.y - (RADIUS + 22) * Math.sin(2 * Math.PI * turns) + 5};
      kit.svg('text', {x: outside.x, y: outside.y, 'text-anchor': 'middle', class: 'plane-tick'}, drawing).textContent = text;
    }
    const defs = kit.svg('defs', {}, drawing);
    for (const kind of ['cycle', 'lead']) {
      const marker = kit.svg('marker', {id: `${id}-arrow-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5,
        markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse', class: `arrow doubling-arrow-${kind}`}, defs);
      kit.svg('path', {d: 'M 0 0 L 10 5 L 0 10 z'}, marker);
    }
    const ticks = kit.svg('g', {}, drawing);
    const layer = kit.svg('g', {}, drawing);
    const readout = element('div', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    function draw(orbit) {
      ticks.replaceChildren();
      layer.replaceChildren();
      if (state.q <= TICKS_UP_TO) {
        for (let k = 0; k < state.q; k++) {
          const {x, y} = pointAt(k / state.q);
          kit.svg('circle', {cx: x, cy: y, r: 2, class: 'doubling-tick'}, ticks);
        }
      }
      const shown = orbit.numerators.slice(0, MAX_DRAWN);
      const at = shown.map(n => pointAt(n / state.q));
      // Arrows from each angle to its double; the last one closes the cycle.
      at.forEach((from, index) => {
        const nextIndex = index + 1 < orbit.numerators.length ? index + 1 : orbit.preperiod;
        if (nextIndex >= shown.length) return;
        const to = at[nextIndex];
        const kind = index < orbit.preperiod ? 'lead' : 'cycle';
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length < 1) return;  // a fixed angle: no arrow
        // Stop short of the target dot, so the arrowhead stays visible.
        const shorten = Math.min(.5, 8 / length);
        kit.svg('line', {x1: from.x, y1: from.y, x2: to.x - (to.x - from.x) * shorten, y2: to.y - (to.y - from.y) * shorten,
          class: `doubling-chord doubling-${kind}`, 'marker-end': `url(#${id}-arrow-${kind})`}, layer);
      });
      at.forEach(({x, y}, index) => {
        kit.svg('circle', {cx: x, cy: y, r: index === 0 ? 6 : 4.5,
          class: `doubling-point doubling-${index < orbit.preperiod ? 'lead' : 'cycle'}${index === 0 ? ' doubling-first' : ''}`}, layer);
      });
      kit.placeLabels(layer, at.slice(0, 8).map((point, index) => ({
        ...point, text: `θ${subscript(index)}`, className: `plane-label doubling-label-${index < orbit.preperiod ? 'lead' : 'cycle'}`,
      })), center, 18);
    }

    function describe(orbit) {
      const {numerators, digits, preperiod, period} = orbit;
      const q = state.q;
      const names = numerators.slice(0, MAX_DRAWN).map(n => (n === 0 ? '0' : fraction(n, q)));
      const repeat = names[preperiod] ?? fraction(numerators[preperiod], q);
      const listed = names.join(' → ') + (numerators.length > MAX_DRAWN ? ' → …' : ` → ${repeat} → …`);
      const theta = numerators[0] === 0 ? '0' : fraction(numerators[0], q);
      const kind = preperiod === 0
        ? (period === 1 ? 'a fixed angle' : `periodic with period ${period}`)
        : `strictly preperiodic: after ${preperiod} step${preperiod === 1 ? '' : 's'} it enters ${period === 1 ? 'a fixed angle' : `a cycle of period ${period}`}`;
      // The binary digits of the first few angles: doubling shifts them left.
      const shifts = digits.length <= 12
        ? numerators.slice(0, Math.min(4, numerators.length + 1)).map((_, index) => {
          const shifted = doublingOrbit(numerators[index], q);
          return binary(shifted.digits, shifted.preperiod);
        }).join(' → ')
        : null;
      const landing = preperiod === 0
        ? 'Parameter rays at periodic angles land at parabolic parameters, the roots of components.'
        : 'Parameter rays at strictly preperiodic angles land at Misiurewicz parameters.';
      const known = LANDINGS[theta === '0' ? '0/1' : theta];
      return `<p><var>θ</var> = ${theta} = ${binary(digits, preperiod)}. Doubling gives ${listed}, so this angle is ${kind}.</p>`
        + (shifts ? `<p>In binary, doubling drops the first digit and shifts the rest left: ${shifts}.</p>` : '')
        + `<p>${landing}${known ? ` ${known}` : ''}</p>`;
    }

    function update(p, q) {
      const d = gcd(p % q, q);
      state.p = p % q;
      state.q = q;
      inputs.forEach((input, index) => {
        if (input !== document.activeElement) input.value = String(index ? q : state.p);
      });
      const orbit = doublingOrbit(state.p / d, q / d);
      // Draw in the user's denominator: scale the reduced numerators back.
      const scaled = {...orbit, numerators: orbit.numerators.map(n => n * d)};
      draw(scaled);
      readout.innerHTML = describe(scaled);  // built only from whole numbers formatted above
    }

    // Dragging on the circle chooses the nearest multiple of 1/q.
    kit.makeDraggable(drawing, drawing, (x, y) => {
      const turns = (Math.atan2(center.y - y, x - center.x) / (2 * Math.PI) + 1) % 1;
      update(Math.round(turns * state.q) % state.q, state.q);
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, drawing, readout]) figure.insertBefore(part, caption);
    const valid = Number.isInteger(startP) && Number.isInteger(startQ) && startQ >= 1 && startQ <= MAX_DENOMINATOR && startP >= 0;
    update(valid ? startP : 1, valid ? startQ : 3);
  });
})();
