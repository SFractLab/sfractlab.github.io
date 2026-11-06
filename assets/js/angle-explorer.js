/* Interactive figure: everything an external angle says.

   For a rational angle θ = p/q the figure computes, exactly with whole
   numbers, its binary expansion and its preperiod and period under doubling,
   its kneading sequence (Schleicher, Definition 2.4) and its internal address
   (Definition 3.4). For a periodic angle of period up to 12 it finds the
   partner whose parameter ray lands at the same root, by Lavaurs' rule. The
   spider algorithm (Hubbard and Schleicher) then finds the parameter the angle
   names: for a periodic angle the center of the component at whose root the
   ray lands, for a preperiodic one the Misiurewicz point where it lands. Two
   pictures show the angle among Lavaurs' chords and that parameter on the
   Mandelbrot set.

   Built by AtlasKit.setUp for every <figure data-widget="angle-explorer">;
   data-angle chooses the first angle (a fraction such as 3/7). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber, kneading} = kit;

  const SIZE = 360;
  const MAX_DENOMINATOR = 100000;
  const LAVAURS_LIMIT = 12;       // partners are found for periods up to this
  const DISK_PERIODS = 7;         // the chords drawn in the disk
  const SPIDER_LIMIT = 40;        // the longest orbit the spider is run on
  const C_VIEW = {left: -2.2, top: 1.6, width: 3.2, height: 3.2};
  const EXAMPLES = ['1/7', '3/7', '7/15', '1/5', '22/127', '1/6', '9/56', '5/12'];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  // "3/7" → {p: 3, q: 7}, reduced modulo 1; null if it is not such a fraction.
  function parseAngle(text) {
    const match = /^\s*(\d{1,15})\s*(?:\/\s*(\d{1,6}))?\s*$/.exec(text);
    if (!match) return null;
    const q = Number(match[2] ?? 1);
    if (!q || q > MAX_DENOMINATOR) return null;
    const p = Number(match[1]) % q;
    const d = gcd(p, q) || q;
    return {p: p / d, q: q / d};
  }
  const fraction = ({p, q}) => (p === 0 ? '0' : `${p}/${q}`);

  // The internal address from the kneading sequence (Schleicher, Definition
  // 3.4): each next period is the first position where the sequence differs
  // from the periodic repetition of its first S entries, S the last period.
  function internalAddress(nu) {
    const periods = [1];
    for (;;) {
      const s = periods[periods.length - 1];
      let next = null;
      for (let position = s + 1; position <= nu.length; position++) {
        const symbol = nu[position - 1];
        if (symbol === '⋆' || symbol !== nu[(position - 1) % s]) {
          next = position;
          break;
        }
      }
      if (next === null) return {periods, complete: false};
      periods.push(next);
      if (nu[next - 1] === '⋆') return {periods, complete: true};
    }
  }

  function partner({p, q}, period) {
    const x = p / q;
    const chord = kit.lavaursChords(period).find(([n, a, b]) => n === period && (Math.abs(a - x) < 1e-12 || Math.abs(b - x) < 1e-12));
    if (!chord) return null;
    const [, a, , k1, k2, d] = chord;
    const k = Math.abs(a - x) < 1e-12 ? k2 : k1;
    const g = gcd(k, d);
    return {p: k / g, q: d / g};
  }

  // --- the spider algorithm ------------------------------------------------

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // Steps of AtlasKit.spiderStep until the foot of the first leg, the guess
  // for c, stops moving.
  function spider(angles, cycleStart) {
    let legs = kit.spiderLegs(angles);
    for (let step = 0; step < 2000; step++) {
      const c = legs[0][0];
      legs = kit.spiderStep(legs, angles, cycleStart);
      if (step > 50 && dist(legs[0][0], c) < 1e-15) break;
    }
    return legs[0][0];
  }

  // --- the figure ----------------------------------------------------------

  kit.setUp('angle-explorer', (figure, id) => {
    const controls = element('div', 'widget-controls');
    const field = element('label', 'widget-point');
    field.append(element('var', null, 'θ'), ' = ');
    const input = element('input', 'angle-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'External angle as a fraction of a turn, such as 3/7');
    field.append(input);
    controls.append(field);
    const examples = element('div', 'widget-angles');
    examples.append(element('span', null, 'Examples:'));
    for (const example of EXAMPLES) {
      const button = element('button', 'widget-button widget-button-quiet', example);
      button.type = 'button';
      button.addEventListener('click', () => {
        input.value = example;
        show(parseAngle(example));
      });
      examples.append(button);
    }
    controls.append(examples);

    function pane(title) {
      const box = element('div', 'widget-pane');
      const heading = element('p', 'widget-pane-title');
      heading.innerHTML = title;  // fixed markup
      const drawing = kit.svg('svg', {viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'widget-plane', 'aria-hidden': 'true'});
      box.append(heading, drawing);
      return {box, drawing};
    }
    const disk = pane(`Lavaurs’ chords · periods 2 to ${DISK_PERIODS}`);
    const plane = pane('The parameter it names · parameter plane');
    const pair = element('div', 'widget-pair');
    pair.append(disk.box, plane.box);
    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    // The disk: chords as arcs that meet the circle at right angles.
    const CENTER = SIZE / 2, RADIUS = SIZE / 2 - 24;
    const onCircle = a => [CENTER + RADIUS * Math.cos(2 * Math.PI * a), CENTER - RADIUS * Math.sin(2 * Math.PI * a)];
    function arc(a, b) {
      const [x1, y1] = onCircle(a);
      const [x2, y2] = onCircle(b);
      let span = (b - a + 1) % 1;
      span = Math.min(span, 1 - span);
      const r = RADIUS * Math.tan(Math.PI * span);
      return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${(b - a + 1) % 1 < .5 ? 1 : 0} `
        + `${x2.toFixed(2)} ${y2.toFixed(2)}`;
    }
    kit.svg('circle', {cx: CENTER, cy: CENTER, r: RADIUS, class: 'angle-disk'}, disk.drawing);
    kit.svg('path', {d: kit.lavaursChords(DISK_PERIODS).map(([, a, b]) => arc(a, b)).join(''),
      class: 'angle-chords'}, disk.drawing);
    const diskLayer = kit.svg('g', {}, disk.drawing);

    // The plane: the Mandelbrot set as a silhouette, and the landing point.
    const cPlane = new kit.Plane(C_VIEW, SIZE, SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.getContext('2d').putImageData(kit.mandelbrotMask(C_VIEW, SIZE, SIZE, 200), 0, 0);
    const defs = kit.svg('defs', {}, plane.drawing);
    const mask = kit.svg('mask', {id: `${id}-silhouette`}, defs);
    kit.svg('image', {href: canvas.toDataURL('image/png'), width: SIZE, height: SIZE}, mask);
    kit.svg('rect', {width: SIZE, height: SIZE, class: 'angle-silhouette', mask: `url(#${id}-silhouette)`},
      plane.drawing);
    const planeLayer = kit.svg('g', {}, plane.drawing);

    function show(angle) {
      input.classList.toggle('angle-invalid', !angle);
      if (!angle) {
        readout.textContent = 'Type a fraction such as 3/7, with a denominator up to 100,000.';
        return;
      }
      const {numerators, digits, preperiod, period} = kit.doublingOrbit(angle.p, angle.q);
      const name = fraction(angle);
      const theta = angle.p / angle.q;
      diskLayer.replaceChildren();
      planeLayer.replaceChildren();
      const [tx, ty] = onCircle(theta);
      const shown = digits.length <= 32 ? ` = ${kit.binary(digits, preperiod)}` : '';
      let text = `<var>θ</var> = ${name}${shown}`;

      if (angle.p === 0) {
        kit.svg('circle', {cx: tx, cy: ty, r: 6, class: 'angle-point'}, diskLayer);
        const {x, y} = cPlane.toScreen({re: .25, im: 0});
        kit.svg('circle', {cx: x, cy: y, r: 7, class: 'angle-marker'}, planeLayer);
        readout.innerHTML = `${text} is fixed by doubling. Its kneading sequence is ⋆ and its internal address 1: `
          + 'the ray lands at the cusp 1/4 of the main cardioid, the only root where a single ray lands.';
        figure.dataset.shown = name;
        return;
      }

      const periodic = preperiod === 0;
      const length = periodic ? period : Math.min(preperiod + 3 * period, 60);
      const nu = kneading(angle, periodic ? period : Math.max(length, 60));
      const address = internalAddress(nu);
      const nuText = periodic ? nu.join('') : `${nu.slice(0, Math.min(length, 16)).join('')}…`;
      const addressText = address.complete ? address.periods.join(' → ')
        : `${address.periods.slice(0, 6).join(' → ')} → ⋯`;
      text += periodic ? ` is periodic, with period ${period}. ` : ` has preperiod ${preperiod} and period ${period}. `;
      text += `Kneading sequence ${nuText}; internal address ${addressText}${address.complete ? '' : ', infinite'}. `;

      // Lavaurs' partner for periodic angles.
      let mate = null;
      if (periodic && period >= 2 && period <= LAVAURS_LIMIT) mate = partner(angle, period);
      if (mate) {
        const a = Math.min(theta, mate.p / mate.q), b = Math.max(theta, mate.p / mate.q);
        kit.svg('path', {d: arc(a, b), class: 'angle-chord'}, diskLayer);
        text += `Its partner by Lavaurs’ rule is ${fraction(mate)}: the rays at ${name} and ${fraction(mate)} land together `
          + `at the root of a component of period ${period}. `;
      } else if (periodic) {
        text += `Partners are found here for periods up to ${LAVAURS_LIMIT}. `;
      }
      kit.svg('circle', {cx: tx, cy: ty, r: 6, class: 'angle-point'}, diskLayer);

      // The spider.
      if (numerators.length > SPIDER_LIMIT) {
        text += `The orbit of the angle is longer than ${SPIDER_LIMIT} steps, too long for the spider here.`;
      } else {
        const angles = numerators.map(n => n / angle.q);
        const [cx, cy] = spider(angles, preperiod);
        const c = {re: cx, im: cy};
        let check;
        if (periodic) {
          let z = [0, 0];
          for (let k = 0; k < period; k++) z = [z[0] * z[0] - z[1] * z[1] + cx, 2 * z[0] * z[1] + cy];
          check = `<var>f</var><sup>${period}</sup>(0) has size ${small(Math.hypot(...z))}`;
          text += `The spider finds the component’s center <var>c</var> ≈ ${format(c, 10)}, where ${check}.`;
        } else {
          const orbit = [[cx, cy]];
          for (let k = 0; k < preperiod + period; k++) {
            const [x, y] = orbit[orbit.length - 1];
            orbit.push([x * x - y * y + cx, 2 * x * y + cy]);
          }
          const gap = dist(orbit[preperiod], orbit[preperiod + period]);
          text += `The spider finds the Misiurewicz point <var>c</var> ≈ ${format(c, 10)}: the critical orbit `
            + `<var>c</var>, <var>c</var><sup>2</sup> + <var>c</var>, … repeats after ${preperiod} step${preperiod === 1 ? '' : 's'} `
            + `with period dividing ${period} (the gap is ${small(gap)}).`;
        }
        const {x, y} = cPlane.toScreen(c);
        kit.svg('circle', {cx: x, cy: y, r: 7, class: 'angle-marker'}, planeLayer);
        figure.dataset.landing = `${cx},${cy}`;
      }
      readout.innerHTML = text;
      figure.dataset.shown = name;
    }

    function small(x) {
      if (x === 0) return '0';
      const exponent = Math.floor(Math.log10(x));
      return exponent >= -3 ? formatNumber(x, 4) : `${formatNumber(x / 10 ** exponent, 1)} × 10<sup>−${-exponent}</sup>`;
    }

    input.addEventListener('change', () => show(parseAngle(input.value)));
    const caption = figure.querySelector('figcaption');
    for (const part of [controls, pair, readout]) figure.insertBefore(part, caption);
    input.value = figure.dataset.angle || '3/7';
    show(parseAngle(input.value));
  });
})();
