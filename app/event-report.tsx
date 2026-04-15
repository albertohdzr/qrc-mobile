import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { Event } from '@/types/database'

type IconName = keyof typeof Ionicons.glyphMap

const SCREEN_WIDTH = Dimensions.get('window').width

// ─── Types ──────────────────────────────────────────────
interface ReportTotals {
  sales_cents: number
  sales_items: number
  sales_transactions: number
  deposits_cents: number
  refunds_cents: number
  net_cents: number
  transactions_count: number
}

interface DailyData {
  date: string
  sales_cents: number
  sales_items: number
  deposits_cents: number
  refunds_cents: number
  net_cents: number
  transactions_count: number
  sales_count: number
  deposits_count: number
  refunds_count: number
}

interface ProductData {
  id: string
  name: string
  quantity: number
  sales_cents: number
  refunds_cents: number
  net_cents: number
}

interface AreaData {
  id: string | null
  name: string
  quantity: number
  sales_cents: number
  refunds_cents: number
  net_cents: number
}

interface PaymentMethodData {
  method: string
  sales_cents: number
  transactions_count: number
}

interface CashierData {
  id: string
  name: string
  email: string
  items_count: number
  sales_cents: number
  transactions_count: number
}

interface EventReport {
  totals: ReportTotals
  daily: DailyData[]
  products_total: ProductData[]
  areas_total: AreaData[]
  payment_methods: PaymentMethodData[]
  cashiers: CashierData[]
}

type TabKey = 'overview' | 'products' | 'areas' | 'cashiers'

// ─── Helpers ────────────────────────────────────────────
const fmt = (cents: number): string => {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-')
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`
}

const fmtDateFull = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-')
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${parseInt(d)} de ${months[parseInt(m) - 1]}, ${y}`
}

const PAYMENT_METHOD_LABELS: Record<string, { label: string; icon: IconName; color: string }> = {
  qr: { label: 'QR / Pulsera', icon: 'qr-code', color: '#7C3AED' },
  cash: { label: 'Efectivo', icon: 'cash', color: '#059669' },
  unknown: { label: 'Desconocido', icon: 'help-circle', color: '#6B7280' },
}

// ─── Component ──────────────────────────────────────────
export default function EventReportScreen() {
  const { currentOrg } = useAuthStore()
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [report, setReport] = useState<EventReport | null>(null)
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [showEventPicker, setShowEventPicker] = useState(false)

  // Fetch all events for the org (including ended)
  const fetchEvents = useCallback(async () => {
    if (!currentOrg) return
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('starts_at', { ascending: false })

      if (error) throw error
      setAllEvents(data ?? [])
    } catch (err) {
      console.error('Error fetching events:', err)
    } finally {
      setIsLoadingEvents(false)
    }
  }, [currentOrg])

  // Fetch report for selected event
  const fetchReport = useCallback(async (eventId: string) => {
    setIsLoadingReport(true)
    try {
      const { data, error } = await supabase.rpc('get_event_report', {
        p_event_id: eventId,
      })

      if (error) throw error
      setReport(data as EventReport)
    } catch (err) {
      console.error('Error fetching report:', err)
      Alert.alert('Error', 'No se pudo cargar el reporte del evento.')
    } finally {
      setIsLoadingReport(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event)
    setShowEventPicker(false)
    setActiveTab('overview')
    fetchReport(event.id)
  }

  const onRefresh = () => {
    if (!selectedEvent) return
    setRefreshing(true)
    fetchReport(selectedEvent.id)
  }

  // ─── Sub-renders ────────────────────────────────────────
  const renderKPICard = (
    title: string,
    value: string,
    icon: IconName,
    color: string,
    bgColor: string,
    subtitle?: string,
  ) => (
    <View style={[styles.kpiCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <View style={[styles.kpiIcon, { backgroundColor: bgColor }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.kpiInfo}>
        <Text style={styles.kpiTitle}>{title}</Text>
        <Text style={[styles.kpiValue, { color }]}>{value}</Text>
        {subtitle && <Text style={styles.kpiSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  )

  const renderOverviewTab = () => {
    if (!report) return null
    const { totals, daily, payment_methods } = report
    const maxDailySales = Math.max(...daily.map(d => d.sales_cents), 1)

    return (
      <View style={styles.tabContent}>
        {/* KPI Grid */}
        <View style={styles.kpiGrid}>
          {renderKPICard(
            'Ventas Totales',
            fmt(totals.sales_cents),
            'trending-up',
            '#059669',
            '#D1FAE5',
            `${totals.sales_transactions} transacciones`
          )}
          {renderKPICard(
            'Depósitos / Recargas',
            fmt(totals.deposits_cents),
            'arrow-down-circle',
            '#4F46E5',
            '#EEF2FF',
          )}
          {renderKPICard(
            'Devoluciones',
            fmt(totals.refunds_cents),
            'arrow-undo',
            '#DC2626',
            '#FEE2E2',
          )}
          {renderKPICard(
            'Neto (Depósitos − Devol.)',
            fmt(totals.net_cents),
            'wallet',
            '#D97706',
            '#FEF3C7',
            `${totals.sales_items} artículos vendidos`
          )}
        </View>

        {/* Payment Methods */}
        {payment_methods.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Métodos de Pago</Text>
            {payment_methods.map((pm, idx) => {
              const config = PAYMENT_METHOD_LABELS[pm.method] ?? PAYMENT_METHOD_LABELS.unknown
              const pct = totals.sales_cents > 0
                ? ((pm.sales_cents / totals.sales_cents) * 100).toFixed(1)
                : '0'
              return (
                <View key={idx} style={styles.paymentRow}>
                  <View style={styles.paymentLeft}>
                    <View style={[styles.paymentIcon, { backgroundColor: `${config.color}15` }]}>
                      <Ionicons name={config.icon} size={18} color={config.color} />
                    </View>
                    <View>
                      <Text style={styles.paymentLabel}>{config.label}</Text>
                      <Text style={styles.paymentCount}>{pm.transactions_count} transacciones</Text>
                    </View>
                  </View>
                  <View style={styles.paymentRight}>
                    <Text style={styles.paymentAmount}>{fmt(pm.sales_cents)}</Text>
                    <Text style={styles.paymentPct}>{pct}%</Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* Daily Chart */}
        {daily.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Ventas por Día</Text>
            {daily.map((d, idx) => {
              const barWidth = Math.max((d.sales_cents / maxDailySales) * 100, 4)
              return (
                <View key={idx} style={styles.chartRow}>
                  <Text style={styles.chartLabel}>{fmtDate(d.date)}</Text>
                  <View style={styles.chartBarContainer}>
                    <View style={[styles.chartBar, { width: `${barWidth}%` }]} />
                  </View>
                  <Text style={styles.chartValue}>{fmt(d.sales_cents)}</Text>
                </View>
              )
            })}
          </View>
        )}

        {/* Daily Transactions Detail */}
        {daily.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Detalle Diario</Text>
            {daily.map((d, idx) => (
              <View key={idx} style={styles.dailyDetailCard}>
                <Text style={styles.dailyDetailDate}>{fmtDateFull(d.date)}</Text>
                <View style={styles.dailyDetailGrid}>
                  <View style={styles.dailyDetailItem}>
                    <Text style={styles.dailyDetailValue}>{fmt(d.sales_cents)}</Text>
                    <Text style={styles.dailyDetailLabel}>Ventas</Text>
                  </View>
                  <View style={styles.dailyDetailItem}>
                    <Text style={styles.dailyDetailValue}>{fmt(d.deposits_cents)}</Text>
                    <Text style={styles.dailyDetailLabel}>Depósitos</Text>
                  </View>
                  <View style={styles.dailyDetailItem}>
                    <Text style={[styles.dailyDetailValue, { color: '#DC2626' }]}>{fmt(d.refunds_cents)}</Text>
                    <Text style={styles.dailyDetailLabel}>Devol.</Text>
                  </View>
                  <View style={styles.dailyDetailItem}>
                    <Text style={styles.dailyDetailValue}>{d.transactions_count}</Text>
                    <Text style={styles.dailyDetailLabel}>Transacc.</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    )
  }

  const renderProductsTab = () => {
    if (!report) return null
    const { products_total } = report
    const maxSales = Math.max(...products_total.map(p => p.sales_cents), 1)

    return (
      <View style={styles.tabContent}>
        {products_total.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="pricetags-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTabText}>Sin ventas de productos</Text>
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Productos Vendidos</Text>
            {products_total.map((p, idx) => {
              const barWidth = Math.max((p.sales_cents / maxSales) * 100, 4)
              return (
                <View key={p.id ?? idx} style={styles.productRow}>
                  <View style={styles.productRank}>
                    <Text style={styles.productRankText}>{idx + 1}</Text>
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                    <View style={styles.productBarContainer}>
                      <View style={[styles.productBar, { width: `${barWidth}%` }]} />
                    </View>
                    <View style={styles.productStats}>
                      <Text style={styles.productQty}>{p.quantity} uds.</Text>
                      {p.refunds_cents > 0 && (
                        <Text style={styles.productRefund}>-{fmt(p.refunds_cents)} devol.</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.productAmounts}>
                    <Text style={styles.productSales}>{fmt(p.sales_cents)}</Text>
                    {p.refunds_cents > 0 && (
                      <Text style={styles.productNet}>Neto: {fmt(p.net_cents)}</Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>
    )
  }

  const renderAreasTab = () => {
    if (!report) return null
    const { areas_total } = report
    const totalSales = areas_total.reduce((s, a) => s + a.sales_cents, 0) || 1

    return (
      <View style={styles.tabContent}>
        {areas_total.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="map-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTabText}>Sin datos de áreas</Text>
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Ventas por Área</Text>
            {areas_total.map((a, idx) => {
              const pct = ((a.sales_cents / totalSales) * 100).toFixed(1)
              const areaColors = ['#4F46E5', '#7C3AED', '#EC4899', '#F59E0B', '#10B981', '#3B82F6']
              const color = areaColors[idx % areaColors.length]
              return (
                <View key={a.id ?? idx} style={styles.areaRow}>
                  <View style={styles.areaLeft}>
                    <View style={[styles.areaColorDot, { backgroundColor: color }]} />
                    <View>
                      <Text style={styles.areaName}>{a.name}</Text>
                      <Text style={styles.areaQty}>{a.quantity} artículos</Text>
                    </View>
                  </View>
                  <View style={styles.areaRight}>
                    <Text style={styles.areaSales}>{fmt(a.sales_cents)}</Text>
                    <View style={[styles.areaPctBadge, { backgroundColor: `${color}15` }]}>
                      <Text style={[styles.areaPctText, { color }]}>{pct}%</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>
    )
  }

  const renderCashiersTab = () => {
    if (!report) return null
    const { cashiers } = report
    const maxSales = Math.max(...cashiers.map(c => c.sales_cents), 1)

    return (
      <View style={styles.tabContent}>
        {cashiers.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="people-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTabText}>Sin datos de cajeros</Text>
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Rendimiento de Cajeros</Text>
            {cashiers.map((c, idx) => {
              const barPct = Math.max((c.sales_cents / maxSales) * 100, 4)
              const avatarColors = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981']
              const color = avatarColors[idx % avatarColors.length]
              return (
                <View key={c.id ?? idx} style={styles.cashierRow}>
                  <View style={[styles.cashierAvatar, { backgroundColor: color }]}>
                    <Text style={styles.cashierAvatarText}>
                      {c.name?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={styles.cashierInfo}>
                    <Text style={styles.cashierName} numberOfLines={1}>{c.name}</Text>
                    <View style={styles.cashierBarOuter}>
                      <View style={[styles.cashierBar, { width: `${barPct}%`, backgroundColor: color }]} />
                    </View>
                    <View style={styles.cashierStats}>
                      <Text style={styles.cashierStat}>{c.transactions_count} ventas</Text>
                      <Text style={styles.cashierStat}>{c.items_count} artículos</Text>
                    </View>
                  </View>
                  <Text style={styles.cashierAmount}>{fmt(c.sales_cents)}</Text>
                </View>
              )
            })}
          </View>
        )}
      </View>
    )
  }

  // ─── Tabs Config ────────────────────────────────────────
  const TABS: { key: TabKey; label: string; icon: IconName }[] = [
    { key: 'overview', label: 'General', icon: 'grid' },
    { key: 'products', label: 'Productos', icon: 'pricetags' },
    { key: 'areas', label: 'Áreas', icon: 'map' },
    { key: 'cashiers', label: 'Cajeros', icon: 'people' },
  ]

  // ─── Event Picker Modal ─────────────────────────────────
  const renderEventPicker = () => {
    const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
      draft: { label: 'Borrador', bg: '#F3F4F6', text: '#6B7280' },
      active: { label: 'Activo', bg: '#D1FAE5', text: '#059669' },
      paused: { label: 'Pausado', bg: '#FEF3C7', text: '#D97706' },
      ended: { label: 'Finalizado', bg: '#FEE2E2', text: '#DC2626' },
    }

    return (
      <Modal
        visible={showEventPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventPicker(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Seleccionar Evento</Text>
            <Text style={styles.pickerSubtitle}>Elige un evento para ver su reporte</Text>

            <FlatList
              data={allEvents}
              keyExtractor={e => e.id}
              style={styles.pickerList}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={({ item }) => {
                const isSelected = selectedEvent?.id === item.id
                const sc = statusConfig[item.status] ?? statusConfig.draft
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                    onPress={() => handleSelectEvent(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pickerItemIcon}>
                      <Ionicons
                        name="calendar"
                        size={24}
                        color={isSelected ? '#4F46E5' : '#6B7280'}
                      />
                    </View>
                    <View style={styles.pickerItemInfo}>
                      <Text style={[styles.pickerItemName, isSelected && { color: '#4F46E5' }]}>
                        {item.name}
                      </Text>
                      <View style={styles.pickerItemMeta}>
                        <View style={[styles.pickerStatusBadge, { backgroundColor: sc.bg }]}>
                          <Text style={[styles.pickerStatusText, { color: sc.text }]}>{sc.label}</Text>
                        </View>
                        {item.starts_at && (
                          <Text style={styles.pickerItemDate}>
                            {new Date(item.starts_at).toLocaleDateString('es-MX', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color="#4F46E5" />
                    )}
                  </TouchableOpacity>
                )
              }}
              ListEmptyComponent={
                <View style={styles.emptyTab}>
                  <Ionicons name="calendar-outline" size={48} color="#D1D5DB" />
                  <Text style={styles.emptyTabText}>Sin eventos</Text>
                </View>
              }
            />

            <TouchableOpacity
              style={styles.pickerCancel}
              onPress={() => setShowEventPicker(false)}
            >
              <Text style={styles.pickerCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    )
  }

  // ─── Main Render ────────────────────────────────────────
  if (!currentOrg) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="business-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>Sin organización</Text>
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
          <Text style={styles.headerTitle}>Reportes</Text>
          <Text style={styles.headerSubtitle}>{currentOrg.name}</Text>
        </View>
        {selectedEvent && !isLoadingReport && (
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={20} color="#4F46E5" />
          </TouchableOpacity>
        )}
      </View>

      {/* Event Selector */}
      <TouchableOpacity
        style={styles.eventSelector}
        onPress={() => setShowEventPicker(true)}
        activeOpacity={0.7}
      >
        <View style={styles.eventSelectorLeft}>
          <View style={styles.eventSelectorIcon}>
            <Ionicons name="calendar" size={20} color="#4F46E5" />
          </View>
          <View>
            <Text style={styles.eventSelectorLabel}>
              {selectedEvent ? selectedEvent.name : 'Seleccionar evento'}
            </Text>
            {selectedEvent?.starts_at && (
              <Text style={styles.eventSelectorDate}>
                {new Date(selectedEvent.starts_at).toLocaleDateString('es-MX', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>

      {/* Content */}
      {!selectedEvent ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="bar-chart-outline" size={56} color="#C7D2FE" />
          </View>
          <Text style={styles.emptyTitle}>Selecciona un Evento</Text>
          <Text style={styles.emptySubtitle}>
            Elige un evento para ver sus estadísticas y métricas de rendimiento
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowEventPicker(true)}
          >
            <Ionicons name="calendar" size={18} color="#fff" />
            <Text style={styles.emptyButtonText}>Elegir Evento</Text>
          </TouchableOpacity>
        </View>
      ) : isLoadingReport ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Generando reporte...</Text>
        </View>
      ) : report ? (
        <View style={{ flex: 1 }}>
          {/* Tabs */}
          <View style={styles.tabBar}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={tab.icon}
                    size={18}
                    color={isActive ? '#4F46E5' : '#9CA3AF'}
                  />
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={{ paddingBottom: 40 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
            }
          >
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'products' && renderProductsTab()}
            {activeTab === 'areas' && renderAreasTab()}
            {activeTab === 'cashiers' && renderCashiersTab()}
          </ScrollView>
        </View>
      ) : null}

      {renderEventPicker()}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
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
  headerCenter: {
    flex: 1,
  },
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
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Event Selector
  eventSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  eventSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  eventSelectorIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventSelectorLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  eventSelectorDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: '#EEF2FF',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  tabLabelActive: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
    gap: 16,
  },
  // KPIs
  kpiGrid: {
    gap: 12,
  },
  kpiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  kpiIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiInfo: {
    flex: 1,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  kpiSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  // Sections
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  // Payment methods
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  paymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  paymentCount: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  paymentPct: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 1,
  },
  // Chart
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  chartLabel: {
    width: 50,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  chartBarContainer: {
    flex: 1,
    height: 24,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  chartBar: {
    height: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 6,
  },
  chartValue: {
    width: 80,
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'right',
  },
  // Daily detail
  dailyDetailCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  dailyDetailDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  dailyDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dailyDetailItem: {
    flex: 1,
    minWidth: '40%',
  },
  dailyDetailValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  dailyDetailLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  // Products
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  productRank: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  productBarContainer: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  productBar: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 3,
  },
  productStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  productQty: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  productRefund: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '500',
  },
  productAmounts: {
    alignItems: 'flex-end',
  },
  productSales: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  productNet: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '500',
    marginTop: 2,
  },
  // Areas
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  areaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  areaColorDot: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  areaName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  areaQty: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  areaRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  areaSales: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  areaPctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  areaPctText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Cashiers
  cashierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cashierAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashierAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cashierInfo: {
    flex: 1,
  },
  cashierName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  cashierBarOuter: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  cashierBar: {
    height: '100%',
    borderRadius: 3,
  },
  cashierStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cashierStat: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  cashierAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  // Event Picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '75%',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  pickerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 16,
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  pickerItemSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  pickerItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  pickerItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  pickerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pickerStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pickerItemDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  pickerCancel: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  pickerCancelText: {
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
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 280,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  emptyTab: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyTabText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
})
