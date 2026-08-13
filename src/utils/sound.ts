import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Sound effects for the three feedback moments.
 *
 * Players are created lazily on first use and kept for the life of the app —
 * these are tiny files and re-creating them per guess would add latency to the
 * exact moments that need to feel instant.
 */

const SOURCES = {
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
