import React from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { noWidow } from '../utils/text';

/**
 * The app's Text. Identical to React Native's, except that a string never ends
 * up with one word alone on its last line.
 *
 * A component rather than a rule everybody has to remember: widows appear at
 * particular screen widths, so they survive review on the machine the copy was
 * written on and turn up later on somebody's phone. Doing it here means every
 * line of copy in the app is covered by having been written at all.
 */
export function Text({ children, ...rest }: TextProps) {
  return (
    <RNText {...rest}>
      {Array.isArray(children)
        ? children.map((child, i) =>
            // Only the final string can strand a word; binding inside the run
            // would glue words together mid-sentence for no reason.
            typeof child === 'string' && i === children.length - 1 ? noWidow(child) : child,
          )
        : typeof children === 'string'
          ? noWidow(children)
          : children}
    </RNText>
  );
}
