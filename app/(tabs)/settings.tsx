import React from 'react'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'

type IconName = keyof typeof Ionicons.glyphMap

interface SettingsItem {
  id: string
  icon: IconName
  iconColor: string
  iconBg: string
  title: string
  subtitle?: string
  onPress: () => void
  adminOnly?: boolean
}

export default function SettingsScreen() {
  const { 
    user, 
    profile, 
    currentOrg, 
    currentEvent,
    organizations,
    signOut,
    isAdmin,
  } = useAuthStore()

  const handleSignOut = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Cerrar Sesión', 
          style: 'destructive',
          onPress: signOut,
        },
      ]
    )
  }

  const settingsItems: SettingsItem[] = [
    {
      id: 'org',
      icon: 'business',
      iconColor: '#4F46E5',
      iconBg: '#EEF2FF',
      title: 'Organización',
      subtitle: currentOrg?.name ?? 'No seleccionada',
      onPress: () => router.push('/select-org'),
    },
    {
      id: 'event',
      icon: 'calendar',
      iconColor: '#D97706',
      iconBg: '#FEF3C7',
      title: 'Evento Activo',
      subtitle: currentEvent?.name ?? 'No seleccionado',
      onPress: () => router.push('/select-event'),
    },
    {
      id: 'products',
      icon: 'pricetags',
      iconColor: '#059669',
      iconBg: '#D1FAE5',
      title: 'Productos',
      subtitle: 'Gestionar catálogo',
      onPress: () => {},
      adminOnly: true,
    },
    {
      id: 'qrs',
      icon: 'qr-code',
      iconColor: '#7C3AED',
      iconBg: '#EDE9FE',
      title: 'Códigos QR',
      subtitle: 'Gestionar QRs y lotes',
      onPress: () => {},
      adminOnly: true,
    },
    {
      id: 'team',
      icon: 'people',
      iconColor: '#0891B2',
      iconBg: '#CFFAFE',
      title: 'Equipo',
      subtitle: 'Gestionar miembros',
      onPress: () => {},
      adminOnly: true,
    },
    {
      id: 'reports',
      icon: 'bar-chart',
      iconColor: '#EA580C',
      iconBg: '#FFEDD5',
      title: 'Reportes',
      subtitle: 'Ver estadísticas',
      onPress: () => {},
      adminOnly: true,
    },
  ]

  const visibleItems = settingsItems.filter(
    item => !item.adminOnly || isAdmin()
  )

  const getRoleBadge = () => {
    if (!currentOrg) return null
    const roleLabels: Record<string, string> = {
      owner: 'Propietario',
      admin: 'Administrador',
      cashier: 'Cajero',
    }
    const roleColors: Record<string, { bg: string; text: string }> = {
      owner: { bg: '#FEF3C7', text: '#D97706' },
      admin: { bg: '#EEF2FF', text: '#4F46E5' },
      cashier: { bg: '#D1FAE5', text: '#059669' },
    }
    const colors = roleColors[currentOrg.role] ?? roleColors.cashier
    return (
      <View style={[styles.roleBadge, { backgroundColor: colors.bg }]}>
        <Text style={[styles.roleBadgeText, { color: colors.text }]}>
          {roleLabels[currentOrg.role] ?? currentOrg.role}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.first_name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {profile?.first_name && profile?.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : user?.email ?? 'Usuario'}
          </Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          {getRoleBadge()}
        </View>
      </View>

      {/* Organizations count */}
      {organizations.length > 1 && (
        <View style={styles.orgCountCard}>
          <Ionicons name="business-outline" size={20} color="#6B7280" />
          <Text style={styles.orgCountText}>
            Tienes acceso a {organizations.length} organizaciones
          </Text>
        </View>
      )}

      {/* Settings List */}
      <View style={styles.settingsList}>
        {visibleItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.settingsItem}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <View style={[styles.settingsIcon, { backgroundColor: item.iconBg }]}>
              <Ionicons name={item.icon} size={22} color={item.iconColor} />
            </View>
            <View style={styles.settingsContent}>
              <Text style={styles.settingsTitle}>{item.title}</Text>
              {item.subtitle && (
                <Text style={styles.settingsSubtitle}>{item.subtitle}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        ))}
      </View>

      {/* Sign Out */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={22} color="#DC2626" />
        <Text style={styles.signOutText}>Cerrar Sesión</Text>
      </TouchableOpacity>

      {/* Version */}
      <Text style={styles.versionText}>Versión 1.0.0</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  profileEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orgCountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  orgCountText: {
    fontSize: 13,
    color: '#6B7280',
  },
  settingsList: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingsIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsContent: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  settingsSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 24,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
  versionText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 24,
  },
})
