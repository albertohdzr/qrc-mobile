import { useEffect } from 'react'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import 'react-native-reanimated'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import Auth from '@/components/Auth'

export const unstable_settings = {
  anchor: '(tabs)',
}

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const { session, isLoading, isInitialized, setSession, loadUserData } = useAuthStore()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        loadUserData()
      } else {
        useAuthStore.setState({ isLoading: false, isInitialized: true })
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadUserData()
      } else {
        useAuthStore.getState().reset()
        useAuthStore.setState({ isLoading: false, isInitialized: true })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Show loading while initializing
  if (!isInitialized || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1F2937" />
      </View>
    )
  }

  // Show auth screen if not logged in
  if (!session) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Auth />
        <StatusBar style="auto" />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="scanner" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="checkout" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="recharge-scanner" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="recharge-confirm" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="create-wallet" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="assign-qr" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="wallet-details" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="search-wallet" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="event-products" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="transfer" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="select-org" 
          options={{ 
            presentation: 'modal', 
            title: 'Seleccionar Organización',
            headerStyle: { backgroundColor: '#F9FAFB' },
          }} 
        />
        <Stack.Screen 
          name="select-event" 
          options={{ 
            presentation: 'modal', 
            title: 'Seleccionar Evento',
            headerStyle: { backgroundColor: '#F9FAFB' },
          }} 
        />
        <Stack.Screen 
          name="team-management" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="event-report" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="qr-management" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="refund-scanner" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="refund" 
          options={{ 
            headerShown: false,
          }} 
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
})
