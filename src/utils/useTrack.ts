import { useContext, useEffect } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { playTrack, type Track } from './music';

/**
 * Plays a screen's music, whether or not there is a navigator above it.
 *
 * The music has to follow focus - a tab screen mounts once and never again, so
 * binding on mount left a mode's track playing over the screen you came back
 * to. But useFocusEffect throws outright when nothing is providing navigation,
 * and the tutorial renders Practice before the NavigationContainer exists: a
 * new player pressing "practice round" got a white screen, which is the worst
 * possible moment for the app to fail.
 *
 * So focus is an addition rather than a requirement. The track starts on mount,
 * which is all the tutorial needs, and where there is a navigator it also
 * restarts on focus, which is what the tabs need.
 */
export function useTrack(track: Track): void {
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    playTrack(track);
    if (!navigation) return;
    return navigation.addListener('focus', () => playTrack(track));
  }, [navigation, track]);
}
