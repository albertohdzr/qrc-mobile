import { supabase } from './supabase'

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
 * Verifica el saldo de una wallet por su código QR
 * (Consulta directa a Supabase)
 */
export async function checkWalletBalance(
  code5: string,
  eventId: string,
  orgId: string
): Promise<BalanceCheckResponse> {
  try {
    console.log(`[API] Checking wallet: code5=${code5}, eventId=${eventId}, orgId=${orgId}`)

    // Buscar el QR por code_5 y obtener la wallet asociada
    const { data: qr, error: qrError } = await (supabase
      .from('qrs') as any)
      .select(`
        id,
        code_5,
        status,
        wallet_id,
        org_id,
        wallet:wallets(
          id,
          name,
          phone,
          status,
          balance_cents,
          event_id
        )
      `)
      .eq('org_id', orgId)
      .eq('code_5', code5)
      .maybeSingle()

    if (qrError) {
      console.error('[API] Error buscando QR:', qrError)
      return { success: false, error: 'Error al buscar el QR.' }
    }

    if (!qr) {
      return { success: false, error: 'QR no encontrado.' }
    }

    if (qr.status !== 'assigned' || !qr.wallet_id) {
      return { success: false, error: 'Este QR no tiene una cartera asignada.' }
    }

    const wallet = qr.wallet as {
      id: string
      name: string | null
      phone: string | null
      status: 'active' | 'blocked'
      balance_cents: number
      event_id: string
    } | null

    if (!wallet) {
      return { success: false, error: 'Cartera no encontrada.' }
    }

    if (wallet.status !== 'active') {
      return { success: false, error: 'La cartera está bloqueada.' }
    }

    if (wallet.event_id !== eventId) {
      return { success: false, error: 'Esta cartera no pertenece a este evento.' }
    }

    console.log(`[API] Wallet found: ${wallet.id}, balance: ${wallet.balance_cents}`)

    return {
      success: true,
      wallet: {
        id: wallet.id,
        name: wallet.name,
        phone: wallet.phone,
        balanceCents: wallet.balance_cents,
      },
    }
  } catch (error: any) {
    console.error('[API] Error:', error)
    return {
      success: false,
      error: error.message || 'Error al verificar el saldo',
    }
  }
}

/**
 * Procesa un pago
 * (Transacción directa en Supabase)
 */
export async function processPayment(
  request: PaymentRequest
): Promise<PaymentResponse> {
  try {
    console.log(`[API] Processing payment:`, request)

    // 1. Buscar el QR y wallet
    const { data: qr, error: qrError } = await (supabase
      .from('qrs') as any)
      .select(`
        id,
        status,
        wallet_id,
        wallet:wallets(
          id,
          name,
          status,
          balance_cents,
          event_id
        )
      `)
      .eq('org_id', request.orgId)
      .eq('code_5', request.code5)
      .maybeSingle()

    if (qrError || !qr) {
      return { success: false, error: 'QR no encontrado.' }
    }

    if (qr.status !== 'assigned' || !qr.wallet_id) {
      return { success: false, error: 'QR sin cartera asignada.' }
    }

    const wallet = qr.wallet as {
      id: string
      name: string | null
      status: 'active' | 'blocked'
      balance_cents: number
      event_id: string
    }

    if (!wallet || wallet.status !== 'active') {
      return { success: false, error: 'Cartera no válida o bloqueada.' }
    }

    if (wallet.event_id !== request.eventId) {
      return { success: false, error: 'Cartera no pertenece a este evento.' }
    }

    // 2. Calcular total
    const totalCents = request.items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0
    )

    // 3. Verificar saldo
    if (wallet.balance_cents < totalCents) {
      return {
        success: false,
        error: `Saldo insuficiente. Disponible: ${formatCurrency(wallet.balance_cents)}, Requerido: ${formatCurrency(totalCents)}`,
      }
    }

    // 4. Verificar productos y obtener base_product_id
    const { data: eventProducts, error: productsError } = await (supabase
      .from('event_products') as any)
      .select('id, base_product_id, stock, status')
      .in('id', request.items.map((item) => item.eventProductId))

    if (productsError) {
      return { success: false, error: 'Error al verificar productos.' }
    }

    interface EventProduct {
      id: string
      base_product_id: string
      stock: number | null
      status: string
    }
    
    const productMap = new Map<string, EventProduct>(
      (eventProducts ?? []).map((p: EventProduct) => [p.id, p])
    )

    // Verificar cada producto
    for (const item of request.items) {
      const product = productMap.get(item.eventProductId)
      if (!product) {
        return { success: false, error: `Producto no encontrado.` }
      }
      if (product.status !== 'active') {
        return { success: false, error: 'Producto no disponible.' }
      }
      if (product.stock !== null && product.stock < item.quantity) {
        return { success: false, error: 'Stock insuficiente.' }
      }
    }

    // 5. Crear el movimiento
    const { data: movement, error: movementError } = await (supabase
      .from('movements') as any)
      .insert({
        org_id: request.orgId,
        wallet_id: wallet.id,
        event_id: request.eventId,
        type: 'payment',
        amount_cents: totalCents,
        qr_id: qr.id,
        notes: request.notes || null,
      })
      .select()
      .single()

    if (movementError) {
      console.error('[API] Error creando movimiento:', movementError)
      return { success: false, error: 'Error al registrar el pago.' }
    }

    // 6. Crear los items del movimiento
    const movementItems = request.items.map((item) => {
      const product = productMap.get(item.eventProductId)
      return {
        org_id: request.orgId,
        movement_id: movement.id,
        event_product_id: item.eventProductId,
        base_product_id: product?.base_product_id,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
        line_total_cents: item.unitPriceCents * item.quantity,
      }
    })

    const { error: itemsError } = await (supabase
      .from('movement_items') as any)
      .insert(movementItems)

    if (itemsError) {
      // Rollback: eliminar movimiento
      await (supabase.from('movements') as any).delete().eq('id', movement.id)
      console.error('[API] Error creando items:', itemsError)
      return { success: false, error: 'Error al registrar productos.' }
    }

    // 7. Actualizar saldo de la wallet
    const newBalanceCents = wallet.balance_cents - totalCents
    const { error: walletError } = await (supabase
      .from('wallets') as any)
      .update({ balance_cents: newBalanceCents })
      .eq('id', wallet.id)

    if (walletError) {
      // Rollback
      await (supabase.from('movement_items') as any).delete().eq('movement_id', movement.id)
      await (supabase.from('movements') as any).delete().eq('id', movement.id)
      console.error('[API] Error actualizando wallet:', walletError)
      return { success: false, error: 'Error al actualizar saldo.' }
    }

    // 8. Actualizar stock
    for (const item of request.items) {
      const product = productMap.get(item.eventProductId)
      if (product && product.stock !== null) {
        await (supabase
          .from('event_products') as any)
          .update({ stock: product.stock - item.quantity })
          .eq('id', item.eventProductId)
      }
    }

    console.log(`[API] Payment successful: ${movement.id}, new balance: ${newBalanceCents}`)

    return {
      success: true,
      movement: {
        id: movement.id,
        amountCents: totalCents,
        walletId: wallet.id,
        walletName: wallet.name,
        newBalanceCents,
      },
    }
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
