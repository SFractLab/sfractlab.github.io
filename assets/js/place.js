/* Interactive figure: one window of the Mandelbrot set, as the guided tour
   shows each of its stops, optionally beside the filled Julia set of one
   parameter or beside another window of the Mandelbrot set.

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
                  point, which leaves it visible (its label may be empty;
                  if given, it stands at the ring's upper right),
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
     data-beside  optional "re,im,width": another window of the Mandelbrot
                  set, drawn beside the first, to compare two places
     data-beside-marks optional marks for that window, as data-marks
     data-titles  with data-beside: the titles of the two pictures,
                  separated by "|"
     data-julias  with data-beside: two parameters c, "re,im|re,im". A
                  button then switches both pictures to the filled Julia
                  sets of these parameters and back
     data-julia-windows with data-julias: their windows, "re,im,width|re,im,width"
                  (default the window of the gallery's Julia pictures)
     data-julia-marks with data-julias: their marks, as data-marks,
                  separated by "|"

   A figure can instead offer several windows. Each is an element inside it,
   usually a part of the caption, with data-choice (a key), data-name (its
   entry in the menu), data-window, data-marks and data-frame. A menu, labelled by the
   figure's data-menu (default "Window"), chooses one: it is drawn, its
   element is shown and the others are hidden. A window may also have
   data-rays, the angles of parameter rays as fractions separated by commas;
   a button then shows and hides them. Each ray is traced (AtlasKit.parameterRay)
   until it comes within half a pixel of a marked point, where it lands. A window
   may also have data-julia, "re,im", a parameter c: a second button then switches
   it between the Mandelbrot set and the filled Julia set of c in the same window,
   with the same marks, and the rays become the dynamical rays of c at the same
   angles (AtlasKit.dynamicalRay). Both buttons keep their choice for the next
   window. */
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
  const PAIRED_BADGE_RADIUS = 15;  // one of two pictures side by side is shown about half as wide
  const RING_RADIUS = 28;
  const JULIA_WINDOW = [0, 0, 4.2];  // 4.2 × 3.15, as the Julia gallery
  const RAY_STEPS = 16;   // points per halving of the potential: near a spiral a ray turns by up to half a turn in each
  const RAY_DEPTH = 400;  // halvings at most; the double spiral's rays need 236 to come within half a pixel
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

  // "9/56, 11/56" as [{p: 9, q: 56}, {p: 11, q: 56}], reduced; angles that are not fractions from 0 to 1 are left out.
  function parseAngles(text) {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    return (text || '').split(',').map(part => part.trim().match(/^(\d+)\/(\d+)$/)).filter(Boolean)
      .map(([, p, q]) => [Number(p), Number(q)]).filter(([p, q]) => q > 0 && p < q)
      .map(([p, q]) => ({p: p / gcd(p, q), q: q / gcd(p, q)}));
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
  // status line, draw(), which computes it, and, with `angles`, showRays(shown), which
  // traces the rays at those angles once, parameter rays or the dynamical rays of `julia`,
  // and shows or hides them. With `titled`, the status line first names the Julia set. With `paired`, the
  // picture is one of two side by side, and its badges are larger (their labels, too: site.css).
  function picture([re, im, width], julia, marks, linked, frame = null, angles = [], titled = false, paired = false) {
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

    const plane = new kit.Plane(view, WIDTH, HEIGHT);
    let rayLayer = null;
    if (marks.length || frame || angles.length) {
      const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay place-marks', 'aria-hidden': 'true'});
      if (angles.length) rayLayer = kit.svg('g', {class: 'place-rays'}, overlay);  // under the marks
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
          if (label) {
            kit.svg('text', {x: x + r * .75 + 2, y: y - r * .75 - 2, class: 'place-label'}, overlay).textContent = label;
          }
          continue;
        }
        if (side === 'in') {
          kit.svg('circle', {cx: x, cy: y, r: paired ? PAIRED_BADGE_RADIUS : BADGE_RADIUS, class: 'place-badge'}, overlay);
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
    // With `titled`, "Julia set of c = i · center c", when the picture is centred on c.
    const parameter = titled ? format(julia, decimals) : '';
    const where = titled ? `Julia set of c = ${parameter} · center ${parameter === centre ? 'c' : centre}` : `Center ${centre}`;
    const statusText = `${where} · width ${shownWidth} · ${budget.toLocaleString('en')} iterations per pixel.`;
    status.textContent = statusText;

    // The rays, traced when first shown, each until it comes within half a pixel of a marked point.
    let rays = null;
    const fraction = ({p, q}) => `${p}/${q}`;
    function traceRays() {
      const close = width / WIDTH / 2;
      return angles.map(angle => {
        const points = [];
        const ray = julia ? kit.dynamicalRay(angle, julia, RAY_DEPTH, RAY_STEPS) : kit.parameterRay(angle, RAY_DEPTH, RAY_STEPS);
        for (const point of ray) {
          points.push(point);
          if (marks.some(({c}) => Math.hypot(point.re - c.re, point.im - c.im) < close)) break;
        }
        return {points, text: fraction(angle)};
      });
    }
    function showRays(shown) {
      if (!rayLayer) return;
      if (shown && !rays) rays = traceRays();
      rayLayer.replaceChildren();
      if (shown) kit.drawRays(rayLayer, rays, plane, WIDTH, HEIGHT, {halo: true, shrink: true});
      const list = angles.map(fraction);
      const named = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
      const kind = julia ? 'Dynamical' : 'Parameter';
      status.textContent = shown ? `${statusText} ${kind} ray${list.length > 1 ? 's' : ''} at ${named}.` : statusText;
    }

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
    return {parts: [holder, status], draw, showRays, rays: angles.length > 0, julia: Boolean(julia),
      fits: () => kit.fitsScreen(canvas, WIDTH, HEIGHT)};
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
    // Shows and hides the rays of the windows that have them, and switches the windows with a
    // parameter c between the Mandelbrot set and the Julia set of c; both choices are kept for the next window.
    let raysShown = false;
    let juliaShown = false;
    const raysButton = element('button', null, 'Show the parameter rays');
    raysButton.type = 'button';
    const juliaButton = element('button', null, 'Show the Julia set');
    juliaButton.type = 'button';
    const juliaOf = choice => parseNumbers(choice.dataset.julia, 2);
    const withRays = choices.some(choice => choice.dataset.rays);
    const withJulia = choices.some(juliaOf);
    if (withRays || withJulia) {
      const buttons = element('div', 'plate-buttons');
      if (withRays) buttons.append(raysButton);
      if (withJulia) buttons.append(juliaButton);
      controls.append(buttons);
    }
    function showRays() {
      const kind = shown && shown.julia ? 'dynamical' : 'parameter';
      raysButton.textContent = `${raysShown ? 'Hide' : 'Show'} the ${kind} rays`;
      raysButton.disabled = !shown || !shown.rays;
      if (shown) shown.showRays(raysShown);
    }
    raysButton.addEventListener('click', () => {
      raysShown = !raysShown;
      showRays();
    });
    juliaButton.addEventListener('click', () => {
      juliaShown = !juliaShown;
      choose();
    });
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
      const parameter = juliaOf(choice);
      const julia = juliaShown && parameter ? {re: parameter[0], im: parameter[1]} : null;
      juliaButton.textContent = juliaShown ? 'Show the Mandelbrot set' : 'Show the Julia set';
      juliaButton.disabled = !parameter;
      const next = area && area[2] > 0
        ? picture(area, julia, parseMarks(choice.dataset.marks), linked && !julia, frame && frame[2] > 0 ? frame : null,
          parseAngles(choice.dataset.rays), Boolean(julia)) : null;
      for (const part of shown ? shown.parts : []) part.remove();
      shown = next;
      for (const part of shown ? shown.parts : []) figure.insertBefore(part, caption);
      showRays();
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
      if (shown && raysShown) shown.showRays(true);  // labels keep their size on screen
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
    const beside = parseNumbers(figure.dataset.beside, 3);

    // Two titled pictures side by side: the Mandelbrot set and the Julia set of c, titled with their
    // planes (fixed markup with <var>), or two windows of the Mandelbrot set, titled from data-titles (text).
    let panes = null;
    let alternatives = null;  // with data-julias: the Julia pictures that the button puts in place of the panes
    if (julia) {
      const c = {re: julia[0], im: julia[1]};
      panes = [
        [{html: 'Parameter plane · vary <var>c</var>'}, picture(area, null, marks, linked, frame && frame[2] > 0 ? frame : null, [], false, true)],
        [{html: `Dynamical plane of <var>c</var> = ${format(c, 4)} · vary <var>z</var><sub>0</sub>`}, picture(juliaWindow && juliaWindow[2] > 0 ? juliaWindow : JULIA_WINDOW, c, [], false)],
      ];
    } else if (beside && beside[2] > 0) {
      const titles = (figure.dataset.titles || '').split('|').map(title => title.trim());
      panes = [
        [{text: titles[0] || ''}, picture(area, null, marks, linked, frame && frame[2] > 0 ? frame : null, [], false, true)],
        [{text: titles[1] || ''}, picture(beside, null, parseMarks(figure.dataset.besideMarks), linked, null, [], false, true)],
      ];
      const split = text => (text || '').split('|');
      const julias = split(figure.dataset.julias).map(text => parseNumbers(text, 2));
      if (julias.length === 2 && julias.every(Boolean)) {
        const windows = split(figure.dataset.juliaWindows).map(text => parseNumbers(text, 3));
        const juliaMarks = split(figure.dataset.juliaMarks).map(parseMarks);
        alternatives = julias.map(([re, im], index) => picture(windows[index] && windows[index][2] > 0 ? windows[index] : JULIA_WINDOW,
          {re, im}, juliaMarks[index] || [], false, null, [], true));
        if (!alternatives.every(Boolean)) alternatives = null;
      }
    }

    let pictures = [];
    if (panes) {
      const panels = element('div', 'plate-grid');
      const boxes = [];
      for (const [title, shown] of panes) {
        if (!shown) return;
        const box = element('div', 'plate-panel');
        const heading = element('h3');
        if (title.html) heading.innerHTML = title.html;
        else heading.textContent = title.text;
        box.append(heading, ...shown.parts);
        panels.append(box);
        boxes.push(box);
        pictures.push(shown);
      }
      figure.insertBefore(panels, caption);
      if (alternatives) {
        // One button switches both panes between their windows of the Mandelbrot set and the Julia pictures.
        figure.classList.add('place-switch');
        const controls = element('div', 'plate-controls');
        const buttons = element('div', 'plate-buttons');
        const button = element('button', null, 'Show the Julia sets');
        button.type = 'button';
        buttons.append(button);
        controls.append(buttons);
        figure.insertBefore(controls, panels);
        let others = alternatives;
        button.addEventListener('click', () => {
          boxes.forEach((box, index) => {
            for (const part of pictures[index].parts) part.remove();
            box.append(...others[index].parts);
          });
          [pictures, others] = [others, pictures];
          button.textContent = pictures === alternatives ? 'Show the Mandelbrot sets' : 'Show the Julia sets';
          delete figure.dataset.drawn;
          if (near) draw();
        });
      }
    } else {
      const shown = picture(area, null, marks, linked, frame && frame[2] > 0 ? frame : null);
      if (!shown) return;
      for (const part of shown.parts) figure.insertBefore(part, caption);
      pictures.push(shown);
    }

    // The pictures are computed when the figure first comes near the screen, and again when a
    // change of the window's size or zoom calls for another size.
    // A picture already drawn at the size it needs is kept, as when the button switches back to it;
    // a newer drawing stops an older one.
    let near = false;
    let generation = 0;
    const done = new Set();
    async function draw() {
      const request = ++generation;
      const isCurrent = () => request === generation;
      const images = await Promise.all(pictures.map(shown => (done.has(shown) && shown.fits() ? true
        : shown.draw(isCurrent).then(image => {
          if (image) done.add(shown);
          return image;
        }))));
      if (images.every(Boolean) && isCurrent()) figure.dataset.drawn = '';
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
