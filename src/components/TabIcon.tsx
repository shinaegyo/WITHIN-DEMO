import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The five tab icons, drawn rather than pulled from a font.
 *
 * An icon font would be another dependency for five shapes, and these have to
 * hold up at 24px in two themes - which is easier to guarantee when the paths
 * are ours.
 *
 * Light strokes on an even grid. The first set was drawn at 2.6 with a wash of
 * colour poured inside the active one, which is what made it look like a phone
 * from 2013: heavy outlines and a filled highlight were how icons were drawn
 * before screens were sharp enough for anything finer. Weight alone marks the
 * active tab now - the same shape, drawn more firmly - and the label under it
 * was always doing most of that work anyway.
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
  const props = {
    stroke: color,
    strokeWidth: active ? 2.1 : 1.7,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <>
          <Path d="M3.6 10.7 12 4.2l8.4 6.5V19a1.6 1.6 0 0 1-1.6 1.6H5.2A1.6 1.6 0 0 1 3.6 19Z" {...props} />
          <Path d="M9.6 20.6v-5.2a2.4 2.4 0 0 1 4.8 0v5.2" {...props} />
        </>
      )}

      {name === 'games' && (
        <>
          {/* A controller reads as games instantly; the 2013 version of it is
              the thick outline, not the shape. */}
          <Path
            d="M8.2 8.4h7.6a5 5 0 0 1 4.9 4l.6 3.4a2.4 2.4 0 0 1-4.4 1.7l-1.2-1.8H8.3l-1.2 1.8a2.4 2.4 0 0 1-4.4-1.7l.6-3.4a5 5 0 0 1 4.9-4Z"
            {...props}
          />
          <Path d="M7.2 11.6v2.2M6.1 12.7h2.2" {...props} />
          <Circle cx="16.1" cy="11.9" r="0.9" fill={color} stroke="none" />
          <Circle cx="18.1" cy="13.9" r="0.9" fill={color} stroke="none" />
        </>
      )}

      {name === 'friends' && (
        <>
          <Circle cx="9.2" cy="8.6" r="3.3" {...props} />
          <Path d="M3.4 20c0-3.2 2.6-5.4 5.8-5.4s5.8 2.2 5.8 5.4" {...props} />
          <Path d="M16.4 6.1a3.3 3.3 0 0 1 0 6.2" {...props} />
          <Path d="M17.6 14.9c1.9.7 3 2.5 3 5.1" {...props} />
        </>
      )}

      {name === 'leaderboard' && (
        <>
          {/* Three standings rather than a trophy. A trophy is a prize; the tab
              is a list of who is where, and the bars say that without ornament. */}
          <Path d="M4.2 20.4V13a1 1 0 0 1 1-1h2.6a1 1 0 0 1 1 1v7.4" {...props} />
          <Path d="M9.8 20.4V5.6a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v14.8" {...props} />
          <Path d="M15.4 20.4V9.4a1 1 0 0 1 1-1H19a1 1 0 0 1 1 1v11" {...props} />
          <Path d="M2.6 20.4h18.8" {...props} />
        </>
      )}
    </Svg>
  );
}
