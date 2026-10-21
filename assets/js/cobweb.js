/* Interactive figure: period doubling for real parameters c.

   Left: the bifurcation diagram of x ↦ x² + c for c from −2 to 1/4. For
   each c, the orbit of 0 is followed for a while and the values it then
   keeps visiting are plotted above that c, so attracting cycles show as
   branches that split at the period doublings. Right: the cobweb of the
   orbit of 0 for the chosen c: from a point on the diagonal, go vertically
   to the parabola y = x² + c, then horizontally back to the diagonal.

   Built by AtlasKit.setUp for every <figure data-widget="cobweb">. Data
   attribute: data-c, the starting parameter (default −1.1). Dragging across
   the diagram, typing c or a preset moves c; the readout gives the same
   verdict as the orbit figures. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  const C_MIN = -2;
  const C_MAX = .25;
  const X_MAX = 2;            // both panes show x (and y) from −2 to 2
  const SIZE = 360;
  const MASK_SCALE = 2;       // the diagram is computed at twice the drawing's resolution
  const TRANSIENT = 600;      // steps skipped before plotting, so the orbit has settled
  const PLOTTED = 160;        // steps plotted per parameter
  const COBWEB_STEPS = 60;
  const GRID = .001;
  const LANDMARKS = [[-.75, '−3/4'], [-1.25, '−5/4'], [-1.401155189, '≈ −1.4012']];
  const PRESETS = [
    ['Fixed point', -.5], ['Period 2', -1], ['Period 4', -1.3], ['Period 8', -1.385],
    ['Feigenbaum point', -1.401155189], ['Chaos', -1.6], ['Period-3 window', -1.754877666247], ['Tip', -2],
  ];

  // Positions in the 360 × 360 drawings.
  const diagramX = c => (c - C_MIN) / (C_MAX - C_MIN) * SIZE;
  const cOfDiagramX = x => C_MIN + x / SIZE * (C_MAX - C_MIN);
  const toY = value => (X_MAX - value) / (2 * X_MAX) * SIZE;  // vertical position of an x value
  const toX = value => (value + X_MAX) / (2 * X_MAX) * SIZE;  // horizontal position in the cobweb

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The bifurcation diagram as an opaque-on-transparent mask.
  function bifurcationMask() {
    const size = SIZE * MASK_SCALE;
    const image = new ImageData(size, size);
    for (let column = 0; column < size; column++) {
      const c = C_MIN + (column + .5) / size * (C_MAX - C_MIN);
      let x = 0;
      for (let n = 0; n < TRANSIENT; n++) x = x * x + c;
      for (let n = 0; n < PLOTTED; n++) {
        x = x * x + c;
        // Two mask rows (one drawing unit) per value, so that branches read as lines.
        const row = Math.floor(toY(x) * MASK_SCALE);
        for (const r of [row, row + 1]) {
          if (r >= 0 && r < size) image.data.fill(255, (r * size + column) * 4, (r * size + column) * 4 + 4);
        }
      }
    }
    return image;
  }

  kit.setUp('cobweb', (figure, id) => {
    const start = Number(figure.dataset.c);
    const state = {c: Number.isFinite(start) ? Math.min(C_MAX, Math.max(C_MIN, start)) : -1.1};

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'widget-controls');
    const point = element('label', 'widget-point');
    const field = element('input');
    field.type = 'number';
    field.step = String(GRID);
    field.min = String(C_MIN);
    field.max = String(C_MAX);
    field.inputMode = 'decimal';
    field.setAttribute('aria-label', 'The real parameter c');
    field.addEventListener('input', () => {
      const value = Number(field.value);
      if (field.value.trim() !== '' && Number.isFinite(value)) update(Math.min(C_MAX, Math.max(C_MIN, value)));
    });
    point.append(element('var', null, 'c'), ' = ', field);
    const presets = element('div', 'widget-angles');
    for (const [name, c] of PRESETS) {
      const button = element('button', 'widget-button widget-button-quiet', name);
      button.type = 'button';
      button.addEventListener('click', () => update(c));
      presets.append(button);
    }
    controls.append(point, presets);

    // --- panes ---------------------------------------------------------------

    function pane(title) {
      const box = element('div', 'widget-pane');
      const heading = element('p', 'widget-pane-title');
      heading.innerHTML = title;  // fixed markup with <var>
      const drawing = kit.svg('svg', {viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'widget-plane', 'aria-hidden': 'true'});
      box.append(heading, drawing);
      return {box, drawing};
    }
    const diagram = pane('Bifurcation diagram · <var>x</var> against <var>c</var>');
    const cobweb = pane('Cobweb · the orbit of 0');
    const pair = element('div', 'widget-pair');
    pair.append(diagram.box, cobweb.box);

    // Diagram: grid, landmarks and the mask, filled with a theme colour.
    const grid = kit.svg('g', {class: 'plane-grid'}, diagram.drawing);
    for (const c of [-2, -1.5, -1, -.5, 0]) {
      const x = diagramX(c);
      kit.svg('line', {x1: x, y1: 0, x2: x, y2: SIZE, class: c === 0 ? 'plane-axis' : ''}, grid);
      kit.svg('text', {x: x + 4, y: SIZE - 6, class: 'plane-tick'}, grid).textContent = formatNumber(c);
    }
    kit.svg('line', {x1: 0, y1: toY(0), x2: SIZE, y2: toY(0), class: 'plane-axis'}, grid);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE * MASK_SCALE;
    canvas.height = SIZE * MASK_SCALE;
    canvas.getContext('2d').putImageData(bifurcationMask(), 0, 0);
    const mask = kit.svg('mask', {id: `${id}-diagram`}, kit.svg('defs', {}, diagram.drawing));
    kit.svg('image', {href: canvas.toDataURL('image/png'), width: SIZE, height: SIZE}, mask);
    kit.svg('rect', {width: SIZE, height: SIZE, class: 'cobweb-diagram', mask: `url(#${id}-diagram)`}, diagram.drawing);
    // Landmark labels are staggered; the leftmost one sits left of its line.
    LANDMARKS.forEach(([c, name], index) => {
      const x = diagramX(c);
      const last = index === LANDMARKS.length - 1;
      kit.svg('line', {x1: x, y1: 18 + index * 16, x2: x, y2: SIZE, class: 'cobweb-landmark'}, diagram.drawing);
      kit.svg('text', {x: last ? x - 4 : x + 4, y: 14 + index * 16, 'text-anchor': last ? 'end' : 'start',
        class: 'cobweb-landmark-label'}, diagram.drawing).textContent = name;
    });

    // Cobweb: grid, the diagonal y = x.
    const webGrid = kit.svg('g', {class: 'plane-grid'}, cobweb.drawing);
    for (const value of [-2, -1, 0, 1, 2]) {
      kit.svg('line', {x1: toX(value), y1: 0, x2: toX(value), y2: SIZE, class: value === 0 ? 'plane-axis' : ''}, webGrid);
      kit.svg('line', {x1: 0, y1: toY(value), x2: SIZE, y2: toY(value), class: value === 0 ? 'plane-axis' : ''}, webGrid);
    }
    kit.svg('line', {x1: toX(-X_MAX), y1: toY(-X_MAX), x2: toX(X_MAX), y2: toY(X_MAX), class: 'cobweb-diagonal'}, cobweb.drawing);

    const diagramLayer = kit.svg('g', {}, diagram.drawing);
    const webLayer = kit.svg('g', {}, cobweb.drawing);
    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    function draw(result) {
      const c = state.c;
      diagramLayer.replaceChildren();
      webLayer.replaceChildren();
      const markerX = diagramX(c);
      kit.svg('line', {x1: markerX, y1: 0, x2: markerX, y2: SIZE, class: 'cobweb-marker'}, diagramLayer);
      const points = result.points.map(point => point.re);
      if (result.period !== undefined) {
        for (const value of points.slice(points.length - result.period)) {
          kit.svg('circle', {cx: markerX, cy: toY(value), r: 4, class: 'cobweb-cycle'}, diagramLayer);
        }
      }
      const parabola = Array.from({length: 201}, (_, k) => {
        const x = -X_MAX + 2 * X_MAX * k / 200;
        return `${toX(x).toFixed(2)},${toY(x * x + c).toFixed(2)}`;
      }).join(' ');
      kit.svg('polyline', {points: parabola, class: 'cobweb-parabola'}, webLayer);
      const path = [`${toX(points[0])},${toY(points[0])}`];
      for (let n = 0; n < Math.min(COBWEB_STEPS, points.length - 1); n++) {
        path.push(`${toX(points[n])},${toY(points[n + 1])}`, `${toX(points[n + 1])},${toY(points[n + 1])}`);
      }
      kit.svg('polyline', {points: path.join(' '), class: 'cobweb-path'}, webLayer);
      kit.svg('circle', {cx: toX(0), cy: toY(0), r: 4.5, class: 'cobweb-start'}, webLayer);
      if (result.period !== undefined) {
        for (const value of points.slice(points.length - result.period)) {
          kit.svg('circle', {cx: toX(value), cy: toY(value), r: 4, class: 'cobweb-cycle'}, webLayer);
        }
      }
    }

    function update(c) {
      state.c = c;
      if (field !== document.activeElement) field.value = String(Number(c.toFixed(6)));
      const result = kit.orbitOf({re: c, im: 0}, {re: 0, im: 0});
      draw(result);
      readout.innerHTML = `<var>c</var> = ${formatNumber(c, 6)}. ${kit.describeOrbit(result)}`;
    }

    kit.makeDraggable(diagram.drawing, diagram.drawing, x => {
      const c = Math.min(C_MAX, Math.max(C_MIN, cOfDiagramX(x)));
      update(Number((Math.round(c / GRID) * GRID).toFixed(6)));
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, pair, readout]) figure.insertBefore(part, caption);
    update(state.c);
  });
})();
