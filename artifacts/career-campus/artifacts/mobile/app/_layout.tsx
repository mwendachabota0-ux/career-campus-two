import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Feather } from '@expo/vector-icons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppProvider, useApp } from '@/context/AppContext';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AuthRedirect() {
  const { isLoaded, isAuthenticated, profile } = useApp();
  const router = useRouter();
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isAuthenticated) {
      wasAuthenticated.current = false;
      router.replace('/login');
      return;
    }

    // Already handled this auth transition — don't re-navigate
    if (wasAuthenticated.current) return;
    wasAuthenticated.current = true;

    if (profile && profile.displayName === 'You' && !profile.currentDegree) {
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }, [isLoaded, isAuthenticated, profile]);

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
          options={{ headerShown: false, animation: 'fade', gestureEnabled: false }}
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
