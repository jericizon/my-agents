import { execFileSync, spawnSync as defaultSpawnSync } from 'child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import path from 'path';

const VOICEOVER_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isVoiceoverEnabled(value) {
  if (typeof value === 'boolean') return value;
  return VOICEOVER_TRUE_VALUES.has(String(value || '').trim().toLowerCase());
}

function isExecutable(file, platform) {
  try {
    const stat = statSync(file);
    return stat.isFile() && (platform === 'win32' || (stat.mode & 0o111) !== 0);
  } catch {
    return false;
  }
}

export function resolveExecutable(command, { platform = process.platform, env = process.env } = {}) {
  if (!command) return null;
  if (path.isAbsolute(command)) return isExecutable(command, platform) ? command : null;

  const pathEntries = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  const extensions = platform === 'win32'
    ? String(env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, command + extension);
      if (isExecutable(candidate, platform)) return candidate;
    }
  }
  return null;
}

const TTS_ENGINE_CONFIG = {
  darwin: { kind: 'say', candidates: ['say'], label: 'macOS say' },
  win32: {
    kind: 'powershell',
    candidates: ['powershell.exe', 'pwsh.exe', 'powershell', 'pwsh'],
    label: 'Windows PowerShell with SAPI',
  },
  linux: { kind: 'espeak', candidates: ['espeak-ng', 'espeak'], label: 'Linux espeak-ng or espeak' },
  freebsd: { kind: 'espeak', candidates: ['espeak-ng', 'espeak'], label: 'BSD espeak-ng or espeak' },
  openbsd: { kind: 'espeak', candidates: ['espeak-ng', 'espeak'], label: 'BSD espeak-ng or espeak' },
  sunos: { kind: 'espeak', candidates: ['espeak-ng', 'espeak'], label: 'SunOS espeak-ng or espeak' },
};

export function resolveTtsEngine({ platform = process.platform, env = process.env } = {}) {
  const config = TTS_ENGINE_CONFIG[platform];
  if (!config) {
    throw new Error(`Voiceover is not supported on platform ${platform}; set up a supported local TTS engine first.`);
  }

  const candidates = env.DEMO_TTS_BIN ? [env.DEMO_TTS_BIN] : config.candidates;
  const command = candidates.map((candidate) => resolveExecutable(candidate, { platform, env })).find(Boolean);
  if (!command) {
    throw new Error(`Voiceover requested but no supported local TTS engine was found (${config.label}). Install it or set DEMO_TTS_BIN.`);
  }

  return { kind: config.kind, command };
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

export function createTtsAudio(engine, text, outputPath, { spawnSync = defaultSpawnSync, env = process.env } = {}) {
  const spokenText = String(text || '').trim();
  if (!spokenText) throw new Error('Cannot generate voiceover audio for an empty caption.');
  mkdirSync(path.dirname(outputPath), { recursive: true });

  let result;
  if (engine.kind === 'espeak') {
    result = spawnSync(engine.command, ['--stdout', spokenText], {
      encoding: null,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`TTS failed for caption: ${result.error?.message || String(result.stderr || '').trim() || `exit code ${result.status}`}`);
    }
    writeFileSync(outputPath, result.stdout);
  } else if (engine.kind === 'say') {
    result = spawnSync(engine.command, ['-o', outputPath, spokenText], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`TTS failed for caption: ${result.error?.message || String(result.stderr || '').trim() || `exit code ${result.status}`}`);
    }
  } else if (engine.kind === 'powershell') {
    const script = '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $s.SetOutputToWaveFile($env:DEMO_VOICEOVER_OUTPUT); $s.Speak($env:DEMO_VOICEOVER_TEXT) } finally { $s.Dispose() }';
    result = spawnSync(engine.command, ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      env: { ...env, DEMO_VOICEOVER_OUTPUT: outputPath, DEMO_VOICEOVER_TEXT: spokenText },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`TTS failed for caption: ${result.error?.message || String(result.stderr || '').trim() || `exit code ${result.status}`}`);
    }
  } else {
    throw new Error(`Unsupported TTS engine: ${engine.kind}`);
  }

  if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
    throw new Error(`TTS produced no audio file at ${outputPath}`);
  }
  return outputPath;
}

export function generateVoiceoverSegments({ captions, engine, outputDir, spawnSync = defaultSpawnSync, env = process.env } = {}) {
  const timeline = buildCaptionTimeline(captions);
  if (!timeline.length) throw new Error('Voiceover requested but the flow produced no non-empty captions.');
  mkdirSync(outputDir, { recursive: true });
  const extension = engine.kind === 'say' ? 'aiff' : 'wav';
  return timeline.map((caption, index) => {
    const file = path.join(outputDir, `${String(index + 1).padStart(3, '0')}.${extension}`);
    createTtsAudio(engine, caption.text, file, { spawnSync, env });
    return file;
  });
}

export function buildAudioMixFilter(captions) {
  const timeline = buildCaptionTimeline(captions);
  if (!timeline.length) throw new Error('Cannot build an audio mix without captions.');
  const delayed = timeline.map((caption, index) => {
    const delay = Math.max(0, Math.round(caption.at));
    return `[${index + 1}:a]adelay=${delay}:all=1[a${index}]`;
  });
  const inputs = timeline.map((_, index) => `[a${index}]`).join('');
  delayed.push(`${inputs}amix=inputs=${timeline.length}:duration=longest:dropout_transition=0:normalize=1[aout]`);
  return delayed.join(';');
}

export function buildMuxArgs({ inputVideo, audioFiles, captions, output, format }) {
  if (!Array.isArray(audioFiles) || !audioFiles.length) {
    throw new Error('Cannot mux voiceover without generated audio segments.');
  }
  const args = ['-y', '-i', inputVideo];
  for (const audioFile of audioFiles) args.push('-i', audioFile);
  args.push(
    '-filter_complex', buildAudioMixFilter(captions),
    '-map', '0:v:0',
    '-map', '[aout]',
  );

  if (format === 'webm') {
    args.push('-c:v', 'copy', '-c:a', 'libopus', '-b:a', '128k');
  } else if (format === 'mp4') {
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '24', '-c:a', 'aac', '-b:a', '128k');
  } else {
    throw new Error(`Unsupported voiceover output format: ${format}`);
  }

  args.push(output);
  return args;
}

export function muxVoiceover({ ffmpeg, inputVideo, audioFiles, captions, output, format, execFile = execFileSync }) {
  mkdirSync(path.dirname(output), { recursive: true });
  const args = buildMuxArgs({ inputVideo, audioFiles, captions, output, format });
  try {
    execFile(ffmpeg, args, { stdio: 'ignore' });
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
