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
import { Event, EventStatus } from '@/types/database'
import { t } from '@/lib/i18n'
import i18n from '@/lib/i18n'

export default function SelectEventScreen() {
  const { events, currentEvent, currentOrg, setCurrentEvent } = useAuthStore()

  const handleSelectEvent = (event: Event) => {
    setCurrentEvent(event)
    router.back()
  }

  const getStatusBadge = (status: EventStatus) => {
    const statusConfig: Record<EventStatus, { label: string; bg: string; text: string }> = {
      draft: { label: t('selectEvent.draft'), bg: '#F3F4F6', text: '#6B7280' },
      active: { label: t('selectEvent.active'), bg: '#D1FAE5', text: '#059669' },
      paused: { label: t('selectEvent.paused'), bg: '#FEF3C7', text: '#D97706' },
      ended: { label: t('selectEvent.ended'), bg: '#FEE2E2', text: '#DC2626' },
    }
    const config = statusConfig[status]
    return (
      <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
        <Text style={[styles.statusBadgeText, { color: config.text }]}>
          {config.label}
        </Text>
      </View>
    )
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString(i18n.locale === 'es' ? 'es-MX' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const renderItem = ({ item }: { item: Event }) => {
    const isSelected = currentEvent?.id === item.id
    
    return (
      <TouchableOpacity
        style={[styles.eventItem, isSelected && styles.eventItemSelected]}
        onPress={() => handleSelectEvent(item)}
        activeOpacity={0.7}
      >
        <View style={styles.eventIcon}>
          <Ionicons 
            name="calendar" 
            size={24} 
            color={isSelected ? '#1F2937' : '#6B7280'} 
          />
        </View>
        <View style={styles.eventInfo}>
          <View style={styles.eventHeader}>
            <Text style={[styles.eventName, isSelected && styles.eventNameSelected]} numberOfLines={1}>
              {item.name}
            </Text>
            {getStatusBadge(item.status)}
          </View>
          {item.starts_at && (
            <View style={styles.dateRow}>
              <Ionicons name="time-outline" size={14} color="#9CA3AF" />
              <Text style={styles.eventDate}>
                {formatDate(item.starts_at)}
                {item.ends_at && ` - ${formatDate(item.ends_at)}`}
              </Text>
            </View>
          )}
          {item.description && (
            <Text style={styles.eventDescription} numberOfLines={1}>
              {item.description}
            </Text>
          )}
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color="#059669" />
        )}
      </TouchableOpacity>
    )
  }

  if (!currentOrg) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="business-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>{t('selectEvent.selectOrgFirst')}</Text>
        <Text style={styles.emptySubtitle}>
          {t('selectEvent.selectOrgFirstMessage')}
        </Text>
        <TouchableOpacity 
          style={styles.selectOrgButton}
          onPress={() => {
            router.back()
            setTimeout(() => router.push('/select-org'), 100)
          }}
        >
          <Text style={styles.selectOrgButtonText}>{t('selectEvent.selectOrgButton')}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Org context */}
      <View style={styles.orgContext}>
        <Ionicons name="business-outline" size={18} color="#6B7280" />
        <Text style={styles.orgContextText}>{currentOrg.name}</Text>
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>{t('selectEvent.noEvents')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('selectEvent.noEventsMessage')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
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
  orgContext: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  orgContextText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  list: {
    padding: 16,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  eventItemSelected: {
    borderWidth: 2,
    borderColor: '#1F2937',
  },
  eventIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventInfo: {
    flex: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  eventNameSelected: {
    color: '#1F2937',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  eventDate: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  eventDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
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
    lineHeight: 20,
  },
  selectOrgButton: {
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 20,
  },
  selectOrgButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
})
