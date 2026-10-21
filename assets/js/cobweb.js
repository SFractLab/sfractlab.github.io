/* Interactive figure: period doubling for real parameters c.

   Left: the bifurcation diagram of x ↦ x² + c for c from −2 to 1/4. For
   each c, the orbit of 0 is followed for a while and the values it then
   keeps visiting are plotted above that c, so attracting cycles show as
   branches that split at the period doublings. Right: the cobweb of the
   orbit of 0 for the chosen c: from a point on the diagonal, go vertically
   to the parabola y = x² + c, then horizontally back to the diagonal.

   Built by AtlasKit.setUp for every <figure data-widget="cobweb">. Data
   attributes: data-c, the starting parameter (default −1.1); data-mandelbrot,
   which replaces the cobweb by the Mandelbrot set: the diagram then spans
   the figure, above the set on the same scale of c, and its marks run
   through both. Dragging across the drawing, typing c or a preset moves c;
   the readout gives the same verdict as the orbit figures. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  const C_MIN = -2;
  const C_MAX = .25;
  const X_MAX = 2;            // both panes show x (and y) from −2 to 2
  const SIZE = 360;
  const MASK_SCALE = 2;       // the masks are computed at twice the drawing's resolution
  const TRANSIENT = 600;      // steps skipped before plotting, so the orbit has settled
  const PLOTTED = 160;        // steps plotted per parameter
  const COBWEB_STEPS = 60;
  const GRID = .001;
  const LANDMARKS = [[-.75, '−3/4'], [-1.25, '−5/4'], [-1.401155189, '≈ −1.4012']];
  const PRESETS = [
    ['Fixed point', -.5], ['Period 2', -1], ['Period 4', -1.3], ['Period 8', -1.385],
    ['Feigenbaum point', -1.401155189], ['Chaos', -1.6], ['Period-3 window', -1.754877666247], ['Tip', -2],
  ];
  // With data-mandelbrot: one drawing WIDE units across, the diagram above the set.
  const WIDE = 720;
  const WIDE_DIAGRAM = 240;                                 // the diagram's height
  const SET_IM = .45;                                       // the set is shown for Im c from −0.45 to 0.45
  const SET_HEIGHT = Math.round(2 * SET_IM * WIDE / (C_MAX - C_MIN));  // on the scale of c across
  const SET_BUDGET = 300;

  // Positions in the 360 × 360 cobweb.
  const toY = value => (X_MAX - value) / (2 * X_MAX) * SIZE;  // vertical position of an x value
  const toX = value => (value + X_MAX) / (2 * X_MAX) * SIZE;  // horizontal position

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The bifurcation diagram, width × height drawing units, as an opaque-on-transparent mask.
  function bifurcationMask(width, height) {
    const columns = width * MASK_SCALE;
    const rows = height * MASK_SCALE;
    const image = new ImageData(columns, rows);
    for (let column = 0; column < columns; column++) {
      const c = C_MIN + (column + .5) / columns * (C_MAX - C_MIN);
      let x = 0;
      for (let n = 0; n < TRANSIENT; n++) x = x * x + c;
      for (let n = 0; n < PLOTTED; n++) {
        x = x * x + c;
        // Two mask rows (one drawing unit) per value, so that branches read as lines.
        const row = Math.floor((X_MAX - x) / (2 * X_MAX) * rows);
        for (const r of [row, row + 1]) {
          if (r >= 0 && r < rows) image.data.fill(255, (r * columns + column) * 4, (r * columns + column) * 4 + 4);
        }
      }
    }
    return image;
  }

  // An image filled with a theme colour: the mask, as an SVG mask over a rectangle of that class.
  function maskedRect(drawing, id, image, box, className) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').putImageData(image, 0, 0);
    const mask = kit.svg('mask', {id}, kit.svg('defs', {}, drawing));
    kit.svg('image', {href: canvas.toDataURL('image/png'), ...box}, mask);
    kit.svg('rect', {...box, class: className, mask: `url(#${id})`}, drawing);
  }

  kit.setUp('cobweb', (figure, id) => {
    const start = Number(figure.dataset.c);
    const state = {c: Number.isFinite(start) ? Math.min(C_MAX, Math.max(C_MIN, start)) : -1.1};
    const wide = figure.hasAttribute('data-mandelbrot');
    const width = wide ? WIDE : SIZE;
    const height = wide ? WIDE_DIAGRAM : SIZE;  // of the diagram
    const total = wide ? WIDE_DIAGRAM + SET_HEIGHT : SIZE;
    const axisY = height + SET_HEIGHT / 2;     // the real axis in the picture of the set
    const diagramX = c => (c - C_MIN) / (C_MAX - C_MIN) * width;
    const cOfDiagramX = x => C_MIN + x / width * (C_MAX - C_MIN);
    const diagramY = value => (X_MAX - value) / (2 * X_MAX) * height;

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

    function pane(title, paneHeight) {
      const box = element('div', 'widget-pane');
      const heading = element('p', 'widget-pane-title');
      heading.innerHTML = title;  // fixed markup with <var>
      const drawing = kit.svg('svg', {viewBox: `0 0 ${width} ${paneHeight}`, class: 'widget-plane', 'aria-hidden': 'true'});
      box.append(heading, drawing);
      return {box, drawing};
    }
    const diagram = pane(wide ? 'Bifurcation diagram · <var>x</var> against <var>c</var>, above the Mandelbrot set'
      : 'Bifurcation diagram · <var>x</var> against <var>c</var>', total);
    let cobweb = null;
    let panes = diagram.box;
    if (wide) {
      diagram.drawing.classList.add('cobweb-wide');
    } else {
      cobweb = pane('Cobweb · the orbit of 0', SIZE);
      panes = element('div', 'widget-pair');
      panes.append(diagram.box, cobweb.box);
    }

    // Diagram: grid, landmarks and the mask, filled with a theme colour.
    const grid = kit.svg('g', {class: 'plane-grid'}, diagram.drawing);
    for (const c of [-2, -1.5, -1, -.5, 0]) {
      const x = diagramX(c);
      kit.svg('line', {x1: x, y1: 0, x2: x, y2: height, class: c === 0 ? 'plane-axis' : ''}, grid);
      kit.svg('text', {x: x + 4, y: height - 6, class: 'plane-tick'}, grid).textContent = formatNumber(c);
    }
    kit.svg('line', {x1: 0, y1: diagramY(0), x2: width, y2: diagramY(0), class: 'plane-axis'}, grid);
    maskedRect(diagram.drawing, `${id}-diagram`, bifurcationMask(width, height), {width, height}, 'cobweb-diagram');

    // Below the wide diagram, the Mandelbrot set for the same c, cut at Im c = ±SET_IM.
    if (wide) {
      kit.svg('line', {x1: 0, y1: height, x2: width, y2: height}, grid);
      const view = {left: C_MIN, top: SET_IM, width: C_MAX - C_MIN, height: 2 * SET_IM};
      maskedRect(diagram.drawing, `${id}-set`,
        kit.mandelbrotMask(view, width * MASK_SCALE, SET_HEIGHT * MASK_SCALE, SET_BUDGET),
        {y: height, width, height: SET_HEIGHT}, 'cobweb-set');
      const setGrid = kit.svg('g', {class: 'plane-grid'}, diagram.drawing);
      kit.svg('line', {x1: 0, y1: axisY, x2: width, y2: axisY, class: 'plane-axis'}, setGrid);
      kit.svg('text', {x: 8, y: height, dy: '1.5em', class: 'plane-tick'}, setGrid).textContent = 'Mandelbrot set';
    }

    // Landmark labels are staggered; the leftmost one sits left of its line. In the wide
    // drawing the labels are sized in pixels, so they are placed in em, and the leftmost
    // one comes first, above the chaotic band, which grows towards c = −2.
    LANDMARKS.forEach(([c, name], index) => {
      const x = diagramX(c);
      const last = index === LANDMARKS.length - 1;
      const top = wide ? {y: 0, dy: `${1.2 + 1.4 * (LANDMARKS.length - 1 - index)}em`} : {y: 14 + index * 16};
      kit.svg('line', {x1: x, y1: wide ? 0 : 18 + index * 16, x2: x, y2: total, class: 'cobweb-landmark'}, diagram.drawing);
      kit.svg('text', {x: last ? x - 4 : x + 4, ...top, 'text-anchor': last ? 'end' : 'start',
        class: 'cobweb-landmark-label'}, diagram.drawing).textContent = name;
    });

    // Cobweb: grid, the diagonal y = x.
    if (cobweb) {
      const webGrid = kit.svg('g', {class: 'plane-grid'}, cobweb.drawing);
      for (const value of [-2, -1, 0, 1, 2]) {
        kit.svg('line', {x1: toX(value), y1: 0, x2: toX(value), y2: SIZE, class: value === 0 ? 'plane-axis' : ''}, webGrid);
        kit.svg('line', {x1: 0, y1: toY(value), x2: SIZE, y2: toY(value), class: value === 0 ? 'plane-axis' : ''}, webGrid);
      }
      kit.svg('line', {x1: toX(-X_MAX), y1: toY(-X_MAX), x2: toX(X_MAX), y2: toY(X_MAX), class: 'cobweb-diagonal'}, cobweb.drawing);
    }

    const diagramLayer = kit.svg('g', {}, diagram.drawing);
    const webLayer = cobweb && kit.svg('g', {}, cobweb.drawing);
    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    // The wide drawing shrinks with the figure on a phone. `unit`, its drawing units per
    // pixel (at least 1), keeps the text (through --unit in site.css) and the dots at their size.
    let unit = 1;
    if (wide) {
      new ResizeObserver(() => {
        const shown = diagram.drawing.getBoundingClientRect().width;
        if (!shown) return;
        unit = Math.max(1, width / shown);
        diagram.drawing.style.setProperty('--unit', unit);
        if (state.result) draw(state.result);
      }).observe(diagram.drawing);
    }

    function draw(result) {
      const c = state.c;
      diagramLayer.replaceChildren();
      const markerX = diagramX(c);
      // In the wide drawing the line stops at the ring around c, so the set there stays visible.
      const ring = 7 * unit;
      const segments = wide ? [[0, axisY - ring], [axisY + ring, total]] : [[0, total]];
      for (const [y1, y2] of segments) {
        kit.svg('line', {x1: markerX, y1, x2: markerX, y2, class: 'cobweb-marker'}, diagramLayer);
      }
      const points = result.points.map(point => point.re);
      if (result.period !== undefined) {
        for (const value of points.slice(points.length - result.period)) {
          kit.svg('circle', {cx: markerX, cy: diagramY(value), r: 4 * unit, class: 'cobweb-cycle'}, diagramLayer);
        }
      }
      if (wide) kit.svg('circle', {cx: markerX, cy: axisY, r: ring, class: 'cobweb-parameter'}, diagramLayer);
      if (!cobweb) return;
      webLayer.replaceChildren();
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
      state.result = kit.orbitOf({re: c, im: 0}, {re: 0, im: 0});
      draw(state.result);
      readout.innerHTML = `<var>c</var> = ${formatNumber(c, 6)}. ${kit.describeOrbit(state.result)}`;
    }

    kit.makeDraggable(diagram.drawing, diagram.drawing, x => {
      const c = Math.min(C_MAX, Math.max(C_MIN, cOfDiagramX(x)));
      update(Number((Math.round(c / GRID) * GRID).toFixed(6)));
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, panes, readout]) figure.insertBefore(part, caption);
    update(state.c);
  });
})();
