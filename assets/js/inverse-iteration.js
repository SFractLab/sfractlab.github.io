/* Interactive figure: drawing a Julia set backwards.

   Inverse iteration starts at the repelling fixed point β = 1/2 + √(1/4 − c)
   and keeps choosing one of the two preimages ±√(z − c) at random; by
   Brolin's theorem its points follow the harmonic measure of the Julia set,
   which neglects its deep parts. The modified method walks the whole tree of
   preimages instead, and stops following a branch once its pixel has been hit
   HIT_LIMIT times. A meter counts the boundary pixels (pixels outside the
   filled Julia set whose distance estimate is below the pixel size) that have
   a plotted point within one pixel.

   Built by AtlasKit.setUp for every <figure data-widget="inverse-iteration">;
   data-example chooses the first parameter (a key of EXAMPLES). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format} = kit;

  const WIDTH = 720;
  const HEIGHT = 540;
  const VIEW = {left: -2, top: 1.5, width: 4, height: 3};
  const SCALE = WIDTH / VIEW.width;
  const BUDGET = 1000;          // steps for the background and the distance estimate
  const RADIUS = 1000;          // escape radius for the distance estimate
  const BATCH = 100000;         // points added by one press
  const PER_FRAME = 50000;
  const HIT_LIMIT = 4;          // the modified method: hits per pixel before a branch stops
  const MAX_NODES = 3000000;

  const EXAMPLES = [
    ['dendrite', 'Dendrite · c = i', 0, 1],
    ['basilica', 'Basilica · c = −1', -1, 0],
    ['rabbit', 'Rabbit · c ≈ −0.12 + 0.74i', -.122561166876654, .744861766619744],
    ['cauliflower', 'Cauliflower · c = 1/4', .25, 0],
    ['siegel', 'Golden-mean Siegel disk · c ≈ −0.39 − 0.59i', -.3905408702184, -.5867879073469687],
  ];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The principal square root of x + iy, from real square roots.
  function sqrt(x, y) {
    const size = Math.sqrt(x * x + y * y);
    const re = Math.sqrt((size + x) / 2);
    const im = Math.sqrt(Math.max(0, (size - x) / 2));
    return [re, y < 0 ? -im : im];
  }

  const pixelOf = (x, y) => {
    const col = Math.floor((x - VIEW.left) * SCALE);
    const row = Math.floor((VIEW.top - y) * SCALE);
    return col >= 0 && col < WIDTH && row >= 0 && row < HEIGHT ? row * WIDTH + col : -1;
  };

  kit.setUp('inverse-iteration', (figure) => {
    figure.classList.add('widget-plate');
    const first = EXAMPLES.find(([key]) => key === figure.dataset.example) || EXAMPLES[2];
    const state = {example: first, hits: null, boundary: null, boundaryCount: 0, random: 0, modified: 0,
      background: null, z: null};
    let generation = 0;

    // --- controls ------------------------------------------------------------

    const controls = element('div', 'plate-controls');
    const exampleLabel = element('label', null, 'Julia set');
    const select = element('select');
    for (const [key, name] of EXAMPLES) {
      const option = element('option', null, name);
      option.value = key;
      select.append(option);
    }
    select.value = first[0];
    exampleLabel.append(select);
    const buttons = element('div', 'plate-buttons');
    function button(text, onClick, quiet = false) {
      const node = element('button', quiet ? 'plate-button-quiet' : null, text);
      node.type = 'button';
      node.addEventListener('click', onClick);
      buttons.append(node);
      return node;
    }
    button('Add 100,000 random points', () => addRandom(BATCH));
    button('Add a million', () => addRandom(10 * BATCH));
    button('Modified method', () => modified());
    button('Clear', () => reset(), true);
    controls.append(exampleLabel, buttons);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d');
    if (!context) return;
    view.append(canvas);
    const status = element('p', 'plate-verdict');
    status.setAttribute('aria-live', 'polite');

    // --- the background and the boundary pixels ----------------------------

    // The filled Julia set, dimmed, and the boundary pixels for the meter.
    function prepare() {
      const [, , cr, ci] = state.example;
      const background = context.createImageData(WIDTH, HEIGHT);
      const boundary = new Uint8Array(WIDTH * HEIGHT);
      let count = 0;
      const pixel = 1 / SCALE;
      for (let row = 0; row < HEIGHT; row++) {
        for (let col = 0; col < WIDTH; col++) {
          let zx = VIEW.left + (col + .5) / SCALE, zy = VIEW.top - (row + .5) / SCALE;
          let dx = 1, dy = 0, n = 0;
          let keptX = zx, keptY = zy, keepAt = 8;
          while (n < BUDGET && zx * zx + zy * zy <= RADIUS * RADIUS) {
            const ndx = 2 * (zx * dx - zy * dy);
            dy = 2 * (zx * dy + zy * dx);
            dx = ndx;
            const nx = zx * zx - zy * zy + cr;
            zy = 2 * zx * zy + ci;
            zx = nx;
            n++;
            // An orbit that returns exactly to an earlier value never escapes.
            if (zx === keptX && zy === keptY) {
              n = BUDGET;
              break;
            }
            if (n === keepAt) {
              keptX = zx;
              keptY = zy;
              keepAt *= 2;
            }
          }
          const index = row * WIDTH + col;
          const inside = n >= BUDGET;
          if (!inside) {
            const size = Math.sqrt(zx * zx + zy * zy);
            const b = 2 * size * Math.log(size) / Math.sqrt(dx * dx + dy * dy);
            if (b < pixel) {
              boundary[index] = 1;
              count++;
            }
          }
          const shade = inside ? [28, 52, 78] : [9, 19, 32];
          background.data.set([...shade, 255], 4 * index);
        }
      }
      state.background = background;
      state.boundary = boundary;
      state.boundaryCount = count;
    }

    function reset() {
      generation++;
      state.hits = new Uint16Array(WIDTH * HEIGHT);
      state.random = 0;
      state.modified = 0;
      const [, , cr, ci] = state.example;
      const [sx, sy] = sqrt(.25 - cr, -ci);
      state.z = [.5 + sx, sy];  // β, the fixed point where the ray at angle 0 lands
      context.putImageData(state.background, 0, 0);
      describe();
    }

    function plot(index) {
      if (state.hits[index] < 65535) state.hits[index]++;
      if (state.hits[index] === 1) {
        context.fillStyle = '#fff1c8';
        context.fillRect(index % WIDTH, Math.floor(index / WIDTH), 1, 1);
      }
    }

    // --- inverse iteration ---------------------------------------------------

    async function addRandom(count) {
      const request = generation;
      const [, , cr, ci] = state.example;
      let [x, y] = state.z;
      for (let done = 0; done < count; done += PER_FRAME) {
        for (let k = 0; k < PER_FRAME; k++) {
          [x, y] = sqrt(x - cr, y - ci);
          if (Math.random() < .5) {
            x = -x;
            y = -y;
          }
          const index = pixelOf(x, y);
          if (index >= 0) plot(index);
        }
        state.z = [x, y];
        state.random += PER_FRAME;
        describe();
        await new Promise(requestAnimationFrame);
        if (request !== generation) return;
      }
    }

    // The modified method: depth first through the tree of preimages of β.
    function modified() {
      const [, , cr, ci] = state.example;
      const [sx, sy] = sqrt(.25 - cr, -ci);
      const stack = [.5 + sx, sy];
      const seen = new Uint16Array(WIDTH * HEIGHT);
      let nodes = 0;
      while (stack.length && nodes < MAX_NODES) {
        const y = stack.pop();
        const x = stack.pop();
        nodes++;
        const index = pixelOf(x, y);
        if (index < 0 || seen[index] >= HIT_LIMIT) continue;
        seen[index]++;
        plot(index);
        const [rx, ry] = sqrt(x - cr, y - ci);
        stack.push(rx, ry, -rx, -ry);
      }
      state.modified += nodes;
      describe();
    }

    function describe() {
      let covered = 0;
      for (let index = 0; index < WIDTH * HEIGHT; index++) {
        if (!state.boundary[index]) continue;
        const col = index % WIDTH, row = Math.floor(index / WIDTH);
        found: for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr, c = col + dc;
            if (r >= 0 && r < HEIGHT && c >= 0 && c < WIDTH && state.hits[r * WIDTH + c]) {
              covered++;
              break found;
            }
          }
        }
      }
      const [, , cr, ci] = state.example;
      const share = state.boundaryCount ? Math.round(100 * covered / state.boundaryCount) : 0;
      status.textContent = `c = ${format({re: cr, im: ci}, 4)}. Random backward orbit: `
        + `${state.random.toLocaleString('en')} points; modified method: ${state.modified.toLocaleString('en')} `
        + `preimages followed. Points within one pixel of ${share}% of the ${state.boundaryCount.toLocaleString('en')} `
        + 'boundary pixels.';
    }

    select.addEventListener('change', () => {
      state.example = EXAMPLES.find(([key]) => key === select.value);
      prepare();
      reset();
    });

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, status]) figure.insertBefore(part, caption);
    prepare();
    reset();
  });
})();
