/**
 * Route Fallback Service for EcoTrack Logistics System
 * 
 * Provides fallback behavior when Map API fails:
 * - Cached route data storage
 * - Mock route calculations
 * - Graceful degradation
 * - Manual override capabilities
 */

class RouteFallback {
  constructor() {
    this.cache = new Map();
    this.mockRoutes = new Map();
    this.initializeMockData();
  }

  /**
   * Initialize mock route data for fallback scenarios
   * @private
   */
  initializeMockData() {
    // Common city-to-city routes with realistic data
    this.mockRoutes.set('NYC-LA', {
      shortest: { distanceKm: 3944, estimatedTimeMinutes: 240, carbonFootprintKg: 1104 },
      eco: { distanceKm: 4256, estimatedTimeMinutes: 280, carbonFootprintKg: 766 }
    });

    this.mockRoutes.set('NYC-CHI', {
      shortest: { distanceKm: 1278, estimatedTimeMinutes: 180, carbonFootprintKg: 358 },
      eco: { distanceKm: 1380, estimatedTimeMinutes: 210, carbonFootprintKg: 248 }
    });

    this.mockRoutes.set('LA-SF', {
      shortest: { distanceKm: 615, estimatedTimeMinutes: 120, carbonFootprintKg: 172 },
      eco: { distanceKm: 680, estimatedTimeMinutes: 150, carbonFootprintKg: 122 }
    });
  }

  /**
   * Cache route data for future use
   * @param {string} key - Cache key (parcelId-routeHash)
   * @param {Object} data - Route optimization data
   */
  cacheRoute(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: 30 * 60 * 1000 // 30 minutes
    });
  }

  /**
   * Get cached route data
   * @param {string} key - Cache key
   * @returns {Object|null} Cached route data or null if expired
   */
  getCachedRoute(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Generate route hash for caching
   * @param {Object} pickup - Pickup coordinates
   * @param {Object} delivery - Delivery coordinates
   * @param {Object} options - Optimization options
   * @returns {string} Cache key
   */
  generateRouteKey(pickup, delivery, options) {
    const key = `${pickup.latitude},${pickup.longitude}-${delivery.latitude},${delivery.longitude}-${JSON.stringify(options)}`;
    return btoa(key).substring(0, 32); // Limit key length
  }

  /**
   * Calculate fallback route using mock data or simple calculations
   * @param {Object} pickup - Pickup coordinates
   * @param {Object} delivery - Delivery coordinates
   * @param {Object} options - Optimization options
   * @returns {Object} Fallback route data
   */
  calculateFallbackRoute(pickup, delivery, options = {}) {
    try {
      // Try to find matching mock route
      const mockKey = this.findMockRouteKey(pickup, delivery);
      if (mockKey && this.mockRoutes.has(mockKey)) {
        return this.mockRoutes.get(mockKey);
      }

      // Simple distance calculation using Haversine formula
      const distance = this.calculateDistance(pickup, delivery);
      
      // Estimate time based on distance and vehicle type
      const vehicleType = options.vehicleType || 'medium';
      const speedFactors = {
        light: 50,    // km/h
        medium: 45,   // km/h
        heavy: 35     // km/h
      };
      
      const estimatedTime = Math.round((distance / speedFactors[vehicleType]) * 60);

      // Calculate carbon footprint
      const fuelType = options.fuelType || 'hybrid';
      const emissionFactors = {
        standard: { light: 0.22, medium: 0.28, heavy: 0.35 },
        electric: { light: 0.08, medium: 0.12, heavy: 0.18 },
        hybrid: { light: 0.15, medium: 0.19, heavy: 0.25 }
      };

      const carbonFootprint = Math.round(distance * emissionFactors[fuelType][vehicleType] * 100) / 100;

      // Generate both route types
      const shortestRoute = {
        type: 'Shortest',
        distanceKm: distance,
        estimatedTimeMinutes: estimatedTime,
        carbonFootprintKg: carbonFootprint,
        costEstimate: Math.round(distance * 0.45 * 100) / 100,
        fuelConsumptionLiters: Math.round(distance * (fuelType === 'electric' ? 0.25 : fuelType === 'hybrid' ? 0.09 : 0.12) / 100) / 100
      };

      const ecoRoute = {
        type: 'EcoFriendly',
        distanceKm: Math.round(distance * 1.08), // 8% longer
        estimatedTimeMinutes: Math.round(estimatedTime * 1.15), // 15% slower
        carbonFootprintKg: Math.round(carbonFootprint * 0.65), // 35% reduction
        costEstimate: Math.round(distance * 0.35 * 100) / 100,
        fuelConsumptionLiters: Math.round(distance * (fuelType === 'electric' ? 0.20 : fuelType === 'hybrid' ? 0.07 : 0.10) / 100) / 100
      };

      return {
        success: true,
        routes: {
          shortest: shortestRoute,
          eco: ecoRoute
        },
        comparison: {
          carbonSavings: {
            kg: Math.max(0, shortestRoute.carbonFootprintKg - ecoRoute.carbonFootprintKg),
            percentage: Math.round(((shortestRoute.carbonFootprintKg - ecoRoute.carbonFootprintKg) / shortestRoute.carbonFootprintKg) * 100)
          },
          timeImpact: {
            additionalMinutes: Math.max(0, ecoRoute.estimatedTimeMinutes - shortestRoute.estimatedTimeMinutes),
            percentage: Math.round(((ecoRoute.estimatedTimeMinutes - shortestRoute.estimatedTimeMinutes) / shortestRoute.estimatedTimeMinutes) * 100)
          }
        },
        recommendation: {
          recommended: carbonFootprint > 50 ? 'eco' : 'shortest',
          reason: carbonFootprint > 50 ? 'Significant carbon savings achievable' : 'Time efficiency prioritized',
          confidence: 'medium'
        },
        fallbackUsed: true,
        fallbackReason: 'Map API unavailable - using calculated fallback'
      };
    } catch (error) {
      return {
        success: false,
        error: 'Fallback calculation failed',
        details: error.message
      };
    }
  }

  /**
   * Find mock route key based on coordinates
   * @private
   */
  findMockRouteKey(pickup, delivery) {
    // Simple city matching based on coordinate ranges
    const cities = {
      'NYC': { lat: [40.7, 41.0], lng: [-74.0, -73.9] },
      'LA': { lat: [33.7, 34.3], lng: [-118.5, -117.9] },
      'CHI': { lat: [41.6, 42.1], lng: [-87.9, -87.5] },
      'SF': { lat: [37.4, 37.8], lng: [-122.5, -122.0] }
    };

    let pickupCity = null;
    let deliveryCity = null;

    for (const [city, coords] of Object.entries(cities)) {
      if (pickup.latitude >= coords.lat[0] && pickup.latitude <= coords.lat[1] &&
          pickup.longitude >= coords.lng[0] && pickup.longitude <= coords.lng[1]) {
        pickupCity = city;
      }
      if (delivery.latitude >= coords.lat[0] && delivery.latitude <= coords.lat[1] &&
          delivery.longitude >= coords.lng[0] && delivery.longitude <= coords.lng[1]) {
        deliveryCity = city;
      }
    }

    return pickupCity && deliveryCity ? `${pickupCity}-${deliveryCity}` : null;
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @private
   */
  calculateDistance(pickup, delivery) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(delivery.latitude - pickup.latitude);
    const dLon = this.toRadians(delivery.longitude - pickup.longitude);
    
    const a = Math.sin(dLat/2) * Math.sin(dLon/2) +
              Math.cos(this.toRadians(pickup.latitude)) * Math.cos(this.toRadians(delivery.latitude)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Convert degrees to radians
   * @private
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Handle Map API failure with fallback
   * @param {Error} error - API error
   * @param {Object} pickup - Pickup coordinates
   * @param {Object} delivery - Delivery coordinates
   * @param {Object} options - Optimization options
   * @returns {Object} Fallback result
   */
  handleMapApiFailure(error, pickup, delivery, options = {}) {
    console.warn('Map API failure, using fallback:', error.message);

    // Try cache first
    const cacheKey = this.generateRouteKey(pickup, delivery, options);
    const cachedRoute = this.getCachedRoute(cacheKey);
    
    if (cachedRoute) {
      return {
        success: true,
        ...cachedRoute,
        fallbackUsed: true,
        fallbackReason: 'Using cached route data'
      };
    }

    // Use calculated fallback
    return this.calculateFallbackRoute(pickup, delivery, options);
  }

  /**
   * Get system status for monitoring
   * @returns {Object} System status information
   */
  getSystemStatus() {
    return {
      mapApiStatus: 'unknown', // Should be updated by actual API calls
      cacheSize: this.cache.size,
      mockRoutesAvailable: this.mockRoutes.size,
      lastFallbackUsed: this.lastFallbackTime,
      systemHealth: 'operational'
    };
  }

  /**
   * Clear expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > value.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Preload common routes for better fallback performance
   */
  preloadCommonRoutes() {
    const commonRoutes = [
      { pickup: { lat: 40.7128, lng: -74.0060 }, delivery: { lat: 34.0522, lng: -118.2437 } },
      { pickup: { lat: 41.8781, lng: -87.6298 }, delivery: { lat: 42.3601, lng: -71.0589 } },
      { pickup: { lat: 37.7749, lng: -122.4194 }, delivery: { lat: 34.0522, lng: -118.2437 } }
    ];

    commonRoutes.forEach(route => {
      const key = this.generateRouteKey(route.pickup, route.delivery, {});
      if (!this.cache.has(key)) {
        const fallbackData = this.calculateFallbackRoute(route.pickup, route.delivery);
        this.cacheRoute(key, fallbackData);
      }
    });
  }
}

// Export singleton instance
const routeFallback = new RouteFallback();

export default routeFallback;
