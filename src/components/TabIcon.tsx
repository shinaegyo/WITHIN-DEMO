import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The five tab icons, drawn rather than pulled from a font.
 *
 * An icon font would be another dependency for five shapes, and these have to
 * hold up at 24px in two themes - which is easier to guarantee when the paths
 * are ours.
 */
export type TabName = 'games' | 'friends' | 'home' | 'leaderboard';

export function TabIcon({
  name,
  color,
  size = 24,
  active = false,
}: {
  name: TabName;
  color: string;
  size?: number;
  active?: boolean;
}) {
  // The active tab is the same shape with a wash of its own colour behind the
  // line, which reads as "this one" without needing a second set of icons.
  const props = {
    stroke: color,
    strokeWidth: 2.6,
    fill: active ? color : 'none',
    fillOpacity: active ? 0.18 : 0,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" {...props} />}

      {name === 'games' && (
        <>
          <Rect x="2.5" y="7" width="19" height="11" rx="4" {...props} />
          <Path d="M7 11v3M5.5 12.5h3M15.5 12h.01M18 14h.01" {...props} />
        </>
      )}

      {name === 'friends' && (
        <>
          <Circle cx="9" cy="8.5" r="3.2" {...props} />
          <Path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" {...props} />
          <Path d="M16 6.2a3.2 3.2 0 0 1 0 6.1M17.5 15.4c2 .6 3.5 2.3 3.5 4.6" {...props} />
        </>
      )}

      {name === 'leaderboard' && (
        <>
          <Path d="M7 4h10v5a5 5 0 0 1-10 0Z" {...props} />
          <Path d="M7 5.5H4.5V7a3 3 0 0 0 3 3M17 5.5h2.5V7a3 3 0 0 1-3 3" {...props} />
          <Path d="M12 14v3M8.5 21h7l-.7-3.2a1 1 0 0 0-1-.8h-3.6a1 1 0 0 0-1 .8Z" {...props} />
        </>
      )}
    </Svg>
  );
}
