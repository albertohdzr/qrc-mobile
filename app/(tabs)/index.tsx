import React, { useState, useEffect, useCallback } from 'react'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { EventArea } from '@/types/database'

export default function POSScreen() {
  const { currentOrg, currentEvent, canAccessFeature, selectedAreaId, setSelectedAreaId } = useAuthStore()
  const [areas, setAreas] = useState<EventArea[]>([])

  // Derive the full area object from the stored ID
  const selectedArea = areas.find(a => a.id === selectedAreaId) ?? null

  useFocusEffect(
    useCallback(() => {
      if (currentOrg && currentEvent) {
        loadAreas()
      }
    }, [currentOrg, currentEvent])
  )

  const loadAreas = async () => {
    if (!currentOrg || !currentEvent) return

    const { data, error } = await supabase
      .from('event_areas')
      .select('*')
      .eq('org_id', currentOrg.id)
      .eq('event_id', currentEvent.id)
      .order('name')

    if (!error && data) {
      const areasData = data as EventArea[]
      setAreas(areasData)
      // Auto-select first area if none selected or if current selection is no longer valid
      if ((!selectedAreaId || !areasData.find(a => a.id === selectedAreaId)) && areasData.length > 0) {
        setSelectedAreaId(areasData[0].id)
      }
    }
  }

  const handleScanForSale = () => {
    if (selectedArea) {
      router.push({
        pathname: '/scanner',
        params: { areaId: selectedArea.id },
      })
    } else {
      router.push('/scanner')
    }
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
          <Text style={styles.contextLabel}>Organización</Text>
          <Text style={styles.contextValue} numberOfLines={1}>
            {currentOrg?.name ?? 'Seleccionar'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.contextButton}
          onPress={() => router.push('/select-event')}
        >
          <Ionicons name="calendar-outline" size={18} color="#6B7280" />
          <Text style={styles.contextLabel}>Evento</Text>
          <Text style={styles.contextValue} numberOfLines={1}>
            {currentEvent?.name ?? 'Seleccionar'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Main content */}
      {!currentOrg || !currentEvent ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Configuración requerida</Text>
          <Text style={styles.emptySubtitle}>
            Selecciona una organización y un evento para comenzar a usar el POS
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Areas Selector */}
          {areas.length > 0 && (
            <View style={styles.areasSection}>
              <Text style={styles.sectionTitle}>Área</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.areasContainer}
              >
                {areas.map((area) => (
                  <TouchableOpacity
                    key={area.id}
                    style={[
                      styles.areaChip,
                      selectedArea?.id === area.id && styles.areaChipActive,
                    ]}
                    onPress={() => setSelectedAreaId(area.id)}
                  >
                    <Text style={[
                      styles.areaChipText,
                      selectedArea?.id === area.id && styles.areaChipTextActive,
                    ]}>
                      {area.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Scan QR Button */}
          <TouchableOpacity 
            style={styles.scanButton} 
            activeOpacity={0.8}
            onPress={handleScanForSale}
          >
            <View style={styles.scanIconContainer}>
              <Ionicons name="qr-code-outline" size={48} color="#fff" />
            </View>
            <Text style={styles.scanTitle}>Escanear para Vender</Text>
            <Text style={styles.scanSubtitle}>
              Escanea el QR de la pulsera o tarjeta para realizar una venta
            </Text>
          </TouchableOpacity>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
            
            <View style={styles.actionsGrid}>
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => router.push('/search-wallet')}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="search-outline" size={24} color="#4F46E5" />
                </View>
                <Text style={styles.actionText}>Buscar Wallet</Text>
              </TouchableOpacity>

              {canAccessFeature('transfer') && (
                <TouchableOpacity 
                  style={styles.actionCard}
                  onPress={() => router.push('/transfer')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="swap-horizontal-outline" size={24} color="#D97706" />
                  </View>
                  <Text style={styles.actionText}>Transferencia</Text>
                </TouchableOpacity>
              )}



              {canAccessFeature('refunds') && (
                <TouchableOpacity 
                  style={styles.actionCard}
                  onPress={() => {}}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="refresh-outline" size={24} color="#DC2626" />
                  </View>
                  <Text style={styles.actionText}>Reembolso</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>Resumen del Día</Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>$0.00</Text>
                <Text style={styles.statLabel}>Total Ventas</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>0</Text>
                <Text style={styles.statLabel}>Transacciones</Text>
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
  contextLabel: {
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  areasSection: {
    marginBottom: 16,
  },
  areasContainer: {
    paddingVertical: 4,
    gap: 8,
  },
  areaChip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  areaChipActive: {
    backgroundColor: '#1F2937',
    borderColor: '#1F2937',
  },
  areaChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  areaChipTextActive: {
    color: '#fff',
  },
  scanButton: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  scanIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scanTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  scanSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
  quickActions: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  statsContainer: {
    marginTop: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
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
})
