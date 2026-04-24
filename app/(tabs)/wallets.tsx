import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/api'
import { Wallet } from '@/types/database'
import { t } from '@/lib/i18n'

interface WalletWithQr extends Wallet {
  qrs: { code_5: string }[] | null
}

const PAGE_SIZE = 30

export default function WalletsScreen() {
  const { currentOrg, currentEvent, canAccessFeature } = useAuthStore()

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Data
  const [wallets, setWallets] = useState<WalletWithQr[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(0)

  // Stats (from separate lightweight query)
  const [stats, setStats] = useState({ activeCount: 0, totalBalance: 0 })

  // ── Debounce search ─────────────────────────────────────────
  const handleSearchChange = (text: string) => {
    setSearchQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(text.trim())
    }, 400)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ── Load stats (lightweight, no pagination) ─────────────────
  const loadStats = async () => {
    if (!currentOrg || !currentEvent) return

    try {
      // Count active wallets
      const { count: activeCount } = await (supabase
        .from('wallets') as any)
        .select('id', { count: 'exact', head: true })
        .eq('org_id', currentOrg.id)
        .eq('event_id', currentEvent.id)
        .eq('status', 'active')

      // Sum all balances (using a manual approach since supabase-js doesn't have .sum())
      // We fetch just balance_cents for ALL wallets (lightweight — no joins)
      const { data: balanceData } = await (supabase
        .from('wallets') as any)
        .select('balance_cents')
        .eq('org_id', currentOrg.id)
        .eq('event_id', currentEvent.id)

      const totalBalance = (balanceData ?? []).reduce(
        (sum: number, w: any) => sum + (w.balance_cents || 0),
        0
      )

      setStats({
        activeCount: activeCount ?? 0,
        totalBalance,
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  // ── Load wallets (paginated) ────────────────────────────────
  const loadWallets = async (page: number, search: string, append = false) => {
    if (!currentOrg || !currentEvent) return

    if (page === 0 && !append) setIsLoading(true)

    try {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      // If searching, also find wallets by QR code
      let qrWalletIds: string[] = []
      if (search) {
        const { data: qrMatches } = await (supabase
          .from('qrs') as any)
          .select('wallet_id')
          .eq('org_id', currentOrg.id)
          .ilike('code_5', `%${search}%`)

        qrWalletIds = (qrMatches ?? [])
          .map((q: any) => q.wallet_id)
          .filter(Boolean) as string[]
      }

      let query = (supabase
        .from('wallets') as any)
        .select(`*, qrs(code_5)`)
        .eq('org_id', currentOrg.id)
        .eq('event_id', currentEvent.id)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (search) {
        if (qrWalletIds.length > 0) {
          query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,id.in.(${qrWalletIds.join(',')})`)
        } else {
          query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
        }
      }

      const { data, error } = await query

      if (error) throw error

      const newWallets = (data as WalletWithQr[]) ?? []

      if (append) {
        setWallets(prev => [...prev, ...newWallets])
      } else {
        setWallets(newWallets)
      }

      setHasMore(newWallets.length === PAGE_SIZE)
      pageRef.current = page
    } catch (error) {
      console.error('Error loading wallets:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      setIsLoadingMore(false)
    }
  }

  // ── Reset & reload on context/search change ────────────────
  useFocusEffect(
    useCallback(() => {
      pageRef.current = 0
      setHasMore(true)
      loadWallets(0, debouncedSearch)
      loadStats()
    }, [currentOrg, currentEvent, debouncedSearch])
  )

  // ── Pull to refresh ─────────────────────────────────────────
  const handleRefresh = () => {
    setIsRefreshing(true)
    pageRef.current = 0
    setHasMore(true)
    loadWallets(0, debouncedSearch)
    loadStats()
  }

  // ── Infinite scroll ─────────────────────────────────────────
  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore || isLoading) return
    setIsLoadingMore(true)
    loadWallets(pageRef.current + 1, debouncedSearch, true)
  }

  const handleWalletPress = (wallet: WalletWithQr) => {
    router.push({
      pathname: '/wallet-details',
      params: { walletId: wallet.id },
    })
  }

  if (!canAccessFeature('wallets')) {
    return (
      <View style={styles.noAccessContainer}>
        <Ionicons name="lock-closed-outline" size={64} color="#9CA3AF" />
        <Text style={styles.noAccessTitle}>{t('wallets.restrictedAccess')}</Text>
        <Text style={styles.noAccessSubtitle}>
          {t('wallets.restrictedAccessMessage')}
        </Text>
      </View>
    )
  }

  const renderWallet = ({ item }: { item: WalletWithQr }) => {
    const qrCode = item.qrs?.[0]?.code_5
    
    return (
      <TouchableOpacity
        style={styles.walletCard}
        onPress={() => handleWalletPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.walletIcon}>
          <Ionicons 
            name={item.status === 'active' ? 'wallet' : 'lock-closed'} 
            size={24} 
            color={item.status === 'active' ? '#059669' : '#DC2626'} 
          />
        </View>
        <View style={styles.walletInfo}>
          <Text style={styles.walletName} numberOfLines={1}>
            {item.name || item.phone || t('common.noName')}
          </Text>
          <View style={styles.walletMeta}>
            {item.phone && (
              <View style={styles.metaItem}>
                <Ionicons name="call-outline" size={12} color="#9CA3AF" />
                <Text style={styles.metaText}>{item.phone}</Text>
              </View>
            )}
            {qrCode && (
              <View style={styles.metaItem}>
                <Ionicons name="qr-code-outline" size={12} color="#9CA3AF" />
                <Text style={styles.metaText}>{qrCode}</Text>
              </View>
            )}
            {!qrCode && (
              <View style={[styles.metaItem, styles.noQrBadge]}>
                <Text style={styles.noQrText}>{t('common.noQr')}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.walletBalance}>
          <Text style={[
            styles.balanceAmount,
            item.balance_cents === 0 && styles.balanceZero
          ]}>
            {formatCurrency(item.balance_cents)}
          </Text>
          {item.status === 'blocked' && (
            <View style={styles.blockedBadge}>
              <Text style={styles.blockedText}>{t('wallets.blocked')}</Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
      </TouchableOpacity>
    )
  }

  const renderFooter = () => {
    if (!isLoadingMore) return null
    return (
      <View style={styles.loadMoreContainer}>
        <ActivityIndicator size="small" color="#6B7280" />
        <Text style={styles.loadMoreText}>{t('common.loadingMore')}</Text>
      </View>
    )
  }

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
          <Text style={styles.emptyTitle}>{t('wallets.configRequired')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('wallets.configRequiredMessage')}
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('wallets.searchPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={handleSearchChange}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setDebouncedSearch('') }}>
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Create Button */}
          <TouchableOpacity 
            style={styles.createButton} 
            activeOpacity={0.8}
            onPress={() => router.push('/create-wallet')}
          >
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.createButtonText}>{t('wallets.createNew')}</Text>
          </TouchableOpacity>

          {/* Stats */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.activeCount}</Text>
              <Text style={styles.statLabel}>{t('wallets.activeWallets')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatCurrency(stats.totalBalance)}</Text>
              <Text style={styles.statLabel}>{t('wallets.totalBalance')}</Text>
            </View>
          </View>

          {/* Wallets List */}
          {isLoading ? (
            <ActivityIndicator size="large" color="#1F2937" style={styles.loader} />
          ) : wallets.length === 0 ? (
            <View style={styles.listEmptyState}>
              <Ionicons name="wallet-outline" size={48} color="#D1D5DB" />
              <Text style={styles.listEmptyText}>
                {searchQuery ? t('wallets.noWalletsFound') : t('wallets.noWalletsForEvent')}
              </Text>
              <Text style={styles.listEmptySubtext}>
                {searchQuery ? t('wallets.tryAnotherSearch') : t('wallets.createToStart')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={wallets}
              renderItem={renderWallet}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              ListFooterComponent={renderFooter}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor="#1F2937"
                />
              }
            />
          )}
        </View>
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
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F9FAFB',
  },
  noAccessTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  noAccessSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  loader: {
    marginTop: 40,
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  walletIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletInfo: {
    flex: 1,
  },
  walletName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  walletMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  noQrBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noQrText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#D97706',
  },
  walletBalance: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  balanceZero: {
    color: '#9CA3AF',
  },
  blockedBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  blockedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#DC2626',
  },
  listEmptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    marginTop: 24,
  },
  listEmptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
  },
  listEmptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  loadMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadMoreText: {
    fontSize: 13,
    color: '#6B7280',
  },
})
