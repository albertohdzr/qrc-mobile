import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import React, { useState, useRef } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

// Auto refresh session when app is in foreground
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

type AuthMode = 'login' | 'recovery_email' | 'recovery_otp' | 'recovery_new_password' | 'recovery_success'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<AuthMode>('login')

  // Recovery state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // OTP input refs
  const otpRefs = useRef<(TextInput | null)[]>([])

  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current
  const slideAnim = useRef(new Animated.Value(0)).current

  const animateTransition = (newMode: AuthMode) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -20,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setMode(newMode)
      slideAnim.setValue(20)
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    })
  }

  // ── Sign In ──────────────────────────────────────────────
  async function signInWithEmail() {
    if (!email || !password) {
      Alert.alert('Error', 'Por favor ingresa tu email y contraseña')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    })

    if (error) {
      Alert.alert('Error', translateError(error.message))
    }
    setLoading(false)
  }

  // ── Step 1: Send OTP to email ────────────────────────────
  async function sendPasswordReset() {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      Alert.alert('Error', 'Por favor ingresa tu email')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail)

    if (error) {
      Alert.alert('Error', translateError(error.message))
      setLoading(false)
      return
    }

    setLoading(false)
    setOtpDigits(['', '', '', '', '', '', '', ''])
    animateTransition('recovery_otp')
  }

  // ── Step 2: Verify OTP ──────────────────────────────────
  async function verifyOtp() {
    const token = otpDigits.join('')
    if (token.length !== 8) {
      Alert.alert('Error', 'Por favor ingresa el código completo de 8 dígitos')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'recovery',
    })

    if (error) {
      Alert.alert('Error', translateError(error.message))
      setLoading(false)
      return
    }

    // OTP verified — user is now authenticated in recovery mode
    setLoading(false)
    setNewPassword('')
    setConfirmPassword('')
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    animateTransition('recovery_new_password')
  }

  // ── Step 3: Set new password ────────────────────────────
  async function updatePassword() {
    if (!newPassword) {
      Alert.alert('Error', 'Por favor ingresa tu nueva contraseña')
      return
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      Alert.alert('Error', translateError(error.message))
      setLoading(false)
      return
    }

    // Sign out so the user re-authenticates with the new password
    await supabase.auth.signOut()
    setLoading(false)
    animateTransition('recovery_success')
  }

  // ── OTP input handling ──────────────────────────────────
  function handleOtpChange(text: string, index: number) {
    // Only allow digits
    const digit = text.replace(/[^0-9]/g, '')

    const newDigits = [...otpDigits]

    if (digit.length > 1) {
      // Handle paste — distribute digits across fields
      const chars = digit.split('')
      for (let i = 0; i < chars.length && index + i < 6; i++) {
        newDigits[index + i] = chars[i]
      }
      setOtpDigits(newDigits)
      const nextIndex = Math.min(index + chars.length, 5)
      otpRefs.current[nextIndex]?.focus()
      return
    }

    newDigits[index] = digit
    setOtpDigits(newDigits)

    // Auto-advance to next field
    if (digit && index < 7) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  function handleOtpKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !otpDigits[index] && index > 0) {
      const newDigits = [...otpDigits]
      newDigits[index - 1] = ''
      setOtpDigits(newDigits)
      otpRefs.current[index - 1]?.focus()
    }
  }

  // ── Navigation ──────────────────────────────────────────
  function handleBackToLogin() {
    setPassword('')
    setOtpDigits(['', '', '', '', '', '', '', ''])
    setNewPassword('')
    setConfirmPassword('')
    animateTransition('login')
  }

  function handleForgotPassword() {
    animateTransition('recovery_email')
  }

  // ── Error translations ──────────────────────────────────
  function translateError(message: string): string {
    const translations: Record<string, string> = {
      'Invalid login credentials': 'Credenciales inválidas',
      'Email not confirmed': 'Email no confirmado. Revisa tu correo.',
      'User already registered': 'Este email ya está registrado',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
      'For security purposes, you can only request this once every 60 seconds': 'Por seguridad, solo puedes solicitar esto una vez cada 60 segundos',
      'Unable to validate email address: invalid format': 'El formato del email no es válido',
      'Token has expired or is invalid': 'El código ha expirado o es inválido',
      'New password should be different from the old password.': 'La nueva contraseña debe ser diferente a la anterior',
    }
    return translations[message] ?? message
  }

  // ════════════════════════════════════════════════════════
  // RENDER FUNCTIONS
  // ════════════════════════════════════════════════════════

  const renderLoginForm = () => (
    <>
      {/* Header */}
      <Text style={styles.title}>Bienvenido</Text>
      <Text style={styles.subtitle}>Inicia sesión en tu cuenta</Text>

      {/* Email Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="tu@email.com"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!loading}
          />
        </View>
      </View>

      {/* Password Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Contraseña</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            editable={!loading}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeButton}
            disabled={loading}
          >
            <Ionicons
              name={showPassword ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Forgot Password */}
      <TouchableOpacity
        style={styles.forgotButton}
        onPress={handleForgotPassword}
        disabled={loading}
      >
        <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
      </TouchableOpacity>

      {/* Main Button */}
      <TouchableOpacity
        style={[styles.mainButton, loading && styles.mainButtonDisabled]}
        onPress={signInWithEmail}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.mainButtonText}>Iniciar sesión</Text>
        )}
      </TouchableOpacity>
    </>
  )

  // ── Step 1: Enter email ─────────────────────────────────
  const renderRecoveryEmail = () => (
    <>
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBackToLogin}
        disabled={loading}
      >
        <Ionicons name="arrow-back" size={20} color="#1F2937" />
        <Text style={styles.backButtonText}>Volver</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Recuperar contraseña</Text>
      <Text style={styles.subtitle}>
        Ingresa tu email y te enviaremos un código de verificación de 8 dígitos
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="tu@email.com"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            autoFocus
            editable={!loading}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.mainButton, loading && styles.mainButtonDisabled]}
        onPress={sendPasswordReset}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.mainButtonText}>Enviar código</Text>
        )}
      </TouchableOpacity>
    </>
  )

  // ── Step 2: Enter OTP code ──────────────────────────────
  const renderOtpVerification = () => (
    <>
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBackToLogin}
        disabled={loading}
      >
        <Ionicons name="arrow-back" size={20} color="#1F2937" />
        <Text style={styles.backButtonText}>Volver</Text>
      </TouchableOpacity>

      <View style={styles.otpHeaderIcon}>
        <Ionicons name="shield-checkmark-outline" size={40} color="#4F46E5" />
      </View>

      <Text style={styles.title}>Ingresa el código</Text>
      <Text style={styles.subtitle}>
        Enviamos un código de 8 dígitos a{'\n'}
        <Text style={styles.emailHighlight}>{email.trim()}</Text>
      </Text>

      {/* OTP Input */}
      <View style={styles.otpContainer}>
        {otpDigits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { otpRefs.current[index] = ref }}
            style={[
              styles.otpInput,
              digit ? styles.otpInputFilled : null,
            ]}
            value={digit}
            onChangeText={(text) => handleOtpChange(text, index)}
            onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, index)}
            keyboardType="number-pad"
            maxLength={index === 0 ? 8 : 1}
            editable={!loading}
            selectTextOnFocus
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.mainButton, loading && styles.mainButtonDisabled]}
        onPress={verifyOtp}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.mainButtonText}>Verificar código</Text>
        )}
      </TouchableOpacity>

      {/* Resend */}
      <TouchableOpacity
        style={styles.resendButton}
        onPress={() => {
          setOtpDigits(['', '', '', '', '', '', '', ''])
          sendPasswordReset()
        }}
        disabled={loading}
      >
        <Text style={styles.resendText}>¿No recibiste el código? <Text style={styles.resendTextBold}>Reenviar</Text></Text>
      </TouchableOpacity>

      <Text style={styles.spamNote}>
        Revisa tu carpeta de spam si no encuentras el correo
      </Text>
    </>
  )

  // ── Step 3: New password ────────────────────────────────
  const renderNewPassword = () => (
    <>
      <View style={styles.otpHeaderIcon}>
        <Ionicons name="lock-open-outline" size={40} color="#059669" />
      </View>

      <Text style={styles.title}>Nueva contraseña</Text>
      <Text style={styles.subtitle}>Crea una contraseña segura para tu cuenta</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Nueva contraseña</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor="#9CA3AF"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNewPassword}
            autoCapitalize="none"
            autoFocus
            editable={!loading}
          />
          <TouchableOpacity
            onPress={() => setShowNewPassword(!showNewPassword)}
            style={styles.eyeButton}
            disabled={loading}
          >
            <Ionicons
              name={showNewPassword ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Confirmar contraseña</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Repite tu contraseña"
            placeholderTextColor="#9CA3AF"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            editable={!loading}
          />
          <TouchableOpacity
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            style={styles.eyeButton}
            disabled={loading}
          >
            <Ionicons
              name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Password strength hints */}
      <View style={styles.passwordHints}>
        <View style={styles.hintRow}>
          <Ionicons
            name={newPassword.length >= 6 ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={newPassword.length >= 6 ? '#059669' : '#9CA3AF'}
          />
          <Text style={[styles.hintText, newPassword.length >= 6 && styles.hintTextValid]}>
            Mínimo 6 caracteres
          </Text>
        </View>
        <View style={styles.hintRow}>
          <Ionicons
            name={newPassword && newPassword === confirmPassword ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={newPassword && newPassword === confirmPassword ? '#059669' : '#9CA3AF'}
          />
          <Text style={[styles.hintText, newPassword && newPassword === confirmPassword && styles.hintTextValid]}>
            Las contraseñas coinciden
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.mainButton, loading && styles.mainButtonDisabled]}
        onPress={updatePassword}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.mainButtonText}>Guardar contraseña</Text>
        )}
      </TouchableOpacity>
    </>
  )

  // ── Step 4: Success ─────────────────────────────────────
  const renderSuccess = () => (
    <>
      <View style={styles.successIconContainer}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={56} color="#059669" />
        </View>
      </View>

      <Text style={styles.title}>¡Contraseña actualizada!</Text>
      <Text style={styles.subtitle}>
        Tu contraseña se ha cambiado exitosamente.{'\n'}Ya puedes iniciar sesión con tu nueva contraseña.
      </Text>

      <TouchableOpacity
        style={styles.mainButton}
        onPress={handleBackToLogin}
        activeOpacity={0.8}
      >
        <Text style={styles.mainButtonText}>Iniciar sesión</Text>
      </TouchableOpacity>
    </>
  )

  // ════════════════════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════════════════════

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Image
              source={require('../assets/images/logos/white-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Animated Content */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {mode === 'login' && renderLoginForm()}
          {mode === 'recovery_email' && renderRecoveryEmail()}
          {mode === 'recovery_otp' && renderOtpVerification()}
          {mode === 'recovery_new_password' && renderNewPassword()}
          {mode === 'recovery_success' && renderSuccess()}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  logoImage: {
    width: 52,
    height: 52,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    height: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  eyeButton: {
    padding: 4,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  mainButton: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  mainButtonDisabled: {
    opacity: 0.7,
  },
  mainButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Back button
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 24,
    gap: 6,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  // OTP styles
  otpHeaderIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  otpInput: {
    width: 40,
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  otpInputFilled: {
    borderColor: '#1F2937',
    backgroundColor: '#F9FAFB',
  },
  // Email highlight
  emailHighlight: {
    fontWeight: '600',
    color: '#1F2937',
  },
  // Resend
  resendButton: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    color: '#6B7280',
  },
  resendTextBold: {
    fontWeight: '600',
    color: '#1F2937',
  },
  spamNote: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12,
  },
  // Password hints
  passwordHints: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  hintTextValid: {
    color: '#059669',
  },
  // Success
  successIconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#D1FAE5',
  },
})
