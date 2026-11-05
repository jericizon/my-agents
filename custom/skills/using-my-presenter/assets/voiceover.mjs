import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync, renameSync } from 'fs';
import path from 'path';

const VOICEOVER_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const AUDIO_NORMALIZATION_DEFAULTS = Object.freeze({
  integratedLoudness: -16,
  maxTruePeak: -1.5,
  loudnessRange: 7,
});
// VoiceStudio (debpalash/VoiceStudio) is the ONLY voiceover engine: a local app
// exposing an OpenAI-compatible TTS API. No fallback engines — when it is
// unreachable the recorder disregards the voiceover request and stays silent.
const VOICESTUDIO_DEFAULTS = Object.freeze({
  baseUrl: 'http://localhost:3900',
  model: 'omnivoice',
  voice: 'fc52c689', // VoiceStudio "The Companion" profile
  speed: 1.3,
  seed: 42,
  instructions: 'warm, friendly, expressive narrator with natural conversational delivery',
});
const SEGMENT_END_GAP_MS = 350; // silence between the end of one narration and the next beat
const SILENT_READ_MS = 1500; // on-screen read hold when a narrate() can't produce audio

// Bundled background bed: a bright, lively pattern synthesized deterministically
// by ffmpeg's aevalsrc at mux time — plucked 8th-note arpeggios cycling
// C–G–Am–F at 120 BPM over a quarter-note bass pulse, with a soft fifth shimmer.
// No external file, no licensing concerns, always seamless (8s pattern loop).
const _chord = 'mod(floor(t*0.5),4)'; // chord index: one chord per 2s bar
const _step = 'mod(floor(t*4),8)'; // 8th-note index within the bar
const _pick = (idx, vals) => vals.map((v, i) => `eq(${idx},${i})*${v}`).join('+');
const _root = _pick(_chord, [261.63, 196.0, 220.0, 174.61]); // C4 G3 A3 F3
const _semi = `eq(${_chord},2)*(${_pick(_step, [0, 3, 7, 12, 7, 3, 7, 12])})`
  + `+(1-eq(${_chord},2))*(${_pick(_step, [0, 4, 7, 12, 7, 4, 7, 12])})`;
const _arp = `(${_root})*pow(2,(${_semi})/12)`;
const _arpEnv = 'exp(-mod(t*4,1)*5.5)'; // pluck decay, resets each 8th note
const _bassEnv = 'exp(-mod(t*2,1)*3.5)'; // pulse decay, resets each quarter note
export const BUNDLED_BED_EXPR = `0.26*(sin(2*PI*(${_arp})*t)`
  + `+0.45*sin(2*PI*(${_arp})*2*t)+0.2*sin(2*PI*(${_arp})*3*t))*(${_arpEnv})`
  + `+0.30*(sin(2*PI*(${_root})*0.5*t)+0.3*sin(2*PI*(${_root})*t))*(${_bassEnv})`
  + `+0.05*sin(2*PI*(${_root})*1.498*t)*(0.7+0.3*sin(2*PI*0.4*t))`;
const MUSIC_DEFAULTS = Object.freeze({
  gain: 0.25,
  fadeInSec: 1.5,
  fadeOutSec: 2,
  duck: Object.freeze({ threshold: 0.02, ratio: 6, attack: 20, release: 600 }),
});

// Resolves the background-music plan from --music / DEMO_MUSIC. Music exists
// only inside the voiceover mix — with voiceover off there is no audio chain,
// so the plan is always disabled. `music`: 'none' | 'auto' | true | <path>.
export function resolveMusicPlan({ voiceover, music, env = process.env, existsImpl = existsSync, warn = () => {} } = {}) {
  if (!voiceover) return { enabled: false };
  const raw = (music === undefined || music === true || music === null) ? 'auto' : String(music).trim();
  if (/^none$/i.test(raw)) return { enabled: false };
  let source = { kind: 'bed' };
  if (raw && !/^auto$/i.test(raw)) {
    if (existsImpl(raw)) source = { kind: 'file', path: raw };
    else warn(`[recorder] music file not found: ${raw} — using the bundled bed`);
  }
  return {
    enabled: true,
    source,
    gain: readConfiguredNumber(env, 'DEMO_MUSIC_GAIN', MUSIC_DEFAULTS.gain, {
      min: 0, max: 2, rangeDescription: 'between 0 and 2',
    }),
    fadeInSec: readConfiguredNumber(env, 'DEMO_MUSIC_FADE_IN', MUSIC_DEFAULTS.fadeInSec, {
      min: 0, max: 30, rangeDescription: 'between 0 and 30',
    }),
    fadeOutSec: readConfiguredNumber(env, 'DEMO_MUSIC_FADE_OUT', MUSIC_DEFAULTS.fadeOutSec, {
      min: 0, max: 30, rangeDescription: 'between 0 and 30',
    }),
    duck: { ...MUSIC_DEFAULTS.duck },
  };
}

export function isVoiceoverEnabled(value) {
  if (typeof value === 'boolean') return value;
  return VOICEOVER_TRUE_VALUES.has(String(value || '').trim().toLowerCase());
}

function readConfiguredNumber(env, name, defaultValue, {
  min = 0,
  max = Number.POSITIVE_INFINITY,
  minExclusive = false,
  rangeDescription = `between ${min} and ${max}`,
} = {}) {
  const raw = String(env[name] ?? '').trim();
  if (!raw) return defaultValue;
  const value = Number(raw);
  const aboveMinimum = minExclusive ? value > min : value >= min;
  if (!Number.isFinite(value) || !aboveMinimum || value > max) {
    throw new Error(`${name} must be a number ${rangeDescription}.`);
  }
  return value;
}

function resolveAudioNormalization(env) {
  return {
    integratedLoudness: readConfiguredNumber(env, 'DEMO_AUDIO_TARGET_LUFS', AUDIO_NORMALIZATION_DEFAULTS.integratedLoudness, {
      min: -70,
      max: -5,
      rangeDescription: 'between -70 and -5',
    }),
    maxTruePeak: readConfiguredNumber(env, 'DEMO_AUDIO_MAX_TRUE_PEAK', AUDIO_NORMALIZATION_DEFAULTS.maxTruePeak, {
      min: -9,
      max: 0,
      rangeDescription: 'between -9 and 0',
    }),
    loudnessRange: readConfiguredNumber(env, 'DEMO_AUDIO_TARGET_LRA', AUDIO_NORMALIZATION_DEFAULTS.loudnessRange, {
      min: 1,
      max: 50,
      rangeDescription: 'between 1 and 50',
    }),
  };
}

function resolveVoiceoverConfig(env) {
  return {
    baseUrl: String(env.VS_BASE_URL || VOICESTUDIO_DEFAULTS.baseUrl).replace(/\/+$/, ''),
    model: String(env.VS_MODEL || VOICESTUDIO_DEFAULTS.model),
    voice: String(env.VS_VOICE || VOICESTUDIO_DEFAULTS.voice),
    speed: readConfiguredNumber(env, 'VS_SPEED', VOICESTUDIO_DEFAULTS.speed, {
      min: 0.25,
      max: 4,
      rangeDescription: 'between 0.25 and 4',
    }),
    seed: Math.round(readConfiguredNumber(env, 'VS_SEED', VOICESTUDIO_DEFAULTS.seed, {
      max: 4294967295,
      rangeDescription: 'between 0 and 4294967295',
    })),
    instructions: String(env.VS_INSTRUCTIONS || VOICESTUDIO_DEFAULTS.instructions),
  };
}

export async function probeVoiceStudio({ baseUrl, timeoutMs = 4000, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${baseUrl}/v1/audio/voices`, { signal: AbortSignal.timeout(timeoutMs) });
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

function isWslEnv(env) {
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return true;
  try {
    return /microsoft|wsl/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

// Default-route gateway from /proc/net/route — on WSL2 that is the Windows host,
// where VoiceStudio usually runs. Little-endian hex, e.g. 0102A8C0 → 192.168.2.1.
function wslGatewayIp() {
  try {
    const routes = readFileSync('/proc/net/route', 'utf8').split('\n').slice(1);
    for (const line of routes) {
      const cols = line.trim().split(/\s+/);
      if (cols[1] === '00000000' && /^[0-9A-Fa-f]{8}$/.test(cols[2] || '')) {
        const n = parseInt(cols[2], 16);
        return `${n & 255}.${(n >> 8) & 255}.${(n >> 16) & 255}.${(n >>> 24) & 255}`;
      }
    }
  } catch { /* not linux or unreadable */ }
  return null;
}

// Candidates, in probe order: explicit VS_BASE_URL always wins; then localhost;
// then, on WSL2, the Windows-host gateway — so VoiceStudio running on Windows
// serves WSL2 projects with zero extra config.
function voiceoverBaseUrlCandidates(env) {
  const explicit = String(env.VS_BASE_URL || '').trim();
  if (explicit) return [explicit.replace(/\/+$/, '')];
  const urls = [VOICESTUDIO_DEFAULTS.baseUrl];
  if (isWslEnv(env)) {
    const gw = wslGatewayIp();
    if (gw) urls.push(`http://${gw}:3900`);
  }
  return urls;
}

// Returns the VoiceStudio engine config bound to the first base URL that
// answers, or null when none is reachable — callers treat null as "record
// without voiceover" (the request is disregarded).
export async function resolveVoiceoverEngine({ env = process.env, fetchImpl = fetch } = {}) {
  const config = resolveVoiceoverConfig(env);
  const candidates = voiceoverBaseUrlCandidates(env);
  for (const baseUrl of candidates) {
    if (await probeVoiceStudio({ baseUrl, fetchImpl })) {
      return { kind: 'voicestudio', ...config, baseUrl };
    }
  }
  return null;
}

export function buildCaptionTimeline(captions) {
  if (!Array.isArray(captions)) return [];
  return captions.flatMap((caption) => {
    const text = String(caption?.text ?? '').trim();
    const at = Number(caption?.at);
    if (!text || !Number.isFinite(at)) return [];
    return [{ text, at: Math.max(0, Math.round(at)) }];
  });
}

// RIFF/WAVE duration in seconds. Returns null for non-wav or unparseable files.
function wavDurationSeconds(file) {
  try {
    const buf = readFileSync(file);
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;
    while (offset + 8 <= buf.length) {
      const id = buf.toString('ascii', offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      if (id === 'fmt ') byteRate = buf.readUInt32LE(offset + 16);
      if (id === 'data') { dataSize = size; break; }
      offset += 8 + size + (size % 2);
    }
    return byteRate && dataSize ? dataSize / byteRate : null;
  } catch {
    return null;
  }
}

// ffmpeg prints "Duration: HH:MM:SS.cc" on stderr for `-i` before failing.
function probeMediaDurationSeconds(ffmpeg, mediaPath, execFile = execFileSync) {
  try {
    execFile(ffmpeg, ['-i', mediaPath], { stdio: 'pipe' });
  } catch (error) {
    const text = `${error.stderr || ''}${error.stdout || ''}`;
    const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return null;
}

// Measured duration of a generated audio file in milliseconds — the value that
// drives scene pacing. WAV header parse first, ffmpeg probe as fallback.
export function audioDurationMs(file, { ffmpeg, execFile = execFileSync } = {}) {
  const wav = wavDurationSeconds(file);
  if (wav) return Math.round(wav * 1000);
  if (ffmpeg) {
    const probed = probeMediaDurationSeconds(ffmpeg, file, execFile);
    if (probed) return Math.round(probed * 1000);
  }
  return null;
}

export async function createTtsAudio(engine, text, outputPath, { fetchImpl = fetch, execFile = execFileSync, ffmpeg, signal } = {}) {
  const spokenText = String(text || '').trim();
  if (!spokenText) throw new Error('Cannot generate voiceover audio for an empty caption.');
  if (engine?.kind !== 'voicestudio') throw new Error(`Unsupported TTS engine: ${engine?.kind}`);
  mkdirSync(path.dirname(outputPath), { recursive: true });

  const body = {
    model: engine.model,
    voice: engine.voice,
    input: spokenText,
    response_format: 'wav',
    speed: engine.speed,
    seed: engine.seed,
    instructions: engine.instructions,
  };
  const timeout = AbortSignal.timeout(600000);
  const res = await fetchImpl(`${engine.baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal && AbortSignal.any ? AbortSignal.any([timeout, signal]) : timeout,
  });
  if (!res || !res.ok) {
    throw new Error(`VoiceStudio TTS failed for caption: HTTP ${res ? res.status : 'no response'}`);
  }
  writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));

  if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
    throw new Error(`TTS produced no audio file at ${outputPath}`);
  }
  // OmniVoice can cut a wav off mid-word — fade the last 120ms and pad 150ms
  // of silence so every segment ends softly instead of with a hard stop.
  const duration = wavDurationSeconds(outputPath);
  if (ffmpeg && duration && duration > 0.3) {
    const tmp = `${outputPath}.tmp.wav`;
    execFile(ffmpeg, [
      '-y', '-v', 'error', '-i', outputPath,
      '-af', `afade=t=out:st=${(duration - 0.12).toFixed(3)}:d=0.12,apad=pad_dur=0.15`,
      '-ar', '48000', tmp,
    ], { stdio: 'ignore' });
    renameSync(tmp, outputPath);
  }
  // Real duration AFTER the fade/pad pass — the scene is held for exactly this.
  return { file: outputPath, durationMs: audioDurationMs(outputPath, { ffmpeg, execFile }) };
}

// Two-tier timing gate driven by MEASURED audio duration — never by estimates.
// `waitSpeech` releases the instant the active narration's audio ends — cursor,
// spotlight, navigation, and captions may move then. `waitBeat` additionally
// holds the inter-line breath gap; only the next SPOKEN line waits on it, so
// visual mechanics overlap the breath instead of freezing through it.
export function createNarrationGate({ now, sleep, gapMs = SEGMENT_END_GAP_MS } = {}) {
  let endsAt = -Infinity; // now() timestamp the active narration ends; -inf = idle
  const hold = (extra) => async () => {
    const waitMs = endsAt + extra - now();
    if (waitMs > 0) await sleep(waitMs);
  };
  const waitBeat = hold(gapMs);
  return {
    waitSpeech: hold(0),
    waitBeat,
    wait: waitBeat, // back-compat alias: the old wait() held end + gap
    // Mark narration as started at `at`; it will play for `durationMs` (measured).
    start({ at, durationMs }) {
      endsAt = at + durationMs;
      return endsAt;
    },
  };
}

// Blocking narration engine for the recorder. narrate(text):
//   1. waits for any previous narration to finish,
//   2. resolves the segment audio — pre-generated by prefetch(), or generated
//      on the spot through the same single-worker queue (one TTS request at a
//      time; a demanded line jumps ahead of queued prefetch work),
//   3. measures its real duration,
//   4. shows the caption (start == audio start),
//   5. resolves only after the narration has actually ended.
// Synthesis is requested BEFORE the gate wait so a non-prefetched line generates
// while the previous narration is still playing instead of adding dead air
// after it. onCaption(text, at) renders the subtitle; onWarn(msg) reports
// degradations. With engine === null (voiceover off/unavailable) narrate
// degrades to a visual caption + read hold and no TTS request is made.
export function createNarrator({
  engine = null, ffmpeg = null, outputDir, now, sleep,
  gapMs = SEGMENT_END_GAP_MS, silentReadMs = SILENT_READ_MS,
  onCaption = async () => {}, onWarn = () => {},
  fetchImpl = fetch, execFile = execFileSync,
} = {}) {
  const gate = createNarrationGate({ now, sleep, gapMs });
  const segments = []; // { text, at, file, durationMs } — audio timeline for the mux
  const abort = new AbortController();
  let stopped = false;
  let n = 0;
  // Synthesis queue: strictly one TTS request in flight. `demand` holds lines
  // narrate() is waiting on; `ahead` holds best-effort prefetch lines. Requests
  // are deduped by text so a repeated line reuses one audio file.
  const requests = new Map(); // text -> { promise, resolve, lane, done }
  const demand = [];
  const ahead = [];
  let pumping = null;
  let inFlight = null; // entry currently inside synthesize()

  const synthesize = async (text) => {
    const file = path.join(outputDir, `${String(++n).padStart(3, '0')}.wav`);
    let seg = null;
    try {
      seg = await createTtsAudio(engine, text, file, {
        fetchImpl, execFile, ffmpeg, signal: abort.signal,
      });
    } catch (e) {
      onWarn(`[narrator] TTS failed for "${text.slice(0, 48)}": ${e.message} — visual caption instead`);
      return null;
    }
    if (!seg || !seg.durationMs) {
      if (seg) { try { unlinkSync(seg.file); } catch { /* keep for debugging */ } }
      onWarn('[narrator] could not measure audio duration — segment dropped (never estimated)');
      return null;
    }
    return seg;
  };

  const pump = async () => {
    while (!stopped) {
      const e = demand.length ? demand.shift() : ahead.shift();
      if (!e) break;
      if (e.done) continue; // already resolved while queued (promotion/stop)
      inFlight = e;
      const seg = await synthesize(e.text);
      inFlight = null;
      if (!e.done) { e.done = true; e.resolve(seg); }
    }
    pumping = null;
  };

  const request = (text, lane) => {
    if (stopped) return Promise.resolve(null); // pump is dead — never enqueue
    const existing = requests.get(text);
    if (existing) {
      // A demanded line parked in the prefetch lane jumps the queue.
      if (!existing.done && existing.lane === 'ahead' && lane === 'demand') {
        const idx = ahead.indexOf(existing);
        if (idx >= 0) ahead.splice(idx, 1);
        existing.lane = 'demand';
        demand.push(existing);
      }
      return existing.promise;
    }
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const e = { text, promise, resolve, lane, done: false };
    requests.set(text, e);
    (lane === 'demand' ? demand : ahead).push(e);
    if (!pumping) pumping = pump();
    return promise;
  };

  const visualBeat = async (text) => {
    await onCaption(text, now());
    await sleep(silentReadMs);
  };

  async function narrate(text) {
    const clean = String(text ?? '').trim();
    // A line the prefetch scan never saw synthesizes on-camera — audible dead
    // air. Flag it so the flow author knows to use a literal string.
    const prefetchMiss = clean && engine && !requests.has(clean);
    // Request audio FIRST — a prefetched line resolves instantly (no dead air);
    // a miss synthesizes while the previous narration finishes playing.
    const segPromise = clean && engine ? request(clean, 'demand') : Promise.resolve(null);
    await gate.waitBeat(); // the inter-line breath always elapses before speech
    if (!clean || !engine) { await visualBeat(clean); return; }
    const seg = await segPromise;
    if (!seg) { await visualBeat(clean); return; }
    if (prefetchMiss) {
      onWarn(`[narrator] "${clean.slice(0, 48)}" was synthesized on-camera (dynamic text?) — literal lines are pre-synthesized before recording`);
    }
    const at = now(); // caption appears exactly when the narration starts
    await onCaption(clean, at);
    segments.push({ text: clean, at, file: seg.file, durationMs: seg.durationMs });
    gate.start({ at, durationMs: seg.durationMs });
    // Hold the scene for the FULL measured duration only — the breath gap after
    // it belongs to the NEXT beat's pre-wait, so cursor/spotlight mechanics
    // overlap the gap instead of freezing through it.
    await gate.waitSpeech();
  }

  return {
    narrate,
    // Helpers release the moment speech ends — only the next spoken line holds
    // the breath gap, so cursor, spotlight, and navigation start moving during
    // it instead of after it.
    waitForNarration: gate.waitSpeech,
    segments,
    // Queue literal lines for background synthesis (extracted from the flow
    // source before recording). Sequential — never two TTS requests at once.
    prefetch: (texts) => {
      if (!engine) return;
      for (const t of texts || []) {
        const clean = String(t ?? '').trim();
        if (clean) request(clean, 'ahead');
      }
    },
    // Resolves with the segment for a line (prefetched or synthesized on demand).
    ensure: (text) => {
      const clean = String(text ?? '').trim();
      return clean && engine ? request(clean, 'demand') : Promise.resolve(null);
    },
    // Resolves once every line requested so far has finished synthesizing —
    // used pre-roll so literal lines never stall on-camera.
    drain: () => Promise.all([...requests.values()].map((e) => e.promise)).then(() => undefined),
    // Queue snapshot for progress reporting: { total, done, inFlight }.
    stats: () => {
      let done = 0;
      for (const e of requests.values()) if (e.done) done += 1;
      return { total: requests.size, done, inFlight: inFlight ? 1 : 0 };
    },
    // Stop background synthesis so an abandoned prefetch can't outlive the run.
    stop: () => {
      stopped = true;
      abort.abort();
      for (const e of requests.values()) {
        if (!e.done) { e.done = true; e.resolve(null); }
      }
    },
  };
}

// ── narration-line extraction (prefetch) ─────────────────────────────────────
// Statically pulls the literal text arguments of narrate()/explain() calls out
// of a flow's source so their audio can be generated BEFORE the camera rolls —
// spoken lines then land back-to-back instead of after a TTS round-trip on the
// recorded timeline. Purely an optimization: non-literal args are skipped and
// synthesized on demand; phantom hits (e.g. conditionals never taken) only cost
// a little extra synthesis time. Best-effort scanning — a parse hiccup on one
// call site never breaks the rest.

const CH_STRING = 1;
const CH_TEMPLATE = 2;
const CH_REGEX = 3;
const CH_COMMENT = 4;

// Per-character classification: 0 = code, else string/template/regex/comment.
// Hand-rolled so the recorder needs no parser dependency; division vs regex is
// decided by the previous meaningful token — a miss only skips a call site.
function classifySource(src) {
  const cls = new Uint8Array(src.length);
  const stack = [{ ctx: 'code' }];
  const top = () => stack[stack.length - 1];
  let last = null;      // last meaningful char ('S' after a string/regex/template end)
  let lastToken = '';   // trailing identifier chars of the current token
  const keywords = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete',
    'void', 'throw', 'do', 'else', 'instanceof', 'yield', 'await']);
  const regexAllowed = () => {
    if (last === null) return true;
    if ('([{,;:=!&|?+-*%~^<>'.includes(last)) return true;
    if (last === 'S' || last === ')' || last === ']') return false;
    return keywords.has(lastToken);
  };
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    const t = top();
    if (t.ctx === 'linecomment') {
      cls[i] = CH_COMMENT;
      if (c === '\n') stack.pop();
      continue;
    }
    if (t.ctx === 'blockcomment') {
      cls[i] = CH_COMMENT;
      if (c === '*' && src[i + 1] === '/') { cls[i + 1] = CH_COMMENT; i += 1; stack.pop(); }
      continue;
    }
    if (t.ctx === 'quote') {
      cls[i] = CH_STRING;
      if (c === '\\') { if (i + 1 < src.length) { cls[i + 1] = CH_STRING; i += 1; } continue; }
      if (c === t.quote) { stack.pop(); last = 'S'; }
      continue;
    }
    if (t.ctx === 'template') {
      cls[i] = CH_TEMPLATE;
      if (c === '\\') { if (i + 1 < src.length) { cls[i + 1] = CH_TEMPLATE; i += 1; } continue; }
      if (c === '`') { stack.pop(); last = 'S'; continue; }
      if (c === '$' && src[i + 1] === '{') {
        cls[i + 1] = CH_TEMPLATE; i += 1;
        stack.push({ ctx: 'tplexpr', braces: 0 });
        last = '('; lastToken = '';
      }
      continue;
    }
    if (t.ctx === 'regex') {
      cls[i] = CH_REGEX;
      if (c === '\\') { if (i + 1 < src.length) { cls[i + 1] = CH_REGEX; i += 1; } continue; }
      if (c === '[') t.inClass = true;
      else if (c === ']') t.inClass = false;
      else if (c === '/' && !t.inClass) { stack.pop(); last = 'S'; }
      continue;
    }
    // code / tplexpr
    if (t.ctx === 'tplexpr' && c === '}' && t.braces === 0) {
      cls[i] = CH_TEMPLATE;
      stack.pop();
      last = 'S';
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      cls[i] = CH_COMMENT; cls[i + 1] = CH_COMMENT; i += 1;
      stack.push({ ctx: 'linecomment' });
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      cls[i] = CH_COMMENT; cls[i + 1] = CH_COMMENT; i += 1;
      stack.push({ ctx: 'blockcomment' });
      continue;
    }
    if (c === "'" || c === '"') {
      cls[i] = CH_STRING;
      stack.push({ ctx: 'quote', quote: c });
      last = 'S'; lastToken = '';
      continue;
    }
    if (c === '`') {
      cls[i] = CH_TEMPLATE;
      stack.push({ ctx: 'template' });
      last = 'S'; lastToken = '';
      continue;
    }
    if (c === '/' && regexAllowed()) {
      cls[i] = CH_REGEX;
      stack.push({ ctx: 'regex', inClass: false });
      last = 'S'; lastToken = '';
      continue;
    }
    if (t.ctx === 'tplexpr') {
      if (c === '{') t.braces += 1;
      else if (c === '}') t.braces -= 1;
    }
    if (!/\s/.test(c)) {
      last = c;
      lastToken = /[\w$]/.test(c) ? lastToken + c : '';
    }
  }
  return cls;
}

// Splits a call's argument list on top-level commas using the classification —
// commas inside strings, templates, regexes, comments, or nested (), [], {}
// never split. Returns the args as source slices (comments dropped), or null on
// unbalanced input.
function readTopLevelArgs(src, cls, openParen) {
  const args = [];
  let depth = 1;
  let start = openParen + 1;
  for (let i = openParen + 1; i < src.length; i += 1) {
    if (cls[i] !== 0) continue;
    const c = src[i];
    if (c === ',' && depth === 1) {
      args.push(cleanArg(src, cls, start, i));
      start = i + 1;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) {
        args.push(cleanArg(src, cls, start, i));
        return args;
      }
    }
  }
  return null;
}

const cleanArg = (src, cls, from, to) => {
  let out = '';
  for (let i = from; i < to; i += 1) {
    if (cls[i] !== CH_COMMENT) out += src[i];
  }
  return out.trim();
};

// Evaluates an argument only when it is provably a string literal (or a `+`
// chain of string literals) — the guard regex runs first so arbitrary call
// sites can never execute user expressions during extraction.
function literalString(raw) {
  const arg = String(raw || '').trim();
  if (!arg || arg.includes('${')) return null;
  const lit = "(?:'(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\"|`(?:[^`\\\\]|\\\\.)*`)";
  if (!new RegExp(`^${lit}(?:\\s*\\+\\s*${lit})*$`).test(arg)) return null;
  try {
    const value = new Function(`"use strict";return (${arg});`)();
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

// Ordered, deduped narration lines from a flow source: narrate() arg0 and
// explain() arg1, restricted to static string literals.
export function extractNarrationTexts(source) {
  const src = String(source || '');
  const cls = classifySource(src);
  const found = [];
  const callRe = /(narrate|explain)\s*\(/g;
  let m;
  while ((m = callRe.exec(src))) {
    if (cls[m.index] !== 0) continue; // inside a string/regex/comment
    const prev = src[m.index - 1];
    if (prev && /[\w$]/.test(prev)) continue; // e.g. fooNarrate( — keep h.narrate(
    const args = readTopLevelArgs(src, cls, m.index + m[0].length - 1);
    if (!args) continue;
    const text = literalString(args[m[1] === 'narrate' ? 0 : 1]);
    if (text && text.trim()) found.push(text.trim());
  }
  return [...new Set(found)];
}

export function buildAudioMixFilter(captions, env = process.env, inputOffset = 0, music = null, totalSec = null) {
  const timeline = buildCaptionTimeline(captions);
  if (!timeline.length) throw new Error('Cannot build an audio mix without captions.');
  const base = 1 + inputOffset;
  // Segments are placed at their recorded caption times at ORIGINAL speed — the
  // scene was already held for each narration's real duration, so no fitting,
  // trimming, or tempo manipulation ever happens here.
  const delayed = timeline.map((caption, index) => `[${base + index}:a]adelay=${Math.max(0, Math.round(caption.at))}:all=1[a${index}]`);
  const inputs = timeline.map((_, index) => `[a${index}]`).join('');
  delayed.push(`${inputs}amix=inputs=${timeline.length}:duration=longest:dropout_transition=0:normalize=1[aout]`);
  const normalization = resolveAudioNormalization(env);
  const norm = `aresample=48000,loudnorm=I=${normalization.integratedLoudness}:TP=${normalization.maxTruePeak}:LRA=${normalization.loudnessRange}:linear=false[anorm]`;
  if (!music?.enabled) {
    delayed.push(`[aout]${norm}`);
    return delayed.join(';');
  }
  if (!(Number(totalSec) > 0)) {
    throw new Error('Background music requires the total demo duration for trim/fades.');
  }
  // Normalize the narration bus FIRST — running loudnorm over the finished mix
  // would pump up the quiet music-only gaps toward the speech target and
  // erase the intended level gap between narration and bed.
  delayed.push(`[aout]${norm}`);
  // Music input sits right after the narration segment inputs. The bed is
  // trimmed to the clip length, warmed up (rumble/hiss out), faded in/out, and
  // sidechain-ducked by the narration bus — subtle under speech, slightly more
  // present in the pauses. No tempo manipulation anywhere.
  const musicIndex = base + timeline.length;
  const fadeOutStart = Math.max(0, totalSec - music.fadeOutSec);
  delayed.push(
    `[${musicIndex}:a]atrim=duration=${totalSec.toFixed(2)},highpass=f=70,lowpass=f=1700,`
    + `aecho=0.7:0.9:60|100:0.22|0.15,volume=${music.gain},`
    + `afade=t=in:st=0:d=${music.fadeInSec},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${music.fadeOutSec}[mus]`,
  );
  const d = music.duck;
  // sidechaincompress stops when the shorter input ends — pad the key with
  // silence to clip length so the music survives past the last narration.
  delayed.push('[anorm]asplit=2[vmix][vkeypre]');
  delayed.push(`[vkeypre]apad,atrim=duration=${totalSec.toFixed(2)}[vkey]`);
  delayed.push(`[mus][vkey]sidechaincompress=threshold=${d.threshold}:ratio=${d.ratio}:attack=${d.attack}:release=${d.release}:makeup=1[mduck]`);
  delayed.push('[vmix][mduck]amix=inputs=2:duration=longest:normalize=0[amixed]');
  delayed.push('[amixed]alimiter=limit=0.95,aresample=48000[aoutmix]');
  return delayed.join(';');
}

export function buildMuxArgs({ inputVideo, audioFiles, captions, output, format, env = process.env, fps, videoChain, extraInputArgs = [], music = null, totalSec = null }) {
  if (!Array.isArray(audioFiles) || !audioFiles.length) {
    throw new Error('Cannot mux voiceover without generated audio segments.');
  }
  const frameRate = Math.max(1, Math.round(Number(fps ?? env.DEMO_FPS) || 60));
  const args = ['-y', '-i', inputVideo, ...extraInputArgs];
  for (const audioFile of audioFiles) args.push('-i', audioFile);
  if (music?.enabled) {
    if (music.source?.kind === 'file') args.push('-stream_loop', '-1', '-i', music.source.path);
    else args.push('-f', 'lavfi', '-i', `aevalsrc='${BUNDLED_BED_EXPR}':s=48000:d=${Number(totalSec || 0).toFixed(2)}`);
  }
  const extraCount = extraInputArgs.filter((arg) => arg === '-i').length;
  const audioFilter = buildAudioMixFilter(captions, env, extraCount, music, totalSec);
  let videoMap = '0:v:0';
  let filter = audioFilter;
  if (format === 'mp4' && videoChain) {
    filter = `${videoChain};${audioFilter}`;
    videoMap = '[vout]';
  }
  args.push(
    '-filter_complex', filter,
    '-map', videoMap,
    '-map', music?.enabled ? '[aoutmix]' : '[anorm]',
  );

  if (format === 'webm') {
    args.push('-c:v', 'copy', '-c:a', 'libopus', '-b:a', '128k');
  } else if (format === 'mp4') {
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(frameRate), '-c:a', 'aac', '-b:a', '128k');
  } else {
    throw new Error(`Unsupported voiceover output format: ${format}`);
  }

  args.push(output);
  return args;
}

export function muxVoiceover({ ffmpeg, inputVideo, audioFiles, captions, output, format, env = process.env, execFile = execFileSync, fps, videoChain, extraInputArgs = [], cwd, music = null }) {
  mkdirSync(path.dirname(output), { recursive: true });
  let totalSec = null;
  if (music?.enabled) {
    // Music runs the whole clip: probe the video first, fall back to the last
    // narration's measured end (+ safety tail) when the probe fails.
    const videoSeconds = probeMediaDurationSeconds(ffmpeg, inputVideo, execFile);
    if (videoSeconds) totalSec = videoSeconds;
    else {
      const lastEnd = (Array.isArray(captions) ? captions : [])
        .reduce((max, c) => Math.max(max, (Number(c?.at) || 0) + (Number(c?.durationMs) || 0)), 0);
      if (lastEnd > 0) totalSec = lastEnd / 1000 + 0.5;
    }
    if (!(totalSec > 0)) {
      throw new Error('Background music needs a measurable clip duration (video probe failed and no segment lengths were recorded).');
    }
  }
  const args = buildMuxArgs({
    inputVideo, audioFiles, captions, output, format, env, fps, videoChain, extraInputArgs, music, totalSec,
  });
  try {
    execFile(ffmpeg, args, cwd ? { stdio: 'ignore', cwd } : { stdio: 'ignore' });
  } catch (error) {
    throw new Error(`ffmpeg failed while adding voiceover: ${error.message}`);
  }
  return output;
}

export function verifyAudioStream({ ffmpeg, mediaPath, execFile = execFileSync }) {
  try {
    execFile(ffmpeg, ['-v', 'error', '-i', mediaPath, '-map', '0:a:0', '-f', 'null', '-'], { stdio: 'ignore' });
  } catch (error) {
    throw new Error(`No usable audio stream found in ${mediaPath}: ${error.message}`);
  }
  return true;
}
