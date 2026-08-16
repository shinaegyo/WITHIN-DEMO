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
  game: require('../../assets/music/game.mp3'),
  home: require('../../assets/music/home.mp3'),
  // The climb gets an altitude each. One loop across a hundred levels says the
  // top of the sky is the same place as the ground, which is the one thing this
  // mode is about. See climbTrack for where they change over.
  climbGround: require('../../assets/music/climb-ground.mp3'),
  climbSky: require('../../assets/music/climb-sky.mp3'),
  climbStrato: require('../../assets/music/climb-strato.mp3'),
  climbThin: require('../../assets/music/climb-thin.mp3'),
  climbOrbit: require('../../assets/music/climb-orbit.mp3'),
} as const;

export type Track = keyof typeof SOURCES;

/**
 * Quiet enough to sit under a countdown rather than beside it.
 *
 * Down from 0.4: the tracks are mastered for listening rather than for playing
 * underneath something, so they arrived as the loudest thing in the room.
 */
// Taken down with the web's trim, and for the same reason: one track now sits
// under every mode, so it is heard for the whole session rather than in
// stretches, and anything that plays constantly has to sit further back.
const VOLUME = 0.10;

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

/** Steps in a fade. Twenty a second is smooth and costs nothing. */
const TICK = 50;
/** Out faster than in, so the two never pile up in the middle. */
const OUT_MS = 500;
const IN_MS = 900;

let fader: ReturnType<typeof setInterval> | null = null;

/**
 * Hands over between two tracks instead of cutting.
 *
 * The climb changes music three times on the way up, and each change lands on a
 * level-up - which is the one moment somebody is looking at the screen rather
 * than at their guess. A hard cut there sounds like a bug.
 */
function handOver(from: AudioPlayer | null, to: AudioPlayer | null) {
  if (fader) clearInterval(fader);
  if (to) to.volume = 0;

  let ms = 0;
  fader = setInterval(() => {
    ms += TICK;
    if (from) {
      try {
        from.volume = Math.max(0, VOLUME * (1 - ms / OUT_MS));
        if (ms >= OUT_MS) from.pause();
      } catch {}
    }
    if (to) {
      try {
        to.volume = Math.min(VOLUME, VOLUME * (ms / IN_MS));
      } catch {}
    }
    if (ms >= Math.max(OUT_MS, IN_MS)) {
      if (fader) clearInterval(fader);
      fader = null;
    }
  }, TICK);
}

export function playTrack(track: Track | null): void {
  if (!musicEnabled()) track = null;
  if (track === current) return;

  const leaving = current ? players[current] ?? null : null;
  current = track;

  if (!track) {
    handOver(leaving, null);
    return;
  }

  // Off the interaction that asked for it: the first play of a track decodes
  // it, and a screen should never wait on that.
  setTimeout(() => {
    if (current !== track) return;
    const p = player(track);
    if (!p) {
      pauseAll();
      return;
    }
    try {
      p.seekTo(0);
      p.volume = 0;
      p.play();
      handOver(leaving, p);
    } catch {}
  }, 0);
}

/** Stops everything and forgets where it was, for the settings switch. */
export function stopMusic(): void {
  // Before pausing: a fade left running would keep winding a paused player's
  // volume back up, and the next play would start at whatever it reached.
  if (fader) clearInterval(fader);
  fader = null;
  pauseAll();
  Object.values(players).forEach((p) => {
    try {
      if (p) p.volume = VOLUME;
    } catch {}
  });
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
