import { formatCurrency } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

const QUICK_AMOUNTS = [0, 100, 200, 500]

export default function CreateWalletScreen() {
  const { currentOrg, currentEvent } = useAuthStore()
  
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedAmount, setSelectedAmount] = useState<number>(0)
  const [customAmount, setCustomAmount] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const activeAmount = selectedAmount > 0 ? selectedAmount : (customAmount ? parseInt(customAmount) : 0)
  const amountCents = activeAmount * 100

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount)
    setCustomAmount('')
  }

  const handleCustomAmountChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, '')
    setCustomAmount(numericValue)
    setSelectedAmount(0)
  }

  const handleCreateWallet = async () => {
    if (!currentOrg || !currentEvent) {
      Alert.alert('Error', 'Selecciona una organización y evento primero')
      return
    }

    if (!name.trim() && !phone.trim()) {
      Alert.alert('Datos requeridos', 'Ingresa al menos un nombre o teléfono')
      return
    }

    setIsCreating(true)

    try {
      // Crear la wallet
      const { data: wallet, error: walletError } = await (supabase
        .from('wallets') as any)
        .insert({
          org_id: currentOrg.id,
          event_id: currentEvent.id,
          name: name.trim() || null,
          phone: phone.trim() || null,
          balance_cents: amountCents,
          status: 'active',
        })
        .select()
        .single()

      if (walletError) {
        console.error('Error creating wallet:', walletError)
        
        // Check for duplicate phone error
        if (walletError.code === '23505') {
          Alert.alert('Error', 'Ya existe una wallet con este teléfono en esta organización')
          setIsCreating(false)
          return
        }
        
        throw walletError
      }

      // Si hay monto inicial, crear movimiento de depósito inicial
      if (amountCents > 0) {
        const { error: movementError } = await (supabase
          .from('movements') as any)
          .insert({
            org_id: currentOrg.id,
            wallet_id: wallet.id,
            event_id: currentEvent.id,
            type: 'initial_deposit',
            amount_cents: amountCents,
            notes: 'Depósito inicial al crear wallet',
          })

        if (movementError) {
          console.error('Error creating initial deposit:', movementError)
          // No hacemos rollback, la wallet ya está creada
        }
      }

      // Navegar al scanner para asociar QR
      router.replace({
        pathname: '/assign-qr',
        params: {
          walletId: wallet.id,
          walletName: wallet.name || wallet.phone || 'Nueva Wallet',
          balanceCents: wallet.balance_cents.toString(),
        },
      })
    } catch (error: any) {
      console.error('Error:', error)
      Alert.alert('Error', error.message || 'No se pudo crear la wallet')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCancel = () => {
    router.back()
  }

  if (!currentOrg || !currentEvent) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Configuración requerida</Text>
        <Text style={styles.emptySubtitle}>
          Selecciona una organización y evento antes de crear wallets
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={handleCancel}>
          <Ionicons name="close" size={28} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nueva Wallet</Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Context */}
        <View style={styles.contextCard}>
          <View style={styles.contextRow}>
            <Ionicons name="business-outline" size={18} color="#6B7280" />
            <Text style={styles.contextText}>{currentOrg.name}</Text>
          </View>
          <View style={styles.contextRow}>
            <Ionicons name="calendar-outline" size={18} color="#6B7280" />
            <Text style={styles.contextText}>{currentEvent.name}</Text>
          </View>
        </View>

        {/* Form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del Cliente</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.input}
                placeholder="Nombre del cliente"
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!isCreating}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Teléfono</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.input}
                placeholder="10 dígitos"
                placeholderTextColor="#9CA3AF"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!isCreating}
              />
            </View>
          </View>
        </View>

        {/* Initial Balance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saldo Inicial (Opcional)</Text>
          
          <View style={styles.amountsGrid}>
            {QUICK_AMOUNTS.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.amountButton,
                  selectedAmount === amount && styles.amountButtonActive,
                ]}
                onPress={() => handleAmountSelect(amount)}
                disabled={isCreating}
              >
                <Text
                  style={[
                    styles.amountButtonText,
                    selectedAmount === amount && styles.amountButtonTextActive,
                  ]}
                >
                  {amount === 0 ? '$0' : `$${amount}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.customAmountContainer}>
            <Text style={styles.customAmountLabel}>Otro monto</Text>
            <View style={styles.customAmountInput}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                value={customAmount}
                onChangeText={handleCustomAmountChange}
                keyboardType="numeric"
                editable={!isCreating}
              />
            </View>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Saldo inicial</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(amountCents)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createButton, isCreating && styles.createButtonDisabled]}
          onPress={handleCreateWallet}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.createButtonText}>Crear y Asignar QR</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F9FAFB',
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
  backButton: {
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 24,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
  },
  contentContainer: {
    padding: 16,
  },
  contextCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 24,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contextText: {
    fontSize: 14,
    color: '#6B7280',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
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
    height: 52,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
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
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  amountButtonActive: {
    borderColor: '#1F2937',
    backgroundColor: '#1F2937',
  },
  amountButtonText: {
    fontSize: 16,
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
    height: 52,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9CA3AF',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#059669',
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
})
