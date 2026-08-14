import { Asset } from 'expo-asset';
import { sfxVolume, soundEnabled } from './soundSettings';

/**
 * Sound effects on the web, straight through the Web Audio API.
 *
 * The shared implementation goes through a player object per sound, and on the
 * web that meant a decode and a seek on the first press of every effect - a
 * click that arrives a moment after the tap reads as a broken button rather
 * than a slow one.
 *
 * Here each file is fetched and decoded once, up front, and a press is a
 * buffer source started on an already-running context: no decode, no seek, no
 * wait. Sounds this short are a few kilobytes each, so holding them all decoded
 * costs nothing worth measuring.
 */

const SOURCES = {
  far: require('../../assets/sounds/far.wav'),
  medium: require('../../assets/sounds/medium.wav'),
  near: require('../../assets/sounds/near.wav'),
  within10: require('../../assets/sounds/within-10.wav'),
  oneAway: require('../../assets/sounds/one-away.wav'),
  correct: require('../../assets/sounds/correct.wav'),
  tap: require('../../assets/sounds/tap.wav'),
  back: require('../../assets/sounds/back.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
} as const;

type SoundName = keyof typeof SOURCES;

let ctx: AudioContext | null = null;
const buffers: Partial<Record<SoundName, AudioBuffer>> = {};
let loading = false;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  // A context created before the first tap starts suspended; every press is a
  // gesture, so this is the right place to ask for it back.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

async function preload(): Promise<void> {
  if (loading) return;
  loading = true;
  const c = context();
  if (!c) return;
  await Promise.all(
    (Object.keys(SOURCES) as SoundName[]).map(async (name) => {
      try {
        const uri = Asset.fromModule(SOURCES[name]).uri;
        const bytes = await (await fetch(uri)).arrayBuffer();
        buffers[name] = await c.decodeAudioData(bytes);
      } catch {
        // One missing effect should never take the others down with it.
      }
    }),
  );
}

function play(name: SoundName) {
  if (!soundEnabled()) return;
  const c = context();
  if (!c) return;

  const buffer = buffers[name];
  if (!buffer) {
    // First call of the session: warm everything, then let the next press be
    // instant. Playing this one late would be worse than not playing it.
    void preload();
    return;
  }

  try {
    const source = c.createBufferSource();
    source.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = sfxVolume();
    source.connect(gain).connect(c.destination);
    source.start();
  } catch {
    // Audio is polish; never let it break the game loop.
  }
}

/** Called once at startup so the first press has something to play. */
export function warmSounds(): void {
  void preload();
}

export const playWithin10 = () => play('within10');
export const playOneAway = () => play('oneAway');
export const playCorrect = () => play('correct');
export const playTap = () => play('tap');
export const playBack = () => play('back');
export const playWin = () => play('win');
export const playLose = () => play('lose');

/** The tier the server assigned to a guess, mapped onto the ladder. */
export function playForTier(tier: string) {
  if (tier === 'correct') return playCorrect();
  if (tier === 'intense') return playWithin10();
  if (tier === 'dark') return play('near');
  if (tier === 'medium') return play('medium');
  return play('far');
}
