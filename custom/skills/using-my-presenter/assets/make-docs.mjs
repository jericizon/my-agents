/**
 * Demo walkthrough document generator (docx + pdf). Project-agnostic, self-contained.
 *
 * WHY THIS EXISTS
 * The presenter recorder already captures numbered milestone screenshots + a
 * shots.json sidecar ({n, file, label, caption, url}). This script turns a demo
 * session into a brief client-facing document — one section per feature, one
 * figure per screenshot, captioned with the subtitle text that was on screen.
 * It works on a fresh --screens-only capture or on an older session dir that
 * only has screenshots/ (filename labels become the captions).
 *
 * RUN (same module cache as the recorder — DEMO_MODULES or cwd):
 *   PLAYWRIGHT_BROWSERS_PATH="$CACHE/ms-browsers" \
 *     node make-docs.mjs --dir <clip-or-session-dir> \
 *       [--title "Client walkthrough"] [--subtitle "meta line"] \
 *       [--format docx|pdf|both] [--out <path-or-base>]
 *
 * ARGS
 *   --dir <path>     Clip dir (has screenshots/ or shots.json) or a session dir
 *                    containing numbered clip dirs — each becomes a doc section.
 *   --title <text>   Document title (default: humanized dir name).
 *   --subtitle <text> Meta line under the title (default: capture date + base URL
 *                    read from shots.json, else the dir's timestamp, else today).
 *   --format <f>     docx | pdf | both (default both). A failed format warns and
 *                    does not block the other; exit is 0 when ≥1 file is written.
 *   --out <path>     Output file for a single format, or base path when 'both'.
 *                    Default: <dir>/demo-docs.docx / demo-docs.pdf.
 *
 * OUTPUT MODEL (kept deliberately brief — the video carries the depth)
 *   Title + meta line · section heading per clip · per shot: "N. caption" + image.
 */
import { createRequire } from 'module';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

// Deps (docx for .docx, playwright+chromium for .pdf) resolve from the shared
// tooling cache — same convention as demo-recorder.mjs.
const MODULES_DIR = process.env.DEMO_MODULES || process.cwd();
const requireFrom = createRequire(path.join(MODULES_DIR, 'package.json'));

// ── arg parsing (same shape as demo-recorder) ────────────────────────────────
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
const strArg = (v) => (typeof v === 'string' ? v : null); // bare "--flag" parses as true

// "20250819_143022_pos-creation" → "Pos creation"; "02_login" → "Login";
// "001_email-entered.png" → "Email entered".
const humanize = (s) => String(s || '')
  .replace(/\.(png|jpe?g|webp|json)$/i, '')
  .replace(/^\d{8}_\d{6}[_-]/, '')   // session timestamp prefix
  .replace(/^\d+[_-]/, '')           // clip/shot order prefix
  .replace(/[-_]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Untitled';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// PNG pixel size from the IHDR header — no image library needed.
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ── discovery ────────────────────────────────────────────────────────────────
const hasShots = (d) => existsSync(path.join(d, 'screenshots')) || existsSync(path.join(d, 'shots.json'));

// One clip dir → one section; a session dir contributes its numbered clip dirs.
// A dir that has its own shots AND clip subdirs yields both (root section first).
function discoverSections(root) {
  const sections = [];
  if (hasShots(root)) sections.push({ name: humanize(path.basename(root)), dir: root });
  for (const e of readdirSync(root, { withFileTypes: true })
    .filter((x) => x.isDirectory() && !x.name.startsWith('.') && x.name !== 'screenshots')
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const sub = path.join(root, e.name);
    if (hasShots(sub)) sections.push({ name: humanize(e.name), dir: sub });
  }
  return sections;
}

// shots.json wins (real captions); bare screenshots/ falls back to filename labels.
function loadShots(secDir) {
  const sj = path.join(secDir, 'shots.json');
  if (existsSync(sj)) {
    try {
      const data = JSON.parse(readFileSync(sj, 'utf8'));
      const shots = (data.shots || [])
        .filter((s) => s && s.file && existsSync(path.join(secDir, s.file)))
        .sort((a, b) => (a.n || 0) - (b.n || 0))
        .map((s) => ({
          file: path.join(secDir, s.file),
          caption: s.caption || humanize(s.label || path.basename(s.file)),
          url: s.url || null,
        }));
      return { base: data.base || null, capturedAt: data.capturedAt || null, shots };
    } catch (e) {
      console.warn(`[make-docs] unreadable shots.json in ${secDir} — using filename captions (${e.message})`);
    }
  }
  const dir = path.join(secDir, 'screenshots');
  if (!existsSync(dir)) return { base: null, capturedAt: null, shots: [] };
  const shots = readdirSync(dir)
    .filter((f) => /\.png$/i.test(f)).sort()
    .map((f) => ({ file: path.join(dir, f), caption: humanize(f), url: null }));
  return { base: null, capturedAt: null, shots };
}

function buildModel(root, title, subtitle) {
  const sections = [];
  let base = null;
  let capturedAt = null;
  for (const sec of discoverSections(root)) {
    const { shots, base: b, capturedAt: c } = loadShots(sec.dir);
    if (!shots.length) continue;
    base = base || b;
    capturedAt = capturedAt || c;
    sections.push({ name: sec.name, shots });
  }
  // Meta line: shots.json provenance → session-dir timestamp → today.
  let dateStr = null;
  if (capturedAt) dateStr = new Date(capturedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  if (!dateStr) {
    const m = path.basename(root).match(/^(\d{4})(\d{2})(\d{2})_\d{6}/);
    if (m) dateStr = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  if (!dateStr) dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const meta = subtitle || [dateStr, base].filter(Boolean).join(' · ');
  return { title, meta, sections };
}

// ── docx (via the `docx` package in the tooling cache) ───────────────────────
async function loadDocx() {
  try { return requireFrom('docx'); }
  catch (e) {
    if (e && e.code === 'ERR_REQUIRE_ESM') {
      return import(pathToFileURL(requireFrom.resolve('docx')).href);
    }
    throw e;
  }
}

async function writeDocx(model, outPath) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = await loadDocx();
  const IMG_W = 620; // ≈6.5in usable width at 96dpi
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(model.title)] }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: model.meta, italics: true, color: '555555' })] }),
  ];
  for (const sec of model.sections) {
    if (model.sections.length > 1) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320 }, children: [new TextRun(sec.name)] }));
    }
    sec.shots.forEach((shot, i) => {
      const buf = readFileSync(shot.file);
      const dim = pngSize(buf) || { w: 1920, h: 1080 };
      children.push(new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: `${i + 1}. `, bold: true }), new TextRun(shot.caption)],
      }));
      children.push(new Paragraph({
        spacing: { after: 160 },
        children: [new ImageRun({ type: 'png', data: buf, transformation: { width: IMG_W, height: Math.round(IMG_W * dim.h / dim.w) } })],
      }));
    });
  }
  const buf = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  writeFileSync(outPath, buf);
  return outPath;
}

// ── pdf (generated HTML printed by the already-cached Chromium) ──────────────
function buildHtml(model) {
  const figs = [];
  for (const sec of model.sections) {
    if (model.sections.length > 1) figs.push(`<h2>${esc(sec.name)}</h2>`);
    sec.shots.forEach((shot, i) => {
      figs.push(`<figure>
  <figcaption><strong>${i + 1}.</strong> ${esc(shot.caption)}</figcaption>
  <img src="${esc(pathToFileURL(shot.file).href)}">
</figure>`);
    });
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:"Inter","Helvetica Neue",Helvetica,Arial,sans-serif;color:#111;max-width:960px;margin:0 auto;font-size:13px}
  h1{font-size:24px;margin:0 0 4px}
  .meta{color:#555;font-style:italic;margin:0 0 22px}
  h2{font-size:17px;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid #ddd;page-break-after:avoid}
  figure{margin:0 0 18px;page-break-inside:avoid}
  figcaption{margin:0 0 6px;color:#222}
  img{width:100%;border:1px solid #ddd;border-radius:6px}
</style></head><body>
<h1>${esc(model.title)}</h1>
<p class="meta">${esc(model.meta)}</p>
${figs.join('\n')}
</body></html>`;
}

async function writePdf(model, outPath) {
  const { chromium } = requireFrom('playwright'); // throws when absent
  const tmpHtml = path.join(os.tmpdir(), `demo-docs-${process.pid}-${Date.now()}.html`);
  writeFileSync(tmpHtml, buildHtml(model));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'load', timeout: 30000 });
    await page.pdf({
      path: outPath, format: 'A4', printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    });
  } finally {
    await browser.close();
    try { rmSync(tmpHtml, { force: true }); } catch { /* temp file cleanup is best-effort */ }
  }
  return outPath;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const dir = path.resolve(strArg(args.dir) || process.env.DEMO_DOCS_DIR || '.');
  if (!existsSync(dir)) { console.error(`[make-docs] --dir not found: ${dir}`); process.exit(1); }
  const format = String(strArg(args.format) || 'both').toLowerCase();
  if (!['docx', 'pdf', 'both'].includes(format)) {
    console.error(`[make-docs] --format must be docx|pdf|both, got: ${format}`); process.exit(1);
  }

  const model = buildModel(dir, strArg(args.title) || humanize(path.basename(dir)), strArg(args.subtitle));
  const totalShots = model.sections.reduce((n, s) => n + s.shots.length, 0);
  if (!totalShots) { console.error(`[make-docs] no screenshots found under ${dir}`); process.exit(1); }
  console.log(`[make-docs] ${totalShots} shot(s) across ${model.sections.length} section(s) → ${format}`);

  const outBase = strArg(args.out)
    ? path.resolve(strArg(args.out).replace(/\.(docx|pdf)$/i, ''))
    : path.join(dir, 'demo-docs');
  const wants = format === 'both' ? ['docx', 'pdf'] : [format];
  const produced = [];
  for (const fmt of wants) {
    const out = `${outBase}.${fmt}`;
    try {
      if (fmt === 'docx') await writeDocx(model, out);
      else await writePdf(model, out);
      produced.push(out);
      console.log(`${fmt.toUpperCase()}=${out}`);
    } catch (e) {
      console.warn(`[make-docs] ${fmt} generation failed (${e.message}) — continuing`);
    }
  }
  if (!produced.length) { console.error('[make-docs] no output produced'); process.exit(1); }
})().catch((e) => { console.error('MAKE_DOCS_ERROR', e); process.exit(1); });
