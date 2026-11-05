import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  audioDurationMs,
  buildAudioMixFilter,
  buildMuxArgs,
  createNarrationGate,
  createNarrator,
  extractNarrationTexts,
} from '../custom/skills/using-my-presenter/assets/voiceover.mjs';

// PCM16 mono WAV of exactly `seconds` — enough RIFF structure for the parser.
function wavBytes(seconds, rate = 8000) {
  const data = Buffer.alloc(Math.round(seconds * rate) * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const fakeEngine = { kind: 'voicestudio', baseUrl: 'http://vs.test', model: 'omnivoice', voice: 'v', speed: 1.2, seed: 1, instructions: '' };
const wavResponse = (seconds) => async () => new Response(wavBytes(seconds));

// Virtual clock: sleep() fast-forwards time so blocking waits are deterministic.
function virtualClock() {
  const clock = { t: 0 };
  return {
    now: () => clock.t,
    sleep: (ms) => { clock.t += ms; return Promise.resolve(); },
    time: () => clock.t,
  };
}

function tmpDir() {
  const d = mkdtempSync(path.join(tmpdir(), 'vo-test-'));
  return d;
}

// ── audioDurationMs ──────────────────────────────────────────────────────────
test('audioDurationMs measures real wav duration', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'a.wav');
    writeFileSync(f, wavBytes(1.5));
    assert.equal(audioDurationMs(f), 1500);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('audioDurationMs returns null for non-wav input', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'a.wav');
    writeFileSync(f, 'not audio');
    assert.equal(audioDurationMs(f), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── createNarrationGate ──────────────────────────────────────────────────────
test('gate does not block when no narration is active', async () => {
  const clock = virtualClock();
  const gate = createNarrationGate({ now: clock.now, sleep: clock.sleep, gapMs: 350 });
  await gate.wait();
  assert.equal(clock.time(), 0);
});

test('gate holds the scene until narration end + gap, however long the narration is', async () => {
  const clock = virtualClock();
  const gate = createNarrationGate({ now: clock.now, sleep: clock.sleep, gapMs: 350 });
  gate.start({ at: 0, durationMs: 2000 });
  await gate.wait();
  assert.equal(clock.time(), 2350);
  // a long narration is never capped — the scene simply extends
  gate.start({ at: clock.time(), durationMs: 60000 });
  await gate.wait();
  assert.equal(clock.time(), 2350 + 60000 + 350); // held through end + gap
});

test('gate starts a second segment only after the first fully ends', async () => {
  const clock = virtualClock();
  const gate = createNarrationGate({ now: clock.now, sleep: clock.sleep, gapMs: 350 });
  gate.start({ at: 0, durationMs: 2000 });
  await gate.wait();
  const secondAt = clock.time();
  assert.ok(secondAt >= 2000 + 350, `second segment at ${secondAt} overlaps first end ${2000}`);
});

test('gate waitSpeech releases at audio end; waitBeat holds the breath', async () => {
  const clock = virtualClock();
  const gate = createNarrationGate({ now: clock.now, sleep: clock.sleep, gapMs: 350 });
  gate.start({ at: 0, durationMs: 2000 });
  await gate.waitSpeech();
  assert.equal(clock.time(), 2000); // mechanics move the instant speech ends
  await gate.waitBeat();
  assert.equal(clock.time(), 2350); // only the next spoken line holds the gap
});

// ── createNarrator ───────────────────────────────────────────────────────────
test('narrate blocks for the REAL measured duration, not an estimate', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  const captions = [];
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: wavResponse(4.25), // 4.25s of speech for a short caption
      onCaption: (text, at) => { captions.push({ text, at }); },
    });
    await narrator.narrate('Hi');
    // returned right at the real 4250ms audio end — no estimation involved; the
    // breath gap belongs to the NEXT beat's pre-wait, not this call's post-hold
    assert.equal(clock.time(), 4250);
    assert.equal(narrator.segments.length, 1);
    assert.equal(narrator.segments[0].durationMs, 4250);
    assert.equal(narrator.segments[0].at, 0);
    assert.deepEqual(captions, [{ text: 'Hi', at: 0 }]);
    assert.ok(existsSync(narrator.segments[0].file));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('consecutive narrations never overlap', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: wavResponse(3),
      onCaption: () => {},
    });
    await narrator.narrate('first');
    await narrator.narrate('second');
    const [a, b] = narrator.segments;
    assert.ok(b.at >= a.at + a.durationMs + 350, `second at ${b.at} before first end+gap ${a.at + a.durationMs + 350}`);
    assert.equal(clock.time(), b.at + b.durationMs); // narrate returns at speech end
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('helpers release at speech end while the next spoken line still holds the breath', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: wavResponse(1),
      onCaption: () => {},
    });
    await narrator.narrate('first');
    assert.equal(clock.time(), 1000); // narrate returns at speech end, not end+gap
    // a gated helper (cursor glide, spotlight, navigation) may move NOW —
    // during the breath — instead of waiting it out frozen
    await narrator.waitForNarration();
    assert.equal(clock.time(), 1000);
    await narrator.narrate('second');
    const [a, b] = narrator.segments;
    assert.equal(b.at, a.at + a.durationMs + 350); // breath preserved between lines
    narrator.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('waitForNarration resolves immediately once narration finished', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: wavResponse(1),
      onCaption: () => {},
    });
    await narrator.narrate('done');
    const t = clock.time();
    await narrator.waitForNarration();
    assert.equal(clock.time(), t); // no extra blocking when idle
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('narrate without an engine is a visual caption + read hold (no audio, no crash)', async () => {
  const clock = virtualClock();
  const captions = [];
  let fetchCalls = 0;
  const narrator = createNarrator({
    engine: null,
    outputDir: '/nonexistent-dir-should-not-be-created',
    now: clock.now,
    sleep: clock.sleep,
    gapMs: 350,
    silentReadMs: 1500,
    fetchImpl: async () => { fetchCalls += 1; return new Response('x'); },
    onCaption: (text, at) => { captions.push({ text, at }); },
  });
  await narrator.narrate('silent caption');
  assert.equal(fetchCalls, 0);
  assert.equal(narrator.segments.length, 0);
  assert.deepEqual(captions, [{ text: 'silent caption', at: 0 }]);
  assert.equal(clock.time(), 1500);
});

test('TTS failure degrades to a visual caption instead of crashing the flow', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  const captions = [];
  const warnings = [];
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: async () => { throw new Error('TTS down'); },
      onCaption: (text, at) => { captions.push({ text, at }); },
      onWarn: (m) => warnings.push(m),
    });
    await narrator.narrate('still works');
    assert.equal(narrator.segments.length, 0);
    assert.deepEqual(captions, [{ text: 'still works', at: 0 }]);
    assert.equal(clock.time(), 1500); // fell back to the silent read hold
    assert.ok(warnings.length >= 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unmeasurable audio is dropped (visual caption), never guessed at', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  const warnings = [];
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: async () => new Response('not a wav'),
      onCaption: () => {},
      onWarn: (m) => warnings.push(m),
    });
    await narrator.narrate('odd audio');
    assert.equal(narrator.segments.length, 0);
    assert.equal(clock.time(), 1500);
    assert.ok(warnings.length >= 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('caption shown at narration start and held through it (start == audio start)', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  const shown = [];
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: wavResponse(2),
      onCaption: (text, at) => { shown.push(at); },
    });
    await narrator.narrate('sync');
    assert.deepEqual(shown, [0]);
    assert.equal(narrator.segments[0].at, shown[0]); // caption start == audio start
    assert.ok(clock.time() >= shown[0] + 2000); // still on screen when audio ends
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── mix filter: narration is NEVER sped up to fit ────────────────────────────
test('mix filter delays and normalizes but never time-stretches audio', () => {
  const filter = buildAudioMixFilter([{ text: 'a', at: 0 }, { text: 'b', at: 5000 }], {}, 0);
  assert.ok(!/atempo/.test(filter), 'filter must not contain atempo');
  assert.ok(!/asetrate|aresample=.*24000|rubberband/.test(filter), 'no speed-changing filters');
  assert.ok(filter.includes('adelay=5000'));
  assert.ok(filter.includes('amix=inputs=2'));
  assert.ok(filter.includes('loudnorm')); // loudness normalization stays — it does not alter duration
});

test('mux args contain no tempo manipulation', () => {
  const args = buildMuxArgs({
    inputVideo: 'in.webm',
    audioFiles: ['a.wav', 'b.wav'],
    captions: [{ text: 'a', at: 0 }, { text: 'b', at: 5000 }],
    output: 'out.webm',
    format: 'webm',
    fps: 60,
  });
  assert.ok(!args.join(' ').includes('atempo'));
});

// End-to-end with the real ffmpeg binary (skipped when ffmpeg-static isn't
// installed): the mix preserves each segment's duration — last word included.
let ffmpegBin = null;
try {
  const requireCache = createRequire(path.join(process.env.HOME || '', '.cache/client-demo-presentation/package.json'));
  ffmpegBin = requireCache('ffmpeg-static');
} catch { /* tooling cache absent */ }

test('mixed audio keeps real segment durations end-to-end', { skip: !ffmpegBin && 'ffmpeg-static not installed' }, () => {
  const dir = tmpDir();
  try {
    const a = path.join(dir, 'a.wav');
    const b = path.join(dir, 'b.wav');
    const outWav = path.join(dir, 'out.wav');
    writeFileSync(a, wavBytes(2));
    writeFileSync(b, wavBytes(3));
    // narrate() placed the beats: b starts only after a (2s) + gap (350ms) → at 2700
    // inputOffset -1: no video input here, so the wavs are ffmpeg inputs 0 and 1
    const filter = buildAudioMixFilter([{ text: 'a', at: 0 }, { text: 'b', at: 2700 }], {}, -1);
    execFileSync(ffmpegBin, ['-y', '-v', 'error', '-i', a, '-i', b,
      '-filter_complex', filter, '-map', '[anorm]', outWav]);
    const dur = audioDurationMs(outWav);
    // expected: last segment ends at 2700+3000=5700ms — full tail present, ±150ms codec slack
    assert.ok(dur > 5550 && dur < 6000, `mixed duration ${dur}ms — expected ~5700ms`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── extractNarrationTexts: prefetch scan of the flow source ─────────────────
test('extracts narrate() arg0 and explain() arg1 in source order, deduped', () => {
  const src = `
    await h.narrate('Welcome');
    await h.explain(page.getByLabel(/email/i), 'Your account email');
    await h.narrate('Step 1');
    await h.narrate('Welcome'); // repeat — deduped
    await h.caption('visual only — not spoken');
  `;
  assert.deepEqual(extractNarrationTexts(src), ['Welcome', 'Your account email', 'Step 1']);
});

test('skips calls inside comments and strings', () => {
  const src = `
    await h.narrate('real line');
    //   await h.narrate('commented out');
    /* await h.explain(x, 'block commented'); */
    const s = "h.narrate('inside a string')";
    await h.narrate('second');
  `;
  assert.deepEqual(extractNarrationTexts(src), ['real line', 'second']);
});

test('handles escapes, double quotes, template literals and concatenation', () => {
  const src = `
    await h.narrate('it\\'s masked as you type');
    await h.narrate("double quoted");
    await h.narrate(\`static template\`);
    await h.narrate('part one' + ' part two');
    await h.narrate(\`dynamic \${count} template\`);
  `;
  assert.deepEqual(extractNarrationTexts(src), [
    "it's masked as you type",
    'double quoted',
    'static template',
    'part one part two',
  ]);
});

test('skips non-literal arguments instead of evaluating them', () => {
  let sideEffect = 0;
  globalThis.__narrateSideEffect = () => { sideEffect += 1; return 'nope'; };
  const src = `
    await h.narrate(getLine());
    await h.narrate(variable);
    await h.narrate(__narrateSideEffect());
    await h.explain(page.getByText(/ok/i));
    await h.narrate('literal survives');
  `;
  assert.deepEqual(extractNarrationTexts(src), ['literal survives']);
  assert.equal(sideEffect, 0); // extraction must never execute flow expressions
});

test('locator args with regexes and commas do not break explain() parsing', () => {
  const src = `
    await h.explain(page.getByRole('link', { name: /forgot password/i }), 'Starts the reset flow');
    await h.explain(page.locator('[data-x="a,b"]'), 'Comma in selector');
    await h.explain(page.getByLabel(/[,;]/), 'Regex with a comma');
    await h.explain(page.getByText('multi, word'), 'Text with a comma');
  `;
  assert.deepEqual(extractNarrationTexts(src), [
    'Starts the reset flow',
    'Comma in selector',
    'Regex with a comma',
    'Text with a comma',
  ]);
});

test('extracts from the bundled example flow including conditionals', () => {
  const example = readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname),
      '../custom/skills/using-my-presenter/assets/example-flow.mjs'),
    'utf8',
  );
  const lines = extractNarrationTexts(example);
  assert.ok(lines.includes('Welcome — this demo shows how to log in'));
  assert.ok(lines.includes('This field is your account email — the one you signed up with'));
  assert.ok(lines.includes('Your password goes here — it\'s masked as you type for privacy'));
  assert.ok(lines.includes('Step 3 · Click "Sign in"'));
  // the commented-out downstream pattern must NOT be extracted
  assert.ok(!lines.some((l) => l.includes('published page live')));
  assert.ok(!lines.some((l) => l.includes('now live for visitors')));
});

// ── narration prefetch: synthesis leaves the recorded timeline ───────────────
test('a prefetched line plays with zero on-camera synthesis stall', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  const shown = [];
  let fetches = 0;
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: async () => { fetches += 1; await clock.sleep(2000); return new Response(wavBytes(1)); },
      onCaption: (text, at) => { shown.push({ text, at }); },
    });
    narrator.prefetch(['ready line']);
    await narrator.ensure('ready line'); // synthesis absorbed before recording
    assert.equal(clock.time(), 2000);
    assert.equal(fetches, 1);
    await narrator.narrate('ready line');
    // on camera it only held for the real 1s audio — no 2s synthesis stall
    assert.deepEqual(shown, [{ text: 'ready line', at: 2000 }]);
    assert.equal(clock.time(), 2000 + 1000);
    assert.equal(fetches, 1); // prefetched file reused — no second request
    assert.equal(narrator.segments.length, 1);
    narrator.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a line not in the prefetch list still synthesizes on demand', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  let fetches = 0;
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: async () => { fetches += 1; await clock.sleep(500); return new Response(wavBytes(2)); },
      onCaption: () => {},
    });
    narrator.prefetch(['other line']);
    await narrator.narrate('dynamic line');
    assert.equal(narrator.segments.length, 1);
    assert.equal(narrator.segments[0].text, 'dynamic line');
    narrator.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('prefetch dedupes with narrate — one TTS request per unique line', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  let fetches = 0;
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: async () => { fetches += 1; await clock.sleep(100); return new Response(wavBytes(1)); },
      onCaption: () => {},
    });
    narrator.prefetch(['same line']);
    await narrator.narrate('same line');
    await narrator.narrate('same line'); // same file, second beat — still one request
    assert.equal(fetches, 1);
    assert.equal(narrator.segments.length, 2);
    narrator.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a failed prefetch degrades to a visual caption, not a crash', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  const captions = [];
  const warnings = [];
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: async () => { throw new Error('TTS down'); },
      onCaption: (text, at) => { captions.push({ text, at }); },
      onWarn: (m) => warnings.push(m),
    });
    narrator.prefetch(['doomed line']);
    await narrator.narrate('doomed line');
    assert.equal(narrator.segments.length, 0);
    assert.deepEqual(captions, [{ text: 'doomed line', at: 0 }]);
    assert.equal(clock.time(), 1500); // fell back to the silent read hold
    assert.ok(warnings.length >= 1);
    narrator.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('drain() waits for every queued line — the pre-roll bound', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: async () => { await clock.sleep(400); return new Response(wavBytes(1)); },
      onCaption: () => {},
    });
    narrator.prefetch(['l1', 'l2', 'l3']);
    assert.equal(narrator.stats().total, 3);
    await narrator.drain();
    assert.equal(clock.time(), 1200); // sequential single-worker queue: 3 × 400ms
    const s = narrator.stats();
    assert.equal(s.done, 3);
    await narrator.narrate('l2'); // every line now plays stall-free
    assert.equal(narrator.segments[0].text, 'l2');
    narrator.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a non-prefetched line is flagged as an on-camera stall', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  const warnings = [];
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: wavResponse(1),
      onCaption: () => {},
      onWarn: (m) => warnings.push(m),
    });
    narrator.prefetch(['known line']);
    await narrator.narrate('surprise line'); // never prefetched → flagged
    assert.ok(warnings.some((w) => w.includes('synthesized on-camera')), JSON.stringify(warnings));
    warnings.length = 0;
    await narrator.narrate('known line'); // prefetched → no flag
    assert.equal(warnings.length, 0);
    narrator.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('stop() resolves pending prefetch so nothing hangs or outlives the run', async () => {
  const clock = virtualClock();
  const dir = tmpDir();
  try {
    const narrator = createNarrator({
      engine: fakeEngine,
      outputDir: dir,
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 350,
      fetchImpl: async () => { await clock.sleep(60_000); return new Response(wavBytes(1)); },
      onCaption: () => {},
    });
    narrator.prefetch(['slow line']);
    const pending = narrator.ensure('slow line');
    narrator.stop();
    assert.equal(await pending, null); // resolved, not stuck
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
