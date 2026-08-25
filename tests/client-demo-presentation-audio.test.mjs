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

test('builds delayed audio mix and format-specific mux arguments', () => {
  const captions = [{ text: 'First', at: 0 }, { text: 'Second', at: 1500 }];
  const filter = buildAudioMixFilter(captions);
  assert.match(filter, /\[1:a\]adelay=0:all=1\[a0\]/);
  assert.match(filter, /\[2:a\]adelay=1500:all=1\[a1\]/);
  assert.match(filter, /amix=inputs=2:duration=longest/);

  const args = buildMuxArgs({
    inputVideo: 'input.webm',
    audioFiles: ['first.wav', 'second.wav'],
    captions,
    output: 'output.webm',
    format: 'webm',
  });
  assert.deepEqual(args.slice(0, 7), ['-y', '-i', 'input.webm', '-i', 'first.wav', '-i', 'second.wav']);
  assert.ok(args.includes('-map') && args.includes('[aout]'));
  assert.ok(args.includes('libopus'));
  assert.equal(args.at(-1), 'output.webm');
  assert.equal(args.includes('-shortest'), false);
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
