/* Interactive figure: an attracting and a repelling fixed point of one map.

   For c inside the main cardioid, the fixed point α = (1 − √(1 − 4c))/2 of
   z² + c attracts and the other fixed point β = (1 + √(1 − 4c))/2 repels. The
   figure draws part of the filled Julia set of one such c, dimmed, with an
   orbit that approaches α, and two orbits that start very close to β and
   leave it: one escapes, the other is drawn into α. A menu chooses c, so that
   the multiplier λ = 2α of α is not real, positive or negative, and the orbit
   approaches α in a spiral, along a straight line or in a zigzag.

   Built by AtlasKit.setUp for every <figure data-widget="attract-repel">;
   data-example chooses the first parameter (a key of EXAMPLES). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber, complex} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const BUDGET = 300;
  const MAX_STEPS = 200;
  const NEAR = 0.001;  // an orbit this close to α is drawn no further
  const LABELLED = 3;  // z₀, z₁ and z₂ of the orbit into α are labelled

  // Key, menu name, c, the window, the start of the orbit into α, and the two
  // displacements from β, both 0.012 long (to three decimals): the first start
  // escapes, the second is drawn into α.
  const EXAMPLES = [
    {key: 'spiral', name: 'Spiral: λ not real', c: {re: 0.2815, im: 0.1141},
      view: {left: -0.45, top: 0.75, width: 2, height: 1.5},
      start: {re: 0.01, im: 0.27}, out: {re: -0.012, im: 0}, into: {re: 0.012, im: 0}},
    {key: 'straight', name: 'Straight line: λ positive', c: {re: 0.2275, im: 0},
      view: {left: -0.45, top: 0.75, width: 2, height: 1.5},
      start: {re: 0, im: 0}, out: {re: 0.012, im: 0}, into: {re: -0.012, im: 0}},
    {key: 'zigzag', name: 'Zigzag: λ negative', c: {re: -0.56, im: 0},
      view: {left: -1.05, top: 1, width: 2.7, height: 2.025},
      start: {re: -0.25, im: 0.26}, out: {re: 0.012, im: 0}, into: {re: -0.0114, im: 0.0038}},
  ];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The principal square root of x + iy, from real square roots.
  function sqrt(x, y) {
    const size = Math.sqrt(x * x + y * y);
    const re = Math.sqrt((size + x) / 2);
    const im = Math.sqrt(Math.max(0, (size - x) / 2));
    return {re, im: y < 0 ? -im : im};
  }

  // The two fixed points of z² + c: α with the minus sign, β with the plus sign.
  function fixedPoints(c) {
    const root = sqrt(1 - 4 * c.re, -4 * c.im);
    return {
      alpha: {re: (1 - root.re) / 2, im: -root.im / 2},
      beta: {re: (1 + root.re) / 2, im: root.im / 2},
    };
  }

  // The orbit of z under z² + c until it escapes, comes within NEAR of α, or MAX_STEPS.
  function orbit(c, z, alpha) {
    const points = [z];
    const radius = kit.escapeRadius(c);
    while (points.length <= MAX_STEPS) {
      z = {re: z.re * z.re - z.im * z.im + c.re, im: 2 * z.re * z.im + c.im};
      points.push(z);
      if (complex.abs(z) > radius) return {points, escapedAt: points.length - 1};
      if (Math.hypot(z.re - alpha.re, z.im - alpha.im) < NEAR) return {points, arrivedAt: points.length - 1};
    }
    return {points};
  }

  kit.setUp('attract-repel', (figure) => {
    figure.classList.add('widget-plate');
    const first = EXAMPLES.find(({key}) => key === figure.dataset.example) || EXAMPLES[0];
    const state = {example: first};
    let generation = 0;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const exampleLabel = element('label', null, 'How the orbit approaches α');
    const select = element('select');
    for (const {key, name} of EXAMPLES) {
      const option = element('option', null, name);
      option.value = key;
      select.append(option);
    }
    select.value = first.key;
    select.addEventListener('change', () => {
      state.example = EXAMPLES.find(({key}) => key === select.value);
      show();
    });
    exampleLabel.append(select);
    controls.append(exampleLabel);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view stability-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay stability-overlay'});
    overlay.setAttribute('role', 'img');
    view.append(canvas, overlay);
    const status = element('p', 'plate-verdict stability-status');
    status.setAttribute('aria-live', 'polite');

    function orbits() {
      const {c, start, out, into} = state.example;
      const {alpha, beta} = fixedPoints(c);
      const shifted = d => ({re: beta.re + d.re, im: beta.im + d.im});
      return {alpha, beta, attracted: orbit(c, start, alpha), escaping: orbit(c, shifted(out), alpha),
        drawnIn: orbit(c, shifted(into), alpha)};
    }

    function mark(found) {
      overlay.replaceChildren();
      const plane = new kit.Plane(state.example.view, WIDTH, HEIGHT);
      const unit = Math.max(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      const path = (result, kind) => {
        const group = kit.svg('g', {class: `stability-orbit stability-${kind}`}, overlay);
        const points = result.points.map(z => plane.toScreen(z));
        kit.svg('polyline', {class: 'stability-path', points: points.map(({x, y}) => `${x},${y}`).join(' ')}, group);
        // Only the orbit into α gets a start mark and labels: the others start too close to β to show one.
        const marked = kind === 'attracted';
        points.forEach(({x, y}, index) => kit.svg('circle', {class: index || !marked ? 'stability-point'
          : 'stability-start', cx: x, cy: y, r: (index || !marked ? 2.6 : 5) * unit}, group));
        if (marked) {
          // A label whose point is close to an already labelled one is left out.
          const labels = [];
          for (const [index, point] of points.slice(0, LABELLED).entries()) {
            if (labels.some(other => Math.hypot(other.x - point.x, other.y - point.y) < 18 * unit)) break;
            labels.push({...point, text: `z${kit.subscript(index)}`, className: 'stability-z'});
          }
          group.setAttribute('font-size', 16 * unit);
          kit.placeLabels(group, labels, plane.toScreen(found.alpha), 16 * unit);
        }
      };
      path(found.escaping, 'repelled');
      path(found.drawnIn, 'repelled');
      path(found.attracted, 'attracted');
      for (const [name, z, kind] of [['α', found.alpha, 'alpha'], ['β', found.beta, 'beta']]) {
        const {x, y} = plane.toScreen(z);
        const group = kit.svg('g', {class: `stability-fixed stability-${kind}`, 'data-name': name}, overlay);
        kit.svg('circle', {class: 'stability-halo', cx: x, cy: y, r: 10.5 * unit}, group);
        kit.svg('circle', {class: 'stability-ring', cx: x, cy: y, r: 10.5 * unit}, group);
        kit.svg('text', {class: 'stability-label', x: x + 14 * unit, y: y - 12 * unit, 'font-size': 18.75 * unit,
          'stroke-width': 5 * unit}, group).textContent = name;
      }
      overlay.setAttribute('aria-label', `Part of the filled Julia set for c = ${format(state.example.c, 4)}, with the `
        + 'fixed points α and β and three orbits; the text below describes them.');
    }

    // What α's multiplier does to nearby points, in the words of the next section.
    function approach(lambda) {
      const size = formatNumber(complex.abs(lambda), 3);
      const closer = `each step brings nearby points about ${size} times as close`;
      if (Math.abs(lambda.im) > 1e-9) {
        const turn = complex.arg(lambda) / (2 * Math.PI);
        return `λ = 2α ≈ ${format(lambda, 3)} has modulus ${size} and turns by ${formatNumber(turn, 3)} of a full `
          + `turn: ${closer} and turns them around α.`;
      }
      if (lambda.re > 0) return `λ = 2α = ${formatNumber(lambda.re, 3)} is positive, so it does not turn: ${closer}.`;
      return `λ = 2α = ${formatNumber(lambda.re, 3)} is negative, a half-turn: ${closer} and moves them to the `
        + 'other side of α.';
    }

    function describe(found) {
      const {alpha, beta, attracted, escaping, drawnIn} = found;
      const {c, start, out} = state.example;
      const lambda = {re: 2 * alpha.re, im: 2 * alpha.im};
      const away = 2 * complex.abs(beta);  // the modulus of β's multiplier
      const sign = alpha.im === 0 ? '=' : '≈';
      status.textContent = `c = ${format(c, 4)}. α ${sign} ${format(alpha, 4)} attracts: ${approach(lambda)} `
        + `β ${sign} ${format(beta, 4)} repels: its multiplier 2β has modulus ${formatNumber(away, 3)}, so each step `
        + `takes nearby points about ${formatNumber(away, 1)} times as far away. The orange orbit from z₀ = `
        + `${format(start, 2)} comes within ${NEAR} of α after ${attracted.arrivedAt} steps. The blue orbits start `
        + `${formatNumber(complex.abs(out), 3)} from β: one escapes after ${escaping.escapedAt} steps, the other comes `
        + `within ${NEAR} of α after ${drawnIn.arrivedAt}.`;
    }

    async function show() {
      const request = ++generation;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const found = orbits();
      mark(found);
      status.textContent = `c = ${format(state.example.c, 4)}. Computing…`;
      const image = await kit.renderEscapeTime(context, state.example.view, state.example.c, BUDGET,
        () => request === generation);
      if (!image) return;
      describe(found);
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, status]) figure.insertBefore(part, caption);
    show();
    kit.whenResized(() => {
      if (!kit.fitsScreen(canvas, WIDTH, HEIGHT)) show();
      else mark(orbits());
    });
  });
})();
