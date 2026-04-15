import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/api'

const API_URL = process.env.EXPO_PUBLIC_API_URL || ''

// ── Types ────────────────────────────────────────────────────

interface MovementItemDetail {
  id: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  event_product_id: string
  base_product: { id: string; name: string } | null
}

interface PaymentMovement {
  id: string
  amount_cents: number
  created_at: string
  notes: string | null
  items: MovementItemDetail[]
  /** How many units of each item have already been refunded */
  refundedQtyMap: Map<string, number>
}

// ── API helper ───────────────────────────────────────────────

async function callRefundApi(walletId: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('No autorizado. Inicia sesión de nuevo.')

  const res = await fetch(`${API_URL}/api/wallets/${walletId}/refunds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error del servidor.')
  return data
}

// ── Main Component ───────────────────────────────────────────

export default function RefundScreen() {
  const { currentOrg } = useAuthStore()
  const params = useLocalSearchParams<{
    walletId: string
    walletName: string
    walletPhone: string
    balanceCents: string
    code5: string
  }>()

  const walletId = params.walletId
  const walletName = params.walletName || null
  const walletPhone = params.walletPhone || null
  const walletBalance = parseInt(params.balanceCents || '0', 10)
  const code5 = params.code5

  const [payments, setPayments] = useState<PaymentMovement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Selection state: itemId → quantity to refund
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refundQty, setRefundQty] = useState<Map<string, number>>(new Map())

  // Confirm modal
  const [showConfirm, setShowConfirm] = useState(false)
  const [reason, setReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // ══════════════════════════════════════════════════════════
  // DATA FETCHING
  // ══════════════════════════════════════════════════════════

  const loadPayments = useCallback(async (showLoader = true) => {
    if (!walletId) return
    if (showLoader) setIsLoading(true)

    try {
      // Fetch payment movements with their items
      const { data: movementsData, error: movementsError } = await (supabase
        .from('movements') as any)
        .select(`
          id, amount_cents, created_at, notes,
          movement_items(
            id, quantity, unit_price_cents, line_total_cents, event_product_id,
            base_product:products(id, name)
          )
        `)
        .eq('wallet_id', walletId)
        .eq('type', 'payment')
        .order('created_at', { ascending: false })
        .limit(50)

      if (movementsError) throw movementsError

      // Get all movement_item ids across all payments
      const allItemIds = (movementsData ?? []).flatMap(
        (m: any) => (m.movement_items ?? []).map((item: any) => item.id)
      )

      // Fetch existing refund quantities for each item
      const refundedQtyMap = new Map<string, number>()

      if (allItemIds.length > 0) {
        const { data: refundedData } = await (supabase
          .from('refund_items') as any)
          .select('original_movement_item_id, quantity')
          .in('original_movement_item_id', allItemIds)

        for (const r of (refundedData ?? [])) {
          const prev = refundedQtyMap.get(r.original_movement_item_id) ?? 0
          refundedQtyMap.set(r.original_movement_item_id, prev + (r.quantity ?? 0))
        }
      }

      const mapped: PaymentMovement[] = (movementsData ?? []).map((m: any) => ({
        id: m.id,
        amount_cents: m.amount_cents,
        created_at: m.created_at,
        notes: m.notes,
        items: (m.movement_items ?? []).map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          line_total_cents: item.line_total_cents,
          event_product_id: item.event_product_id,
          base_product: item.base_product,
        })),
        refundedQtyMap,
      }))

      setPayments(mapped)
    } catch (err) {
      console.error('Error loading payments:', err)
      Alert.alert('Error', 'No se pudieron cargar las transacciones.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [walletId])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  // ══════════════════════════════════════════════════════════
  // QUANTITY HELPERS
  // ══════════════════════════════════════════════════════════

  const getAvailableQty = (payment: PaymentMovement, item: MovementItemDetail) => {
    const refunded = payment.refundedQtyMap.get(item.id) ?? 0
    return Math.max(0, item.quantity - refunded)
  }

  const getRefundQty = (itemId: string) => refundQty.get(itemId) ?? 0

  const setItemRefundQty = (itemId: string, qty: number) => {
    setRefundQty(prev => {
      const next = new Map(prev)
      if (qty <= 0) {
        next.delete(itemId)
      } else {
        next.set(itemId, qty)
      }
      return next
    })
  }

  const selectAllItems = (payment: PaymentMovement) => {
    setRefundQty(prev => {
      const next = new Map(prev)
      for (const item of payment.items) {
        const available = getAvailableQty(payment, item)
        if (available > 0) {
          next.set(item.id, available)
        }
      }
      return next
    })
  }

  const deselectAllItems = (payment: PaymentMovement) => {
    setRefundQty(prev => {
      const next = new Map(prev)
      for (const item of payment.items) {
        next.delete(item.id)
      }
      return next
    })
  }

  // ══════════════════════════════════════════════════════════
  // COMPUTED VALUES
  // ══════════════════════════════════════════════════════════

  // Items that have a refund quantity set
  const selectedEntries = Array.from(refundQty.entries()).filter(([_, qty]) => qty > 0)
  const hasSelection = selectedEntries.length > 0

  // Total refund amount
  const totalRefundCents = (() => {
    let total = 0
    for (const [itemId, qty] of selectedEntries) {
      for (const p of payments) {
        const item = p.items.find(i => i.id === itemId)
        if (item) {
          total += item.unit_price_cents * qty
          break
        }
      }
    }
    return total
  })()

  // Find which payment the selected items belong to (must be same payment)
  const selectedPaymentId = (() => {
    const paymentIds = new Set<string>()
    for (const [itemId] of selectedEntries) {
      for (const p of payments) {
        if (p.items.some(i => i.id === itemId)) {
          paymentIds.add(p.id)
          break
        }
      }
    }
    if (paymentIds.size === 1) return Array.from(paymentIds)[0]
    return null
  })()

  // Build selected items list for display
  const selectedItemsList: { item: MovementItemDetail; qty: number }[] = []
  for (const [itemId, qty] of selectedEntries) {
    for (const p of payments) {
      const item = p.items.find(i => i.id === itemId)
      if (item) {
        selectedItemsList.push({ item, qty })
        break
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // REFUND HANDLER
  // ══════════════════════════════════════════════════════════

  const handleRefund = async () => {
    if (!walletId || !selectedPaymentId || !hasSelection) return
    if (reason.trim().length < 3) {
      return Alert.alert('Error', 'La razón debe tener al menos 3 caracteres.')
    }

    setIsProcessing(true)
    try {
      const result = await callRefundApi(walletId, {
        movementId: selectedPaymentId,
        reason: reason.trim(),
        items: selectedEntries.map(([itemId, quantity]) => ({ itemId, quantity })),
      })

      Alert.alert(
        '¡Reembolso Exitoso!',
        `Se reembolsaron ${formatCurrency(result.refundedCents ?? totalRefundCents)}.\n\nNuevo saldo: ${formatCurrency(result.newBalanceCents ?? (walletBalance + totalRefundCents))}`,
        [
          {
            text: 'Nuevo Reembolso',
            onPress: () => {
              router.replace('/refund-scanner')
            },
          },
          {
            text: 'Volver al Inicio',
            onPress: () => {
              router.dismissAll()
            },
          },
        ]
      )
    } catch (err: any) {
      console.error('Error processing refund:', err)
      Alert.alert('Error', err.message || 'No se pudo procesar el reembolso.')
    } finally {
      setIsProcessing(false)
      setShowConfirm(false)
    }
  }

  // ══════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ══════════════════════════════════════════════════════════

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderPayment = ({ item: payment }: { item: PaymentMovement }) => {
    const isExpanded = expandedId === payment.id
    const selectableItems = payment.items.filter(i => getAvailableQty(payment, i) > 0)
    const allFullyRefunded = selectableItems.length === 0

    const allMaxSelected = selectableItems.length > 0 && selectableItems.every(
      i => getRefundQty(i.id) === getAvailableQty(payment, i)
    )
    const someSelected = payment.items.some(i => getRefundQty(i.id) > 0)

    // If items from another payment are selected, dim this one
    const otherPaymentSelected = selectedPaymentId !== null && selectedPaymentId !== payment.id

    return (
      <View style={[
        styles.paymentCard,
        allFullyRefunded && styles.paymentCardRefunded,
        otherPaymentSelected && styles.paymentCardDisabled,
      ]}>
        {/* Payment Header */}
        <TouchableOpacity
          style={styles.paymentHeader}
          onPress={() => {
            if (otherPaymentSelected) return
            setExpandedId(isExpanded ? null : payment.id)
          }}
          activeOpacity={otherPaymentSelected ? 1 : 0.7}
        >
          <View style={[styles.paymentIcon, allFullyRefunded && styles.paymentIconRefunded]}>
            <Ionicons
              name={allFullyRefunded ? 'checkmark-circle' : 'cart'}
              size={20}
              color={allFullyRefunded ? '#9CA3AF' : '#DC2626'}
            />
          </View>
          <View style={styles.paymentInfo}>
            <Text style={[styles.paymentAmount, allFullyRefunded && styles.paymentAmountRefunded]}>
              {formatCurrency(payment.amount_cents)}
            </Text>
            <Text style={styles.paymentDate}>{formatDate(payment.created_at)}</Text>
            <Text style={styles.paymentItemsPreview} numberOfLines={1}>
              {payment.items.map(i => i.base_product?.name || 'Producto').join(', ')}
            </Text>
          </View>
          <View style={styles.paymentRight}>
            {allFullyRefunded ? (
              <View style={styles.refundedBadge}>
                <Text style={styles.refundedBadgeText}>Reembolsado</Text>
              </View>
            ) : (
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#9CA3AF"
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Expanded Items */}
        {isExpanded && !allFullyRefunded && (
          <View style={styles.itemsContainer}>
            {/* Select / Deselect All */}
            <TouchableOpacity
              style={styles.selectAllRow}
              onPress={() => allMaxSelected ? deselectAllItems(payment) : selectAllItems(payment)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.checkbox,
                allMaxSelected && styles.checkboxChecked,
                someSelected && !allMaxSelected && styles.checkboxPartial,
              ]}>
                {allMaxSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                {someSelected && !allMaxSelected && <View style={styles.checkboxDash} />}
              </View>
              <Text style={styles.selectAllText}>
                {allMaxSelected ? 'Deseleccionar todos' : 'Seleccionar todos (cantidad completa)'}
              </Text>
            </TouchableOpacity>

            {/* Individual Items */}
            {payment.items.map(item => {
              const available = getAvailableQty(payment, item)
              const refunded = payment.refundedQtyMap.get(item.id) ?? 0
              const currentQty = getRefundQty(item.id)
              const isFullyRefunded = available === 0
              const isSelected = currentQty > 0

              return (
                <View
                  key={item.id}
                  style={[styles.itemRow, isFullyRefunded && styles.itemRowRefunded]}
                >
                  {/* Left: checkbox / disabled marker */}
                  <TouchableOpacity
                    onPress={() => {
                      if (isFullyRefunded) return
                      if (isSelected) {
                        setItemRefundQty(item.id, 0)
                      } else {
                        setItemRefundQty(item.id, available)
                      }
                    }}
                    disabled={isFullyRefunded}
                    style={{ padding: 2 }}
                  >
                    <View style={[
                      styles.checkbox,
                      isFullyRefunded && styles.checkboxDisabled,
                      isSelected && styles.checkboxChecked,
                    ]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      {isFullyRefunded && <Ionicons name="close" size={14} color="#D1D5DB" />}
                    </View>
                  </TouchableOpacity>

                  {/* Center: item info */}
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, isFullyRefunded && styles.itemNameRefunded]} numberOfLines={1}>
                      {item.base_product?.name || 'Producto'}
                    </Text>
                    <Text style={styles.itemDetail}>
                      {item.quantity}x {formatCurrency(item.unit_price_cents)}
                      {refunded > 0 && !isFullyRefunded && (
                        ` · ${refunded} ya reembolsado(s)`
                      )}
                    </Text>
                    {isFullyRefunded && (
                      <Text style={styles.itemRefundedLabel}>
                        {refunded}/{item.quantity} reembolsado(s)
                      </Text>
                    )}
                  </View>

                  {/* Right: quantity stepper or amount */}
                  {!isFullyRefunded && isSelected ? (
                    <View style={styles.qtyStepperContainer}>
                      <View style={styles.qtyStepper}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => setItemRefundQty(item.id, currentQty - 1)}
                        >
                          <Ionicons name="remove" size={16} color="#1F2937" />
                        </TouchableOpacity>
                        <Text style={styles.qtyValue}>{currentQty}</Text>
                        <TouchableOpacity
                          style={[styles.qtyBtn, currentQty >= available && styles.qtyBtnDisabled]}
                          onPress={() => {
                            if (currentQty < available) setItemRefundQty(item.id, currentQty + 1)
                          }}
                          disabled={currentQty >= available}
                        >
                          <Ionicons name="add" size={16} color={currentQty >= available ? '#D1D5DB' : '#1F2937'} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.qtyAmount}>
                        {formatCurrency(item.unit_price_cents * currentQty)}
                      </Text>
                    </View>
                  ) : !isFullyRefunded ? (
                    <Text style={styles.itemAmount}>
                      {formatCurrency(item.line_total_cents)}
                    </Text>
                  ) : (
                    <Text style={styles.itemAmountRefunded}>
                      {formatCurrency(item.line_total_cents)}
                    </Text>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </View>
    )
  }

  // ══════════════════════════════════════════════════════════
  // CONFIRM MODAL
  // ══════════════════════════════════════════════════════════

  const renderConfirmModal = () => (
    <Modal
      visible={showConfirm}
      transparent
      animationType="slide"
      onRequestClose={() => setShowConfirm(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setShowConfirm(false)}
        />
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Confirmar Reembolso</Text>

          {/* Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Wallet</Text>
              <Text style={styles.summaryValue}>{walletName || walletPhone || `QR: ${code5}`}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Items</Text>
              <Text style={styles.summaryValue}>
                {selectedItemsList.reduce((sum, s) => sum + s.qty, 0)} unidad(es)
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowTotal]}>
              <Text style={styles.summaryTotalLabel}>Total a reembolsar</Text>
              <Text style={styles.summaryTotalValue}>{formatCurrency(totalRefundCents)}</Text>
            </View>
          </View>

          {/* Products list */}
          <View style={styles.summaryProducts}>
            {selectedItemsList.map(({ item, qty }) => (
              <Text key={item.id} style={styles.summaryProductText}>
                • {qty}x {item.base_product?.name || 'Producto'} — {formatCurrency(item.unit_price_cents * qty)}
              </Text>
            ))}
          </View>

          {/* Reason */}
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Razón del reembolso *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Ej: Producto no entregado"
              placeholderTextColor="#9CA3AF"
              value={reason}
              onChangeText={setReason}
              multiline
              autoCapitalize="sentences"
            />
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={[styles.confirmButton, (isProcessing || reason.trim().length < 3) && styles.confirmButtonDisabled]}
            onPress={handleRefund}
            disabled={isProcessing || reason.trim().length < 3}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.confirmButtonText}>Reembolsar {formatCurrency(totalRefundCents)}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowConfirm(false)}
            disabled={isProcessing}
          >
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )

  // ══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Reembolso</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Wallet Info */}
      <View style={styles.walletCard}>
        <View style={styles.walletIconContainer}>
          <Ionicons name="wallet" size={24} color="#D97706" />
        </View>
        <View style={styles.walletInfo}>
          <Text style={styles.walletName}>
            {walletName || walletPhone || `QR: ${code5}`}
          </Text>
          <Text style={styles.walletBalance}>
            Saldo: {formatCurrency(walletBalance)}
          </Text>
        </View>
        <View style={styles.walletQrBadge}>
          <Text style={styles.walletQrText}>{code5}</Text>
        </View>
      </View>

      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Ionicons name="receipt-outline" size={18} color="#374151" />
        <Text style={styles.sectionTitle}>Transacciones de pago</Text>
        <Text style={styles.sectionCount}>{payments.length}</Text>
      </View>

      {/* Payments List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D97706" />
          <Text style={styles.loadingText}>Cargando transacciones...</Text>
        </View>
      ) : (
        <FlatList
          data={payments}
          renderItem={renderPayment}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { setIsRefreshing(true); loadPayments(false) }}
              tintColor="#D97706"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={56} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>Sin pagos</Text>
              <Text style={styles.emptySubtitle}>Esta wallet no tiene transacciones de pago</Text>
            </View>
          }
        />
      )}

      {/* Footer - shows when items are selected */}
      {hasSelection && (
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.footerLabel}>
              {selectedItemsList.reduce((s, e) => s + e.qty, 0)} unidad(es) seleccionadas
            </Text>
            <Text style={styles.footerAmount}>{formatCurrency(totalRefundCents)}</Text>
          </View>
          {selectedPaymentId ? (
            <TouchableOpacity
              style={styles.refundButton}
              onPress={() => setShowConfirm(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.refundButtonText}>Reembolsar</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.warningBadge}>
              <Ionicons name="warning" size={16} color="#D97706" />
              <Text style={styles.warningText}>Solo una transacción a la vez</Text>
            </View>
          )}
        </View>
      )}

      {renderConfirmModal()}
    </View>
  )
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 12,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  // Wallet Card
  walletCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', margin: 16, marginBottom: 0,
    borderRadius: 16, padding: 16, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  walletIconContainer: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center',
  },
  walletInfo: { flex: 1 },
  walletName: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  walletBalance: { fontSize: 14, color: '#059669', fontWeight: '500', marginTop: 2 },
  walletQrBadge: {
    backgroundColor: '#F3F4F6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  walletQrText: {
    fontSize: 14, fontWeight: '700', color: '#374151',
    fontVariant: ['tabular-nums'],
  },
  // Section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#374151', flex: 1 },
  sectionCount: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  // Payment Card
  paymentCard: {
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    overflow: 'hidden',
  },
  paymentCardRefunded: { opacity: 0.6 },
  paymentCardDisabled: { opacity: 0.4 },
  paymentHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
  },
  paymentIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center',
  },
  paymentIconRefunded: { backgroundColor: '#F3F4F6' },
  paymentInfo: { flex: 1 },
  paymentAmount: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  paymentAmountRefunded: { color: '#9CA3AF' },
  paymentDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  paymentItemsPreview: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  paymentRight: { alignItems: 'flex-end' },
  refundedBadge: {
    backgroundColor: '#F3F4F6', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  refundedBadgeText: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  // Items
  itemsContainer: {
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
    paddingHorizontal: 14, paddingBottom: 14,
  },
  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  selectAllText: { fontSize: 13, fontWeight: '600', color: '#7C3AED' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  checkboxPartial: { borderColor: '#7C3AED' },
  checkboxDash: { width: 10, height: 2, backgroundColor: '#7C3AED', borderRadius: 1 },
  checkboxDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  itemRowRefunded: { opacity: 0.5 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
  itemNameRefunded: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  itemDetail: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  itemRefundedLabel: { fontSize: 10, color: '#D97706', fontWeight: '500', marginTop: 2 },
  itemAmount: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  itemAmountRefunded: { fontSize: 14, fontWeight: '600', color: '#9CA3AF', textDecorationLine: 'line-through' },
  // Quantity Stepper
  qtyStepperContainer: { alignItems: 'flex-end', gap: 4 },
  qtyStepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F4F6', borderRadius: 10, padding: 2,
  },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 1, elevation: 1,
  },
  qtyBtnDisabled: { backgroundColor: '#F3F4F6', shadowOpacity: 0 },
  qtyValue: {
    fontSize: 15, fontWeight: '700', color: '#1F2937',
    minWidth: 28, textAlign: 'center',
  },
  qtyAmount: { fontSize: 13, fontWeight: '600', color: '#D97706' },
  // List
  listContent: { padding: 16, paddingBottom: 120 },
  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  footerInfo: { flex: 1 },
  footerLabel: { fontSize: 13, color: '#6B7280' },
  footerAmount: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginTop: 2 },
  refundButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#D97706', borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  refundButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  warningBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF3C7', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  warningText: { fontSize: 12, fontWeight: '500', color: '#92400E' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 16 },
  summaryCard: {
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6,
  },
  summaryRowTotal: {
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    marginTop: 6, paddingTop: 12,
  },
  summaryLabel: { fontSize: 13, color: '#6B7280' },
  summaryValue: { fontSize: 13, fontWeight: '500', color: '#1F2937' },
  summaryTotalLabel: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  summaryTotalValue: { fontSize: 18, fontWeight: '700', color: '#D97706' },
  summaryProducts: { marginBottom: 16 },
  summaryProductText: { fontSize: 13, color: '#6B7280', lineHeight: 22 },
  // Form
  formField: { marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  formInput: {
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1F2937', minHeight: 60,
  },
  confirmButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#D97706', borderRadius: 14, paddingVertical: 16,
  },
  confirmButtonDisabled: { opacity: 0.5 },
  confirmButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelButton: {
    alignItems: 'center', paddingVertical: 14, marginTop: 8,
    borderRadius: 12, backgroundColor: '#F3F4F6',
  },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  // States
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText: { fontSize: 14, color: '#6B7280' },
  emptyContainer: {
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8 },
})
