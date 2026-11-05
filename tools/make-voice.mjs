// Records the Practice voice clips once with ElevenLabs.
// Usage: ELEVENLABS_API_KEY=... node tools/make-voice.mjs [--force]
// Writes practice/audio/voice/<slug>.mp3 and manifest.json ({ normalized text: file }).
// Existing clips are kept unless --force, so re-runs only record new phrases.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const VOICE = 'pNInz6obpgDQGcFmaJgB'; // Adam
const OUT = new URL('../practice/audio/voice/', import.meta.url);
const KEY = process.env.ELEVENLABS_API_KEY;
const FORCE = process.argv.includes('--force');
if (!KEY) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }

const NOTES = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B'];
const STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'E', 'high E'];

export const normalize = (t) => t.toLowerCase().replace(/♯/g, ' sharp').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// [text, style]: 'plain' = calm and clear, 'hype' = excited announcer.
const phrases = [];
const add = (text, style = 'plain') => phrases.push([text, style]);

for (let n = 1; n <= 6; n++) for (const note of NOTES) add(`String ${n}, ${note}`);
for (const note of NOTES) { add(note); add(`That was ${note}`); }
['Correct', 'Good', 'Octave too high', 'Octave too low'].forEach(t => add(t));
['Nice!', 'Great!', 'On fire!', 'Unstoppable!', 'Legendary!', 'Chain complete!', 'New best streak!'].forEach(t => add(t, 'hype'));
add('Quick note chain round!', 'hype');
for (const count of [3, 4, 5]) for (const note of NOTES) add(`${['Three', 'Four', 'Five'][count - 3]} ${note} notes!`, 'hype');
for (const s of STRING_NAMES) add(`Start with the ${s} string!`, 'hype');
add('Boss round!', 'hype');
for (const note of NOTES) { add(`Find every ${note}!`, 'hype'); add(`Next: every ${note}!`, 'hype'); }

const slug = (t) => normalize(t).replace(/ /g, '-');
const manifestPath = new URL('manifest.json', OUT);
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
mkdirSync(OUT, { recursive: true });

let made = 0, chars = 0;
for (const [text, style] of phrases) {
  const file = `${slug(text)}.mp3`;
  const key = normalize(text);
  if (!FORCE && existsSync(new URL(file, OUT))) { manifest[key] = file; continue; }
  const body = style === 'hype'
    ? { text: `[excited] ${text}`, model_id: 'eleven_v3' }
    : { text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.6, similarity_boost: 0.8 } };
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
    method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) { console.error(`${res.status} on "${text}": ${(await res.text()).slice(0, 200)}`); process.exit(1); }
  writeFileSync(new URL(file, OUT), Buffer.from(await res.arrayBuffer()));
  manifest[key] = file; made++; chars += text.length;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
console.log(`${phrases.length} phrases, ${made} recorded now (${chars} characters), manifest has ${Object.keys(manifest).length}`);
