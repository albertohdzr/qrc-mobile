import React, { useState } from 'react'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { t } from '@/lib/i18n'

const QUICK_AMOUNTS = [100, 200, 500, 1000]

export default function RechargeScreen() {
  const { currentOrg, currentEvent, canAccessFeature } = useAuthStore()
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')

  // Guard: only admin/owner can access recharge
  if (!canAccessFeature('recharge')) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>{t('recharge.restrictedAccess')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('recharge.restrictedAccessMessage')}
          </Text>
        </View>
      </View>
    )
  }

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount)
    setCustomAmount('')
  }

  const handleCustomAmountChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, '')
    setCustomAmount(numericValue)
    setSelectedAmount(null)
  }

  const activeAmount = selectedAmount ?? (customAmount ? parseInt(customAmount) : 0)

  return (
    <View style={styles.container}>
      {/* Header con contexto */}
      <View style={styles.contextHeader}>
        <TouchableOpacity 
          style={styles.contextButton}
          onPress={() => router.push('/select-org')}
        >
          <Ionicons name="business-outline" size={18} color="#6B7280" />
          <Text style={styles.contextValue} numberOfLines={1}>
            {currentOrg?.name ?? t('common.select')}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.contextButton}
          onPress={() => router.push('/select-event')}
        >
          <Ionicons name="calendar-outline" size={18} color="#6B7280" />
          <Text style={styles.contextValue} numberOfLines={1}>
            {currentEvent?.name ?? t('common.select')}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {!currentOrg || !currentEvent ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>{t('recharge.configRequired')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('recharge.configRequiredMessage')}
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          {/* Scan QR */}
          <TouchableOpacity 
            style={styles.scanCard} 
            activeOpacity={0.8}
            onPress={() => {
              if (activeAmount > 0) {
                router.push({
                  pathname: '/recharge-scanner',
                  params: { amount: activeAmount.toString() },
                })
              } else {
                Alert.alert(t('recharge.amountRequired'), t('recharge.amountRequiredMessage'))
              }
            }}
          >
            <View style={styles.scanIconContainer}>
              <Ionicons name="qr-code" size={32} color="#1F2937" />
            </View>
            <View style={styles.scanTextContainer}>
              <Text style={styles.scanTitle}>{t('recharge.scanWallet')}</Text>
              <Text style={styles.scanSubtitle}>
                {t('recharge.scanWalletSubtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </TouchableOpacity>

          {/* Amount Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('recharge.amountToRecharge')}</Text>
            
            <View style={styles.amountsGrid}>
              {QUICK_AMOUNTS.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[
                    styles.amountButton,
                    selectedAmount === amount && styles.amountButtonActive,
                  ]}
                  onPress={() => handleAmountSelect(amount)}
                >
                  <Text
                    style={[
                      styles.amountButtonText,
                      selectedAmount === amount && styles.amountButtonTextActive,
                    ]}
                  >
                    ${amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.customAmountContainer}>
              <Text style={styles.customAmountLabel}>{t('recharge.otherAmount')}</Text>
              <View style={styles.customAmountInput}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  value={customAmount}
                  onChangeText={handleCustomAmountChange}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contextHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  contextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  contextValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  scanIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTextContainer: {
    flex: 1,
  },
  scanTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  scanSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  amountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  amountButton: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  amountButtonActive: {
    borderColor: '#1F2937',
    backgroundColor: '#1F2937',
  },
  amountButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  amountButtonTextActive: {
    color: '#fff',
  },
  customAmountContainer: {
    marginTop: 16,
  },
  customAmountLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  customAmountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    height: 56,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '600',
    color: '#9CA3AF',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
})
