import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'fs';
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
const SEGMENT_END_GAP_MS = 350; // silence tail each segment must leave before the next caption
const ATEMPO_MAX = 3; // tempo ceiling when squeezing one segment into its caption window

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

// RIFF/WAVE duration in seconds — the mixer needs each segment's length to keep
// it inside its caption window. Returns null for non-wav or unparseable files.
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
      if (id === 'fmt ') byteRate = buf.readUInt32LE(offset + 12);
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
  return outputPath;
}

export async function generateVoiceoverSegments({ captions, engine, outputDir, fetchImpl = fetch, execFile = execFileSync, ffmpeg } = {}) {
  const timeline = buildCaptionTimeline(captions);
  if (!timeline.length) throw new Error('Voiceover requested but the flow produced no non-empty captions.');
  mkdirSync(outputDir, { recursive: true });
  const files = [];
  for (const [index, caption] of timeline.entries()) {
    const file = path.join(outputDir, `${String(index + 1).padStart(3, '0')}.wav`);
    await createTtsAudio(engine, caption.text, file, { fetchImpl, execFile, ffmpeg });
    files.push(file);
  }
  return files;
}

export function buildAudioMixFilter(captions, env = process.env, inputOffset = 0, segmentDurations = [], totalDurationMs = null) {
  const timeline = buildCaptionTimeline(captions);
  if (!timeline.length) throw new Error('Cannot build an audio mix without captions.');
  const base = 1 + inputOffset;
  const endGapMs = readConfiguredNumber(env, 'DEMO_VO_GAP_MS', SEGMENT_END_GAP_MS, {
    min: 0,
    max: 10000,
    rangeDescription: 'between 0 and 10000',
  });
  const delayed = timeline.map((caption, index) => {
    const at = Math.max(0, Math.round(caption.at));
    const nextAt = index + 1 < timeline.length
      ? timeline[index + 1].at
      : (totalDurationMs ?? Number.POSITIVE_INFINITY);
    const availableSec = (nextAt - at - endGapMs) / 1000;
    const durationSec = Number(segmentDurations[index]);
    // Squeeze a segment that would outlast its caption window so narration
    // never overlaps the next caption's narration.
    let pre = '';
    if (Number.isFinite(durationSec) && durationSec > 0 && availableSec > 0.25 && durationSec > availableSec) {
      pre = `atempo=${Math.min(durationSec / availableSec, ATEMPO_MAX).toFixed(3)},`;
    }
    return `[${base + index}:a]${pre}adelay=${at}:all=1[a${index}]`;
  });
  const inputs = timeline.map((_, index) => `[a${index}]`).join('');
  delayed.push(`${inputs}amix=inputs=${timeline.length}:duration=longest:dropout_transition=0:normalize=1[aout]`);
  const normalization = resolveAudioNormalization(env);
  delayed.push(`[aout]aresample=48000,loudnorm=I=${normalization.integratedLoudness}:TP=${normalization.maxTruePeak}:LRA=${normalization.loudnessRange}:linear=false[anorm]`);
  return delayed.join(';');
}

export function buildMuxArgs({ inputVideo, audioFiles, captions, output, format, env = process.env, fps, videoChain, extraInputArgs = [], segmentDurations = [], totalDurationMs = null }) {
  if (!Array.isArray(audioFiles) || !audioFiles.length) {
    throw new Error('Cannot mux voiceover without generated audio segments.');
  }
  const frameRate = Math.max(1, Math.round(Number(fps ?? env.DEMO_FPS) || 60));
  const args = ['-y', '-i', inputVideo, ...extraInputArgs];
  for (const audioFile of audioFiles) args.push('-i', audioFile);
  const extraCount = extraInputArgs.filter((arg) => arg === '-i').length;
  const audioFilter = buildAudioMixFilter(captions, env, extraCount, segmentDurations, totalDurationMs);
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
  const segmentDurations = audioFiles.map((file) => wavDurationSeconds(file));
  const videoSeconds = probeMediaDurationSeconds(ffmpeg, inputVideo, execFile);
  const totalDurationMs = videoSeconds ? videoSeconds * 1000 : null;
  const args = buildMuxArgs({
    inputVideo, audioFiles, captions, output, format, env, fps, videoChain, extraInputArgs,
    segmentDurations, totalDurationMs,
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
