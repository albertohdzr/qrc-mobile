import { formatCurrency, processPayment, getWalletPasses } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { CartItem, useCartStore } from '@/stores/cart-store'
import { EventArea, EventProduct, Product } from '@/types/database'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { t } from '@/lib/i18n'
import React, { useEffect, useState, useMemo } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

interface ProductWithBase extends EventProduct {
  base_product: Product
  event_product_areas: { area_id: string; area: EventArea | null }[]
}

const STORAGE_BUCKET = 'storage'

const getProductImageUrl = (imagePath?: string | null) => {
  const trimmed = imagePath?.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('data:')) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed

  const parts = trimmed.split('/')
  if (parts.length >= 2) {
    const bucketName = parts[0]
    const filePath = parts.slice(1).join('/')
    return supabase.storage.from(bucketName).getPublicUrl(filePath).data.publicUrl
  }

  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(trimmed).data.publicUrl
}

export default function CheckoutScreen() {
  const { currentOrg, currentEvent, selectedAreaId, isAdmin } = useAuthStore()
  const {
    scannedCode5,
    walletId,
    walletName,
    walletPhone,
    walletBalanceCents,
    walletPasses,
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    clearWallet,
    setWalletPasses,
    getTotalCents,
    getEffectiveTotalCents,
    getItemCount,
    hasEnoughBalance,
    isItemCoveredByPass,
  } = useCartStore()

  const [products, setProducts] = useState<ProductWithBase[]>([])
  const [areas, setAreas] = useState<EventArea[]>([])
  const [selectedArea, setSelectedArea] = useState<string | null>(selectedAreaId)

  // Sort areas so the selected one is always first (visible in the slider)
  const sortedAreas = useMemo(() => {
    if (!selectedArea || areas.length === 0) return areas
    const selected = areas.filter(a => a.id === selectedArea)
    const rest = areas.filter(a => a.id !== selectedArea)
    return [...selected, ...rest]
  }, [areas, selectedArea])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)

  useEffect(() => {
    if (!scannedCode5) {
      router.back()
      return
    }
    loadProducts()
    loadWalletPasses()
  }, [currentEvent])

  const loadWalletPasses = async () => {
    if (!currentEvent || !currentOrg || !walletId) return
    try {
      const result = await getWalletPasses(walletId, currentEvent.id, currentOrg.id)
      if (result.success) {
        setWalletPasses(result.passes)
      }
    } catch (error) {
      console.error('Error loading wallet passes:', error)
    }
  }

  const loadProducts = async () => {
    if (!currentEvent || !currentOrg) return

    setIsLoadingProducts(true)
    try {
      const [{ data: areasData, error: areasError }, { data, error }] = await Promise.all([
        supabase
          .from('event_areas')
          .select('*')
          .eq('org_id', currentOrg.id)
          .eq('event_id', currentEvent.id)
          .order('name'),
        supabase
          .from('event_products')
          .select(`
            *,
            base_product:products(*),
            event_product_areas(area_id, area:event_areas(*))
          `)
          .eq('event_id', currentEvent.id)
          .eq('org_id', currentOrg.id)
          .eq('status', 'active'),
      ])

      if (areasError) {
        console.error('Error loading areas:', areasError)
      }
      if (error) throw error

      setAreas((areasData as EventArea[]) ?? [])
      setProducts((data as ProductWithBase[]) ?? [])
    } catch (error) {
      console.error('Error loading products:', error)
      Alert.alert(t('common.error'), t('checkout.couldNotLoadProducts'))
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
        Alert.alert(t('checkout.noStock'), t('checkout.noStockMessage'))
        return
      }
    }

    addItem(product, product.base_product)
  }

  const handleProcessPayment = async () => {
    if (!scannedCode5 || !currentOrg || !currentEvent) return
    if (items.length === 0) {
      Alert.alert(t('checkout.emptyCart'), t('checkout.emptyCartMessage'))
      return
    }
    if (!hasEnoughBalance()) {
      Alert.alert(t('checkout.insufficientBalance'), t('checkout.insufficientBalanceMessage'))
      return
    }

    Alert.alert(
      t('checkout.confirmPayment'),
      t('checkout.processPaymentConfirm', { amount: formatCurrency(getEffectiveTotalCents()) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
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
                Alert.alert(t('common.error'), result.error || t('checkout.paymentError'))
                return
              }

              // Mostrar éxito
              Alert.alert(
                t('checkout.paymentSuccess'),
                t('checkout.paymentSuccessMessage', { amount: formatCurrency(result.movement!.amountCents), newBalance: formatCurrency(result.movement!.newBalanceCents ?? 0) }),
                [
                  {
                    text: t('checkout.newSale'),
                    onPress: () => {
                      clearWallet()
                      router.replace('/scanner')
                    },
                  },
                  {
                    text: t('checkout.goHome'),
                    onPress: () => {
                      clearWallet()
                      router.dismissAll()
                    },
                  },
                ]
              )
            } catch (error: any) {
              Alert.alert(t('common.error'), error.message || t('checkout.paymentProcessingError'))
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
      t('checkout.cancelSale'),
      t('checkout.cancelSaleConfirm'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('checkout.yesCancelSale'),
          style: 'destructive',
          onPress: () => {
            clearWallet()
            router.back()
          },
        },
      ]
    )
  }

  const totalCents = getTotalCents()
  const effectiveTotalCents = getEffectiveTotalCents()
  const remainingBalance = walletBalanceCents - effectiveTotalCents
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredProducts = products.filter((product) => {
    // Only admins can see/sell pass products
    if (product.is_pass && !isAdmin()) return false
    if (selectedArea && !product.event_product_areas?.some(epa => epa.area_id === selectedArea)) return false
    if (!normalizedQuery) return true
    const name = product.base_product.name?.toLowerCase() ?? ''
    const description = product.base_product.description?.toLowerCase() ?? ''
    return name.includes(normalizedQuery) || description.includes(normalizedQuery)
  })

  const renderProduct = ({ item: product }: { item: ProductWithBase }) => {
    const cartItem = items.find(i => i.eventProduct.id === product.id)
    const quantity = cartItem?.quantity ?? 0
    const imageUri = getProductImageUrl(product.base_product.image_path)

    return (
      <View style={styles.productCard}>
        <View style={styles.productImageWrapper}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.productImage}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Ionicons name="image-outline" size={26} color="#9CA3AF" />
            </View>
          )}
          {product.stock === 0 && (
            <View style={styles.stockBadge}>
              <Text style={styles.stockBadgeText}>{t('checkout.soldOut')}</Text>
            </View>
          )}
          {product.is_pass && (
            <View style={styles.passProductBadge}>
              <Text style={styles.passProductBadgeText}>{t('checkout.pass')}</Text>
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>
            {product.base_product.name}
          </Text>
          <Text style={styles.productPrice}>
            {formatCurrency(product.price_cents)}
          </Text>
          {(() => {
            const pass = isItemCoveredByPass(product.id)
            return pass ? (
              <View style={styles.passBadge}>
                <Ionicons name="ticket-outline" size={10} color="#059669" />
                <Text style={styles.passBadgeText} numberOfLines={1}>{pass.passName}</Text>
              </View>
            ) : null
          })()}
          {product.stock !== null && (
            <Text style={styles.productStock}>
              Stock: {product.stock}
            </Text>
          )}
          {product.event_product_areas?.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {product.event_product_areas.map(epa => epa.area?.name ? (
                <View key={epa.area_id} style={styles.areaBadge}>
                  <Text style={styles.areaBadgeText} numberOfLines={1}>
                    {epa.area.name}
                  </Text>
                </View>
              ) : null)}
            </View>
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
        <View style={styles.productsHeader}>
          <Text style={styles.sectionTitle}>{t('checkout.products')}</Text>
          <View style={styles.resultsBadge}>
            <Text style={styles.resultsBadgeText}>{filteredProducts.length}</Text>
          </View>
        </View>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('checkout.searchPlaceholder')}
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        {areas.length > 0 && (
          <View style={styles.areasContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.areasScroll}
            >
              <TouchableOpacity
                style={[styles.areaChip, !selectedArea && styles.areaChipActive]}
                onPress={() => setSelectedArea(null)}
              >
                <Text style={[styles.areaChipText, !selectedArea && styles.areaChipTextActive]}>
                  {t('common.all')}
                </Text>
              </TouchableOpacity>
              {sortedAreas.map((area) => (
                <TouchableOpacity
                  key={area.id}
                  style={[styles.areaChip, selectedArea === area.id && styles.areaChipActive]}
                  onPress={() => setSelectedArea(area.id)}
                >
                  <Text style={[styles.areaChipText, selectedArea === area.id && styles.areaChipTextActive]}>
                    {area.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        {isLoadingProducts ? (
          <ActivityIndicator size="large" color="#1F2937" style={styles.loader} />
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyProducts}>
            <Ionicons name="pricetag-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>{t('checkout.noProducts')}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredProducts}
            renderItem={renderProduct}
            keyExtractor={(item) => item.id}
            numColumns={2}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.productsGrid}
            columnWrapperStyle={styles.productsRow}
          />
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerSummary}>
          <Text style={styles.footerLabel}>
            {t('checkout.totalItems', { count: getItemCount() })}
          </Text>
          <Text style={styles.footerTotal}>
            {effectiveTotalCents < totalCents
              ? `${formatCurrency(effectiveTotalCents)} (${formatCurrency(totalCents - effectiveTotalCents)} ${t('checkout.inPasses')})`
              : formatCurrency(effectiveTotalCents)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.reviewButton}
          onPress={() => setIsCartOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="cart" size={20} color="#fff" />
          <Text style={styles.reviewButtonText}>{t('checkout.reviewCart')}</Text>
        </TouchableOpacity>
      </View>

      {/* Cart Modal */}
      <Modal
        visible={isCartOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsCartOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('checkout.cart')}</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setIsCartOpen(false)}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {items.length === 0 ? (
                <View style={styles.emptyCart}>
                  <Text style={styles.emptyCartText}>
                    {t('checkout.addToCart')}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={items}
                  renderItem={renderCartItem}
                  keyExtractor={(item) => item.eventProduct.id}
                  contentContainerStyle={styles.cartListContent}
                />
              )}
            </View>

            <View style={styles.modalFooter}>
              <View style={styles.totals}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t('checkout.subtotalItems', { count: getItemCount() })}</Text>
                  <Text style={styles.totalValue}>{formatCurrency(totalCents)}</Text>
                </View>
                {effectiveTotalCents < totalCents && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#059669' }]}>{t('checkout.passDiscount')}</Text>
                    <Text style={[styles.totalValue, { color: '#059669' }]}>-{formatCurrency(totalCents - effectiveTotalCents)}</Text>
                  </View>
                )}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t('checkout.totalToCharge')}</Text>
                  <Text style={styles.totalValue}>{formatCurrency(effectiveTotalCents)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t('checkout.balanceAfterPayment')}</Text>
                  <Text style={[
                    styles.totalValue,
                    remainingBalance < 0 && styles.insufficientBalance
                  ]}>
                    {formatCurrency(remainingBalance)}
                  </Text>
                </View>
              </View>

              {items.length > 0 && (
                <TouchableOpacity onPress={clearCart} style={styles.clearCartButton}>
                  <Text style={styles.clearCartText}>{t('checkout.clearCart')}</Text>
                </TouchableOpacity>
              )}

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
                      {t('checkout.charge')} {formatCurrency(effectiveTotalCents)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    flex: 1,
    paddingTop: 16,
  },
  productsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  resultsBadge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  resultsBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    height: 44,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  areasContainer: {
    paddingVertical: 4,
    marginBottom: 8,
  },
  areasScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  areaChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  areaChipActive: {
    backgroundColor: '#111827',
  },
  areaChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  areaChipTextActive: {
    color: '#fff',
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
    paddingBottom: 8,
  },
  productsRow: {
    gap: 12,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    flex: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  productImageWrapper: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#F3F4F6',
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: 86,
  },
  productImagePlaceholder: {
    width: '100%',
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  stockBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  passProductBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(5, 150, 105, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  passProductBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
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
  areaBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  areaBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4F46E5',
  },
  passBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  passBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
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
  clearCartText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '500',
  },
  clearCartButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
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
  cartListContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
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
    paddingTop: 12,
    paddingBottom: 24,
  },
  footerSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  footerTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  reviewButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    height: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalBody: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
})
