import { formatCurrency } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Movement, MovementType, Wallet } from '@/types/database'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

interface WalletWithQr extends Wallet {
  qrs: { id: string; code_5: string; status: string }[] | null
}

interface MovementWithItems extends Movement {
  movement_items: {
    quantity: number
    line_total_cents: number
    base_product: { name: string } | null
  }[] | null
}

export default function WalletDetailsScreen() {
  const { walletId } = useLocalSearchParams<{ walletId: string }>()
  
  const [wallet, setWallet] = useState<WalletWithQr | null>(null)
  const [movements, setMovements] = useState<MovementWithItems[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    loadData()
  }, [walletId])

  const loadData = async (showLoader = true) => {
    if (!walletId) return

    if (showLoader) setIsLoading(true)

    try {
      // Load wallet
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select(`
          *,
          qrs(id, code_5, status)
        `)
        .eq('id', walletId)
        .single()

      if (walletError) throw walletError
      setWallet(walletData as WalletWithQr)

      // Load movements
      const { data: movementsData, error: movementsError } = await supabase
        .from('movements')
        .select(`
          *,
          movement_items(
            quantity,
            line_total_cents,
            base_product:products(name)
          )
        `)
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (movementsError) throw movementsError
      setMovements((movementsData as MovementWithItems[]) ?? [])
    } catch (error) {
      console.error('Error loading wallet:', error)
      Alert.alert('Error', 'No se pudo cargar la wallet')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    loadData(false)
  }

  const handleToggleStatus = async () => {
    if (!wallet) return

    const newStatus = wallet.status === 'active' ? 'blocked' : 'active'
    const action = newStatus === 'blocked' ? 'bloquear' : 'desbloquear'

    Alert.alert(
      `${newStatus === 'blocked' ? 'Bloquear' : 'Desbloquear'} Wallet`,
      `¿Estás seguro de que quieres ${action} esta wallet?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: newStatus === 'blocked' ? 'Bloquear' : 'Desbloquear',
          style: newStatus === 'blocked' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const { error } = await (supabase
                .from('wallets') as any)
                .update({ status: newStatus })
                .eq('id', wallet.id)

              if (error) throw error

              setWallet({ ...wallet, status: newStatus })
              Alert.alert('Éxito', `Wallet ${newStatus === 'blocked' ? 'bloqueada' : 'desbloqueada'}`)
            } catch (error) {
              Alert.alert('Error', 'No se pudo actualizar el estado')
            }
          },
        },
      ]
    )
  }

  const getMovementIcon = (type: MovementType): { name: keyof typeof Ionicons.glyphMap; color: string; bg: string } => {
    switch (type) {
      case 'payment':
        return { name: 'cart', color: '#DC2626', bg: '#FEE2E2' }
      case 'deposit':
        return { name: 'add-circle', color: '#059669', bg: '#D1FAE5' }
      case 'initial_deposit':
        return { name: 'gift', color: '#7C3AED', bg: '#EDE9FE' }
      case 'refund':
        return { name: 'refresh', color: '#D97706', bg: '#FEF3C7' }
      case 'transfer_out':
        return { name: 'arrow-up-circle', color: '#DC2626', bg: '#FEE2E2' }
      case 'transfer_in':
        return { name: 'arrow-down-circle', color: '#059669', bg: '#D1FAE5' }
      default:
        return { name: 'help-circle', color: '#6B7280', bg: '#F3F4F6' }
    }
  }

  const getMovementLabel = (type: MovementType): string => {
    switch (type) {
      case 'payment':
        return 'Pago'
      case 'deposit':
        return 'Recarga'
      case 'initial_deposit':
        return 'Depósito Inicial'
      case 'refund':
        return 'Reembolso'
      case 'transfer_out':
        return 'Transferencia Enviada'
      case 'transfer_in':
        return 'Transferencia Recibida'
      default:
        return type
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderMovement = ({ item }: { item: MovementWithItems }) => {
    const icon = getMovementIcon(item.type)
    const isDebit = item.type === 'payment' || item.type === 'transfer_out'
    
    // Get items summary
    const itemsSummary = item.movement_items
      ?.map(mi => `${mi.quantity}x ${mi.base_product?.name || 'Producto'}`)
      .join(', ')

    return (
      <View style={styles.movementCard}>
        <View style={[styles.movementIcon, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={20} color={icon.color} />
        </View>
        <View style={styles.movementInfo}>
          <Text style={styles.movementType}>{getMovementLabel(item.type)}</Text>
          <Text style={styles.movementDate}>{formatDate(item.created_at)}</Text>
          {itemsSummary && (
            <Text style={styles.movementItems} numberOfLines={1}>
              {itemsSummary}
            </Text>
          )}
          {item.notes && (
            <Text style={styles.movementNotes} numberOfLines={1}>
              {item.notes}
            </Text>
          )}
        </View>
        <Text style={[
          styles.movementAmount,
          isDebit ? styles.amountDebit : styles.amountCredit
        ]}>
          {isDebit ? '-' : '+'}{formatCurrency(item.amount_cents)}
        </Text>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1F2937" />
      </View>
    )
  }

  if (!wallet) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#DC2626" />
        <Text style={styles.errorText}>Wallet no encontrada</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const qr = wallet.qrs?.[0]

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalles de Wallet</Text>
        <TouchableOpacity style={styles.headerButton} onPress={handleToggleStatus}>
          <Ionicons 
            name={wallet.status === 'active' ? 'lock-open-outline' : 'lock-closed-outline'} 
            size={24} 
            color={wallet.status === 'active' ? '#1F2937' : '#DC2626'} 
          />
        </TouchableOpacity>
      </View>

      <FlatList
        data={movements}
        renderItem={renderMovement}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={() => (
          <>
            {/* Wallet Info Card */}
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
                {wallet.name || 'Sin nombre'}
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
                  <Text style={styles.statusText}>Wallet Bloqueada</Text>
                </View>
              )}

              {/* QR Info */}
              <View style={styles.qrSection}>
                {qr ? (
                  <View style={styles.qrInfo}>
                    <Ionicons name="qr-code" size={20} color="#6B7280" />
                    <Text style={styles.qrCode}>QR: {qr.code_5}</Text>
                  </View>
                ) : (
                  <View style={styles.noQrInfo}>
                    <Ionicons name="qr-code-outline" size={20} color="#D97706" />
                    <Text style={styles.noQrText}>Sin QR asignado</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Actions */}
            {!qr && (
              <View style={styles.actionsRow}>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => router.push({
                    pathname: '/assign-qr',
                    params: {
                      walletId: wallet.id,
                      walletName: wallet.name || wallet.phone || 'Wallet',
                      balanceCents: wallet.balance_cents.toString(),
                    },
                  })}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="qr-code" size={22} color="#4F46E5" />
                  </View>
                  <Text style={styles.actionText}>Asignar QR</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Movements Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Movimientos</Text>
              <Text style={styles.sectionCount}>{movements.length}</Text>
            </View>
          </>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyMovements}>
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>Sin movimientos</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#1F2937"
          />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F9FAFB',
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
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
  headerButton: {
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
  listContent: {
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
    fontSize: 36,
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
  qrSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    width: '100%',
  },
  qrInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  qrCode: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  noQrInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  noQrText: {
    fontSize: 14,
    color: '#D97706',
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  sectionCount: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  movementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  movementIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  movementInfo: {
    flex: 1,
  },
  movementType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  movementDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  movementItems: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  movementNotes: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 2,
  },
  movementAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  amountCredit: {
    color: '#059669',
  },
  amountDebit: {
    color: '#DC2626',
  },
  emptyMovements: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
  },
})
