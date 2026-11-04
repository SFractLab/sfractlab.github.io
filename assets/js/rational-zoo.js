/* Figure: three Julia sets that no polynomial can have, as the list "A zoo of rational Julia sets"
   names them: a Sierpiński carpet, z² − 1/(16z²); a Cantor set of circles, z³ + λ/z³ with
   λ = 0.001; and a Herman ring, Milnor's example e^(2πit) z²(z − 4)/(1 − 4z) (Dynamics in One
   Complex Variable, introductory lectures, §12 and Figure 12). It is not interactive.

   Each picture is drawn by the distance estimate, in the colors of AtlasKit's distance coloring:
   an orbit that reaches |z| > BIG is in the basin of ∞, blue, lighter farther from the Julia set,
   which is cream where the estimate 2·|z|·log|z|/|z′| is below the width of the line. For the
   Herman ring map 0 is superattracting too, and an orbit that reaches |z| < SMALL is in its basin,
   in gold, with the estimate 2·|z|·log(1/|z|)/|z′|. (z′ is the derivative with respect to the
   starting point.) The carpet and the circles have no other Fatou components, so an orbit that
   does neither within the budget is drawn as the set.

   An orbit of the Herman ring map that does neither lies in the ring or in one of the pieces that
   the map carries onto it. It runs around a closed curve, and the ring is drawn in teal rings along
   these curves: a point's level is the weighted average of log|z_k| over its orbit, with the
   weights exp(−1/(s(1 − s))), s = k/BUDGET, which converge faster than any power of the budget on
   such orbits (Das and Yorke, 2018), as in the Siegel-disk figure. log|z| is harmonic in the ring,
   so its average over a curve is the curve's conformal radius log ρ plus a constant, and the ring is
   symmetric about the unit circle, where the level is 0: the light rings are evenly spaced curves
   of the ring's own round picture. A ring under 2 pixels wide fades to the middle shade, from the
   gradient of the level, the same average of z′_k/z_k.

   t = 0.6151732159527993 makes the rotation number on the unit circle the golden mean, found by a
   weighted average of the angle steps and the secant method (notes/scripts/rational-zoo).

   Built by AtlasKit.setUp for every <figure data-widget="rational-zoo">. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;

  const SIZE = 240;          // the designed size of each picture, square
  const ROWS_PER_TASK = 12;
  const LINE = 1.3;          // the Julia set's width on screen, in CSS pixels
  const THIN_LINE = .6;      // thinner for the carpet and the circles, whose holes and gaps shrink so
                            // fast that at 1.3 pixels most of the picture near the set is drawn as the set
  const BIG = 1e8;           // an orbit beyond this has escaped to ∞
  const SMALL = 1e-8;        // an orbit of the Herman ring map below this has been caught by 0
  const BAND = 0.1;          // the spacing of the ring's light rings, in levels
  const LAMBDA = 0.001;      // the parameter of the Cantor set of circles
  const HERMAN_T = 0.6151732159527993;
  const HERMAN_BUDGET = 600;

  // The colors: the set, the two basins from near the set to far from it, and the ring's two shades.
  const COLORS = {
    cream: [244, 236, 214],
    outside: [[13, 26, 45], [53, 116, 155]],
    zero: [[46, 30, 12], [190, 140, 66]],
    ring: [[24, 96, 110], [120, 214, 218]],
  };

  // Key, caption (fixed markup), name for screen readers, map number, center, width, budget and the
  // width of the Julia set's line.
  const SPECIMENS = [
    ['carpet', 'A carpet: <span><var>z</var><sup>2</sup> − 1/(16<var>z</var><sup>2</sup>)</span>',
      'the Sierpiński carpet of z² − 1/(16z²)', 0, [0, 0], 2.1, 200, THIN_LINE],
    ['circles', 'Circles: <span><var>z</var><sup>3</sup> + 0.001/<var>z</var><sup>3</sup></span>',
      'the Cantor set of circles of z³ + 0.001/z³', 1, [0, 0], 2.1, 200, THIN_LINE],
    ['herman', 'A Herman ring: Milnor’s example',
      'the Herman ring of Milnor’s example, e^(2πit) z²(z − 4)/(1 − 4z) with t ≈ 0.6151732', 2,
      [.1, 0], 4.6, HERMAN_BUDGET, LINE],
  ];

  // The weights of the Herman ring's average, adding up to 1.
  const WEIGHTS = (() => {
    const raw = Array.from({length: HERMAN_BUDGET}, (_, k) => {
      const s = k / HERMAN_BUDGET;
      return k === 0 ? 0 : Math.exp(-1 / (s * (1 - s)));
    });
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map(w => w / sum);
  })();

  // Rows of one picture, in RGBA. Runs on the background threads, so it uses only its task and the
  // constants handed to the pool.
  function zooRows({map, left, top, pixel, width, firstRow, rows, budget, line}) {
    const pixels = new Uint8ClampedArray(width * rows * 4);
    const er = Math.cos(2 * Math.PI * HERMAN_T), ei = Math.sin(2 * Math.PI * HERMAN_T);
    const mix = (pair, t, offset) => {
      for (let i = 0; i < 3; i++) pixels[offset + i] = pair[0][i] + (pair[1][i] - pair[0][i]) * t;
    };
    const cream = offset => {
      for (let i = 0; i < 3; i++) pixels[offset + i] = COLORS.cream[i];
    };
    for (let row = 0; row < rows; row++) {
      const y = top - (firstRow + row + .5) * pixel;
      for (let column = 0; column < width; column++) {
        let x = left + (column + .5) * pixel, yy = y;
        let dr = 1, di = 0;          // the derivative with respect to the starting point
        let level = 0, gr = 0, gi = 0;  // the Herman ring's average and its gradient
        let side = 0, size = 0;      // 1: caught by ∞, 2: caught by 0; |z| then
        for (let k = 1; k < budget && side === 0; k++) {
          let fr, fi, pr, pi;        // f(z) and f′(z)
          const x2 = x * x - yy * yy, xy = 2 * x * yy;
          if (map === 0) {
            // z² − 1/(16z²), f′ = 2z + 1/(8z³)
            const q = x2 * x2 + xy * xy;
            fr = x2 - x2 / (16 * q);
            fi = xy + xy / (16 * q);
            const z3r = x2 * x - xy * yy, z3i = x2 * yy + xy * x, q3 = z3r * z3r + z3i * z3i;
            pr = 2 * x + z3r / (8 * q3);
            pi = 2 * yy - z3i / (8 * q3);
          } else if (map === 1) {
            // z³ + λ/z³, f′ = 3z² − 3λ/z⁴
            const z3r = x2 * x - xy * yy, z3i = x2 * yy + xy * x, q3 = z3r * z3r + z3i * z3i;
            fr = z3r + LAMBDA * z3r / q3;
            fi = z3i - LAMBDA * z3i / q3;
            const z4r = x2 * x2 - xy * xy, z4i = 2 * x2 * xy, q4 = z4r * z4r + z4i * z4i;
            pr = 3 * x2 - 3 * LAMBDA * z4r / q4;
            pi = 3 * xy + 3 * LAMBDA * z4i / q4;
          } else {
            // e·z²(z − 4)/(1 − 4z), f′ = e·z(−8z² + 19z − 8)/(1 − 4z)²
            const nr = x2 * (x - 4) - xy * yy, ni = x2 * yy + xy * (x - 4);
            const ar = 1 - 4 * x, ai = -4 * yy, q = ar * ar + ai * ai;
            const wr = (nr * ar + ni * ai) / q, wi = (ni * ar - nr * ai) / q;
            fr = er * wr - ei * wi;
            fi = er * wi + ei * wr;
            const mr = -8 * x2 + 19 * x - 8, mi = -8 * xy + 19 * yy;
            const sr = x * mr - yy * mi, si = x * mi + yy * mr;
            const br = ar * ar - ai * ai, bi = 2 * ar * ai, q2 = br * br + bi * bi;
            const vr = (sr * br + si * bi) / q2, vi = (si * br - sr * bi) / q2;
            pr = er * vr - ei * vi;
            pi = er * vi + ei * vr;
          }
          const nd = pr * dr - pi * di;
          di = pr * di + pi * dr;
          dr = nd;
          x = fr;
          yy = fi;
          const s2 = x * x + yy * yy;
          if (!(s2 <= BIG * BIG)) side = 1;
          else if (map === 2 && s2 < SMALL * SMALL) side = 2;
          else if (map === 2) {
            level += WEIGHTS[k] * .5 * Math.log(s2);
            gr += WEIGHTS[k] * (dr * x + di * yy) / s2;
            gi += WEIGHTS[k] * (di * x - dr * yy) / s2;
          }
          if (side) size = Math.sqrt(s2);
        }
        const offset = 4 * (row * width + column);
        pixels[offset + 3] = 255;
        if (side) {
          const b = 2 * size * Math.abs(Math.log(size)) / Math.hypot(dr, di);
          if (b < pixel * line) {
            cream(offset);
          } else {
            // NaN when the orbit ran into a pole, which lies in the basin of ∞: far from the set.
            const t = b === b ? Math.max(0, Math.min(1, Math.log(b / pixel) / Math.log(400))) : 1;
            mix(side === 1 ? COLORS.outside : COLORS.zero, t, offset);
          }
        } else if (map === 2) {
          const band = BAND / (Math.hypot(gr, gi) * pixel);
          const fade = Math.min(1, Math.max(0, (band - 2) / 4));
          mix(COLORS.ring, .5 + .5 * Math.cos(2 * Math.PI * level / BAND) * fade, offset);
        } else {
          cream(offset);
        }
      }
    }
    return {pixels};
  }

  const pool = kit.workerPool(zooRows, {constants: {BIG, SMALL, BAND, LAMBDA, HERMAN_T, WEIGHTS, COLORS}});

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  kit.setUp('rational-zoo', (figure) => {
    figure.classList.add('widget-plate');
    const grid = element('div', 'zoo-grid');
    const pictures = [];
    for (const [key, caption, name, map, [re, im], width, budget, lineWidth] of SPECIMENS) {
      const panel = element('div', 'plate-panel');
      panel.dataset.specimen = key;
      const view = element('div', 'plate-view');
      const canvas = element('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `The Julia set of ${name}.`);
      view.append(canvas);
      const text = element('p', 'plate-caption');
      text.innerHTML = caption;
      panel.append(view, text);
      grid.append(panel);
      pictures.push({canvas, context, map, view: {left: re - width / 2, top: im + width / 2, width}, budget, lineWidth});
    }

    // Draws one picture at the size the screen calls for; resolves to true once it is complete.
    async function drawPicture({canvas, context, map, view, budget, lineWidth}, isCurrent) {
      kit.fitCanvas(canvas, SIZE, SIZE);
      const size = canvas.width;
      const line = lineWidth * size / (canvas.getBoundingClientRect().width || SIZE);
      const tasks = [];
      for (let firstRow = 0; firstRow < size; firstRow += ROWS_PER_TASK) {
        tasks.push({map, left: view.left, top: view.top, pixel: view.width / size, width: size, firstRow,
          rows: Math.min(ROWS_PER_TASK, size - firstRow), budget, line});
      }
      return pool.run(tasks, () => isCurrent() && canvas.width === size, (task, {pixels}) => {
        context.putImageData(new ImageData(pixels, task.width, task.rows), 0, task.firstRow);
      });
    }

    // The pictures are computed when the figure first comes near the screen, and again when a
    // change of the window's size or zoom calls for another size. A drawing still running when
    // another starts stops; only the last one marks the figure drawn.
    let near = false;
    let round = 0;
    async function draw() {
      const current = ++round;
      delete figure.dataset.drawn;
      const done = await Promise.all(pictures.map(picture => drawPicture(picture, () => current === round)));
      if (current === round && done.every(Boolean)) figure.dataset.drawn = '';
    }

    figure.insertBefore(grid, figure.querySelector('figcaption'));
    kit.whenNear(figure, () => {
      near = true;
      draw();
    });
    kit.whenResized(() => {
      if (near && !pictures.every(({canvas}) => kit.fitsScreen(canvas, SIZE, SIZE))) draw();
    });
  });
})();
