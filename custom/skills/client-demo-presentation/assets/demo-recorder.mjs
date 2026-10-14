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
import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync } from 'fs';
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
};

// Reserved subtitle strip at the bottom of the frame (~8% of height): captions live
// only inside it, so they never float over app content.
const CAPTION_LANE_PX = Math.max(56, Math.round(CONFIG.VIEWPORT.height * 0.082));
const CAPTION_FONT_PX = Math.max(16, Math.round(CONFIG.VIEWPORT.height * 0.02));

let voiceoverEngine = null;
let ffmpegPath = null;
if (CONFIG.VOICEOVER) {
  try {
    voiceoverEngine = resolveTtsEngine();
    ffmpegPath = requireFrom('ffmpeg-static');
    if (!ffmpegPath || !existsSync(ffmpegPath)) {
      throw new Error('ffmpeg-static did not provide an available executable path.');
    }
  } catch (e) {
    console.error(`[recorder] Voiceover unavailable: ${e.message}`);
    process.exit(1);
  }
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

    // Dedicated caption lane: a reserved strip across the bottom of the frame that
    // holds the subtitle text — it never floats over app content mid-screen.
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
  const context = await browser.newContext({
    viewport: CONFIG.VIEWPORT,
    recordVideo: { dir: videoDir, size: CONFIG.VIEWPORT },
  });
  await context.addInitScript(overlayInit, { lanePx: CAPTION_LANE_PX, fontPx: CAPTION_FONT_PX });
  const page = await context.newPage();

  const toUrl = (p) => (/^https?:\/\//.test(p) ? p : CONFIG.BASE.replace(/\/$/, '') + (p.startsWith('/') ? p : `/${p}`));
  const recordingStartedAt = process.hrtime.bigint();
  const captionTimeline = [];
  const elapsedMs = () => Number(process.hrtime.bigint() - recordingStartedAt) / 1e6;
  let shotN = 0;
  const laneTop = CONFIG.VIEWPORT.height - CAPTION_LANE_PX;
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
          execFileSync(ffmpegPath, ['-y', '-i', target, '-map', '0:v:0', '-map', '0:a:0',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(CONFIG.FPS),
            '-c:a', 'aac', '-b:a', '128k', mp4], { stdio: 'ignore' });
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
      try {
        const ffmpeg = requireFrom('ffmpeg-static');
        const mp4 = path.join(CONFIG.OUT_DIR, `${CONFIG.NAME}.mp4`);
        execFileSync(ffmpeg, ['-y', '-i', target, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart', '-r', String(CONFIG.FPS), mp4], { stdio: 'ignore' });
        if (existsSync(mp4)) { out = mp4; console.log('MP4=' + mp4); }
      } catch { console.warn('[recorder] ffmpeg-static not installed; .webm is the deliverable'); }
    }
  }
  console.log('WEBM=' + (webmOutput || 'NONE'));
  console.log('SHOTS=' + shotN);
  console.log('OUTPUT=' + (out || 'NONE'));
  console.log('FILES=' + readdirSync(CONFIG.OUT_DIR).join(','));
  if (err || voiceoverError) process.exit(1);
})().catch((e) => { console.error('RECORDER_ERROR', e); process.exit(1); });
