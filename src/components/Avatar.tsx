import React from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

/**
 * Fifty characters in ten colours - five hundred of them - drawn rather than
 * uploaded.
 *
 * Nothing here is a photograph, which is the point: a public leaderboard shown
 * to strangers is the last place to accept arbitrary images, and a drawn set
 * needs no storage, no resizing and no moderation. It also stays legible at the
 * 26 pixels a leaderboard row actually gives it - a face and a silhouette read
 * at that size where a photograph is mud.
 *
 * Stored as one string, "cat-blue", so a profile carries eight characters
 * rather than a file.
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

type Eyes = 'round' | 'happy' | 'wink' | 'big';
type Mouth = 'smile' | 'o' | 'tongue' | 'beak' | 'cat' | 'none';

interface Character {
  key: string;
  name: string;
  body: (c: string) => React.ReactNode;
  eyes: Eyes;
  mouth: Mouth;
}

const W = 'rgba(255,255,255,0.9)';
const head = (c: string) => <Circle cx="50" cy="54" r="33" fill={c} />;

export const CHARACTERS: Character[] = [
  { key: 'blob', name: 'Blob', eyes: 'round', mouth: 'smile',
    body: (c) => <Circle cx="50" cy="52" r="36" fill={c} /> },
  { key: 'cat', name: 'Cat', eyes: 'round', mouth: 'cat',
    body: (c) => (<>
      <Path d="M22 34 L28 12 L44 24Z" fill={c} /><Path d="M78 34 L72 12 L56 24Z" fill={c} />{head(c)}
    </>) },
  { key: 'bunny', name: 'Bunny', eyes: 'happy', mouth: 'smile',
    body: (c) => (<>
      <Rect x="32" y="4" width="11" height="30" rx="5.5" fill={c} />
      <Rect x="57" y="4" width="11" height="30" rx="5.5" fill={c} />{head(c)}
    </>) },
  { key: 'bear', name: 'Bear', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Circle cx="20" cy="24" r="14" fill={c} /><Circle cx="80" cy="24" r="14" fill={c} />
      <Circle cx="20" cy="24" r="6" fill="#fff" opacity={0.3} /><Circle cx="80" cy="24" r="6" fill="#fff" opacity={0.3} />
      <Rect x="14" y="24" width="72" height="64" rx="30" fill={c} />
      <Ellipse cx="50" cy="60" rx="16" ry="12" fill="#fff" opacity={0.25} />
    </>) },
  { key: 'ghost', name: 'Ghost', eyes: 'round', mouth: 'o',
    body: (c) => <Path d="M16 54a34 34 0 0 1 68 0v34l-11-9-11 9-11-9-11 9-11-9-13 9Z" fill={c} /> },
  { key: 'frog', name: 'Frog', eyes: 'round', mouth: 'tongue',
    body: (c) => (<>
      <Circle cx="30" cy="22" r="15" fill={c} /><Circle cx="70" cy="22" r="15" fill={c} />
      <Ellipse cx="50" cy="60" rx="38" ry="27" fill={c} />
    </>) },
  { key: 'bird', name: 'Bird', eyes: 'round', mouth: 'beak', body: (c) => head(c) },
  { key: 'spark', name: 'Spark', eyes: 'wink', mouth: 'smile',
    body: (c) => (<>
      <Line x1="50" y1="8" x2="50" y2="26" stroke={c} strokeWidth="5" strokeLinecap="round" />
      <Circle cx="50" cy="8" r="6" fill={c} />{head(c)}
    </>) },
  { key: 'fox', name: 'Fox', eyes: 'wink', mouth: 'smile',
    body: (c) => (<>
      <Path d="M20 32 L26 10 L44 22Z" fill={c} /><Path d="M80 32 L74 10 L56 22Z" fill={c} />
      <Path d="M50 88C24 88 16 66 16 52a34 34 0 0 1 68 0c0 14-8 36-34 36Z" fill={c} />
    </>) },
  { key: 'slime', name: 'Slime', eyes: 'happy', mouth: 'smile',
    body: (c) => <Path d="M50 16c22 0 34 24 34 42 0 12-8 22-34 22s-34-10-34-22c0-18 12-42 34-42Z" fill={c} /> },
  { key: 'pup', name: 'Pup', eyes: 'round', mouth: 'tongue',
    body: (c) => (<>
      <Path d="M16 30c-8 14-6 34 4 42 8-6 10-28 6-42Z" fill={c} />
      <Path d="M84 30c8 14 6 34-4 42-8-6-10-28-6-42Z" fill={c} />
      <Ellipse cx="50" cy="52" rx="29" ry="31" fill={c} />
      <Ellipse cx="50" cy="62" rx="14" ry="10" fill="#fff" opacity={0.25} />
    </>) },
  { key: 'star', name: 'Star', eyes: 'happy', mouth: 'smile',
    body: (c) => <Path d="M50 4l13 30 33 3-25 22 7 33-28-17-28 17 7-33L4 37l33-3Z" fill={c} /> },
  { key: 'panda', name: 'Panda', eyes: 'big', mouth: 'smile',
    body: (c) => (<>
      <Circle cx="24" cy="26" r="11" fill="#141418" /><Circle cx="76" cy="26" r="11" fill="#141418" />
      {head(c)}
      <Circle cx="38" cy="43" r="11" fill="#141418" opacity={0.85} />
      <Circle cx="62" cy="43" r="11" fill="#141418" opacity={0.85} />
    </>) },
  { key: 'penguin', name: 'Penguin', eyes: 'round', mouth: 'beak',
    body: (c) => (<>{head(c)}<Ellipse cx="50" cy="66" rx="17" ry="19" fill={W} /></>) },
  { key: 'owl', name: 'Owl', eyes: 'big', mouth: 'beak',
    body: (c) => (<>
      <Path d="M24 24 L32 6 L44 20Z" fill={c} /><Path d="M76 24 L68 6 L56 20Z" fill={c} />
      <Rect x="16" y="18" width="68" height="70" rx="26" fill={c} />
      <Ellipse cx="22" cy="58" rx="7" ry="18" fill="#fff" opacity={0.22} />
      <Ellipse cx="78" cy="58" rx="7" ry="18" fill="#fff" opacity={0.22} />
    </>) },
  { key: 'pig', name: 'Pig', eyes: 'round', mouth: 'none',
    body: (c) => (<>
      <Path d="M28 30 L34 16 L44 26Z" fill={c} /><Path d="M72 30 L66 16 L56 26Z" fill={c} />{head(c)}
      <Ellipse cx="50" cy="60" rx="11" ry="8" fill="#fff" opacity={0.45} />
      <Circle cx="46" cy="60" r="2" fill="#141418" /><Circle cx="54" cy="60" r="2" fill="#141418" />
    </>) },
  { key: 'mouse', name: 'Mouse', eyes: 'round', mouth: 'cat',
    body: (c) => (<>
      <Circle cx="18" cy="22" r="17" fill={c} /><Circle cx="82" cy="22" r="17" fill={c} />
      <Circle cx="18" cy="22" r="9" fill="#fff" opacity={0.32} /><Circle cx="82" cy="22" r="9" fill="#fff" opacity={0.32} />
      <Path d="M50 22c17 0 28 14 28 30 0 20-13 32-28 32S22 72 22 52c0-16 11-30 28-30Z" fill={c} />
    </>) },
  { key: 'koala', name: 'Koala', eyes: 'round', mouth: 'none',
    body: (c) => (<>
      <Circle cx="14" cy="40" r="18" fill={c} /><Circle cx="86" cy="40" r="18" fill={c} />
      <Circle cx="14" cy="40" r="10" fill="#fff" opacity={0.28} /><Circle cx="86" cy="40" r="10" fill="#fff" opacity={0.28} />
      <Ellipse cx="50" cy="54" rx="31" ry="33" fill={c} />
      <Ellipse cx="50" cy="60" rx="9" ry="11" fill="#141418" opacity={0.85} />
    </>) },
  { key: 'duck', name: 'Duck', eyes: 'round', mouth: 'none',
    body: (c) => (<>{head(c)}<Ellipse cx="50" cy="60" rx="12" ry="6" fill="#F0A64C" /></>) },
  { key: 'turtle', name: 'Turtle', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Ellipse cx="50" cy="62" rx="36" ry="26" fill={c} /><Circle cx="50" cy="34" r="20" fill={c} />
      <Path d="M34 60 h32 M50 46 v28" stroke="#fff" strokeWidth="3" opacity={0.35} />
    </>) },
  { key: 'whale', name: 'Whale', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Path d="M14 56a36 30 0 0 1 72 0c0 18-16 26-36 26S14 74 14 56Z" fill={c} />
      <Path d="M50 10 q4 8 -4 12 q10 2 12 -6Z" fill={W} />
    </>) },
  { key: 'octo', name: 'Octopus', eyes: 'big', mouth: 'smile',
    body: (c) => (<>
      <Path d="M18 56a32 32 0 0 1 64 0v14H18Z" fill={c} />
      <Circle cx="26" cy="76" r="8" fill={c} /><Circle cx="42" cy="80" r="8" fill={c} />
      <Circle cx="58" cy="80" r="8" fill={c} /><Circle cx="74" cy="76" r="8" fill={c} />
    </>) },
  { key: 'crab', name: 'Crab', eyes: 'round', mouth: 'cat',
    body: (c) => (<>
      <Path d="M10 20c10 0 16 7 16 15s-6 13-14 13c8-6 8-14-2-16Z" fill={c} />
      <Path d="M90 20c-10 0-16 7-16 15s6 13 14 13c-8-6-8-14 2-16Z" fill={c} />
      <Path d="M8 78c6-4 10-8 12-14M92 78c-6-4-10-8-12-14" stroke={c} strokeWidth="5" strokeLinecap="round" />
      <Ellipse cx="50" cy="58" rx="34" ry="24" fill={c} />
    </>) },
  { key: 'fish', name: 'Fish', eyes: 'round', mouth: 'o',
    body: (c) => (<>
      <Path d="M78 52 L98 34 v40Z" fill={c} />
      <Path d="M46 22 l10 14 -22 0Z" fill={c} />
      <Path d="M14 54c0-18 16-28 34-28s34 10 34 28-16 28-34 28S14 72 14 54Z" fill={c} />
    </>) },
  { key: 'dino', name: 'Dino', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Path d="M22 34 l4 -18 12 14Z M44 22 l6 -18 8 16Z M66 30 l10 -16 6 18Z" fill={c} />
      <Path d="M50 20c19 0 32 15 32 34 0 20-14 32-32 32S18 74 18 54c0-19 13-34 32-34Z" fill={c} />
      <Path d="M18 66c-8 2-10 8-4 12 4 3 10 2 12-4" fill={c} />
    </>) },
  { key: 'alien', name: 'Alien', eyes: 'big', mouth: 'smile',
    body: (c) => (<>
      <Line x1="34" y1="16" x2="30" y2="4" stroke={c} strokeWidth="4" strokeLinecap="round" />
      <Line x1="66" y1="16" x2="70" y2="4" stroke={c} strokeWidth="4" strokeLinecap="round" />
      <Circle cx="30" cy="4" r="4" fill={c} /><Circle cx="70" cy="4" r="4" fill={c} />
      <Ellipse cx="50" cy="54" rx="34" ry="32" fill={c} />
    </>) },
  { key: 'robot', name: 'Robot', eyes: 'round', mouth: 'none',
    body: (c) => (<>
      <Line x1="50" y1="10" x2="50" y2="22" stroke={c} strokeWidth="4" />
      <Circle cx="50" cy="8" r="5" fill={c} />
      <Rect x="18" y="26" width="64" height="58" rx="16" fill={c} />
    </>) },
  { key: 'cloud', name: 'Cloud', eyes: 'happy', mouth: 'smile',
    body: (c) => <Path d="M28 70a18 18 0 0 1 2 -36 22 22 0 0 1 42 4 16 16 0 0 1 0 32Z" fill={c} /> },
  { key: 'moon', name: 'Moon', eyes: 'happy', mouth: 'smile',
    body: (c) => <Path d="M62 14a38 38 0 1 0 0 76 32 32 0 0 1 0 -76Z" fill={c} /> },
  { key: 'cactus', name: 'Cactus', eyes: 'happy', mouth: 'smile',
    body: (c) => (<>
      <Rect x="38" y="20" width="24" height="66" rx="12" fill={c} />
      <Rect x="14" y="40" width="14" height="30" rx="7" fill={c} />
      <Rect x="72" y="34" width="14" height="34" rx="7" fill={c} />
    </>) },
  { key: 'bat', name: 'Bat', eyes: 'round', mouth: 'cat',
    body: (c) => (<>
      <Path d="M20 30 L24 8 L38 22Z" fill={c} /><Path d="M80 30 L76 8 L62 22Z" fill={c} />
      <Path d="M6 44c10-10 16-6 18 4-8 10-16 12-18-4ZM94 44c-10-10-16-6-18 4 8 10 16 12 18-4Z" fill={c} />
      <Ellipse cx="50" cy="54" rx="30" ry="31" fill={c} />
    </>) },
  { key: 'bee', name: 'Bee', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Ellipse cx="28" cy="30" rx="14" ry="10" fill="#fff" opacity={0.5} />
      <Ellipse cx="72" cy="30" rx="14" ry="10" fill="#fff" opacity={0.5} />
      <Ellipse cx="50" cy="56" rx="32" ry="30" fill={c} />
      <Path d="M28 68h44M32 78h36" stroke="#141418" strokeWidth="5" opacity={0.55} strokeLinecap="round" />
    </>) },
  { key: 'snail', name: 'Snail', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Path d="M14 74c0-8 8-12 20-12h44c6 0 8 8 0 8H24" fill={c} />
      <Circle cx="58" cy="48" r="28" fill={c} />
      <Path d="M58 48m-16 0a16 16 0 1 0 32 0a16 16 0 1 0 -32 0" stroke="#fff" strokeWidth="4" opacity={0.35} fill="none" />
      <Line x1="24" y1="60" x2="18" y2="42" stroke={c} strokeWidth="4" strokeLinecap="round" />
      <Circle cx="18" cy="40" r="4" fill={c} />
    </>) },
  { key: 'rocket', name: 'Rocket', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Path d="M50 8c14 12 18 30 18 46 0 14-8 24-18 24s-18-10-18-24c0-16 4-34 18-46Z" fill={c} />
      <Path d="M32 56 L18 76 L34 72ZM68 56 L82 76 L66 72Z" fill={c} />
      <Path d="M44 80h12l-6 12Z" fill="#F0A64C" />
    </>) },
  { key: 'mushroom', name: 'Mushroom', eyes: 'happy', mouth: 'smile',
    body: (c) => (<>
      <Path d="M10 46c0-22 18-34 40-34s40 12 40 34Z" fill={c} />
      <Circle cx="30" cy="30" r="7" fill="#fff" opacity={0.45} /><Circle cx="66" cy="26" r="9" fill="#fff" opacity={0.45} />
      <Path d="M32 46h36v28c0 8-6 14-18 14s-18-6-18-14Z" fill={c} opacity={0.85} />
    </>) },
  { key: 'cupcake', name: 'Cupcake', eyes: 'happy', mouth: 'smile',
    body: (c) => (<>
      <Path d="M22 44c0-16 12-26 28-26s28 10 28 26Z" fill={c} opacity={0.85} />
      <Path d="M20 48h60l-8 34c-1 5-5 8-10 8H38c-5 0-9-3-10-8Z" fill={c} />
      <Circle cx="50" cy="14" r="6" fill="#F06AA8" />
    </>) },
  { key: 'donut', name: 'Donut', eyes: 'round', mouth: 'o',
    body: (c) => (<>
      <Circle cx="50" cy="52" r="36" fill={c} />
      <Path d="M14 46c8-16 28-24 44-20 12 3 22 12 26 22-6-6-16-4-22 2-8 8-20 4-26-2-6-6-16-8-22-2Z" fill="#fff" opacity={0.35} />
    </>) },
  { key: 'apple', name: 'Apple', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Path d="M50 20c14-8 34-2 34 22 0 22-14 44-34 44S16 64 16 42c0-24 20-30 34-22Z" fill={c} />
      <Path d="M50 20c0-8 4-12 10-14-1 8-4 12-10 14Z" fill="#4CC38A" />
    </>) },
  { key: 'sprout', name: 'Sprout', eyes: 'happy', mouth: 'smile',
    body: (c) => (<>
      <Path d="M50 30c-4-14-16-20-28-18 2 12 12 20 28 18ZM50 30c4-16 18-22 30-20-2 12-14 22-30 20Z" fill={c} />
      <Ellipse cx="50" cy="58" rx="26" ry="28" fill={c} />
    </>) },
  { key: 'sun', name: 'Sun', eyes: 'happy', mouth: 'smile',
    body: (c) => (<>
      <Path d="M50 2v12M50 86v12M2 50h12M86 50h12M16 16l8 8M76 76l8 8M84 16l-8 8M24 76l-8 8"
        stroke={c} strokeWidth="6" strokeLinecap="round" />
      <Circle cx="50" cy="52" r="30" fill={c} />
    </>) },
  { key: 'gem', name: 'Gem', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Path d="M26 18h48l20 24-44 46L6 42Z" fill={c} />
      <Path d="M6 42h88M26 18 38 42 50 88M74 18 62 42" stroke="#fff" strokeWidth="3" opacity={0.3} fill="none" />
    </>) },
  { key: 'heart', name: 'Heart', eyes: 'happy', mouth: 'smile',
    body: (c) => <Path d="M50 88C22 68 8 52 8 36 8 22 18 12 30 12c8 0 15 4 20 11 5-7 12-11 20-11 12 0 22 10 22 24 0 16-14 32-42 52Z" fill={c} /> },
  { key: 'bolt', name: 'Bolt', eyes: 'wink', mouth: 'smile',
    body: (c) => <Path d="M58 2 22 54h20L38 98l40-56H56Z" fill={c} /> },
  { key: 'planet', name: 'Planet', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Circle cx="50" cy="50" r="30" fill={c} />
      <Ellipse cx="50" cy="58" rx="46" ry="12" stroke={c} strokeWidth="5" fill="none" opacity={0.7} />
    </>) },
  { key: 'snake', name: 'Snake', eyes: 'round', mouth: 'tongue',
    body: (c) => (<>
      <Path d="M78 84c-18 8-40 0-40-16s26-12 26-26-16-18-30-10" stroke={c} strokeWidth="14" fill="none" strokeLinecap="round" />
      <Ellipse cx="42" cy="46" rx="26" ry="24" fill={c} />
    </>) },
  { key: 'unicorn', name: 'Unicorn', eyes: 'happy', mouth: 'smile',
    body: (c) => (<>
      <Path d="M50 2 L58 26 H42Z" fill="#E0C34C" />
      <Path d="M24 32 L28 14 L40 26ZM76 32 L72 14 L60 26Z" fill={c} />
      <Path d="M20 30c-8 16-6 34 2 44" stroke="#F06AA8" strokeWidth="6" fill="none" strokeLinecap="round" />
      <Ellipse cx="50" cy="56" rx="30" ry="30" fill={c} />
    </>) },
  { key: 'dragon', name: 'Dragon', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Path d="M22 26 L18 6 L38 20ZM78 26 L82 6 L62 20Z" fill={c} />
      <Path d="M6 46c10-8 18-4 20 6-8 8-18 8-20-6Z" fill={c} opacity={0.8} />
      <Path d="M94 46c-10-8-18-4-20 6 8 8 18 8 20-6Z" fill={c} opacity={0.8} />
      <Ellipse cx="50" cy="56" rx="31" ry="30" fill={c} />
    </>) },
  { key: 'monster', name: 'Monster', eyes: 'big', mouth: 'tongue',
    body: (c) => (<>
      <Path d="M28 20 L34 4 L42 18ZM72 20 L66 4 L58 18Z" fill={c} />
      <Path d="M16 52c0-20 15-32 34-32s34 12 34 32v22c0 8-6 12-10 8l-6-6-6 6c-3 3-7 3-10 0l-6-6-6 6c-4 4-14 2-14-8Z" fill={c} />
    </>) },
  { key: 'ladybird', name: 'Ladybird', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Line x1="38" y1="18" x2="30" y2="6" stroke={c} strokeWidth="4" strokeLinecap="round" />
      <Line x1="62" y1="18" x2="70" y2="6" stroke={c} strokeWidth="4" strokeLinecap="round" />
      <Circle cx="50" cy="54" r="34" fill={c} />
      <Circle cx="28" cy="70" r="6" fill="#141418" opacity={0.6} />
      <Circle cx="72" cy="70" r="6" fill="#141418" opacity={0.6} />
      <Circle cx="50" cy="80" r="5" fill="#141418" opacity={0.6} />
    </>) },
  { key: 'chick', name: 'Chick', eyes: 'round', mouth: 'beak',
    body: (c) => (<>
      <Path d="M50 8c3 6 2 10-3 12 6 3 10 1 12-6Z" fill={c} />
      <Ellipse cx="50" cy="58" rx="31" ry="29" fill={c} />
      <Ellipse cx="18" cy="60" rx="8" ry="14" fill={c} opacity={0.85} />
      <Ellipse cx="82" cy="60" rx="8" ry="14" fill={c} opacity={0.85} />
    </>) },
];

const BY_KEY = new Map(CHARACTERS.map((c) => [c.key, c]));

function renderEyes(kind: Eyes) {
  if (kind === 'happy')
    return (<>
      <Path d="M32 44 Q38 38 44 44" stroke="#141418" strokeWidth="4" fill="none" strokeLinecap="round" />
      <Path d="M56 44 Q62 38 68 44" stroke="#141418" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>);
  if (kind === 'wink')
    return (<>
      <Circle cx="38" cy="43" r="6.5" fill="#141418" /><Circle cx="40" cy="41" r="2.2" fill="#fff" />
      <Path d="M56 44 Q62 38 68 44" stroke="#141418" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>);
  if (kind === 'big')
    return (<>
      <Circle cx="37" cy="43" r="9" fill="#fff" /><Circle cx="63" cy="43" r="9" fill="#fff" />
      <Circle cx="38" cy="44" r="4.6" fill="#141418" /><Circle cx="64" cy="44" r="4.6" fill="#141418" />
    </>);
  return (<>
    <Circle cx="38" cy="43" r="6.5" fill="#141418" /><Circle cx="62" cy="43" r="6.5" fill="#141418" />
    <Circle cx="40.5" cy="40.5" r="2.3" fill="#fff" /><Circle cx="64.5" cy="40.5" r="2.3" fill="#fff" />
  </>);
}

function renderMouth(kind: Mouth) {
  if (kind === 'none') return null;
  if (kind === 'o') return <Ellipse cx="50" cy="58" rx="4.5" ry="5.5" fill="#141418" opacity={0.85} />;
  if (kind === 'beak') return <Path d="M50 54 l-8 7 16 0 Z" fill="#F0A64C" />;
  if (kind === 'tongue')
    return (<>
      <Path d="M41 55 Q50 65 59 55" stroke="#141418" strokeWidth="3.6" fill="none" strokeLinecap="round" />
      <Path d="M47 60 Q50 66 53 60" fill="#F06AA8" />
    </>);
  if (kind === 'cat')
    return (<>
      <Path d="M44 56 Q50 61 56 56" stroke="#141418" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <Path d="M50 53 l0 3" stroke="#141418" strokeWidth="3" strokeLinecap="round" />
    </>);
  return <Path d="M42 56 Q50 63 58 56" stroke="#141418" strokeWidth="3.6" fill="none" strokeLinecap="round" />;
}

/** "cat-blue" → the two halves, falling back to something rather than nothing. */
export function parseAvatar(value: string | null | undefined): { character: string; color: string } {
  const [character, color] = (value ?? '').split('-');
  return {
    character: BY_KEY.has(character) ? character : 'blob',
    color: AVATAR_COLORS[color] ? color : 'blue',
  };
}

export function Avatar({ value, size = 40 }: { value: string | null | undefined; size?: number }) {
  const { character, color } = parseAvatar(value);
  const c = CHARACTERS.find((x) => x.key === character) ?? CHARACTERS[0];
  const fill = AVATAR_COLORS[color];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {c.body(fill)}
      <Ellipse cx="27" cy="54" rx="5" ry="3.4" fill="#fff" opacity={0.34} />
      <Ellipse cx="73" cy="54" rx="5" ry="3.4" fill="#fff" opacity={0.34} />
      {renderEyes(c.eyes)}
      {renderMouth(c.mouth)}
    </Svg>
  );
}
