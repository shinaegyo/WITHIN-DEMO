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
 * Thirty-one shapes, in three lengths.
 *
 * An earlier cut took this to nine on the grounds that some pairs are
 * indistinguishable at 24px, which was the wrong trade. Buzz and cropped do
 * read alike that small, and so do locs and twists, braids and box braids - but
 * somebody with box braids should find box braids, and two styles converging in
 * a leaderboard row costs far less than a person not being in the set at all.
 *
 * Ordered short, medium, long, so the picker can group them rather than present
 * thirty-one swatches in an undifferentiated block.
 */
const BUST = 'M50 84c-18 0-30 6-30 16h60c0-10-12-16-30-16Z';

export const HAIR: { key: string; name: string; draw: (c: string) => React.ReactNode }[] = [
  // Short
  { key: 'bald', name: 'Bald', draw: () => null },
  { key: 'buzz', name: 'Buzz', draw: (c) => (
    <Path d="M30 55a20 20 0 0 1 40 0c2-13-6-21-20-21s-22 8-20 21Z" fill={c} opacity={0.85} /> ) },
  { key: 'crop', name: 'Cropped', draw: (c) => (
    <Path d="M29 57a21 21 0 0 1 42 0c1-14-7-23-21-23s-22 9-21 23Z" fill={c} /> ) },
  { key: 'undercut', name: 'Undercut', draw: (c) => (<G fill={c}>
    <Path d="M31 52c-1-13 7-20 19-20s20 7 19 20c3-18-5-26-19-26s-22 8-19 26Z" />
    <Path d="M29 58a21 21 0 0 1 42 0c0-4-1-7-2-9H31c-1 2-2 5-2 9Z" opacity={0.45} />
  </G>) },
  { key: 'short', name: 'Short', draw: (c) => (
    <Path d="M28 62c-2-20 8-28 22-28s24 8 22 28c1-9-3-12-8-12-6 0-8 3-14 3s-8-3-14-3c-5 0-9 3-8 12Z" fill={c} /> ) },
  { key: 'sidepart', name: 'Side part', draw: (c) => (
    <Path d="M29 56c-2-16 7-24 21-24s23 8 21 24c-1-9-6-13-13-13-3 4-9 5-15 4-8-1-13 2-14 9Z" fill={c} /> ) },
  { key: 'midpart', name: 'Middle part', draw: (c) => (
    <Path d="M50 32c-13 0-21 9-21 24 2-10 8-14 15-16-2 4-2 8 0 12 1-8 3-14 6-18 3 4 5 10 6 18 2-4 2-8 0-12 7 2 13 6 15 16 0-15-8-24-21-24Z" fill={c} /> ) },
  { key: 'quiff', name: 'Quiff', draw: (c) => (
    <Path d="M29 56c-1-14 6-22 17-22 8 0 12 3 15 8 3-6-1-14-5-16-14-6-30 5-30 22 0 3 1 6 3 8Z" fill={c} /> ) },
  { key: 'curlyshort', name: 'Curly short', draw: (c) => (<G fill={c}>
    <Circle cx="34" cy="42" r="8" /><Circle cx="50" cy="36" r="9" /><Circle cx="66" cy="42" r="8" />
  </G>) },
  { key: 'waves', name: 'Waves', draw: (c) => (
    <Path d="M29 58c-1-16 7-24 21-24s22 8 21 24c-2-5-5-3-7-6-3 4-6 1-8-3-3 5-7 4-10 1-3 4-6 5-9 1-2 4-6 3-8 7Z" fill={c} /> ) },
  { key: 'afrofade', name: 'Afro fade', draw: (c) => (
    <Path d="M50 24c-14 0-23 10-23 22 0 4 1 7 2 9 0-8 2-12 5-14 4-3 10-4 16-4s12 1 16 4c3 2 5 6 5 14 1-2 2-5 2-9 0-12-9-22-23-22Z" fill={c} /> ) },

  // Medium
  { key: 'bob', name: 'Bob', draw: (c) => (<G fill={c}>
    <Path d="M29 58c-2-18 8-26 21-26s23 8 21 26c0-8-4-10-8-10-5 0-6 3-13 3s-8-3-13-3c-4 0-8 2-8 10Z" />
    <Path d="M22 58c-3 0-5 5-5 11s3 10 6 9Z" /><Path d="M78 58c3 0 5 5 5 11s-3 10-6 9Z" />
  </G>) },
  { key: 'midpartmed', name: 'Mid part', draw: (c) => (
    <Path d="M50 30c-14 0-23 10-23 26v20h8V56c0-6 2-10 6-13 3 5 6 8 9 9-3-6-4-12-3-17 3 5 6 12 3 17 3-1 6-4 9-9 4 3 6 7 6 13v20h8V56c0-16-9-26-23-26Z" fill={c} /> ) },
  { key: 'shoulder', name: 'Shoulder', draw: (c) => (
    <Path d="M50 30c-15 0-24 10-24 26v22h8V56c0-9 5-14 16-14s16 5 16 14v22h8V56c0-16-9-26-24-26Z" fill={c} /> ) },
  { key: 'layered', name: 'Layered', draw: (c) => (
    <Path d="M50 30c-15 0-24 10-24 26 0 8 2 14 4 20l6-6c-2-6-3-11-3-15 0-8 6-13 17-13s17 5 17 13c0 4-1 9-3 15l6 6c2-6 4-12 4-20 0-16-9-26-24-26Z" fill={c} /> ) },
  { key: 'curly', name: 'Curly', draw: (c) => (<G fill={c}>
    <Circle cx="50" cy="33" r="17" /><Circle cx="30" cy="45" r="11" /><Circle cx="70" cy="45" r="11" />
    <Circle cx="27" cy="60" r="9" /><Circle cx="73" cy="60" r="9" />
  </G>) },
  { key: 'undercutlong', name: 'Undercut long', draw: (c) => (<G fill={c}>
    <Path d="M31 50c-1-14 7-22 19-22s20 8 19 22c3-18-5-26-19-26s-22 8-19 26Z" />
    <Path d="M50 24c11 0 19 8 19 22v26h8V46c0-16-9-26-27-26Z" />
  </G>) },
  { key: 'halfup', name: 'Half-up', draw: (c) => (<G fill={c}>
    <Path d="M29 56c-2-16 7-24 21-24s23 8 21 24c-2-12-9-16-21-16s-19 4-21 16Z" />
    <Path d="M40 26c-4-6 2-12 10-12s14 6 10 12c-4-4-16-4-20 0Z" />
    <Path d="M31 54c-2 12-1 22 2 30h6c-3-10-4-20-2-30Z" />
    <Path d="M69 54c2 12 1 22-2 30h-6c3-10 4-20 2-30Z" />
  </G>) },
  { key: 'twists', name: 'Twists', draw: (c) => (<G fill={c}>
    <Path d="M29 54a21 21 0 0 1 42 0c1-14-7-22-21-22s-22 8-21 22Z" />
    <Rect x="24" y="50" width="6" height="26" rx="3" /><Rect x="33" y="54" width="6" height="22" rx="3" />
    <Rect x="61" y="54" width="6" height="22" rx="3" /><Rect x="70" y="50" width="6" height="26" rx="3" />
  </G>) },

  // Long
  { key: 'long', name: 'Long', draw: (c) => (
    <Path d="M50 30c-16 0-24 10-24 26v28h9V56c0-8 4-12 15-12s15 4 15 12v28h9V56c0-16-8-26-24-26Z" fill={c} /> ) },
  { key: 'longmid', name: 'Long mid part', draw: (c) => (
    <Path d="M50 30c-16 0-24 10-24 26v28h9V56c0-7 3-11 10-12-3 5-4 11-3 16 2-7 5-13 8-17 3 4 6 10 8 17 1-5 0-11-3-16 7 1 10 5 10 12v28h9V56c0-16-8-26-24-26Z" fill={c} /> ) },
  { key: 'longcurly', name: 'Long curly', draw: (c) => (<G fill={c}>
    <Circle cx="50" cy="32" r="18" /><Circle cx="28" cy="46" r="12" /><Circle cx="72" cy="46" r="12" />
    <Circle cx="25" cy="64" r="10" /><Circle cx="75" cy="64" r="10" />
    <Circle cx="27" cy="80" r="9" /><Circle cx="73" cy="80" r="9" />
  </G>) },
  { key: 'longwavy', name: 'Long wavy', draw: (c) => (
    <Path d="M50 30c-16 0-24 10-24 26v28c0-6 3-8 5-12-3-6-3-12 0-16-3-6-2-12 4-14-2 8 1 14 6 16-4-6-4-12 0-16 3 6 6 10 9 10s6-4 9-10c4 4 4 10 0 16 5-2 8-8 6-16 6 2 7 8 4 14 3 4 3 10 0 16 2 4 5 6 5 12V56c0-16-8-26-24-26Z" fill={c} /> ) },
  { key: 'ponytail', name: 'Ponytail', draw: (c) => (<G fill={c}>
    <Path d="M74 46c8 2 12 12 10 24-2 10-8 14-12 12 6-12 6-24 2-32Z" />
    <Path d="M29 56c-2-16 7-24 21-24s23 8 21 24c-2-12-9-16-21-16s-19 4-21 16Z" />
  </G>) },
  { key: 'highbun', name: 'High bun', draw: (c) => (<G fill={c}>
    <Circle cx="50" cy="21" r="11" />
    <Path d="M29 56c-2-16 7-24 21-24s23 8 21 24c-2-12-9-16-21-16s-19 4-21 16Z" />
  </G>) },
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
