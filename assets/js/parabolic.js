/* Interactive figure: the orbit of 0 creeping toward a parabolic fixed point,
   as a cobweb magnified around that point. At c = 1/4 the parabola
   y = x² + c touches the diagonal at 1/2 (multiplier 1), and the orbit climbs
   a staircase into the narrowing channel between them; at c = −3/4 it crosses
   the diagonal at a right angle at −1/2 (multiplier −1), and the orbit winds
   around the point in a square spiral, changing sides at every step.

   A slider sets the number of steps n, from 1 to 100,000; the window can be
   magnified 10 or 100 times around the fixed point. The readout gives z_n,
   its distance from the fixed point and how that distance shrinks: like 1/n
   at 1/4, like 1/√n at −3/4. Built by AtlasKit.setUp for every
   <figure data-widget="parabolic">; no data attributes. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  const SIZE = 400;            // the drawing is square, so that slopes look as they are
  const MAX_STEPS = 100000;
  const FIRST = 100;           // the number of steps shown at first
  const RECENT = 8;            // the last steps, drawn in full; the earlier ones are drawn faint
  // Each point: its fixed point, the window at ×1 (its width, and where the fixed point lies across it),
  // and `spread`: an earlier step is left out while its corner lies within that many drawing units of
  // the corner of the last step drawn on the same side. The staircase toward 1/2 needs every step that
  // shows; the square spiral around −1/2 would fill its window, so its loops are kept apart.
  const POINTS = [
    {key: 'cusp', name: 'c = 1/4 · multiplier 1', c: .25, fixed: .5, label: '1/2', width: .66, at: .88, spread: .3},
    {key: 'root', name: 'c = −3/4 · multiplier −1', c: -.75, fixed: -.5, label: '−1/2', width: 1.1, at: .5, spread: 6},
  ];
  const ZOOMS = [1, 10, 100];
  // The slider's positions: every n up to 20, then 40 per tenfold up to MAX_STEPS.
  const STEPS = [...new Set([...Array.from({length: 20}, (_, k) => k + 1),
    ...Array.from({length: 149}, (_, k) => Math.round(10 ** ((k + 52) / 40)))])].filter(n => n <= MAX_STEPS);

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function modes(name, choices, checked, onChange) {
    const group = element('div', 'widget-modes');
    group.setAttribute('role', 'radiogroup');
    for (const [value, text] of choices) {
      const label = element('label');
      const input = element('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === checked;
      input.addEventListener('change', () => onChange(value));
      label.append(input, element('span', null, text));
      group.append(label);
    }
    return group;
  }

  function button(text, label, onClick) {
    const node = element('button', 'widget-button widget-button-quiet', text);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
  }

  // The orbit of 0 under x ↦ x² + c, MAX_STEPS steps.
  function orbit(c) {
    const z = new Float64Array(MAX_STEPS + 1);
    for (let n = 0; n < MAX_STEPS; n++) z[n + 1] = z[n] * z[n] + c;
    return z;
  }

  // Grid lines 1, 2 or 5 times a power of ten apart, at most seven across the window.
  function spacing(width) {
    const power = 10 ** Math.floor(Math.log10(width / 7));
    return [1, 2, 5, 10].map(k => k * power).find(step => width / step <= 7);
  }

  kit.setUp('parabolic', (figure, id) => {
    const orbits = new Map(POINTS.map(point => [point.key, orbit(point.c)]));
    const state = {point: POINTS[0], zoom: 1, n: FIRST};

    const controls = element('div', 'widget-controls');
    controls.append(
      modes(`${id}-point`, POINTS.map(point => [point.key, point.name]), state.point.key, key => {
        state.point = POINTS.find(point => point.key === key);
        draw();
      }),
      modes(`${id}-zoom`, ZOOMS.map(zoom => [String(zoom), `×${zoom}`]), '1', zoom => {
        state.zoom = Number(zoom);
        draw();
      }));
    const stepper = element('div', 'widget-controls');
    const slider = element('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(STEPS.length - 1);
    slider.step = '1';
    slider.setAttribute('aria-label', 'The number of steps n');
    const shown = element('span', 'deep-range-value');
    const sliderBox = element('label', 'widget-point deep-range');
    sliderBox.append('Steps ', slider, shown);
    slider.addEventListener('input', () => {
      state.n = STEPS[Number(slider.value)];
      draw();
    });
    const step = by => () => {
      state.n = Math.min(MAX_STEPS, Math.max(1, state.n + by));
      draw();
    };
    stepper.append(sliderBox, button('◀', 'One step fewer', step(-1)), button('▶', 'One step more', step(1)));

    const drawing = kit.svg('svg', {viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'widget-plane parabolic-plane', 'aria-hidden': 'true'});
    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    function draw() {
      const {c, fixed, label, at} = state.point;
      const z = orbits.get(state.point.key);
      const n = state.n;
      const width = state.point.width / state.zoom;
      const left = fixed - at * width;  // the same window in x and in y
      const toX = x => (x - left) / width * SIZE;
      const toY = y => SIZE - (y - left) / width * SIZE;
      const inside = x => x >= left && x <= left + width;
      drawing.replaceChildren();

      const grid = kit.svg('g', {class: 'plane-grid'}, drawing);
      const gap = spacing(width);
      const decimals = Math.max(0, -Math.floor(Math.log10(gap) + 1e-9));
      for (let k = Math.ceil(left / gap); k * gap <= left + width; k++) {
        const value = k * gap;
        const className = Math.abs(value) < gap / 2 ? 'plane-axis' : '';
        kit.svg('line', {x1: toX(value), y1: 0, x2: toX(value), y2: SIZE, class: className}, grid);
        kit.svg('line', {x1: 0, y1: toY(value), x2: SIZE, y2: toY(value), class: className}, grid);
        if (toX(value) > 12 && toX(value) < SIZE - 12) {
          kit.svg('text', {x: toX(value), y: SIZE - 8, 'text-anchor': 'middle', class: 'plane-tick'}, grid)
            .textContent = formatNumber(Math.abs(value) < gap / 2 ? 0 : value, decimals);
        }
      }
      kit.svg('line', {x1: 0, y1: SIZE, x2: SIZE, y2: 0, class: 'cobweb-diagonal'}, drawing);
      const parabola = Array.from({length: 201}, (_, k) => {
        const x = left + width * k / 200;
        return `${toX(x).toFixed(2)},${toY(x * x + c).toFixed(2)}`;
      }).join(' ');
      kit.svg('polyline', {points: parabola, class: 'cobweb-parabola'}, drawing);

      // The cobweb: for each step, up or down from (z_k, z_k) to the parabola, then across to the
      // diagonal; the earlier steps faint and thinned out (`spread`), the last RECENT in full.
      const trail = [];
      const recent = [];
      const kept = [null, null];
      for (let k = 0; k < n; k++) {
        const corner = [toX(z[k]), toY(z[k + 1])];
        const last = kept[k % 2];
        const early = k < n - RECENT;
        if (early && last && Math.abs(corner[0] - last[0]) + Math.abs(corner[1] - last[1]) < state.point.spread) continue;
        kept[k % 2] = corner;
        (early ? trail : recent).push(`M${toX(z[k]).toFixed(2)} ${toY(z[k]).toFixed(2)}V${corner[1].toFixed(2)}H${toX(z[k + 1]).toFixed(2)}`);
      }
      kit.svg('path', {d: trail.join(''), class: 'parabolic-trail'}, drawing);
      kit.svg('path', {d: recent.join(''), class: 'cobweb-path'}, drawing);
      kit.svg('circle', {cx: toX(fixed), cy: toY(fixed), r: 7, class: 'parabolic-fixed'}, drawing);
      // The label away from the curves: above and left of 1/2, where the parabola touches the diagonal
      // from above; right of −1/2, between the diagonal and the parabola, which cross there at a right angle.
      const touching = state.point.key === 'cusp';
      kit.svg('text', {x: toX(fixed) + (touching ? -12 : 14), y: toY(fixed) + (touching ? -12 : 5),
        'text-anchor': touching ? 'end' : 'start', class: 'parabolic-label'}, drawing).textContent = label;
      if (inside(0)) kit.svg('circle', {cx: toX(0), cy: toY(0), r: 4.5, class: 'cobweb-start'}, drawing);
      kit.svg('circle', {cx: toX(z[n]), cy: toY(z[n]), r: 5, class: 'parabolic-now'}, drawing);

      slider.value = String(STEPS.reduce((best, value, index) => (Math.abs(value - n) < Math.abs(STEPS[best] - n) ? index : best), 0));
      shown.textContent = n.toLocaleString('en');

      const distance = Math.abs(z[n] - fixed);
      const digits = Math.max(4, Math.ceil(-Math.log10(distance)) + 2);
      const point = `<var>z</var><sub>${n}</sub> ≈ ${formatNumber(z[n], digits)}`;
      let text;
      if (state.point.key === 'cusp') {
        text = `After <var>n</var> = ${n.toLocaleString('en')} steps, ${point}, still ${formatNumber(distance, digits)} short of 1/2. `
          + `<var>n</var> times this gap is ${(n * distance).toFixed(2)} and tends to 1: the gap shrinks like 1/<var>n</var>, `
          + 'so each further decimal takes ten times as many steps.';
      } else {
        const side = z[n] > fixed ? 'right' : 'left';
        text = `After <var>n</var> = ${n.toLocaleString('en')} steps, ${point}, ${formatNumber(distance, digits)} to the ${side} of −1/2; `
          + 'each step takes it to the other side. '
          + `√<var>n</var> times this gap is ${(Math.sqrt(n) * distance).toFixed(2)} and tends to 1/√2 ≈ 0.71: the gap shrinks `
          + 'like 1/√<var>n</var>, so each further decimal takes a hundred times as many steps.';
      }
      if (state.zoom > 1) {
        let first = 0;
        while (first < MAX_STEPS && !inside(z[first])) first++;
        text += ` At ×${state.zoom} the orbit first comes into the picture after ${first.toLocaleString('en')} steps.`;
      }
      readout.innerHTML = text;
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, stepper, drawing, readout]) figure.insertBefore(part, caption);
    draw();
  });
})();
