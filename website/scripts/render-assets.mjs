/*
  Renders the site's raster brand assets from HTML with headless Chrome:
    og-image.png          1200×630  link-preview card
    apple-touch-icon.png   180×180  iOS home-screen icon (opaque, as iOS requires)

  Writes into src/static/ (the hand-written folder). Run npm run build afterwards.
  Usage:  npm run assets
  Chrome: uses $CHROME if set, otherwise the default macOS / Linux install path.
*/
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../src/static');
const CHROME = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));

if (!CHROME) {
  console.error('render-assets: Chrome not found. Set CHROME=/path/to/chrome.');
  process.exit(1);
}

const INK = '#131313', PAPER = '#F1F1EC', BLUE = '#2E43F5';
const LOGO = '<path d="M0 0h1v5H0zM4 0h1v5H4zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3z"/>';
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,800&family=JetBrains+Mono:wght@400&display=block">';

const pages = {
  'og-image.png': {
    size: [1200, 630],
    html: `<!doctype html><meta charset="utf-8">${FONTS}
<style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:${PAPER};color:${INK};overflow:hidden;position:relative}
  .grid{position:absolute;inset:0;
    background-image:linear-gradient(rgb(19 19 19/.06) 1px,transparent 1px),linear-gradient(90deg,rgb(19 19 19/.06) 1px,transparent 1px);
    background-size:30px 30px}
  svg{position:absolute;right:90px;top:165px;width:300px;height:300px;fill:${INK}}
  .copy{position:absolute;left:90px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:34px}
  .eyebrow{font:400 20px/1 "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#4F4F4A;display:flex;align-items:center;gap:14px}
  .eyebrow::before{content:"";width:14px;height:14px;background:${BLUE}}
  h1{font:800 82px/.93 "Archivo",sans-serif;font-stretch:112%;letter-spacing:-.03em}
  h1 span{color:${BLUE}}
  .url{font:400 20px/1 "JetBrains Mono",monospace;letter-spacing:.1em;color:#4F4F4A}
</style>
<div class="grid"></div>
<svg viewBox="0 0 5 5" shape-rendering="crispEdges">${LOGO}</svg>
<div class="copy">
  <p class="eyebrow">Nirmaan · Software studio</p>
  <h1>We build<br>software,<br><span>block by block.</span></h1>
  <p class="url">nirmaan.online</p>
</div>`,
  },
  'apple-touch-icon.png': {
    size: [180, 180],
    html: `<!doctype html><meta charset="utf-8">
<style>*{margin:0}body{width:180px;height:180px;background:${PAPER};display:grid;place-items:center}svg{width:110px;height:110px;fill:${INK}}</style>
<svg viewBox="0 0 5 5" shape-rendering="crispEdges">${LOGO}</svg>`,
  },
};

const work = mkdtempSync(join(tmpdir(), 'nirmaan-assets-'));
try {
  for (const [file, { size, html }] of Object.entries(pages)) {
    const src = join(work, file + '.html');
    writeFileSync(src, html);
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${size[0]},${size[1]}`, '--virtual-time-budget=6000',
      `--screenshot=${join(ROOT, file)}`, `file://${src}`,
    ], { stdio: 'ignore' });
    console.log(`render-assets: wrote ${file} (${size.join('×')})`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
