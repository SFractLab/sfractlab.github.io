/* Interactive lab on the gallery page: choose a parameter c on a map of the
   Mandelbrot set and see the escape-time picture of the filled Julia set of
   z ↦ z² + c.

   A finite experiment, not a membership test: every sample is iterated at most
   a fixed number of times, and dark pixels are samples that have not escaped
   yet. Rendering yields to the browser every few rows, and a newer request
   stops an older Julia render. The escape-time drawing itself is shared with
   the orbit figures in atlas-kit.js, listed before this script in site.toml. */
(() => {
  'use strict';

  const lab = document.getElementById('fractal-lab');
  const kit = window.AtlasKit;
  if (!lab || !kit) return;
  const mapCanvas = document.getElementById('lab-mandelbrot');
  const juliaCanvas = document.getElementById('lab-julia');
  const map = mapCanvas.getContext('2d');
  const julia = juliaCanvas.getContext('2d');
  if (!map || !julia) return;
  const realInput = document.getElementById('lab-real');
  const imaginaryInput = document.getElementById('lab-imag');
  const exampleSelect = document.getElementById('lab-example');
  const budgetSelect = document.getElementById('lab-iterations');
  const status = document.getElementById('lab-status');

  // The windows of the complex plane shown by the two canvases. Both have the
  // canvases' 4:3 shape, so pixels are square.
  const MAP_VIEW = {left: -2.2, width: 3.2, top: 1.2, height: 2.4};
  const JULIA_VIEW = {left: -2.1, width: 4.2, top: 1.575, height: 3.15};
  const MAP_BUDGET = 350;
  const WIDTH = 480;   // the canvases are designed at 480 × 360 and drawn at the size the screen
  const HEIGHT = 360;  // calls for (AtlasKit.fitCanvas)

  const EXAMPLES = {
    circle: [0, 0],
    basilica: [-1, 0],
    rabbit: [-.122561166876, .744861766620],
    cauliflower: [.25, 0],
    dendrite: [0, 1],
    dust: [1, 0],
    interval: [-2, 0],
  };

  const MARKER_COLOUR = '#fff1c8';
  const INTERVAL_COLOUR = '#74dddc';

  let generation = 0;        // counts Julia requests; a render stops when it is no longer the latest
  let mapImage = null;       // the finished map, without the marker
  let selected = {re: -1, im: 0};

  lab.hidden = false;

  // The radius used for the status line's critical-orbit test. It is the
  // generous radius of the drawing, max(2, |c| + 1); the chapters' sharp
  // radius is AtlasKit.escapeRadius.
  function escapeRadius(c) {
    return Math.max(2, Math.hypot(c.re, c.im) + 1);
  }

  function toCanvas(view, canvas, re, im) {
    return [(re - view.left) / view.width * canvas.width, (view.top - im) / view.height * canvas.height];
  }

  // Redraws the map with a ring around the selected parameter.
  function drawMarker() {
    if (!mapImage) return;
    map.putImageData(mapImage, 0, 0);
    const [x, y] = toCanvas(MAP_VIEW, mapCanvas, selected.re, selected.im);
    map.strokeStyle = MARKER_COLOUR;
    map.lineWidth = 2;
    map.beginPath();
    map.arc(x, y, 6, 0, Math.PI * 2);
    map.stroke();
  }

  // For c = −2 the Julia set is the segment [−2, 2], which has no area and
  // would fall between the samples; draw it explicitly.
  function drawInterval() {
    const [x1, y] = toCanvas(JULIA_VIEW, juliaCanvas, -2, 0);
    const [x2] = toCanvas(JULIA_VIEW, juliaCanvas, 2, 0);
    julia.strokeStyle = INTERVAL_COLOUR;
    julia.lineWidth = 1.5;
    julia.beginPath();
    julia.moveTo(x1, y);
    julia.lineTo(x2, y);
    julia.stroke();
  }

  // The number of steps after which the orbit of the critical point 0
  // escapes, or null if it stays within the radius for the whole budget.
  function criticalEscape(c, budget) {
    const radius = escapeRadius(c);
    let zx = 0;
    let zy = 0;
    let n = 0;
    while (n < budget && zx * zx + zy * zy <= radius * radius) {
      const next = zx * zx - zy * zy + c.re;
      zy = 2 * zx * zy + c.im;
      zx = next;
      n++;
    }
    return zx * zx + zy * zy > radius * radius ? n : null;
  }

  function describe(c, budget, steps, showsInterval) {
    const sign = c.im < 0 ? '−' : '+';
    const orbit = steps === null
      ? `The critical orbit did not escape within ${budget} steps; this finite test alone does not prove membership.`
      : `The computed critical orbit escaped after ${steps} steps.`;
    const interval = showsInterval ? ' The exact interval [−2,2] is overlaid for visibility.' : '';
    return `c = ${c.re} ${sign} ${Math.abs(c.im)}i. ${orbit} Dark image samples mean finite-time non-escape.${interval}`;
  }

  // Renders the Julia view for the parameter in the input fields.
  async function render() {
    const re = Number(realInput.value);
    const im = Number(imaginaryInput.value);
    const budget = Number(budgetSelect.value);
    const valid = realInput.value.trim() !== '' && imaginaryInput.value.trim() !== ''
      && Number.isFinite(re) && Number.isFinite(im) && Math.abs(re) <= 3 && Math.abs(im) <= 3;
    if (!valid) {
      generation++;  // stops a render in progress
      status.textContent = 'Enter finite real and imaginary parts between −3 and 3.';
      return;
    }
    const c = {re, im};
    const request = ++generation;
    selected = c;
    drawMarker();
    status.textContent = 'Computing the selected Julia picture…';
    kit.fitCanvas(juliaCanvas, WIDTH, HEIGHT);
    const image = await kit.renderEscapeTime(julia, JULIA_VIEW, c, budget, () => request === generation);
    if (!image) return;
    const showsInterval = re === -2 && im === 0;
    if (showsInterval) drawInterval();
    status.textContent = describe(c, budget, criticalEscape(c, budget), showsInterval);
  }

  function renderCustom() {
    exampleSelect.value = 'custom';
    render();
  }

  document.getElementById('lab-render').addEventListener('click', renderCustom);
  exampleSelect.addEventListener('change', () => {
    const example = EXAMPLES[exampleSelect.value];
    if (!example) return;
    [realInput.value, imaginaryInput.value] = example;
    render();
  });
  budgetSelect.addEventListener('change', render);
  for (const input of [realInput, imaginaryInput]) {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') renderCustom();
    });
  }
  mapCanvas.addEventListener('click', event => {
    const box = mapCanvas.getBoundingClientRect();
    realInput.value = (MAP_VIEW.left + (event.clientX - box.left) / box.width * MAP_VIEW.width).toFixed(7);
    imaginaryInput.value = (MAP_VIEW.top - (event.clientY - box.top) / box.height * MAP_VIEW.height).toFixed(7);
    renderCustom();
  });

  async function renderMap() {
    kit.fitCanvas(mapCanvas, WIDTH, HEIGHT);
    mapImage = null;
    mapImage = await kit.renderEscapeTime(map, MAP_VIEW, null, MAP_BUDGET, () => true);
    drawMarker();
  }

  renderMap();
  render();
  kit.whenResized(() => {
    if (!kit.fitsScreen(mapCanvas, WIDTH, HEIGHT)) renderMap();
    if (!kit.fitsScreen(juliaCanvas, WIDTH, HEIGHT)) render();
  });
})();
