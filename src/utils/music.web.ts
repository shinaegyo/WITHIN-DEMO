import { Asset } from 'expo-asset';
import { musicEnabled, musicVolume, onVolumeChange } from './soundSettings';

/**
 * Background music on the web, through a plain audio element.
 *
 * The shared implementation creates a player per track and never produced a
 * sound here: nothing was audible and no audio element existed to inspect. An
 * <audio> tag streams rather than decoding three megabytes up front, loops
 * natively, and can be looked at in a browser when it misbehaves - which for
 * something this easy to get quietly wrong matters more than sharing code with
 * the native path.
 */

const SOURCES = {
  home: require('../../assets/music/home.mp3'),
  game: require('../../assets/music/game.mp3'),
  duel: require('../../assets/music/duel.mp3'),
} as const;

export type Track = keyof typeof SOURCES;

const els: Partial<Record<Track, HTMLAudioElement>> = {};
let current: Track | null = null;
let pendingGesture = false;

onVolumeChange(() => {
  Object.values(els).forEach((el) => {
    if (el) el.volume = musicVolume();
  });
});

function element(track: Track): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!els[track]) {
    const el = new window.Audio(Asset.fromModule(SOURCES[track]).uri);
    el.loop = true;
    el.preload = 'auto';
    el.volume = musicVolume();
    els[track] = el;
  }
  return els[track] ?? null;
}

/**
 * A browser will refuse to start audio that no gesture asked for. Rather than
 * give up, wait for the next press anywhere and start then - which is what a
 * player who has just switched music on is about to do anyway.
 */
function retryOnGesture(track: Track) {
  if (pendingGesture || typeof window === 'undefined') return;
  pendingGesture = true;
  const go = () => {
    window.removeEventListener('pointerdown', go);
    pendingGesture = false;
    if (current === track) start(track);
  };
  window.addEventListener('pointerdown', go, { once: true });
}

function start(track: Track) {
  const el = element(track);
  if (!el) return;
  el.volume = musicVolume();
  const played = el.play();
  if (played && typeof played.catch === 'function') {
    played.catch(() => retryOnGesture(track));
  }
}

export function playTrack(track: Track | null): void {
  if (!musicEnabled()) track = null;
  if (track === current) return;

  if (current) {
    const el = els[current];
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  }

  current = track;
  if (track) start(track);
}

export function stopMusic(): void {
  playTrack(null);
}

/** Re-evaluates against the setting, for the switch on the audio screen. */
export function refreshMusic(track: Track | null): void {
  const target = musicEnabled() ? track : null;
  if (target === current) return;
  current = null;
  playTrack(target);
}
