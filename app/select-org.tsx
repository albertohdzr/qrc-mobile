import React from 'react'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { Organization, OrgRole } from '@/types/database'

export default function SelectOrgScreen() {
  const { organizations, currentOrg, setCurrentOrg } = useAuthStore()

  const handleSelectOrg = async (org: Organization & { role: OrgRole }) => {
    await setCurrentOrg(org)
    router.back()
  }

  const getRoleBadge = (role: OrgRole) => {
    const roleLabels: Record<OrgRole, string> = {
      owner: 'Propietario',
      admin: 'Admin',
      cashier: 'Cajero',
    }
    const roleColors: Record<OrgRole, { bg: string; text: string }> = {
      owner: { bg: '#FEF3C7', text: '#D97706' },
      admin: { bg: '#EEF2FF', text: '#4F46E5' },
      cashier: { bg: '#D1FAE5', text: '#059669' },
    }
    const colors = roleColors[role]
    return (
      <View style={[styles.roleBadge, { backgroundColor: colors.bg }]}>
        <Text style={[styles.roleBadgeText, { color: colors.text }]}>
          {roleLabels[role]}
        </Text>
      </View>
    )
  }

  const renderItem = ({ item }: { item: Organization & { role: OrgRole } }) => {
    const isSelected = currentOrg?.id === item.id
    
    return (
      <TouchableOpacity
        style={[styles.orgItem, isSelected && styles.orgItemSelected]}
        onPress={() => handleSelectOrg(item)}
        activeOpacity={0.7}
      >
        <View style={styles.orgIcon}>
          <Ionicons 
            name="business" 
            size={24} 
            color={isSelected ? '#1F2937' : '#6B7280'} 
          />
        </View>
        <View style={styles.orgInfo}>
          <Text style={[styles.orgName, isSelected && styles.orgNameSelected]}>
            {item.name}
          </Text>
          <Text style={styles.orgSlug}>@{item.slug}</Text>
          {getRoleBadge(item.role)}
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color="#059669" />
        )}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {organizations.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Sin organizaciones</Text>
          <Text style={styles.emptySubtitle}>
            No perteneces a ninguna organización todavía
          </Text>
        </View>
      ) : (
        <FlatList
          data={organizations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  list: {
    padding: 16,
  },
  orgItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  orgItemSelected: {
    borderWidth: 2,
    borderColor: '#1F2937',
  },
  orgIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  orgNameSelected: {
    color: '#1F2937',
  },
  orgSlug: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  separator: {
    height: 12,
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
  },
})
