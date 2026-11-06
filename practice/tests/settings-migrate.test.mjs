import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, migrate } from '../js/settings.js';

test('Play the notes is off by default', () => assert.equal(DEFAULTS.playNotes, false));

test('saved settings with Play the notes on are switched off once', () => {
  const first = migrate({ playNotes: true });
  assert.equal(first.playNotes, false);
  assert.equal(first.playNotesOffDone, true);
  const turnedOn = migrate({ ...first, playNotes: true });
  assert.equal(turnedOn.playNotes, true);
});

test('Progressions: names by default; triadMode progressions and progDisplay survive migrate', () => {
  assert.equal(DEFAULTS.progDisplay, 'names');
  assert.equal(migrate({ triadMode: 'progressions' }).triadMode, 'progressions');
  assert.equal(migrate({ progDisplay: 'numbers' }).progDisplay, 'numbers');
});

test('Progressions: unknown triadMode or progDisplay fall back to the defaults', () => {
  assert.equal('triadMode' in migrate({ triadMode: 'bogus' }), false);
  assert.equal('progDisplay' in migrate({ progDisplay: 'roman' }), false);
  assert.equal('progDisplay' in migrate({ progDisplay: 7 }), false);
});
