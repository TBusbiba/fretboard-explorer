// A reported note keeps ringing after it is played. When the next question asks for
// the same pitch (a note chain stepping from one string to another, a boss round),
// that tail would answer it at once. After a report, the same pitch is ignored until
// the mic has seen silence or a fresh attack: the level jumping well above the
// quietest it has been since the report.

export const ATTACK_RATIO = 1.6;   // a re-pluck is this much louder than the decayed ring
export const SILENCE_MS = 150;     // under the gate this long = the note has stopped
export const SETTLE_MS = 150;      // the report lands during the onset: don't call its own peak an attack

export function createAttackGuard({ ratio = ATTACK_RATIO, silenceMs = SILENCE_MS, settleMs = SETTLE_MS } = {}) {
  let armed = null, floor = 0, armedAt = 0, quietSince = null;
  return {
    get armed() { return armed; },
    /** A note was reported at this level. */
    arm(midi, rms, now) { armed = midi; floor = rms; armedAt = now; quietSince = null; },
    /** Every audio frame, muted or not. An attack only counts while the mic is listening. */
    update(rms, gate, now, muted = false) {
      if (armed == null) return;
      if (rms < gate) {
        if (quietSince == null) quietSince = now;
        else if (now - quietSince >= silenceMs) armed = null;
        floor = Math.min(floor, rms);
        return;
      }
      quietSince = null;
      if (!muted && now - armedAt >= settleMs && rms > Math.max(floor, gate) * ratio) { armed = null; return; }
      floor = Math.min(floor, rms);
    },
    /** True while this pitch must not be reported again. */
    blocks(midi) { return armed != null && armed === midi; },
    clear() { armed = null; quietSince = null; },
  };
}
