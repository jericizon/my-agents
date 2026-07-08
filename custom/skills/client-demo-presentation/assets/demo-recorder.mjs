/**
 * Client-demo presentation recorder (Playwright). Project-agnostic, self-contained.
 *
 * WHY THIS EXISTS
 * Cypress and the Playwright MCP record only the page viewport, NOT the OS mouse
 * cursor — the result looks like a "preview", not a presentable demo. This recorder
 * drives the REAL running app with Playwright, injects an animated cursor + a
 * step-caption (subtitle) bar, moves the mouse in visible steps, captures numbered
 * milestone screenshots, records the session to .webm, and (if available) transcodes
 * to a client-friendly .mp4 via ffmpeg-static.
 *
 * It is generic: nothing here is tied to a specific app. You supply the base URL and a
 * "flow" file (the user journey) on the command line — you never edit this recorder.
 *
 * SETUP (isolated dir — keeps the target repo's package.json/lockfile clean):
 *   WORK=$(mktemp -d)
 *   cd "$WORK"
 *   echo '{"name":"demo","private":true,"type":"module"}' > package.json
 *   npm install --no-fund --no-audit playwright ffmpeg-static
 *   PLAYWRIGHT_BROWSERS_PATH="$WORK/ms-browsers" npx playwright install chromium
 *
 * RUN (from that dir, pointing at your project's running app + a flow file):
 *   PLAYWRIGHT_BROWSERS_PATH="$WORK/ms-browsers" \
 *     node /path/to/demo-recorder.mjs \
 *       --base http://localhost:3000 \
 *       --flow /path/to/your-flow.mjs \
 *       --out  /path/to/docs/client-demo/<timestamp>_<feature> \
 *       --name <feature>-demo
 *
 * FLAGS (all optional except --flow for a real demo):
 *   --base <url>     Base URL of the running app        (env DEMO_BASE; default http://localhost:3000)
 *   --flow <path>    JS module exporting `default`/`runFlow(page, h)` (env DEMO_FLOW)
 *   --out  <dir>     Output directory                   (env DEMO_OUT;  default ./client-demo-output)
 *   --name <name>    Output file base name              (env DEMO_NAME; default "demo")
 *   --width <px>     Viewport width                     (env DEMO_WIDTH;  default 1280)
 *   --height <px>    Viewport height                    (env DEMO_HEIGHT; default 800)
 *   --headed         Run with a visible browser (needs a display; default headless)
 *
 * THE FLOW FILE (see example-flow.mjs next to this file):
 *   export default async function runFlow(page, h) { ... }
 *   `h` provides: h.BASE, h.viewport, h.goto(pathOrUrl), h.caption(text),
 *                 h.glideClick(locator, opts), h.glideTo(locator, opts),
 *                 h.type(locator, text), h.shot(label), h.sleep(ms).
 *
 * SCREENSHOTS
 *   Call h.shot('open') / h.shot('login-form') at each milestone. Files are written as
 *   numbered PNGs into <out>/screenshots/ (001_open.png, 002_login-form.png, ...).
 */
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Resolve runtime deps (playwright, ffmpeg-static) from where they were INSTALLED,
// not from this script's folder — so the recorder can live in a skill dir while deps
// live in the isolated $WORK dir. Anchor on the working dir, overridable via DEMO_MODULES.
const MODULES_DIR = process.env.DEMO_MODULES || process.cwd();
const requireFrom = createRequire(path.join(MODULES_DIR, 'package.json'));
let chromium;
try { ({ chromium } = requireFrom('playwright')); }
catch (e) {
  console.error(`[recorder] Could not load "playwright" from ${MODULES_DIR}.\n`
    + 'Install it there (see header), run the recorder from that dir, or set DEMO_MODULES '
    + 'to the dir containing node_modules/playwright.');
  process.exit(1);
}

// ── arg parsing ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { a[key] = true; }
      else { a[key] = next; i += 1; }
    } else { a._.push(t); }
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));

const CONFIG = {
  BASE: args.base || process.env.DEMO_BASE || 'http://localhost:3000',
  FLOW: args.flow || process.env.DEMO_FLOW || null,
  OUT_DIR: path.resolve(args.out || process.env.DEMO_OUT || './client-demo-output'),
  NAME: args.name || process.env.DEMO_NAME || 'demo',
  VIEWPORT: {
    width: Number(args.width || process.env.DEMO_WIDTH || 1280),
    height: Number(args.height || process.env.DEMO_HEIGHT || 800),
  },
  HEADLESS: !(args.headed || process.env.DEMO_HEADED),
};

// ── Injected per-document overlay: animated cursor + caption (subtitle) bar ───
// Runs before page scripts on every navigation, so it survives reloads/route changes.
const overlayInit = () => {
  const install = () => {
    if (document.getElementById('__demoCursor')) return;
    const c = document.createElement('div');
    c.id = '__demoCursor';
    c.style.cssText = [
      'position:fixed', 'left:-50px', 'top:-50px', 'width:22px', 'height:22px',
      'margin:-11px 0 0 -11px', 'border-radius:50%', 'background:rgba(63,81,181,.35)',
      'border:2px solid #3f51b5', 'box-shadow:0 0 0 4px rgba(63,81,181,.15)',
      'z-index:2147483647', 'pointer-events:none',
      'transition:left .07s linear, top .07s linear, transform .1s ease',
    ].join(';');
    document.documentElement.appendChild(c);

    const cap = document.createElement('div');
    cap.id = '__demoCaption';
    cap.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:26px', 'transform:translateX(-50%)',
      'width:80%', 'box-sizing:border-box', 'padding:10px 20px', 'color:#fff',
      'font:700 20px/1.4 Roboto,Arial,sans-serif',
      'background:rgba(0,0,0,.8)', 'border-radius:8px',
      'z-index:2147483647', 'pointer-events:none',
      'opacity:0', 'transition:opacity .25s ease', 'text-align:center',
    ].join(';');
    document.documentElement.appendChild(cap);

    addEventListener('mousemove', (e) => {
      c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`;
    }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(.6)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = 'scale(1)'; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => String(s || 'shot').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shot';

// Default flow when none is supplied: just open the app so the setup can be verified.
async function defaultFlow(page, h) {
  await h.goto('/');
  await page.mouse.move(h.viewport.width / 2, h.viewport.height / 2, { steps: 12 });
  await h.caption('No --flow supplied · opened ' + h.BASE);
  await h.shot('open');
  await h.sleep(2500);
  console.warn('[recorder] No --flow given; recorded a placeholder open-only clip. '
    + 'Pass --flow <file> exporting runFlow(page, h) for a real demo.');
}

async function loadFlow(flowPath) {
  if (!flowPath) return defaultFlow;
  const abs = path.resolve(flowPath);
  if (!existsSync(abs)) throw new Error(`--flow file not found: ${abs}`);
  const mod = await import(pathToFileURL(abs).href);
  const fn = mod.default || mod.runFlow;
  if (typeof fn !== 'function') {
    throw new Error(`flow file must export default or runFlow function: ${abs}`);
  }
  return fn;
}

// ── Engine ────────────────────────────────────────────────────────────────────
(async () => {
  const runFlow = await loadFlow(CONFIG.FLOW);

  const videoDir = path.join(CONFIG.OUT_DIR, 'video');
  const shotsDir = path.join(CONFIG.OUT_DIR, 'screenshots');
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });
  mkdirSync(shotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: CONFIG.HEADLESS });
  const context = await browser.newContext({
    viewport: CONFIG.VIEWPORT,
    recordVideo: { dir: videoDir, size: CONFIG.VIEWPORT },
  });
  await context.addInitScript(overlayInit);
  const page = await context.newPage();

  const toUrl = (p) => (/^https?:\/\//.test(p) ? p : CONFIG.BASE.replace(/\/$/, '') + (p.startsWith('/') ? p : `/${p}`));
  let shotN = 0;
  const h = {
    page, BASE: CONFIG.BASE, viewport: CONFIG.VIEWPORT, sleep,
    goto: (p = '/', opts = {}) => page.goto(toUrl(p), { waitUntil: 'networkidle', ...opts }),
    caption: (t) => page.evaluate((x) => {
      const cap = document.getElementById('__demoCaption');
      if (cap) { cap.textContent = x; cap.style.opacity = x ? '1' : '0'; }
    }, t).catch(() => {}),
    glideTo: async (loc, { steps = 28 } = {}) => {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const b = await loc.boundingBox();
      if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
    },
    glideClick: async (loc, { steps = 28, settle = 350 } = {}) => {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const b = await loc.boundingBox();
      if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps }); await sleep(settle); }
      await loc.click();
    },
    type: (loc, text) => loc.pressSequentially(text, { delay: 75 }),
    // Capture a numbered milestone screenshot into <out>/screenshots/NNN_label.png
    shot: async (label) => {
      shotN += 1;
      const id = String(shotN).padStart(3, '0');
      const file = path.join(shotsDir, `${id}_${slug(label)}.png`);
      await page.screenshot({ path: file }).catch((e) => console.warn('[recorder] shot failed', e.message));
      console.log('SHOT=' + file);
      return file;
    },
  };

  let err = null;
  try { await runFlow(page, h); }
  catch (e) { err = e; console.error('FLOW_ERROR', e); }

  const video = page.video();
  await context.close(); // flushes the .webm
  await browser.close();

  const webm = video ? await video.path() : null;
  let out = webm;
  if (webm) {
    const target = path.join(CONFIG.OUT_DIR, `${CONFIG.NAME}.webm`);
    rmSync(target, { force: true });
    copyFileSync(webm, target); // stable, predictable name
    out = target;
    try {
      const ffmpeg = requireFrom('ffmpeg-static');
      const mp4 = path.join(CONFIG.OUT_DIR, `${CONFIG.NAME}.mp4`);
      execFileSync(ffmpeg, ['-y', '-i', target, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', '-r', '24', mp4], { stdio: 'ignore' });
      if (existsSync(mp4)) { out = mp4; console.log('MP4=' + mp4); }
    } catch { console.warn('[recorder] ffmpeg-static not installed; .webm is the deliverable'); }
  }
  console.log('WEBM=' + (webm ? path.join(CONFIG.OUT_DIR, `${CONFIG.NAME}.webm`) : 'NONE'));
  console.log('SHOTS=' + shotN);
  console.log('OUTPUT=' + out);
  console.log('FILES=' + readdirSync(CONFIG.OUT_DIR).join(','));
  if (err) process.exit(1);
})().catch((e) => { console.error('RECORDER_ERROR', e); process.exit(1); });
