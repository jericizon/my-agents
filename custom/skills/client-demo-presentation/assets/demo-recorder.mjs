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
 *   --width <px>     Viewport width                     (env DEMO_WIDTH;  default 1920)
 *   --height <px>    Viewport height                    (env DEMO_HEIGHT; default 1080)
 *   --fps <n>        Output constant frame rate for .mp4 (env DEMO_FPS;   default 60)
 *   --no-chrome      Skip the macOS-style browser chrome mockup on the .mp4 (env DEMO_NO_CHROME)
 *   --headed         Run with a visible browser (needs a display; default headless)
 *   --voiceover      Generate TTS voiceover from h.caption() calls
 *
 * THE FLOW FILE (see example-flow.mjs next to this file):
 *   export default async function runFlow(page, h) { ... }
 *   `h` provides: h.BASE, h.viewport, h.goto(pathOrUrl), h.caption(text),
 *                 h.glideClick(locator, opts), h.glideTo(locator, opts),
 *                 h.highlight(locator, opts), h.clearHighlight(), h.explain(locator, text, opts),
 *                 h.type(locator, text), h.shot(label), h.sleep(ms).
 *
 * SCREENSHOTS
 *   Call h.shot('open') / h.shot('login-form') at each milestone. Files are written as
 *   numbered PNGs into <out>/screenshots/ (001_open.png, 002_login-form.png, ...).
 */
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, writeFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  generateVoiceoverSegments,
  isVoiceoverEnabled,
  muxVoiceover,
  resolveTtsEngine,
  verifyAudioStream,
} from './voiceover.mjs';

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
    width: Number(args.width || process.env.DEMO_WIDTH || 1920),
    height: Number(args.height || process.env.DEMO_HEIGHT || 1080),
  },
  HEADLESS: !(args.headed || process.env.DEMO_HEADED),
  VOICEOVER: isVoiceoverEnabled(args.voiceover ?? process.env.DEMO_VOICEOVER),
  FPS: Math.max(1, Math.round(Number(args.fps || process.env.DEMO_FPS) || 60)),
  // macOS-style browser chrome mockup composited above the recording in post.
  CHROME: !(args['no-chrome'] || /^(1|true|yes|on)$/i.test(String(process.env.DEMO_NO_CHROME ?? '').trim())),
};

// Layout of the composited .mp4 canvas: the recording floats as a browser window
// (chrome bar + page) on a dark backdrop with a drop shadow; subtitles burn into a
// dedicated strip BELOW the window — outside the browser, never over app content.
// All pixel constants are evened so libx264/yuv420p always gets even dimensions.
const even = (n) => n - (n % 2);
const CHROME_BAR_PX = even(Math.max(64, Math.round(CONFIG.VIEWPORT.height * 0.082)));
const MARGIN_X = even(Math.round(CONFIG.VIEWPORT.width * 0.025));
const MARGIN_TOP = MARGIN_X;
const CAPTION_GAP = even(Math.round(CONFIG.VIEWPORT.height * 0.026));
const CAPTION_STRIP = even(Math.max(80, Math.round(CONFIG.VIEWPORT.height * 0.089)));
const MARGIN_BOTTOM = even(Math.round(CONFIG.VIEWPORT.height * 0.041));
const CANVAS_W = even(CONFIG.VIEWPORT.width + (CONFIG.CHROME ? MARGIN_X * 2 : 0));
const CANVAS_H = even(CONFIG.CHROME
  ? MARGIN_TOP + CHROME_BAR_PX + CONFIG.VIEWPORT.height + CAPTION_GAP + CAPTION_STRIP + MARGIN_BOTTOM
  : CONFIG.VIEWPORT.height + CAPTION_GAP + CAPTION_STRIP + MARGIN_BOTTOM);
const WINDOW_RADIUS = 14;

let voiceoverEngine = null;
let ffmpegPath = null;
try {
  ffmpegPath = requireFrom('ffmpeg-static');
  if (!ffmpegPath || !existsSync(ffmpegPath)) ffmpegPath = null;
} catch { ffmpegPath = null; }
if (CONFIG.VOICEOVER) {
  try {
    voiceoverEngine = resolveTtsEngine();
  } catch (e) {
    console.error(`[recorder] Voiceover unavailable: ${e.message}`);
    process.exit(1);
  }
}
if (CONFIG.VOICEOVER && !ffmpegPath) {
  console.error('[recorder] Voiceover unavailable: ffmpeg-static is required but not installed.');
  process.exit(1);
}
// When ffmpeg can post-process, captions burn below the browser window; otherwise the
// in-page caption lane keeps captions visible in the raw .webm deliverable.
const BURN_CAPTIONS = !!ffmpegPath;
const IN_PAGE_LANE_PX = BURN_CAPTIONS ? 0 : Math.max(56, Math.round(CONFIG.VIEWPORT.height * 0.082));
const CAPTION_FONT_PX = Math.max(16, Math.round(CONFIG.VIEWPORT.height * 0.02));

// ── macOS-style browser mockup (floating window) ──────────────────────────────
// Two PNGs rendered with the same Chromium composite the mockup around the recording:
//   backdrop.png — dark canvas + the window's drop shadow (under the video)
//   frame.png    — chrome bar + rounded border ring with a transparent hole (over it)
// Subtitles burn below the window via a timed ASS track, so nothing covers app content.
const CHROME_STYLE = `
  html,body{margin:0;padding:0;background:transparent}
  .bar{position:relative;box-sizing:border-box;display:flex;align-items:center;
    background:linear-gradient(180deg,#f5f5f7 0%,#e9e9ee 100%);border-bottom:1px solid #c8c8d0}
  .lights{display:flex;gap:8px;margin-left:22px}
  .light{width:13px;height:13px;border-radius:50%;box-shadow:inset 0 0 1px rgba(0,0,0,.25)}
  .nav{display:flex;align-items:center;gap:16px;margin-left:28px}
  .pill{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:52%;height:56%;background:#fff;border:1px solid #d6d6dd;border-radius:10px;
    box-shadow:0 1px 2px rgba(0,0,0,.06)}
  .plus{position:absolute;right:24px;display:flex;align-items:center}
`;
const chromeBarInner = () => `
  <div class="lights">
    <span class="light" style="background:#ff5f57"></span>
    <span class="light" style="background:#febc2e"></span>
    <span class="light" style="background:#28c840"></span>
  </div>
  <div class="nav">
    <svg width="15" height="15" viewBox="0 0 15 15"><path d="M9.5 3 L5 7.5 L9.5 12" stroke="#7c7c84" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <svg width="15" height="15" viewBox="0 0 15 15"><path d="M5.5 3 L10 7.5 L5.5 12" stroke="#c6c6cd" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span style="font-size:15px;line-height:1;color:#7c7c84">&#8635;</span>
  </div>
  <div class="pill"></div>
  <div class="plus"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2 V12 M2 7 H12" stroke="#a6a6ae" stroke-width="1.6" stroke-linecap="round"/></svg></div>
`;
// Browser window frame: chrome bar on top, transparent hole for the recording,
// thin border ring with rounded bottom corners so the video's square edges hide.
const frameDoc = (width, height, chromePx, radius) => `<!doctype html><html><head><meta charset="utf-8">
<style>${CHROME_STYLE}
  .win{position:relative;width:${width}px;height:${height}px}
  .bar{width:${width}px;height:${chromePx}px;border-radius:${radius}px ${radius}px 0 0}
  .ring{position:absolute;left:0;right:0;top:${chromePx}px;bottom:0;
    border:2px solid #cfd2d8;border-top:none;border-radius:0 0 ${radius}px ${radius}px}
</style></head><body>
<div class="win"><div class="bar">${chromeBarInner()}</div><div class="ring"></div></div>
</body></html>`;
// Canvas backdrop: dark gradient + the floating window's drop shadow.
const backdropDoc = (width, height, winX, winY, winW, winH, radius) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0}
  body{width:${width}px;height:${height}px;background:linear-gradient(180deg,#141821 0%,#0b0d12 100%)}
  .win{position:absolute;left:${winX}px;top:${winY}px;width:${winW}px;height:${winH}px;
    background:#fff;border-radius:${radius}px;
    box-shadow:0 30px 80px rgba(0,0,0,.55),0 8px 24px rgba(0,0,0,.45)}
</style></head><body><div class="win"></div></body></html>`;

const assTime = (ms) => {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

// Timed text track (URL pill text, burned captions). PlayRes matches the composite
// canvas, so alignment + margins land exactly where the layout puts them.
function buildAssTrack(segments, { fontPx, color, align, marginV, marginLR, wrap }) {
  const dialogues = [];
  segments.forEach((seg, i) => {
    let text = String(seg.text ?? '').replace(/[{}]/g, '').trim();
    if (!text) return;
    const start = Math.max(0, Math.round(seg.at));
    const end = Math.round(segments[i + 1]?.at ?? 3.6e6);
    if (end <= start) return;
    dialogues.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Demo,,,,,,${text}`);
  });
  if (!dialogues.length) return null;
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${CANVAS_W}`,
    `PlayResY: ${CANVAS_H}`,
    `WrapStyle: ${wrap}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Demo,sans-serif,${fontPx},${color},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,${align},${marginLR},${marginLR},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogues,
    '',
  ].join('\n');
}

// ── Injected per-document overlay: animated cursor + caption lane + spotlight ──
// Runs before page scripts on every navigation, so it survives reloads/route changes.
const overlayInit = ({ lanePx, fontPx }) => {
  const install = () => {
    if (document.getElementById('__demoCursor')) return;
    // Real arrow-pointer glyph (SVG), not a dot — tip sits at (4,2) in the 28x28 box.
    const cursorSvg = encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">'
      + '<path d="M4 2 L4 21 L9.5 16.2 L13.2 23.5 L16.8 21.7 L13.2 14.5 L20.5 14.5 Z" '
      + 'fill="#ffffff" stroke="#000000" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    );
    const c = document.createElement('div');
    c.id = '__demoCursor';
    c.style.cssText = [
      'position:fixed', 'left:-50px', 'top:-50px', 'width:28px', 'height:28px',
      'margin:-2px 0 0 -4px', `background:url("data:image/svg+xml,${cursorSvg}") no-repeat`,
      'background-size:contain', 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))',
      'z-index:2147483647', 'pointer-events:none', 'transform-origin:4px 2px',
      'transition:transform .1s ease',
    ].join(';');
    document.documentElement.appendChild(c);

    // Cursor glide driven by requestAnimationFrame: every rAF tick repaints, so the
    // captured cursor motion is as smooth as the display pipeline allows (~60fps).
    // While a glide is running, real mousemove events are ignored so they can't yank
    // the cursor mid-animation; h.glideTo syncs the real pointer afterwards.
    window.__demoGlide = (x, y, ms) => new Promise((done) => {
      window.__demoCursorBusy = true;
      const sx = parseFloat(c.style.left) || 0;
      const sy = parseFloat(c.style.top) || 0;
      const dur = (Number.isFinite(ms) && ms > 0)
        ? ms
        : Math.min(950, Math.max(380, Math.hypot(x - sx, y - sy) * 1.15));
      let settled = false;
      const finish = () => {
        if (settled) return; // ignore the safety timeout if rAF already finished
        settled = true;
        c.style.left = `${x}px`; c.style.top = `${y}px`;
        window.__demoCursorBusy = false;
        done();
      };
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2; // easeInOutCubic
        c.style.left = `${sx + (x - sx) * e}px`;
        c.style.top = `${sy + (y - sy) * e}px`;
        if (p < 1) requestAnimationFrame(step);
        else finish();
      };
      requestAnimationFrame(step);
      setTimeout(finish, dur + 600); // safety net if rAF stalls (e.g. occluded headless)
    });

    // Dedicated caption lane (fallback only, when ffmpeg can't burn captions below
    // the browser window): a reserved strip across the bottom of the frame that
    // holds the subtitle text — it never floats over app content mid-screen.
    if (lanePx > 0) {
      const cap = document.createElement('div');
      cap.id = '__demoCaption';
      cap.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', `height:${lanePx}px`,
        'display:flex', 'align-items:center', 'justify-content:center',
        'padding:0 48px', 'box-sizing:border-box',
        'background:rgba(8,9,12,.97)', 'border-top:1px solid rgba(255,255,255,.08)',
        'z-index:2147483647', 'pointer-events:none',
      ].join(';');
      const capText = document.createElement('div');
      capText.id = '__demoCaptionText';
      capText.style.cssText = [
        'color:#f4f5f7', `font:600 ${fontPx}px/1.4 "Inter","Helvetica Neue",Helvetica,Arial,sans-serif`,
        'letter-spacing:.15px', 'text-align:center', 'max-width:82%',
        'opacity:0', 'transition:opacity .2s ease',
      ].join(';');
      cap.appendChild(capText);
      document.documentElement.appendChild(cap);
    }

    // Spotlight: modern product-tour look — the rest of the page dims behind a scrim
    // while the narrated element stays lit inside a soft glowing accent ring.
    const style = document.createElement('style');
    style.textContent = '@keyframes __demoPulse {'
      + '0%,100% { box-shadow:0 0 0 9999px rgba(8,9,12,.55), 0 0 0 3px rgba(99,102,241,.30), 0 0 22px rgba(99,102,241,.35); }'
      + '50% { box-shadow:0 0 0 9999px rgba(8,9,12,.55), 0 0 0 6px rgba(99,102,241,.16), 0 0 36px rgba(99,102,241,.55); } }';
    document.documentElement.appendChild(style);

    const hl = document.createElement('div');
    hl.id = '__demoHighlight';
    hl.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:-9999px', 'width:0', 'height:0',
      'border:2px solid #6366f1', 'border-radius:10px',
      'animation:__demoPulse 1.6s ease-in-out infinite',
      'z-index:2147483646', 'pointer-events:none', 'opacity:0',
      'transition:left .25s ease, top .25s ease, width .25s ease, height .25s ease, opacity .2s ease',
    ].join(';');
    document.documentElement.appendChild(hl);

    addEventListener('mousemove', (e) => {
      if (window.__demoCursorBusy) return;
      c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`;
    }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(.85)'; }, true);
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

  // Render the mockup PNGs with the same Chromium (clean contexts, no overlay scripts).
  let backdropPng = null;
  let framePng = null;
  if (CONFIG.CHROME) {
    const winW = CONFIG.VIEWPORT.width;
    const winH = CHROME_BAR_PX + CONFIG.VIEWPORT.height;
    const renderPng = async (html, file, width, height, transparent = false) => {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const p = await ctx.newPage();
      await p.setContent(html);
      await p.screenshot({ path: file, omitBackground: transparent });
      await ctx.close();
    };
    backdropPng = path.join(CONFIG.OUT_DIR, 'backdrop.png');
    framePng = path.join(CONFIG.OUT_DIR, 'frame.png');
    await renderPng(backdropDoc(CANVAS_W, CANVAS_H, MARGIN_X, MARGIN_TOP, winW, winH, WINDOW_RADIUS), backdropPng, CANVAS_W, CANVAS_H);
    await renderPng(frameDoc(winW, winH, CHROME_BAR_PX, WINDOW_RADIUS), framePng, winW, winH, true);
  }

  const context = await browser.newContext({
    viewport: CONFIG.VIEWPORT,
    recordVideo: { dir: videoDir, size: CONFIG.VIEWPORT },
  });
  await context.addInitScript(overlayInit, { lanePx: IN_PAGE_LANE_PX, fontPx: CAPTION_FONT_PX });
  const page = await context.newPage();

  const toUrl = (p) => (/^https?:\/\//.test(p) ? p : CONFIG.BASE.replace(/\/$/, '') + (p.startsWith('/') ? p : `/${p}`));
  const recordingStartedAt = process.hrtime.bigint();
  const captionTimeline = [];
  const elapsedMs = () => Number(process.hrtime.bigint() - recordingStartedAt) / 1e6;
  // URL timeline for the chrome pill: poll page.url() so both full navigations and
  // SPA route changes (pushState) are captured with wall-clock timing.
  const urlTimeline = [];
  const urlPoller = CONFIG.CHROME ? setInterval(() => {
    try {
      const raw = page.url();
      const url = raw === 'about:blank' ? '' : raw;
      const last = urlTimeline[urlTimeline.length - 1];
      if (url !== (last ? last.url : undefined)) urlTimeline.push({ url, at: elapsedMs() });
    } catch { /* page is closing */ }
  }, 200) : null;
  let shotN = 0;
  const laneTop = CONFIG.VIEWPORT.height - IN_PAGE_LANE_PX;
  const hideHighlight = () => page.evaluate(() => {
    const el = document.getElementById('__demoHighlight');
    if (el) el.style.opacity = '0';
  }).catch(() => {});
  // Measure an element for cursor/spotlight placement. When the target is off-screen
  // or would land under the caption lane, bring it into view with native smooth
  // scrolling and wait for the scroll to settle before reporting the box.
  const targetBox = async (loc) => {
    let b = await loc.boundingBox().catch(() => null);
    if (!b) {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      b = await loc.boundingBox().catch(() => null);
      if (!b) return null;
    }
    if (b.y < 0 || b.y + b.height > laneTop - 8) {
      await loc.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
      const deadline = Date.now() + 1500;
      let last = null;
      while (Date.now() < deadline) {
        await sleep(120);
        const next = await loc.boundingBox().catch(() => null);
        const stable = next && last
          && Math.abs(next.x - last.x) < 1 && Math.abs(next.y - last.y) < 1
          && Math.abs(next.width - last.width) < 1 && Math.abs(next.height - last.height) < 1;
        last = next || last;
        if (stable) break;
      }
      b = last || b;
    }
    return b;
  };
  // Animate the overlay cursor to the box center, then park the real pointer there
  // so hover state/click land correctly.
  const glideCursor = async (b, ms) => {
    const x = b.x + b.width / 2;
    const y = Math.min(b.y + b.height / 2, laneTop - 4);
    await page.evaluate(([px, py, d]) => (
      window.__demoGlide ? window.__demoGlide(px, py, d) : null
    ), [x, y, ms]).catch(() => {});
    await page.mouse.move(x, y).catch(() => {});
  };
  const h = {
    page, BASE: CONFIG.BASE, viewport: CONFIG.VIEWPORT, sleep,
    goto: async (p = '/', opts = {}) => {
      await hideHighlight(); // never carry the spotlight across a navigation
      return page.goto(toUrl(p), { waitUntil: 'networkidle', ...opts });
    },
    caption: async (t) => {
      const text = String(t ?? '');
      captionTimeline.push({ text, at: elapsedMs() });
      await page.evaluate((x) => {
        const cap = document.getElementById('__demoCaptionText');
        if (cap) { cap.textContent = x; cap.style.opacity = x ? '1' : '0'; }
      }, text).catch(() => {});
    },
    glideTo: async (loc, { ms } = {}) => {
      await hideHighlight(); // fade the old spotlight before the cursor moves on
      const b = await targetBox(loc);
      if (b) await glideCursor(b, ms);
    },
    glideClick: async (loc, { ms, settle = 350 } = {}) => {
      await hideHighlight();
      const b = await targetBox(loc);
      if (b) { await glideCursor(b, ms); await sleep(settle); }
      await loc.click();
    },
    // Draw the spotlight ring around an element's bounding rect (viewer focus cue).
    highlight: async (loc, { padding = 8 } = {}) => {
      const b = await targetBox(loc);
      if (!b) return;
      await page.evaluate(({ x, y, w, hgt, pad }) => {
        const el = document.getElementById('__demoHighlight');
        if (!el) return;
        el.style.left = `${x - pad}px`;
        el.style.top = `${y - pad}px`;
        el.style.width = `${w + pad * 2}px`;
        el.style.height = `${hgt + pad * 2}px`;
        el.style.opacity = '1';
      }, { x: b.x, y: b.y, w: b.width, hgt: b.height, pad: padding }).catch(() => {});
    },
    clearHighlight: hideHighlight,
    // Compound "explain this element" beat: glide cursor + spotlight + subtitle + read pause.
    // Use this to walk every meaningful control on a page, not only the ones acted on.
    explain: async (loc, text, { ms, read = 1800 } = {}) => {
      await h.glideTo(loc, { ms });
      await h.highlight(loc);
      await h.caption(text);
      await sleep(read);
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
  if (urlPoller) clearInterval(urlPoller);

  const video = page.video();
  await context.close(); // flushes the .webm
  await browser.close();

  const webm = video ? await video.path() : null;
  let webmOutput = null;
  let out = null;
  let voiceoverError = null;
  if (webm) {
    const target = path.join(CONFIG.OUT_DIR, `${CONFIG.NAME}.webm`);
    rmSync(target, { force: true });

    // Composite for the .mp4: the recording floats as a browser window on a dark
    // backdrop (backdrop shadow < video < frame ring), the live URL burns into the
    // pill, and captions burn into the strip BELOW the window. The .webm stays raw.
    let extraInputArgs = [];
    let videoChain = ''; // empty = start straight from [0:v]
    let urlAssFile = null;
    if (CONFIG.CHROME && backdropPng && framePng) {
      const urlFontPx = Math.max(20, Math.round(CANVAS_W * 0.015));
      const urlSegments = urlTimeline.map((s) => {
        const raw = (s.url === 'about:blank' ? '' : String(s.url || '')).replace(/[{}]/g, '').trim();
        return { text: raw.length > 96 ? `${raw.slice(0, 93)}...` : raw, at: s.at };
      });
      const urlAss = buildAssTrack(urlSegments, {
        fontPx: urlFontPx,
        color: '&H003E3A3A',
        align: 8, // top-center, inside the URL pill
        marginV: MARGIN_TOP + Math.max(8, Math.round((CHROME_BAR_PX - urlFontPx * 1.25) / 2)),
        marginLR: MARGIN_X + Math.round(CONFIG.VIEWPORT.width * 0.24),
        wrap: 2,
      });
      urlAssFile = urlAss ? 'url.ass' : null;
      if (urlAss) writeFileSync(path.join(CONFIG.OUT_DIR, urlAssFile), urlAss);
      extraInputArgs = ['-loop', '1', '-i', 'backdrop.png', '-loop', '1', '-i', 'frame.png'];
      videoChain = `[1:v][0:v]overlay=${MARGIN_X}:${MARGIN_TOP + CHROME_BAR_PX}:shortest=1[v1];`
        + `[v1][2:v]overlay=${MARGIN_X}:${MARGIN_TOP}:shortest=1[v2]`;
    }
    let captionsFile = null;
    if (BURN_CAPTIONS) {
      const capFontPx = Math.max(20, Math.round(CAPTION_STRIP * 0.25));
      const capAss = buildAssTrack(captionTimeline, {
        fontPx: capFontPx,
        color: '&H00F7F5F4',
        align: 2, // bottom-center, in the strip below the browser window
        marginV: MARGIN_BOTTOM + Math.max(8, Math.round((CAPTION_STRIP - capFontPx * 1.25) / 2)),
        marginLR: Math.round(CANVAS_W * 0.12),
        wrap: 0,
      });
      if (capAss) {
        writeFileSync(path.join(CONFIG.OUT_DIR, 'captions.ass'), capAss);
        captionsFile = 'captions.ass';
      }
    }
    const subFilters = [];
    if (urlAssFile) subFilters.push('subtitles=url.ass');
    if (captionsFile) subFilters.push('subtitles=captions.ass');
    if (subFilters.length) {
      videoChain = videoChain.startsWith('[1:v]')
        ? `${videoChain};[v2]${subFilters.join(',')}[vout]`
        : `[0:v]pad=ceil(iw/2)*2:ih+${CAPTION_GAP + CAPTION_STRIP + MARGIN_BOTTOM}:0:0:color=0x0b0d12[v1];[v1]${subFilters.join(',')}[vout]`;
    } else if (videoChain.startsWith('[1:v]')) {
      videoChain += ';[v2]null[vout]';
    } else {
      videoChain = '[0:v]null[vout]';
    }

    if (CONFIG.VOICEOVER) {
      const voiceoverDir = path.join(CONFIG.OUT_DIR, '.voiceover');
      try {
        const audioFiles = generateVoiceoverSegments({
          captions: captionTimeline,
          engine: voiceoverEngine,
          outputDir: voiceoverDir,
        });
        muxVoiceover({
          ffmpeg: ffmpegPath,
          inputVideo: webm,
          audioFiles,
          captions: captionTimeline,
          output: target,
          format: 'webm',
          fps: CONFIG.FPS,
        });
        verifyAudioStream({ ffmpeg: ffmpegPath, mediaPath: target });
        webmOutput = target;
        out = target;
        console.log('AUDIO_STREAM=' + target);

        const mp4 = path.join(CONFIG.OUT_DIR, `${CONFIG.NAME}.mp4`);
        try {
          const mp4Args = ['-y', '-i', target, ...extraInputArgs,
            '-filter_complex', videoChain, '-map', '[vout]', '-map', '0:a:0',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(CONFIG.FPS),
            '-c:a', 'aac', '-b:a', '128k', mp4];
          execFileSync(ffmpegPath, mp4Args, { cwd: CONFIG.OUT_DIR, stdio: 'ignore' });
          verifyAudioStream({ ffmpeg: ffmpegPath, mediaPath: mp4 });
          if (existsSync(mp4)) { out = mp4; console.log('MP4=' + mp4); console.log('AUDIO_STREAM=' + mp4); }
        } catch (e) {
          rmSync(mp4, { force: true });
          console.warn(`[recorder] MP4 voiceover conversion failed; audio WebM is the deliverable: ${e.message}`);
        }
      } catch (e) {
        voiceoverError = e;
        rmSync(target, { force: true });
        console.error('VOICEOVER_ERROR', e.message);
      } finally {
        rmSync(voiceoverDir, { recursive: true, force: true });
      }
    } else {
      copyFileSync(webm, target); // stable, predictable name
      webmOutput = target;
      out = target;
      const ffmpeg = requireFrom('ffmpeg-static');
      const mp4 = path.join(CONFIG.OUT_DIR, `${CONFIG.NAME}.mp4`);
      try {
        const mp4Args = ['-y', '-i', target, ...extraInputArgs,
          '-filter_complex', videoChain, '-map', '[vout]',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart', '-r', String(CONFIG.FPS), mp4];
        execFileSync(ffmpeg, mp4Args, { cwd: CONFIG.OUT_DIR, stdio: 'ignore' });
        if (existsSync(mp4)) { out = mp4; console.log('MP4=' + mp4); }
      } catch (e) {
        rmSync(mp4, { force: true }); // never leave a partial mp4 behind
        console.warn(`[recorder] MP4 conversion failed; .webm is the deliverable: ${e.message}`);
      }
    }
  }
  if (BURN_CAPTIONS || backdropPng) { // transient composite assets — regenerable on every run
    for (const asset of ['backdrop.png', 'frame.png', 'url.ass', 'captions.ass']) {
      rmSync(path.join(CONFIG.OUT_DIR, asset), { force: true });
    }
  }
  // Cleanup: keep only the final video + screenshots. The raw Playwright capture and
  // the .webm copy are intermediates — removed once the .mp4 exists; the .webm stays
  // only as the fallback deliverable when mp4 encoding failed.
  rmSync(videoDir, { recursive: true, force: true });
  if (out && out.endsWith('.mp4')) {
    rmSync(path.join(CONFIG.OUT_DIR, `${CONFIG.NAME}.webm`), { force: true });
  }
  console.log('WEBM=' + (webmOutput || 'NONE'));
  console.log('SHOTS=' + shotN);
  console.log('OUTPUT=' + (out || 'NONE'));
  console.log('FILES=' + readdirSync(CONFIG.OUT_DIR).join(','));
  if (err || voiceoverError) process.exit(1);
})().catch((e) => { console.error('RECORDER_ERROR', e); process.exit(1); });
