/* Interactive figure: one window of the Mandelbrot set, as the guided tour
   shows each of its stops.

   The picture is computed in the browser when the figure first comes into
   view, with the zoom viewer's escape-time drawing and iteration budget;
   clicking it opens the gallery's zoom viewer on the same window. Built by
   AtlasKit.setUp for every <figure data-widget="place">. Data attributes:
     data-window  "re,im,width": the centre and width (the height is three
                  quarters of the width)
     data-marks   optional points to mark and label, as "re,im,label,side"
                  separated by semicolons; side is n, e, s or w (default e) */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const PREVIEW = 4;  // a quick preview is drawn first, at a quarter of the resolution
  const LABEL_OFFSET = {n: [0, -12], e: [10, 5], s: [0, 20], w: [-10, 5]};

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function parseMarks(text) {
    return (text || '').split(';').map(part => part.split(',').map(item => item.trim()))
      .filter(([re, im, label]) => Number.isFinite(Number(re)) && Number.isFinite(Number(im)) && label)
      .map(([re, im, label, side]) => ({c: {re: Number(re), im: Number(im)}, label, side: LABEL_OFFSET[side] ? side : 'e'}));
  }

  kit.setUp('place', (figure) => {
    figure.classList.add('widget-plate', 'place');
    const [re, im, width] = (figure.dataset.window || '').split(',').map(Number);
    if (![re, im, width].every(Number.isFinite) || width <= 0) return;
    const height = width * HEIGHT / WIDTH;
    const view = {left: re - width / 2, top: im + height / 2, width, height};
    const budget = kit.iterationBudget(width);
    const centre = format({re, im}, 4);
    const shownWidth = formatNumber(width, 4);

    const link = element('a', 'plate-view place-view');
    link.href = `gallery.html#zoom=${re},${im},${width}`;
    link.setAttribute('aria-label', `Picture of the Mandelbrot set around ${centre}, ${shownWidth} wide. `
      + 'Open it in the zoom viewer.');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    link.append(canvas);

    const marks = parseMarks(figure.dataset.marks);
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
      link.append(overlay);
    }

    const status = element('p', 'plate-caption place-status');
    status.textContent = `Center ${centre} · width ${shownWidth} · ${budget.toLocaleString('en')} iterations per pixel.`;

    const caption = figure.querySelector('figcaption');
    figure.insertBefore(link, caption);
    figure.insertBefore(status, caption);

    // Each picture is computed once, when it first comes near the screen: a
    // preview at a quarter of the resolution, scaled up, then the full picture.
    async function draw() {
      const preview = document.createElement('canvas');
      preview.width = WIDTH / PREVIEW;
      preview.height = HEIGHT / PREVIEW;
      const quick = await kit.renderEscapeTime(preview.getContext('2d'), view, null, budget, () => true, {repeats: true});
      if (quick) {
        context.imageSmoothingEnabled = true;
        context.drawImage(preview, 0, 0, WIDTH, HEIGHT);
      }
      const image = await kit.renderEscapeTime(context, view, null, budget, () => true, {repeats: true});
      if (image) figure.dataset.drawn = '';
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
