import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Profile, Organization, OrganizationMember, Event, OrgRole } from '@/types/database'

interface AuthState {
  // Auth
  session: Session | null
  user: User | null
  profile: Profile | null
  
  // Organization
  organizations: (Organization & { role: OrgRole })[]
  currentOrg: (Organization & { role: OrgRole }) | null
  
  // Event
  events: Event[]
  currentEvent: Event | null
  
  // Loading states
  isLoading: boolean
  isInitialized: boolean
  
  // Actions
  setSession: (session: Session | null) => void
  loadUserData: () => Promise<void>
  setCurrentOrg: (org: Organization & { role: OrgRole }) => Promise<void>
  setCurrentEvent: (event: Event | null) => void
  signOut: () => Promise<void>
  reset: () => void
  
  // Permission helpers
  isAdmin: () => boolean
  isCashier: () => boolean
  canAccessFeature: (feature: 'pos' | 'wallets' | 'recharge' | 'settings' | 'refunds') => boolean
}

const initialState = {
  session: null,
  user: null,
  profile: null,
  organizations: [],
  currentOrg: null,
  events: [],
  currentEvent: null,
  isLoading: true,
  isInitialized: false,
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...initialState,

  setSession: (session) => {
    set({ session, user: session?.user ?? null })
  },

  loadUserData: async () => {
    const { session } = get()
    if (!session?.user) {
      set({ isLoading: false, isInitialized: true })
      return
    }

    set({ isLoading: true })

    try {
      // Load profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      // Load organization memberships with org details
      const { data: memberships } = await supabase
        .from('organization_members')
        .select(`
          role,
          org_id,
          organizations (*)
        `)
        .eq('user_id', session.user.id)

      const organizations = (memberships ?? [])
        .filter(m => m.organizations)
        .map(m => ({
          ...(m.organizations as Organization),
          role: m.role,
        }))

      // Determine current org (use last_org_id from profile or first org)
      let currentOrg = organizations[0] ?? null
      if (profile?.last_org_id) {
        const lastOrg = organizations.find(o => o.id === profile.last_org_id)
        if (lastOrg) currentOrg = lastOrg
      }

      // Load events for current org
      let events: Event[] = []
      let currentEvent: Event | null = null
      
      if (currentOrg) {
        const { data: eventsData } = await supabase
          .from('events')
          .select('*')
          .eq('org_id', currentOrg.id)
          .in('status', ['active', 'draft'])
          .order('starts_at', { ascending: false })

        events = eventsData ?? []
        // Select first active event, or first draft
        currentEvent = events.find(e => e.status === 'active') ?? events[0] ?? null
      }

      set({
        profile,
        organizations,
        currentOrg,
        events,
        currentEvent,
        isLoading: false,
        isInitialized: true,
      })
    } catch (error) {
      console.error('Error loading user data:', error)
      set({ isLoading: false, isInitialized: true })
    }
  },

  setCurrentOrg: async (org) => {
    const { session } = get()
    
    set({ currentOrg: org, currentEvent: null, events: [] })

    // Update last_org_id in profile
    if (session?.user) {
      await supabase
        .from('profiles')
        .upsert({ 
          user_id: session.user.id, 
          last_org_id: org.id 
        })
    }

    // Load events for new org
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', org.id)
      .in('status', ['active', 'draft'])
      .order('starts_at', { ascending: false })

    const events = eventsData ?? []
    const currentEvent = events.find(e => e.status === 'active') ?? events[0] ?? null

    set({ events, currentEvent })
  },

  setCurrentEvent: (event) => {
    set({ currentEvent: event })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    get().reset()
  },

  reset: () => {
    set(initialState)
  },

  isAdmin: () => {
    const { currentOrg } = get()
    return currentOrg?.role === 'owner' || currentOrg?.role === 'admin'
  },

  isCashier: () => {
    const { currentOrg } = get()
    return currentOrg?.role === 'cashier'
  },

  canAccessFeature: (feature) => {
    const { currentOrg } = get()
    if (!currentOrg) return false

    const role = currentOrg.role
    
    switch (feature) {
      case 'pos':
        // Todos pueden usar POS
        return true
      case 'wallets':
        // Solo admin/owner pueden gestionar wallets (crear, editar)
        return role === 'owner' || role === 'admin'
      case 'recharge':
        // Todos pueden recargar
        return true
      case 'settings':
        // Solo admin/owner
        return role === 'owner' || role === 'admin'
      case 'refunds':
        // Solo admin/owner
        return role === 'owner' || role === 'admin'
      default:
        return false
    }
  },
}))
