/* Interactive figure: the multiplier map λ ↦ c = λ/2 − λ²/4.

   A fixed point a of z ↦ z² + c has multiplier λ = f′(a) = 2a, and then
   c = a − a² = λ/2 − λ²/4. The open unit disk of attracting multipliers maps
   onto the inside of the main cardioid, and its boundary circle onto the
   cardioid itself.

   Built by AtlasKit.setUp for every <figure data-widget="multiplier-map">.
   Left: the multiplier plane with the unit disk. Right: the parameter plane
   with the cardioid, the period-two disk and a silhouette of the Mandelbrot
   set. Dragging either point moves the other; near the marked angles p/q
   of the unit circle, λ snaps onto them, and their images are the roots
   where the bulbs of period q attach. Data attribute: data-lambda as
   "re,im" (default "0.5,0.5"). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {complex, format, formatNumber} = kit;

  const LAMBDA_VIEW = {left: -1.5, top: 1.5, width: 3, height: 3};
  const C_VIEW = {left: -1.4, top: 1, width: 2, height: 2};
  const SIZE = 360;
  const GRID = .01;
  const SNAP_DISTANCE = 9;  // drawing units within which λ snaps onto a marked angle
  const MASK_BUDGET = 200;
  // Angles p/q of a full turn marked on the unit circle; the buttons offer some.
  const ANGLES = [[0, 1], [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5]];
  const BUTTONS = [[0, 1], [1, 2], [1, 3], [1, 4], [2, 5]];

  const real = x => ({re: x, im: 0});
  // c = λ/2 − λ²/4
  const parameter = lambda => complex.add(complex.multiply(real(.5), lambda),
    complex.multiply(real(-.25), complex.multiply(lambda, lambda)));
  const onCircle = (p, q) => ({re: Math.cos(2 * Math.PI * p / q), im: Math.sin(2 * Math.PI * p / q)});
  const angleName = (p, q) => (q === 1 ? '0' : `${p}/${q}`);

  function squareRoot(w) {
    const size = complex.abs(w);
    const re = Math.sqrt((size + w.re) / 2);
    const im = Math.sqrt(Math.max(0, (size - w.re) / 2));
    return {re, im: w.im < 0 ? -im : im};
  }

  // The multiplier of a fixed point for parameter c: λ = 1 ± √(1 − 4c). Of
  // the two (they sum to 2) the smaller one, the attracting one if any.
  function multiplierOf(c) {
    const root = squareRoot({re: 1 - 4 * c.re, im: -4 * c.im});
    const first = {re: 1 - root.re, im: -root.im};
    const second = {re: 1 + root.re, im: root.im};
    return complex.abs(first) <= complex.abs(second) ? first : second;
  }

  function markedAngle(lambda) {
    return ANGLES.find(([p, q]) => complex.abs(complex.add(lambda, complex.multiply(real(-1), onCircle(p, q)))) < 1e-9);
  }

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function describe(lambda) {
    const size = complex.abs(lambda);
    const c = parameter(lambda);
    const other = complex.add(real(2), complex.multiply(real(-1), lambda));
    const otherSize = complex.abs(other);
    const opening = `<var>λ</var> = ${format(lambda, 3)}, |<var>λ</var>| = ${formatNumber(size, 3)}, so `
      + `<var>c</var> = <var>λ</var>/2 − <var>λ</var><sup>2</sup>/4 = ${format(c, 3)}. `;
    if (Math.abs(size - 1) < 1e-9) {
      const angle = markedAngle(lambda);
      const where = !angle ? ''
        : angle[1] === 1 ? ' At <var>λ</var> = 1 this is the cusp <var>c</var> = 1/4.'
          : ` At ${angle[0]}/${angle[1]} of a full turn it is the root where the bulb of period ${angle[1]} attaches.`;
      return `${opening}On the unit circle the fixed point is neutral, so <var>c</var> lies on the main cardioid.${where}`;
    }
    if (size < 1) {
      return `${opening}The fixed point <var>a</var> = <var>λ</var>/2 = ${format(complex.multiply(real(.5), lambda), 3)} `
        + `has multiplier <var>f</var>′(<var>a</var>) = 2<var>a</var> = <var>λ</var> of modulus below 1, so it attracts: `
        + '<var>c</var> lies inside the main cardioid.';
    }
    if (otherSize < 1) {
      return `${opening}This fixed point repels, but the other one, 1 − <var>λ</var>/2, has multiplier `
        + `2 − <var>λ</var> = ${format(other, 3)} of modulus ${formatNumber(otherSize, 3)} and attracts. `
        + 'So <var>c</var> is still inside the main cardioid: <var>λ</var> and 2 − <var>λ</var> give the same <var>c</var>.';
    }
    return `${opening}Both fixed points repel (the other multiplier, 2 − <var>λ</var>, has modulus `
      + `${formatNumber(otherSize, 3)}), so <var>c</var> lies outside the main cardioid. It may still belong to the `
      + 'Mandelbrot set, in another component such as a bulb, or on its boundary.';
  }

  kit.setUp('multiplier-map', (figure, id) => {
    const lambdaPlane = new kit.Plane(LAMBDA_VIEW, SIZE, SIZE);
    const cPlane = new kit.Plane(C_VIEW, SIZE, SIZE);
    const [startRe, startIm] = (figure.dataset.lambda || '').split(',').map(Number);
    const state = {lambda: Number.isFinite(startRe) && Number.isFinite(startIm) ? {re: startRe, im: startIm} : {re: .5, im: .5}};

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'widget-controls');
    const point = element('div', 'widget-point');
    const fields = ['re', 'im'].map(part => {
      const input = element('input');
      input.type = 'number';
      input.step = String(GRID);
      input.inputMode = 'decimal';
      input.min = String(part === 're' ? LAMBDA_VIEW.left : LAMBDA_VIEW.top - LAMBDA_VIEW.height);
      input.max = String(part === 're' ? LAMBDA_VIEW.left + LAMBDA_VIEW.width : LAMBDA_VIEW.top);
      input.setAttribute('aria-label', `${part === 're' ? 'Real' : 'Imaginary'} part of the multiplier λ`);
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (input.value.trim() === '' || !Number.isFinite(value)) return;
        const clamped = Math.min(Number(input.max), Math.max(Number(input.min), value));
        update({...state.lambda, [part]: clamped});
      });
      return input;
    });
    point.append(element('var', null, 'λ'), ' = ', fields[0], ' + ', fields[1], ' i');
    controls.append(point);
    const angles = element('div', 'widget-angles');
    angles.append(element('span', null, 'Angle on the circle:'));
    for (const [p, q] of BUTTONS) {
      const button = element('button', 'widget-button widget-button-quiet', q === 1 ? '0 (cusp)' : `${p}/${q}`);
      button.type = 'button';
      button.addEventListener('click', () => update(onCircle(p, q)));
      angles.append(button);
    }
    controls.append(angles);

    // --- the two planes ------------------------------------------------------

    function planeBox(title, plane, view) {
      const box = element('div', 'widget-pane');
      const heading = element('p', 'widget-pane-title');
      heading.innerHTML = title;  // fixed markup with <var>
      const drawing = kit.svg('svg', {viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'widget-plane', 'aria-hidden': 'true'});
      const grid = kit.svg('g', {class: 'plane-grid'}, drawing);
      const origin = plane.toScreen({re: 0, im: 0});
      for (let re = Math.ceil(view.left * 2) / 2; re <= view.left + view.width; re += .5) {
        const {x} = plane.toScreen({re, im: 0});
        kit.svg('line', {x1: x, y1: 0, x2: x, y2: SIZE, class: re === 0 ? 'plane-axis' : ''}, grid);
      }
      for (let im = Math.ceil((view.top - view.height) * 2) / 2; im <= view.top; im += .5) {
        const {y} = plane.toScreen({re: 0, im});
        kit.svg('line', {x1: 0, y1: y, x2: SIZE, y2: y, class: im === 0 ? 'plane-axis' : ''}, grid);
      }
      box.append(heading, drawing);
      return {box, drawing, origin};
    }
    const left = planeBox('Multipliers <var>λ</var> · the unit disk', lambdaPlane, LAMBDA_VIEW);
    const right = planeBox('Parameters <var>c</var> · the main cardioid', cPlane, C_VIEW);
    const pair = element('div', 'widget-pair');
    pair.append(left.box, right.box);

    // Fixed parts of the left plane: the unit disk and the marked angles.
    const unit = lambdaPlane.toScreen({re: 1, im: 0}).x - left.origin.x;
    kit.svg('circle', {cx: left.origin.x, cy: left.origin.y, r: unit, class: 'multiplier-disk'}, left.drawing);

    // Fixed parts of the right plane: the Mandelbrot silhouette (an SVG mask
    // filled with a theme colour), the exact cardioid and the period-two disk.
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.getContext('2d').putImageData(kit.mandelbrotMask(C_VIEW, SIZE, SIZE, MASK_BUDGET), 0, 0);
    const defs = kit.svg('defs', {}, right.drawing);
    const mask = kit.svg('mask', {id: `${id}-silhouette`}, defs);
    kit.svg('image', {href: canvas.toDataURL('image/png'), width: SIZE, height: SIZE}, mask);
    kit.svg('rect', {width: SIZE, height: SIZE, class: 'multiplier-silhouette', mask: `url(#${id}-silhouette)`}, right.drawing);
    const curve = (lambdaAt, samples = 240) => Array.from({length: samples + 1}, (_, k) => {
      const {x, y} = cPlane.toScreen(parameter(lambdaAt(2 * Math.PI * k / samples)));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    kit.svg('polyline', {points: curve(t => ({re: Math.cos(t), im: Math.sin(t)})), class: 'multiplier-cardioid'}, right.drawing);
    const twoCentre = cPlane.toScreen({re: -1, im: 0});
    kit.svg('circle', {cx: twoCentre.x, cy: twoCentre.y, r: .25 * cPlane.scale, class: 'multiplier-two'}, right.drawing);

    for (const [p, q] of ANGLES) {
      const tick = lambdaPlane.toScreen(onCircle(p, q));
      const root = cPlane.toScreen(parameter(onCircle(p, q)));
      kit.svg('circle', {cx: tick.x, cy: tick.y, r: 3.5, class: 'multiplier-tick'}, left.drawing);
      kit.svg('circle', {cx: root.x, cy: root.y, r: 3.5, class: 'multiplier-tick'}, right.drawing);
    }
    const tickLabels = (layer, plane, center) => kit.placeLabels(layer, ANGLES.map(([p, q]) => ({
      ...plane.toScreen(plane === lambdaPlane ? onCircle(p, q) : parameter(onCircle(p, q))),
      text: angleName(p, q), className: 'multiplier-tick-label',
    })), center, 13);
    tickLabels(kit.svg('g', {}, left.drawing), lambdaPlane, left.origin);
    tickLabels(kit.svg('g', {}, right.drawing), cPlane, cPlane.toScreen({re: -.25, im: 0}));

    // A point's label normally sits away from `center`. Next to a marked tick
    // it turns sideways (preferring above, then right), so that it covers
    // neither the tick's label nor the point's own radius line. Returns the
    // centre to pass to placeLabels.
    function labelCenter(point, ticks, center) {
      const crowded = ticks.some(tick => Math.hypot(tick.x - point.x, tick.y - point.y) < 30);
      if (!crowded) return center;
      const length = Math.hypot(point.x - center.x, point.y - center.y) || 1;
      let dx = -(point.y - center.y) / length;
      let dy = (point.x - center.x) / length;
      if (dy > 0 || (dy === 0 && dx < 0)) {
        dx = -dx;
        dy = -dy;
      }
      return {x: point.x - dx * 40, y: point.y - dy * 40};
    }
    const lambdaTicks = ANGLES.map(([p, q]) => lambdaPlane.toScreen(onCircle(p, q)));
    const roots = ANGLES.map(([p, q]) => cPlane.toScreen(parameter(onCircle(p, q))));
    const cardioidCentre = cPlane.toScreen({re: -.25, im: 0});

    const leftLayer = kit.svg('g', {}, left.drawing);
    const rightLayer = kit.svg('g', {}, right.drawing);
    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    function draw() {
      const lambda = state.lambda;
      const c = parameter(lambda);
      const size = complex.abs(lambda);
      leftLayer.replaceChildren();
      rightLayer.replaceChildren();
      // The circle |λ| = r and its image, unless it is the unit circle itself.
      if (size > 1e-6 && Math.abs(size - 1) > 1e-9) {
        kit.svg('circle', {cx: left.origin.x, cy: left.origin.y, r: size * unit, class: 'plane-connector'}, leftLayer);
        kit.svg('polyline', {points: curve(t => ({re: size * Math.cos(t), im: size * Math.sin(t)})),
          class: 'plane-connector'}, rightLayer);
      }
      const at = lambdaPlane.toScreen(lambda);
      kit.svg('line', {x1: left.origin.x, y1: left.origin.y, x2: at.x, y2: at.y, class: 'plane-vector plane-z'}, leftLayer);
      kit.svg('circle', {cx: at.x, cy: at.y, r: 7, class: 'plane-handle-dot multiplier-lambda'}, leftLayer);
      kit.placeLabels(leftLayer, [{...at, text: 'λ', className: 'plane-label plane-z'}],
        labelCenter(at, lambdaTicks, left.origin));
      const cAt = cPlane.toScreen(c);
      kit.svg('circle', {cx: cAt.x, cy: cAt.y, r: 7, class: 'plane-handle-dot multiplier-c'}, rightLayer);
      kit.placeLabels(rightLayer, [{...cAt, text: 'c', className: 'plane-label plane-result'}],
        labelCenter(cAt, roots, cardioidCentre));
    }

    function update(lambda) {
      state.lambda = lambda;
      fields.forEach((input, index) => {
        if (input !== document.activeElement) input.value = String(Number((index ? lambda.im : lambda.re).toFixed(4)));
      });
      draw();
      readout.innerHTML = describe(lambda);  // built only from numbers formatted above
    }

    // Dragging λ snaps onto a marked angle when close, else onto a grid.
    kit.makeDraggable(left.drawing, left.drawing, (x, y) => {
      const near = ANGLES.find(([p, q]) => {
        const tick = lambdaPlane.toScreen(onCircle(p, q));
        return Math.hypot(tick.x - x, tick.y - y) < SNAP_DISTANCE;
      });
      update(near ? onCircle(...near) : lambdaPlane.snap(lambdaPlane.fromScreen(x, y), GRID));
    });
    // Dragging c chooses the smaller of its two multipliers; near a root it snaps.
    kit.makeDraggable(right.drawing, right.drawing, (x, y) => {
      const near = ANGLES.find(([p, q]) => {
        const root = cPlane.toScreen(parameter(onCircle(p, q)));
        return Math.hypot(root.x - x, root.y - y) < SNAP_DISTANCE;
      });
      update(near ? onCircle(...near) : multiplierOf(cPlane.snap(cPlane.fromScreen(x, y), GRID / 2)));
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, pair, readout]) figure.insertBefore(part, caption);
    update(state.lambda);
  });
})();
