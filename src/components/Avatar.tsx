import React from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

/**
 * Thirty characters, six colours, drawn rather than uploaded.
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
      <Circle cx="24" cy="26" r="12" fill={c} /><Circle cx="76" cy="26" r="12" fill={c} />{head(c)}
    </>) },
  { key: 'ghost', name: 'Ghost', eyes: 'round', mouth: 'o',
    body: (c) => <Path d="M16 54a34 34 0 0 1 68 0v34l-11-9-11 9-11-9-11 9-11-9-13 9Z" fill={c} /> },
  { key: 'frog', name: 'Frog', eyes: 'round', mouth: 'tongue',
    body: (c) => (<>
      <Circle cx="32" cy="26" r="13" fill={c} /><Circle cx="68" cy="26" r="13" fill={c} />{head(c)}
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
      <Ellipse cx="20" cy="44" rx="10" ry="16" fill={c} /><Ellipse cx="80" cy="44" rx="10" ry="16" fill={c} />{head(c)}
    </>) },
  { key: 'star', name: 'Star', eyes: 'happy', mouth: 'smile',
    body: (c) => (<>
      <Path d="M50 12l10 22 24 3-17 17 4 24-21-12-21 12 4-24-17-17 24-3Z" fill={c} />
      <Circle cx="50" cy="56" r="25" fill={c} />
    </>) },
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
      <Path d="M26 26 L34 8 L44 22Z" fill={c} /><Path d="M74 26 L66 8 L56 22Z" fill={c} />{head(c)}
    </>) },
  { key: 'pig', name: 'Pig', eyes: 'round', mouth: 'none',
    body: (c) => (<>
      <Path d="M28 30 L34 16 L44 26Z" fill={c} /><Path d="M72 30 L66 16 L56 26Z" fill={c} />{head(c)}
      <Ellipse cx="50" cy="60" rx="11" ry="8" fill="#fff" opacity={0.45} />
      <Circle cx="46" cy="60" r="2" fill="#141418" /><Circle cx="54" cy="60" r="2" fill="#141418" />
    </>) },
  { key: 'mouse', name: 'Mouse', eyes: 'round', mouth: 'cat',
    body: (c) => (<>
      <Circle cx="22" cy="28" r="15" fill={c} /><Circle cx="78" cy="28" r="15" fill={c} />{head(c)}
    </>) },
  { key: 'koala', name: 'Koala', eyes: 'round', mouth: 'none',
    body: (c) => (<>
      <Circle cx="18" cy="42" r="15" fill={c} /><Circle cx="82" cy="42" r="15" fill={c} />{head(c)}
      <Ellipse cx="50" cy="60" rx="8" ry="6" fill="#141418" opacity={0.8} />
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
      <Circle cx="16" cy="40" r="10" fill={c} /><Circle cx="84" cy="40" r="10" fill={c} />
      <Ellipse cx="50" cy="58" rx="32" ry="26" fill={c} />
    </>) },
  { key: 'fish', name: 'Fish', eyes: 'round', mouth: 'o',
    body: (c) => (<>
      <Path d="M84 54 l14 -14 v28Z" fill={c} /><Ellipse cx="46" cy="54" rx="32" ry="26" fill={c} />
    </>) },
  { key: 'dino', name: 'Dino', eyes: 'round', mouth: 'smile',
    body: (c) => (<>
      <Path d="M30 22 l6 -12 6 12Z M46 18 l6 -12 6 12Z M62 22 l6 -12 6 12Z" fill={c} />{head(c)}
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
