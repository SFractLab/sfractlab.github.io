/* Interactive figure: π in the Mandelbrot set.

   Counts the steps N that the orbit of 0 under z ↦ z² + c needs to leave the
   disk of radius 2, for parameters approaching −3/4, 1/4 or −5/4, and
   rescales them: N·ε tends to π at the neck and N·√ε to π at the cusp. At
   −5/4, N·t is close to π/2 along a parabola for t = 10^−k, though not for
   every t; straight up from −5/4 it lands near various multiples of π/2.
   The counts are computed live in double precision, which runs out near the
   cusp. Where the rescaled count has a limit, a row whose difference from it
   is larger than in the row before is marked: the true difference shrinks,
   so only rounding errors can make it grow.

   Built by AtlasKit.setUp for every <figure data-widget="pi-counts">;
   data-approach chooses the first approach (a key of APPROACHES). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {formatNumber} = kit;

  // [key, menu label, parameter name, exponents k of 10^−k, c(ε), rescaled count, its name, limit, limit's name]
  const APPROACHES = [
    ['neck', 'c = −3/4 + εi, the neck', 'ε', [1, 2, 3, 4, 5, 6, 7], e => [-.75, e], (n, e) => n * e, 'N·ε', Math.PI, 'π'],
    ['cusp', 'c = 1/4 + ε, the cusp', 'ε', [2, 4, 6, 8, 10, 12, 14], e => [.25 + e, 0], (n, e) => n * Math.sqrt(e), 'N·√ε', Math.PI, 'π'],
    ['parabola', 'c = −5/4 − t² + ti, along a parabola', 't', [1, 2, 3, 4, 5, 6, 7], t => [-1.25 - t * t, t], (n, t) => n * t, 'N·t', Math.PI / 2,
      'π/2'],
    ['vertical', 'c = −5/4 + ti, straight up', 't', [1, 2, 3, 4, 5, 6], t => [-1.25, t], (n, t) => n * t, 'N·t', null, 'π/2'],
  ];

  // Where the counts are taken, as the readout begins (straight up has its own sentence).
  const PLACES = {
    neck: 'At the neck, <var>c</var> = −3/4 + <var>ε</var>i',
    cusp: 'At the cusp, <var>c</var> = 1/4 + <var>ε</var>',
    parabola: 'Along the parabola <var>c</var> = −5/4 − <var>t</var><sup>2</sup> + <var>t</var>i',
  };

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The first n with |z_n| > 2 for the orbit of 0 under z ↦ z² + c.
  function escapeCount(cx, cy) {
    let x = 0, y = 0, n = 0;
    while (x * x + y * y <= 4) {
      const t = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = t;
      n++;
    }
    return n;
  }

  const SUPERSCRIPT = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
  const power = k => `10${String(-k).replace(/[-\d]/g, ch => SUPERSCRIPT[ch])}`;
  const small = x => {
    if (x === 0) return '0';
    const exponent = Math.floor(Math.log10(Math.abs(x)));
    if (exponent >= -3) return formatNumber(x, 4);
    return `${formatNumber(x / 10 ** exponent, 1)} × ${power(-exponent)}`;
  };
  const signed = x => (x > 0 ? '+' : '') + small(x);

  kit.setUp('pi-counts', (figure) => {
    const first = APPROACHES.find(([key]) => key === figure.dataset.approach) || APPROACHES[0];
    let approach = first;
    let generation = 0;

    const controls = element('div', 'widget-controls');
    const label = element('label', 'widget-point', 'Approach ');
    const select = element('select');
    for (const [key, name] of APPROACHES) {
      const option = element('option', null, name);
      option.value = key;
      select.append(option);
    }
    select.value = first[0];
    select.addEventListener('change', () => {
      approach = APPROACHES.find(([key]) => key === select.value);
      run();
    });
    label.append(select);
    controls.append(label);

    const wrap = element('div', 'table-wrap');
    const table = element('table', 'pi-table');
    const head = element('thead');
    const body = element('tbody');
    table.append(head, body);
    wrap.append(table);
    const readout = element('p', 'widget-readout');
    readout.setAttribute('aria-live', 'polite');

    async function run() {
      const request = ++generation;
      const [key, , name, exponents, parameter, rescale, product, limit, limitName] = approach;
      delete figure.dataset.done;
      head.innerHTML = `<tr><th scope="col"><var>${name}</var></th><th scope="col">Steps <var>N</var></th>`
        + `<th scope="col"><var>N</var>·${name === 'ε' && key === 'cusp' ? '√<var>ε</var>' : `<var>${name}</var>`}</th>`
        + `<th scope="col">${limit === null ? `<var>N</var>·<var>t</var> ÷ (${limitName})` : `Difference from ${limitName}`}</th></tr>`;
      body.replaceChildren();
      readout.textContent = 'Counting…';
      let previous = Infinity;
      let firstWorse = null, lastBetter = null;
      for (const k of exponents) {
        await new Promise(requestAnimationFrame);
        if (request !== generation) return;
        const e = Number(`1e-${k}`);
        const [cx, cy] = parameter(e);
        const n = escapeCount(cx, cy);
        const value = rescale(n, e);
        const row = element('tr');
        const cells = [power(k), n.toLocaleString('en'), formatNumber(value, 8)];
        if (limit === null) {
          cells.push(formatNumber(value / (Math.PI / 2), 3));
        } else {
          const difference = value - limit;
          cells.push(signed(difference));
          if (Math.abs(difference) > previous) {
            row.className = 'pi-worse';
            if (firstWorse === null) firstWorse = k;
          } else if (firstWorse === null) {
            lastBetter = k;
          }
          previous = Math.abs(difference);
        }
        for (const [index, text] of cells.entries()) row.append(element(index ? 'td' : 'th', null, text));
        row.firstChild.scope = 'row';
        body.append(row);
      }
      const rescaled = product.replace(/[Nεt]/g, ch => `<var>${ch}</var>`);
      if (limit === null) {
        readout.innerHTML = `Straight up from −5/4, <var>N</var>·<var>t</var> does not settle down: it lands near `
          + 'different multiples of π/2. Along the parabola it comes close to π/2, at least for these values of <var>t</var>.';
      } else if (firstWorse === null) {
        readout.innerHTML = `${PLACES[key]}, ${rescaled} approaches ${limitName}: at <var>${name}</var> = `
          + `${power(lastBetter)} the difference is ${small(previous)}.`
          + (key === 'parabola' ? ' Not for every <var>t</var>, though: for a few percent of the other small values, '
            + '<var>N</var>·<var>t</var> lands near a larger multiple of π/2.' : '');
      } else {
        readout.innerHTML = `${PLACES[key]}, ${rescaled} approaches ${limitName} until <var>${name}</var> = `
          + `${power(lastBetter)}; `
          + `from ${power(firstWorse)} on, the difference grows instead `
          + 'of shrinking (marked): the rounding errors of double precision now dominate the count.';
      }
      figure.dataset.done = key;
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, wrap, readout]) figure.insertBefore(part, caption);
    run();
  });
})();
