import { formatCurrency } from '@/lib/api'
import { isValidCode5, parseQrCode } from '@/lib/qr-parser'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Wallet } from '@/types/database'
import { Ionicons } from '@expo/vector-icons'
import { t } from '@/lib/i18n'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import React, { useRef, useState } from 'react'
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

interface WalletWithQr extends Wallet {
  qrs: { code_5: string }[] | null
}

export default function SearchWalletScreen() {
  const { currentOrg, currentEvent, isAdmin } = useAuthStore()
  
  const [permission, requestPermission] = useCameraPermissions()
  const [isScanning, setIsScanning] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [torch, setTorch] = useState(false)
  const [wallet, setWallet] = useState<WalletWithQr | null>(null)
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  
  const isProcessingRef = useRef(false)

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
          [{ text: t('common.retry'), onPress: resetScanner }]
        )
        setIsLoading(false)
        return
      }

      if (!currentOrg || !currentEvent) {
        Alert.alert(t('common.error'), t('searchWallet.selectOrgAndEvent'))
        setIsLoading(false)
        return
      }

      // Buscar wallet
      const { data: qr, error } = await (supabase
        .from('qrs') as any)
        .select(`
          wallet:wallets(
            *,
            qrs(code_5)
          )
        `)
        .eq('org_id', currentOrg.id)
        .eq('code_5', code5)
        .maybeSingle()

      if (error || !qr?.wallet) {
        Alert.alert(
          t('searchWallet.walletNotFound'),
          t('searchWallet.walletNotFoundMessage'),
          [{ text: t('common.retry'), onPress: resetScanner }]
        )
        setIsLoading(false)
        return
      }

      setScannedCode(code5)
      setWallet(qr.wallet as WalletWithQr)
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('searchWallet.searchError'))
    } finally {
      setIsLoading(false)
    }
  }

  const resetScanner = () => {
    isProcessingRef.current = false
    setIsScanning(true)
    setWallet(null)
    setScannedCode(null)
  }

  const handleViewDetails = () => {
    if (wallet) {
      router.replace({
        pathname: '/wallet-details',
        params: { walletId: wallet.id },
      })
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
          <Text style={styles.permissionTitle}>{t('scanner.cameraPermission')}</Text>
          <Text style={styles.permissionText}>
            {t('scanner.cameraPermissionMessage')}
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>{t('scanner.allowCamera')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // Show wallet info after scan
  if (wallet) {
    return (
      <View style={styles.resultContainer}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('searchWallet.walletFound')}</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.walletCard}>
          <View style={[
            styles.walletIconLarge,
            wallet.status === 'blocked' && styles.walletIconBlocked
          ]}>
            <Ionicons 
              name={wallet.status === 'active' ? 'wallet' : 'lock-closed'} 
              size={40} 
              color={wallet.status === 'active' ? '#059669' : '#DC2626'} 
            />
          </View>
          
          <Text style={styles.walletName}>
            {wallet.name || wallet.phone || t('common.noName')}
          </Text>
          
          {wallet.phone && (
            <View style={styles.walletPhoneRow}>
              <Ionicons name="call-outline" size={16} color="#6B7280" />
              <Text style={styles.walletPhone}>{wallet.phone}</Text>
            </View>
          )}

          <Text style={styles.walletBalance}>
            {formatCurrency(wallet.balance_cents)}
          </Text>

          {wallet.status === 'blocked' && (
            <View style={styles.statusBadge}>
              <Ionicons name="lock-closed" size={14} color="#DC2626" />
              <Text style={styles.statusText}>{t('searchWallet.walletBlocked')}</Text>
            </View>
          )}

          <View style={styles.qrBadge}>
            <Ionicons name="qr-code" size={16} color="#6B7280" />
            <Text style={styles.qrText}>QR: {scannedCode}</Text>
          </View>
        </View>

        <View style={styles.actionsContainer}>
          {isAdmin() && (
            <TouchableOpacity 
              style={styles.actionButtonPrimary}
              onPress={handleViewDetails}
            >
              <Ionicons name="eye-outline" size={22} color="#fff" />
              <Text style={styles.actionButtonPrimaryText}>{t('searchWallet.viewDetails')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={styles.actionButtonSecondary}
            onPress={resetScanner}
          >
            <Ionicons name="scan-outline" size={22} color="#1F2937" />
            <Text style={styles.actionButtonSecondaryText}>{t('searchWallet.scanAnother')}</Text>
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

      <View style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButtonLight} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitleLight}>{t('searchWallet.title')}</Text>
          <TouchableOpacity style={styles.headerButtonLight} onPress={() => setTorch(!torch)}>
            <Ionicons name={torch ? 'flash' : 'flash-outline'} size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.scanAreaContainer}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>{t('searchWallet.searching')}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionsText}>
            {t('searchWallet.scanToSearch')}
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
  },
  permissionButton: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 24,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonLight: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerTitleLight: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
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
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#fff',
    borderWidth: 4,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 20 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 20 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 20 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 20 },
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
  },
  instructionsText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  resultContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  walletCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    margin: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  walletIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletIconBlocked: {
    backgroundColor: '#FEE2E2',
  },
  walletName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
  walletPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  walletPhone: {
    fontSize: 14,
    color: '#6B7280',
  },
  walletBalance: {
    fontSize: 40,
    fontWeight: '700',
    color: '#059669',
    marginTop: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
  qrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 16,
    gap: 6,
  },
  qrText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  actionButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  actionButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  actionButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
})
