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
