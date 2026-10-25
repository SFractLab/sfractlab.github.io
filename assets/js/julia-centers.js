/* Interactive figure: where the eye finds the centers of a Julia set.

   Every Julia set of z² + c is unchanged by the half-turn z ↦ −z, so its
   picture has two matching halves, joined at the critical point 0. The figure
   draws the Julia set of one of several parameters, by the distance estimate
   (AtlasKit's distance coloring, which also shows sets without interior), and
   marks 0, the two fixed points α = (1 − √(1 − 4c))/2 and β = (1 + √(1 − 4c))/2,
   with the principal square root, and their mirror points −α and −β. The
   status line gives the fixed points, the modulus of their multipliers 2α and
   2β, and the turn of 2α.

   Built by AtlasKit.setUp for every <figure data-widget="julia-centers">;
   data-example chooses the first parameter (a key of EXAMPLES). */
(() => {
  'use strict';
  const kit = window.AtlasKit;
  if (!kit) return;
  const {format, formatNumber} = kit;

  const WIDTH = 640;
  const HEIGHT = 480;
  const VIEW = {left: -1.8, top: 1.35, width: 3.6, height: 2.7};  // the same scale for every example
  const BUDGET = 1000;
  const RADIUS = 1000;  // escape radius for the distance estimate
  // Dust is drawn where the distance estimate is below half a pixel, not a whole one: at the full
  // threshold its fine structure merges into thick shapes.
  const DUST_THICKNESS = .5;

  // Key, name, c as the text writes it, c, whether the orbit of 0 stays bounded (checked for 100,000
  // steps), and what the picture shows.
  const EXAMPLES = [
    ['spirals', 'c = −0.8 + 0.156i', 'c = −0.8 + 0.156i', -0.8, 0.156, false, 'Each half spirals around α or −α.'],
    ['spirals-2', 'c = −0.7269 + 0.1889i', 'c = −0.7269 + 0.1889i', -0.7269, 0.1889, false,
      'Each half spirals around α or −α.'],
    ['seahorse', 'c = −0.75 + 0.1i, seahorse valley', 'c = −0.75 + 0.1i', -0.75, 0.1, false,
      'Each half spirals around α or −α.'],
    ['arms', 'c = −0.70176 − 0.3842i', 'c = −0.70176 − 0.3842i', -0.70176, -0.3842, false,
      'Arms wind around α and −α.'],
    ['star', 'c = −0.4 + 0.6i', 'c = −0.4 + 0.6i', -0.4, 0.6, false, 'Arms wind around α and −α.'],
    ['cusp', 'c = 0.285 + 0.01i, near the cusp 1/4', 'c = 0.285 + 0.01i', 0.285, 0.01, false,
      'Near the cusp 1/4 both multipliers are close to 1 in modulus, and the arms also curl around β and −β.'],
    ['rabbit', 'Douady’s rabbit, c ≈ −0.1226 + 0.7449i', 'c ≈ −0.1226 + 0.7449i', -0.122561166876654,
      0.744861766619744, true, 'Three lobes meet at α and three at −α; the large lobe around 0 belongs to both groups.'],
    ['basilica', 'Basilica, c = −1', 'c = −1', -1, 0, true,
      'α is only the point where the lobe around 0 touches the lobe around −1, and −α where it touches the lobe '
      + 'around 1.'],
    ['dendrite', 'Dendrite, c = i', 'c = i', 0, 1, true, 'α is a branch point where three arms meet, and so is −α.'],
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
    return {re, im: y < 0 ? -im : im};
  }

  // The two fixed points of z² + c: α with the minus sign, β with the plus sign.
  function fixedPoints(c) {
    const root = sqrt(1 - 4 * c.re, -4 * c.im);
    return {
      alpha: {re: (1 - root.re) / 2, im: -root.im / 2},
      beta: {re: (1 + root.re) / 2, im: root.im / 2},
    };
  }

  kit.setUp('julia-centers', (figure) => {
    figure.classList.add('widget-plate');
    const first = EXAMPLES.find(([key]) => key === figure.dataset.example) || EXAMPLES[0];
    const state = {example: first};
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
    select.addEventListener('change', () => {
      state.example = EXAMPLES.find(([key]) => key === select.value);
      show();
    });
    exampleLabel.append(select);
    controls.append(exampleLabel);

    // --- the view ------------------------------------------------------------

    const view = element('div', 'plate-view');
    const canvas = element('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = kit.svg('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'plate-overlay centers-overlay'});
    overlay.setAttribute('role', 'img');
    view.append(canvas, overlay);
    const status = element('p', 'plate-verdict centers-status');
    status.setAttribute('aria-live', 'polite');
    // Strips are painted here first, then copied onto the picture down to the first one missing.
    const buffer = element('canvas');
    const bufferContext = buffer.getContext('2d');

    const parameter = () => ({re: state.example[3], im: state.example[4]});

    // The five points, with their labels and kinds (for the colors).
    function points() {
      const {alpha, beta} = fixedPoints(parameter());
      const minus = z => ({re: -z.re, im: -z.im});
      return [
        {name: '0', z: {re: 0, im: 0}, kind: 'critical'},
        {name: 'α', z: alpha, kind: 'alpha'},
        {name: '−α', z: minus(alpha), kind: 'alpha'},
        {name: 'β', z: beta, kind: 'beta'},
        {name: '−β', z: minus(beta), kind: 'beta'},
      ];
    }

    // Rings with their labels, in the overlay's own units; labels keep their size on screen. A label
    // goes to the right of its ring, or to the left where it would reach past the picture, as β of
    // the basilica does on a phone. Its width is estimated generously, at 0.8 of the font size per
    // character (0.75 for "−β" in Firefox).
    function mark() {
      overlay.replaceChildren();
      const plane = new kit.Plane(VIEW, WIDTH, HEIGHT);
      const unit = Math.max(1, WIDTH / (overlay.getBoundingClientRect().width || WIDTH));
      const size = 18.75 * unit;
      for (const point of points()) {
        const {x, y} = plane.toScreen(point.z);
        const right = x + 14 * unit + .8 * size * point.name.length + 2.5 * unit <= WIDTH;
        const group = kit.svg('g', {class: `centers-point centers-${point.kind}`, 'data-name': point.name}, overlay);
        kit.svg('circle', {class: 'centers-halo', cx: x, cy: y, r: 10.5 * unit}, group);
        kit.svg('circle', {class: 'centers-ring', cx: x, cy: y, r: 10.5 * unit}, group);
        kit.svg('text', {class: 'centers-label', x: right ? x + 14 * unit : x - 14 * unit, y: y - 12 * unit,
          'text-anchor': right ? 'start' : 'end', 'font-size': size, 'stroke-width': 5 * unit}, group)
          .textContent = point.name;
      }
      overlay.setAttribute('aria-label', `The Julia set for ${state.example[1]}, with the critical point 0, the fixed `
        + 'points α and β and their mirror points −α and −β marked; the text below gives their values.');
    }

    function describe() {
      const c = parameter();
      const {alpha, beta} = fixedPoints(c);
      const modulus = z => formatNumber(2 * Math.hypot(z.re, z.im), 3);
      const turn = ((Math.atan2(alpha.im, alpha.re) / (2 * Math.PI)) % 1 + 1) % 1;
      const kind = state.example[5] ? 'in the Mandelbrot set: the Julia set is connected'
        : 'outside the Mandelbrot set: the Julia set is a dust of points, though at this size it looks solid';
      status.textContent = `${state.example[2]}, ${kind}. α ≈ ${format(alpha, 4)}, multiplier 2α of modulus `
        + `${modulus(alpha)}; near α one step turns by ${formatNumber(turn, 3)} of a full turn. β ≈ ${format(beta, 4)}, `
        + `multiplier 2β of modulus ${modulus(beta)}. ${state.example[6]}`;
    }

    // --- the pass ------------------------------------------------------------

    async function show() {
      const request = ++generation;
      kit.fitCanvas(canvas, WIDTH, HEIGHT);
      context.clearRect(0, 0, canvas.width, canvas.height);
      mark();
      status.textContent = `${state.example[2]}. Computing…`;
      const pass = await kit.orbitPass(VIEW, parameter(), BUDGET, RADIUS, canvas.width, canvas.height,
        () => request === generation, {coloring: 'distance', onStrip: partial => paintSoon(partial)});
      if (!pass) return;
      paint(pass);
      describe();
    }

    // Paints at the next animation frame, once however many strips arrive before it.
    let pending = null;
    function paintSoon(partial) {
      if (pending) {
        pending = partial;
        return;
      }
      pending = partial;
      requestAnimationFrame(() => {
        const latest = pending;
        pending = null;
        if (latest.rows < latest.height && latest.width === canvas.width) paint(latest);
      });
    }

    function paint(data) {
      if (buffer.width !== data.width || buffer.height !== data.height) {
        buffer.width = data.width;
        buffer.height = data.height;
      }
      data.thickness = state.example[5] ? 1 : DUST_THICKNESS;
      kit.paintOrbits(bufferContext, data, 'distance');
      if (data.rows) context.drawImage(buffer, 0, 0, data.width, data.rows, 0, 0, data.width, data.rows);
    }

    const caption = figure.querySelector('figcaption');
    for (const part of [controls, view, status]) figure.insertBefore(part, caption);
    show();
    kit.whenResized(() => {
      if (!kit.fitsScreen(canvas, WIDTH, HEIGHT)) show();
      else mark();
    });
  });
})();
