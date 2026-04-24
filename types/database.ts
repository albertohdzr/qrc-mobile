export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type OrgRole = 'owner' | 'admin' | 'cashier'
export type WalletStatus = 'active' | 'blocked'
export type QrStatus = 'available' | 'assigned' | 'inactive'
export type QrType = 'bracelet' | 'card' | 'digital'
export type MovementType = 'payment' | 'deposit' | 'initial_deposit' | 'refund' | 'transfer_out' | 'transfer_in'
export type EventStatus = 'draft' | 'active' | 'paused' | 'ended'
export type ProductStatus = 'active' | 'inactive'
export type ProductType = 'limited' | 'unlimited'

export interface Profile {
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  last_org_id: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  created_by: string
  updated_by: string | null
  created_at: string
}

export interface OrganizationMember {
  org_id: string
  user_id: string
  role: OrgRole
  created_by: string | null
  updated_by: string | null
  created_at: string
}

export interface Event {
  id: string
  org_id: string
  name: string
  status: EventStatus
  starts_at: string | null
  ends_at: string | null
  description: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Wallet {
  id: string
  org_id: string
  event_id: string
  phone: string | null
  name: string | null
  status: WalletStatus
  balance_cents: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Qr {
  id: string
  org_id: string
  code_5: string
  key: string
  wallet_id: string | null
  status: QrStatus
  type: QrType
  batch_id: string | null
  image_svg: string | null
  manufactured_at: string
  created_by: string | null
  updated_by: string | null
  created_at: string
}

export interface QrBatch {
  id: string
  org_id: string
  name: string
  notes: string | null
  manufactured_at: string
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Movement {
  id: string
  org_id: string
  wallet_id: string
  event_id: string
  type: MovementType
  amount_cents: number
  qr_id: string | null
  original_movement_id: string | null
  linked_movement_id: string | null
  reference: string | null
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
}

export interface Product {
  id: string
  org_id: string
  name: string
  type: ProductType
  status: ProductStatus
  base_price_cents: number
  image_path: string | null
  description: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface EventArea {
  id: string
  org_id: string
  event_id: string
  name: string
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface EventProduct {
  id: string
  org_id: string
  event_id: string
  base_product_id: string
  initial_stock: number | null
  stock: number | null
  price_cents: number
  cost_cents: number | null
  is_pass: boolean
  status: ProductStatus
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface EventProductArea {
  id: string
  event_product_id: string
  area_id: string
  created_at: string
}

export interface MovementItem {
  id: string
  org_id: string
  movement_id: string
  event_product_id: string
  base_product_id: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  created_by: string | null
  updated_by: string | null
  created_at: string
}

export interface RefundItem {
  id: string
  org_id: string
  refund_movement_id: string
  original_movement_item_id: string
  quantity: number
  amount_cents: number
  created_by: string | null
  updated_by: string | null
  created_at: string
}

// Supabase Database types
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { user_id: string }
        Update: Partial<Profile>
        Relationships: []
      }
      organizations: {
        Row: Organization
        Insert: Omit<Organization, 'id' | 'created_at'> & { id?: string }
        Update: Partial<Organization>
        Relationships: []
      }
      organization_members: {
        Row: OrganizationMember
        Insert: Omit<OrganizationMember, 'created_at'>
        Update: Partial<OrganizationMember>
        Relationships: []
      }
      events: {
        Row: Event
        Insert: Omit<Event, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Event>
        Relationships: []
      }
      wallets: {
        Row: Wallet
        Insert: Omit<Wallet, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Wallet>
        Relationships: []
      }
      qrs: {
        Row: Qr
        Insert: Omit<Qr, 'id' | 'created_at'> & { id?: string }
        Update: Partial<Qr>
        Relationships: []
      }
      qr_batches: {
        Row: QrBatch
        Insert: Omit<QrBatch, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<QrBatch>
        Relationships: []
      }
      movements: {
        Row: Movement
        Insert: Omit<Movement, 'id' | 'created_at'> & { id?: string }
        Update: Partial<Movement>
        Relationships: []
      }
      products: {
        Row: Product
        Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Product>
        Relationships: []
      }
      event_areas: {
        Row: EventArea
        Insert: Omit<EventArea, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<EventArea>
        Relationships: []
      }
      event_products: {
        Row: EventProduct
        Insert: Omit<EventProduct, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<EventProduct>
        Relationships: []
      }
      movement_items: {
        Row: MovementItem
        Insert: Omit<MovementItem, 'id' | 'created_at'> & { id?: string }
        Update: Partial<MovementItem>
        Relationships: []
      }
      refund_items: {
        Row: RefundItem
        Insert: Omit<RefundItem, 'id' | 'created_at'> & { id?: string }
        Update: Partial<RefundItem>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_event_report: {
        Args: {
          p_event_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      org_role: OrgRole
      wallet_status: WalletStatus
      qr_status: QrStatus
      qr_type: QrType
      movement_type: MovementType
      event_status: EventStatus
      product_status: ProductStatus
      product_type: ProductType
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
