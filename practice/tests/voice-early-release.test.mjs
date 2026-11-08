import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../js/clips.js';

const files = { [normalize('Alpha!')]: 'alpha.mp3', [normalize('Beta!')]: 'beta.mp3' };
const DURATION = 0.4;   // seconds
globalThis.fetch = async () => ({ ok: true, json: async () => files });
globalThis.Audio = class {
  constructor(url) { this.url = url; this.listeners = {}; this.ended = false; this.duration = DURATION; this.t0 = null; this.playbackRate = 1; }
  set currentTime(v) { this.t0 = null; }
  get currentTime() { return this.t0 == null ? 0 : Math.min(DURATION, (Date.now() - this.t0) / 1000); }
  addEventListener(n, f) { this.listeners[n] = f; }
  removeEventListener(n) { delete this.listeners[n]; }
  pause() {}
  play() { this.t0 = Date.now(); setTimeout(() => { this.ended = true; this.listeners.ended?.(); }, DURATION * 1000); return Promise.resolve(); }
};
const { createVoice } = await import('../js/voice.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('earlyMs frees the voice that long before the last clip ends, once', async () => {
  const log = [];
  const t0 = Date.now();
  const voice = createVoice({ onSpeaking: (v) => log.push([v, Date.now() - t0]) });
  await voice.speak('Alpha! Beta!', { earlyMs: 200 });
  const freed = Date.now() - t0;
  assert.ok(freed >= 2 * 400 - 200 - 40 && freed < 2 * 400 - 20, `freed at ${freed}ms of 800`);
  assert.deepEqual(log.map(l => l[0]), [true, false]);
  await sleep(300);
  assert.deepEqual(log.map(l => l[0]), [true, false]);
});

test('without earlyMs the voice is held until the last clip ends', async () => {
  const t0 = Date.now();
  const voice = createVoice();
  await voice.speak('Alpha! Beta!');
  assert.ok(Date.now() - t0 >= 780);
});
