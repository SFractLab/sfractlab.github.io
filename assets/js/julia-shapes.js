/* Figure: two examples of each form a connected quadratic Julia set can take,
   as the Julia chapter lists them: deformed circles, pinched sets and
   dendrites. It is not interactive. Each picture is drawn by the distance
   estimate (AtlasKit's distance coloring, which also shows sets without
   interior, such as the interval) when the figure first comes near the
   screen, on the window of the gallery's Julia pictures, 4.2 wide around 0.

   Built by AtlasKit.setUp for every <figure data-widget="julia-shapes">. */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;

  const WIDTH = 640;
  const HEIGHT = 480;
  const VIEW = {left: -2.1, top: 1.575, width: 4.2, height: 3.15};
  const BUDGET = 1000;
  const RADIUS = 1000;  // escape radius for the distance estimate

  // Near a circle the distance estimate is about twice the distance, so a line drawn below one pixel
  // breaks where the curve passes between pixel centres; the circles are drawn below two.
  const CIRCLE_THICKNESS = 2;

  // Each row: its title, then for each picture its caption (fixed markup), its name for screen
  // readers, c, and the thickness of the line in pixels as AtlasKit's distance coloring takes it.
  const ROWS = [
    ['Deformed circles', [
      ['<var>c</var> = 0: the round circle', 'the round circle of c = 0', 0, 0, CIRCLE_THICKNESS],
      ['<var>c</var> = −0.5 + 0.3<var>i</var>: a crinkled circle', 'the crinkled circle of c = −0.5 + 0.3i', -.5, .3,
        CIRCLE_THICKNESS],
    ]],
    ['Pinched sets', [
      ['The basilica, <var>c</var> = −1', 'the basilica, c = −1', -1, 0],
      ['Douady’s rabbit, <var>c</var> ≈ −0.1226 + 0.7449<var>i</var>', 'Douady’s rabbit, c ≈ −0.1226 + 0.7449i',
        -0.122561166876654, 0.744861766619744],
    ]],
    ['Dendrites', [
      ['The interval [−2, 2], <var>c</var> = −2', 'the interval from −2 to 2, c = −2', -2, 0],
      ['<var>c</var> = <var>i</var>', 'the dendrite of c = i', 0, 1],
    ]],
  ];

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // One picture: its panel, and draw(), which computes it at the size the screen calls for and
  // resolves to true once it is complete.
  function picture([caption, name, re, im, thickness = 1]) {
    const panel = element('div', 'plate-panel');
    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return null;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `The Julia set of ${name}.`);
    view.append(canvas);
    const text = element('p', 'plate-caption');
    text.innerHTML = caption;
    panel.append(view, text);
    // Strips are painted here first, then copied onto the picture down to the first one missing.
    const buffer = element('canvas');
    const bufferContext = buffer.getContext('2d');

    function paint(data) {
      if (buffer.width !== data.width || buffer.height !== data.height) {
        buffer.width = data.width;
        buffer.height = data.height;
      }
      data.thickness = thickness;
      kit.paintOrbits(bufferContext, data, 'distance');
      if (data.rows) context.drawImage(buffer, 0, 0, data.width, data.rows, 0, 0, data.width, data.rows);
    }

    let generation = 0;
    async function draw() {
      const request = ++generation;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      context.clearRect(0, 0, canvas.width, canvas.height);
      // A quarter of a pixel up, so that no pixel centre lies on the real axis: there the orbits of
      // the interval [−2, 2] never escape, and it would be drawn as inside, not as the set.
      const shown = {...VIEW, top: VIEW.top + VIEW.height / canvas.height / 4};
      const pass = await kit.orbitPass(shown, {re, im}, BUDGET, RADIUS, canvas.width, canvas.height,
        () => request === generation, {coloring: 'distance', onStrip: partial => {
          if (partial.rows < partial.height && partial.width === canvas.width) paint(partial);
        }});
      if (!pass) return false;
      paint(pass);
      return true;
    }
    return {panel, draw, fits: () => kit.fitsScreen(canvas, WIDTH, HEIGHT)};
  }

  kit.setUp('julia-shapes', (figure) => {
    figure.classList.add('widget-plate');
    const caption = figure.querySelector('figcaption');
    const pictures = [];
    for (const [title, examples] of ROWS) {
      const row = element('div', 'shapes-row');
      const grid = element('div', 'plate-grid');
      for (const example of examples) {
        const shown = picture(example);
        if (!shown) return;
        grid.append(shown.panel);
        pictures.push(shown);
      }
      row.append(element('h3', null, title), grid);
      figure.insertBefore(row, caption);
    }

    // The pictures are computed when the figure first comes near the screen, and again when a
    // change of the window's size or zoom calls for another size.
    // A drawing still running when another starts stops; only the last one marks the figure drawn.
    let near = false;
    let round = 0;
    async function draw() {
      const current = ++round;
      delete figure.dataset.drawn;
      const done = await Promise.all(pictures.map(shown => shown.draw()));
      if (current === round && done.every(Boolean)) figure.dataset.drawn = '';
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
