/* Figure: the Mandelbrot set around a Misiurewicz point, magnified step by
   step by the modulus of the multiplier λ of the cycle its orbit of 0 lands
   on. Each picture is |λ| times as magnified as the one before, so without
   turning, the picture turns by the angle of λ from each to the next; turned
   back by that angle per step, all of them look alike, ever more exactly as
   one zooms in (Tan Lei's local similarity). For c = i, λ = 4 + 4i: a
   magnification of 4√2 ≈ 5.66 and a turn of 45° per step, so the eighth step
   points the same way as the first picture.

   The pictures are drawn by the distance estimate (AtlasKit's distance
   coloring), whose colors depend on distances in pixels only, so they do not
   change with the magnification, as escape counts would. Each is round, with
   a ring at its centre, the point itself; the turn is a CSS rotation of the
   canvas inside its circle.

   Built by AtlasKit.setUp for every <figure data-widget="similarity">.
   Data attributes: data-point and data-multiplier as "re,im", data-width,
   the width of the first window (defaults: c = i, λ = 4 + 4i, 0.14). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;

  const SIZE = 240;       // the designed size of each picture, square
  const STEPS = 9;        // pictures, from no magnification to |λ|⁸
  const BUDGET = 3000;
  const RADIUS = 1000;    // escape radius for the distance estimate
  const LINE = 1.3;       // the set's width on screen, in CSS pixels
  const RING = 20;        // the radius of the ring at the centre, in the picture's units: wide and
                          // thin, without a halo, so that the set shows inside it up to the point

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function pair(text, fallback) {
    const parts = (text || '').split(',').map(Number);
    return parts.length === 2 && parts.every(Number.isFinite) ? {re: parts[0], im: parts[1]} : fallback;
  }

  // ×1, ×5.66, ×32, ×181, ×1,024, … : two decimals below 10, whole numbers above.
  const magnification = value => `×${value < 10 ? kit.formatNumber(value, 2) : Math.round(value).toLocaleString('en')}`;

  kit.setUp('similarity', (figure) => {
    figure.classList.add('widget-plate');
    const point = pair(figure.dataset.point, {re: 0, im: 1});
    const multiplier = pair(figure.dataset.multiplier, {re: 4, im: 4});
    const firstWidth = Number(figure.dataset.width) > 0 ? Number(figure.dataset.width) : .14;
    const scale = Math.hypot(multiplier.re, multiplier.im);
    const turn = Math.atan2(multiplier.im, multiplier.re) * 180 / Math.PI;  // degrees, counterclockwise
    const name = `c = ${kit.format(point, 10)}`;

    // --- controls: the pictures as zoomed, or each turned back by the angle of λ per step ---

    const controls = element('div', 'plate-controls');
    const buttons = element('div', 'plate-buttons');
    const choices = [['plain', 'Without turning'], ['turned', `Turned back ${kit.formatNumber(turn, 1)}° per step`]]
      .map(([key, text]) => {
        const node = element('button', null, text);
        node.type = 'button';
        node.dataset.turn = key;
        node.addEventListener('click', () => setTurned(key === 'turned'));
        buttons.append(node);
        return node;
      });
    controls.append(buttons);

    // --- the pictures ---

    const grid = element('div', 'similarity-grid');
    const pictures = [];
    for (let k = 0; k < STEPS; k++) {
      const panel = element('div', 'similarity-panel');
      const disc = element('div', 'similarity-disc');
      const canvas = element('canvas');
      canvas.width = canvas.height = SIZE;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.setAttribute('role', 'img');
      const overlay = kit.svg('svg', {viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'similarity-overlay', 'aria-hidden': 'true'});
      kit.svg('circle', {class: 'similarity-ring', cx: SIZE / 2, cy: SIZE / 2, r: RING}, overlay);
      disc.append(canvas, overlay);
      const label = element('p', 'plate-caption similarity-label');
      panel.append(disc, label);
      grid.append(panel);
      const width = firstWidth / scale ** k;
      pictures.push({k, canvas, context, label, width, zoom: magnification(scale ** k)});
    }

    // Each picture turned back by k times the angle of λ, counterclockwise, or not at all.
    function setTurned(turned) {
      for (const node of choices) {
        const chosen = (node.dataset.turn === 'turned') === turned;
        node.classList.toggle('plate-button-quiet', !chosen);
        node.setAttribute('aria-pressed', String(chosen));
      }
      for (const {k, canvas, label, zoom} of pictures) {
        const angle = turned ? turn * k : 0;
        canvas.style.transform = angle ? `rotate(${-angle}deg)` : '';
        const degrees = `${kit.formatNumber(angle, 1)}°`;
        // The turn on a second line, kept empty without turning, so that the figure keeps its height.
        label.textContent = `${zoom}\n${angle ? `turned ${degrees}` : '\u00a0'}`;
        canvas.setAttribute('aria-label', `The Mandelbrot set around ${name}, magnified ${zoom.slice(1)} times`
          + `${angle ? `, turned back ${degrees}` : ''}.`);
      }
    }

    // Draws one picture at the size the screen calls for; resolves to true once it is complete.
    async function drawPicture({canvas, context, width}, isCurrent) {
      kit.fitCanvas(canvas, SIZE, SIZE);
      const view = {left: point.re - width / 2, top: point.im + width / 2, width, height: width};
      const pass = await kit.orbitPass(view, null, BUDGET, RADIUS, canvas.width, canvas.height, isCurrent,
        {coloring: 'distance'});
      if (!pass) return false;
      pass.thickness = LINE * canvas.width / (canvas.getBoundingClientRect().width || SIZE);
      kit.paintOrbits(context, pass, 'distance');
      return true;
    }

    // The pictures are computed when the figure first comes near the screen, and again when a
    // change of the window's size or zoom calls for another size. A drawing still running when
    // another starts stops; only the last one marks the figure drawn.
    let near = false;
    let round = 0;
    async function draw() {
      const current = ++round;
      delete figure.dataset.drawn;
      const done = await Promise.all(pictures.map(picture => drawPicture(picture, () => current === round)));
      if (current === round && done.every(Boolean)) figure.dataset.drawn = '';
    }

    setTurned(false);
    const caption = figure.querySelector('figcaption');
    figure.insertBefore(controls, caption);
    figure.insertBefore(grid, caption);
    kit.whenNear(figure, () => {
      near = true;
      draw();
    });
    kit.whenResized(() => {
      if (near && !pictures.every(({canvas}) => kit.fitsScreen(canvas, SIZE, SIZE))) draw();
    });
  });
})();
