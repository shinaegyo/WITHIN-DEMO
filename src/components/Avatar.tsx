import React from 'react';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
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
    if (AVATAR_COLORS[color]) return { kind: 'person', skin, hair, hairColor, color };
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
    </Svg>
  );
}
