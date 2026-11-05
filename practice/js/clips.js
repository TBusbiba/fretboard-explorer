// Recorded voice clips: which prompt texts have an mp3, and in what order to play them.
// The manifest (audio/voice/manifest.json) maps a normalized phrase to a file;
// tools/make-voice.mjs records it with the same normalize().

export const normalize = (t) => t.toLowerCase().replace(/♯/g, ' sharp').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The phrases of a prompt: split after . ! ? (commas stay inside "String 6, A"). */
export const segments = (text) => text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);

/** Files to play back to back for `text`, or null unless every segment has a clip. */
export function clipFiles(text, manifest) {
  const whole = manifest[normalize(text)];
  if (whole) return [whole];
  const segs = segments(text);
  if (!segs.length) return null;
  const files = segs.map(s => manifest[normalize(s)]);
  return files.every(Boolean) ? files : null;
}
