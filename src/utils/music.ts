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
  game: require('../../assets/music/game.mp3'),
  duel: require('../../assets/music/duel.mp3'),
  // Impossible gets its own: a climb somebody enters deliberately, for twenty
  // minutes at a time, is a different room from a three-round daily.
  impossible: require('../../assets/music/impossible.mp3'),
} as const;

export type Track = keyof typeof SOURCES;

/**
 * Quiet enough to sit under a countdown rather than beside it.
 *
 * Down from 0.4: the tracks are mastered for listening rather than for playing
 * underneath something, so they arrived as the loudest thing in the room.
 */
const VOLUME = 0.24;

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
function pauseAll() {
  Object.values(players).forEach((p) => {
    try {
      p?.pause();
    } catch {}
  });
}

export function playTrack(track: Track | null): void {
  if (!musicEnabled()) track = null;
  if (track === current) return;

  pauseAll();

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
  pauseAll();
  current = null;
}

/**
 * Resumes whatever the current screen asked for after the setting changes.
 *
 * Silence first and unconditionally: nulling `current` and then asking for null
 * made playTrack think it was already silent, so switching music off left it
 * playing.
 */
export function refreshMusic(track: Track | null): void {
  if (!musicEnabled()) {
    stopMusic();
    return;
  }
  current = null;
  playTrack(track);
}
