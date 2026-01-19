import { create } from 'zustand'
import { EventProduct, Product } from '@/types/database'

export interface CartItem {
  eventProduct: EventProduct
  baseProduct: Product
  quantity: number
}

interface CartState {
  // Wallet info from QR scan
  scannedCode5: string | null
  walletId: string | null
  walletName: string | null
  walletPhone: string | null
  walletBalanceCents: number

  // Cart items
  items: CartItem[]

  // Actions
  setWalletInfo: (info: {
    code5: string
    walletId: string
    walletName: string | null
    walletPhone: string | null
    balanceCents: number
  }) => void
  clearWallet: () => void
  
  addItem: (eventProduct: EventProduct, baseProduct: Product) => void
  removeItem: (eventProductId: string) => void
  updateQuantity: (eventProductId: string, quantity: number) => void
  clearCart: () => void
  
  // Computed
  getTotalCents: () => number
  getItemCount: () => number
  hasEnoughBalance: () => boolean
}

export const useCartStore = create<CartState>((set, get) => ({
  // Initial state
  scannedCode5: null,
  walletId: null,
  walletName: null,
  walletPhone: null,
  walletBalanceCents: 0,
  items: [],

  setWalletInfo: (info) => {
    set({
      scannedCode5: info.code5,
      walletId: info.walletId,
      walletName: info.walletName,
      walletPhone: info.walletPhone,
      walletBalanceCents: info.balanceCents,
    })
  },

  clearWallet: () => {
    set({
      scannedCode5: null,
      walletId: null,
      walletName: null,
      walletPhone: null,
      walletBalanceCents: 0,
      items: [],
    })
  },

  addItem: (eventProduct, baseProduct) => {
    const { items } = get()
    const existingIndex = items.findIndex(
      (item) => item.eventProduct.id === eventProduct.id
    )

    if (existingIndex >= 0) {
      // Incrementar cantidad si ya existe
      const newItems = [...items]
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        quantity: newItems[existingIndex].quantity + 1,
      }
      set({ items: newItems })
    } else {
      // Agregar nuevo item
      set({
        items: [...items, { eventProduct, baseProduct, quantity: 1 }],
      })
    }
  },

  removeItem: (eventProductId) => {
    set({
      items: get().items.filter(
        (item) => item.eventProduct.id !== eventProductId
      ),
    })
  },

  updateQuantity: (eventProductId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(eventProductId)
      return
    }

    set({
      items: get().items.map((item) =>
        item.eventProduct.id === eventProductId
          ? { ...item, quantity }
          : item
      ),
    })
  },

  clearCart: () => {
    set({ items: [] })
  },

  getTotalCents: () => {
    return get().items.reduce(
      (total, item) => total + item.eventProduct.price_cents * item.quantity,
      0
    )
  },

  getItemCount: () => {
    return get().items.reduce((count, item) => count + item.quantity, 0)
  },

  hasEnoughBalance: () => {
    return get().walletBalanceCents >= get().getTotalCents()
  },
}))
