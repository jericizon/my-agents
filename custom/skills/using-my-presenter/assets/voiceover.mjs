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
  speed: 1.2,
  seed: 42,
  instructions: 'warm, friendly, expressive narrator with natural conversational delivery',
});
const SEGMENT_END_GAP_MS = 350; // silence between the end of one narration and the next beat
const SILENT_READ_MS = 1500; // on-screen read hold when a narrate() can't produce audio

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

export async function createTtsAudio(engine, text, outputPath, { fetchImpl = fetch, execFile = execFileSync, ffmpeg } = {}) {
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
  const res = await fetchImpl(`${engine.baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600000),
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

// Timing gate driven by MEASURED audio duration — never by estimates. The scene
// may only advance once the active narration has actually finished (+ gap).
export function createNarrationGate({ now, sleep, gapMs = SEGMENT_END_GAP_MS } = {}) {
  let endsAt = -Infinity; // now() timestamp the active narration ends; -inf = idle
  return {
    async wait() {
      const waitMs = endsAt + gapMs - now();
      if (waitMs > 0) await sleep(waitMs);
    },
    // Mark narration as started at `at`; it will play for `durationMs` (measured).
    start({ at, durationMs }) {
      endsAt = at + durationMs;
      return endsAt;
    },
  };
}

// Blocking narration engine for the recorder. narrate(text):
//   1. waits for any previous narration to finish,
//   2. generates the segment (audio asset on disk),
//   3. measures its real duration,
//   4. shows the caption (start == audio start),
//   5. resolves only after the narration has actually ended.
// onCaption(text, at) renders the subtitle; onWarn(msg) reports degradations.
// With engine === null (voiceover off/unavailable) narrate degrades to a visual
// caption + read hold and no TTS request is made.
export function createNarrator({
  engine = null, ffmpeg = null, outputDir, now, sleep,
  gapMs = SEGMENT_END_GAP_MS, silentReadMs = SILENT_READ_MS,
  onCaption = async () => {}, onWarn = () => {},
  fetchImpl = fetch, execFile = execFileSync,
} = {}) {
  const gate = createNarrationGate({ now, sleep, gapMs });
  const segments = []; // { text, at, file, durationMs } — audio timeline for the mux
  let n = 0;

  const visualBeat = async (text) => {
    await onCaption(text, now());
    await sleep(silentReadMs);
  };

  async function narrate(text) {
    const clean = String(text ?? '').trim();
    await gate.wait(); // previous narration always finishes before this beat
    if (!clean || !engine) { await visualBeat(clean); return; }
    const file = path.join(outputDir, `${String(++n).padStart(3, '0')}.wav`);
    let seg = null;
    try {
      seg = await createTtsAudio(engine, clean, file, { fetchImpl, execFile, ffmpeg });
    } catch (e) {
      onWarn(`[narrator] TTS failed for "${clean.slice(0, 48)}": ${e.message} — visual caption instead`);
    }
    if (!seg || !seg.durationMs) {
      if (seg) { try { unlinkSync(seg.file); } catch { /* keep for debugging */ } }
      if (seg) onWarn('[narrator] could not measure audio duration — segment dropped (never estimated)');
      await visualBeat(clean);
      return;
    }
    const at = now(); // caption appears exactly when the narration starts
    await onCaption(clean, at);
    segments.push({ text: clean, at, file, durationMs: seg.durationMs });
    gate.start({ at, durationMs: seg.durationMs });
    await gate.wait(); // hold the scene for the FULL measured duration
  }

  return { narrate, waitForNarration: gate.wait, segments };
}

export function buildAudioMixFilter(captions, env = process.env, inputOffset = 0) {
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
  delayed.push(`[aout]aresample=48000,loudnorm=I=${normalization.integratedLoudness}:TP=${normalization.maxTruePeak}:LRA=${normalization.loudnessRange}:linear=false[anorm]`);
  return delayed.join(';');
}

export function buildMuxArgs({ inputVideo, audioFiles, captions, output, format, env = process.env, fps, videoChain, extraInputArgs = [] }) {
  if (!Array.isArray(audioFiles) || !audioFiles.length) {
    throw new Error('Cannot mux voiceover without generated audio segments.');
  }
  const frameRate = Math.max(1, Math.round(Number(fps ?? env.DEMO_FPS) || 60));
  const args = ['-y', '-i', inputVideo, ...extraInputArgs];
  for (const audioFile of audioFiles) args.push('-i', audioFile);
  const extraCount = extraInputArgs.filter((arg) => arg === '-i').length;
  const audioFilter = buildAudioMixFilter(captions, env, extraCount);
  let videoMap = '0:v:0';
  let filter = audioFilter;
  if (format === 'mp4' && videoChain) {
    filter = `${videoChain};${audioFilter}`;
    videoMap = '[vout]';
  }
  args.push(
    '-filter_complex', filter,
    '-map', videoMap,
    '-map', '[anorm]',
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

export function muxVoiceover({ ffmpeg, inputVideo, audioFiles, captions, output, format, env = process.env, execFile = execFileSync, fps, videoChain, extraInputArgs = [], cwd }) {
  mkdirSync(path.dirname(output), { recursive: true });
  const args = buildMuxArgs({
    inputVideo, audioFiles, captions, output, format, env, fps, videoChain, extraInputArgs,
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
