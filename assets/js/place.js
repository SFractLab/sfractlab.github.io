/* Interactive figure: one window of the Mandelbrot set, as the guided tour
   shows each of its stops, optionally beside the filled Julia set of one
   parameter.

   The pictures are computed in the browser when the figure first comes into
   view, at the size AtlasKit.fitCanvas chooses for the screen (640 × 480 or
   more), with the zoom viewer's iteration budget; clicking the Mandelbrot
   picture opens the gallery's zoom viewer on the same window. Built by
   AtlasKit.setUp for every <figure data-widget="place">.
   Data attributes:
     data-window  "re,im,width": the centre and width (the height is three
                  quarters of the width)
     data-marks   optional points to mark and label, as "re,im,label,side"
                  separated by semicolons; side is n, e, s or w (default e)
                  for a dot with the label beside it, "in" for a round
                  badge centred on the point, to label a component from
                  inside, or "ring" for an unfilled circle centred on the
                  point, which leaves it visible (its label may be empty),
                  or "small-ring" for one of half the size
     data-frame   optional "re,im,width": another window, outlined in the
                  picture as a rectangle, such as the next one of a zoom
     data-no-link optional: the picture does not open the zoom viewer
     data-julia   optional "re,im": a parameter c. Its filled Julia set is then
                  drawn beside the Mandelbrot set, on the window of the
                  gallery's Julia pictures, and each picture is titled with
                  its plane
     data-julia-window optional "re,im,width": another window for the Julia
                  picture

   A figure can instead offer several windows. Each is an element inside it,
   usually a part of the caption, with data-choice (a key), data-name (its
   entry in the menu), data-window, data-marks and data-frame. A menu, labelled by the
   figure's data-menu (default "Window"), chooses one: it is drawn, its
   element is shown and the others are hidden. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const PREVIEW = 4;  // a quick preview is drawn first, at a quarter of the resolution
  const LABEL_OFFSET = {n: [0, -12], e: [10, 5], s: [0, 20], w: [-10, 5]};
  const BADGE_RADIUS = 10;
  const RING_RADIUS = 28;
  const JULIA_WINDOW = [0, 0, 4.2];  // 4.2 × 3.15, as the Julia gallery
  const SUPERSCRIPTS = {'−': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function parseNumbers(text, count) {
    const numbers = (text || '').split(',').map(Number);
    return numbers.length === count && numbers.every(Number.isFinite) ? numbers : null;
  }

  // A width with two significant digits: "0.00024", or "2.8 × 10⁻⁹" below a ten-thousandth.
  function formatWidth(width, decimals) {
    if (width >= 1e-4) return formatNumber(width, decimals);
    const [mantissa, exponent] = width.toExponential(1).split('e');
    const power = String(Number(exponent)).replace('-', '−').replace(/./g, digit => SUPERSCRIPTS[digit]);
    return `${formatNumber(Number(mantissa), 1)} × 10${power}`;
  }

  function parseMarks(text) {
    return (text || '').split(';').map(part => part.split(',').map(item => item.trim()))
      .filter(([re, im, label, side]) => Number.isFinite(Number(re)) && Number.isFinite(Number(im))
        && (label || side === 'ring' || side === 'small-ring'))
      .map(([re, im, label, side]) => ({c: {re: Number(re), im: Number(im)}, label,
        side: side === 'in' || side === 'ring' || side === 'small-ring' || LABEL_OFFSET[side] ? side : 'e'}));
  }

  // One picture of the parameter plane, or of the dynamical plane of `julia`, with `frame`, another
  // window as re, im and width, outlined if given:
  // the canvas (inside a link to the zoom viewer if `linked`), its marks, its
  // status line, and draw(), which computes it.
  function picture([re, im, width], julia, marks, linked, frame = null) {
    const height = width * HEIGHT / WIDTH;
    const view = {left: re - width / 2, top: im + height / 2, width, height};
    const budget = kit.iterationBudget(width);
    const decimals = Math.max(4, Math.ceil(-Math.log10(width)) + 2);  // two significant digits of the width at least
    const centre = format({re, im}, decimals);
    const shownWidth = formatWidth(width, decimals);

    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const name = julia ? `the filled Julia set of c = ${format(julia, 4)},` : 'the Mandelbrot set';
    const label = `Picture of ${name} around ${centre}, ${shownWidth} wide.`;
    let holder;
    if (linked) {
      holder = element('a', 'plate-view place-view');
      holder.href = `gallery.html#zoom=${re},${im},${width}`;
      holder.setAttribute('aria-label', `${label} Open it in the zoom viewer.`);
    } else {
      holder = element('div', 'plate-view');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', label);
    }
    holder.append(canvas);

    if (marks.length || frame) {
      const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay place-marks', 'aria-hidden': 'true'});
      const plane = new kit.Plane(view, WIDTH, HEIGHT);
      if (frame) {
        const [frameRe, frameIm, frameWidth] = frame;
        const frameHeight = frameWidth * HEIGHT / WIDTH;
        const corner = plane.toScreen({re: frameRe - frameWidth / 2, im: frameIm + frameHeight / 2});
        const box = {x: corner.x, y: corner.y, width: frameWidth / width * WIDTH, height: frameHeight / height * HEIGHT};
        kit.svg('rect', {...box, class: 'place-frame-halo'}, overlay);
        kit.svg('rect', {...box, class: 'place-frame'}, overlay);
      }
      for (const {c, label, side} of marks) {
        const {x, y} = plane.toScreen(c);
        if (side === 'ring' || side === 'small-ring') {
          const r = side === 'ring' ? RING_RADIUS : RING_RADIUS / 2;
          kit.svg('circle', {cx: x, cy: y, r, class: 'place-ring-halo'}, overlay);
          kit.svg('circle', {cx: x, cy: y, r, class: 'place-ring'}, overlay);
          continue;
        }
        if (side === 'in') {
          kit.svg('circle', {cx: x, cy: y, r: BADGE_RADIUS, class: 'place-badge'}, overlay);
          kit.svg('text', {x, y, class: 'place-badge-label', 'text-anchor': 'middle',
            'dominant-baseline': 'central'}, overlay).textContent = label;
          continue;
        }
        kit.svg('circle', {cx: x, cy: y, r: 4, class: 'place-mark'}, overlay);
        const [dx, dy] = LABEL_OFFSET[side];
        kit.svg('text', {x: x + dx, y: y + dy, class: 'place-label',
          'text-anchor': side === 'w' ? 'end' : side === 'e' ? 'start' : 'middle'}, overlay).textContent = label;
      }
      holder.append(overlay);
    }

    const status = element('p', 'plate-caption place-status');
    status.textContent = `Center ${centre} · width ${shownWidth} · ${budget.toLocaleString('en')} iterations per pixel.`;

    // At the size the screen calls for (AtlasKit.fitCanvas), a preview at a quarter of the
    // resolution, scaled up, then the full picture; resolves to the image, or to null if
    // isCurrent() turned false on the way.
    async function draw(isCurrent = () => true) {
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      const preview = document.createElement('canvas');
      preview.width = Math.max(1, Math.round(canvas.width / PREVIEW));
      preview.height = Math.max(1, Math.round(canvas.height / PREVIEW));
      const quick = await kit.renderEscapeTime(preview.getContext('2d'), view, julia, budget, isCurrent, {repeats: true});
      if (!quick) return null;
      context.imageSmoothingEnabled = true;
      context.drawImage(preview, 0, 0, canvas.width, canvas.height);
      return kit.renderEscapeTime(context, view, julia, budget, isCurrent, {repeats: true});
    }
    return {parts: [holder, status], draw, fits: () => kit.fitsScreen(canvas, WIDTH, HEIGHT)};
  }

  // A figure with several windows: the menu, and the chosen window's picture and caption part.
  function offerChoices(figure, choices, linked, caption) {
    figure.classList.add('place-choices');
    const controls = element('div', 'plate-controls');
    const menu = element('label', null, figure.dataset.menu || 'Window');
    const select = element('select');
    for (const choice of choices) {
      const option = element('option', null, choice.dataset.name);
      option.value = choice.dataset.choice;
      select.append(option);
    }
    menu.append(select);
    controls.append(menu);
    figure.insertBefore(controls, caption);

    let shown = null;
    let near = false;
    let generation = 0;
    function draw() {
      if (!near || !shown) return;
      const request = ++generation;
      const isCurrent = () => request === generation;
      shown.draw(isCurrent).then(image => {
        if (image && isCurrent()) figure.dataset.drawn = '';
      });
    }
    function choose() {
      const choice = choices.find(item => item.dataset.choice === select.value);
      for (const item of choices) item.hidden = item !== choice;
      const area = parseNumbers(choice.dataset.window, 3);
      const frame = parseNumbers(choice.dataset.frame, 3);
      const next = area && area[2] > 0
        ? picture(area, null, parseMarks(choice.dataset.marks), linked, frame && frame[2] > 0 ? frame : null) : null;
      for (const part of shown ? shown.parts : []) part.remove();
      shown = next;
      for (const part of shown ? shown.parts : []) figure.insertBefore(part, caption);
      delete figure.dataset.drawn;
      generation++;  // a drawing of the window before stops
      draw();
    }
    select.addEventListener('change', choose);
    choose();
    kit.whenNear(figure, () => {
      near = true;
      draw();
    });
    kit.whenResized(() => {
      if (shown && !shown.fits()) draw();
    });
  }

  kit.setUp('place', (figure) => {
    figure.classList.add('widget-plate', 'place');
    const linked = !('noLink' in figure.dataset);
    const caption = figure.querySelector('figcaption');
    const choices = [...figure.querySelectorAll('[data-choice]')];
    if (choices.length) {
      offerChoices(figure, choices, linked, caption);
      return;
    }
    const area = parseNumbers(figure.dataset.window, 3);
    if (!area || area[2] <= 0) return;
    const marks = parseMarks(figure.dataset.marks);
    const frame = parseNumbers(figure.dataset.frame, 3);
    const julia = parseNumbers(figure.dataset.julia, 2);
    const juliaWindow = parseNumbers(figure.dataset.juliaWindow, 3);

    const pictures = [];
    if (julia) {
      const c = {re: julia[0], im: julia[1]};
      const panels = element('div', 'plate-grid');
      for (const [title, shown] of [
        ['Parameter plane · vary <var>c</var>', picture(area, null, marks, linked, frame && frame[2] > 0 ? frame : null)],
        [`Dynamical plane of <var>c</var> = ${format(c, 4)} · vary <var>z</var><sub>0</sub>`, picture(juliaWindow && juliaWindow[2] > 0 ? juliaWindow : JULIA_WINDOW, c, [], false)],
      ]) {
        if (!shown) return;
        const box = element('div', 'plate-panel');
        const heading = element('h3');
        heading.innerHTML = title;  // fixed markup with <var>
        box.append(heading, ...shown.parts);
        panels.append(box);
        pictures.push(shown);
      }
      figure.insertBefore(panels, caption);
    } else {
      const shown = picture(area, null, marks, linked, frame && frame[2] > 0 ? frame : null);
      if (!shown) return;
      for (const part of shown.parts) figure.insertBefore(part, caption);
      pictures.push(shown);
    }

    // The pictures are computed when the figure first comes near the screen, and again when a
    // change of the window's size or zoom calls for another size.
    let near = false;
    async function draw() {
      const images = await Promise.all(pictures.map(shown => shown.draw()));
      if (images.every(Boolean)) figure.dataset.drawn = '';
    }
    kit.whenNear(figure, () => {
      near = true;
      draw();
    });
    kit.whenResized(() => {
      if (near && !pictures.every(shown => shown.fits())) draw();
    });
  });
})();
