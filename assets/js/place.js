/* Interactive figure: one window of the Mandelbrot set, as the guided tour
   shows each of its stops, optionally beside the filled Julia set of one
   parameter.

   The pictures are computed in the browser when the figure first comes into
   view, with the zoom viewer's escape-time drawing and iteration budget;
   clicking the Mandelbrot picture opens the gallery's zoom viewer on the same
   window. Built by AtlasKit.setUp for every <figure data-widget="place">.
   Data attributes:
     data-window  "re,im,width": the centre and width (the height is three
                  quarters of the width)
     data-marks   optional points to mark and label, as "re,im,label,side"
                  separated by semicolons; side is n, e, s or w (default e)
     data-julia   optional "re,im": a parameter c. Its filled Julia set is then
                  drawn beside the Mandelbrot set, on the window of the
                  gallery's Julia pictures, and each picture is titled with
                  its plane */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const PREVIEW = 4;  // a quick preview is drawn first, at a quarter of the resolution
  const LABEL_OFFSET = {n: [0, -12], e: [10, 5], s: [0, 20], w: [-10, 5]};
  const JULIA_WINDOW = [0, 0, 4.2];  // 4.2 × 3.15, as the Julia gallery

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

  function parseMarks(text) {
    return (text || '').split(';').map(part => part.split(',').map(item => item.trim()))
      .filter(([re, im, label]) => Number.isFinite(Number(re)) && Number.isFinite(Number(im)) && label)
      .map(([re, im, label, side]) => ({c: {re: Number(re), im: Number(im)}, label, side: LABEL_OFFSET[side] ? side : 'e'}));
  }

  // One picture of the parameter plane, or of the dynamical plane of `julia`:
  // the canvas (for the parameter plane inside a link to the zoom viewer), its
  // marks, its status line, and draw(), which computes it.
  function picture([re, im, width], julia, marks) {
    const height = width * HEIGHT / WIDTH;
    const view = {left: re - width / 2, top: im + height / 2, width, height};
    const budget = kit.iterationBudget(width);
    const centre = format({re, im}, 4);
    const shownWidth = formatNumber(width, 4);

    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return null;
    let holder;
    if (julia) {
      holder = element('div', 'plate-view');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Picture of the filled Julia set of c = ${format(julia, 4)}, `
        + `around ${centre}, ${shownWidth} wide.`);
    } else {
      holder = element('a', 'plate-view place-view');
      holder.href = `gallery.html#zoom=${re},${im},${width}`;
      holder.setAttribute('aria-label', `Picture of the Mandelbrot set around ${centre}, ${shownWidth} wide. `
        + 'Open it in the zoom viewer.');
    }
    holder.append(canvas);

    if (marks.length) {
      const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay place-marks', 'aria-hidden': 'true'});
      const plane = new kit.Plane(view, WIDTH, HEIGHT);
      for (const {c, label, side} of marks) {
        const {x, y} = plane.toScreen(c);
        kit.svg('circle', {cx: x, cy: y, r: 4, class: 'place-mark'}, overlay);
        const [dx, dy] = LABEL_OFFSET[side];
        kit.svg('text', {x: x + dx, y: y + dy, class: 'place-label',
          'text-anchor': side === 'w' ? 'end' : side === 'e' ? 'start' : 'middle'}, overlay).textContent = label;
      }
      holder.append(overlay);
    }

    const status = element('p', 'plate-caption place-status');
    status.textContent = `Center ${centre} · width ${shownWidth} · ${budget.toLocaleString('en')} iterations per pixel.`;

    // A preview at a quarter of the resolution, scaled up, then the full picture.
    async function draw() {
      const preview = document.createElement('canvas');
      preview.width = WIDTH / PREVIEW;
      preview.height = HEIGHT / PREVIEW;
      const quick = await kit.renderEscapeTime(preview.getContext('2d'), view, julia, budget, () => true, {repeats: true});
      if (quick) {
        context.imageSmoothingEnabled = true;
        context.drawImage(preview, 0, 0, WIDTH, HEIGHT);
      }
      return kit.renderEscapeTime(context, view, julia, budget, () => true, {repeats: true});
    }
    return {parts: [holder, status], draw};
  }

  kit.setUp('place', (figure) => {
    figure.classList.add('widget-plate', 'place');
    const area = parseNumbers(figure.dataset.window, 3);
    if (!area || area[2] <= 0) return;
    const marks = parseMarks(figure.dataset.marks);
    const julia = parseNumbers(figure.dataset.julia, 2);
    const caption = figure.querySelector('figcaption');

    const pictures = [];
    if (julia) {
      const c = {re: julia[0], im: julia[1]};
      const panels = element('div', 'plate-grid');
      for (const [title, shown] of [
        ['Parameter plane · vary <var>c</var>', picture(area, null, marks)],
        [`Dynamical plane of <var>c</var> = ${format(c, 4)} · vary <var>z</var><sub>0</sub>`, picture(JULIA_WINDOW, c, [])],
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
      const shown = picture(area, null, marks);
      if (!shown) return;
      for (const part of shown.parts) figure.insertBefore(part, caption);
      pictures.push(shown);
    }

    // The pictures are computed once, when the figure first comes near the screen.
    async function draw() {
      const images = await Promise.all(pictures.map(shown => shown.draw()));
      if (images.every(Boolean)) figure.dataset.drawn = '';
    }
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        draw();
      }, {rootMargin: '300px'});
      observer.observe(figure);
    } else {
      draw();
    }
  });
})();
