import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { musicEnabled } from './soundSettings';

/**
 * Background music: one loop per place you can be.
 *
 * Three tracks, none of them tunes. A melody competes with the arithmetic
 * somebody is doing in their head, so these are textures - a pad for the home
 * screen, a drone and a tick for a round, the same drone with a pulse under it
 * for a duel, where there is a clock.
 *
 * Off by default. People play this in bed, at work, and next to somebody else,
 * and music that starts on its own is the shortest route to a muted tab - which
 * takes the sound effects with it.
 */

const SOURCES = {
  home: require('../../assets/music/home.mp3'),
  game: require('../../assets/music/game.wav'),
  duel: require('../../assets/music/duel.wav'),
} as const;

export type Track = keyof typeof SOURCES;

/** Quiet enough to sit under a countdown rather than beside it. */
const VOLUME = 0.4;

const players: Partial<Record<Track, AudioPlayer>> = {};
let current: Track | null = null;

function player(track: Track): AudioPlayer | null {
  try {
    if (!players[track]) {
      const p = createAudioPlayer(SOURCES[track]);
      p.loop = true;
      p.volume = VOLUME;
      players[track] = p;
    }
    return players[track] ?? null;
  } catch {
    // Audio can be unavailable before a first interaction on the web, and a
    // missing soundtrack is never worth taking a screen down for.
    return null;
  }
}

/**
 * Play a track, or nothing.
 *
 * Called on every screen that has an opinion; screens that do not simply leave
 * whatever is playing alone, so moving between the leaderboard and the menu
 * does not restart the music.
 */
export function playTrack(track: Track | null): void {
  if (!musicEnabled()) track = null;
  if (track === current) return;

  if (current) {
    try {
      players[current]?.pause();
    } catch {}
  }

  current = track;
  if (!track) return;

  // Off the interaction that asked for it: the first play of a track decodes
  // it, and a screen should never wait on that.
  setTimeout(() => {
    if (current !== track) return;
    const p = player(track);
    if (!p) return;
    try {
      p.seekTo(0);
      p.play();
    } catch {}
  }, 0);
}

/** Stops everything and forgets where it was, for the settings switch. */
export function stopMusic(): void {
  const was = current;
  playTrack(null);
  current = was ? null : null;
}

/** Resumes whatever the current screen asked for after the setting changes. */
export function refreshMusic(track: Track | null): void {
  const target = musicEnabled() ? track : null;
  if (target === current) return;
  current = null;
  playTrack(target);
}
