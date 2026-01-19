import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { useCartStore, CartItem } from '@/stores/cart-store'
import { supabase } from '@/lib/supabase'
import { processPayment, formatCurrency } from '@/lib/api'
import { EventProduct, Product } from '@/types/database'

interface ProductWithBase extends EventProduct {
  base_product: Product
}

export default function CheckoutScreen() {
  const { currentOrg, currentEvent } = useAuthStore()
  const {
    scannedCode5,
    walletName,
    walletPhone,
    walletBalanceCents,
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    clearWallet,
    getTotalCents,
    getItemCount,
    hasEnoughBalance,
  } = useCartStore()

  const [products, setProducts] = useState<ProductWithBase[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (!scannedCode5) {
      router.replace('/(tabs)')
      return
    }
    loadProducts()
  }, [currentEvent])

  const loadProducts = async () => {
    if (!currentEvent || !currentOrg) return

    setIsLoadingProducts(true)
    try {
      const { data, error } = await supabase
        .from('event_products')
        .select(`
          *,
          base_product:products(*)
        `)
        .eq('event_id', currentEvent.id)
        .eq('org_id', currentOrg.id)
        .eq('status', 'active')

      if (error) throw error

      setProducts((data as ProductWithBase[]) ?? [])
    } catch (error) {
      console.error('Error loading products:', error)
      Alert.alert('Error', 'No se pudieron cargar los productos')
    } finally {
      setIsLoadingProducts(false)
    }
  }

  const handleAddProduct = (product: ProductWithBase) => {
    // Verificar stock
    if (product.stock !== null) {
      const currentItem = items.find(i => i.eventProduct.id === product.id)
      const currentQty = currentItem?.quantity ?? 0
      if (currentQty >= product.stock) {
        Alert.alert('Sin Stock', 'No hay suficiente stock disponible')
        return
      }
    }

    addItem(product, product.base_product)
  }

  const handleProcessPayment = async () => {
    if (!scannedCode5 || !currentOrg || !currentEvent) return
    if (items.length === 0) {
      Alert.alert('Carrito Vacío', 'Agrega productos al carrito para continuar')
      return
    }
    if (!hasEnoughBalance()) {
      Alert.alert('Saldo Insuficiente', 'La wallet no tiene saldo suficiente para esta compra')
      return
    }

    Alert.alert(
      'Confirmar Pago',
      `¿Procesar pago de ${formatCurrency(getTotalCents())}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setIsProcessing(true)
            try {
              const result = await processPayment({
                code5: scannedCode5,
                eventId: currentEvent.id,
                orgId: currentOrg.id,
                items: items.map(item => ({
                  eventProductId: item.eventProduct.id,
                  quantity: item.quantity,
                  unitPriceCents: item.eventProduct.price_cents,
                })),
              })

              if (!result.success) {
                Alert.alert('Error', result.error || 'No se pudo procesar el pago')
                return
              }

              // Mostrar éxito
              Alert.alert(
                '¡Pago Exitoso!',
                `Se cobraron ${formatCurrency(result.movement!.amountCents)}\n\nNuevo saldo: ${formatCurrency(result.movement!.newBalanceCents)}`,
                [
                  {
                    text: 'Nueva Venta',
                    onPress: () => {
                      clearWallet()
                      router.replace('/scanner')
                    },
                  },
                  {
                    text: 'Volver al Inicio',
                    onPress: () => {
                      clearWallet()
                      router.replace('/(tabs)')
                    },
                  },
                ]
              )
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Error al procesar el pago')
            } finally {
              setIsProcessing(false)
            }
          },
        },
      ]
    )
  }

  const handleCancel = () => {
    Alert.alert(
      'Cancelar Venta',
      '¿Estás seguro de que quieres cancelar esta venta?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, Cancelar',
          style: 'destructive',
          onPress: () => {
            clearWallet()
            router.replace('/(tabs)')
          },
        },
      ]
    )
  }

  const totalCents = getTotalCents()
  const remainingBalance = walletBalanceCents - totalCents

  const renderProduct = ({ item: product }: { item: ProductWithBase }) => {
    const cartItem = items.find(i => i.eventProduct.id === product.id)
    const quantity = cartItem?.quantity ?? 0

    return (
      <View style={styles.productCard}>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>
            {product.base_product.name}
          </Text>
          <Text style={styles.productPrice}>
            {formatCurrency(product.price_cents)}
          </Text>
          {product.stock !== null && (
            <Text style={styles.productStock}>
              Stock: {product.stock}
            </Text>
          )}
        </View>
        
        <View style={styles.quantityControls}>
          {quantity > 0 ? (
            <>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => updateQuantity(product.id, quantity - 1)}
              >
                <Ionicons name="remove" size={20} color="#1F2937" />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity
                style={[styles.quantityButton, styles.quantityButtonAdd]}
                onPress={() => handleAddProduct(product)}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.quantityButton, styles.quantityButtonAdd]}
              onPress={() => handleAddProduct(product)}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemName} numberOfLines={1}>
          {item.baseProduct.name}
        </Text>
        <Text style={styles.cartItemPrice}>
          {item.quantity} x {formatCurrency(item.eventProduct.price_cents)}
        </Text>
      </View>
      <Text style={styles.cartItemTotal}>
        {formatCurrency(item.eventProduct.price_cents * item.quantity)}
      </Text>
      <TouchableOpacity
        style={styles.cartItemRemove}
        onPress={() => removeItem(item.eventProduct.id)}
      >
        <Ionicons name="trash-outline" size={18} color="#DC2626" />
      </TouchableOpacity>
    </View>
  )

  return (
    <View style={styles.container}>
      {/* Header with wallet info */}
      <View style={styles.walletHeader}>
        <View style={styles.walletInfo}>
          <View style={styles.walletIcon}>
            <Ionicons name="wallet" size={24} color="#1F2937" />
          </View>
          <View style={styles.walletDetails}>
            <Text style={styles.walletName}>
              {walletName || walletPhone || `QR: ${scannedCode5}`}
            </Text>
            <Text style={styles.walletBalance}>
              Saldo: {formatCurrency(walletBalanceCents)}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.rescanButton} onPress={handleCancel}>
          <Ionicons name="close" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Products */}
      <View style={styles.productsSection}>
        <Text style={styles.sectionTitle}>Productos</Text>
        {isLoadingProducts ? (
          <ActivityIndicator size="large" color="#1F2937" style={styles.loader} />
        ) : products.length === 0 ? (
          <View style={styles.emptyProducts}>
            <Ionicons name="pricetag-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No hay productos disponibles</Text>
          </View>
        ) : (
          <FlatList
            data={products}
            renderItem={renderProduct}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.productsGrid}
          />
        )}
      </View>

      {/* Cart */}
      <View style={styles.cartSection}>
        <View style={styles.cartHeader}>
          <Text style={styles.sectionTitle}>Carrito</Text>
          {items.length > 0 && (
            <TouchableOpacity onPress={clearCart}>
              <Text style={styles.clearCartText}>Limpiar</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {items.length === 0 ? (
          <View style={styles.emptyCart}>
            <Text style={styles.emptyCartText}>
              Agrega productos al carrito
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderCartItem}
            keyExtractor={(item) => item.eventProduct.id}
            style={styles.cartList}
          />
        )}
      </View>

      {/* Footer with totals */}
      <View style={styles.footer}>
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal ({getItemCount()} items)</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalCents)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Saldo después del pago</Text>
            <Text style={[
              styles.totalValue,
              remainingBalance < 0 && styles.insufficientBalance
            ]}>
              {formatCurrency(remainingBalance)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.payButton,
            (items.length === 0 || !hasEnoughBalance() || isProcessing) && styles.payButtonDisabled,
          ]}
          onPress={handleProcessPayment}
          disabled={items.length === 0 || !hasEnoughBalance() || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card" size={24} color="#fff" />
              <Text style={styles.payButtonText}>
                Cobrar {formatCurrency(totalCents)}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletDetails: {
    flex: 1,
  },
  walletName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  walletBalance: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '500',
    marginTop: 2,
  },
  rescanButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productsSection: {
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  loader: {
    paddingVertical: 40,
  },
  emptyProducts: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  productsGrid: {
    paddingHorizontal: 16,
    gap: 12,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    width: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  productInfo: {
    marginBottom: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  productStock: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonAdd: {
    backgroundColor: '#1F2937',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    minWidth: 24,
    textAlign: 'center',
  },
  cartSection: {
    flex: 1,
    marginTop: 16,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
  },
  clearCartText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '500',
  },
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCartText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  cartList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  cartItemPrice: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  cartItemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 12,
  },
  cartItemRemove: {
    padding: 4,
  },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  totals: {
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  insufficientBalance: {
    color: '#DC2626',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  payButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
})
