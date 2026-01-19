import React, { useState } from 'react'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'

export default function WalletsScreen() {
  const { currentOrg, currentEvent, canAccessFeature } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')

  if (!canAccessFeature('wallets')) {
    return (
      <View style={styles.noAccessContainer}>
        <Ionicons name="lock-closed-outline" size={64} color="#9CA3AF" />
        <Text style={styles.noAccessTitle}>Acceso Restringido</Text>
        <Text style={styles.noAccessSubtitle}>
          No tienes permisos para gestionar wallets
        </Text>
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
            {currentOrg?.name ?? 'Seleccionar'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.contextButton}
          onPress={() => router.push('/select-event')}
        >
          <Ionicons name="calendar-outline" size={18} color="#6B7280" />
          <Text style={styles.contextValue} numberOfLines={1}>
            {currentEvent?.name ?? 'Seleccionar'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {!currentOrg || !currentEvent ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Configuración requerida</Text>
          <Text style={styles.emptySubtitle}>
            Selecciona una organización y un evento para ver las wallets
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre o teléfono..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Create Button */}
          <TouchableOpacity style={styles.createButton} activeOpacity={0.8}>
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.createButtonText}>Crear Nueva Wallet</Text>
          </TouchableOpacity>

          {/* Stats */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Wallets Activas</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>$0.00</Text>
              <Text style={styles.statLabel}>Balance Total</Text>
            </View>
          </View>

          {/* Empty state for wallets list */}
          <View style={styles.listEmptyState}>
            <Ionicons name="wallet-outline" size={48} color="#D1D5DB" />
            <Text style={styles.listEmptyText}>
              No hay wallets para este evento
            </Text>
            <Text style={styles.listEmptySubtext}>
              Crea una nueva wallet para comenzar
            </Text>
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
})
