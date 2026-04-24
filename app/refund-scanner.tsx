import { checkWalletBalance } from '@/lib/api'
import { isValidCode5, parseQrCode } from '@/lib/qr-parser'
import { useAuthStore } from '@/stores/auth-store'
import { Ionicons } from '@expo/vector-icons'
import { t } from '@/lib/i18n'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
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

export default function RefundScannerScreen() {
  const { currentOrg, currentEvent } = useAuthStore()

  const [permission, requestPermission] = useCameraPermissions()
  const [isScanning, setIsScanning] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [torch, setTorch] = useState(false)

  const isProcessingRef = useRef(false)

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
          t('scanner.invalidQr'),
          t('scanner.invalidQrMessage'),
          [{ text: t('common.retry'), onPress: () => {
            isProcessingRef.current = false
            setIsScanning(true)
          }}]
        )
        setIsLoading(false)
        return
      }

      if (!currentOrg || !currentEvent) {
        Alert.alert(
          t('scanner.configRequired'),
          t('scanner.configRequiredMessage'),
          [{ text: t('common.ok'), onPress: () => {
            isProcessingRef.current = false
            router.back()
          }}]
        )
        setIsLoading(false)
        return
      }

      const result = await checkWalletBalance(code5, currentEvent.id, currentOrg.id)

      if (!result.success || !result.wallet) {
        Alert.alert(
          'Error',
          result.error || t('scanner.couldNotVerify'),
          [{ text: t('common.retry'), onPress: () => {
            isProcessingRef.current = false
            setIsScanning(true)
          }}]
        )
        setIsLoading(false)
        return
      }

      router.replace({
        pathname: '/refund',
        params: {
          walletId: result.wallet.id,
          walletName: result.wallet.name || '',
          walletPhone: result.wallet.phone || '',
          balanceCents: result.wallet.balanceCents.toString(),
          code5,
        },
      })
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || t('scanner.processingError'),
        [{ text: t('common.retry'), onPress: () => {
          isProcessingRef.current = false
          setIsScanning(true)
        }}]
      )
      setIsLoading(false)
    }
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={64} color="#6B7280" />
          <Text style={styles.permissionTitle}>{t('scanner.cameraPermission')}</Text>
          <Text style={styles.permissionText}>
            {t('scanner.cameraPermissionMessage')}
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>{t('scanner.allowCamera')}</Text>
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
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={isScanning ? handleBarCodeScanned : undefined}
      />

      <View style={styles.overlay}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('refund.title')}</Text>
            <Text style={styles.headerSubtitle}>{t('refund.scanQr')}</Text>
          </View>
          <TouchableOpacity style={styles.headerButton} onPress={() => setTorch(!torch)}>
            <Ionicons name={torch ? 'flash' : 'flash-outline'} size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Scan Area */}
        <View style={styles.scanAreaContainer}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>{t('refund.searchingWallet')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Badge */}
        <View style={styles.instructions}>
          <View style={styles.refundBadge}>
            <Ionicons name="refresh" size={18} color="#D97706" />
            <Text style={styles.refundBadgeText}>{t('refund.refundMode')}</Text>
          </View>
          <View style={styles.contextInfo}>
            <View style={styles.contextItem}>
              <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.contextText} numberOfLines={1}>
                {currentEvent?.name ?? t('scanner.noEvent')}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permissionContainer: {
    flex: 1, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  permissionCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center',
    width: '100%', maxWidth: 320,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8,
  },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginTop: 16 },
  permissionText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  permissionButton: {
    backgroundColor: '#D97706', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginTop: 24,
  },
  permissionButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
  },
  headerButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  scanAreaContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanArea: {
    width: SCAN_AREA_SIZE, height: SCAN_AREA_SIZE, borderRadius: 20,
    backgroundColor: 'transparent', position: 'relative', overflow: 'hidden',
  },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: '#FCD34D', borderWidth: 4 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 20 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 20 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 20 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 20 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', borderRadius: 20,
  },
  loadingText: { color: '#fff', fontSize: 14, marginTop: 12 },
  instructions: { paddingHorizontal: 24, paddingBottom: 48, alignItems: 'center' },
  refundBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.25)', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.5)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16,
  },
  refundBadgeText: { fontSize: 14, fontWeight: '600', color: '#FCD34D' },
  contextInfo: { flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap' },
  contextItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  contextText: { fontSize: 13, color: 'rgba(255,255,255,0.9)', maxWidth: 120 },
})
