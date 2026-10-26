/* Interactive figure: the orbit of a point under z ↦ z² + c, with the
   parameter c chosen on a map of the Mandelbrot set.

   Built by AtlasKit.setUp for every <figure data-widget="orbits">. The two
   planes stay separate, as the chapters insist: the left panel is the
   parameter plane (choose c), the right panel the dynamical plane of that c
   (its filled Julia set, dimmed, with the orbit drawn on top). The parameter
   plane can be zoomed, by 2 at a time around the chosen c, down to
   magnification MAX_MAGNIFICATION, to choose c more finely; the dynamical
   plane always shows the whole filled Julia set, since the orbit roams over it.
   Data attributes on the figure:
     data-example  the example selected at first (a key of EXAMPLES)
     data-z0       the starting point as "re,im" (default "0,0", the critical point)
   The verdict below the panels follows the chapters: crossing the escape
   radius max(2, |c|) proves escape; a cycle found by computation is
   numerical evidence; anything else stays undecided. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {complex, format, formatNumber, subscript} = kit;

  const MAP_VIEW = {left: -2.2, width: 3.2, top: 1.2, height: 2.4};  // the whole set
  const MAX_MAGNIFICATION = 2 ** 13;  // about 10⁴: enough to choose a point, and quick to draw
  const ORBIT_VIEW = {left: -2.1, width: 4.2, top: 1.575, height: 3.15};
  const WIDTH = 480;
  const HEIGHT = 360;
  const MAP_BUDGET = 350;
  const JULIA_BUDGET = 200;
  const SHOWN_AT_FIRST = 6;
  const MAX_SHOWN = 100;      // steps that can be drawn
  const PLAY_INTERVAL = 400;  // milliseconds per step while playing
  const LABELLED = 4;         // z₀ … z₃ are labelled, and the current point

  const EXAMPLES = [
    ['fixed', 'Fixed point · c = 0', 0, 0],
    ['basilica', 'Two-cycle · c = −1', -1, 0],
    ['near-basilica', 'Attracting two-cycle · c = −0.9', -.9, 0],
    ['rabbit', 'Period 3 (rabbit) · c ≈ −0.12 + 0.74i', -.122561166876, .744861766620],
    ['quarter', 'Period 4 · c ≈ 0.28 + 0.53i', .282271390767, .530060617579],
    ['fifth', 'Period 5 · c ≈ −0.50 + 0.56i', -.504340175446, .562765761453],
    ['doubled', 'Period 4, real · c ≈ −1.31', -1.310702641337, 0],
    ['airplane', 'Period 3, real · c ≈ −1.75', -1.754877666247, 0],
    ['dendrite', 'Lands on a cycle · c = i', 0, 1],
    ['tip', 'Lands on a fixed point · c = −2', -2, 0],
    ['parabolic', 'Parabolic, very slow · c = 1/4', .25, 0],
    ['siegel', 'Siegel disk (golden mean) · c ≈ −0.39 − 0.59i', -.3905408702184, -.5867879073469687],
    ['escape', 'Escapes · c = 1', 1, 0],
  ];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function parsePoint(text, fallback) {
    const [re, im] = (text || '').split(',').map(Number);
    return Number.isFinite(re) && Number.isFinite(im) ? {re, im} : fallback;
  }

  const round = (value, digits = 4) => Number(value.toFixed(digits));

  // The window of the parameter plane `width` wide around `centre`, in the shape of the canvases.
  const mapView = (centre, width) => ({left: centre.re - width / 2, top: centre.im + width * 3 / 8, width,
    height: width * 3 / 4});
  // Decimals that tell neighbouring pixels of a window `width` wide apart: 4 for the whole set.
  const decimalsFor = width => Math.max(4, Math.ceil(-Math.log10(width / WIDTH)) + 1);

  kit.setUp('orbits', (figure, id) => {
    figure.classList.add('widget-plate');
    const startPoint = parsePoint(figure.dataset.z0, {re: 0, im: 0});
    const firstExample = EXAMPLES.find(example => example[0] === figure.dataset.example) || EXAMPLES[1];
    const state = {
      c: {re: firstExample[2], im: firstExample[3]},
      z0: startPoint,
      result: null,
      shown: SHOWN_AT_FIRST,
      timer: null,
      map: MAP_VIEW,  // the window of the parameter plane shown
    };
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- controls ------------------------------------------------------------

    // Two rows: the example and the buttons, then the coordinates.
    const controls = element('div', 'plate-controls');
    const fieldRow = element('div', 'plate-controls plate-fields');
    const exampleLabel = element('label', null, 'Example');
    const select = element('select');
    for (const [key, name] of EXAMPLES) {
      const option = element('option', null, name);
      option.value = key;
      select.append(option);
    }
    const custom = element('option', null, 'Custom');
    custom.value = 'custom';
    select.append(custom);
    select.value = firstExample[0];
    exampleLabel.append(select);
    controls.append(exampleLabel);

    function numberField(shortName, fullName, onChange) {
      const label = element('label');
      label.innerHTML = `<span>${shortName}</span>`;  // fixed markup such as Re(<var>c</var>)
      const input = element('input');
      input.setAttribute('aria-label', fullName);
      input.type = 'number';
      input.step = '0.01';
      input.inputMode = 'decimal';
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (input.value.trim() !== '' && Number.isFinite(value) && Math.abs(value) <= 3) onChange(value);
      });
      label.append(input);
      fieldRow.append(label);
      return input;
    }
    const fields = {
      cRe: numberField('Re(<var>c</var>)', 'Real part of c', value => setC({...state.c, re: value})),
      cIm: numberField('Im(<var>c</var>)', 'Imaginary part of c', value => setC({...state.c, im: value})),
      zRe: numberField('Re(<var>z</var><sub>0</sub>)', 'Real part of the starting point z₀',
        value => setStart({...state.z0, re: value})),
      zIm: numberField('Im(<var>z</var><sub>0</sub>)', 'Imaginary part of the starting point z₀',
        value => setStart({...state.z0, im: value})),
    };

    const buttons = element('div', 'plate-buttons');
    function button(text, onClick, quiet = false) {
      const node = element('button', quiet ? 'plate-button-quiet' : null, text);
      node.type = 'button';
      node.addEventListener('click', onClick);
      buttons.append(node);
      return node;
    }
    const stepButton = button('Step', () => {
      stop();
      show(state.shown + 1);
    });
    const playButton = button('Play', () => (state.timer ? stop() : play()));
    button('Start again', () => {
      stop();
      show(0);
    }, true);
    const criticalButton = button('Start from 0', () => setStart({re: 0, im: 0}), true);
    controls.append(buttons);

    // --- panels --------------------------------------------------------------

    function panel(title, caption, label, tools = null) {
      const box = element('div', 'plate-panel');
      const heading = element('h3');
      heading.innerHTML = title;  // fixed markup with <var>
      box.append(heading);
      const view = element('div', 'plate-view');
      const canvas = element('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', label);
      const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay', 'aria-hidden': 'true'});
      view.append(canvas, overlay);
      const captionLine = element('p', 'plate-caption', caption);
      box.append(view, captionLine);
      if (tools) box.append(tools);
      return {box, context: canvas.getContext('2d'), overlay, caption: captionLine};
    }
    // The parameter plane's zoom buttons, below its picture and caption, so that both pictures
    // stay level.
    const zoomButtons = element('div', 'plate-buttons orbit-zoom');
    function zoomButton(text, onClick) {
      const node = element('button', 'plate-button-quiet', text);
      node.type = 'button';
      node.addEventListener('click', onClick);
      zoomButtons.append(node);
      return node;
    }
    const zoomInButton = zoomButton('Zoom in', () => zoomTo(state.map.width / 2));
    const zoomOutButton = zoomButton('Zoom out', () => zoomTo(state.map.width * 2));
    const wholeButton = zoomButton('Whole set', () => showMap(MAP_VIEW));
    const map = panel('Parameter plane · choose <var>c</var>', '',
      'The Mandelbrot set; the ring marks the chosen parameter c.', zoomButtons);
    const dynamics = panel('Dynamical plane · orbit of <var>z</var><sub>0</sub>', 'Re(z): −2.1 to 2.1 · Im(z): −1.575 to 1.575',
      'The filled Julia set of the chosen c, dimmed, with the orbit drawn on top.');
    if (!map.context || !dynamics.context) return;
    dynamics.box.classList.add('plate-panel-dynamics');
    const panels = element('div', 'plate-grid');
    panels.append(map.box, dynamics.box);

    let mapPlane = new kit.Plane(MAP_VIEW, WIDTH, HEIGHT);
    const orbitPlane = new kit.Plane(ORBIT_VIEW, WIDTH, HEIGHT);
    const stepLine = element('p', 'plate-step');
    const verdictLine = element('p', 'plate-verdict');
    verdictLine.setAttribute('aria-live', 'polite');

    // --- drawing -----------------------------------------------------------

    // Both pictures at the size the screen calls for (AtlasKit.fitCanvas); the overlays keep the
    // units of 480 × 360. Their marks grow with a picture up to its design size, and stay at that
    // size on screen beyond it, as in the enlarged figure: `mark` is the factor, set on each overlay
    // as --mark for the widths in site.css.
    const mark = overlay => {
      const factor = Math.min(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      overlay.style.setProperty('--mark', factor);
      return factor;
    };
    let generation = 0;
    let mapGeneration = 0;
    function renderJulia() {
      const request = ++generation;
      kit.fitCanvas(dynamics.context.canvas, WIDTH, HEIGHT);
      kit.renderEscapeTime(dynamics.context, ORBIT_VIEW, state.c, JULIA_BUDGET, () => request === generation);
    }
    // The budget grows with the magnification, as in the zoom viewer.
    const mapBudget = () => Math.max(MAP_BUDGET, kit.iterationBudget(state.map.width));
    function renderMap() {
      const request = ++mapGeneration;
      kit.fitCanvas(map.context.canvas, WIDTH, HEIGHT);
      kit.renderEscapeTime(map.context, state.map, null, mapBudget(), () => request === mapGeneration,
        {repeats: true});
    }

    // Shows a window of the parameter plane, with its range, its magnification and its budget
    // in the caption; a zoom button that has nothing to do is greyed out.
    function showMap(view) {
      state.map = view;
      mapPlane = new kit.Plane(view, WIDTH, HEIGHT);
      const whole = view === MAP_VIEW;
      const digits = decimalsFor(view.width) - 1;
      const range = (low, high) => `${formatNumber(low, digits)} to ${formatNumber(high, digits)}`;
      const magnification = MAP_VIEW.width / view.width;
      map.caption.textContent = whole ? 'Re(c): −2.2 to 1.0 · Im(c): −1.2 to 1.2'
        : `Re(c): ${range(view.left, view.left + view.width)} · Im(c): ${range(view.top - view.height, view.top)} · `
          + `magnification ${magnification.toLocaleString('en')} · ${mapBudget().toLocaleString('en')} steps`;
      zoomInButton.disabled = magnification >= MAX_MAGNIFICATION;
      zoomOutButton.disabled = whole;
      wholeButton.disabled = whole;
      drawMarker();
      renderMap();
    }

    // Zooms to a window `width` wide around the chosen c; as wide as the whole set, it is the whole set.
    function zoomTo(width) {
      if (width >= MAP_VIEW.width) showMap(MAP_VIEW);
      else showMap(mapView(state.c, Math.max(width, MAP_VIEW.width / MAX_MAGNIFICATION)));
    }

    function drawMarker() {
      map.overlay.replaceChildren();
      const {x, y} = mapPlane.toScreen(state.c);
      kit.svg('circle', {cx: x, cy: y, r: 6 * mark(map.overlay), class: 'orbit-marker'}, map.overlay);
    }

    function drawOrbit() {
      const layer = dynamics.overlay;
      layer.replaceChildren();
      const unit = mark(layer);
      const points = state.result.points.slice(0, state.shown + 1).map(point => orbitPlane.toScreen(point));
      if (points.length > 1) {
        kit.svg('polyline', {points: points.map(({x, y}) => `${x},${y}`).join(' '), class: 'orbit-path'}, layer);
      }
      points.forEach(({x, y}, index) => {
        const role = index === 0 ? 'orbit-start' : index === points.length - 1 ? 'orbit-current' : 'orbit-point';
        kit.svg('circle', {cx: x, cy: y, r: (index === points.length - 1 || index === 0 ? 5 : 3) * unit, class: role},
          layer);
      });
      // The current point and z₀ … z₃ get labels. A label whose point is close
      // to, but not on, an already labelled point is skipped; labels of the
      // same point are joined by placeLabels.
      const current = points.length - 1;
      const labels = [{...points[current], text: `z${subscript(current)}`, className: 'orbit-label orbit-label-current'}];
      points.slice(0, LABELLED).forEach((point, index) => {
        if (index === current) return;
        const crowded = labels.some(other => {
          const gap = Math.hypot(other.x - point.x, other.y - point.y);
          return gap >= 3 * unit && gap < 18 * unit;
        });
        if (!crowded) labels.push({...point, text: `z${subscript(index)}`, className: 'orbit-label'});
      });
      kit.placeLabels(layer, labels, orbitPlane.toScreen({re: 0, im: 0}), 16 * unit, 6 * unit);
    }

    function describe() {
      const n = state.shown;
      const point = state.result.points[n];
      const start = state.z0.re === 0 && state.z0.im === 0 ? 'the critical point 0' : `z₀ = ${format(state.z0, 3)}`;
      stepLine.innerHTML = `Orbit of ${start} for c = ${format(state.c, decimalsFor(state.map.width))}. Step ${n}: `
        + `z${subscript(n)} = ${format(point, 3)}, |z${subscript(n)}| = ${formatNumber(complex.abs(point), 3)}.`;
      verdictLine.innerHTML = kit.describeOrbit(state.result);  // built only from numbers formatted above
    }

    function lastShowable() {
      return Math.min(MAX_SHOWN, state.result.points.length - 1);
    }

    function show(steps) {
      state.shown = Math.max(0, Math.min(steps, lastShowable()));
      stepButton.disabled = state.shown >= lastShowable();
      drawOrbit();
      describe();
    }

    function play() {
      if (state.shown >= lastShowable()) state.shown = 0;
      if (reducedMotion) {
        show(lastShowable());
        return;
      }
      playButton.textContent = 'Pause';
      state.timer = setInterval(() => {
        show(state.shown + 1);
        if (state.shown >= lastShowable()) stop();
      }, PLAY_INTERVAL);
    }

    function stop() {
      clearInterval(state.timer);
      state.timer = null;
      playButton.textContent = 'Play';
    }

    function updateFields() {
      const values = {cRe: state.c.re, cIm: state.c.im, zRe: state.z0.re, zIm: state.z0.im};
      for (const [key, input] of Object.entries(fields)) {
        if (input !== document.activeElement) input.value = String(values[key]);
      }
      criticalButton.hidden = state.z0.re === 0 && state.z0.im === 0;
    }

    // A new c redraws the Julia set; a new start only the orbit.
    function recompute() {
      stop();
      state.result = kit.orbitOf(state.c, state.z0);
      updateFields();
      show(SHOWN_AT_FIRST);
    }

    // A c outside the window shown, from an example or the number fields, brings back the whole set.
    function setC(c) {
      state.c = c;
      const example = EXAMPLES.find(([, , re, im]) => re === c.re && im === c.im);
      select.value = example ? example[0] : 'custom';
      const {left, top, width, height} = state.map;
      const inside = c.re >= left && c.re <= left + width && c.im <= top && c.im >= top - height;
      if (inside || state.map === MAP_VIEW) drawMarker();
      else showMap(MAP_VIEW);
      renderJulia();
      recompute();
    }

    function setStart(z0) {
      state.z0 = z0;
      recompute();
    }

    select.addEventListener('change', () => {
      const example = EXAMPLES.find(([key]) => key === select.value);
      if (!example) return;
      state.z0 = startPoint;
      setC({re: example[2], im: example[3]});
    });
    kit.makeDraggable(map.overlay, map.overlay, (x, y) => {
      const c = mapPlane.fromScreen(x, y);
      const digits = decimalsFor(state.map.width);
      setC({re: round(c.re, digits), im: round(c.im, digits)});
    });
    kit.makeDraggable(dynamics.overlay, dynamics.overlay, (x, y) => {
      const z = orbitPlane.fromScreen(x, y);
      setStart({re: round(z.re), im: round(z.im)});
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, fieldRow, panels, stepLine, verdictLine]) figure.insertBefore(part, caption);
    showMap(MAP_VIEW);
    setC(state.c);
    // After a change of size, or of the figure's place: the pictures, if they no longer fit, and the marks.
    function refit() {
      if (!kit.fitsScreen(map.context.canvas, WIDTH, HEIGHT)) renderMap();
      if (!kit.fitsScreen(dynamics.context.canvas, WIDTH, HEIGHT)) renderJulia();
      drawMarker();
      drawOrbit();
    }
    kit.whenResized(refit);
    kit.enlargeable(figure, controls, refit);
  });
})();
