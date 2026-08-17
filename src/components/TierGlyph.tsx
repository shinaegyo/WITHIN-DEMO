import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/**
 * Where somebody is standing on the climb, as a silhouette.
 *
 * One per tier, and a star for the summit. Drawn rather than coloured because
 * three of the five arenas are near-identical pale blues - as eighteen-pixel
 * marks on a white row they would be one colour and no information. The shape
 * is the whole signal, which is the same reasoning LeagueBadge gives for its
 * own set.
 *
 * The ladder is an altitude: ground, cloud, banded atmosphere, the last thin
 * band, then a planet seen from outside it. A mountain sits at the bottom of
 * that, not the top - it is terrain, and it was the wrong mark for a summit
 * the moment the tiers above it went into the sky. The summit gets a star,
 * which is the one thing that reads as being past the top of an altitude
 * rather than somewhere on it.
 */
export type Tier = 'ground' | 'sky' | 'strato' | 'thin' | 'orbit' | 'summit';

export function TierGlyph({
  tier,
  color,
  size = 19,
}: {
  tier: Tier;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      {tier === 'ground' && (
        // Terrain. Two peaks, the taller off centre, because one symmetrical
        // triangle at this size reads as a play button.
        <Path d="M1 25L10.5 6.5 16.5 17.5 20.5 10.5 29 25z" fill={color} />
      )}

      {tier === 'sky' && (
        <>
          <Rect x={4} y={15} width={22} height={8} rx={4} fill={color} />
          <Circle cx={11} cy={14} r={6.5} fill={color} />
          <Circle cx={20} cy={15.5} r={5.5} fill={color} />
        </>
      )}

      {tier === 'strato' && (
        // Banded air: two layers, the lower one wider, so it reads as looking
        // up through something rather than as two arbitrary bars.
        <>
          <Rect x={3} y={11} width={24} height={3.4} rx={1.7} fill={color} />
          <Rect x={7} y={18} width={16} height={3.4} rx={1.7} fill={color} />
        </>
      )}

      {tier === 'thin' && (
        // One band left, and a fragment of another. The air is running out.
        <>
          <Rect x={4} y={13} width={22} height={2.8} rx={1.4} fill={color} />
          <Rect x={12} y={20} width={6} height={2.6} rx={1.3} fill={color} />
        </>
      )}

      {tier === 'orbit' && (
        // A body with a ring round it: no longer in the air, looking at it.
        <>
          <Circle cx={15} cy={15} r={7} fill={color} />
          <Ellipse
            cx={15}
            cy={15}
            rx={13.5}
            ry={4.6}
            fill="none"
            stroke={color}
            strokeWidth={2.2}
            transform="rotate(-22 15 15)"
          />
        </>
      )}

      {tier === 'summit' && (
        // Five points rather than four. Four is the profile's points glyph and
        // this is the rarer thing by a long way.
        <Path
          d="M15 2 L18.3 10.5 L27.4 11 L20.3 16.7 L22.6 25.5 L15 20.6 L7.4 25.5 L9.7 16.7 L2.6 11 L11.7 10.5 Z"
          fill={color}
        />
      )}
    </Svg>
  );
}

/** Which glyph a level wears. Mirrors arena_floor on the server. */
export function tierFor(level: number): Tier {
  if (level >= 61) return 'orbit';
  if (level >= 46) return 'thin';
  if (level >= 31) return 'strato';
  if (level >= 16) return 'sky';
  return 'ground';
}
