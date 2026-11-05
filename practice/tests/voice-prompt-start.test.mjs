import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../js/clips.js';

const files = { [normalize('Correct!')]: 'correct.mp3', [normalize('Nice!')]: 'nice.mp3', [normalize('String 6, A')]: 's6a.mp3' };
const log = [];
globalThis.fetch = async () => ({ ok: true, json: async () => files });
globalThis.Audio = class {
  constructor(url) { this.url = url; this.listeners = {}; this.ended = false; }
  addEventListener(n, f) { this.listeners[n] = f; }
  removeEventListener(n) { delete this.listeners[n]; }
  pause() {}
  play() { const name = this.url.split('/').pop().split('?')[0]; log.push(`play ${name}`); setTimeout(() => { this.ended = true; this.listeners.ended?.(); }, 5); return Promise.resolve(); }
};
const { createVoice } = await import('../js/voice.js');

test('onPromptStart fires when the last phrase starts, not the earlier ones', async () => {
  const voice = createVoice();
  log.length = 0;
  await voice.speak('Correct! Nice! String 6, A', { onPromptStart: () => log.push('prompt') });
  assert.deepEqual(log, ['play correct.mp3', 'play nice.mp3', 'play s6a.mp3', 'prompt']);
});

test('a lone prompt clip reports its start once', async () => {
  const voice = createVoice();
  log.length = 0;
  await voice.speak('String 6, A', { onPromptStart: () => log.push('prompt') });
  assert.deepEqual(log, ['play s6a.mp3', 'prompt']);
});
