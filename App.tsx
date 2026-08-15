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
  useEffect(() => {
    reloadIfStale();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') reloadIfStale();
    });
    return () => sub.remove();
  }, []);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
