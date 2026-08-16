import React from 'react';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fonts } from '../theme/fonts';

/**
 * A letter on a colour, until it is a person.
 *
 * It used to be one of fifty animals with a face - a cat, a bunny, a crab - and
 * it was the last thing in the app belonging to a different product. The
 * wordmark is flat, the mark is two arrows closing on a point, the palette is
 * cool and restrained, and then a leaderboard of smiling koalas. See
 * docs/avatars.md for the eight families this was chosen from.
 *
 * The destination is a person: skin, hair, hair colour, background. This is the
 * floor underneath it, and it is the reason there is no migration to do. Every
 * value stored today is an animal key that no longer parses, and the obvious
 * alternative - assigning everybody a default person - would have meant opening
 * your profile to find a stranger's face. A letter is not a stranger. It is
 * legibly a placeholder, it is still yours because it is your initial and the
 * colour you picked, and it asks nothing of anybody.
 *
 * It also covers the case nobody plans for: the player who never opens the
 * picker, and every signup before they have chosen anything.
 */

export const AVATAR_COLORS: Record<string, string> = {
  blue: '#5B8CFF',
  red: '#F0645A',
  green: '#4CC38A',
  orange: '#F0A64C',
  purple: '#9B7BF0',
  cyan: '#4FC5E8',
  pink: '#F06AA8',
  teal: '#3FBFB0',
  yellow: '#E0C34C',
  lime: '#A3D65C',
};

export const COLOR_KEYS = Object.keys(AVATAR_COLORS);


/**
 * Ten skin tones, evenly stepped across the whole range.
 *
 * Range is the requirement, not variety for its own sake: a thin palette reads
 * worse than not offering the choice at all, and a set that stops short at
 * either end tells the people it stopped short of exactly what it thinks of
 * them.
 */
export const SKIN_TONES: Record<string, string> = {
  s1: '#FBE3CC', s2: '#F4CFAE', s3: '#E9B891', s4: '#D9A074', s5: '#C0855C',
  s6: '#A46B47', s7: '#875436', s8: '#6B4028', s9: '#4F2E1D', s10: '#361F13',
};

/** Eight that grow and two that do not. Silver matters as much as blonde. */
export const HAIR_COLORS: Record<string, string> = {
  black: '#12100E', dbrown: '#3A2416', brown: '#6B4423', auburn: '#8C4A2A',
  ginger: '#C4652A', dblonde: '#C9973F', blonde: '#E8C878', silver: '#D8D8DC',
  blue: '#5F7FE0', pink: '#D96BA8',
};

/**
 * Nine shapes, cut from thirteen.
 *
 * Cropped, short, waves and a bob were one shape at 24px - the size a
 * leaderboard row actually gives an avatar - so four of the thirteen were
 * decoys standing in for choices that never showed. What is left is tellable
 * apart at that size, which is the only test that matters.
 *
 * Headwrap and hijab take the hair colour as their fabric, which is why the
 * palette carries blue and pink.
 */
const BUST = 'M50 84c-18 0-30 6-30 16h60c0-10-12-16-30-16Z';
const CAP = 'M29 56c-2-16 7-24 21-24s23 8 21 24c-2-12-9-16-21-16s-19 4-21 16Z';

export const HAIR: { key: string; name: string; draw: (c: string) => React.ReactNode }[] = [
  { key: 'bald', name: 'Bald', draw: () => null },
  { key: 'crop', name: 'Cropped', draw: (c) => (
    <Path d="M29 57a21 21 0 0 1 42 0c1-14-7-23-21-23s-22 9-21 23Z" fill={c} /> ) },
  { key: 'bob', name: 'Bob', draw: (c) => (<G fill={c}>
    <Path d="M29 58c-2-18 8-26 21-26s23 8 21 26c0-8-4-10-8-10-5 0-6 3-13 3s-8-3-13-3c-4 0-8 2-8 10Z" />
    <Path d="M22 58c-3 0-5 5-5 11s3 10 6 9Z" /><Path d="M78 58c3 0 5 5 5 11s-3 10-6 9Z" />
  </G>) },
  { key: 'curls', name: 'Curls', draw: (c) => (<G fill={c}>
    <Circle cx="34" cy="40" r="9" /><Circle cx="50" cy="34" r="10" /><Circle cx="66" cy="40" r="9" />
    <Circle cx="28" cy="52" r="8" /><Circle cx="72" cy="52" r="8" />
  </G>) },
  { key: 'coils', name: 'Coils', draw: (c) => (<G fill={c}>
    <Circle cx="50" cy="33" r="18" /><Circle cx="30" cy="44" r="10" /><Circle cx="70" cy="44" r="10" />
    <Circle cx="26" cy="56" r="7" /><Circle cx="74" cy="56" r="7" />
  </G>) },
  { key: 'locs', name: 'Locs', draw: (c) => (<G fill={c}>
    <Path d="M29 54a21 21 0 0 1 42 0c1-14-7-22-21-22s-22 8-21 22Z" />
    <Rect x="24" y="50" width="6" height="30" rx="3" /><Rect x="33" y="54" width="6" height="26" rx="3" />
    <Rect x="61" y="54" width="6" height="26" rx="3" /><Rect x="70" y="50" width="6" height="30" rx="3" />
  </G>) },
  { key: 'long', name: 'Long', draw: (c) => (
    <Path d="M50 30c-16 0-24 10-24 26v28h9V56c0-8 4-12 15-12s15 4 15 12v28h9V56c0-16-8-26-24-26Z" fill={c} /> ) },
  { key: 'bun', name: 'Bun', draw: (c) => (<G fill={c}>
    <Circle cx="50" cy="22" r="11" /><Path d={CAP} />
  </G>) },
  { key: 'wrap', name: 'Headwrap', draw: (c) => (<G fill={c}>
    <Path d="M28 58c-2-18 8-26 22-26s24 8 22 26c2-6 6-4 6-10 0-14-12-22-28-22s-28 8-28 22c0 6 4 4 6 10Z" />
    <Path d="M72 50c6 6 8 18 6 30h-10c4-10 5-22 4-30Z" />
  </G>) },
  { key: 'hijab', name: 'Hijab', draw: (c) => (
    <Path d="M50 26c-19 0-30 14-30 34 0 16 6 28 12 40h12c-8-14-11-26-11-38 0-14 6-22 17-22s17 8 17 22c0 12-3 24-11 38h12c6-12 12-24 12-40 0-20-11-34-30-34Z" fill={c} /> ) },
];

const HAIR_BY_KEY = new Map(HAIR.map((h) => [h.key, h]));

/**
 * A stored avatar.
 *
 * Two shapes live in this column. "blue" is a colour and nothing else, which is
 * what everything writes today. "skin4-coils-black-blue" is a person, which
 * nothing writes yet - the parse is here first so that when the picker starts
 * writing them, every screen already renders them.
 *
 * "cat-blue" and its forty-nine siblings hit neither branch. The colour is
 * recovered from the tail and the rest is discarded, which is exactly the
 * intended outcome: their colour survives, the animal does not.
 */
export interface AvatarParts {
  kind: 'monogram' | 'person';
  color: string;
  skin?: string;
  hair?: string;
  hairColor?: string;
}

export function parseAvatar(value: string | null | undefined): AvatarParts {
  const raw = (value ?? '').trim();
  const bits = raw.split('-');

  if (bits.length === 4) {
    const [skin, hair, hairColor, color] = bits;
    // Every part has to be one we know. A half-recognised person would render
    // with a missing face or no hair, which is worse than a letter.
    if (AVATAR_COLORS[color] && SKIN_TONES[skin] && HAIR_BY_KEY.has(hair) && HAIR_COLORS[hairColor]) {
      return { kind: 'person', skin, hair, hairColor, color };
    }
  }

  // A bare colour, or the tail of an animal key - both mean "no person yet".
  const tail = bits[bits.length - 1];
  return { kind: 'monogram', color: AVATAR_COLORS[tail] ? tail : 'blue' };
}

/** The letter a monogram shows. Falls to a dash rather than an empty circle. */
function initial(name: string | null | undefined): string {
  const c = (name ?? '').trim().charAt(0);
  return c ? c.toUpperCase() : '–';
}

interface Props {
  value: string | null | undefined;
  size?: number;
  /**
   * The player's name, for the letter. Optional so that no call site breaks
   * while they are updated one at a time - without it the disc shows a dash,
   * which is quiet rather than wrong.
   */
  name?: string | null;
}

export function Avatar({ value, size = 40, name }: Props) {
  const parts = parseAvatar(value);
  const fill = AVATAR_COLORS[parts.color];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="50" fill={fill} />

      {parts.kind === 'person' ? (
        <>
          {/* Bust first, hair over it: a headwrap and a hijab frame the face
              and fall onto the shoulders, so they have to be drawn last. */}
          <G fill={SKIN_TONES[parts.skin!]}>
            <Path d={BUST} />
            <Circle cx="50" cy="58" r="21" />
          </G>
          {HAIR_BY_KEY.get(parts.hair!)?.draw(HAIR_COLORS[parts.hairColor!])}
        </>
      ) : (
      <SvgText
        x="50"
        // Not 50: text is centred on its baseline, and a capital letter sits
        // above it. This is the optical centre for this face at this weight.
        y="68"
        fontSize="52"
        fontFamily={fonts.extraBold}
        fill="#FFFFFF"
        textAnchor="middle"
      >
        {initial(name)}
      </SvgText>
      )}
    </Svg>
  );
}
