import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppProvider, useApp } from '@/context/AppContext';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Set this key the very first time onboarding is launched so it never
// auto-opens again on subsequent app starts.
const ONBOARDING_SEEN_KEY = 'cc_onboarding_seen';

function AuthRedirect() {
  const { isLoaded, isAuthenticated, profile } = useApp();
  const router = useRouter();
  const wasAuthenticated = useRef(false);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  // Read the flag once on mount
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY)
      .then(val => setOnboardingSeen(val === 'true'))
      .catch(() => setOnboardingSeen(false));
  }, []);

  useEffect(() => {
    // Wait until both auth and the storage flag are resolved
    if (!isLoaded || onboardingSeen === null) return;

    if (!isAuthenticated) {
      wasAuthenticated.current = false;
      router.replace('/login');
      return;
    }

    // Already handled this auth transition — don't re-navigate
    if (wasAuthenticated.current) return;
    wasAuthenticated.current = true;

    // Only send to onboarding on the very first launch (flag not yet set)
    // and only when the profile is still completely blank.
    const isBlankProfile = profile && profile.displayName === 'You' && !profile.currentDegree;
    if (!onboardingSeen && isBlankProfile) {
      // Mark it so it never auto-opens again
      AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true').catch(() => {});
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }, [isLoaded, isAuthenticated, profile, onboardingSeen]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <AuthRedirect />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{ headerShown: false, animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen
          name="signup"
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="docs" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="doc-viewer" options={{ headerShown: false, animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AppProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
