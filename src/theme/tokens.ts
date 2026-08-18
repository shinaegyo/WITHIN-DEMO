/**
 * The shape language, in one place.
 *
 * Colour and type were already central; shape was not. Corner radius was
 * written out as a number in forty-six files and had drifted to nineteen
 * distinct values - 12, 14, 16, 18 and 20 all doing the job of "this is a
 * card", chosen by whoever wrote that screen that day. Changing the look of
 * the app meant finding every one of them.
 *
 * These names are what a value is FOR, not what it measures. A card is a card
 * whether its corner is 14 or 6, and the point of naming it is that the whole
 * app changes together when that answer changes.
 *
 * Nothing below 12 is here, and that is deliberate. Down there the same number
 * does two jobs: 3 is a progress bar in one file and a six-point dot in
 * another, 11 is both a medal and a button. A medal has a radius of 11 because
 * half of 22 is 11 - that is geometry, not a corner somebody chose, and
 * tokenising it would let a reskin turn every avatar into a squircle. Those
 * sites keep their numbers until a human can tell them apart.
 */

export const radius = {
  /** Tiles in a grid, and rows in a list. */
  tile: 12,
  /** The default surface: standings rows, mode cards, strips. */
  card: 14,
  /** Buttons that fill their width. */
  button: 16,
  /** Cards that hold other cards - rule blocks, choice sheets. */
  sheet: 18,
  /** Panels lifted off the background. */
  panel: 20,
  /** Overlays that take the screen. */
  modal: 24,
  /** Fully round ends, whatever the height. */
  pill: 999,
} as const;

export const border = {
  /** The default line between surfaces. */
  hairline: 1,
  /** A choice that can be selected. */
  selectable: 1.5,
  /** Your own row, or the thing being pointed at. */
  marked: 2,
  /** Reserved for the one element on a screen that outranks everything. */
  heavy: 3,
} as const;

/**
 * Spacing, for screens as they are touched.
 *
 * Not migrated wholesale: padding carries meaning that a radius does not - the
 * 13 above a standings row and the 13 beside it are the same number for
 * different reasons, and swapping both for one name would lose that. New work
 * should reach for these; old work can keep its numbers until it is edited.
 */
export const space = {
  hair: 2,
  tight: 4,
  snug: 8,
  base: 12,
  roomy: 16,
  loose: 22,
  section: 30,
} as const;

/**
 * The type scale.
 *
 * There were thirty-nine distinct font sizes in the app - 12, 12.5, 13, 13.5,
 * 14, 14.5, 15, 15.5 and 16 all doing the job of "body text", each one a nudge
 * made at a different keystroke on a different day. Nine steps inside four
 * points is not a scale, it is a continuum, and a continuum has no shape: every
 * screen arrives at the same volume because nothing is far enough from
 * anything else to read as louder.
 *
 * Six steps, with gaps wide enough to mean something. A screen should have a
 * shape before a word of it is read.
 */
export const type = {
  /** A number as the thing you look at, not as data with a label under it. */
  display: 64,
  /** Screen titles. */
  title: 40,
  /** Section headings inside a screen. */
  heading: 24,
  /** Prose. */
  body: 15,
  /** Values, states, anything sitting beside something else. */
  label: 12.5,
  /** The small letterspaced capitals over a block. */
  caption: 10.5,
} as const;

/**
 * A figure set as artwork.
 *
 * Heavy type at size needs its tracking pulled in or the counters drift apart
 * and the number reads as three separate glyphs. Five percent negative, and a
 * line box just under the cap height so it sits tight to whatever is above it.
 *
 * React Native takes letterSpacing in points rather than em, so it has to be
 * computed from the size rather than written once.
 */
export function numeral(size: number) {
  return {
    fontSize: size,
    letterSpacing: -size * 0.05,
    lineHeight: size * 0.95,
    includeFontPadding: false,
  } as const;
}
