import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/api'
import { EventProduct, Product, EventArea } from '@/types/database'

interface ProductWithBase extends EventProduct {
  base_product: Product
  event_area: EventArea | null
}

export default function EventProductsScreen() {
  const { currentOrg, currentEvent } = useAuthStore()
  const [products, setProducts] = useState<ProductWithBase[]>([])
  const [areas, setAreas] = useState<EventArea[]>([])
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [currentOrg, currentEvent])

  const loadData = async () => {
    if (!currentOrg || !currentEvent) return

    setIsLoading(true)
    try {
      // Load areas
      const { data: areasData } = await supabase
        .from('event_areas')
        .select('*')
        .eq('org_id', currentOrg.id)
        .eq('event_id', currentEvent.id)
        .order('name')

      setAreas(areasData ?? [])

      // Load products
      const { data: productsData, error } = await supabase
        .from('event_products')
        .select(`
          *,
          base_product:products(*),
          event_area:event_areas(*)
        `)
        .eq('org_id', currentOrg.id)
        .eq('event_id', currentEvent.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProducts((productsData as ProductWithBase[]) ?? [])
    } catch (error) {
      console.error('Error loading products:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredProducts = selectedArea
    ? products.filter(p => p.area_id === selectedArea)
    : products

  const renderProduct = ({ item }: { item: ProductWithBase }) => (
    <View style={styles.productCard}>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.base_product.name}</Text>
        {item.base_product.description && (
          <Text style={styles.productDescription} numberOfLines={2}>
            {item.base_product.description}
          </Text>
        )}
        <View style={styles.productMeta}>
          {item.event_area && (
            <View style={styles.areaBadge}>
              <Text style={styles.areaBadgeText}>{item.event_area.name}</Text>
            </View>
          )}
          {item.stock !== null && (
            <Text style={[
              styles.stockText,
              item.stock === 0 && styles.stockEmpty
            ]}>
              Stock: {item.stock}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.productPriceContainer}>
        <Text style={styles.productPrice}>
          {formatCurrency(item.price_cents)}
        </Text>
        <View style={[
          styles.statusDot,
          { backgroundColor: item.status === 'active' ? '#059669' : '#DC2626' }
        ]} />
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Productos del Evento</Text>
        <View style={styles.headerButton} />
      </View>

      {!currentOrg || !currentEvent ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Configuración requerida</Text>
        </View>
      ) : isLoading ? (
        <ActivityIndicator size="large" color="#1F2937" style={styles.loader} />
      ) : (
        <>
          {/* Areas filter */}
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
                    Todos
                  </Text>
                </TouchableOpacity>
                {areas.map((area) => (
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

          {/* Products list */}
          {filteredProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="pricetag-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>Sin productos</Text>
              <Text style={styles.emptySubtitle}>
                No hay productos {selectedArea ? 'en esta área' : 'para este evento'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredProducts}
              renderItem={renderProduct}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  loader: {
    marginTop: 40,
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
    marginTop: 8,
  },
  areasContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  areasScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  areaChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  areaChipActive: {
    backgroundColor: '#1F2937',
  },
  areaChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  areaChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  productDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  productMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  areaBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  areaBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  stockText: {
    fontSize: 12,
    color: '#6B7280',
  },
  stockEmpty: {
    color: '#DC2626',
  },
  productPriceContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#059669',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
})
