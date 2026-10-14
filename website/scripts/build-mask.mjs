/*
  Generates the masks for the "block by block" page transition
  (src/static/assets/motion/build-*.svg, used by ::view-transition-new(root) in styles.css).

  Each file is a horizontal sprite of FRAMES frames. Every frame is a grid of
  blocks; a block, once laid, stays laid. Blocks go down bottom row first,
  sweeping left to right with a little jitter, the way the logo's glyphs are
  assembled. CSS steps mask-position through the frames, so the new page is
  revealed over the old one a block at a time.

  Run: npm run masks   (output is committed; re-run only to change the pattern)
*/
import { writeFileSync, mkdirSync } from 'node:fs';

const FRAMES = 12;
const SHAPES = {
  landscape: { cols: 16, rows: 10 }, // ~16:10 screens
  portrait: { cols: 6, rows: 12 },   // phones
};

// Deterministic jitter so the committed files don't change on every run.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

mkdirSync(new URL('../src/static/assets/motion/', import.meta.url), { recursive: true });

for (const [name, { cols, rows }] of Object.entries(SHAPES)) {
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // 0 = first block laid. Rows dominate (bottom first), then a left-to-right sweep.
      const t = ((rows - 1 - y) / rows) * 0.62 + (x / cols) * 0.26 + rand() * 0.12;
      cells.push({ x, y, t });
    }
  }
  const max = Math.max(...cells.map((c) => c.t));
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    // Frame 0 is empty, the last frame is complete.
    const cut = (f / (FRAMES - 1)) * max;
    const laid = f === FRAMES - 1 ? cells : cells.filter((c) => c.t < cut && f > 0);
    // Blocks overlap by a hair so no seams show between them.
    const d = laid.map((c) => `M${f * cols + c.x} ${c.y}h1.02v1.02h-1.02z`).join('');
    frames.push(d ? `<path d="${d}"/>` : '');
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * FRAMES} ${rows}" preserveAspectRatio="none" shape-rendering="crispEdges">` +
    frames.join('') +
    `</svg>\n`;
  const out = new URL(`../src/static/assets/motion/build-${name}.svg`, import.meta.url);
  writeFileSync(out, svg);
  console.log(`${name}: ${cols}x${rows}, ${FRAMES} frames, ${svg.length} bytes`);
}
