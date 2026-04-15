import React, { useCallback, useEffect, useState } from 'react'
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
import { OrgRole } from '@/types/database'

type IconName = keyof typeof Ionicons.glyphMap

const API_URL = process.env.EXPO_PUBLIC_API_URL || ''

interface TeamMember {
  user_id: string
  role: OrgRole
  disabled: boolean
  created_at: string
  profile: {
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
}

const ROLE_CONFIG: Record<OrgRole, { label: string; icon: IconName; bg: string; text: string; order: number }> = {
  owner: { label: 'Propietario', icon: 'shield', bg: '#FEF3C7', text: '#D97706', order: 0 },
  admin: { label: 'Administrador', icon: 'shield-half', bg: '#EEF2FF', text: '#4F46E5', order: 1 },
  cashier: { label: 'Cajero', icon: 'person', bg: '#D1FAE5', text: '#059669', order: 2 },
}

// ── API helper ──────────────────────────────────────────────

async function callUsersApi(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('No autorizado. Inicia sesión de nuevo.')

  const res = await fetch(`${API_URL}/api/users`, {
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

export default function TeamManagementScreen() {
  const { currentOrg, user } = useAuthStore()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Add member modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'cashier' as OrgRole,
  })
  const [addLoading, setAddLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const fetchMembers = useCallback(async () => {
    if (!currentOrg) return

    try {
      // Fetch members and profiles separately (no direct FK between the tables)
      const { data: membersData, error: membersError } = await (supabase
        .from('organization_members') as any)
        .select('user_id, role, disabled, created_at')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: true })

      if (membersError) throw membersError

      const userIds = (membersData ?? []).map((m: any) => m.user_id)

      // Fetch profiles for all member user_ids
      let profilesMap: Record<string, { first_name: string | null; last_name: string | null; email: string | null }> = {}
      if (userIds.length > 0) {
        const { data: profilesData } = await (supabase
          .from('profiles') as any)
          .select('user_id, first_name, last_name, email')
          .in('user_id', userIds)

        for (const p of (profilesData ?? [])) {
          profilesMap[p.user_id] = {
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email,
          }
        }
      }

      // Merge members with their profiles
      const merged: TeamMember[] = (membersData ?? []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        disabled: m.disabled,
        created_at: m.created_at,
        profile: profilesMap[m.user_id] ?? null,
      }))

      const sorted = merged.sort((a, b) => {
        const orderA = ROLE_CONFIG[a.role]?.order ?? 99
        const orderB = ROLE_CONFIG[b.role]?.order ?? 99
        return orderA - orderB
      })

      setMembers(sorted)
    } catch (err) {
      console.error('Error fetching members:', err)
      Alert.alert('Error', 'No se pudieron cargar los miembros del equipo.')
    } finally {
      setIsLoading(false)
      setRefreshing(false)
    }
  }, [currentOrg])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onRefresh = () => {
    setRefreshing(true)
    fetchMembers()
  }

  const handleChangeRole = async (newRole: OrgRole) => {
    if (!selectedMember || !currentOrg) return

    setActionLoading(true)
    try {
      await callUsersApi({
        action: 'update_member',
        orgId: currentOrg.id,
        userId: selectedMember.user_id,
        role: newRole,
      })

      setMembers(prev =>
        prev.map(m =>
          m.user_id === selectedMember.user_id ? { ...m, role: newRole } : m
        ).sort((a, b) => (ROLE_CONFIG[a.role]?.order ?? 99) - (ROLE_CONFIG[b.role]?.order ?? 99))
      )
      setShowRoleModal(false)
      setSelectedMember(null)
    } catch (err: any) {
      console.error('Error updating role:', err)
      Alert.alert('Error', err.message || 'No se pudo cambiar el rol.')
    } finally {
      setActionLoading(false)
    }
  }

  const resetAddForm = () => {
    setAddForm({ email: '', password: '', firstName: '', lastName: '', role: 'cashier' })
    setShowPassword(false)
  }

  const handleAddMember = async () => {
    if (!currentOrg) return

    const email = addForm.email.trim().toLowerCase()
    const password = addForm.password
    const firstName = addForm.firstName.trim()
    const lastName = addForm.lastName.trim()

    if (!email) return Alert.alert('Error', 'Ingresa un correo electrónico.')
    if (!password || password.length < 6) return Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres.')
    if (!firstName) return Alert.alert('Error', 'Ingresa el nombre.')

    setAddLoading(true)
    try {
      await callUsersApi({
        action: 'create_single',
        orgId: currentOrg.id,
        email,
        password,
        firstName,
        lastName: lastName || undefined,
        role: addForm.role,
      })

      Alert.alert('Éxito', `${firstName} ha sido agregado como ${ROLE_CONFIG[addForm.role].label}.`)
      setShowAddModal(false)
      resetAddForm()
      fetchMembers()
    } catch (err: any) {
      console.error('Error adding member:', err)
      Alert.alert('Error', err.message || 'No se pudo agregar al miembro.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleToggleDisabled = (member: TeamMember) => {
    const action = member.disabled ? 'activar' : 'desactivar'
    Alert.alert(
      `${member.disabled ? 'Activar' : 'Desactivar'} miembro`,
      `¿Estás seguro de que quieres ${action} a ${getMemberName(member)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: member.disabled ? 'Activar' : 'Desactivar',
          style: member.disabled ? 'default' : 'destructive',
          onPress: async () => {
            if (!currentOrg) return
            try {
              await callUsersApi({
                action: 'update_member',
                orgId: currentOrg.id,
                userId: member.user_id,
                disabled: !member.disabled,
              })

              setMembers(prev =>
                prev.map(m =>
                  m.user_id === member.user_id ? { ...m, disabled: !member.disabled } : m
                )
              )
            } catch (err: any) {
              console.error('Error toggling member:', err)
              Alert.alert('Error', err.message || `No se pudo ${action} al miembro.`)
            }
          },
        },
      ]
    )
  }

  const getMemberName = (member: TeamMember): string => {
    if (member.profile?.first_name && member.profile?.last_name) {
      return `${member.profile.first_name} ${member.profile.last_name}`
    }
    return member.profile?.email ?? 'Usuario'
  }

  const getInitials = (member: TeamMember): string => {
    if (member.profile?.first_name && member.profile?.last_name) {
      return `${member.profile.first_name[0]}${member.profile.last_name[0]}`.toUpperCase()
    }
    return (member.profile?.email?.[0] ?? 'U').toUpperCase()
  }

  const isCurrentUser = (member: TeamMember) => member.user_id === user?.id
  const isOwner = (member: TeamMember) => member.role === 'owner'

  const renderMember = ({ item }: { item: TeamMember }) => {
    const config = ROLE_CONFIG[item.role]
    const canModify = !isCurrentUser(item) && !isOwner(item)
    const avatarColors = [
      '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
      '#3B82F6', '#EF4444', '#14B8A6',
    ]
    const colorIndex = item.user_id.charCodeAt(0) % avatarColors.length
    const avatarBg = avatarColors[colorIndex]

    return (
      <View style={[styles.memberCard, item.disabled && styles.memberCardDisabled]}>
        <View style={styles.memberTop}>
          <View style={[styles.avatar, { backgroundColor: item.disabled ? '#D1D5DB' : avatarBg }]}>
            <Text style={styles.avatarText}>{getInitials(item)}</Text>
          </View>
          <View style={styles.memberInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.memberName, item.disabled && styles.textDisabled]} numberOfLines={1}>
                {getMemberName(item)}
              </Text>
              {isCurrentUser(item) && (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>Tú</Text>
                </View>
              )}
            </View>
            <Text style={[styles.memberEmail, item.disabled && styles.textDisabled]} numberOfLines={1}>
              {item.profile?.email ?? '—'}
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.roleBadge, { backgroundColor: item.disabled ? '#F3F4F6' : config.bg }]}>
                <Ionicons
                  name={config.icon}
                  size={12}
                  color={item.disabled ? '#9CA3AF' : config.text}
                />
                <Text style={[styles.roleBadgeText, { color: item.disabled ? '#9CA3AF' : config.text }]}>
                  {config.label}
                </Text>
              </View>
              {item.disabled && (
                <View style={styles.disabledBadge}>
                  <Ionicons name="close-circle" size={12} color="#DC2626" />
                  <Text style={styles.disabledBadgeText}>Desactivado</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {canModify && (
          <View style={styles.memberActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                setSelectedMember(item)
                setShowRoleModal(true)
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={16} color="#4F46E5" />
              <Text style={styles.actionButtonText}>Cambiar Rol</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, item.disabled ? styles.actionButtonActivate : styles.actionButtonDeactivate]}
              onPress={() => handleToggleDisabled(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.disabled ? 'checkmark-circle' : 'ban'}
                size={16}
                color={item.disabled ? '#059669' : '#DC2626'}
              />
              <Text style={[
                styles.actionButtonText,
                { color: item.disabled ? '#059669' : '#DC2626' },
              ]}>
                {item.disabled ? 'Activar' : 'Desactivar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  }

  const renderRoleModal = () => (
    <Modal
      visible={showRoleModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowRoleModal(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowRoleModal(false)}
      >
        <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Cambiar Rol</Text>
          <Text style={styles.modalSubtitle}>
            {selectedMember ? getMemberName(selectedMember) : ''}
          </Text>

          {(['admin', 'cashier'] as OrgRole[]).map(role => {
            const config = ROLE_CONFIG[role]
            const isSelected = selectedMember?.role === role
            return (
              <TouchableOpacity
                key={role}
                style={[styles.roleOption, isSelected && styles.roleOptionSelected]}
                onPress={() => handleChangeRole(role)}
                disabled={actionLoading || isSelected}
                activeOpacity={0.7}
              >
                <View style={[styles.roleOptionIcon, { backgroundColor: config.bg }]}>
                  <Ionicons name={config.icon} size={20} color={config.text} />
                </View>
                <View style={styles.roleOptionInfo}>
                  <Text style={[styles.roleOptionLabel, isSelected && styles.roleOptionLabelSelected]}>
                    {config.label}
                  </Text>
                  <Text style={styles.roleOptionDescription}>
                    {role === 'admin'
                      ? 'Acceso total excepto transferir propiedad'
                      : 'Solo puede cobrar en punto de venta'}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color="#4F46E5" />
                )}
                {actionLoading && !isSelected && (
                  <ActivityIndicator size="small" color="#9CA3AF" />
                )}
              </TouchableOpacity>
            )
          })}

          <TouchableOpacity
            style={styles.modalCancelButton}
            onPress={() => setShowRoleModal(false)}
          >
            <Text style={styles.modalCancelText}>Cancelar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )

  if (!currentOrg) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="business-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>Sin organización</Text>
        <Text style={styles.emptySubtitle}>Selecciona una organización primero</Text>
      </View>
    )
  }

  const renderAddMemberModal = () => (
    <Modal
      visible={showAddModal}
      transparent
      animationType="slide"
      onRequestClose={() => { setShowAddModal(false); resetAddForm() }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => { setShowAddModal(false); resetAddForm() }}
        />
        <View style={styles.addModalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Agregar Miembro</Text>
          <Text style={styles.modalSubtitle}>Crea una cuenta para un nuevo miembro del equipo</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name Fields */}
            <View style={styles.formRow}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>Nombre *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Juan"
                  placeholderTextColor="#9CA3AF"
                  value={addForm.firstName}
                  onChangeText={t => setAddForm(prev => ({ ...prev, firstName: t }))}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>Apellido</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Pérez"
                  placeholderTextColor="#9CA3AF"
                  value={addForm.lastName}
                  onChangeText={t => setAddForm(prev => ({ ...prev, lastName: t }))}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Correo electrónico *</Text>
              <View style={styles.formInputRow}>
                <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.formInputFlex}
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor="#9CA3AF"
                  value={addForm.email}
                  onChangeText={t => setAddForm(prev => ({ ...prev, email: t }))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Contraseña *</Text>
              <View style={styles.formInputRow}>
                <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.formInputFlex}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor="#9CA3AF"
                  value={addForm.password}
                  onChangeText={t => setAddForm(prev => ({ ...prev, password: t }))}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6B7280"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Role Selector */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Rol *</Text>
              <View style={styles.roleSelector}>
                {(['admin', 'cashier'] as OrgRole[]).map(role => {
                  const config = ROLE_CONFIG[role]
                  const isSelected = addForm.role === role
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.roleSelectorItem,
                        isSelected && { borderColor: config.text, backgroundColor: config.bg },
                      ]}
                      onPress={() => setAddForm(prev => ({ ...prev, role }))}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={config.icon}
                        size={18}
                        color={isSelected ? config.text : '#9CA3AF'}
                      />
                      <Text style={[
                        styles.roleSelectorText,
                        isSelected && { color: config.text, fontWeight: '700' },
                      ]}>
                        {config.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* Actions */}
            <TouchableOpacity
              style={[styles.addButton, addLoading && styles.addButtonDisabled]}
              onPress={handleAddMember}
              disabled={addLoading}
              activeOpacity={0.8}
            >
              {addLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add" size={18} color="#fff" />
                  <Text style={styles.addButtonText}>Agregar Miembro</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => { setShowAddModal(false); resetAddForm() }}
              disabled={addLoading}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Equipo</Text>
          <Text style={styles.headerSubtitle}>{currentOrg.name}</Text>
        </View>
        <TouchableOpacity
          style={styles.addMemberButton}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="person-add" size={18} color="#fff" />
        </TouchableOpacity>
        <View style={styles.memberCountBadge}>
          <Text style={styles.memberCountText}>{members.length}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Cargando equipo...</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          renderItem={renderMember}
          keyExtractor={item => item.user_id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>Sin miembros</Text>
              <Text style={styles.emptySubtitle}>No hay miembros en esta organización</Text>
            </View>
          }
        />
      )}

      {renderRoleModal()}
      {renderAddMemberModal()}
    </View>
  )
}

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
  memberCountBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  memberCountText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4F46E5',
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  memberCardDisabled: {
    opacity: 0.7,
    backgroundColor: '#FAFAFA',
  },
  memberTop: {
    flexDirection: 'row',
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  memberEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  youBadge: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  disabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  disabledBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  textDisabled: {
    color: '#9CA3AF',
  },
  memberActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
  },
  actionButtonActivate: {
    backgroundColor: '#D1FAE5',
  },
  actionButtonDeactivate: {
    backgroundColor: '#FEE2E2',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
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
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  roleOptionSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  roleOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleOptionInfo: {
    flex: 1,
  },
  roleOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  roleOptionLabelSelected: {
    color: '#4F46E5',
  },
  roleOptionDescription: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  modalCancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  // Add Member
  addMemberButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  formFieldHalf: {
    flex: 1,
  },
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
  formInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  formInputFlex: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  roleSelectorItem: {
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
  roleSelectorText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  addButtonDisabled: {
    opacity: 0.7,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
