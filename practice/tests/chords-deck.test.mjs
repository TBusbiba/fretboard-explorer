import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECKS, cardsFor, spell, pitchClass, checkNotes, noteForPitch, chordMidis,
  promote, pickCard, signatureLabel, loadPrefs,
} from '../js/chords/deck.js';

const card = (id) => cardsFor('both').find(c => c.id === id);

test('the 14 major cards from the video', () => {
  const show = DECKS.major.map(c => `${c.name}:${c.notes.join('-')}:${c.signature}`);
  assert.deepEqual(show, [
    'C:C-E-G:0', 'G:G-B-D:1', 'D:D-F♯-A:2', 'A:A-C♯-E:3', 'E:E-G♯-B:4', 'B:B-D♯-F♯:5',
    'F♯:F♯-A♯-C♯:6', 'C♯:C♯-E♯-G♯:7', 'F:F-A-C:-1', 'B♭:B♭-D-F:-2', 'E♭:E♭-G-B♭:-3',
    'A♭:A♭-C-E♭:-4', 'D♭:D♭-F-A♭:-5', 'G♭:G♭-B♭-D♭:-6',
  ]);
});

test('minor cards are spelled properly and carry their key signature', () => {
  assert.equal(DECKS.minor.length, 15);
  assert.deepEqual(card('Am').notes, ['A', 'C', 'E']);
  assert.deepEqual(card('D♯m').notes, ['D♯', 'F♯', 'A♯']);
  assert.deepEqual(card('A♭m').notes, ['A♭', 'C♭', 'E♭']);
  assert.deepEqual(card('Cm').accidentals, ['B♭', 'E♭', 'A♭']);
  assert.equal(card('Em').relative, 'G');
  assert.equal(card('E♭').relative, 'Cm');
});

test('natural chords: only the seven roots without a sharp or flat', () => {
  assert.deepEqual(cardsFor('major', { natural: true }).map(c => c.name).sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(cardsFor('minor', { natural: true }).map(c => c.name).sort(), ['Am', 'Bm', 'Cm', 'Dm', 'Em', 'Fm', 'Gm']);
  assert.equal(cardsFor('both', { natural: true }).length, 14);
});

test('spelling and pitch classes', () => {
  assert.equal(spell('C♯', 4, 2), 'E♯');
  assert.equal(pitchClass('E♯'), 5);
  assert.equal(pitchClass('C♭'), 11);
  assert.equal(signatureLabel(-1), '1 flat');
  assert.equal(signatureLabel(3), '3 sharps');
});

test('answers: any order, enharmonics accepted but flagged', () => {
  assert.equal(checkNotes(card('E♭'), ['G', 'B♭', 'E♭']).correct, true);
  const r = checkNotes(card('C♯'), ['C♯', 'F', 'G♯']);
  assert.equal(r.correct, true);
  assert.equal(r.picks[1].spelledAs, 'E♯');
  const wrong = checkNotes(card('D'), ['D', 'F', 'A']);
  assert.equal(wrong.correct, false);
  assert.deepEqual(wrong.picks.map(p => p.ok), [true, false, true]);
  // the same pitch twice only counts once
  assert.equal(checkNotes(card('F♯'), ['F♯', 'G♭', 'C♯']).correct, false);
});

test('fretboard matching and playback notes', () => {
  assert.equal(noteForPitch(card('C♯'), 65), 'E♯');   // F on the neck is the E♯
  assert.equal(noteForPitch(card('C'), 61), null);
  assert.deepEqual(chordMidis(card('Am')), [57, 60, 64]);
});

test('scheduling favours cards you keep missing', () => {
  let boxes = {};
  boxes = promote(boxes, 'C', true);
  boxes = promote(boxes, 'C', true);
  assert.equal(boxes.C, 2);
  assert.equal(promote(boxes, 'C', false).C, 0);
  const cards = DECKS.major.slice(0, 2);
  const counts = { C: 0, G: 0 };
  const known = { C: 4, G: 0 };
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2000; i++) counts[pickCard(cards, known, null, rng).id]++;
  assert.ok(counts.G > counts.C * 5);
  assert.equal(pickCard(cards, {}, 'C').id, 'G');      // never the same card twice in a row
});

test('prefs: Natural chords and Notes only start on; saved prefs migrate once, then keep a later choice', () => {
  assert.deepEqual([loadPrefs().natural, loadPrefs().notesOnly], [true, true]);
  const old = loadPrefs({ deck: 'minor', natural: false, notesOnly: false });
  assert.deepEqual([old.deck, old.natural, old.notesOnly, old.defaultsV2], ['minor', true, true, true]);
  const later = loadPrefs({ ...old, natural: false });
  assert.deepEqual([later.natural, later.notesOnly], [false, true]);
});
