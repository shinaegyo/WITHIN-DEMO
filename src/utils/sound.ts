import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { soundEnabled } from './soundSettings';

/**
 * Sound effects for the three feedback moments.
 *
 * Players are created lazily on first use and kept for the life of the app —
 * these are tiny files and re-creating them per guess would add latency to the
 * exact moments that need to feel instant.
 */

const SOURCES = {
  // A rising ladder: the further off the guess, the lower the note. Most
  // guesses used to make no sound at all, which left the middle of a round
  // completely silent and the game feeling inert.
  far: require('../../assets/sounds/far.wav'),
  medium: require('../../assets/sounds/medium.wav'),
  near: require('../../assets/sounds/near.wav'),
  within10: require('../../assets/sounds/within-10.wav'),
  oneAway: require('../../assets/sounds/one-away.wav'),
  correct: require('../../assets/sounds/correct.wav'),
} as const;

type SoundName = keyof typeof SOURCES;

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let audioModeReady = false;

function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  // Game audio shouldn't hijack music the player already has going, and
  // should stay quiet when the phone is switched to silent.
  setAudioModeAsync({
    playsInSilentMode: false,
    shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers',
  }).catch(() => {});
}

function play(name: SoundName) {
  if (!soundEnabled()) return;
  try {
    ensureAudioMode();
    let player = players[name];
    if (!player) {
      player = createAudioPlayer(SOURCES[name]);
      players[name] = player;
    }
    // Rewind so rapid repeat guesses always retrigger from the top.
    player.seekTo(0);
    player.play();
  } catch (err) {
    // Audio is non-essential polish; never let it break the game loop.
    if (__DEV__) console.warn('[sound] failed to play', name, err);
  }
}

export const playWithin10 = () => play('within10');
export const playOneAway = () => play('oneAway');
export const playCorrect = () => play('correct');

/** The tier the server assigned to a guess, mapped onto the ladder. */
export function playForTier(tier: string) {
  if (tier === 'vast' || tier === 'distant' || tier === 'light') play('far');
  else if (tier === 'medium') play('medium');
  else if (tier === 'dark') play('near');
}
