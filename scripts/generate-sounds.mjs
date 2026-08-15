/**
 * Generates the game's sound effects as real .wav assets.
 *
 * These are synthesised from scratch so the project carries no third-party
 * audio licensing. They're deliberately simple and are meant to be replaced
 * by designed sound effects later — drop new files in assets/sounds/ with the
 * same names and nothing else has to change.
 *
 * Run with:  node scripts/generate-sounds.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** Sum of sine partials, giving a slightly warmer tone than a bare sine. */
function voice(t, freq) {
  return (
    Math.sin(2 * Math.PI * freq * t) * 0.7 +
    Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 +
    Math.sin(2 * Math.PI * freq * 3 * t) * 0.06
  );
}

/**
 * Renders a sequence of notes into a mono float buffer.
 * Each note fades in and out to avoid clicks at the boundaries.
 */
function render(notes) {
  const total = Math.max(...notes.map((n) => n.start + n.duration));
  const length = Math.ceil(total * SAMPLE_RATE);
  const buffer = new Float32Array(length);

  for (const note of notes) {
    const startSample = Math.floor(note.start * SAMPLE_RATE);
    const noteSamples = Math.floor(note.duration * SAMPLE_RATE);
    const attack = Math.floor(0.006 * SAMPLE_RATE);

    for (let i = 0; i < noteSamples; i += 1) {
      const index = startSample + i;
      if (index >= length) break;

      const t = i / SAMPLE_RATE;
      const progress = i / noteSamples;

      // Fast attack, exponential decay — a plucked/bell shape.
      const attackGain = i < attack ? i / attack : 1;
      const decayGain = Math.pow(1 - progress, note.decay ?? 2.2);

      // Optional upward glide over the note.
      const freq = note.freq + (note.glide ?? 0) * progress;

      buffer[index] += voice(t, freq) * attackGain * decayGain * note.gain;
    }
  }

  return buffer;
}

function toWav(buffer, target = 0.89) {
  // Normalise to avoid clipping when notes overlap. The target differs per
  // sound: a press that fires on every touch has to sit under the sounds that
  // mean something, or the app rattles.
  let peak = 0;
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
  const scale = peak > 0 ? target / peak : 1;

  const data = Buffer.alloc(buffer.length * 2);
  for (let i = 0; i < buffer.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, buffer[i] * scale));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(1, 22); // channels = mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

// Note frequencies (equal temperament).
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880.0;
const B5 = 987.77;
const C6 = 1046.5;
const D6 = 1174.66;
const E6 = 1318.51;
const G6 = 1567.98;
const C7 = 2093.0;

/**
 * A press, as a switch closing.
 *
 * The first attempt built it the way a physical button is built - noise
 * transient, tuned body, low thump - which at this volume is also how a
 * suppressed gunshot is built. This gets the same physicality with no noise in
 * it at all: a two-millisecond snap high above the body, then a short round
 * tone underneath. The snap is what the finger feels; the body is what the ear
 * keeps.
 *
 * Fifty milliseconds, because the thing that makes a press wear badly is not
 * its character but its length - anything that rings starts overlapping itself
 * when somebody taps quickly.
 *
 * Back is the same instrument struck lower and left to sit: no snap, a longer
 * decay, felt more than heard.
 */
function press({ freq, snap = 0, snapFreq = 2600, length = 0.05, decay = 95, mix = 0 }) {
  const total = Math.floor(length * SAMPLE_RATE);
  const buffer = new Float32Array(total);

  for (let i = 0; i < total; i += 1) {
    const t = i / SAMPLE_RATE;
    const progress = i / total;
    // A fade at the very end, or the buffer cuts mid-cycle and adds a click of
    // its own - which is the thing being avoided.
    const tail = progress > 0.88 ? (1 - progress) / 0.12 : 1;

    const contact = snap * Math.sin(2 * Math.PI * snapFreq * t) * Math.exp(-t * 900);
    const body =
      Math.sin(2 * Math.PI * freq * t) +
      (mix ? mix * Math.sin(2 * Math.PI * freq * 2 * t) : 0);

    buffer[i] = (contact + body * Math.exp(-t * decay)) * tail;
  }

  return buffer;
}

const SOUNDS = {
  // Every press in the app: a snap into a short round body.
  tap: press({ freq: 520, snap: 0.5, length: 0.05, decay: 95 }),

  // Going back: the same body an octave and a half down, no snap on the front,
  // left to fall away - so the pair is one instrument rather than two effects.
  back: press({ freq: 220, snap: 0, mix: 0.25, length: 0.09, decay: 52 }),

  // WITHIN 10 — a bright, quick two-note lift. Encouraging, not a fanfare.
  'within-10': render([
    { start: 0, duration: 0.16, freq: A5, gain: 0.55, decay: 2.4 },
    { start: 0.09, duration: 0.34, freq: E6, gain: 0.6, decay: 2.6 },
  ]),

  // ONE AWAY — tenser and taller: a fast rising triplet that keeps climbing,
  // so it clearly outranks WITHIN 10 without becoming the win sound.
  'one-away': render([
    { start: 0, duration: 0.14, freq: B5, gain: 0.5, decay: 2.6 },
    { start: 0.08, duration: 0.16, freq: D6, gain: 0.55, decay: 2.6 },
    { start: 0.17, duration: 0.42, freq: G6, gain: 0.68, decay: 2.2, glide: 40 },
  ]),

  // CORRECT — a full major arpeggio resolving an octave up. The payoff.
  correct: render([
    { start: 0.0, duration: 0.5, freq: E5, gain: 0.42, decay: 2.8 },
    { start: 0.08, duration: 0.5, freq: G5, gain: 0.44, decay: 2.8 },
    { start: 0.16, duration: 0.52, freq: C6, gain: 0.48, decay: 2.6 },
    { start: 0.26, duration: 0.62, freq: E6, gain: 0.5, decay: 2.4 },
    { start: 0.36, duration: 0.78, freq: G6, gain: 0.5, decay: 2.2 },
    { start: 0.46, duration: 0.9, freq: C7, gain: 0.4, decay: 2.0 },
  ]),
};

/** How loud each sits relative to the others. */
const PEAKS = { tap: 0.42, back: 0.40 };

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, buffer] of Object.entries(SOUNDS)) {
  const file = join(OUT_DIR, `${name}.wav`);
  writeFileSync(file, toWav(buffer, PEAKS[name] ?? 0.89));
  console.log(`wrote ${file} (${(buffer.length / SAMPLE_RATE).toFixed(2)}s, peak ${PEAKS[name] ?? 0.89})`);
}
