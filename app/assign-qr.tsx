import { formatCurrency } from '@/lib/api'
import { isValidCode5, parseQrCode } from '@/lib/qr-parser'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

const { width } = Dimensions.get('window')
const SCAN_AREA_SIZE = width * 0.7
type CreatedWallet = {
  id: string
  name: string | null
  phone: string | null
  balance_cents: number
}

export default function AssignQrScreen() {
  const { currentOrg, currentEvent } = useAuthStore()
  const params = useLocalSearchParams<{
    walletId?: string
    walletName?: string
    balanceCents?: string
    name?: string
    phone?: string
    amountCents?: string
  }>()

  const [permission, requestPermission] = useCameraPermissions()
  const [isScanning, setIsScanning] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [torch, setTorch] = useState(false)
  const [createdWallet, setCreatedWallet] = useState<CreatedWallet | null>(null)

  const isProcessingRef = useRef(false)

  const isExistingWallet = Boolean(params.walletId)
  const balanceCents = parseInt(
    (isExistingWallet ? params.balanceCents : params.amountCents) ?? '0'
  )
  const walletLabel = params.walletName || params.name || params.phone || 'Nueva Wallet'

  useEffect(() => {
    return () => {
      isProcessingRef.current = false
    }
  }, [])

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true

    setIsScanning(false)
    setIsLoading(true)

    try {
      const code5 = parseQrCode(data)

      if (!isValidCode5(code5)) {
        Alert.alert(
          'QR Inválido',
          'No se pudo identificar un código válido en el QR escaneado.',
          [{
            text: 'Reintentar',
            onPress: () => {
              isProcessingRef.current = false
              setIsScanning(true)
            }
          }]
        )
        setIsLoading(false)
        return
      }

      if (!currentOrg || (!isExistingWallet && !currentEvent)) {
        Alert.alert('Error', 'Datos incompletos')
        setIsLoading(false)
        return
      }

      // Buscar el QR
      const { data: qr, error: qrError } = await (supabase
        .from('qrs') as any)
        .select('id, status, wallet_id')
        .eq('org_id', currentOrg.id)
        .eq('code_5', code5)
        .maybeSingle()

      if (qrError || !qr) {
        Alert.alert(
          'QR No Encontrado',
          'Este QR no pertenece a tu organización o no existe.',
          [{
            text: 'Reintentar',
            onPress: () => {
              isProcessingRef.current = false
              setIsScanning(true)
            }
          }]
        )
        setIsLoading(false)
        return
      }

      // Verificar que el QR esté disponible (no permitir reasignar)
      if (qr.status === 'assigned' && qr.wallet_id) {
        Alert.alert(
          'QR No Disponible',
          'Este QR ya está asignado a otra wallet. Por favor escanea un QR disponible.',
          [{
            text: 'Reintentar',
            onPress: () => {
              isProcessingRef.current = false
              setIsScanning(true)
            }
          }]
        )
        setIsLoading(false)
        return
      }

      if (qr.status === 'inactive') {
        Alert.alert(
          'QR Inactivo',
          'Este QR está inactivo y no puede ser asignado.',
          [{
            text: 'Reintentar',
            onPress: () => {
              isProcessingRef.current = false
              setIsScanning(true)
            }
          }]
        )
        setIsLoading(false)
        return
      }

      // Crear wallet y asignar el QR
      await createWalletAndAssign(qr.id, code5)
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Ocurrió un error al procesar el QR.',
        [{
          text: 'Reintentar',
          onPress: () => {
            isProcessingRef.current = false
            setIsScanning(true)
          }
        }]
      )
      setIsLoading(false)
    }
  }

  const createWalletAndAssign = async (qrId: string, code5: string) => {
    setIsLoading(true)
    
    try {
      if (!currentOrg) {
        throw new Error('Datos incompletos')
      }

      if (!isExistingWallet && !currentEvent) {
        throw new Error('Datos incompletos')
      }

      const name = params.name?.trim() || null
      const phone = params.phone?.trim() || null
      let wallet: CreatedWallet | null = createdWallet
      let walletId = params.walletId

      if (!wallet && !walletId) {
        const event = currentEvent
        if (!event) {
          throw new Error('Datos incompletos')
        }

        const { data: newWallet, error: walletError } = await (supabase
          .from('wallets') as any)
          .insert({
            org_id: currentOrg.id,
            event_id: event.id,
            name,
            phone,
            balance_cents: balanceCents,
            status: 'active',
          })
          .select()
          .single()

        if (walletError) {
          console.error('Error creating wallet:', walletError)

          if (walletError.code === '23505') {
            Alert.alert(
              'Error',
              'Ya existe una wallet con este teléfono en esta organización',
              [
                {
                  text: 'Editar datos',
                  onPress: () => router.back(),
                },
                {
                  text: 'Reintentar',
                  onPress: () => {
                    isProcessingRef.current = false
                    setIsScanning(true)
                  },
                },
              ]
            )
            setIsLoading(false)
            return
          }

          throw walletError
        }

        wallet = newWallet
        walletId = newWallet.id
        setCreatedWallet(newWallet)

        if (balanceCents > 0) {
          const { error: movementError } = await (supabase
            .from('movements') as any)
            .insert({
              org_id: currentOrg.id,
              wallet_id: newWallet.id,
              event_id: event.id,
              type: 'initial_deposit',
              amount_cents: balanceCents,
              notes: 'Depósito inicial al crear wallet',
            })

          if (movementError) {
            console.error('Error creating initial deposit:', movementError)
          }
        }
      }

      if (!walletId) {
        throw new Error('No se pudo crear la wallet')
      }

      // Actualizar el QR con el wallet_id y cambiar status a 'assigned'
      const { error: updateError } = await (supabase
        .from('qrs') as any)
        .update({
          wallet_id: walletId,
          status: 'assigned',
        })
        .eq('id', qrId)

      if (updateError) {
        throw updateError
      }

      if (isExistingWallet) {
        Alert.alert(
          'QR Asignado',
          `El QR ${code5} fue asignado a la wallet "${walletLabel}".`,
          [
            {
              text: 'Volver',
              onPress: () => router.back(),
            },
          ]
        )
      } else {
        Alert.alert(
          '¡Wallet Creada!',
          `La wallet "${walletLabel}" ha sido creada y asociada al QR ${code5}.\n\nSaldo: ${formatCurrency(balanceCents)}`,
          [
            {
              text: 'Crear Otra',
              onPress: () => {
                router.dismissAll()
                setTimeout(() => router.push('/create-wallet'), 100)
              },
            },
            {
              text: 'Volver a Wallets',
              onPress: () => router.dismissAll(),
            },
          ]
        )
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo asignar el QR')
      isProcessingRef.current = false
      setIsScanning(true)
    } finally {
      setIsLoading(false)
    }
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1F2937" />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={64} color="#6B7280" />
          <Text style={styles.permissionTitle}>Permiso de Cámara</Text>
          <Text style={styles.permissionText}>
            Necesitamos acceso a la cámara para escanear el código QR
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Permitir Cámara</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={isScanning ? handleBarCodeScanned : undefined}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Asignar QR</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {walletLabel}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setTorch(!torch)}
          >
            <Ionicons
              name={torch ? 'flash' : 'flash-outline'}
              size={24}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        {/* Wallet Info Card */}
        <View style={styles.walletInfoCard}>
          <Ionicons name="wallet" size={20} color="#059669" />
          <Text style={styles.walletInfoText}>
            Saldo: {formatCurrency(balanceCents)}
          </Text>
        </View>

        {/* Scan area */}
        <View style={styles.scanAreaContainer}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>Asignando...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsText}>
            Escanea el QR que deseas asignar a esta wallet
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
  },
  permissionText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  backButton: {
    paddingVertical: 12,
    marginTop: 8,
  },
  backButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  walletInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 40,
    gap: 8,
  },
  walletInfoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  scanAreaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    borderRadius: 20,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#10B981',
    borderWidth: 4,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 20,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 20,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 20,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 12,
  },
  instructions: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  instructionsText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
})
