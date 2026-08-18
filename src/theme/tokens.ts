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
