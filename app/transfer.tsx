import { formatCurrency } from '@/lib/api'
import { isValidCode5, parseQrCode } from '@/lib/qr-parser'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import React, { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

const { width } = Dimensions.get('window')
const SCAN_AREA_SIZE = width * 0.6

interface WalletInfo {
  id: string
  name: string | null
  phone: string | null
  balance_cents: number
  status: 'active' | 'blocked'
  code5: string
}

type Step = 'scan_origin' | 'scan_destination' | 'enter_amount' | 'confirm'

export default function TransferScreen() {
  const { currentOrg, currentEvent, canAccessFeature } = useAuthStore()
  
  const [permission, requestPermission] = useCameraPermissions()
  const [step, setStep] = useState<Step>('scan_origin')
  const [isScanning, setIsScanning] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [torch, setTorch] = useState(false)
  
  const [originWallet, setOriginWallet] = useState<WalletInfo | null>(null)
  const [destinationWallet, setDestinationWallet] = useState<WalletInfo | null>(null)
  const [amount, setAmount] = useState('')
  
  const isProcessingRef = useRef(false)

  // Guard: only admin/owner can access transfers
  if (!canAccessFeature('transfer')) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <Ionicons name="lock-closed-outline" size={64} color="#9CA3AF" />
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 }}>Acceso restringido</Text>
        <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Solo administradores pueden realizar transferencias
        </Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#1F2937', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 24 }}
          onPress={() => router.back()}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Volver</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const amountCents = parseInt(amount || '0') * 100

  const resetScanner = () => {
    isProcessingRef.current = false
    setIsScanning(true)
  }

  const findWalletByCode = async (code5: string): Promise<WalletInfo | null> => {
    if (!currentOrg) return null

    const { data: qr, error } = await (supabase
      .from('qrs') as any)
      .select(`
        wallet:wallets(id, name, phone, balance_cents, status)
      `)
      .eq('org_id', currentOrg.id)
      .eq('code_5', code5)
      .maybeSingle()

    if (error || !qr?.wallet) return null

    const w = qr.wallet as any
    return {
      id: w.id,
      name: w.name,
      phone: w.phone,
      balance_cents: w.balance_cents,
      status: w.status,
      code5,
    }
  }

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true

    setIsScanning(false)
    setIsLoading(true)

    try {
      const code5 = parseQrCode(data)

      if (!isValidCode5(code5)) {
        Alert.alert('QR Inválido', 'Código no válido.', [{ text: 'Reintentar', onPress: resetScanner }])
        setIsLoading(false)
        return
      }

      const wallet = await findWalletByCode(code5)

      if (!wallet) {
        Alert.alert('Wallet No Encontrada', 'Este QR no tiene wallet.', [{ text: 'Reintentar', onPress: resetScanner }])
        setIsLoading(false)
        return
      }

      if (wallet.status === 'blocked') {
        Alert.alert('Wallet Bloqueada', 'Esta wallet está bloqueada.', [{ text: 'Reintentar', onPress: resetScanner }])
        setIsLoading(false)
        return
      }

      if (step === 'scan_origin') {
        setOriginWallet(wallet)
        setStep('scan_destination')
        resetScanner()
      } else if (step === 'scan_destination') {
        if (wallet.id === originWallet?.id) {
          Alert.alert('Error', 'No puedes transferir a la misma wallet.', [{ text: 'Reintentar', onPress: resetScanner }])
          setIsLoading(false)
          return
        }
        setDestinationWallet(wallet)
        setStep('enter_amount')
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al buscar wallet')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmTransfer = async () => {
    if (!originWallet || !destinationWallet || !currentOrg || !currentEvent) return
    if (amountCents <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido')
      return
    }
    if (amountCents > originWallet.balance_cents) {
      Alert.alert('Error', 'Saldo insuficiente en la wallet origen')
      return
    }

    setIsLoading(true)

    try {
      // 1. Create transfer_out movement (origin)
      const { data: outMovement, error: outError } = await (supabase
        .from('movements') as any)
        .insert({
          org_id: currentOrg.id,
          wallet_id: originWallet.id,
          event_id: currentEvent.id,
          type: 'transfer_out',
          amount_cents: amountCents,
          notes: `Transferencia a ${destinationWallet.name || destinationWallet.phone || destinationWallet.code5}`,
        })
        .select()
        .single()

      if (outError) throw outError

      // 2. Create transfer_in movement (destination)
      const { data: inMovement, error: inError } = await (supabase
        .from('movements') as any)
        .insert({
          org_id: currentOrg.id,
          wallet_id: destinationWallet.id,
          event_id: currentEvent.id,
          type: 'transfer_in',
          amount_cents: amountCents,
          linked_movement_id: outMovement.id,
          notes: `Transferencia de ${originWallet.name || originWallet.phone || originWallet.code5}`,
        })
        .select()
        .single()

      if (inError) {
        // Rollback
        await (supabase.from('movements') as any).delete().eq('id', outMovement.id)
        throw inError
      }

      // 3. Link the out movement to in movement
      await (supabase
        .from('movements') as any)
        .update({ linked_movement_id: inMovement.id })
        .eq('id', outMovement.id)

      // 4. Update balances
      const { error: originError } = await (supabase
        .from('wallets') as any)
        .update({ balance_cents: originWallet.balance_cents - amountCents })
        .eq('id', originWallet.id)

      if (originError) {
        // Rollback movements
        await (supabase.from('movements') as any).delete().eq('id', inMovement.id)
        await (supabase.from('movements') as any).delete().eq('id', outMovement.id)
        throw originError
      }

      const { error: destError } = await (supabase
        .from('wallets') as any)
        .update({ balance_cents: destinationWallet.balance_cents + amountCents })
        .eq('id', destinationWallet.id)

      if (destError) {
        // Rollback everything
        await (supabase.from('wallets') as any).update({ balance_cents: originWallet.balance_cents }).eq('id', originWallet.id)
        await (supabase.from('movements') as any).delete().eq('id', inMovement.id)
        await (supabase.from('movements') as any).delete().eq('id', outMovement.id)
        throw destError
      }

      Alert.alert(
        '¡Transferencia Exitosa!',
        `Se transfirieron ${formatCurrency(amountCents)} de ${originWallet.name || originWallet.code5} a ${destinationWallet.name || destinationWallet.code5}`,
        [
          { text: 'Nueva Transferencia', onPress: () => {
            setOriginWallet(null)
            setDestinationWallet(null)
            setAmount('')
            setStep('scan_origin')
            resetScanner()
          }},
          { text: 'Volver', onPress: () => router.back() },
        ]
      )
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo completar la transferencia')
    } finally {
      setIsLoading(false)
    }
  }

  if (!permission) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#1F2937" /></View>
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={64} color="#6B7280" />
          <Text style={styles.permissionTitle}>Permiso de Cámara</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Permitir Cámara</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // Amount entry & confirmation step
  if (step === 'enter_amount' || step === 'confirm') {
    return (
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transferencia</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Wallets summary */}
          <View style={styles.transferSummary}>
            {/* Origin */}
            <View style={styles.walletSummaryCard}>
              <Text style={styles.walletLabel}>ORIGEN</Text>
              <Text style={styles.walletSummaryName}>
                {originWallet?.name || originWallet?.phone || originWallet?.code5}
              </Text>
              <Text style={styles.walletSummaryBalance}>
                {formatCurrency(originWallet?.balance_cents || 0)}
              </Text>
            </View>

            <View style={styles.arrowContainer}>
              <Ionicons name="arrow-forward" size={24} color="#D97706" />
            </View>

            {/* Destination */}
            <View style={styles.walletSummaryCard}>
              <Text style={styles.walletLabel}>DESTINO</Text>
              <Text style={styles.walletSummaryName}>
                {destinationWallet?.name || destinationWallet?.phone || destinationWallet?.code5}
              </Text>
              <Text style={styles.walletSummaryBalance}>
                {formatCurrency(destinationWallet?.balance_cents || 0)}
              </Text>
            </View>
          </View>

          {/* Amount input */}
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>Monto a transferir</Text>
            <View style={styles.amountInputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={(text) => setAmount(text.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
            </View>
            <Text style={styles.availableText}>
              Disponible: {formatCurrency(originWallet?.balance_cents || 0)}
            </Text>
          </View>

          {/* New balances preview */}
          {amountCents > 0 && (
            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>Después de la transferencia</Text>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>{originWallet?.name || originWallet?.code5}</Text>
                <Text style={[styles.previewValue, { color: '#DC2626' }]}>
                  {formatCurrency((originWallet?.balance_cents || 0) - amountCents)}
                </Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>{destinationWallet?.name || destinationWallet?.code5}</Text>
                <Text style={[styles.previewValue, { color: '#059669' }]}>
                  {formatCurrency((destinationWallet?.balance_cents || 0) + amountCents)}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Confirm button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.confirmButton,
              (amountCents <= 0 || amountCents > (originWallet?.balance_cents || 0) || isLoading) && styles.confirmButtonDisabled
            ]}
            onPress={handleConfirmTransfer}
            disabled={amountCents <= 0 || amountCents > (originWallet?.balance_cents || 0) || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="swap-horizontal" size={24} color="#fff" />
                <Text style={styles.confirmButtonText}>
                  Transferir {formatCurrency(amountCents)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // Scanner steps
  const isOriginStep = step === 'scan_origin'

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={isScanning ? handleBarCodeScanned : undefined}
      />

      <View style={styles.overlay}>
        <View style={styles.headerDark}>
          <TouchableOpacity style={styles.headerButtonLight} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitleLight}>Transferencia</Text>
            <Text style={styles.stepText}>
              Paso {isOriginStep ? '1' : '2'} de 2
            </Text>
          </View>
          <TouchableOpacity style={styles.headerButtonLight} onPress={() => setTorch(!torch)}>
            <Ionicons name={torch ? 'flash' : 'flash-outline'} size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Origin wallet preview */}
        {!isOriginStep && originWallet && (
          <View style={styles.originPreview}>
            <Text style={styles.originPreviewLabel}>Origen:</Text>
            <Text style={styles.originPreviewName}>
              {originWallet.name || originWallet.phone || originWallet.code5}
            </Text>
            <Text style={styles.originPreviewBalance}>
              {formatCurrency(originWallet.balance_cents)}
            </Text>
          </View>
        )}

        <View style={styles.scanAreaContainer}>
          <View style={[styles.scanArea, !isOriginStep && styles.scanAreaDestination]}>
            <View style={[styles.corner, styles.cornerTL, !isOriginStep && styles.cornerDestination]} />
            <View style={[styles.corner, styles.cornerTR, !isOriginStep && styles.cornerDestination]} />
            <View style={[styles.corner, styles.cornerBL, !isOriginStep && styles.cornerDestination]} />
            <View style={[styles.corner, styles.cornerBR, !isOriginStep && styles.cornerDestination]} />

            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>Buscando...</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>
            {isOriginStep ? 'Escanea la wallet ORIGEN' : 'Escanea la wallet DESTINO'}
          </Text>
          <Text style={styles.instructionsText}>
            {isOriginStep 
              ? 'Esta wallet enviará el saldo' 
              : 'Esta wallet recibirá el saldo'}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permissionContainer: { flex: 1, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionCard: { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', width: '100%', maxWidth: 320 },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginTop: 16 },
  permissionButton: { backgroundColor: '#1F2937', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginTop: 24 },
  permissionButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerDark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16 },
  headerButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  headerButtonLight: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  headerTitleLight: { fontSize: 18, fontWeight: '600', color: '#fff' },
  stepText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  originPreview: { backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 24, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  originPreviewLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  originPreviewName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
  originPreviewBalance: { fontSize: 14, fontWeight: '600', color: '#10B981' },
  scanAreaContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanArea: { width: SCAN_AREA_SIZE, height: SCAN_AREA_SIZE, borderRadius: 20 },
  scanAreaDestination: {},
  corner: { position: 'absolute', width: 40, height: 40, borderColor: '#fff', borderWidth: 4 },
  cornerDestination: { borderColor: '#10B981' },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 20 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 20 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 20 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 20 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  loadingText: { color: '#fff', fontSize: 14, marginTop: 12 },
  instructions: { paddingHorizontal: 24, paddingBottom: 48, alignItems: 'center' },
  instructionsTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 4 },
  instructionsText: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  content: { flex: 1, backgroundColor: '#F9FAFB' },
  contentContainer: { padding: 16 },
  transferSummary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletSummaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center' },
  walletLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.5 },
  walletSummaryName: { fontSize: 14, fontWeight: '600', color: '#1F2937', marginTop: 4, textAlign: 'center' },
  walletSummaryBalance: { fontSize: 16, fontWeight: '700', color: '#059669', marginTop: 4 },
  arrowContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  amountSection: { marginTop: 24, alignItems: 'center' },
  amountLabel: { fontSize: 14, color: '#6B7280', marginBottom: 12 },
  amountInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 20, height: 72, width: '100%' },
  currencySymbol: { fontSize: 32, fontWeight: '700', color: '#9CA3AF', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 40, fontWeight: '700', color: '#1F2937' },
  availableText: { fontSize: 13, color: '#6B7280', marginTop: 12 },
  previewSection: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 24 },
  previewTitle: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 12 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  previewLabel: { fontSize: 14, color: '#374151' },
  previewValue: { fontSize: 16, fontWeight: '700' },
  footer: { padding: 16, paddingBottom: 32, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  confirmButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#D97706', borderRadius: 12, paddingVertical: 16, gap: 8 },
  confirmButtonDisabled: { backgroundColor: '#9CA3AF' },
  confirmButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' },
})
