/* Interactive figure: the straightening series term by term, and why a Cremer point has no disk.

   At c = λ/2 − λ²/4 with λ = e^(2πiθ), the map z² + c is w ↦ λw + w² in w = z − z*, z* = λ/2. The map
   h that straightens it, h(λw) = λh(w) + h(w)², is the series w + b₂w² + b₃w³ + … with
   b_n·(λⁿ − λ) = b₁b_{n−1} + b₂b_{n−2} + … + b_{n−1}b₁. The figure computes b₂ … b_TERMS for each angle and
   draws, over the number n of terms, the largest radius on which none of the first n terms is larger
   than the first, w: the least of |b_k|^(−1/(k−1)) for 2 ≤ k ≤ n. This reach can only go down, and it
   ends at the radius of convergence of h, which is the size of the Siegel disk (its conformal radius),
   or 0 at a Cremer point. For a Siegel angle a dashed line gives that size, |φ(0)| as siegel.js
   computes it from the orbit of 0.

   The divisor λⁿ − λ = λ·(λ^(n−1) − 1) is tiny when n − 1 turns by θ come back near a whole number. The
   angle is kept as an exact fraction of BigInts, from its continued fraction digits, so that δ, the
   distance of (n − 1)θ from the nearest whole number, keeps all its digits even at 10⁻³⁰, and so does
   λ^(n−1) − 1 = 2i·sin(πδ)·e^(iπδ). The Cremer angle's fourth digit, ⌈e^q⌉ for its third denominator
   q ≈ 4·10²⁹, cannot be stored, but it changes nothing before term q + 1: the fraction of the first
   three digits stands in for the angle. The coefficients are kept multiplied by s^(n−1), with s
   changed whenever they grow or shrink too far. Checked in Python, the reach agrees with 60-digit
   arithmetic to 10⁻¹⁵.

   Built by AtlasKit.setUp for every <figure data-widget="small-divisors">; data-example chooses the
   first angle (a key of EXAMPLES). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  const TERMS = 2000;    // the terms of the series computed
  const TAIL = 100;      // the repeated digits after the given ones, fixing θ far beyond double precision
  const AVERAGE = 600;   // the steps averaged for the size of the disk, as in siegel.js
  const WIDTH = 720;
  const HEIGHT = 360;    // the least height; on a phone the drawing grows taller to keep its plot readable
  const TOP = .6;        // the reach at the top of the plot
  // The slider's positions: every n up to 100, then 20 per tenfold up to TERMS; each angle adds the
  // terms that follow its near returns.
  const STEPS = [...Array.from({length: 99}, (_, k) => k + 2),
    ...Array.from({length: 26}, (_, k) => Math.round(10 ** (2 + (k + 1) / 20))), TERMS];

  // ⌈e⁶⁴⌉: the digits of the Cremer angle are a₁ = ⌈e⌉ = 3, a₂ = ⌈e³⌉ = 21 and a₃ = ⌈e⁶⁴⌉, each the
  // next whole number above e to the power of the denominator before (1, 3 and 64).
  const CREMER_DIGIT = 6235149080811616882909238709n;
  // Key, name in the menu, continued fraction digits, and the digit repeated after them (null: none).
  const EXAMPLES = [
    ['cremer', 'A Cremer angle · digits 3, 21, 6.2·10²⁷, …', [3n, 21n, CREMER_DIGIT], null],
    ['golden', 'Golden mean · digits 1, 1, 1, …', [], 1n],
    ['silver', 'Silver mean · digits 2, 2, 2, …', [], 2n],
    ['near-1-3', 'Near 1/3 · digits 2, 1, 30, 1, 1, …', [2n, 1n, 30n], 1n],
    ['near-2-5', 'Near 2/5 · digits 2, 2, 30, 1, 1, …', [2n, 2n, 30n], 1n],
  ];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const SUPERSCRIPT = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
  // A positive number with two significant digits: 0.45, 0.0045, 1.6·10⁻²⁹ or 4·10²⁹.
  function scientific(x) {
    let exponent = Math.floor(Math.log10(x));
    if (exponent >= -3 && exponent < 3) return formatNumber(x, Math.max(2, 1 - exponent));
    if (Math.round(x / 10 ** exponent * 10) >= 100) exponent++;
    return `${formatNumber(x / 10 ** exponent, 1)}·10${String(exponent).replace(/[-\d]/g, ch => SUPERSCRIPT[ch])}`;
  }

  // The fraction p/q with continued fraction digits `digits`: θ = 1/(a₁ + 1/(a₂ + …)).
  function fraction(digits) {
    let [p, previousP, q, previousQ] = [0n, 1n, 1n, 0n];
    for (const a of digits) {
      [p, previousP] = [a * p + previousP, p];
      [q, previousQ] = [a * q + previousQ, q];
    }
    return {p, q};
  }

  // a/b for BigInts 0 ≤ a < b, as a double that keeps its digits however small it is.
  function ratio(a, b) {
    if (a === 0n) return 0;
    const shift = b.toString(2).length - a.toString(2).length + 60;
    return Number((a << BigInt(shift)) / b) * 2 ** -shift;
  }

  // The series for one angle. For every n up to TERMS: δ for n − 1 turns, the size |λⁿ − λ| of the divisor
  // and the reach of the first n terms; and the numbers of turns nearer to a whole number than all fewer.
  function series(digits, repeat) {
    const {p, q} = fraction(repeat === null ? digits : [...digits, ...Array(TAIL).fill(repeat)]);
    const theta = Number(p) / Number(q);
    const [lr, li] = [Math.cos(2 * Math.PI * theta), Math.sin(2 * Math.PI * theta)];
    const re = new Float64Array(TERMS + 1);
    const im = new Float64Array(TERMS + 1);
    re[1] = 1;
    let scale = 1;   // s: re[k] + i·im[k] is b_k·s^(k−1)
    const off = [0, 0];
    const divisor = [0, 0];
    const reach = [Infinity, Infinity];
    const records = [];
    for (let n = 2, best = 1; n <= TERMS; n++) {
      const rest = (BigInt(n - 1) * p) % q;
      const delta = 2n * rest > q ? -ratio(q - rest, q) : ratio(rest, q);
      if (Math.abs(delta) < best) {
        best = Math.abs(delta);
        records.push(n - 1);
      }
      // λⁿ − λ = λ·2i·sin(πδ)·e^(iπδ).
      const sine = Math.sin(Math.PI * delta);
      const [mr, mi] = [-2 * sine * sine, 2 * sine * Math.cos(Math.PI * delta)];
      const [dr, di] = [lr * mr - li * mi, lr * mi + li * mr];
      let sr = 0;
      let si = 0;
      for (let j = 1; 2 * j < n; j++) {
        sr += re[j] * re[n - j] - im[j] * im[n - j];
        si += re[j] * im[n - j] + im[j] * re[n - j];
      }
      sr *= 2;
      si *= 2;
      if (n % 2 === 0) {
        const h = n / 2;
        sr += re[h] * re[h] - im[h] * im[h];
        si += 2 * re[h] * im[h];
      }
      const size = dr * dr + di * di;
      re[n] = scale * (sr * dr + si * di) / size;
      im[n] = scale * (si * dr - sr * di) / size;
      let magnitude = Math.hypot(re[n], im[n]);
      if (magnitude > 1e50 || magnitude < 1e-50) {
        const factor = magnitude ** (-1 / (n - 1));
        for (let k = 2; k <= n; k++) {
          re[k] *= factor ** (k - 1);
          im[k] *= factor ** (k - 1);
        }
        scale *= factor;
        magnitude = Math.hypot(re[n], im[n]);
      }
      off.push(delta);
      divisor.push(2 * Math.abs(sine));
      reach.push(Math.min(reach[n - 1], scale * magnitude ** (-1 / (n - 1))));
    }
    return {p, q, theta, off, divisor, reach, records};
  }

  // The size of the Siegel disk, |φ(0)| as siegel.js computes it: the weighted average of λ^(−k)·(z_k − z*)
  // over the first AVERAGE steps of the orbit of 0, with the weights exp(−1/(t(1 − t))), t = k/AVERAGE.
  function diskSize(theta) {
    const [lr, li] = [Math.cos(2 * Math.PI * theta), Math.sin(2 * Math.PI * theta)];
    const [fr, fi] = [lr / 2, li / 2];
    const [cr, ci] = [fr - (lr * lr - li * li) / 4, fi - lr * li / 2];
    let [x, y, tr, ti, ar, ai, total] = [0, 0, 1, 0, 0, 0, 0];
    for (let k = 0; k < AVERAGE; k++) {
      const w = k === 0 ? 0 : Math.exp(-1 / ((k / AVERAGE) * (1 - k / AVERAGE)));
      total += w;
      ar += w * ((x - fr) * tr - (y - fi) * ti);
      ai += w * ((x - fr) * ti + (y - fi) * tr);
      [tr, ti] = [tr * lr + ti * li, ti * lr - tr * li];   // times 1/λ
      [x, y] = [x * x - y * y + cr, 2 * x * y + ci];
    }
    return Math.hypot(ar, ai) / total;
  }

  const whole = n => n.toLocaleString('en');
  // A long whole number that may break after its commas.
  const breakable = n => n.toLocaleString('en').replace(/,/g, ',<wbr>');

  // --- the figure -------------------------------------------------------------

  kit.setUp('small-divisors', (figure, id) => {
    const first = EXAMPLES.find(([key]) => key === figure.dataset.example) || EXAMPLES[0];
    const state = {example: first, n: TERMS};
    const cache = new Map();

    function computed(example) {
      const [key, , digits, repeat] = example;
      if (!cache.has(key)) {
        const result = series(digits, repeat);
        result.size = repeat === null ? null : diskSize(result.theta);
        // The slider's positions: STEPS and the terms after the near returns.
        result.steps = [...new Set([...STEPS, ...result.records.map(m => m + 1).filter(n => n > 1)])].sort((a, b) => a - b);
        cache.set(key, result);
      }
      return cache.get(key);
    }

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'widget-controls');
    const exampleLabel = element('label', 'widget-point small-divisors-angle', 'Angle θ');
    const select = element('select');
    for (const [key, name] of EXAMPLES) {
      const option = element('option', null, name);
      option.value = key;
      select.append(option);
    }
    select.value = first[0];
    select.addEventListener('change', () => {
      state.example = EXAMPLES.find(([key]) => key === select.value);
      draw();
    });
    exampleLabel.append(select);
    const termsLabel = element('label', 'widget-point small-divisors-terms', 'Terms');
    const slider = element('input');
    slider.type = 'range';
    slider.min = '0';
    slider.step = '1';
    slider.id = `${id}-terms`;
    const shown = element('output');
    shown.htmlFor = slider.id;
    slider.addEventListener('input', () => {
      state.n = computed(state.example).steps[Number(slider.value)];
      draw();
    });
    termsLabel.append(slider, shown);
    const buttons = element('div', 'small-divisors-buttons');
    for (const [text, label, by] of [['◀', 'One term fewer', -1], ['▶', 'One term more', 1]]) {
      const node = element('button', 'widget-button widget-button-quiet', text);
      node.type = 'button';
      node.setAttribute('aria-label', label);
      node.addEventListener('click', () => {
        state.n = Math.min(TERMS, Math.max(2, state.n + by));
        draw();
      });
      buttons.append(node);
    }
    controls.append(exampleLabel, termsLabel, buttons);

    // --- the plot --------------------------------------------------------------

    const drawing = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'widget-plane small-divisors-plot'});
    drawing.setAttribute('role', 'img');
    const status = element('p', 'widget-readout small-divisors-status');
    status.setAttribute('aria-live', 'polite');

    // The drawing shrinks with the figure on a phone. `unit`, its drawing units per pixel (at least 1),
    // keeps the text (through --unit in site.css), the margins for it and the dots at their size, and
    // the plot at least 190 pixels high.
    let unit = 1;
    let near = false;
    new ResizeObserver(() => {
      const width = drawing.getBoundingClientRect().width;
      if (!width) return;
      const next = Math.max(1, WIDTH / width);
      if (Math.abs(next - unit) < .01) return;
      unit = next;
      drawing.style.setProperty('--unit', unit);
      if (near) draw();
    }).observe(drawing);

    function draw() {
      const data = computed(state.example);
      const n = state.n;
      const height = Math.max(HEIGHT, Math.round(250 * unit + 10));
      drawing.setAttribute('viewBox', `0 0 ${WIDTH} ${height}`);
      const font = 13 * unit;
      const left = 2.2 * font + 10;
      const right = 8 * unit + 8;
      const top = 1.8 * font + 4;
      const bottom = 2.8 * font + 6;
      const toX = k => left + Math.log(k) / Math.log(TERMS) * (WIDTH - left - right);
      const toY = r => top + (1 - r / TOP) * (height - top - bottom);
      drawing.replaceChildren();

      const grid = kit.svg('g', {class: 'plane-grid'}, drawing);
      for (let k = 0; k <= 6; k++) {
        const y = toY(k / 10);
        kit.svg('line', {x1: left, y1: y, x2: WIDTH - right, y2: y, class: k === 0 ? 'plane-axis' : ''}, grid);
        kit.svg('text', {x: left - 8, y, 'text-anchor': 'end', 'dominant-baseline': 'central', class: 'plane-tick'}, drawing)
          .textContent = k === 0 ? '0' : formatNumber(k / 10, 1);
      }
      for (const k of [1, 10, 100, 1000]) {
        kit.svg('line', {x1: toX(k), y1: toY(0), x2: toX(k), y2: toY(TOP), class: k === 1 ? 'plane-axis' : ''}, grid);
        kit.svg('text', {x: toX(k), y: toY(0) + 1.3 * font, 'text-anchor': 'middle', class: 'plane-tick'}, drawing)
          .textContent = whole(k);
      }
      kit.svg('text', {x: (left + WIDTH - right) / 2, y: height - 6, 'text-anchor': 'middle', class: 'plane-tick'}, drawing)
        .textContent = 'number of terms n';
      kit.svg('text', {x: left - 8, y: top - .9 * font, class: 'plane-tick'}, drawing)
        .textContent = 'reach from the fixed point';

      // The curves are cut off at the top of the plot.
      const clip = kit.svg('clipPath', {id: `${id}-clip`}, drawing);
      kit.svg('rect', {x: left, y: top, width: WIDTH - left - right, height: height - top - bottom}, clip);
      const plot = kit.svg('g', {'clip-path': `url(#${id}-clip)`}, drawing);
      const path = (reach, from, to) => {
        const points = [];
        for (let k = from; k <= to; k++) points.push(`${toX(k).toFixed(1)},${toY(Math.min(reach[k], 2 * TOP)).toFixed(1)}`);
        return points.join(' ');
      };
      for (const example of EXAMPLES) {
        if (example === state.example) continue;
        kit.svg('polyline', {points: path(computed(example).reach, 2, TERMS), class: 'small-divisors-other'}, plot);
      }
      if (data.size !== null) {
        const y = toY(data.size);
        kit.svg('line', {x1: left, y1: y, x2: WIDTH - right, y2: y, class: 'small-divisors-disk'}, plot);
        kit.svg('text', {x: WIDTH - right - 6, y: y + 1.3 * font, 'text-anchor': 'end', class: 'plane-tick small-divisors-disk-label'}, drawing)
          .textContent = `size of the Siegel disk, ${formatNumber(data.size, 3)}`;
      }
      if (n < TERMS) kit.svg('polyline', {points: path(data.reach, n, TERMS), class: 'small-divisors-rest'}, plot);
      kit.svg('polyline', {points: path(data.reach, 2, n), class: 'small-divisors-curve'}, plot);
      const x = toX(n);
      const y = toY(data.reach[n]);
      if (n < TERMS && data.reach[n] <= TOP) {
        kit.svg('line', {x1: x, y1: toY(0), x2: x, y2: y, class: 'small-divisors-guide'}, plot);
      }
      // The terms that follow a near return, where the series divides by an unusually small number.
      const dots = kit.svg('g', {class: 'small-divisors-drops'}, plot);
      for (const m of data.records) {
        if (m + 1 >= 2 && m + 1 <= n && data.reach[m + 1] <= TOP) {
          kit.svg('circle', {cx: toX(m + 1), cy: toY(data.reach[m + 1]), r: 3.5 * unit, 'stroke-width': 1.5, 'data-term': m + 1}, dots);
        }
      }
      if (data.reach[n] <= TOP) {
        kit.svg('circle', {class: 'small-divisors-now', cx: x, cy: y, r: 7 * unit, 'stroke-width': 2}, drawing);
      }
      if (data.size === null) {
        // The next near return lies far beyond the plot: an arrow down from the end of the curve.
        const end = toY(data.reach[TERMS]);
        const tip = toY(0) - 4 * unit;
        const at = WIDTH - right - 10 * unit;
        kit.svg('line', {x1: at, y1: end + 9 * unit, x2: at, y2: tip - 7 * unit, class: 'small-divisors-arrow'}, drawing);
        kit.svg('path', {d: `M${at - 5 * unit},${tip - 9 * unit} L${at},${tip} L${at + 5 * unit},${tip - 9 * unit} Z`,
          class: 'small-divisors-arrowhead'}, drawing);
        kit.svg('text', {x: at + 4 * unit, y: end - .9 * font, 'text-anchor': 'end', class: 'plane-tick small-divisors-next'}, drawing)
          .textContent = `next drop at term ${scientific(Number(data.q) + 1)}`;
      }

      slider.max = String(data.steps.length - 1);
      slider.value = String(data.steps.reduce((best, value, index) => (Math.abs(value - n) < Math.abs(data.steps[best] - n) ? index : best), 0));
      shown.textContent = whole(n);
      describe(data);
      if (near) figure.dataset.drawn = '';
    }

    function describe(data) {
      const [key] = state.example;
      const n = state.n;
      const intro = {
        cremer: `θ ≈ ${formatNumber(data.theta, 6)}, with continued fraction digits 3, 21, ${breakable(CREMER_DIGIT)}, …, `
          + 'each the next whole number above e to the power of the denominator before: e ≈ 2.7, e³ ≈ 20.1, '
          + `e⁶⁴ ≈ 6.2·10²⁷. Its fractions are 1/3, 21/64 and then one with the denominator ${breakable(data.q)}, `
          + 'so every term of Brjuno’s sum is at least 1, and the sum diverges. The next digit would have about '
          + '1.7·10²⁹ digits of its own, more than any computer can store. ',
        golden: `θ = (√5 − 1)/2 ≈ ${formatNumber(data.theta, 6)}, the golden mean. Its digits are all 1, and the `
          + 'denominators of its fractions are the Fibonacci numbers 1, 2, 3, 5, 8, … ',
        silver: `θ = √2 − 1 ≈ ${formatNumber(data.theta, 6)}, the silver mean. Its digits are all 2, and the `
          + 'denominators of its fractions 1, 2, 5, 12, 29, … grow a little faster. ',
        'near-1-3': `θ ≈ ${formatNumber(data.theta, 6)}, with digits 2, 1, 30, 1, 1, … The denominators of its fractions `
          + 'are 1, 2, 3, 92, 95, …: after 3 comes one about 30 times larger. ',
        'near-2-5': `θ ≈ ${formatNumber(data.theta, 6)}, with digits 2, 2, 30, 1, 1, … The denominators of its fractions `
          + 'are 1, 2, 5, 152, 157, …: after 5 comes one about 30 times larger. ',
      }[key];
      const turns = n - 1;
      const nearer = data.records.includes(turns);
      const term = `Term ${whole(n)} is found by dividing by λ<sup>${n}</sup> − λ, of size `
        + `${scientific(data.divisor[n])}${nearer && turns > 1
          ? `: ${whole(turns)} turns by θ come within ${scientific(Math.abs(data.off[n]))} of a whole number, nearer than any fewer turns`
          : ''}. With the first ${whole(n)} terms the reach is ${formatNumber(data.reach[n], 3)}.`;
      const outlook = data.size === null
        ? ` The next drop comes one term after that denominator, at term ${scientific(Number(data.q) + 1)}, and the `
          + 'drops never end: the reach shrinks to 0, and there is no disk.'
        : ` With more terms the reach goes down to the size of the Siegel disk, ${formatNumber(data.size, 3)}.`;
      status.innerHTML = `${intro}${term}${outlook}`;
      drawing.setAttribute('aria-label', 'A plot of the reach of the straightening series over the number of its terms, '
        + `for the angle chosen and in gray for the others, up to term ${whole(n)}; the text below describes it.`);
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, drawing, status]) figure.insertBefore(part, caption);
    // The series are computed when the figure first comes near the screen.
    kit.whenNear(figure, () => {
      near = true;
      draw();
    });
  });
})();
