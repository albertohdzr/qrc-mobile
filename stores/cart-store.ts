import { create } from 'zustand'
import { EventProduct, Product } from '@/types/database'
import { WalletPass } from '@/lib/api'

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

  // Wallet passes
  walletPasses: WalletPass[]

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
  setWalletPasses: (passes: WalletPass[]) => void
  clearWallet: () => void
  
  addItem: (eventProduct: EventProduct, baseProduct: Product) => void
  removeItem: (eventProductId: string) => void
  updateQuantity: (eventProductId: string, quantity: number) => void
  clearCart: () => void
  
  // Computed
  getTotalCents: () => number
  getEffectiveTotalCents: () => number
  getItemCount: () => number
  hasEnoughBalance: () => boolean
  isItemCoveredByPass: (eventProductId: string) => WalletPass | null
  getCoveredProductIds: () => Set<string>
}

export const useCartStore = create<CartState>((set, get) => ({
  // Initial state
  scannedCode5: null,
  walletId: null,
  walletName: null,
  walletPhone: null,
  walletBalanceCents: 0,
  walletPasses: [],
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

  setWalletPasses: (passes) => {
    set({ walletPasses: passes })
  },

  clearWallet: () => {
    set({
      scannedCode5: null,
      walletId: null,
      walletName: null,
      walletPhone: null,
      walletBalanceCents: 0,
      walletPasses: [],
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

  /** Total without pass discounts */
  getTotalCents: () => {
    return get().items.reduce(
      (total, item) => total + item.eventProduct.price_cents * item.quantity,
      0
    )
  },

  /** Total with pass discounts applied — what will actually be charged */
  getEffectiveTotalCents: () => {
    const { items } = get()
    const coveredIds = get().getCoveredProductIds()
    return items.reduce((total, item) => {
      if (coveredIds.has(item.eventProduct.id)) return total // free
      return total + item.eventProduct.price_cents * item.quantity
    }, 0)
  },

  getItemCount: () => {
    return get().items.reduce((count, item) => count + item.quantity, 0)
  },

  hasEnoughBalance: () => {
    return get().walletBalanceCents >= get().getEffectiveTotalCents()
  },

  /** Check if a specific product is covered by any of the wallet's passes */
  isItemCoveredByPass: (eventProductId: string): WalletPass | null => {
    const { walletPasses } = get()
    for (const pass of walletPasses) {
      if (pass.coveredProductIds.includes(eventProductId)) {
        return pass
      }
    }
    return null
  },

  /** Get a Set of all product IDs covered by passes */
  getCoveredProductIds: (): Set<string> => {
    const { walletPasses } = get()
    const ids = new Set<string>()
    for (const pass of walletPasses) {
      for (const id of pass.coveredProductIds) {
        ids.add(id)
      }
    }
    return ids
  },
}))
