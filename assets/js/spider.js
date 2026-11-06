/* Interactive figure: the spider algorithm, one step at a time.

   For a rational angle θ the spider has one leg for each angle of its orbit
   under doubling, θ, 2θ, 4θ, …: a curve that comes in from infinity at that
   angle and ends at a foot. The first spider has straight legs that end on
   the unit circle. Each step replaces every leg by the preimage of the next
   one under z ↦ z² + c, with c the foot of the leg at θ (AtlasKit.spiderStep,
   shared with the angle explorer). The feet settle on the critical orbit of
   the map that θ names; the filled Julia set of that map then appears behind
   the spider (Hubbard and Schleicher).

   Built by AtlasKit.setUp for every <figure data-widget="spider">;
   data-angle chooses the first angle (a fraction such as 1/7). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const SIZE = 440;
  const VIEW = {left: -2.2, top: 2.2, width: 4.4, height: 4.4};
  const MAX_DENOMINATOR = 100000;
  const MAX_LEGS = 12;
  const POINTS = 200;          // points per leg
  const SETTLED = 1e-3;        // the feet count as settled once no foot moves farther in a step
  const MAX_STEPS = 400;       // the figure stops here if they have not
  const LABEL_RADIUS = 1.75;   // where the legs are named by their angles
  const BUDGET = 300;          // steps for the filled Julia set
  const PRESETS = ['1/3', '1/7', '3/7', '1/6', '1/4', '9/56'];
  const PAUSE = 500;           // milliseconds between the first steps while playing
  const FAST = 120;            // and between the later ones
  const SLOW_STEPS = 8;

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const reduced = (n, q) => (n === 0 ? '0' : `${n / gcd(n, q)}/${q / gcd(n, q)}`);
  const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const asComplex = ([re, im]) => ({re, im});

  // "3/7" → {p: 3, q: 7}, reduced modulo 1; null unless it is a fraction strictly between 0 and 1 (mod 1).
  function parseAngle(text) {
    const match = /^\s*(\d{1,15})\s*\/\s*(\d{1,6})\s*$/.exec(text);
    if (!match) return null;
    const q = Number(match[2]);
    if (!q || q > MAX_DENOMINATOR) return null;
    const p = Number(match[1]) % q;
    if (p === 0) return null;
    const d = gcd(p, q);
    return {p: p / d, q: q / d};
  }

  // A small positive number in words: 0.0123 → "0.0123", 2.4 × 10⁻⁶.
  function small(x) {
    if (x === 0) return '0';
    const exponent = Math.floor(Math.log10(x));
    return exponent >= -3 ? formatNumber(x, 4) : `${formatNumber(x / 10 ** exponent, 1)} × 10<sup>−${-exponent}</sup>`;
  }

  // The filled Julia set of z² + c as a mask: opaque where the orbit stays within radius 1000 for BUDGET
  // steps, or where the distance estimate |z| log |z| / |z′| puts the point within two pixels of the
  // Julia set, so that a Julia set without interior (a dendrite) shows as well; thinner lines would fade
  // where the mask is scaled.
  function juliaMask([cx, cy], plane) {
    const image = new ImageData(SIZE, SIZE);
    const pixel = 1 / plane.scale;
    const near = 2 * pixel;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let zx = VIEW.left + (x + .5) * pixel;
        let zy = VIEW.top - (y + .5) * pixel;
        let dx = 1;
        let dy = 0;
        let n = 0;
        let size = 0;
        for (; n < BUDGET; n++) {
          [dx, dy] = [2 * (zx * dx - zy * dy), 2 * (zx * dy + zy * dx)];
          [zx, zy] = [zx * zx - zy * zy + cx, 2 * zx * zy + cy];
          size = zx * zx + zy * zy;
          if (size > 1e6) break;
        }
        const inside = n === BUDGET || Math.sqrt(size) * Math.log(Math.sqrt(size)) < near * Math.hypot(dx, dy);
        if (inside) image.data.fill(255, (y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4);
      }
    }
    return image;
  }

  kit.setUp('spider', (figure, id) => {
    const plane = new kit.Plane(VIEW, SIZE, SIZE);
    const state = {angle: null, run: null, legs: null, shown: 0, timer: null, masked: null};
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- controls ------------------------------------------------------------

    const angleRow = element('div', 'widget-controls');
    const field = element('label', 'widget-point');
    field.append(element('var', null, 'θ'), ' = ');
    const input = element('input', 'angle-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'Angle as a fraction of a turn, such as 1/7');
    input.addEventListener('change', () => choose(input.value));
    field.append(input);
    const presets = element('div', 'widget-angles');
    for (const preset of PRESETS) {
      const button = element('button', 'widget-button widget-button-quiet', preset);
      button.type = 'button';
      button.addEventListener('click', () => {
        input.value = preset;
        choose(preset);
      });
      presets.append(button);
    }
    angleRow.append(field, presets);

    const playRow = element('div', 'widget-controls');
    const stepButton = element('button', 'widget-button', 'Step');
    stepButton.type = 'button';
    stepButton.addEventListener('click', () => {
      stop();
      show(state.shown + 1);
    });
    const playButton = element('button', 'widget-button', 'Play');
    playButton.type = 'button';
    playButton.addEventListener('click', () => (state.timer ? stop() : play()));
    const resetButton = element('button', 'widget-button widget-button-quiet', 'Start again');
    resetButton.type = 'button';
    resetButton.addEventListener('click', () => {
      stop();
      show(0);
    });
    playRow.append(stepButton, playButton, resetButton);

    // --- drawing -------------------------------------------------------------

    const drawing = kit.svg('svg', {viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'widget-plane spider-plane',
      'aria-hidden': 'true'});
    const defs = kit.svg('defs', {}, drawing);
    const mask = kit.svg('mask', {id: `${id}-julia`}, defs);
    const maskImage = kit.svg('image', {width: SIZE, height: SIZE}, mask);
    const julia = kit.svg('rect', {width: SIZE, height: SIZE, class: 'spider-julia', mask: `url(#${id}-julia)`},
      drawing);
    const origin = plane.toScreen({re: 0, im: 0});
    kit.svg('circle', {cx: origin.x, cy: origin.y, r: plane.scale, class: 'spider-unit'}, drawing);
    const layer = kit.svg('g', {}, drawing);

    const readout = element('div', 'widget-readout');
    const setup = element('p');
    const step = element('p');
    step.setAttribute('aria-live', 'polite');
    readout.append(setup, step);

    const toScreen = ([re, im]) => plane.toScreen({re, im});
    const pathOf = points => points.map((point, i) => {
      const {x, y} = toScreen(point);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join('');

    function draw() {
      layer.replaceChildren();
      const {angles, names, trail} = state.run;
      const legs = state.legs;
      // The path of the guess for c so far.
      if (state.shown > 0) {
        kit.svg('path', {d: pathOf(trail.slice(0, state.shown + 1)), class: 'spider-trail'}, layer);
      }
      const labels = [];
      legs.forEach((leg, j) => {
        // From the foot out to just beyond the drawing.
        const end = leg.findIndex(([x, y]) => Math.hypot(x, y) > 3.2);
        const visible = leg.slice(0, end < 0 ? leg.length : end + 1);
        const kind = j === 0 ? 'spider-first' : 'spider-other';
        kit.svg('path', {d: pathOf(visible), class: `spider-leg ${kind}`}, layer);
        // The name of the leg where it crosses the circle of LABEL_RADIUS on its way in.
        let k = visible.length - 1;
        while (k > 0 && Math.hypot(...visible[k - 1]) > LABEL_RADIUS) k--;
        if (k > 0 || Math.hypot(...visible[0]) > LABEL_RADIUS) {
          labels.push({...toScreen(visible[k]), text: names[j], className: `plane-label spider-label ${kind}`});
        }
      });
      legs.forEach((leg, j) => {
        const {x, y} = toScreen(leg[0]);
        kit.svg('circle', {cx: x, cy: y, r: j === 0 ? 6 : 4.5,
          class: `spider-foot ${j === 0 ? 'spider-first' : 'spider-other'}`}, layer);
      });
      const foot = toScreen(legs[0][0]);
      kit.placeLabels(layer, [{...foot, text: 'c', className: 'plane-label spider-c'}, ...labels],
        {x: SIZE / 2, y: SIZE / 2}, 14);
    }

    function describeSetup() {
      const {p, q} = state.angle;
      const {names, preperiod, period} = state.run;
      const count = names.length;
      const list = count === 2 ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')} and ${names[count - 1]}`;
      const kind = preperiod === 0 ? `has period ${period}` : `is strictly preperiodic (preperiod ${preperiod}, period ${period})`;
      const back = preperiod === 0 ? 'the first' : `the leg at ${names[preperiod]}`;
      setup.innerHTML = `<var>θ</var> = ${p}/${q} ${kind}, so the spider has ${count} legs, at ${list}. `
        + `Doubling takes each angle to the next and the last back to ${names[preperiod]}, so each step replaces `
        + `each leg by the preimage of the next one, and the last by the preimage of ${back}.`;
    }

    function describeStep() {
      const {run} = state;
      const k = state.shown;
      const c = asComplex(state.legs[0][0]);
      let text;
      if (k === 0) {
        text = 'Step 0: straight legs come in at their angles and end on the unit circle, so the first guess for '
          + `<var>c</var>, the foot of the leg at <var>θ</var>, is ${format(c, 4)}. Press Step or Play to pull the legs back.`;
      } else {
        text = `Step ${k}: the guess for <var>c</var> is ${format(c, 4)}; the feet moved by at most `
          + `${small(run.moves[k - 1])}.`;
      }
      if (k === run.steps && run.settled) {
        const exact = format(asComplex(run.final), 10);
        text += ` They have settled, moving by less than a tenth of a pixel. Run on, the spider gives <var>c</var> ≈ ${exact}`;
        if (run.preperiod === 0) {
          text += `, the center of the component of period ${run.period} at whose root the ray at ${run.names[0]} lands: `
            + `there 0 is periodic. Behind the spider, its filled Julia set: the feet sit on the critical orbit, the last `
            + 'one at 0, and the legs come in along the rays at their angles, which land on the boundaries of the Fatou '
            + 'components around the feet, and run on inside them along internal rays.';
        } else {
          text += `, the Misiurewicz point where the ray at ${run.names[0]} lands. Behind the spider, its Julia set, `
            + 'drawn a little thicker so that it shows: the feet sit on the critical orbit, and the legs have become the '
            + 'rays at their angles, which land there.';
        }
      } else if (k === run.steps) {
        text += ` After ${MAX_STEPS} steps the feet still move; the figure stops here.`;
      }
      step.innerHTML = text;  // built from numbers and fixed text
    }

    function showJulia() {
      const ready = state.shown === state.run.steps && state.run.settled;
      if (ready && state.masked !== state.run) {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        canvas.getContext('2d').putImageData(juliaMask(state.run.final, plane), 0, 0);
        maskImage.setAttribute('href', canvas.toDataURL('image/png'));
        state.masked = state.run;
      }
      julia.classList.toggle('spider-julia-shown', ready);
      figure.dataset.julia = ready ? 'shown' : 'hidden';
    }

    function show(target) {
      target = Math.max(0, Math.min(target, state.run.steps));
      if (target < state.shown || !state.legs) {
        state.legs = kit.spiderLegs(state.run.angles, POINTS);
        state.shown = 0;
      }
      while (state.shown < target) {
        state.legs = kit.spiderStep(state.legs, state.run.angles, state.run.preperiod);
        state.shown++;
      }
      stepButton.disabled = state.shown >= state.run.steps;
      figure.dataset.step = String(state.shown);
      figure.dataset.c = state.legs[0][0].join(',');
      draw();
      describeStep();
      showJulia();
    }

    function play() {
      if (state.shown >= state.run.steps) show(0);
      if (reducedMotion) {
        show(state.run.steps);
        return;
      }
      playButton.textContent = 'Pause';
      step.setAttribute('aria-live', 'off');  // no announcement for every step
      const tick = () => {
        show(state.shown + 1);
        if (state.shown >= state.run.steps) stop();
        else state.timer = setTimeout(tick, state.shown < SLOW_STEPS ? PAUSE : FAST);
      };
      state.timer = setTimeout(tick, PAUSE);
    }

    function stop() {
      clearTimeout(state.timer);
      state.timer = null;
      playButton.textContent = 'Play';
      step.setAttribute('aria-live', 'polite');
    }

    // Runs the spider once ahead: how far the feet move in each step, the path of c, the step at which
    // the feet have settled, and the parameter, run on until it stops changing.
    function runSpider(angle) {
      const {numerators, preperiod, period} = kit.doublingOrbit(angle.p, angle.q);
      const angles = numerators.map(n => n / angle.q);
      const names = numerators.map(n => reduced(n, angle.q));
      let legs = kit.spiderLegs(angles, POINTS);
      const moves = [];
      const trail = [legs[0][0]];
      let steps = 0;
      let settled = false;
      while (!settled && steps < MAX_STEPS) {
        const next = kit.spiderStep(legs, angles, preperiod);
        moves.push(Math.max(...next.map((leg, j) => apart(leg[0], legs[j][0]))));
        legs = next;
        trail.push(legs[0][0]);
        steps++;
        settled = moves[steps - 1] < SETTLED;
      }
      for (let more = 0; settled && more < 2000; more++) {
        const next = kit.spiderStep(legs, angles, preperiod);
        const moved = apart(next[0][0], legs[0][0]);
        legs = next;
        if (moved < 1e-15) break;
      }
      return {angles, names, preperiod, period, moves, trail, steps, settled, final: legs[0][0]};
    }

    function choose(text) {
      const angle = parseAngle(text);
      const legs = angle && kit.doublingOrbit(angle.p, angle.q).numerators.length;
      input.classList.toggle('angle-invalid', !angle || legs > MAX_LEGS);
      if (!angle) {
        step.textContent = 'Type a fraction strictly between 0 and 1, such as 1/7, with a denominator up to 100,000.';
        return;
      }
      if (legs > MAX_LEGS) {
        step.textContent = `The orbit of ${angle.p}/${angle.q} under doubling has ${legs} angles; the spider here has at `
          + `most ${MAX_LEGS} legs.`;
        return;
      }
      stop();
      state.angle = angle;
      state.run = runSpider(angle);
      state.legs = null;
      figure.dataset.shown = `${angle.p}/${angle.q}`;
      figure.dataset.settled = String(state.run.steps);
      figure.dataset.final = state.run.final.join(',');
      describeSetup();
      show(0);
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [angleRow, playRow, drawing, readout]) figure.insertBefore(part, caption);
    input.value = figure.dataset.angle || '1/7';
    if (!parseAngle(input.value)) input.value = '1/7';
    choose(input.value);
  });
})();
