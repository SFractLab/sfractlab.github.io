/* Interactive figures of the deep-zoom chapter.

   deep-digits     One pixel near a minibrot of period 998, at width 2.5·10⁻¹⁵, iterated with
                   P-bit fixed-point numbers (BigInt) and with 340 bits as the truth. The
                   plot shows the error in z, which grows until the computed orbit is lost, and
                   the same error measured in pixels of c (divided by dz/dc), which stays small:
                   the computed orbit is the exact orbit of a slightly moved parameter.
   deep-rebasing   One pixel followed by perturbation around a reference orbit, step by step, in
                   the z-plane: the reference value Z_m, the pixel's value z = Z_m + δ, and the
                   circle of radius |δ| around 0. With rebasing the pixel restarts the reference
                   when it lies inside that circle; without, the readout counts the bits of δ
                   that cancel. Everything is in doubles, at a depth they can still resolve.
   deep-period     The ball method and Newton's method on the Mandelbrot set: a disk around a
                   chosen point, the first step at which its image covers 0 (the period), Newton's
                   steps to the nucleus, and the minibrot outlined from the size estimate.

   Built by AtlasKit.setUp for every <figure data-widget="deep-digits">, "deep-rebasing" and
   "deep-period". None of them takes options. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const SUPERSCRIPT = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
  // A positive number in the chapter's style: 0.42, 37, or 2.1·10⁻⁷.
  function scientific(x) {
    if (x === 0) return '0';
    let exponent = Math.floor(Math.log10(Math.abs(x)));
    if (exponent >= -2 && exponent < 5) return formatNumber(x, exponent < 0 ? 3 : 2);
    if (Math.round(x / 10 ** exponent * 10) >= 100) exponent++;  // 9.97 rounds to 10: write 1·10^(e+1)
    const mantissa = formatNumber(x / 10 ** exponent, 1);
    const power = `10${String(exponent).replace(/[-\d]/g, ch => SUPERSCRIPT[ch])}`;
    return mantissa === '1' ? power : `${mantissa}·${power}`;
  }
  const whole = n => n.toLocaleString('en-US');

  // A row of two radio buttons styled as a switch (.widget-modes).
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

  function button(text, onClick, quiet = true) {
    const node = element('button', quiet ? 'widget-button widget-button-quiet' : 'widget-button', text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  // ===========================================================================
  // deep-digits: the error in z and the error in pixels of c
  // ===========================================================================

  // The pixel: 8 pixel widths right of and 9 above a point near the minibrot of period 998, in a
  // picture 48 pixels wide of width 2.5·10⁻¹⁵ (window A of the research notes).
  const DIGITS = {
    re: '-0.743643887037158704752191506114774', im: '0.131825904205311970493132056385139',
    width: 2.5e-15, pixels: 48, offset: [8, 9], truthBits: 340, budget: 30000,
  };
  const SPACING = DIGITS.width / DIGITS.pixels;
  const NEEDED = Math.round(Math.log2(1 / SPACING));  // bits that tell neighboring pixels apart: 54
  const PLOT = {width: 720, height: 300, left: 54, right: 12, top: 14, bottom: 42, low: -80, high: 8};

  // A decimal string as a fixed-point BigInt with `bits` binary digits after the point.
  function fixed(text, bits) {
    const negative = text.startsWith('-');
    const [integer, fraction = ''] = text.replace(/^[-+]/, '').split('.');
    const value = (BigInt(integer + fraction) << BigInt(bits)) / 10n ** BigInt(fraction.length);
    return negative ? -value : value;
  }
  // Round a fixed-point number to fewer binary digits.
  const reduce = (value, from, to) => (value + (1n << BigInt(from - to - 1))) >> BigInt(from - to);

  // The orbit of 0 for c = (cr, ci), given with `bits` fractional bits; every product is rounded
  // to that many bits. Returns the values, as BigInts with that scale, up to escape or the budget.
  function fixedOrbit(cr, ci, bits, budget) {
    const shift = BigInt(bits);
    const half = 1n << (shift - 1n);
    const four = 4n << (2n * shift);
    const xs = [0n], ys = [0n];
    let x = 0n, y = 0n;
    for (let n = 0; n < budget; n++) {
      const xx = x * x, yy = y * y;
      if (xx + yy > four) break;
      const xy = x * y;
      x = ((xx - yy + half) >> shift) + cr;
      y = ((2n * xy + half) >> shift) + ci;
      xs.push(x);
      ys.push(y);
    }
    return {xs, ys};
  }

  function digitsData(extra) {
    const T = DIGITS.truthBits;
    const [di, dj] = DIGITS.offset;
    // The pixel at the truth's precision: the offset is exact at 2⁻⁶⁰, far below the spacing.
    const step = BigInt(Math.round(SPACING * 2 ** 60)) << BigInt(T - 60);
    const cr = fixed(DIGITS.re, T) + BigInt(di) * step;
    const ci = fixed(DIGITS.im, T) + BigInt(dj) * step;
    const truth = fixedOrbit(cr, ci, T, DIGITS.budget);
    const P = NEEDED + extra;
    const low = fixedOrbit(reduce(cr, T, P), reduce(ci, T, P), P, DIGITS.budget);
    const end = Math.min(truth.xs.length, low.xs.length) - 1;
    const unit = 2 ** -T;
    const lift = BigInt(T - P);
    // log₂ of the error in z and of the same error in pixels of c, per step; the derivative
    // D = dz/dc of the true orbit is iterated in doubles.
    const inZ = [], inPixels = [];
    let dr = 0, dImag = 0, worstPixels = -Infinity, lostAt = null;
    for (let n = 1; n <= end; n++) {
      const zr = Number(truth.xs[n - 1]) * unit, zi = Number(truth.ys[n - 1]) * unit;
      [dr, dImag] = [2 * (zr * dr - zi * dImag) + 1, 2 * (zr * dImag + zi * dr)];
      const er = Number((low.xs[n] << lift) - truth.xs[n]) * unit;
      const ei = Number((low.ys[n] << lift) - truth.ys[n]) * unit;
      const error = Math.hypot(er, ei);
      if (error === 0) continue;
      const a = Math.log2(error);
      const b = Math.log2(error / (Math.hypot(dr, dImag) * SPACING));
      inZ.push([n, a]);
      inPixels.push([n, b]);
      worstPixels = Math.max(worstPixels, b);
      if (lostAt === null && a > -1) lostAt = n;
    }
    return {P, extra, inZ, inPixels, worstPixels, lostAt, end,
      steps: {truth: truth.xs.length - 1, low: low.xs.length - 1, budget: DIGITS.budget}};
  }

  kit.setUp('deep-digits', (figure) => {
    const state = {extra: 8};
    const controls = element('div', 'widget-controls');
    const label = element('label', 'widget-point deep-range');
    const slider = element('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '24';
    slider.step = '1';
    slider.value = String(state.extra);
    slider.setAttribute('aria-label', 'Extra bits beyond those that tell neighboring pixels apart');
    const shown = element('span', 'deep-range-value');
    label.append('Extra bits ', slider, shown);
    controls.append(label);

    const {width: W, height: H, left: L, right: R, top: TOP, bottom: B, low: LOW, high: HIGH} = PLOT;
    const drawing = kit.svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'widget-plane deep-plot', 'aria-hidden': 'true'});
    const toY = v => TOP + (HIGH - Math.max(LOW, Math.min(HIGH, v))) / (HIGH - LOW) * (H - TOP - B);
    const grid = kit.svg('g', {class: 'plane-grid'}, drawing);
    for (let v = LOW; v <= HIGH; v += 8) {
      kit.svg('line', {x1: L, y1: toY(v), x2: W - R, y2: toY(v), class: v === 0 ? 'plane-axis' : ''}, grid);
      kit.svg('text', {x: L - 6, y: toY(v) + 5, 'text-anchor': 'end', class: 'plane-tick'}, drawing).textContent =
        v === 0 ? '1' : `2${String(v).replace(/[-\d]/g, ch => SUPERSCRIPT[ch])}`;
    }
    const layer = kit.svg('g', {}, drawing);
    const axisLabel = kit.svg('text', {x: (L + W - R) / 2, y: H - 8, 'text-anchor': 'middle', class: 'plane-tick'}, drawing);
    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    let pending = 0;
    function update() {
      const request = ++pending;
      shown.textContent = ` ${state.extra > 0 ? '+' : state.extra < 0 ? '−' : ''}${Math.abs(state.extra)}`;
      requestAnimationFrame(() => {
        if (request !== pending) return;
        draw(digitsData(state.extra));
      });
    }

    function draw(data) {
      layer.replaceChildren();
      const toX = n => L + n / data.end * (W - L - R);
      // Each curve is drawn through the largest value in each column of the plot.
      const curve = (points, className) => {
        const columns = new Map();
        for (const [n, v] of points) {
          const column = Math.round(toX(n));
          if (!columns.has(column) || columns.get(column) < v) columns.set(column, v);
        }
        const path = [...columns].map(([x, v]) => `${x},${toY(v).toFixed(1)}`).join(' ');
        kit.svg('polyline', {points: path, class: `deep-curve ${className}`}, layer);
      };
      curve(data.inZ, 'plane-w');
      curve(data.inPixels, 'plane-z');
      const legend = [['plane-w', 'error in z'], ['plane-z', 'the same error in pixels of c']];
      legend.forEach(([className, text], k) => {
        const y = toY(-62) + k * 22;
        const x = W - R - 290;
        kit.svg('line', {x1: x, y1: y - 5, x2: x + 26, y2: y - 5, class: `deep-curve ${className}`}, layer);
        kit.svg('text', {x: x + 34, y, class: 'deep-legend'}, layer).textContent = text;
      });
      axisLabel.textContent = `step n of the orbit, 0 to ${whole(data.end)}`;
      figure.dataset.done = String(data.extra);
      figure.dataset.worst = data.worstPixels.toFixed(1);
      const verdict = data.steps.truth === data.steps.low
        ? `Both escape after ${whole(data.steps.truth)} steps.`
        : `The computed orbit escapes after ${whole(data.steps.low)} steps, the true one after ${whole(data.steps.truth)}.`;
      const lost = data.lostAt === null
        ? 'The error in <var>z</var> stays below 1/2 until the orbit escapes.'
        : `The error in <var>z</var> reaches 1/2 at step ${whole(data.lostAt)}: from there the computed orbit has nothing in common with the true one.`;
      const bits = data.extra === 0 ? `exactly the ${NEEDED}` : `${data.extra} more than the ${NEEDED}`;
      readout.innerHTML = `With ${data.P} bits, ${bits} that tell neighboring pixels apart. ${lost} Measured in pixels of <var>c</var>, the error ` +
        `never exceeds 2<sup>${data.worstPixels.toFixed(1).replace('-', '−')}</sup> pixel. ${verdict}`;
    }

    slider.addEventListener('input', () => {
      state.extra = Number(slider.value);
      update();
    });
    const caption = figure.querySelector('figcaption');
    for (const part of [controls, drawing, readout]) figure.insertBefore(part, caption);
    update();
  });

  // ===========================================================================
  // deep-rebasing: one pixel followed by perturbation, step by step
  // ===========================================================================

  // References and pixels in the seahorse valley, where a view 3·10⁻⁶ wide holds a minibrot of
  // period 39 with its bulbs of periods 78 (its period-two disk) and 195 (its 2/5-bulb). The nuclei
  // were found by the ball method and Newton's method.
  const NUCLEUS_78 = [-0.7436441720129633, 0.1318253973950327];
  const EXAMPLES = [
    {key: 'other', name: 'Pixel near another component', reference: NUCLEUS_78,
      pixel: [-0.74364386256482, 0.13182700143882792],
      note: 'The reference is the nucleus of a bulb of period 78, the period-two disk of a minibrot of period 39, stored for one period. The pixel lies next to the nucleus of the same minibrot’s bulb of period 195, so at step 195 it comes very close to 0, while the reference, 39 steps into its third period, does not.'},
    {key: 'escapes', name: 'Reference that escapes', reference: [-0.7436452, 0.131825],
      pixel: NUCLEUS_78,
      note: 'The reference escapes after 404 steps; the pixel is the nucleus of the bulb of period 78, whose orbit never escapes.'},
    {key: 'same', name: 'Pixel in the reference’s component', reference: NUCLEUS_78,
      pixel: [-0.7436441720129633, 0.1318253974950327],
      note: 'Pixel and reference lie in the same bulb of period 78: the pixel’s orbit stays close to the reference, which it restarts once per period.'},
  ];
  const STEPS = 800;  // steps followed
  const Z_SIZE = 360;

  // Perturbation of one pixel around a reference orbit, with or without rebasing. A reference
  // that returns to 0, a nucleus, is stored for one period only: at its end the pixel restarts it
  // (with rebasing) or simply continues from its start, as a periodic reference allows (without).
  function follow(example, rebase) {
    const [rx, ry] = example.reference;
    const Zr = [0], Zi = [0];
    let periodic = false;
    for (let n = 0, x = 0, y = 0; n < STEPS; n++) {
      [x, y] = [x * x - y * y + rx, 2 * x * y + ry];
      Zr.push(x);
      Zi.push(y);
      if (x * x + y * y > 4) break;
      if (Math.hypot(x, y) < 1e-9) {
        periodic = true;
        break;
      }
    }
    const last = Zr.length - 1;
    const dcr = example.pixel[0] - rx, dci = example.pixel[1] - ry;
    const steps = [{n: 0, m: 0, zr: 0, zi: 0, dr: 0, di: 0, event: null}];
    let dr = 0, di = 0, m = 0, end = null;
    for (let n = 1; n <= STEPS; n++) {
      [dr, di] = [2 * (Zr[m] * dr - Zi[m] * di) + dr * dr - di * di + dcr,
        2 * (Zr[m] * di + Zi[m] * dr) + 2 * dr * di + dci];
      m++;
      const zr = Zr[m] + dr, zi = Zi[m] + di;
      const z = Math.hypot(zr, zi), d = Math.hypot(dr, di);
      const step = {n, m, zr, zi, dr, di, Zr: Zr[m], Zi: Zi[m], event: null, bits: z < d ? Math.log2(d / z) : 0};
      steps.push(step);
      if (z > 2) {
        end = {kind: 'escaped', n};
        break;
      }
      if (rebase && (z < d || m === last)) {
        step.event = m === last ? 'end' : 'rebase';
        dr = zr;
        di = zi;
        m = 0;
      } else if (!rebase && m === last) {
        if (!periodic) {
          end = {kind: 'ran out', n};
          break;
        }
        m = 0;
      }
    }
    return {steps, end, periodic, referenceLength: last, reference: {Zr, Zi}};
  }

  kit.setUp('deep-rebasing', (figure, id) => {
    const state = {example: EXAMPLES[0], rebase: false, n: 0, runs: null};

    const controls = element('div', 'widget-controls');
    const pick = element('label', 'widget-point');
    const select = element('select');
    for (const example of EXAMPLES) {
      const option = element('option', null, example.name);
      option.value = example.key;
      select.append(option);
    }
    select.addEventListener('change', () => choose(EXAMPLES.find(e => e.key === select.value)));
    pick.append(select);
    const toggle = modes(`${id}-mode`, [['on', 'With rebasing'], ['off', 'Without']], 'off', value => {
      state.rebase = value === 'on';
      show(state.n);
    });
    controls.append(pick, toggle);

    const stepper = element('div', 'widget-controls');
    const slider = element('input');
    slider.type = 'range';
    slider.min = '0';
    slider.step = '1';
    slider.setAttribute('aria-label', 'Step n of the pixel’s orbit');
    const sliderBox = element('label', 'widget-point deep-range');
    sliderBox.append('Step ', slider);
    slider.addEventListener('input', () => show(Number(slider.value)));
    const back = button('◀', () => show(state.n - 1));
    back.setAttribute('aria-label', 'Previous step');
    const forward = button('▶', () => show(state.n + 1));
    forward.setAttribute('aria-label', 'Next step');
    const next = button('Next passage near 0', () => {
      const run = current();
      const found = run.steps.find(s => s.n > state.n && s.bits > 0);
      if (found) show(found.n);
    });
    stepper.append(sliderBox, back, forward, next);

    const drawing = kit.svg('svg', {viewBox: `0 0 ${Z_SIZE} ${Z_SIZE}`, class: 'widget-plane deep-zplane', 'aria-hidden': 'true'});
    const defs = kit.svg('defs', {}, drawing);
    const marker = kit.svg('marker', {id: `${id}-arrow`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6,
      markerHeight: 6, orient: 'auto-start-reverse', class: 'arrow arrow-z'}, defs);
    kit.svg('path', {d: 'M 0 0 L 10 5 L 0 10 z'}, marker);
    const grid = kit.svg('g', {class: 'plane-grid'}, drawing);
    kit.svg('line', {x1: Z_SIZE / 2, y1: 0, x2: Z_SIZE / 2, y2: Z_SIZE, class: 'plane-axis'}, grid);
    kit.svg('line', {x1: 0, y1: Z_SIZE / 2, x2: Z_SIZE, y2: Z_SIZE / 2, class: 'plane-axis'}, grid);
    const scaleLabel = kit.svg('text', {x: Z_SIZE - 8, y: Z_SIZE - 10, 'text-anchor': 'end', class: 'plane-tick'}, drawing);
    const orbitLayer = kit.svg('g', {class: 'plane-helper'}, drawing);
    const layer = kit.svg('g', {}, drawing);
    const readout = element('div', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    const current = () => state.runs[state.rebase ? 'on' : 'off'];

    function choose(example) {
      state.example = example;
      state.runs = {on: follow(example, true), off: follow(example, false)};
      const first = state.runs.off.steps.find(s => s.bits > 8) || state.runs.on.steps.find(s => s.event);
      show(first ? first.n : 0);
    }

    function show(n) {
      const run = current();
      const last = run.steps.length - 1;
      state.n = Math.max(0, Math.min(n, last));
      slider.max = String(last);
      slider.value = String(state.n);
      const s = run.steps[state.n];
      layer.replaceChildren();
      orbitLayer.replaceChildren();
      // The view: centered on 0, just large enough for Z_m, z and the circle of radius |δ|.
      const half = 1.45 * Math.max(Math.hypot(s.zr, s.zi), Math.hypot(s.Zr ?? 0, s.Zi ?? 0),
        Math.hypot(s.dr, s.di)) || 2;
      const plane = new kit.Plane({left: -half, top: half, width: 2 * half, height: 2 * half}, Z_SIZE, Z_SIZE);
      scaleLabel.textContent = `width ${scientific(2 * half).replace(/<[^>]+>/g, '')}`;
      const {Zr, Zi} = run.reference;
      for (let k = 0; k < Zr.length; k++) {
        if (Math.abs(Zr[k]) > half || Math.abs(Zi[k]) > half) continue;
        const p = plane.toScreen({re: Zr[k], im: Zi[k]});
        kit.svg('circle', {cx: p.x, cy: p.y, r: 1.6, class: 'plane-dot'}, orbitLayer);
      }
      const origin = plane.toScreen({re: 0, im: 0});
      const reference = plane.toScreen({re: s.Zr ?? 0, im: s.Zi ?? 0});
      const pixel = plane.toScreen({re: s.zr, im: s.zi});
      const delta = Math.hypot(s.dr, s.di);
      const z = Math.hypot(s.zr, s.zi);
      kit.svg('circle', {cx: origin.x, cy: origin.y, r: Math.min(delta * plane.scale, 2 * Z_SIZE),
        class: `deep-delta-circle${z < delta ? ' deep-inside' : ''}`}, layer);
      if (Math.hypot(pixel.x - reference.x, pixel.y - reference.y) > 6) {
        kit.svg('line', {x1: reference.x, y1: reference.y, x2: pixel.x, y2: pixel.y, class: 'plane-vector plane-z',
          'marker-end': `url(#${id}-arrow)`}, layer);
      }
      kit.svg('circle', {cx: reference.x, cy: reference.y, r: 5.5, class: 'plane-dot plane-helper'}, layer);
      kit.svg('circle', {cx: pixel.x, cy: pixel.y, r: 5.5, class: 'plane-dot plane-w'}, layer);
      kit.placeLabels(layer, [
        {...reference, text: `Z${kit.subscript(s.m)}`, className: 'plane-label plane-helper'},
        {...pixel, text: `z${kit.subscript(s.n)}`, className: 'plane-label plane-w'},
      ], origin, 16);
      figure.dataset.step = String(state.n);
      readout.innerHTML = describe(run, s);
    }

    function describe(run, s) {
      const parts = [`<p>${state.example.note}</p>`];
      if (s.n === 0) {
        parts.push('<p>Step 0: the pixel and the reference both start at <var>z</var> = 0, with δ = 0.</p>');
        return parts.join('');
      }
      const z = Math.hypot(s.zr, s.zi), delta = Math.hypot(s.dr, s.di);
      let text = `Step ${whole(s.n)}, reference step <var>m</var> = ${whole(s.m)}: |<var>z</var>| = ${scientific(z)}, |δ| = ${scientific(delta)}. `;
      if (s.event) {
        text += s.event === 'rebase'
          ? 'The pixel is closer to 0 than δ is long, so it rebases: δ ← <var>z</var> and <var>m</var> ← 0.'
          : `The stored reference${run.periodic ? ', one period long,' : ''} ends here, so the pixel restarts it: δ ← <var>z</var> and <var>m</var> ← 0.`;
        const other = state.runs.off.steps[s.n];
        if (other && other.bits >= 1) {
          text += ` Without rebasing, about ${formatNumber(Math.min(53, other.bits), 0)} of δ’s 53 bits would cancel at this step.`;
        }
      } else if (s.bits > 0) {
        const bits = Math.min(53, s.bits);
        text += `The pixel is ${scientific(delta / z)} times closer to 0 than δ is long: <var>z</var> = <var>Z</var> + δ is the ` +
          `difference of nearly equal numbers, and about ${formatNumber(bits, 0)} of δ’s 53 bits cancel.`;
      } else {
        text += 'The pixel is farther from 0 than δ is long: no digits are lost.';
      }
      parts.push(`<p>${text}</p>`);
      if (run.end && s.n === run.steps.length - 1) {
        parts.push(run.end.kind === 'escaped'
          ? `<p>The pixel escapes at step ${whole(run.end.n)}.</p>`
          : `<p>The reference escaped after ${whole(run.referenceLength)} steps; without rebasing the pixel has nothing left to follow.</p>`);
      }
      const rebases = run.steps.filter(x => x.event).length;
      if (state.rebase) parts.push(`<p>Rebases and restarts in the first ${whole(run.steps.length - 1)} steps: ${whole(rebases)}.</p>`);
      return parts.join('');
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, stepper, drawing, readout]) figure.insertBefore(part, caption);
    choose(state.example);
  });

  // ===========================================================================
  // deep-period: the ball method, Newton's method and the size estimate
  // ===========================================================================

  // [key, name, center re, center im, width, starting point of the disk, its radius / width]
  const VIEWS = [
    ['whole', 'The whole set', -0.65, 0, 3.2, [-1.76, 0], .06],
    ['seahorse', 'Seahorse valley', -0.7445, 0.115, 0.05, [-0.7445, 0.115], .03],
    ['antenna', 'Near the antenna', -1.775, 0, 0.08, [-1.7565, .0015], .06],
  ];
  const P_WIDTH = 360, P_HEIGHT = 270;
  const P_MASK_SCALE = 2;  // the silhouette is computed at twice the drawing's resolution
  const PERIOD_LIMIT = 20000;
  const NEWTON_LIMIT = 50;

  // The first n at which the disk of radius r around c0, carried by c ↦ z_n(c), covers 0 (to first
  // order: |z_n| < r·|dz_n/dc|).
  function ballPeriod(cr, ci, r) {
    let x = 0, y = 0, dx = 0, dy = 0;
    for (let n = 1; n <= PERIOD_LIMIT; n++) {
      [dx, dy] = [2 * (x * dx - y * dy) + 1, 2 * (x * dy + y * dx)];
      [x, y] = [x * x - y * y + cr, 2 * x * y + ci];
      if (x * x + y * y > 4) return {escaped: n};
      if (Math.hypot(x, y) < r * Math.hypot(dx, dy)) return {period: n};
    }
    return {};
  }

  // Newton's method for z_p(c) = 0. It has converged when its last step is at the level of
  // rounding (relative 10⁻¹⁴; runs that are still searching after 50 steps move by 10⁻⁶ or
  // more, or overflow).
  function newton(cr, ci, p) {
    const path = [[cr, ci]];
    let step = Infinity;
    for (let k = 0; k < NEWTON_LIMIT; k++) {
      let x = 0, y = 0, dx = 0, dy = 0;
      for (let n = 0; n < p; n++) {
        [dx, dy] = [2 * (x * dx - y * dy) + 1, 2 * (x * dy + y * dx)];
        [x, y] = [x * x - y * y + cr, 2 * x * y + ci];
      }
      const den = dx * dx + dy * dy;
      if (!(den > 0)) break;
      const sr = (x * dx + y * dy) / den, si = (y * dx - x * dy) / den;
      cr -= sr;
      ci -= si;
      if (!Number.isFinite(cr) || !Number.isFinite(ci)) break;
      path.push([cr, ci]);
      step = Math.hypot(sr, si) / Math.max(1, Math.hypot(cr, ci));
      if (step <= 1e-16) break;
    }
    return step <= 1e-14 ? {path, nucleus: [cr, ci]} : {path};
  }

  // The period of a nucleus that solves z_p = 0: the least divisor d of p at which c also solves
  // z_d = 0, to the precision of a Newton step.
  function exactPeriod([cr, ci], p) {
    let x = 0, y = 0, dx = 0, dy = 0;
    for (let n = 1; n < p; n++) {
      [dx, dy] = [2 * (x * dx - y * dy) + 1, 2 * (x * dy + y * dx)];
      [x, y] = [x * x - y * y + cr, 2 * x * y + ci];
      if (p % n === 0 && Math.hypot(x, y) <= 1e-14 * Math.max(1, Math.hypot(cr, ci)) * Math.hypot(dx, dy)) return n;
    }
    return p;
  }

  // The size estimate at a nucleus of period p: λ_k = 2z₁·2z₂⋯2z_k, β = 1 + Σ 1/λ_k (k < p),
  // and the copy is M scaled by 1/(βλ²) with λ = λ_(p−1).
  function sizeEstimate([cr, ci], p) {
    let x = 0, y = 0, lr = 1, li = 0, br = 1, bi = 0;
    for (let n = 1; n < p; n++) {
      [x, y] = [x * x - y * y + cr, 2 * x * y + ci];
      [lr, li] = [2 * (x * lr - y * li), 2 * (x * li + y * lr)];
      const den = lr * lr + li * li;
      br += lr / den;
      bi -= li / den;
    }
    const [l2r, l2i] = [lr * lr - li * li, 2 * lr * li];
    const [qr, qi] = [br * l2r - bi * l2i, br * l2i + bi * l2r];
    const den = qr * qr + qi * qi;
    return [qr / den, -qi / den];
  }

  // Whether the component of the nucleus is a small copy of M (primitive) rather than a bulb
  // (satellite). If it were a copy c* + s·C, the nucleus of period 2p near c* − s would lie near
  // C = −1, the center of the copy's period-two disk; for a bulb it lands elsewhere (near −0.6).
  function isCopy(nucleus, scale, p) {
    const [sr, si] = scale;
    const twice = newton(nucleus[0] - sr, nucleus[1] - si, 2 * p);
    if (!twice.nucleus) return false;
    const [ar, ai] = [twice.nucleus[0] - nucleus[0], twice.nucleus[1] - nucleus[1]];
    const den = sr * sr + si * si;
    const [Cr, Ci] = [(ar * sr + ai * si) / den, (ai * sr - ar * si) / den];
    return Math.hypot(Cr + 1, Ci) < .25;
  }

  // A nucleus with 12 decimals; an imaginary part that is rounding noise is dropped.
  function nucleusText(re, im) {
    const real = formatNumber(re, 12);
    if (Math.abs(im) < 1e-12) return real;
    return `${real}${im < 0 ? ' − ' : ' + '}${formatNumber(Math.abs(im), 12)}<var>i</var>`;
  }

  // The main cardioid and the period-two disk of M, as outlines in M's own coordinates.
  const OUTLINE = [
    Array.from({length: 121}, (_, k) => {
      const t = 2 * Math.PI * k / 120;
      return [Math.cos(t) / 2 - Math.cos(2 * t) / 4, Math.sin(t) / 2 - Math.sin(2 * t) / 4];
    }),
    Array.from({length: 61}, (_, k) => {
      const t = 2 * Math.PI * k / 60;
      return [-1 + Math.cos(t) / 4, Math.sin(t) / 4];
    }),
  ];

  kit.setUp('deep-period', (figure, id) => {
    const state = {view: null, c0: null, fraction: .06, result: null};

    const controls = element('div', 'widget-controls');
    const pick = element('label', 'widget-point');
    const select = element('select');
    for (const [key, name] of VIEWS) {
      const option = element('option', null, name);
      option.value = key;
      select.append(option);
    }
    pick.append(select);
    const radius = element('input');
    radius.type = 'range';
    radius.min = '1';
    radius.max = '25';
    radius.step = '1';
    radius.value = String(state.fraction * 100);
    radius.setAttribute('aria-label', 'Radius of the disk, in hundredths of the view’s width');
    const radiusBox = element('label', 'widget-point deep-range');
    radiusBox.append('Disk ', radius);
    const zoom = button('Zoom to the minibrot', () => zoomIn(), false);
    controls.append(pick, radiusBox, zoom);

    const drawing = kit.svg('svg', {viewBox: `0 0 ${P_WIDTH} ${P_HEIGHT}`, class: 'widget-plane deep-cplane', 'aria-hidden': 'true'});
    const defs = kit.svg('defs', {}, drawing);
    const mask = kit.svg('mask', {id: `${id}-silhouette`}, defs);
    const maskImage = kit.svg('image', {width: P_WIDTH, height: P_HEIGHT}, mask);
    kit.svg('rect', {width: P_WIDTH, height: P_HEIGHT, class: 'multiplier-silhouette', mask: `url(#${id}-silhouette)`}, drawing);
    const layer = kit.svg('g', {}, drawing);
    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');
    const canvas = document.createElement('canvas');
    canvas.width = P_WIDTH * P_MASK_SCALE;
    canvas.height = P_HEIGHT * P_MASK_SCALE;
    const plane = () => new kit.Plane(state.view, P_WIDTH, P_HEIGHT);

    function setView(center, width) {
      state.view = {left: center[0] - width / 2, top: center[1] + width * P_HEIGHT / P_WIDTH / 2,
        width, height: width * P_HEIGHT / P_WIDTH};
      const budget = Math.min(kit.iterationBudget(width), 4000);
      state.mask = kit.mandelbrotMask(state.view, canvas.width, canvas.height, budget);
      canvas.getContext('2d').putImageData(state.mask, 0, 0);
      maskImage.setAttribute('href', canvas.toDataURL('image/png'));
    }

    function compute() {
      const [cr, ci] = state.c0;
      const r = state.fraction * state.view.width;
      const ball = ballPeriod(cr, ci, r);
      const result = {r, ball};
      if (ball.period) {
        result.newton = newton(cr, ci, ball.period);
        const {nucleus} = result.newton;
        if (nucleus) {
          result.period = exactPeriod(nucleus, ball.period);
          result.scale = sizeEstimate(nucleus, result.period);
          result.outside = Math.hypot(nucleus[0] - cr, nucleus[1] - ci) > r;
          result.copy = isCopy(nucleus, result.scale, result.period);
          result.unseen = unseen(nucleus);
        }
      }
      state.result = result;
      draw();
    }

    // Whether a nucleus in the view lies on a pixel that the silhouette leaves empty: its
    // component is too small to be drawn at this magnification.
    function unseen([re, im]) {
      const {view, mask} = state;
      const x = Math.floor((re - view.left) / view.width * mask.width);
      const y = Math.floor((view.top - im) / view.height * mask.height);
      if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
      return mask.data[(y * mask.width + x) * 4 + 3] === 0;
    }

    function draw() {
      const p = plane();
      const {result} = state;
      layer.replaceChildren();
      const center = p.toScreen({re: state.c0[0], im: state.c0[1]});
      kit.svg('circle', {cx: center.x, cy: center.y, r: result.r * p.scale, class: 'deep-disk'}, layer);
      kit.svg('circle', {cx: center.x, cy: center.y, r: 4, class: 'plane-dot plane-w'}, layer);
      const lines = [];
      if (result.newton) {
        const {path, nucleus} = result.newton;
        const {scale} = result;
        const points = path.map(([re, im]) => p.toScreen({re, im}));
        kit.svg('polyline', {points: points.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '), class: 'deep-newton'}, layer);
        for (const q of points.slice(1)) kit.svg('circle', {cx: q.x, cy: q.y, r: 2.5, class: 'plane-dot plane-z'}, layer);
        if (nucleus && result.copy) {
          for (const outline of OUTLINE) {
            const mapped = outline.map(([a, b]) => p.toScreen({
              re: nucleus[0] + scale[0] * a - scale[1] * b, im: nucleus[1] + scale[0] * b + scale[1] * a}));
            kit.svg('polyline', {points: mapped.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '), class: 'deep-outline'}, layer);
          }
        }
        if (nucleus) {
          const q = p.toScreen({re: nucleus[0], im: nucleus[1]});
          kit.svg('circle', {cx: q.x, cy: q.y, r: 4.5, class: 'plane-dot plane-z'}, layer);
        }
      }
      zoom.disabled = !result.copy;
      figure.dataset.period = String(result.ball.period || 0);
      figure.dataset.found = String(result.period || 0);
      readout.innerHTML = describe(result);
    }

    function describe(result) {
      const {ball} = result;
      if (ball.escaped) {
        return `The orbit of the disk’s center escapes after ${whole(ball.escaped)} steps before the disk’s image ` +
          'covers 0: no minibrot found. Make the disk larger or move it closer to the set.';
      }
      if (!ball.period) return `No period up to ${whole(PERIOD_LIMIT)}: make the disk larger.`;
      const {path, nucleus} = result.newton;
      const sizes = path.slice(1).map(([re, im], k) => Math.hypot(re - path[k][0], im - path[k][1]));
      const steps = sizes.filter(x => x > 0).map(scientific);
      const period = whole(ball.period);
      let text = `Ball period ${period}: at step ${period} the image of the disk first covers 0. `;
      if (!nucleus) {
        return text + `Newton’s method from the disk’s center has not converged after ${NEWTON_LIMIT} steps: it ` +
          'started near a boundary between the regions that lead to different nuclei, which form a fractal ' +
          'pattern. Move the disk a little.';
      }
      const [nr, ni] = nucleus;
      const {scale} = result;
      const size = Math.hypot(scale[0], scale[1]);
      const angle = Math.atan2(scale[1], scale[0]) * 180 / Math.PI;
      text += steps.length === 0
        ? `The disk’s center is the nucleus ${nucleusText(nr, ni)}, to double precision. `
        : `Newton’s method from the disk’s center took ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}, ` +
          `of ${steps.length === 1 ? 'size' : 'sizes'} ${steps.join(', ')}, to the nucleus ${nucleusText(nr, ni)}. `;
      if (result.period < ball.period) {
        text += `Its period is ${whole(result.period)}, a divisor of ${period}: <var>z</var><sub>${period}</sub>(<var>c</var>) ` +
          `= 0 holds at every nucleus whose period divides ${period}. `;
      }
      if (result.outside) {
        text += 'It lies outside the disk: the ball method’s test is only first order, so the component it detects ' +
          'can lie near the disk rather than in it. ';
      }
      text += result.copy
        ? `The size estimate gives a copy of <var>M</var> scaled by ${scientific(size)} and turned by ${formatNumber(angle, 0)}°.`
        : 'This component is a bulb attached to a larger one, not a small copy of <var>M</var>: the size estimate ' +
          'describes copies, so no outline is drawn.';
      if (result.unseen) {
        text += ' At this magnification the component is smaller than a pixel, so the picture shows nothing there' +
          (result.copy ? '; “Zoom to the minibrot” shows it.' : '.');
      }
      return text;
    }

    function zoomIn() {
      const {nucleus} = state.result.newton;
      const {scale} = state.result;
      // M spans about 2.5 across, centered near −0.75 in its own coordinates.
      const size = Math.hypot(scale[0], scale[1]);
      const width = Math.max(1e-12, 3 * 2.5 * size);
      const middle = [nucleus[0] - .75 * scale[0], nucleus[1] - .75 * scale[1]];
      state.c0 = nucleus.slice();
      setView(middle, width);
      compute();
    }

    select.addEventListener('change', () => {
      const [, , re, im, width, start, fraction] = VIEWS.find(([key]) => key === select.value);
      setView([re, im], width);
      state.c0 = start.slice();
      state.fraction = fraction;
      radius.value = String(Math.round(fraction * 100));
      compute();
    });
    radius.addEventListener('input', () => {
      state.fraction = Number(radius.value) / 100;
      compute();
    });
    kit.makeDraggable(drawing, drawing, (x, y) => {
      const c = plane().fromScreen(x, y);
      state.c0 = [c.re, c.im];
      compute();
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, drawing, readout]) figure.insertBefore(part, caption);
    const start = VIEWS.find(([key]) => key === 'antenna');
    select.value = start[0];
    state.c0 = start[5].slice();
    state.fraction = start[6];
    radius.value = String(Math.round(start[6] * 100));
    setView([start[2], start[3]], start[4]);
    compute();
  });
})();
