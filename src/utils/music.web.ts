import { Asset } from 'expo-asset';
import { musicEnabled, musicVolume, onVolumeChange } from './soundSettings';

/**
 * Background music on the web, looped by overlapping two copies of the track.
 *
 * `loop = true` left a hole of silence every lap, and the cause is in the files
 * rather than the player: none of them carries a Xing or LAME header, so no
 * decoder can know the encoder's delay and padding, and every one of them adds
 * silence at both ends. Nothing set on the element removes it.
 *
 * So each track keeps two elements and hands over between them. A second copy
 * starts a little before the first runs out, one fading up while the other
 * fades down, and the join lands inside the music rather than in the gap the
 * encoder left. Decoding the whole file into a buffer would loop perfectly too
 * and cost eighty megabytes of memory for four minutes of stereo, which is not
 * a trade worth making on somebody's phone.
 */

const SOURCES = {
  home: require('../../assets/music/home.mp3'),
  game: require('../../assets/music/game.mp3'),
  // duel.mp3 and impossible.mp3 were dropped here rather than deleted: eleven
  // megabytes of audio no screen could reach any more, downloaded by everyone.
  // Both are still in git if a mode ever wants its own room back.
} as const;

export type Track = keyof typeof SOURCES;

/** How long the two copies overlap. Long enough to hide a seam, short enough
 *  not to double the texture audibly. */
const CROSSFADE = 1.6;
/** Steps in the fade. Sixteen a second is smooth and costs nothing. */
const TICK = 60;

/**
 * Every track plays at 25% of what the slider says.
 *
 * The tracks were mastered for listening rather than for sitting under a game,
 * so at any setting above a whisper they were the loudest thing in the room.
 * Trimming here rather than in the setting keeps the slider honest - it still
 * runs from silent to as loud as it goes - and moves the whole range down with
 * it.
 */
const TRIM = 0.25;

function level(): number {
  return musicVolume() * TRIM;
}

interface Pair {
  a: HTMLAudioElement;
  b: HTMLAudioElement;
  live: 'a' | 'b';
  watcher: ReturnType<typeof setInterval> | null;
  fader: ReturnType<typeof setInterval> | null;
}

const pairs: Partial<Record<Track, Pair>> = {};
let current: Track | null = null;
let pendingGesture = false;

onVolumeChange(() => {
  const pair = current ? pairs[current] : null;
  if (!pair) return;
  // Only the copy that is playing follows the slider; the other is mid-fade or
  // silent, and forcing it to full volume would make the seam audible.
  pair[pair.live].volume = level();
});

function make(track: Track): HTMLAudioElement {
  const el = new window.Audio(Asset.fromModule(SOURCES[track]).uri);
  el.loop = false;
  el.preload = 'auto';
  el.volume = 0;
  return el;
}

function pair(track: Track): Pair | null {
  if (typeof window === 'undefined') return null;
  if (!pairs[track]) {
    pairs[track] = { a: make(track), b: make(track), live: 'a', watcher: null, fader: null };
  }
  return pairs[track] ?? null;
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

function play(el: HTMLAudioElement, track: Track) {
  const played = el.play();
  if (played && typeof played.catch === 'function') played.catch(() => retryOnGesture(track));
}

/** Fades one copy down and the other up over the overlap. */
function handOver(p: Pair, track: Track) {
  const from = p[p.live];
  const to = p[p.live === 'a' ? 'b' : 'a'];

  to.currentTime = 0;
  to.volume = 0;
  play(to, track);

  const target = level();
  const steps = Math.max(1, Math.round((CROSSFADE * 1000) / TICK));
  let step = 0;

  if (p.fader) clearInterval(p.fader);
  p.fader = setInterval(() => {
    step += 1;
    const t = Math.min(1, step / steps);
    to.volume = Math.min(1, target * t);
    from.volume = Math.max(0, target * (1 - t));
    if (t >= 1) {
      if (p.fader) clearInterval(p.fader);
      p.fader = null;
      from.pause();
      from.currentTime = 0;
    }
  }, TICK);

  p.live = p.live === 'a' ? 'b' : 'a';
}

function watch(track: Track, p: Pair) {
  if (p.watcher) clearInterval(p.watcher);
  p.watcher = setInterval(() => {
    if (current !== track) return;
    const el = p[p.live];
    if (!el.duration || Number.isNaN(el.duration)) return;
    // Hand over while the outgoing copy is still playing, so the overlap covers
    // the encoder's silence rather than landing in it.
    if (!p.fader && el.duration - el.currentTime <= CROSSFADE) handOver(p, track);
  }, 120);
}

function start(track: Track) {
  const p = pair(track);
  if (!p) return;
  const el = p[p.live];
  el.currentTime = 0;
  el.volume = level();
  play(el, track);
  watch(track, p);
}

function pauseAll() {
  Object.entries(pairs).forEach(([, p]) => {
    if (!p) return;
    if (p.watcher) clearInterval(p.watcher);
    if (p.fader) clearInterval(p.fader);
    p.watcher = null;
    p.fader = null;
    [p.a, p.b].forEach((el) => {
      el.pause();
      el.currentTime = 0;
      el.volume = 0;
    });
    p.live = 'a';
  });
}

export function playTrack(track: Track | null): void {
  const target = musicEnabled() ? track : null;
  if (target === current) return;
  pauseAll();
  current = target;
  if (target) start(target);
}

export function stopMusic(): void {
  pauseAll();
  current = null;
}

/**
 * Re-evaluates against the setting, for the switch on the audio screen.
 *
 * Silence is handled first and unconditionally. Nulling `current` and then
 * asking playTrack for null meant it saw the track it was already "playing" and
 * returned without pausing anything - so switching music off left it playing.
 */
export function refreshMusic(track: Track | null): void {
  if (!musicEnabled()) {
    stopMusic();
    return;
  }
  current = null;
  playTrack(track);
}
