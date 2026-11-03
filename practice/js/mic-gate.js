// When the microphone must be ignored: while the voice speaks or a note plays,
// plus a grace period after each stops. The speakers' tail, the synth's reverb
// and the room echo keep sounding after the playback itself ends, and the
// detector would hear them as a wrong note.

export const PLAYBACK_GRACE_MS = 600;   // after a played note ends
export const SPEECH_GRACE_MS = 250;     // after the voice stops

export function createMicGate({ grace = { sound: PLAYBACK_GRACE_MS, voice: SPEECH_GRACE_MS }, now = () => performance.now() } = {}) {
  const active = new Set();
  let until = 0;
  return {
    /** A source of sound started (`on`) or stopped. */
    block(name, on, at = now()) {
      if (on) active.add(name);
      else if (active.delete(name)) until = Math.max(until, at + (grace[name] ?? 0));
    },
    /** True while something plays or a grace period is running. */
    isMuted(at = now()) { return active.size > 0 || at < until; },
  };
}
