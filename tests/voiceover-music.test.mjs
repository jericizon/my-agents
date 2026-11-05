import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  BUNDLED_BED_EXPR,
  audioDurationMs,
  buildAudioMixFilter,
  buildMuxArgs,
  resolveMusicPlan,
} from '../custom/skills/using-my-presenter/assets/voiceover.mjs';

// PCM16 mono WAV of a sine tone — nonzero signal so ducking/meters have input.
function wavTone(seconds, freq = 220, rate = 48000, amp = 0.5) {
  const n = Math.round(seconds * rate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * 32767), i * 2);
  }
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

let ffmpegBin = null;
try {
  const requireCache = createRequire(path.join(process.env.HOME || '', '.cache/client-demo-presentation/package.json'));
  ffmpegBin = requireCache('ffmpeg-static');
} catch { /* tooling cache absent */ }

function tmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'music-test-'));
}

function meanVolumeDb(ffmpeg, file, { ss = 0, t } = {}) {
  const args = ['-v', 'info', '-ss', String(ss)];
  if (t !== undefined) args.push('-t', String(t));
  args.push('-i', file, '-af', 'volumedetect', '-f', 'null', '-');
  const res = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  const m = String(res.stderr || '').match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  return m ? Number(m[1]) : null;
}

const plan = (over = {}) => ({
  enabled: true,
  source: { kind: 'bed' },
  gain: 0.25,
  fadeInSec: 1.5,
  fadeOutSec: 2,
  duck: { threshold: 0.02, ratio: 6, attack: 20, release: 600 },
  ...over,
});

// ── resolveMusicPlan ─────────────────────────────────────────────────────────
test('music auto-enables only when voiceover is on', () => {
  assert.equal(resolveMusicPlan({ voiceover: false, music: 'auto', env: {} }).enabled, false);
  const p = resolveMusicPlan({ voiceover: true, music: 'auto', env: {} });
  assert.equal(p.enabled, true);
  assert.equal(p.source.kind, 'bed');
});

test("'none' disables music even with voiceover", () => {
  assert.equal(resolveMusicPlan({ voiceover: true, music: 'none', env: {} }).enabled, false);
  assert.equal(resolveMusicPlan({ voiceover: true, music: 'NONE', env: {} }).enabled, false);
});

test('a custom path becomes a file source (existing file)', () => {
  const p = resolveMusicPlan({ voiceover: true, music: '/tmp/bed.mp3', env: {}, existsImpl: () => true });
  assert.equal(p.enabled, true);
  assert.deepEqual(p.source, { kind: 'file', path: '/tmp/bed.mp3' });
});

test('missing custom path falls back to the bundled bed with a warning', () => {
  const warnings = [];
  const p = resolveMusicPlan({ voiceover: true, music: '/no/such.mp3', env: {}, existsImpl: () => false, warn: (m) => warnings.push(m) });
  assert.equal(p.enabled, true);
  assert.equal(p.source.kind, 'bed');
  assert.ok(warnings.length >= 1);
});

test('unset music arg defaults to auto', () => {
  assert.equal(resolveMusicPlan({ voiceover: true, music: undefined, env: {} }).enabled, true);
});

// ── mux graph shape ──────────────────────────────────────────────────────────
test('mux with music adds bed input, ducking, fades — and never tempo filters', () => {
  const args = buildMuxArgs({
    inputVideo: 'in.webm',
    audioFiles: ['a.wav', 'b.wav'],
    captions: [{ text: 'a', at: 0 }, { text: 'b', at: 5000 }],
    output: 'out.webm',
    format: 'webm',
    fps: 60,
    music: plan(),
    totalSec: 20,
  });
  const joined = args.join(' ');
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.ok(joined.includes('-f lavfi'), 'music bed must come from a lavfi input');
  assert.ok(joined.includes('aevalsrc'), 'bed is the deterministic synthesized pad');
  assert.ok(filter.includes('sidechaincompress'), 'music must be ducked by narration');
  assert.ok(filter.includes('afade=t=in'), 'fade-in required');
  assert.ok(/afade=t=out:st=18(\.\d+)?:d=2/.test(filter), `fade-out at total-2s missing: ${filter}`);
  assert.ok(!/atempo/.test(filter));
  assert.ok(filter.includes('loudnorm'));
});

test('file music loops until the video ends', () => {
  const args = buildMuxArgs({
    inputVideo: 'in.webm',
    audioFiles: ['a.wav'],
    captions: [{ text: 'a', at: 0 }],
    output: 'out.webm',
    format: 'webm',
    fps: 60,
    music: plan({ source: { kind: 'file', path: '/x/bed.mp3' } }),
    totalSec: 30,
  });
  const joined = args.join(' ');
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.ok(joined.includes('-stream_loop -1'), 'file bed must loop');
  assert.ok(joined.includes('/x/bed.mp3'));
  assert.ok(/atrim=duration=30(\.\d+)?/.test(filter), 'music trimmed to total duration');
});

test('music: null keeps the original narration-only chain', () => {
  const args = buildMuxArgs({
    inputVideo: 'in.webm',
    audioFiles: ['a.wav'],
    captions: [{ text: 'a', at: 0 }],
    output: 'out.webm',
    format: 'webm',
    fps: 60,
    music: null,
    totalSec: 30,
  });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.ok(!filter.includes('sidechaincompress'));
  assert.ok(!args.join(' ').includes('-f lavfi'));
});

test('music requires a duration so fades/trim can be placed', () => {
  assert.throws(() => buildMuxArgs({
    inputVideo: 'in.webm',
    audioFiles: ['a.wav'],
    captions: [{ text: 'a', at: 0 }],
    output: 'out.webm',
    format: 'webm',
    fps: 60,
    music: plan(),
    totalSec: null,
  }), /duration/i);
});

test('ambient bed expression is a soft multi-partial pad', () => {
  assert.ok(typeof BUNDLED_BED_EXPR === 'string' && BUNDLED_BED_EXPR.includes('sin(2*PI*'));
});

// ── real ffmpeg: ducking + fades + duration ──────────────────────────────────
test('sidechain ducking lowers the bed while narration plays', { skip: !ffmpegBin && 'no ffmpeg' }, () => {
  const dir = tmpDir();
  try {
    const key = path.join(dir, 'key.wav'); // 1s of loud "speech" tone
    const mus = path.join(dir, 'mus.wav'); // 6s of quiet "music" tone
    const out = path.join(dir, 'duck.wav');
    writeFileSync(key, wavTone(1, 300, 48000, 0.6));
    writeFileSync(mus, wavTone(6, 140, 48000, 0.25));
    // same duck chain as production: key delayed to 2s, music compressed by it
    const filter = '[0:a]adelay=2000:all=1[key];[1:a][key]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=600[mduck]';
    execFileSync(ffmpegBin, ['-y', '-v', 'error', '-i', key, '-i', mus,
      '-filter_complex', filter, '-map', '[mduck]', out]);
    const before = meanVolumeDb(ffmpegBin, out, { ss: 0, t: 1 }); // bed only
    const during = meanVolumeDb(ffmpegBin, out, { ss: 2, t: 1 }); // ducked
    const after = meanVolumeDb(ffmpegBin, out, { ss: 4.5, t: 1 }); // recovered
    assert.ok(during < before - 5, `ducked ${during}dB not clearly below bed ${before}dB`);
    assert.ok(after > during + 3, `post-speech bed did not recover: ${after} vs ${during}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bed fades in, fades out, and runs the full clip duration', { skip: !ffmpegBin && 'no ffmpeg' }, () => {
  const dir = tmpDir();
  try {
    const mus = path.join(dir, 'mus.wav');
    const out = path.join(dir, 'bed.wav');
    writeFileSync(mus, wavTone(20, 140, 48000, 0.5)); // longer than clip → exercises loop+trim
    const total = 8;
    const p = plan({ source: { kind: 'file', path: mus } });
    const filter = buildAudioMixFilter([{ text: 'v', at: 3000 }], {}, -1, p, total);
    const voice = path.join(dir, 'v.wav');
    writeFileSync(voice, wavTone(1, 300, 48000, 0.6));
    execFileSync(ffmpegBin, ['-y', '-v', 'error', '-i', voice, '-stream_loop', '-1', '-i', mus,
      '-filter_complex', filter, '-map', '[aoutmix]', out]);
    const dur = audioDurationMs(out);
    assert.ok(dur > total * 1000 - 400 && dur < total * 1000 + 400, `mixed duration ${dur}`);
    const early = meanVolumeDb(ffmpegBin, out, { ss: 0, t: 0.3 });
    const mid = meanVolumeDb(ffmpegBin, out, { ss: 3, t: 0.6 });
    const tailDb = meanVolumeDb(ffmpegBin, out, { ss: total - 0.4, t: 0.4 });
    assert.ok(early < mid - 3, `fade-in absent: early ${early}dB vs mid ${mid}dB`);
    assert.ok(tailDb < mid - 10, `fade-out absent: tail ${tailDb}dB vs mid ${mid}dB`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
