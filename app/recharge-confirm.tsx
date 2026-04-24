import { formatCurrency } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Ionicons } from '@expo/vector-icons'
import { t } from '@/lib/i18n'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'

export default function RechargeConfirmScreen() {
  const { currentOrg, currentEvent } = useAuthStore()
  const params = useLocalSearchParams<{
    code5: string
    walletId: string
    walletName: string
    walletPhone: string
    currentBalanceCents: string
    amountCents: string
  }>()

  const [isProcessing, setIsProcessing] = useState(false)

  const currentBalanceCents = parseInt(params.currentBalanceCents ?? '0')
  const amountCents = parseInt(params.amountCents ?? '0')
  const newBalanceCents = currentBalanceCents + amountCents

  const handleConfirmRecharge = async () => {
    if (!currentOrg || !currentEvent || !params.walletId) {
      Alert.alert(t('common.error'), t('recharge.incompleteData'))
      return
    }

    setIsProcessing(true)

    try {
      // 1. Crear el movimiento de depósito
      const { data: movement, error: movementError } = await (supabase
        .from('movements') as any)
        .insert({
          org_id: currentOrg.id,
          wallet_id: params.walletId,
          event_id: currentEvent.id,
          type: 'deposit',
          amount_cents: amountCents,
          notes: `Recarga manual - QR: ${params.code5}`,
        })
        .select('id')
        .single()

      if (movementError || !movement) {
        throw new Error(t('recharge.rechargeError'))
      }

      // 2. Actualizar el balance de la wallet
      const { error: walletError } = await (supabase
        .from('wallets') as any)
        .update({ balance_cents: newBalanceCents })
        .eq('id', params.walletId)

      if (walletError) {
        // Rollback: eliminar el movimiento
        await (supabase.from('movements') as any).delete().eq('id', movement.id)
        throw new Error(t('recharge.balanceUpdateError'))
      }

      // Éxito
      Alert.alert(
        t('recharge.rechargeSuccess'),
        t('recharge.rechargeSuccessMessage', { amount: formatCurrency(amountCents), newBalance: formatCurrency(newBalanceCents) }),
        [
          {
            text: t('recharge.newRecharge'),
            onPress: () => {
              router.dismissAll()
              setTimeout(() => router.push('/(tabs)/recharge'), 100)
            },
          },
          {
            text: t('recharge.goHome'),
            onPress: () => {
              router.dismissAll()
              setTimeout(() => router.push('/(tabs)'), 100)
            },
          },
        ]
      )
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('recharge.couldNotProcess'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = () => {
    router.back()
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={handleCancel}>
          <Ionicons name="close" size={28} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('recharge.confirmRecharge')}</Text>
        <View style={styles.closeButton} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Wallet Card */}
        <View style={styles.walletCard}>
          <View style={styles.walletIcon}>
            <Ionicons name="wallet" size={32} color="#059669" />
          </View>
          <Text style={styles.walletName}>
            {params.walletName || params.walletPhone || `QR: ${params.code5}`}
          </Text>
          {params.walletPhone && (
            <Text style={styles.walletPhone}>{params.walletPhone}</Text>
          )}
        </View>

        {/* Amount Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('recharge.currentBalance')}</Text>
            <Text style={styles.detailValue}>
              {formatCurrency(currentBalanceCents)}
            </Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('recharge.amountToRechargeLabel')}</Text>
            <Text style={[styles.detailValue, styles.addAmount]}>
              +{formatCurrency(amountCents)}
            </Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabelBold}>{t('recharge.newBalance')}</Text>
            <Text style={styles.detailValueBold}>
              {formatCurrency(newBalanceCents)}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={isProcessing}
        >
          <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.confirmButton, isProcessing && styles.confirmButtonDisabled]}
          onPress={handleConfirmRecharge}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.confirmButtonText}>
                {t('recharge.rechargeButton', { amount: formatCurrency(amountCents) })}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  walletCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  walletIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  walletPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailLabelBold: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  detailValueBold: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  addAmount: {
    color: '#059669',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
})
