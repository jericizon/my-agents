import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {
  buildAudioMixFilter,
  buildCaptionTimeline,
  buildMuxArgs,
  createTtsAudio,
  generateVoiceoverSegments,
  isVoiceoverEnabled,
  muxVoiceover,
  resolveTtsEngine,
  verifyAudioStream,
} from '../custom/skills/client-demo-presentation/assets/voiceover.mjs';

test('voiceover flag accepts true values without enabling false values', () => {
  assert.equal(isVoiceoverEnabled(true), true);
  assert.equal(isVoiceoverEnabled('1'), true);
  assert.equal(isVoiceoverEnabled('yes'), true);
  assert.equal(isVoiceoverEnabled('false'), false);
  assert.equal(isVoiceoverEnabled(undefined), false);
});

test('caption timeline keeps non-empty captions and normalizes timestamps', () => {
  assert.deepEqual(buildCaptionTimeline([
    { text: ' Welcome ', at: 2.4 },
    { text: '', at: 4 },
    { text: 'Next', at: -2 },
    { text: 'invalid', at: Number.NaN },
  ]), [
    { text: 'Welcome', at: 2 },
    { text: 'Next', at: 0 },
  ]);
});

test('resolves the preferred Linux TTS executable from PATH', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-tts-'));
  try {
    const executable = path.join(directory, 'espeak-ng');
    writeFileSync(executable, 'test');
    chmodSync(executable, 0o755);
    assert.deepEqual(resolveTtsEngine({ platform: 'linux', env: { PATH: directory } }), {
      kind: 'espeak',
      command: executable,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('resolves Piper with a model and sidecar config', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-piper-'));
  try {
    const executable = path.join(directory, 'piper');
    const model = path.join(directory, 'en_US-ljspeech-high.onnx');
    writeFileSync(executable, 'test');
    writeFileSync(model, 'model');
    writeFileSync(`${model}.json`, '{}');
    chmodSync(executable, 0o755);
    assert.deepEqual(resolveTtsEngine({
      platform: 'linux',
      env: { PATH: directory, DEMO_TTS_ENGINE: 'piper', DEMO_TTS_MODEL: model },
    }), {
      kind: 'piper',
      command: executable,
      model,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('requires a Piper model and sidecar config when Piper is selected', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-piper-missing-'));
  try {
    const executable = path.join(directory, 'piper');
    writeFileSync(executable, 'test');
    chmodSync(executable, 0o755);
    assert.throws(
      () => resolveTtsEngine({
        platform: 'linux',
        env: { PATH: directory, DEMO_TTS_ENGINE: 'piper', DEMO_TTS_MODEL: path.join(directory, 'missing.onnx') },
      }),
      /Piper voice model not found/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects an invalid Piper model config JSON file', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-piper-config-'));
  try {
    const executable = path.join(directory, 'piper');
    const model = path.join(directory, 'voice.onnx');
    writeFileSync(executable, 'test');
    writeFileSync(model, 'model');
    writeFileSync(`${model}.json`, '{invalid');
    chmodSync(executable, 0o755);
    assert.throws(
      () => resolveTtsEngine({
        platform: 'linux',
        env: { PATH: directory, DEMO_TTS_ENGINE: 'piper', DEMO_TTS_MODEL: model },
      }),
      /Piper voice model config is not valid JSON/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a TTS engine that does not match the host platform', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-engine-mismatch-'));
  try {
    const executable = path.join(directory, 'espeak-ng');
    writeFileSync(executable, 'test');
    chmodSync(executable, 0o755);
    assert.throws(
      () => resolveTtsEngine({
        platform: 'linux',
        env: { PATH: directory, DEMO_TTS_ENGINE: 'say' },
      }),
      /DEMO_TTS_ENGINE 'say' is not supported on linux/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('generates Piper audio with the natural presentation profile', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-piper-audio-'));
  try {
    let captured;
    const outputPath = path.join(directory, 'voice.wav');
    const spawnSync = (command, args, options) => {
      captured = { command, args, options };
      writeFileSync(outputPath, 'wav');
      return { status: 0, error: null, stdout: '', stderr: '' };
    };
    assert.equal(createTtsAudio({
      kind: 'piper',
      command: 'piper',
      model: '/voices/en_US-lessac-high.onnx',
    }, 'Clear narration', outputPath, { spawnSync }), outputPath);
    assert.deepEqual(captured, {
      command: 'piper',
      args: [
        '--model', '/voices/en_US-lessac-high.onnx',
        '--output_file', outputPath,
        '--length_scale', '1',
        '--noise_scale', '0.667',
        '--noise_w_scale', '0.8',
        '--sentence_silence', '0.12',
        '--volume', '1',
      ],
      options: {
        input: 'Clear narration\n',
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('allows safe overrides for the Piper natural presentation profile', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-piper-profile-'));
  try {
    let captured;
    const outputPath = path.join(directory, 'voice.wav');
    const spawnSync = (command, args, options) => {
      captured = { command, args, options };
      writeFileSync(outputPath, 'wav');
      return { status: 0, error: null, stdout: '', stderr: '' };
    };
    createTtsAudio({ kind: 'piper', command: 'piper', model: '/voices/voice.onnx' }, 'Narration', outputPath, {
      spawnSync,
      env: {
        DEMO_TTS_LENGTH_SCALE: '1.05',
        DEMO_TTS_NOISE_SCALE: '0.55',
        DEMO_TTS_NOISE_W_SCALE: '0.75',
        DEMO_TTS_SENTENCE_SILENCE: '0.18',
        DEMO_TTS_VOLUME: '0.98',
      },
    });
    assert.deepEqual(captured.args, [
      '--model', '/voices/voice.onnx',
      '--output_file', outputPath,
      '--length_scale', '1.05',
      '--noise_scale', '0.55',
      '--noise_w_scale', '0.75',
      '--sentence_silence', '0.18',
      '--volume', '0.98',
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('generates caption audio segments through the selected TTS engine', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-voiceover-'));
  try {
    const spawnSync = (_command, args) => ({
      status: 0,
      error: null,
      stdout: Buffer.from(`audio:${args.at(-1)}`),
      stderr: Buffer.alloc(0),
    });
    const files = generateVoiceoverSegments({
      captions: [{ text: 'First', at: 0 }, { text: 'Second', at: 1000 }],
      engine: { kind: 'espeak', command: 'espeak' },
      outputDir: directory,
      spawnSync,
    });
    assert.equal(files.length, 2);
    assert.equal(readFileSync(files[0], 'utf8'), 'audio:First');
    assert.equal(readFileSync(files[1], 'utf8'), 'audio:Second');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('builds delayed audio mix and normalizes the complete track', () => {
  const captions = [{ text: 'First', at: 0 }, { text: 'Second', at: 1500 }];
  const filter = buildAudioMixFilter(captions);
  assert.match(filter, /\[1:a\]adelay=0:all=1\[a0\]/);
  assert.match(filter, /\[2:a\]adelay=1500:all=1\[a1\]/);
  assert.match(filter, /amix=inputs=2:duration=longest/);
  assert.match(filter, /\[aout\]aresample=48000,loudnorm=I=-16:TP=-1\.5:LRA=7:linear=false\[anorm\]/);

  const args = buildMuxArgs({
    inputVideo: 'input.webm',
    audioFiles: ['first.wav', 'second.wav'],
    captions,
    output: 'output.webm',
    format: 'webm',
  });
  assert.deepEqual(args.slice(0, 7), ['-y', '-i', 'input.webm', '-i', 'first.wav', '-i', 'second.wav']);
  assert.ok(args.includes('-map') && args.includes('[anorm]'));
  assert.equal(args.includes('[aout]'), false);
  assert.ok(args.includes('libopus'));
  assert.equal(args.at(-1), 'output.webm');
  assert.equal(args.includes('-shortest'), false);
});

test('allows safe overrides for the final loudness target', () => {
  const filter = buildAudioMixFilter([{ text: 'Narration', at: 0 }], {
    DEMO_AUDIO_TARGET_LUFS: '-18',
    DEMO_AUDIO_MAX_TRUE_PEAK: '-2',
    DEMO_AUDIO_TARGET_LRA: '5',
  });
  assert.match(filter, /loudnorm=I=-18:TP=-2:LRA=5:linear=false/);
});

test('rejects invalid loudness target overrides', () => {
  assert.throws(
    () => buildAudioMixFilter([{ text: 'Narration', at: 0 }], { DEMO_AUDIO_TARGET_LUFS: 'loud' }),
    /DEMO_AUDIO_TARGET_LUFS must be a number between -70 and -5/,
  );
});

test('rejects invalid Piper profile overrides', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-piper-invalid-profile-'));
  try {
    assert.throws(
      () => createTtsAudio(
        { kind: 'piper', command: 'piper', model: '/voices/voice.onnx' },
        'Narration',
        path.join(directory, 'voice.wav'),
        { spawnSync: () => ({ status: 0, error: null, stdout: '', stderr: '' }), env: { DEMO_TTS_LENGTH_SCALE: '0' } },
      ),
      /DEMO_TTS_LENGTH_SCALE must be a number greater than 0 and at most 2/,
    );
    assert.throws(
      () => createTtsAudio(
        { kind: 'piper', command: 'piper', model: '/voices/voice.onnx' },
        'Narration',
        path.join(directory, 'voice.wav'),
        { spawnSync: () => ({ status: 0, error: null, stdout: '', stderr: '' }), env: { DEMO_TTS_NOISE_SCALE: '2.1' } },
      ),
      /DEMO_TTS_NOISE_SCALE must be a number between 0 and 2/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runs ffmpeg to create the requested voiceover output', () => {
  let captured;
  const execFile = (command, args, options) => {
    captured = { command, args, options };
  };
  const result = muxVoiceover({
    ffmpeg: '/tmp/ffmpeg',
    inputVideo: 'input.webm',
    audioFiles: ['voice.wav'],
    captions: [{ text: 'Welcome', at: 0 }],
    output: 'output.webm',
    format: 'webm',
    execFile,
  });
  assert.equal(result, 'output.webm');
  assert.equal(captured.command, '/tmp/ffmpeg');
  assert.ok(captured.args.includes('output.webm'));
  assert.deepEqual(captured.options, { stdio: 'ignore' });
});

test('passes loudness overrides through the voiceover mux', () => {
  let captured;
  muxVoiceover({
    ffmpeg: '/tmp/ffmpeg',
    inputVideo: 'input.webm',
    audioFiles: ['voice.wav'],
    captions: [{ text: 'Welcome', at: 0 }],
    output: 'output.webm',
    format: 'webm',
    env: {
      DEMO_AUDIO_TARGET_LUFS: '-18',
      DEMO_AUDIO_MAX_TRUE_PEAK: '-2',
      DEMO_AUDIO_TARGET_LRA: '5',
    },
    execFile: (_command, args) => { captured = args; },
  });
  assert.match(captured[captured.indexOf('-filter_complex') + 1], /loudnorm=I=-18:TP=-2:LRA=5:linear=false/);
});

test('verifies an audio stream with the ffmpeg executable', () => {
  let captured;
  const execFile = (command, args, options) => {
    captured = { command, args, options };
  };
  assert.equal(verifyAudioStream({ ffmpeg: '/tmp/ffmpeg', mediaPath: 'demo.mp4', execFile }), true);
  assert.deepEqual(captured, {
    command: '/tmp/ffmpeg',
    args: ['-v', 'error', '-i', 'demo.mp4', '-map', '0:a:0', '-f', 'null', '-'],
    options: { stdio: 'ignore' },
  });
});

test('reports a missing local TTS engine clearly', () => {
  assert.throws(
    () => resolveTtsEngine({ platform: 'linux', env: { PATH: '' } }),
    /no supported local TTS engine was found/,
  );
});

test('reports an empty caption timeline clearly', () => {
  assert.throws(
    () => generateVoiceoverSegments({
      captions: [],
      engine: { kind: 'espeak', command: 'espeak' },
      outputDir: path.join(os.tmpdir(), 'client-demo-empty-voiceover'),
    }),
    /no non-empty captions/,
  );
});

test('wraps TTS process failures with caption context', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'client-demo-tts-failure-'));
  try {
    assert.throws(
      () => createTtsAudio(
        { kind: 'espeak', command: 'espeak' },
        'Hello',
        path.join(directory, 'voice.wav'),
        { spawnSync: () => ({ status: 1, error: null, stdout: Buffer.alloc(0), stderr: 'missing voice' }) },
      ),
      /TTS failed for caption: missing voice/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('wraps ffmpeg mux failures', () => {
  assert.throws(
    () => muxVoiceover({
      ffmpeg: '/tmp/ffmpeg',
      inputVideo: 'input.webm',
      audioFiles: ['voice.wav'],
      captions: [{ text: 'Welcome', at: 0 }],
      output: 'output.webm',
      format: 'webm',
      execFile: () => { throw new Error('codec failure'); },
    }),
    /ffmpeg failed while adding voiceover: codec failure/,
  );
});

test('wraps audio probe failures', () => {
  assert.throws(
    () => verifyAudioStream({
      ffmpeg: '/tmp/ffmpeg',
      mediaPath: 'demo.mp4',
      execFile: () => { throw new Error('no audio'); },
    }),
    /No usable audio stream found in demo.mp4: no audio/,
  );
});
