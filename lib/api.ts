import { supabase } from './supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL || ''

// ── Types ────────────────────────────────────────────────────

export interface CartItem {
  eventProductId: string
  quantity: number
  unitPriceCents: number
}

export interface CoveredItem {
  eventProductId: string
  passProductId: string
  passName: string
  savedCents: number
}

export interface PaymentRequest {
  code5: string
  eventId: string
  orgId: string
  items: CartItem[]
  notes?: string
}

export interface PaymentResponse {
  success: boolean
  movement?: {
    id: string
    amountCents: number
    originalAmountCents: number
    walletId: string | null
    walletName: string | null
    newBalanceCents: number | null
    paymentMethod: 'qr' | 'cash'
    coveredItems: CoveredItem[]
  }
  error?: string
}

export interface WalletInfo {
  id: string
  name: string | null
  phone: string | null
  balanceCents: number
}

export interface BalanceCheckResponse {
  success: boolean
  wallet?: WalletInfo
  error?: string
}

export interface WalletPass {
  passProductId: string
  passName: string
  coveredProductIds: string[]
}

export interface WalletPassesResponse {
  success: boolean
  passes: WalletPass[]
  error?: string
}

// ── Auth helper ──────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('No autorizado. Inicia sesión de nuevo.')
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  }
}

// ── API calls ────────────────────────────────────────────────

/**
 * Verifica el saldo de una wallet por su código QR.
 * Now calls the server-side API instead of direct Supabase queries.
 */
export async function checkWalletBalance(
  code5: string,
  eventId: string,
  orgId: string,
): Promise<BalanceCheckResponse> {
  try {
    console.log(`[API] Checking wallet: code5=${code5}, eventId=${eventId}, orgId=${orgId}`)

    const headers = await getAuthHeaders()
    const params = new URLSearchParams({ code5, eventId, orgId })
    const res = await fetch(`${API_URL}/api/pos/payment?${params}`, {
      method: 'GET',
      headers,
    })

    const data = await res.json()

    if (!res.ok) {
      return { success: false, error: data.error || 'Error al verificar el saldo.' }
    }

    return data as BalanceCheckResponse
  } catch (error: any) {
    console.error('[API] Error:', error)
    return {
      success: false,
      error: error.message || 'Error al verificar el saldo',
    }
  }
}

/**
 * Fetch active passes for a wallet.
 * Returns which passes the wallet has and which products they cover.
 */
export async function getWalletPasses(
  walletId: string,
  eventId: string,
  orgId: string,
): Promise<WalletPassesResponse> {
  try {
    console.log(`[API] Getting wallet passes: walletId=${walletId}`)

    const headers = await getAuthHeaders()
    const params = new URLSearchParams({ walletId, eventId, orgId })
    const res = await fetch(`${API_URL}/api/pos/wallet-passes?${params}`, {
      method: 'GET',
      headers,
    })

    const data = await res.json()

    console.log("[API] Wallet passes: ", data)

    if (!res.ok) {
      return { success: false, passes: [], error: data.error || 'Error al buscar pases.' }
    }

    return data as WalletPassesResponse
  } catch (error: any) {
    console.error('[API] Error fetching passes:', error)
    return {
      success: false,
      passes: [],
      error: error.message || 'Error al buscar pases',
    }
  }
}

/**
 * Procesa un pago via the server-side API.
 * The server handles pass validation, balance check, and all mutations.
 */
export async function processPayment(
  request: PaymentRequest,
): Promise<PaymentResponse> {
  try {
    console.log(`[API] Processing payment:`, request)

    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/api/pos/payment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...request,
        paymentMethod: 'qr',
      }),
    })

    const data = await res.json()

    console.log("[API] Payment processed: ", data);

    if (!res.ok) {
      return { success: false, error: data.error || 'Error al procesar el pago.' }
    }

    return data as PaymentResponse
  } catch (error: any) {
    console.error('[API] Error:', error)
    return {
      success: false,
      error: error.message || 'Error al procesar el pago',
    }
  }
}

/**
 * Formatea centavos a pesos mexicanos
 */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
