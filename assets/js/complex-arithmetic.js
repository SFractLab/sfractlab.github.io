/* Interactive figure: adding, multiplying and squaring complex numbers, and
   one step of z ↦ z² + c.

   Built by AtlasKit.setUp for every <figure data-widget="complex-arithmetic">.
   Data attributes on the figure:
     data-modes  "add multiply square" (any of these, offered as a choice)
                 or "step" (one step of z ↦ z² + c, which can be repeated)
     data-z, data-w, data-c  starting values as "re,im"
   The points can be dragged (they snap to steps of 0.05) or typed into the
   number fields; the readout below the drawing states the result in words. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {complex, format, formatNumber, formatAngle} = kit;

  const VIEW = {left: -3, top: 2, width: 6, height: 4};
  const WIDTH = 600;
  const HEIGHT = 400;
  const SNAP = .05;
  const TRAIL_LENGTH = 12;
  const MODE_NAMES = {add: 'Add', multiply: 'Multiply', square: 'Square'};

  function parsePoint(text, fallback) {
    const [re, im] = (text || '').split(',').map(Number);
    return Number.isFinite(re) && Number.isFinite(im) ? {re, im} : fallback;
  }

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // "α + β = γ", noting when the sum passes a full turn.
  function angleSum(first, second) {
    const sum = first + second;
    const turn = sum >= 2 * Math.PI - 1e-9 ? ` (one full turn plus ${formatAngle(sum - 2 * Math.PI)})` : '';
    return `${formatAngle(first)} + ${formatAngle(second)} = ${formatAngle(sum)}${turn}`;
  }

  kit.setUp('complex-arithmetic', (figure, id) => {
    const stepMode = figure.dataset.modes === 'step';
    const modes = stepMode ? ['step']
      : (figure.dataset.modes || 'add multiply square').split(/\s+/).filter(mode => MODE_NAMES[mode]);
    const plane = new kit.Plane(VIEW, WIDTH, HEIGHT);
    const origin = plane.toScreen({re: 0, im: 0});
    const state = {
      mode: modes[0],
      z: parsePoint(figure.dataset.z, {re: 1, im: .5}),
      w: parsePoint(figure.dataset.w, {re: .5, im: 1}),
      c: parsePoint(figure.dataset.c, {re: -.5, im: .5}),
      trail: [],  // earlier points of the orbit, in step mode
    };
    const pointNames = stepMode ? ['z', 'c'] : ['z', 'w'];

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'widget-controls');
    if (modes.length > 1) {
      const group = element('div', 'widget-modes');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', 'Operation');
      for (const mode of modes) {
        const label = element('label');
        const input = element('input');
        input.type = 'radio';
        input.name = `${id}-mode`;
        input.value = mode;
        input.checked = mode === state.mode;
        input.addEventListener('change', () => {
          state.mode = mode;
          update();
        });
        label.append(input, element('span', null, MODE_NAMES[mode]));
        group.append(label);
      }
      controls.append(group);
    }

    const fields = {};
    const fieldGroups = {};
    for (const name of pointNames) {
      const group = element('div', 'widget-point');
      const variable = element('var', null, name);
      const inputs = ['re', 'im'].map(part => {
        const input = element('input');
        input.type = 'number';
        input.step = String(SNAP);
        input.inputMode = 'decimal';
        input.min = String(part === 're' ? VIEW.left : VIEW.top - VIEW.height);
        input.max = String(part === 're' ? VIEW.left + VIEW.width : VIEW.top);
        input.setAttribute('aria-label', `${part === 're' ? 'Real' : 'Imaginary'} part of ${name}`);
        input.addEventListener('input', () => {
          const value = Number(input.value);
          if (input.value.trim() === '' || !Number.isFinite(value)) return;
          const low = Number(input.min);
          const high = Number(input.max);
          state[name] = {...state[name], [part]: Math.min(high, Math.max(low, value))};
          if (stepMode) state.trail = [];
          update();
        });
        return input;
      });
      group.append(variable, ' = ', inputs[0], ' + ', inputs[1], ' i');
      fields[name] = inputs;
      fieldGroups[name] = group;
      controls.append(group);
    }

    if (stepMode) {
      const apply = element('button', 'widget-button', 'Apply z ↦ z² + c');
      apply.type = 'button';
      apply.addEventListener('click', () => {
        state.trail = [...state.trail, state.z].slice(-TRAIL_LENGTH);
        state.z = complex.add(complex.multiply(state.z, state.z), state.c);
        update();
      });
      const restart = element('button', 'widget-button widget-button-quiet', 'Start again');
      restart.type = 'button';
      restart.addEventListener('click', () => {
        if (state.trail.length) state.z = state.trail[0];
        state.trail = [];
        update();
      });
      controls.append(apply, restart);
    }

    // --- drawing -----------------------------------------------------------

    const drawing = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'widget-plane', 'aria-hidden': 'true'});
    const defs = kit.svg('defs', {}, drawing);
    for (const kind of ['z', 'w', 'result', 'helper']) {
      const marker = kit.svg('marker', {
        id: `${id}-arrow-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5,
        markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse', class: `arrow arrow-${kind}`,
      }, defs);
      kit.svg('path', {d: 'M 0 0 L 10 5 L 0 10 z'}, marker);
    }

    const grid = kit.svg('g', {class: 'plane-grid'}, drawing);
    for (let re = Math.ceil(VIEW.left); re <= VIEW.left + VIEW.width; re++) {
      const {x} = plane.toScreen({re, im: 0});
      kit.svg('line', {x1: x, y1: 0, x2: x, y2: HEIGHT, class: re === 0 ? 'plane-axis' : ''}, grid);
      // Labels sit beside their tick, away from the unit circle; the window's edges get none.
      if (re !== 0 && x > 0 && x < WIDTH) {
        kit.svg('text', {x: x + (re > 0 ? 5 : -5), y: origin.y + 18, class: 'plane-tick',
          'text-anchor': re > 0 ? 'start' : 'end'}, grid).textContent = formatNumber(re);
      }
    }
    for (let im = Math.ceil(VIEW.top - VIEW.height); im <= VIEW.top; im++) {
      const {y} = plane.toScreen({re: 0, im});
      kit.svg('line', {x1: 0, y1: y, x2: WIDTH, y2: y, class: im === 0 ? 'plane-axis' : ''}, grid);
      if (im !== 0 && y > 0 && y < HEIGHT) {
        kit.svg('text', {x: origin.x - 6, y: y + (im > 0 ? -6 : 16), class: 'plane-tick', 'text-anchor': 'end'}, grid)
          .textContent = format({re: 0, im});
      }
    }
    kit.svg('circle', {cx: origin.x, cy: origin.y, r: plane.scale, class: 'plane-unit-circle'}, grid);

    const layer = kit.svg('g', {}, drawing);
    const handles = {};
    for (const name of pointNames) {
      const handle = kit.svg('g', {class: `plane-handle plane-handle-${name === 'z' ? 'z' : 'w'}`}, drawing);
      kit.svg('circle', {r: 18, class: 'plane-handle-area'}, handle);
      kit.svg('circle', {r: 7, class: 'plane-handle-dot'}, handle);
      kit.makeDraggable(handle, drawing, (x, y) => {
        state[name] = plane.snap(plane.fromScreen(x, y), SNAP);
        if (stepMode) state.trail = [];
        update();
      });
      handles[name] = handle;
    }

    const at = c => plane.toScreen(c);

    function vector(from, to, kind, extra = '') {
      const a = at(from);
      const b = at(to);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
      kit.svg('line', {x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `plane-vector plane-${kind} ${extra}`,
        'marker-end': `url(#${id}-arrow-${kind})`}, layer);
    }

    function dashed(from, to) {
      const a = at(from);
      const b = at(to);
      kit.svg('line', {x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'plane-connector'}, layer);
    }

    function dot(c, kind, radius = 5) {
      const {x, y} = at(c);
      kit.svg('circle', {cx: x, cy: y, r: radius, class: `plane-dot plane-${kind}`}, layer);
    }

    // Labels are collected while drawing, most important first, and placed at
    // the end so that labels of the same point can be joined.
    let labels = [];

    function label(c, text, kind) {
      labels.push({...at(c), text, className: `plane-label plane-${kind}`});
    }

    function drawLabels() {
      kit.placeLabels(layer, labels, origin);
      labels = [];
    }

    function arc(radius, from, to, kind) {
      if (to - from < 1e-6) return;
      kit.svg('path', {d: kit.arcPath(origin, radius, from, to), class: `plane-arc plane-${kind}`}, layer);
    }

    // --- update ------------------------------------------------------------

    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    function draw() {
      layer.replaceChildren();
      const {z, w, c, mode} = state;
      label(z, 'z', 'z');
      if (mode !== 'square') label(stepMode ? c : w, stepMode ? 'c' : 'w', 'w');
      if (mode === 'add') {
        const sum = complex.add(z, w);
        dashed(z, sum);
        dashed(w, sum);
        vector({re: 0, im: 0}, z, 'z');
        vector({re: 0, im: 0}, w, 'w');
        vector({re: 0, im: 0}, sum, 'result');
        label(sum, 'z + w', 'result');
      } else if (mode === 'multiply') {
        const product = complex.multiply(z, w);
        if (complex.abs(z) && complex.abs(w)) {
          arc(34, 0, complex.arg(z), 'z');
          arc(34, complex.arg(z), complex.arg(z) + complex.arg(w), 'w');
        }
        vector({re: 0, im: 0}, z, 'z');
        vector({re: 0, im: 0}, w, 'w');
        vector({re: 0, im: 0}, product, 'result');
        label(product, 'z · w', 'result');
      } else if (mode === 'square') {
        const square = complex.multiply(z, z);
        if (complex.abs(z)) {
          arc(34, 0, complex.arg(z), 'z');
          arc(42, complex.arg(z), 2 * complex.arg(z), 'z');
        }
        vector({re: 0, im: 0}, z, 'z');
        vector({re: 0, im: 0}, square, 'result');
        label(square, 'z²', 'result');
      } else {
        const square = complex.multiply(z, z);
        const next = complex.add(square, c);
        const orbit = [...state.trail, z];
        for (let i = 1; i < orbit.length; i++) dashed(orbit[i - 1], orbit[i]);
        vector({re: 0, im: 0}, c, 'w', 'plane-vector-light');
        vector({re: 0, im: 0}, square, 'helper');
        dot(square, 'helper', 4);
        vector(square, next, 'w');
        dot(next, 'result');
        label(next, 'z² + c', 'result');
        label(square, 'z²', 'helper');
        state.trail.forEach((point, index) => {
          dot(point, 'trail', 4);
          label(point, `z${kit.subscript(index)}`, 'trail');
        });
      }
      for (const name of pointNames) {
        const {x, y} = at(state[name]);
        handles[name].setAttribute('transform', `translate(${x} ${y})`);
        handles[name].style.display = mode === 'square' && name === 'w' ? 'none' : '';
      }
      drawLabels();
    }

    function describe() {
      const {z, w, c, mode} = state;
      const length = value => formatNumber(complex.abs(value));
      if (mode === 'add') {
        return `<var>z</var> + <var>w</var> = (${format(z)}) + (${format(w)}) = ${format(complex.add(z, w))}. `
          + 'Real parts add and imaginary parts add: the sum is the far corner of the parallelogram.';
      }
      if (mode === 'multiply') {
        const product = complex.multiply(z, w);
        if (!complex.abs(z) || !complex.abs(w)) return `<var>z</var> · <var>w</var> = 0. A product with 0 is 0, which has no angle.`;
        return `<var>z</var> · <var>w</var> = (${format(z)}) · (${format(w)}) = ${format(product)}. `
          + `Lengths multiply: ${length(z)} × ${length(w)} = ${length(product)}. `
          + `Angles add: ${angleSum(complex.arg(z), complex.arg(w))}.`;
      }
      if (mode === 'square') {
        const square = complex.multiply(z, z);
        if (!complex.abs(z)) return '0<sup>2</sup> = 0.';
        const size = complex.abs(z);
        const where = Math.abs(size - 1) < 1e-9 ? ' On the unit circle, squaring keeps a point on the circle.'
          : size < 1 ? ' Inside the unit circle, squaring moves a point inward.'
            : ' Outside the unit circle, squaring moves a point outward.';
        return `<var>z</var><sup>2</sup> = (${format(z)})<sup>2</sup> = ${format(square)}. `
          + `The length is squared, ${length(z)}<sup>2</sup> = ${length(square)}, and the angle doubles, `
          + `${angleSum(complex.arg(z), complex.arg(z))}.${where}`;
      }
      const square = complex.multiply(z, z);
      const next = complex.add(square, c);
      const orbit = state.trail.length
        ? ` Orbit so far: ${[...state.trail, z].map(point => format(point)).join(' → ')}.` : '';
      return `<var>z</var> = ${format(z)}, so <var>z</var><sup>2</sup> = ${format(square)}, `
        + `and adding <var>c</var> = ${format(c)} gives ${format(next)}.${orbit}`;
    }

    function update() {
      for (const name of pointNames) {
        fields[name].forEach((input, index) => {
          if (input === document.activeElement) return;  // don't disturb typing
          input.value = String(Number((index ? state[name].im : state[name].re).toFixed(4)));
        });
      }
      if (fieldGroups.w) fieldGroups.w.hidden = state.mode === 'square';
      draw();
      readout.innerHTML = describe();  // built only from numbers formatted above
    }

    const caption = figure.querySelector('figcaption');
    figure.insertBefore(controls, caption);
    figure.insertBefore(drawing, caption);
    figure.insertBefore(readout, caption);
    update();
  });
})();
