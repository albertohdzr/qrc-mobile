import { supabase } from './supabase'

const API_BASE_URL = 'https://qrc.team5526.com/api'

// Types
export interface CartItem {
  eventProductId: string
  quantity: number
  unitPriceCents: number
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
    walletId: string
    walletName: string | null
    newBalanceCents: number
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

/**
 * Obtiene el token de autenticación actual
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

/**
 * Realiza una petición autenticada a la API
 */
async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken()
  
  if (!token) {
    throw new Error('No hay sesión activa')
  }

  const url = `${API_BASE_URL}${endpoint}`
  console.log(`[API] ${options.method || 'GET'} ${url}`)

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })

  // Verificar si la respuesta es JSON
  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text()
    console.error(`[API] Respuesta no-JSON (${response.status}):`, text.substring(0, 200))
    throw new Error(`El servidor devolvió una respuesta inválida (${response.status})`)
  }

  const data = await response.json()
  
  if (!response.ok) {
    console.error(`[API] Error ${response.status}:`, data)
    throw new Error(data.error || `Error ${response.status}`)
  }

  return data
}

/**
 * Verifica el saldo de una wallet por su código QR
 */
export async function checkWalletBalance(
  code5: string,
  eventId: string,
  orgId: string
): Promise<BalanceCheckResponse> {
  try {
    const params = new URLSearchParams({
      code5,
      eventId,
      orgId,
    })

    const data = await fetchWithAuth<BalanceCheckResponse>(
      `/pos/payment?${params.toString()}`,
      { method: 'GET' }
    )

    return data
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al verificar el saldo',
    }
  }
}

/**
 * Procesa un pago
 */
export async function processPayment(
  request: PaymentRequest
): Promise<PaymentResponse> {
  try {
    const data = await fetchWithAuth<PaymentResponse>(
      '/pos/payment',
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    )

    return data
  } catch (error: any) {
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
