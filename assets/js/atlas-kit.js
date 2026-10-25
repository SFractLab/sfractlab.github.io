/* Shared helpers for the atlas's interactive figures, available as
   window.AtlasKit to the widget scripts listed after this one in site.toml.

   A widget is a <figure data-widget="name" hidden> in a chapter. Its script
   calls AtlasKit.setUp(name, build), which builds every such figure and then
   reveals it; without JavaScript the figure stays hidden and the chapter's
   static diagrams carry the explanation. Classic script, no dependencies. */
(() => {
  'use strict';

  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const MINUS = '−';

  // Complex numbers are plain {re, im} objects.
  const complex = {
    add: (a, b) => ({re: a.re + b.re, im: a.im + b.im}),
    multiply: (a, b) => ({re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re}),
    abs: a => Math.hypot(a.re, a.im),
    // The argument in [0, 2π), as the chapter measures angles.
    arg: a => (Math.atan2(a.im, a.re) + 2 * Math.PI) % (2 * Math.PI),
  };

  // Rounds to `digits` decimals without trailing zeros, with a true minus sign:
  // 1.50 → "1.5", −0.004 → "0", 10 → "10".
  function formatNumber(x, digits = 2) {
    const text = (Math.round(x * 10 ** digits) / 10 ** digits).toFixed(digits)
      .replace(/\.(\d*?)0+$/, (match, kept) => (kept ? `.${kept}` : ''));
    return text === '-0' ? '0' : text.replace('-', MINUS);
  }

  // A complex number as the chapters write it: "1.5 − 0.25i", "2i", "−i", "0".
  function format(c, digits = 2) {
    const re = formatNumber(c.re, digits);
    const im = formatNumber(Math.abs(c.im), digits);
    if (im === '0') return re;
    const imaginary = im === '1' ? 'i' : `${im}i`;
    const negative = c.im < 0;
    if (re === '0') return (negative ? MINUS : '') + imaginary;
    return `${re} ${negative ? MINUS : '+'} ${imaginary}`;
  }

  function formatAngle(radians) {
    return `${formatNumber(radians * 180 / Math.PI, 1)}°`;
  }

  // Maps a window of the complex plane, {left, top, width, height}, onto a
  // drawing of pixelWidth × pixelHeight units (y grows downwards on screen).
  class Plane {
    constructor(view, pixelWidth, pixelHeight) {
      Object.assign(this, view);
      this.pixelWidth = pixelWidth;
      this.pixelHeight = pixelHeight;
      this.scale = pixelWidth / view.width;
    }

    toScreen(c) {
      return {
        x: (c.re - this.left) / this.width * this.pixelWidth,
        y: (this.top - c.im) / this.height * this.pixelHeight,
      };
    }

    fromScreen(x, y) {
      return {re: this.left + x / this.pixelWidth * this.width, im: this.top - y / this.pixelHeight * this.height};
    }

    // The nearest point on a grid of `step`, kept inside the window.
    snap(c, step) {
      const round = (value, low, high) => {
        const snapped = Number((Math.round(value / step) * step).toFixed(10));
        return Math.min(high, Math.max(low, snapped));
      };
      return {re: round(c.re, this.left, this.left + this.width), im: round(c.im, this.top - this.height, this.top)};
    }
  }

  function svg(name, attributes = {}, parent = null) {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (parent) parent.append(element);
    return element;
  }

  // An SVG path along the circle of `radius` around `center` (screen units),
  // counterclockwise on screen from angle `from` to angle `to` (radians,
  // measured as in the complex plane). Sweeps of a full turn or more are
  // split, since one SVG arc cannot draw them.
  function arcPath(center, radius, from, to) {
    const point = angle => `${center.x + radius * Math.cos(angle)} ${center.y - radius * Math.sin(angle)}`;
    let path = `M ${point(from)}`;
    for (let start = from; start < to - 1e-9; start += Math.PI) {
      const end = Math.min(to, start + Math.PI);
      path += ` A ${radius} ${radius} 0 0 0 ${point(end)}`;
    }
    return path;
  }

  // A whole number as subscript digits: 12 → "₁₂".
  function subscript(n) {
    return String(n).replace(/\d/g, digit => '₀₁₂₃₄₅₆₇₈₉'[digit]);
  }

  // Draws text labels for points of a drawing. `items` are {x, y, text,
  // className} in drawing units, most important first. Labels of the same
  // point are joined ("z² + c = z₂") in the first one's class; each sits a
  // little beyond its point, away from `center`. A label that would stick out
  // of the drawing goes to the other side of its point, and is moved inside if
  // it still does not fit.
  function placeLabels(layer, items, center, distance = 20) {
    const groups = [];
    for (const item of items) {
      const group = groups.find(other => Math.hypot(other.x - item.x, other.y - item.y) < 3);
      if (group) group.texts.push(item.text);
      else groups.push({...item, texts: [item.text]});
    }
    for (const {x, y, className, texts} of groups) {
      const length = Math.hypot(x - center.x, y - center.y);
      const dx = length > 1 ? (x - center.x) / length : .7;
      const dy = length > 1 ? (y - center.y) / length : -.7;
      const label = svg('text', {class: className}, layer);
      label.textContent = texts.join(' = ');
      const put = (sx, sy) => {
        label.setAttribute('x', x + sx * dx * distance);
        label.setAttribute('y', y + sy * dy * distance + 6);
        label.setAttribute('text-anchor', sx * dx < -.3 ? 'end' : sx * dx > .3 ? 'start' : 'middle');
      };
      put(1, 1);
      const out = overflow(label);
      if (out.x || out.y) put(out.x ? -1 : 1, out.y ? -1 : 1);
      const still = overflow(label);
      if (still.x) label.setAttribute('x', Number(label.getAttribute('x')) + still.x);
      if (still.y) label.setAttribute('y', Number(label.getAttribute('y')) + still.y);
    }
  }

  // How far a text element must move to lie within its drawing's viewBox,
  // with a small margin. It must be displayed to be measured, which setUp
  // ensures; otherwise nothing is moved.
  function overflow(text, margin = 4) {
    const view = text.ownerSVGElement?.viewBox.baseVal;
    const box = text.getBBox();
    if (!view || !view.width || !box.width) return {x: 0, y: 0};
    const shift = (low, size, start, length) =>
      Math.max(0, start + margin - low) - Math.max(0, low + size - (start + length - margin));
    return {x: shift(box.x, box.width, view.x, view.width), y: shift(box.y, box.height, view.y, view.height)};
  }

  // Lets the pointer drag an SVG element. `onDrag` receives the pointer
  // position in the drawing's own units, for as long as the button is held.
  function makeDraggable(handle, drawing, onDrag) {
    handle.addEventListener('pointerdown', event => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        const point = new DOMPoint(moveEvent.clientX, moveEvent.clientY)
          .matrixTransform(drawing.getScreenCTM().inverse());
        onDrag(point.x, point.y);
      };
      const stop = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', stop);
        handle.removeEventListener('pointercancel', stop);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
      move(event);
    });
  }

  // --- Angles in turns, under doubling θ ↦ 2θ mod 1 ---------------------------

  // The doubling orbit of p/q (reduced, 0 ≤ p < q): the numerators p·2ⁿ mod q
  // until one repeats, the binary digits, the preperiod and the period. The
  // numerators are also the remainders of the long division that gives the
  // binary digits, so orbit and digits share their preperiod and period.
  function doublingOrbit(p, q) {
    const numerators = [];
    const digits = [];
    const seen = new Map();
    let r = p;
    while (!seen.has(r)) {
      seen.set(r, numerators.length);
      numerators.push(r);
      r *= 2;
      digits.push(r >= q ? 1 : 0);
      r %= q;
    }
    const preperiod = seen.get(r);
    return {numerators, digits, preperiod, period: numerators.length - preperiod};
  }

  // "0.0(01)₂": the digits before the repeating block, then the block.
  function binary(digits, preperiod) {
    return `0.${digits.slice(0, preperiod).join('')}(${digits.slice(preperiod).join('')})₂`;
  }

  // --- Escape-time pictures (the explorer and the orbit figures) -------------

  // The chapters' escape test: once |z| > max(2, |c|), the orbit of
  // z ↦ z² + c grows without bound, so crossing this radius proves escape.
  function escapeRadius(c) {
    return Math.max(2, Math.hypot(c.re, c.im));
  }

  // --- Orbits and what can be said about them ------------------------------

  const ORBIT_STEPS = 1000;   // steps computed for a verdict
  const MAX_PERIOD = 64;
  const TOLERANCE = 1e-9;
  const distance = (a, b) => Math.hypot(a.re - b.re, a.im - b.im);

  // The orbit of z0 under z ↦ z² + c, followed until it crosses the escape
  // radius or for ORBIT_STEPS steps: {points, radius} plus escapedAt (the
  // step that crossed the radius), or period, start and exact (a cycle the
  // end of the orbit repeats within TOLERANCE, the step where that run of
  // repetitions begins, and whether the repetition is exact).
  function orbitOf(c, z0) {
    const radius = escapeRadius(c);
    const points = [z0];
    if (complex.abs(z0) > radius) return {points, radius, escapedAt: 0};
    let z = z0;
    for (let n = 1; n <= ORBIT_STEPS; n++) {
      z = complex.add(complex.multiply(z, z), c);
      points.push(z);
      if (complex.abs(z) > radius) return {points, radius, escapedAt: n};
    }
    const last = points.length - 1;
    for (let period = 1; period <= MAX_PERIOD; period++) {
      if (distance(points[last], points[last - period]) >= TOLERANCE) continue;
      let start = last - period;
      while (start > 0 && distance(points[start - 1], points[start - 1 + period]) < TOLERANCE) start--;
      const exact = points[start].re === points[start + period].re && points[start].im === points[start + period].im;
      return {points, radius, period, start, exact};
    }
    return {points, radius};
  }

  // The verdict on an orbit, in the chapters' terms: crossing the escape
  // radius proves escape; an exact repetition is exact; an approach within
  // the tolerance is numerical evidence; anything else stays undecided.
  function describeOrbit(result) {
    const {points, radius, escapedAt, period, start, exact} = result;
    if (escapedAt !== undefined) {
      const size = formatNumber(complex.abs(points[escapedAt]), 3);
      return `The orbit escapes: |z${subscript(escapedAt)}| = ${size} exceeds R = max(2, |c|) = `
        + `${formatNumber(radius, 3)}, and beyond that radius every step increases |z|. This proves escape.`;
    }
    if (period !== undefined) {
      const cycle = period === 1 ? 'a fixed point' : `a cycle of period ${period}`;
      if (exact) {
        return `The computed orbit reaches ${cycle} at step ${start} and repeats it exactly: `
          + `z${subscript(start)} = z${subscript(start + period)}.`;
      }
      return `The orbit settles into ${cycle}: from step ${start} on, z<sub>n</sub> and z<sub>n+${period}</sub> agree `
        + `to within 10<sup>−9</sup> for the rest of ${ORBIT_STEPS} steps. This is numerical evidence of an `
        + 'attracting cycle, not a proof.';
    }
    return `After ${ORBIT_STEPS} steps the orbit has neither escaped nor settled into a cycle of period up to `
      + `${MAX_PERIOD}. A finite computation cannot decide what it does in the long run.`;
  }

  // Samples that did not escape are dark; escaping samples cycle through this
  // palette by their smoothed escape time (the last colour equals the first).
  const INTERIOR = [9, 19, 32];
  const PALETTE = [[13, 26, 45], [27, 75, 119], [30, 135, 151], [227, 232, 196], [236, 166, 100], [13, 26, 45]];
  const ROWS_PER_TASK = 12;  // the rows of a picture that one background thread computes at a time

  // The iteration budget for a window of the parameter plane `width` wide: 300
  // steps for the whole set (3.2 wide), 150 more for each halving of the width,
  // at most 6000. The zoom viewer and the tour's pictures use it.
  const iterationBudget = width => Math.round(Math.min(6000, 300 + 150 * Math.max(0, Math.log2(3.2 / width))));

  // The pixel size for a picture designed at width × height pixels and shown in `element`: one
  // pixel of the picture for each pixel of the screen, so that the browser need not resample it.
  // (Resampled by a factor close to 1, a picture is crisp in some places and blurred in bands
  // between them.) Where that would be more than twice the design width, or 1.25 times it for a
  // picture shown narrower than its design, as on a phone, the picture gets one pixel for each
  // k × k pixels of the screen instead, for the smallest k = 2, 3, … that is enough; `blocks` is k.
  function pictureSize(element, width, height) {
    const shown = element.getBoundingClientRect().width;
    if (!shown) return {width, height, blocks: 1};
    const screen = shown * (window.devicePixelRatio || 1);
    const limit = (shown > width ? 2 : 1.25) * width;
    let blocks = 1;
    while (screen / blocks > limit) blocks++;
    const pixels = Math.max(1, Math.round(screen / blocks));
    return {width: pixels, height: Math.max(1, Math.round(pixels * height / width)), blocks};
  }

  // Whether a canvas designed at width × height pixels has the size pictureSize chooses for it.
  function fitsScreen(canvas, width, height) {
    const size = pictureSize(canvas, width, height);
    return canvas.width === size.width && canvas.height === size.height;
  }

  // Gives a canvas, designed at width × height pixels, the size pictureSize chooses for it where it
  // is shown, with blocks of k × k screen pixels drawn without smoothing; returns whether its size
  // changed, which clears it.
  function fitCanvas(canvas, width, height) {
    const size = pictureSize(canvas, width, height);
    canvas.style.imageRendering = size.blocks > 1 ? 'pixelated' : '';
    if (canvas.width === size.width && canvas.height === size.height) return false;
    canvas.width = size.width;
    canvas.height = size.height;
    return true;
  }

  // Calls `callback` once the window has stopped changing its size or its zoom for a moment, so
  // that a figure can draw its pictures again at the size that now fits (see fitsScreen).
  const resizeCallbacks = [];
  let resizeTimer = null;
  function whenResized(callback) {
    if (!resizeCallbacks.length) {
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => resizeCallbacks.forEach(call => call()), 300);
      });
    }
    resizeCallbacks.push(callback);
  }

  // Calls `then` once, when `element` first comes within 300 pixels of the screen, or at once
  // without an IntersectionObserver, so that pictures far down a page are computed only if read.
  function whenNear(element, then) {
    if (!('IntersectionObserver' in window)) {
      then();
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      then();
    }, {rootMargin: '300px'});
    observer.observe(element);
  }

  // Parameters inside the main cardioid or the period-two disk belong to the
  // Mandelbrot set; testing this exactly saves iterating them to the budget.
  function inCardioidOrPeriodTwoDisk(x, y) {
    const q = (x - .25) ** 2 + y * y;
    return q * (q + x - .25) < .25 * y * y || (x + 1) ** 2 + y * y < .0625;
  }

  // Colours one pixel. `steps` is the escape step, or null if the sample did
  // not escape; `size` is |z|² at that point, and `degree` the degree of the
  // map, the base of the logarithm in the fractional count.
  function paint(data, offset, steps, size, degree = 2) {
    if (steps === null) {
      data[offset] = INTERIOR[0];
      data[offset + 1] = INTERIOR[1];
      data[offset + 2] = INTERIOR[2];
    } else {
      // Fractional escape count n + 1 − log_d log |z|, mapped cyclically onto
      // the palette with a smooth blend between neighbouring colours.
      const logSize = Math.max(1e-20, Math.log(Math.sqrt(size)));
      const smooth = steps + 1 - (degree === 2 ? Math.log2(logSize) : Math.log(logSize) / Math.log(degree));
      const position = (Math.max(0, smooth) * .038 % 1) * 5;
      const index = Math.min(4, Math.floor(position));
      let blend = position - index;
      blend = blend * blend * (3 - 2 * blend);
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = PALETTE[index][channel] * (1 - blend) + PALETTE[index + 1][channel] * blend;
      }
    }
    data[offset + 3] = 255;
  }

  // --- Background threads ----------------------------------------------------

  const MAX_WORKERS = 16;
  let workersRunning = 0;

  // Runs work(task) for each task on the page itself, one task per animation
  // frame so that the page stays responsive, while isCurrent() holds; resolves
  // to whether all tasks were done.
  async function workOnPage(work, tasks, isCurrent, onResult) {
    for (const task of tasks) {
      if (!isCurrent()) return false;
      onResult(task, work(task));
      await new Promise(requestAnimationFrame);
    }
    return isCurrent();
  }

  // A pool of background threads (Web Workers), one per processor thread up
  // to MAX_WORKERS, that run work(task) for queued tasks: a picture split into
  // strips of rows is computed on all processor cores at once. The workers run
  // the source text of `work`, of the `helpers` it calls and of the
  // `constants` it reads, from a Blob URL, because browsers refuse worker
  // scripts from files on file://. Tasks and results are copied between the
  // threads, except the typed arrays of a result, which are moved. The workers
  // start at the first run; if they cannot start, or one fails, the tasks run
  // on the page instead.
  //
  // pool.run(tasks, isCurrent, onResult) calls onResult(task, result) for each
  // task as it is done, in any order, and resolves to true when all are done,
  // or to false once isCurrent() is found false; the remaining tasks are then
  // dropped. With {parallel: false} the tasks run on the page.
  function workerPool(work, {helpers = [], constants = {}} = {}) {
    const source = [
      "'use strict';",
      ...Object.entries(constants).map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`),
      ...[...helpers, work].map(String),
      `onmessage = event => {
        const result = ${work.name}(event.data);
        const parts = ArrayBuffer.isView(result) ? [result] : Object.values(result);
        postMessage(result, parts.filter(part => ArrayBuffer.isView(part)).map(part => part.buffer));
      };`,
    ].join('\n');
    let workers = null;          // started at the first run; empty while the page does the work
    const idle = [];
    const running = new Map();   // worker → {task, job}
    const queue = [];            // {task, job} waiting for a worker

    function settle(job, done) {
      if (job.settled) return;
      job.settled = true;
      job.resolve(done);
    }

    // Whether the job's results are still wanted; if not, it is settled as dropped.
    function wanted(job) {
      if (!job.settled && !job.isCurrent()) settle(job, false);
      return !job.settled;
    }

    function dispatch() {
      while (idle.length && queue.length) {
        const entry = queue.shift();
        if (!wanted(entry.job)) continue;
        const worker = idle.pop();
        running.set(worker, entry);
        worker.postMessage(entry.task);
      }
    }

    function finish(worker, result) {
      const entry = running.get(worker);
      if (!entry) return;
      running.delete(worker);
      idle.push(worker);
      if (wanted(entry.job)) {
        entry.job.onResult(entry.task, result);
        if (--entry.job.remaining === 0) settle(entry.job, true);
      }
      dispatch();
    }

    // Stops the workers and does their unfinished tasks on the page.
    function fail() {
      for (const worker of workers) worker.terminate();
      workersRunning -= workers.length;
      workers = [];
      idle.length = 0;
      const unfinished = new Map();  // job → its tasks not yet done
      for (const {task, job} of [...running.values(), ...queue]) {
        if (!job.settled) unfinished.set(job, [...(unfinished.get(job) || []), task]);
      }
      running.clear();
      queue.length = 0;
      for (const [job, tasks] of unfinished) {
        workOnPage(work, tasks, job.isCurrent, job.onResult).then(done => settle(job, done));
      }
    }

    function start() {
      workers = [];
      try {
        const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
        const count = Math.min(MAX_WORKERS, navigator.hardwareConcurrency || 4);
        for (let k = 0; k < count; k++) {
          const worker = new Worker(url);
          worker.onmessage = event => finish(worker, event.data);
          worker.onerror = () => {
            if (workers.includes(worker)) fail();
          };
          workers.push(worker);
          idle.push(worker);
          workersRunning++;
        }
      } catch (error) {
        fail();
      }
    }

    return {
      run(tasks, isCurrent, onResult, {parallel = true} = {}) {
        if (parallel && !workers) start();
        if (!parallel || !workers.length) return workOnPage(work, tasks, isCurrent, onResult);
        return new Promise(resolve => {
          const job = {isCurrent, onResult, resolve, remaining: tasks.length, settled: false};
          if (!tasks.length) settle(job, isCurrent());
          for (const task of tasks) queue.push({task, job});
          dispatch();
        });
      },
    };
  }

  // --- Escape-time pictures, computed in strips ------------------------------

  // Rows firstRow … firstRow + rows − 1 of an escape-time picture of width ×
  // height pixels, as RGBA bytes; see renderEscapeTime. Runs in a worker.
  function escapeTimeRows({view, juliaParameter, budget, repeats, width, height, firstRow, rows}) {
    const pixels = new Uint8ClampedArray(width * rows * 4);
    const radius = juliaParameter ? Math.max(2, Math.hypot(juliaParameter.re, juliaParameter.im) + 1) : 2;
    const limit = radius * radius;
    for (let y = firstRow; y < firstRow + rows; y++) {
      for (let x = 0; x < width; x++) {
        const re = view.left + (x + .5) * view.width / width;
        const im = view.top - (y + .5) * view.height / height;
        let zx = juliaParameter ? re : 0;
        let zy = juliaParameter ? im : 0;
        const cx = juliaParameter ? juliaParameter.re : re;
        const cy = juliaParameter ? juliaParameter.im : im;
        let n = !juliaParameter && inCardioidOrPeriodTwoDisk(cx, cy) ? budget : 0;
        let keptX = zx;
        let keptY = zy;
        let keepAt = 8;
        for (; n < budget; n++) {
          if (zx * zx + zy * zy > limit) break;
          const next = zx * zx - zy * zy + cx;
          zy = 2 * zx * zy + cy;
          zx = next;
          if (repeats) {
            if (zx === keptX && zy === keptY) {
              n = budget;
              break;
            }
            if (n === keepAt) {
              keptX = zx;
              keptY = zy;
              keepAt *= 2;
            }
          }
        }
        const size = zx * zx + zy * zy;
        paint(pixels, ((y - firstRow) * width + x) * 4, size > limit ? n : null, size);
      }
    }
    return pixels;
  }

  // Draws the escape-time image of one plane into a canvas context. Without a
  // Julia parameter each pixel is a parameter c and the orbit starts at 0
  // (the parameter plane); with one, each pixel is a starting point z for that
  // fixed c (the dynamical plane). Every pixel is sampled at its centre. The
  // sampling radius, max(2, |c| + 1), is generous; any radius of at least
  // escapeRadius(c) would do. The picture is computed in strips of
  // ROWS_PER_TASK rows by the background threads, or on the page with
  // {parallel: false}, and drawn when complete; returns the image, or null if
  // isCurrent() turned false on the way.
  //
  // With {repeats: true}, a sample whose orbit comes back exactly to an
  // earlier value (checked against values kept at steps 8, 16, 32, …) stops
  // early: an orbit that repeats exactly is periodic and never escapes, so
  // the picture is the same, only faster where many samples do not escape.
  async function renderEscapeTime(context, view, juliaParameter, budget, isCurrent,
    {repeats = false, parallel = true} = {}) {
    const {width, height} = context.canvas;
    const image = context.createImageData(width, height);
    const tasks = [];
    for (let firstRow = 0; firstRow < height; firstRow += ROWS_PER_TASK) {
      tasks.push({
        view: {left: view.left, top: view.top, width: view.width, height: view.height},
        juliaParameter, budget, repeats, width, height, firstRow, rows: Math.min(ROWS_PER_TASK, height - firstRow),
      });
    }
    const done = await picturePool.run(tasks, isCurrent,
      (task, pixels) => image.data.set(pixels, task.firstRow * width * 4), {parallel});
    if (!done || !isCurrent()) return null;
    context.putImageData(image, 0, 0);
    return image;
  }

  // --- Colorings that use the whole orbit (the render modes, the zoom viewer) ---
  //
  // One pass follows every pixel's orbit once, with its derivative, until |z|
  // exceeds the escape radius R or the budget is used up, and keeps per pixel
  // the escape step n, log|z_n|, the sign of Im z_n, |z'_n|, the stripe
  // average, the orbit's closest approach to the axes and the steps spent.
  // The colorings only color these numbers differently:
  //   escape    bands by the escape step n
  //   smooth    the smooth count ν = n + 1 − log₂ log|z_n|
  //   binary    the sign of Im z_n: the n-th binary digit of the external angle
  //   distance  the distance estimate b = 2|z_n| log|z_n| / |z'_n|, with
  //             pixels where b is below the pixel size drawn as the set
  //             (below data.thickness times the pixel size, if it is set)
  //   stripe    Härkönen's stripe average: the mean of ½ sin(s·arg z_k) + ½
  //             over z_1 … z_n, interpolated between the means up to z_(n−1)
  //             and z_n by the fractional part of the smooth count
  //   trap      an orbit trap: the orbit's closest approach to the real and
  //             imaginary axes, Pickover's cross, on a logarithmic scale
  //   work      the steps each pixel cost, with the cardioid and period-two
  //             tests (in the parameter plane) and exact periodicity checking

  const COLORINGS = [
    ['escape', 'Escape time'],
    ['smooth', 'Smooth count'],
    ['binary', 'Binary decomposition'],
    ['distance', 'Distance estimate'],
    ['stripe', 'Stripe average'],
    ['trap', 'Orbit trap'],
    ['work', 'Work per pixel'],
  ];
  const STRIPE_DENSITY = 5;  // s, an integer: other values make the stripes jump where arg z does
  const TRAP_RANGE = 4;      // the trap's color runs over distances 1 to 10⁻⁴
  const ORBIT_ROWS_PER_TASK = 16;
  const CREAM = [244, 236, 214];  // the two colors of binary decomposition
  const NIGHT = [20, 42, 72];

  // The stripe addend ½ sin(s·arg z) + ½ of one orbit point, as ½ Im((z/|z|)^s) + ½: s
  // multiplications cost less than atan2 and sin at every step of every pixel.
  function stripeAddend(x, y) {
    const r = Math.sqrt(x * x + y * y);
    const ux = x / r, uy = y / r;
    let px = ux, py = uy;
    for (let k = 1; k < STRIPE_DENSITY; k++) {
      const next = px * ux - py * uy;
      py = px * uy + py * ux;
      px = next;
    }
    return .5 * py + .5;
  }

  // Härkönen's interpolation between the stripe means S_(n−1) and S_n, from the sum of the
  // addends of z_1 … z_n, the last of them, and the fractional part d of the smooth count.
  function stripeAverage(sum, last, n, radius, logSize) {
    const full = sum / n;
    const before = n > 1 ? (sum - last) / (n - 1) : full;
    const d = Math.min(1, Math.max(0, 1 + Math.log2(Math.log(radius) / logSize)));
    return d * full + (1 - d) * before;
  }

  // The pass over rows firstRow … firstRow + rows − 1 of a picture of width × height pixels over
  // `view`, with escape radius `radius`: per pixel the numbers listed above, in typed arrays.
  // Without a Julia parameter each pixel is a parameter c, the orbit starts at 0 and the
  // derivative is taken with respect to c; with one, each pixel is a starting point z_0 for that
  // c, and the derivative is taken with respect to z_0. Of the derivative, the stripe average and
  // the trap, only those named in `has` are computed: the stripe addend alone costs about four
  // plain steps. Runs in a worker.
  function orbitRows({view, julia, budget, radius, has, width, height, firstRow, rows}) {
    const size = width * rows;
    const limit = radius * radius;
    const strip = {
      steps: new Int32Array(size),      // escape step, or −1 if the orbit did not escape
      logSize: new Float64Array(size),  // log|z_n| at escape
      upper: new Uint8Array(size),      // 1 if Im z_n > 0 at escape
      derivative: new Float64Array(size),
      stripe: new Float32Array(size),   // the stripe average, from 0 to 1
      trap: new Float32Array(size),     // the orbit's closest approach to the axes
      spent: new Int32Array(size),      // steps computed, with the shortcuts
      shortcut: new Uint8Array(size),   // 1 if a shortcut decided the pixel
    };
    for (let row = firstRow; row < firstRow + rows; row++) {
      const y = view.top - (row + .5) * view.height / height;
      for (let col = 0; col < width; col++) {
        const x = view.left + (col + .5) * view.width / width;
        const index = (row - firstRow) * width + col;
        strip.steps[index] = -1;
        if (!julia && inCardioidOrPeriodTwoDisk(x, y)) {
          strip.shortcut[index] = 1;
          continue;
        }
        const cx = julia ? julia.re : x, cy = julia ? julia.im : y;
        let zx = julia ? x : 0, zy = julia ? y : 0;
        let dx = julia ? 1 : 0, dy = 0;
        const added = julia ? 0 : 1;  // d(z² + c)/dc adds 1; d(z² + c)/dz_0 does not
        let keptX = zx, keptY = zy, keepAt = 8;
        let n = 0;
        let escaped = false;
        let stripeSum = 0, addend = 0, nearest = Infinity;
        while (n < budget) {
          if (has.derivative) {
            const ndx = 2 * (zx * dx - zy * dy) + added;
            dy = 2 * (zx * dy + zy * dx);
            dx = ndx;
          }
          const nx = zx * zx - zy * zy + cx;
          zy = 2 * zx * zy + cy;
          zx = nx;
          n++;
          if (has.stripe) {
            addend = stripeAddend(zx, zy);
            stripeSum += addend;
          }
          if (has.trap) nearest = Math.min(nearest, Math.abs(zx), Math.abs(zy));
          if (zx * zx + zy * zy > limit) {
            escaped = true;
            break;
          }
          if (zx === keptX && zy === keptY) {
            strip.shortcut[index] = 1;  // an exact repeat: the orbit never escapes
            break;
          }
          if (n === keepAt) {
            keptX = zx;
            keptY = zy;
            keepAt *= 2;
          }
        }
        strip.spent[index] = n;
        if (!escaped) continue;
        strip.steps[index] = n;
        strip.logSize[index] = .5 * Math.log(zx * zx + zy * zy);
        strip.upper[index] = zy > 0 ? 1 : 0;
        if (has.derivative) strip.derivative[index] = Math.sqrt(dx * dx + dy * dy);
        if (has.stripe) strip.stripe[index] = stripeAverage(stripeSum, addend, n, radius, strip.logSize[index]);
        if (has.trap) strip.trap[index] = nearest;
      }
    }
    return strip;
  }

  // A strip of either kind of picture, by the task's kind: one pool of background threads computes
  // the escape-time pictures and the orbit passes, so that a page with both starts one thread per
  // processor thread, not two.
  function pictureRows(task) {
    return task.kind === 'orbits' ? orbitRows(task) : escapeTimeRows(task);
  }

  const picturePool = workerPool(pictureRows, {
    helpers: [escapeTimeRows, orbitRows, inCardioidOrPeriodTwoDisk, paint, stripeAddend, stripeAverage],
    constants: {INTERIOR, PALETTE, STRIPE_DENSITY},
  });

  // The numbers beyond the escape step that each coloring needs; the others need none.
  const EXTRA = {distance: 'derivative', stripe: 'stripe', trap: 'trap'};

  // Which of the derivative, the stripe average and the trap a pass computes for `coloring`, or
  // for every coloring if it is null.
  const numbersFor = coloring => Object.fromEntries(Object.values(EXTRA)
    .map(name => [name, coloring === null || EXTRA[coloring] === name]));

  // Whether a pass that computed the numbers `has` can be painted in `coloring`.
  const canPaint = (has, coloring) => !EXTRA[coloring] || has[EXTRA[coloring]];

  // The pass over a whole picture of width × height pixels, computed in strips of
  // ORBIT_ROWS_PER_TASK rows on the background threads. With {coloring} it computes only what
  // that coloring needs, otherwise what every coloring needs; data.has records which.
  // onStrip(data) is called as strips arrive, which they do in any order; data.rows counts the
  // rows above the first one still missing. Resolves to the data, with the seconds it took, or to
  // null once isCurrent() is false.
  async function orbitPass(view, julia, budget, radius, width, height, isCurrent,
    {coloring = null, onStrip = () => {}} = {}) {
    const has = numbersFor(coloring);
    const size = width * height;
    const data = {
      view: {left: view.left, top: view.top, width: view.width, height: view.height},
      julia, budget, radius, has, width, height, rows: 0,
      steps: new Int32Array(size), logSize: new Float64Array(size), upper: new Uint8Array(size),
      derivative: new Float64Array(size), stripe: new Float32Array(size), trap: new Float32Array(size),
      spent: new Int32Array(size), shortcut: new Uint8Array(size),
    };
    const tasks = [];
    for (let firstRow = 0; firstRow < height; firstRow += ORBIT_ROWS_PER_TASK) {
      tasks.push({kind: 'orbits', view: data.view, julia, budget, radius, has, width, height, firstRow,
        rows: Math.min(ORBIT_ROWS_PER_TASK, height - firstRow)});
    }
    const arrived = new Set();
    const started = performance.now();
    const done = await picturePool.run(tasks, isCurrent, (task, strip) => {
      for (const [key, values] of Object.entries(strip)) data[key].set(values, task.firstRow * width);
      arrived.add(task.firstRow);
      while (arrived.has(data.rows)) data.rows = Math.min(height, data.rows + ORBIT_ROWS_PER_TASK);
      onStrip(data);
    });
    if (!done || !isCurrent()) return null;
    data.seconds = (performance.now() - started) / 1000;
    return data;
  }

  // A cyclic position (any real number) as a palette color.
  function cyclic(position) {
    const t = ((position % 1) + 1) % 1 * 5;
    const index = Math.min(4, Math.floor(t));
    let blend = t - index;
    blend = blend * blend * (3 - 2 * blend);
    return PALETTE[index].map((value, k) => value * (1 - blend) + PALETTE[index + 1][k] * blend);
  }

  // The color of pixel `index` of a pass in one of the COLORINGS.
  function orbitColor(data, index, coloring) {
    const n = data.steps[index];
    if (coloring === 'work') {
      const t = Math.log1p(data.spent[index]) / Math.log1p(data.budget);
      return t === 0 ? INTERIOR : cyclic(.62 * t);
    }
    if (n < 0) return INTERIOR;
    switch (coloring) {
      case 'escape':
        return cyclic(n * .05);
      case 'smooth': {
        const smooth = n + 1 - Math.log2(Math.max(1e-300, data.logSize[index]));
        return cyclic(smooth * .05);
      }
      case 'binary':
        return data.upper[index] ? CREAM : NIGHT;
      case 'stripe': {
        // Stretched over the values in the picture: deep in, the stripes span a narrow range.
        const [low, high] = data.stripeRange;
        return cyclic(.62 * Math.min(1, Math.max(0, (data.stripe[index] - low) / (high - low))));
      }
      case 'trap': {
        const t = Math.min(1, Math.max(0, -Math.log10(data.trap[index]) / TRAP_RANGE));
        return cyclic(.62 * t);
      }
      default: {  // distance
        const b = 2 * Math.exp(data.logSize[index]) * data.logSize[index] / data.derivative[index];
        const pixel = data.view.width / data.width;
        if (b < pixel * (data.thickness || 1)) return CREAM;
        const t = Math.max(0, Math.min(1, Math.log(b / pixel) / Math.log(400)));
        return [13 + 40 * t, 26 + 90 * t, 45 + 110 * t];
      }
    }
  }

  // The 1st and 99th percentiles of the stripe averages computed so far, from every 7th pixel.
  function stripeRange(data) {
    const values = [];
    for (let index = 0; index < data.rows * data.width; index += 7) {
      if (data.steps[index] >= 0) values.push(data.stripe[index]);
    }
    if (values.length < 2) return [0, 1];
    values.sort((a, b) => a - b);
    const low = values[Math.floor(.01 * (values.length - 1))], high = values[Math.ceil(.99 * (values.length - 1))];
    return high > low ? [low, high] : [0, 1];
  }

  // Draws the rows of a pass computed so far into a canvas context of the pass's size, in one of
  // the COLORINGS; the rows still missing stay transparent.
  function paintOrbits(context, data, coloring) {
    if (coloring === 'stripe') data.stripeRange = stripeRange(data);
    const image = context.createImageData(data.width, data.height);
    for (let index = 0; index < data.rows * data.width; index++) {
      const [r, g, b] = orbitColor(data, index, coloring);
      image.data[4 * index] = r;
      image.data[4 * index + 1] = g;
      image.data[4 * index + 2] = b;
      image.data[4 * index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  // What a status line adds to the name of a coloring: its fixed settings.
  function coloringDetail(coloring) {
    if (coloring === 'stripe') return ` · stripe density <var>s</var> = ${STRIPE_DENSITY}`;
    if (coloring === 'trap') return ' · trap: the real and imaginary axes';
    return '';
  }

  // For the work coloring: the steps a finished pass took, compared with the steps it would
  // have taken without its shortcuts.
  function workSummary(data) {
    let spent = 0, without = 0;
    for (let index = 0; index < data.width * data.height; index++) {
      spent += data.spent[index];
      without += data.steps[index] < 0 ? data.budget : data.steps[index];
    }
    const shortcuts = data.julia ? 'the periodicity check'
      : 'the cardioid and period-two tests and the periodicity check';
    const ratio = formatNumber(without / Math.max(1, spent), without < 10 * spent ? 2 : 1);
    if (ratio === '1') {
      return `The picture took ${spent.toLocaleString('en')} steps; ${shortcuts} saved `
        + `${without === spent ? 'none' : 'almost none'} of them here.`;
    }
    return `The picture took ${spent.toLocaleString('en')} steps; without ${shortcuts} it would have taken `
      + `${without.toLocaleString('en')}, ${ratio} times as many.`;
  }

  // The Mandelbrot set as a mask of width × height pixels over `view`: white
  // and opaque where the orbit of 0 has not escaped within `budget` steps,
  // transparent elsewhere. Drawn at once; meant for small silhouettes that a
  // figure colours itself (for example as an SVG mask).
  function mandelbrotMask(view, width, height, budget) {
    const image = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cx = view.left + (x + .5) * view.width / width;
        const cy = view.top - (y + .5) * view.height / height;
        let inside = inCardioidOrPeriodTwoDisk(cx, cy);
        if (!inside) {
          let zx = 0;
          let zy = 0;
          let n = 0;
          while (n < budget && zx * zx + zy * zy <= 4) {
            const next = zx * zx - zy * zy + cx;
            zy = 2 * zx * zy + cy;
            zx = next;
            n++;
          }
          inside = zx * zx + zy * zy <= 4;
        }
        if (inside) image.data.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4);
      }
    }
    return image;
  }

  let instances = 0;

  // Builds every figure with data-widget="name". `build` receives the figure
  // and a prefix that keeps its ids unique on the page. The figure is revealed
  // first, so that its drawings can be measured while they are built (nothing
  // is painted before the build ends), and hidden again if the build fails.
  function setUp(name, build) {
    for (const figure of document.querySelectorAll(`[data-widget="${name}"]`)) {
      figure.hidden = false;
      try {
        build(figure, `${name}-${++instances}`);
      } catch (error) {
        figure.hidden = true;
        throw error;
      }
    }
  }

  window.AtlasKit = {
    complex, format, formatNumber, formatAngle, subscript, Plane, svg, arcPath, placeLabels,
    makeDraggable, setUp, escapeRadius, renderEscapeTime, mandelbrotMask, orbitOf, describeOrbit,
    doublingOrbit, binary, iterationBudget, pictureSize, fitsScreen, fitCanvas, whenResized, whenNear, paint,
    workerPool,
    inCardioidOrPeriodTwoDisk,
    COLORINGS, STRIPE_DENSITY, stripeAddend, stripeAverage, numbersFor, canPaint, orbitPass, paintOrbits,
    coloringDetail, workSummary,
    workerCount: () => workersRunning,
  };
})();
