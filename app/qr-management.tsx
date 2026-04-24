import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { t } from '@/lib/i18n'
import i18n from '@/lib/i18n'

type IconName = keyof typeof Ionicons.glyphMap

const API_URL = process.env.EXPO_PUBLIC_API_URL || ''
const PAGE_SIZE = 30

// ── Types ────────────────────────────────────────────────────

type QrStatus = 'available' | 'assigned' | 'inactive'
type QrType = 'bracelet' | 'card' | 'digital'

interface QrRecord {
  id: string
  code_5: string
  key: string
  type: QrType
  status: QrStatus
  batch_id: string | null
  created_at: string
  manufactured_at: string | null
  wallet: { id: string; name: string | null; phone: string | null } | null
  batch: { id: string; name: string; manufactured_at: string } | null
}

interface QrBatch {
  id: string
  name: string
  notes: string | null
  manufactured_at: string
  created_at: string
  qr_count: number
}

interface QrStats {
  total: number
  available: number
  assigned: number
  inactive: number
}

// ── Label maps ───────────────────────────────────────────────

const getStatusConfig = (): Record<QrStatus, { label: string; icon: IconName; bg: string; text: string }> => ({
  available: { label: t('qrManagement.statusAvailable'), icon: 'checkmark-circle', bg: '#D1FAE5', text: '#059669' },
  assigned: { label: t('qrManagement.statusAssigned'), icon: 'link', bg: '#EEF2FF', text: '#4F46E5' },
  inactive: { label: t('qrManagement.statusInactive'), icon: 'close-circle', bg: '#FEE2E2', text: '#DC2626' },
})

const getTypeConfig = (): Record<QrType, { label: string; icon: IconName }> => ({
  bracelet: { label: t('qrManagement.typeBracelet'), icon: 'watch-outline' },
  card: { label: t('qrManagement.typeCard'), icon: 'card-outline' },
  digital: { label: t('qrManagement.typeDigital'), icon: 'phone-portrait-outline' },
})

// ── API helper ───────────────────────────────────────────────

async function callBatchApi(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error(t('qrManagement.unauthorized'))

  const res = await fetch(`${API_URL}/api/qr-batches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || t('qrManagement.serverError'))
  return data
}

// ── Main Component ───────────────────────────────────────────

export default function QrManagementScreen() {
  const { currentOrg } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'qrs' | 'batches'>('qrs')

  // ── Stats ──
  const [stats, setStats] = useState<QrStats>({ total: 0, available: 0, assigned: 0, inactive: 0 })
  const [statsLoading, setStatsLoading] = useState(true)

  // ── QRs ──
  const [qrs, setQrs] = useState<QrRecord[]>([])
  const [qrsLoading, setQrsLoading] = useState(true)
  const [qrsRefreshing, setQrsRefreshing] = useState(false)
  const [qrPage, setQrPage] = useState(0)
  const [qrTotalCount, setQrTotalCount] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<QrStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<QrType | 'all'>('all')

  // ── Batches ──
  const [batches, setBatches] = useState<QrBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [batchesRefreshing, setBatchesRefreshing] = useState(false)

  // ── Create Batch Modal ──
  const [showCreateBatch, setShowCreateBatch] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [batchForm, setBatchForm] = useState({
    name: '',
    notes: '',
    quantity: '100',
    type: 'bracelet' as QrType,
  })

  // ══════════════════════════════════════════════════════════
  // DATA FETCHING
  // ══════════════════════════════════════════════════════════

  const fetchStats = useCallback(async () => {
    if (!currentOrg) return
    try {
      const [totalRes, availableRes, assignedRes, inactiveRes] = await Promise.all([
        (supabase.from('qrs') as any).select('id', { count: 'exact', head: true }).eq('org_id', currentOrg.id),
        (supabase.from('qrs') as any).select('id', { count: 'exact', head: true }).eq('org_id', currentOrg.id).eq('status', 'available'),
        (supabase.from('qrs') as any).select('id', { count: 'exact', head: true }).eq('org_id', currentOrg.id).eq('status', 'assigned'),
        (supabase.from('qrs') as any).select('id', { count: 'exact', head: true }).eq('org_id', currentOrg.id).eq('status', 'inactive'),
      ])
      setStats({
        total: totalRes.count ?? 0,
        available: availableRes.count ?? 0,
        assigned: assignedRes.count ?? 0,
        inactive: inactiveRes.count ?? 0,
      })
    } catch (err) {
      console.error('Error fetching QR stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }, [currentOrg])

  const fetchQrs = useCallback(async (page = 0, refresh = false) => {
    if (!currentOrg) return
    if (refresh) setQrsRefreshing(true)
    else if (page === 0) setQrsLoading(true)

    try {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let query = (supabase.from('qrs') as any)
        .select(`
          id, code_5, key, type, status, batch_id, created_at, manufactured_at,
          wallet:wallets(id, name, phone),
          batch:qr_batches(id, name, manufactured_at)
        `, { count: 'exact' })
        .eq('org_id', currentOrg.id)

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (typeFilter !== 'all') query = query.eq('type', typeFilter)
      if (searchText.trim()) {
        const term = `%${searchText.trim()}%`
        query = query.or(`code_5.ilike.${term},key.ilike.${term}`)
      }

      query = query.order('created_at', { ascending: false }).range(from, to)

      const { data, error, count } = await query
      if (error) throw error

      setQrs(data ?? [])
      setQrTotalCount(count ?? 0)
      setQrPage(page)
    } catch (err) {
      console.error('Error fetching QRs:', err)
      Alert.alert(t('common.error'), t('qrManagement.couldNotLoadQrs'))
    } finally {
      setQrsLoading(false)
      setQrsRefreshing(false)
    }
  }, [currentOrg, statusFilter, typeFilter, searchText])

  const fetchBatches = useCallback(async (refresh = false) => {
    if (!currentOrg) return
    if (refresh) setBatchesRefreshing(true)
    else setBatchesLoading(true)

    try {
      const { data, error } = await (supabase.from('qr_batches') as any)
        .select('*, qrs(count)')
        .eq('org_id', currentOrg.id)
        .order('manufactured_at', { ascending: false })

      if (error) throw error

      const mapped = (data ?? []).map((b: any) => ({
        ...b,
        qr_count: b.qrs?.[0]?.count ?? 0,
      }))

      setBatches(mapped)
    } catch (err) {
      console.error('Error fetching batches:', err)
      Alert.alert(t('common.error'), t('qrManagement.couldNotLoadBatches'))
    } finally {
      setBatchesLoading(false)
      setBatchesRefreshing(false)
    }
  }, [currentOrg])

  useEffect(() => {
    fetchStats()
    fetchQrs(0)
    fetchBatches()
  }, [fetchStats, fetchQrs, fetchBatches])

  // Refetch QRs when filters change
  useEffect(() => {
    if (!qrsLoading) fetchQrs(0)
  }, [statusFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(qrTotalCount / PAGE_SIZE))

  // ══════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════

  const handleSearch = () => {
    fetchQrs(0)
  }

  const resetBatchForm = () => {
    setBatchForm({ name: '', notes: '', quantity: '100', type: 'bracelet' })
  }

  const handleCreateBatch = async () => {
    if (!currentOrg) return
    const name = batchForm.name.trim()
    const qty = parseInt(batchForm.quantity, 10)

    if (!name) return Alert.alert(t('common.error'), t('qrManagement.batchNameRequired'))
    if (!qty || qty < 1 || qty > 5000) return Alert.alert(t('common.error'), t('qrManagement.batchQtyError'))

    setCreateLoading(true)
    try {
      const result = await callBatchApi({
        orgId: currentOrg.id,
        quantity: qty,
        type: batchForm.type,
        batch: {
          name,
          notes: batchForm.notes.trim() || null,
        },
      })

      Alert.alert(t('qrManagement.success'), t('qrManagement.batchSuccess', { count: result.created.toString(), name }))
      setShowCreateBatch(false)
      resetBatchForm()
      fetchStats()
      fetchBatches()
      if (activeTab === 'qrs') fetchQrs(0)
    } catch (err: any) {
      console.error('Error creating batch:', err)
      Alert.alert(t('common.error'), err.message || t('qrManagement.couldNotCreateBatch'))
    } finally {
      setCreateLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ══════════════════════════════════════════════════════════

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—'
    return new Intl.DateTimeFormat(i18n.locale === 'es' ? 'es-MX' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateString))
  }

  const renderStatCard = (label: string, value: number, icon: IconName, color: string) => (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )

  const renderQrItem = ({ item }: { item: QrRecord }) => {
    const STATUS_CONFIG = getStatusConfig()
    const TYPE_CONFIG = getTypeConfig()
    const sc = STATUS_CONFIG[item.status]
    const tc = TYPE_CONFIG[item.type]
    return (
      <View style={styles.qrCard}>
        <View style={styles.qrTop}>
          <View style={styles.qrCodeContainer}>
            <Text style={styles.qrCode}>{item.code_5}</Text>
            <Text style={styles.qrKey} numberOfLines={1}>{item.key}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Ionicons name={sc.icon} size={12} color={sc.text} />
            <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
          </View>
        </View>
        <View style={styles.qrBottom}>
          <View style={styles.qrMeta}>
            <Ionicons name={tc.icon} size={14} color="#6B7280" />
            <Text style={styles.qrMetaText}>{tc.label}</Text>
          </View>
          {item.batch && (
            <View style={styles.qrMeta}>
              <Ionicons name="layers-outline" size={14} color="#6B7280" />
              <Text style={styles.qrMetaText} numberOfLines={1}>{item.batch.name}</Text>
            </View>
          )}
          {item.wallet && (
            <View style={styles.qrMeta}>
              <Ionicons name="wallet-outline" size={14} color="#6B7280" />
              <Text style={styles.qrMetaText} numberOfLines={1}>
                {item.wallet.name || item.wallet.phone || t('qrManagement.assignedLabel')}
              </Text>
            </View>
          )}
        </View>
      </View>
    )
  }

  const renderBatchItem = ({ item }: { item: QrBatch }) => (
    <View style={styles.batchCard}>
      <View style={styles.batchTop}>
        <View style={styles.batchIconContainer}>
          <Ionicons name="layers" size={22} color="#7C3AED" />
        </View>
        <View style={styles.batchInfo}>
          <Text style={styles.batchName} numberOfLines={1}>{item.name}</Text>
          {item.notes ? (
            <Text style={styles.batchNotes} numberOfLines={1}>{item.notes}</Text>
          ) : null}
          <Text style={styles.batchDate}>{t('qrManagement.manufacturing')}: {formatDate(item.manufactured_at)}</Text>
        </View>
        <View style={styles.batchCountContainer}>
          <Text style={styles.batchCountValue}>{item.qr_count}</Text>
          <Text style={styles.batchCountLabel}>QRs</Text>
        </View>
      </View>
    </View>
  )

  // ══════════════════════════════════════════════════════════
  // FILTER CHIPS
  // ══════════════════════════════════════════════════════════

  const renderFilterChip = (
    label: string,
    isActive: boolean,
    onPress: () => void,
    color?: string,
  ) => (
    <TouchableOpacity
      style={[styles.filterChip, isActive && { backgroundColor: color || '#1F2937', borderColor: color || '#1F2937' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterChipText, isActive && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  )

  // ══════════════════════════════════════════════════════════
  // CREATE BATCH MODAL
  // ══════════════════════════════════════════════════════════

  const renderCreateBatchModal = () => (
    <Modal
      visible={showCreateBatch}
      transparent
      animationType="slide"
      onRequestClose={() => { setShowCreateBatch(false); resetBatchForm() }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => { setShowCreateBatch(false); resetBatchForm() }}
        />
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{t('qrManagement.createBatchTitle')}</Text>
          <Text style={styles.modalSubtitle}>{t('qrManagement.createBatchSubtitle')}</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Batch Name */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>{t('qrManagement.batchName')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('qrManagement.batchNamePlaceholder')}
                placeholderTextColor="#9CA3AF"
                value={batchForm.name}
                onChangeText={t => setBatchForm(prev => ({ ...prev, name: t }))}
                autoCapitalize="sentences"
              />
            </View>

            {/* Notes */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>{t('qrManagement.notes')}</Text>
              <TextInput
                style={[styles.formInput, { minHeight: 60 }]}
                placeholder={t('qrManagement.notesPlaceholder')}
                placeholderTextColor="#9CA3AF"
                value={batchForm.notes}
                onChangeText={t => setBatchForm(prev => ({ ...prev, notes: t }))}
                multiline
              />
            </View>

            {/* Quantity */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>{t('qrManagement.qrQuantity')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder="100"
                placeholderTextColor="#9CA3AF"
                value={batchForm.quantity}
                onChangeText={t => setBatchForm(prev => ({ ...prev, quantity: t.replace(/[^0-9]/g, '') }))}
                keyboardType="number-pad"
              />
              <Text style={styles.formHint}>{t('qrManagement.maxPerBatch')}</Text>
            </View>

            {/* Type Selector */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>{t('qrManagement.qrType')}</Text>
              <View style={styles.typeSelector}>
                {(['bracelet', 'card', 'digital'] as QrType[]).map(type => {
                  const TYPE_CONFIG = getTypeConfig()
                  const tc = TYPE_CONFIG[type]
                  const isSelected = batchForm.type === type
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeSelectorItem,
                        isSelected && { borderColor: '#7C3AED', backgroundColor: '#EDE9FE' },
                      ]}
                      onPress={() => setBatchForm(prev => ({ ...prev, type }))}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={tc.icon}
                        size={18}
                        color={isSelected ? '#7C3AED' : '#9CA3AF'}
                      />
                      <Text style={[
                        styles.typeSelectorText,
                        isSelected && { color: '#7C3AED', fontWeight: '700' },
                      ]}>
                        {tc.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createButton, createLoading && styles.createButtonDisabled]}
              onPress={handleCreateBatch}
              disabled={createLoading}
              activeOpacity={0.8}
            >
              {createLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.createButtonText}>{t('qrManagement.createBatch')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => { setShowCreateBatch(false); resetBatchForm() }}
              disabled={createLoading}
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )

  // ══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════

  if (!currentOrg) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="business-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>{t('qrManagement.noOrg')}</Text>
        <Text style={styles.emptySubtitle}>{t('qrManagement.noOrgMessage')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('qrManagement.title')}</Text>
          <Text style={styles.headerSubtitle}>{currentOrg.name}</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowCreateBatch(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {statsLoading ? (
          <ActivityIndicator size="small" color="#7C3AED" style={{ paddingVertical: 20 }} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
            {renderStatCard(t('qrManagement.total'), stats.total, 'qr-code', '#7C3AED')}
            {renderStatCard(t('qrManagement.available'), stats.available, 'checkmark-circle', '#059669')}
            {renderStatCard(t('qrManagement.assigned'), stats.assigned, 'link', '#4F46E5')}
            {renderStatCard(t('qrManagement.inactive'), stats.inactive, 'close-circle', '#DC2626')}
          </ScrollView>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'qrs' && styles.tabActive]}
          onPress={() => setActiveTab('qrs')}
        >
          <Ionicons name="qr-code-outline" size={16} color={activeTab === 'qrs' ? '#7C3AED' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'qrs' && styles.tabTextActive]}>{t('qrManagement.inventory')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'batches' && styles.tabActive]}
          onPress={() => setActiveTab('batches')}
        >
          <Ionicons name="layers-outline" size={16} color={activeTab === 'batches' ? '#7C3AED' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'batches' && styles.tabTextActive]}>{t('qrManagement.batches')}</Text>
          {batches.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{batches.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* QRs Tab */}
      {activeTab === 'qrs' && (
        <View style={{ flex: 1 }}>
          {/* QR List */}
          {qrsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={styles.loadingText}>{t('qrManagement.loadingQrs')}</Text>
            </View>
          ) : (
            <FlatList
              data={qrs}
              renderItem={renderQrItem}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={qrsRefreshing}
                  onRefresh={() => { fetchQrs(0, true); fetchStats() }}
                  tintColor="#7C3AED"
                />
              }
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              ListHeaderComponent={
                <View style={styles.listHeader}>
                  {/* Search */}
                  <View style={styles.searchInputRow}>
                    <Ionicons name="search" size={18} color="#9CA3AF" />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={t('qrManagement.searchPlaceholder')}
                      placeholderTextColor="#9CA3AF"
                      value={searchText}
                      onChangeText={setSearchText}
                      onSubmitEditing={handleSearch}
                      returnKeyType="search"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {searchText.length > 0 && (
                      <TouchableOpacity onPress={() => { setSearchText(''); setTimeout(() => fetchQrs(0), 100) }}>
                        <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Filters */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow} contentContainerStyle={styles.filtersContent}>
                    {renderFilterChip(t('eventProducts.all'), statusFilter === 'all', () => setStatusFilter('all'))}
                    {renderFilterChip(t('qrManagement.statusAvailable'), statusFilter === 'available', () => setStatusFilter('available'), '#059669')}
                    {renderFilterChip(t('qrManagement.statusAssigned'), statusFilter === 'assigned', () => setStatusFilter('assigned'), '#4F46E5')}
                    {renderFilterChip(t('qrManagement.statusInactive'), statusFilter === 'inactive', () => setStatusFilter('inactive'), '#DC2626')}
                    <View style={styles.filterDivider} />
                    {renderFilterChip(t('qrManagement.typeBracelet'), typeFilter === 'bracelet', () => setTypeFilter(typeFilter === 'bracelet' ? 'all' : 'bracelet'), '#7C3AED')}
                    {renderFilterChip(t('qrManagement.typeCard'), typeFilter === 'card', () => setTypeFilter(typeFilter === 'card' ? 'all' : 'card'), '#7C3AED')}
                    {renderFilterChip(t('qrManagement.typeDigital'), typeFilter === 'digital', () => setTypeFilter(typeFilter === 'digital' ? 'all' : 'digital'), '#7C3AED')}
                  </ScrollView>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="qr-code-outline" size={56} color="#D1D5DB" />
                  <Text style={styles.emptyTitle}>{t('qrManagement.noQrs')}</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchText || statusFilter !== 'all' || typeFilter !== 'all'
                      ? t('qrManagement.noQrsFiltered')
                      : t('qrManagement.createBatchToGenerate')}
                  </Text>
                </View>
              }
              ListFooterComponent={
                qrs.length > 0 ? (
                  <View style={styles.pagination}>
                    <TouchableOpacity
                      style={[styles.pageButton, qrPage === 0 && styles.pageButtonDisabled]}
                      onPress={() => fetchQrs(qrPage - 1)}
                      disabled={qrPage === 0}
                    >
                      <Ionicons name="chevron-back" size={18} color={qrPage === 0 ? '#D1D5DB' : '#374151'} />
                    </TouchableOpacity>
                    <Text style={styles.pageText}>
                      {qrPage + 1} / {totalPages}  •  {qrTotalCount.toLocaleString()} QRs
                    </Text>
                    <TouchableOpacity
                      style={[styles.pageButton, qrPage >= totalPages - 1 && styles.pageButtonDisabled]}
                      onPress={() => fetchQrs(qrPage + 1)}
                      disabled={qrPage >= totalPages - 1}
                    >
                      <Ionicons name="chevron-forward" size={18} color={qrPage >= totalPages - 1 ? '#D1D5DB' : '#374151'} />
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          )}
        </View>
      )}

      {/* Batches Tab */}
      {activeTab === 'batches' && (
        <FlatList
          data={batches}
          renderItem={renderBatchItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={batchesRefreshing}
              onRefresh={() => fetchBatches(true)}
              tintColor="#7C3AED"
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            batchesLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={styles.loadingText}>{t('qrManagement.loadingBatches')}</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="layers-outline" size={56} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>{t('qrManagement.noBatches')}</Text>
                <Text style={styles.emptySubtitle}>{t('qrManagement.noBatchesMessage')}</Text>
                <TouchableOpacity
                  style={[styles.createButton, { marginTop: 16, paddingHorizontal: 24 }]}
                  onPress={() => setShowCreateBatch(true)}
                >
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={styles.createButtonText}>{t('qrManagement.createBatch')}</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      )}

      {renderCreateBatchModal()}
    </View>
  )
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Stats
  statsRow: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  statCard: {
    width: 100,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#7C3AED',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#7C3AED',
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7C3AED',
  },
  // List Header (search + filters)
  listHeader: {
    marginBottom: 12,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
  },
  // Filters
  filtersRow: {
    flexGrow: 0,
    height: 52,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    lineHeight: 18,
  },
  filterDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 4,
  },
  // QR Card
  qrCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  qrTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  qrCodeContainer: {
    flex: 1,
  },
  qrCode: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    fontVariant: ['tabular-nums'],
  },
  qrKey: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  qrBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  qrMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qrMetaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  // Batch Card
  batchCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  batchTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  batchIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchInfo: {
    flex: 1,
  },
  batchName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  batchNotes: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  batchDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  batchCountContainer: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  batchCountValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  batchCountLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  // List
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // Pagination
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 20,
  },
  // Form
  formField: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
  },
  formHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  typeSelectorItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  typeSelectorText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  // States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
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
  },
})
