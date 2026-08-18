import {
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';
import { ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppFrame } from './src/components/AppFrame';
import { invalidateSession } from './src/lib/supabase';
import { ThemeProvider } from './src/theme/ThemeContext';
import { reloadIfStale } from './src/utils/version';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [loaded, error] = useFonts({
    ArchivoBlack_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
  });

  useEffect(() => {
    // Hide the splash on failure too, so a font problem can't wedge the app.
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  // Coming back to the app is the one moment a reload interrupts nothing, so
  // that is where a build left open for days catches up with itself.
  //
  // It is also where a session quietly stops being valid. Nothing refreshes a
  // token while the tab is suspended, so an app resumed after an hour away is
  // holding one that has expired and does not know it. Doubting that on the
  // way back in costs one request and spares the first thing the app does
  // from being the thing that fails.
  useEffect(() => {
    reloadIfStale();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        invalidateSession();
        reloadIfStale();
      }
    });
    return () => sub.remove();
  }, []);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* Inside the theme, so the space either side of the column is the
            app's own background rather than a browser's white. */}
        <AppFrame>
          <RootNavigator />
        </AppFrame>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
