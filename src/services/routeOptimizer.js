import mapService from './mapService.js';
import routeFallback from './routeFallback.js';

/**
 * Route Optimization Service for EcoTrack Logistics System
 * 
 * Provides intelligent route optimization algorithms for:
 * - Shortest distance calculation
 * - Eco-friendly routing with minimal carbon footprint
 * - Multi-criteria optimization
 * - Route comparison and recommendations
 */

class RouteOptimizer {
  constructor() {
    // Emission factors for different vehicle types (kg CO2 per km)
    // Assumptions based on industry averages for delivery vehicles
    this.emissionFactors = {
      // Standard delivery vehicles (diesel/gasoline)
      standard: {
        small: 0.22,    // Small van/cargo bike
        medium: 0.28,   // Medium delivery truck
        large: 0.35     // Large truck
      },
      // Electric vehicles
      electric: {
        small: 0.08,    // Small electric van
        medium: 0.12,   // Medium electric truck
        large: 0.18     // Large electric truck
      },
      // Hybrid vehicles
      hybrid: {
        small: 0.15,    // Small hybrid van
        medium: 0.19,   // Medium hybrid truck
        large: 0.25     // Large hybrid truck
      }
    };

    // Vehicle categories based on delivery characteristics
    this.vehicleCategories = {
      light: { type: 'small', weight: '< 1 ton' },
      medium: { type: 'medium', weight: '1-3 tons' },
      heavy: { type: 'large', weight: '> 3 tons' }
    };
  }

  /**
   * Optimize route between pickup and delivery points
   * @param {Object} pickup - {latitude, longitude} pickup coordinates
   * @param {Object} delivery - {latitude, longitude} delivery coordinates
   * @param {Object} options - Optimization options
   * @returns {Promise<Object>} Optimized routes comparison
   */
  async optimizeRoute(pickup, delivery, options = {}) {
    try {
      const {
        vehicleType = 'medium',           // Vehicle size category
        fuelType = 'hybrid',            // Vehicle fuel type
        includeTraffic = true,            // Consider traffic data
        timeOfDay = 'current',            // Time for traffic consideration
        cargoWeight = 1000               // Cargo weight in kg
      } = options;

      // Validate input coordinates
      this.validateCoordinates(pickup, 'pickup');
      this.validateCoordinates(delivery, 'delivery');

      // Check cache first
      const cacheKey = routeFallback.generateRouteKey(pickup, delivery, options);
      const cachedRoute = routeFallback.getCachedRoute(cacheKey);
      if (cachedRoute) {
        return {
          success: true,
          ...cachedRoute,
          fallbackUsed: false,
          cacheUsed: true,
          message: 'Using cached route data'
        };
      }

      // Try Map API first
      let baseRouteData;
      try {
        baseRouteData = await mapService.calculateDistanceAndTime(
          pickup.latitude,
          pickup.longitude,
          delivery.latitude,
          delivery.longitude
        );
      } catch (mapError) {
        // Map API failed, use fallback
        console.warn('Map API failed, using fallback:', mapError.message);
        const fallbackResult = routeFallback.handleMapApiFailure(mapError, pickup, delivery, options);
        
        if (fallbackResult.success) {
          // Cache the fallback result
          routeFallback.cacheRoute(cacheKey, fallbackResult);
          
          return {
            success: true,
            pickup,
            delivery,
            options,
            routes: {
              shortest: fallbackResult.routes.shortest,
              eco: fallbackResult.routes.eco
            },
            comparison: fallbackResult.comparison,
            recommendation: fallbackResult.recommendation,
            fallbackUsed: true,
            fallbackReason: fallbackResult.fallbackReason,
            calculatedAt: new Date().toISOString()
          };
        } else {
          throw new Error(`Both Map API and fallback failed: ${fallbackResult.error}`);
        }
      }

      // Map API succeeded, continue with optimization
      const shortestRoute = await this.calculateShortestRoute(
        pickup, 
        delivery, 
        baseRouteData, 
        options
      );

      const ecoRoute = await this.calculateEcoFriendlyRoute(
        pickup, 
        delivery, 
        baseRouteData, 
        options
      );

      // Generate comparison and recommendations
      const comparison = this.compareRoutes(shortestRoute, ecoRoute, options);

      const result = {
        success: true,
        pickup,
        delivery,
        options,
        routes: {
          shortest: shortestRoute,
          eco: ecoRoute
        },
        comparison,
        recommendation: this.getRecommendation(comparison),
        calculatedAt: new Date().toISOString(),
        fallbackUsed: false,
        mapApiUsed: true
      };

      // Cache the successful result
      routeFallback.cacheRoute(cacheKey, result);

      return result;

    } catch (error) {
      console.error('Route optimization error:', error);
      
      // Last resort: try fallback calculation
      try {
        const lastResortFallback = routeFallback.calculateFallbackRoute(pickup, delivery, options);
        if (lastResortFallback.success) {
          return {
            success: true,
            ...lastResortFallback,
            error: `Original error: ${error.message}. Used emergency fallback.`,
            criticalFallback: true
          };
        }
      } catch (fallbackError) {
        console.error('Emergency fallback also failed:', fallbackError);
      }

      throw new Error(`Route optimization failed: ${error.message}`);
    }
  }

  /**
   * Calculate shortest distance route
   * @private
   */
  async calculateShortestRoute(pickup, delivery, baseRouteData, options) {
    // For shortest route, we use the direct route from Map API
    // Assumption: Map API provides the shortest driving route by default
    
    const vehicleCategory = this.getVehicleCategory(options.cargoWeight);
    const emissionFactor = this.emissionFactors[options.fuelType][vehicleCategory.type];

    return {
      type: 'Shortest',
      distanceKm: baseRouteData.distanceKm,
      estimatedTimeMinutes: baseRouteData.durationMinutes,
      carbonFootprintKg: this.calculateCarbonFootprint(
        baseRouteData.distanceKm, 
        emissionFactor
      ),
      fuelConsumptionLiters: this.calculateFuelConsumption(
        baseRouteData.distanceKm, 
        options.fuelType, 
        vehicleCategory.type
      ),
      costEstimate: this.calculateCost(baseRouteData.distanceKm, options.fuelType),
      vehicleInfo: {
        category: vehicleCategory,
        fuelType: options.fuelType,
        emissionFactor
      },
      routeCharacteristics: {
        optimization: 'distance',
        trafficConsidered: options.includeTraffic,
        estimatedSpeed: Math.round((baseRouteData.distanceKm / baseRouteData.durationMinutes) * 60)
      }
    };
  }

  /**
   * Calculate eco-friendly route with minimal carbon footprint
   * @private
   */
  async calculateEcoFriendlyRoute(pickup, delivery, baseRouteData, options) {
    // For eco-friendly route, we optimize for minimal emissions
    // Strategy: Use electric/hybrid vehicle routing when available
    
    const vehicleCategory = this.getVehicleCategory(options.cargoWeight);
    
    // Eco-friendly adjustments
    const ecoAdjustments = {
      // Assume eco routes are 5-15% longer but use cleaner vehicles
      distanceMultiplier: 1.08,     // 8% longer on average
      speedAdjustment: 0.85,         // 15% slower for efficiency
      emissionReduction: 0.35          // 35% reduction in emissions
    };

    const adjustedDistance = baseRouteData.distanceKm * ecoAdjustments.distanceMultiplier;
    const adjustedTime = baseRouteData.durationMinutes / ecoAdjustments.speedAdjustment;

    // Use the most efficient vehicle type available
    const ecoFuelType = options.fuelType === 'standard' ? 'hybrid' : options.fuelType;
    const emissionFactor = this.emissionFactors[ecoFuelType][vehicleCategory.type];

    return {
      type: 'EcoFriendly',
      distanceKm: adjustedDistance,
      estimatedTimeMinutes: Math.round(adjustedTime),
      carbonFootprintKg: this.calculateCarbonFootprint(
        adjustedDistance, 
        emissionFactor
      ) * (1 - ecoAdjustments.emissionReduction),
      fuelConsumptionLiters: this.calculateFuelConsumption(
        adjustedDistance, 
        ecoFuelType, 
        vehicleCategory.type
      ),
      costEstimate: this.calculateCost(adjustedDistance, ecoFuelType),
      vehicleInfo: {
        category: vehicleCategory,
        fuelType: ecoFuelType,
        emissionFactor
      },
      routeCharacteristics: {
        optimization: 'environmental',
        trafficConsidered: options.includeTraffic,
        estimatedSpeed: Math.round((adjustedDistance / adjustedTime) * 60),
        ecoAdjustments: ecoAdjustments
      }
    };
  }

  /**
   * Compare routes and generate insights
   * @private
   */
  compareRoutes(shortestRoute, ecoRoute, options) {
    const carbonSavings = shortestRoute.carbonFootprintKg - ecoRoute.carbonFootprintKg;
    const timeDifference = ecoRoute.estimatedTimeMinutes - shortestRoute.estimatedTimeMinutes;
    const distanceDifference = ecoRoute.distanceKm - shortestRoute.distanceKm;
    const costDifference = ecoRoute.costEstimate - shortestRoute.costEstimate;

    return {
      carbonSavings: {
        kg: Math.max(0, carbonSavings),
        percentage: shortestRoute.carbonFootprintKg > 0 ? 
          Math.round((carbonSavings / shortestRoute.carbonFootprintKg) * 100) : 0
      },
      timeImpact: {
        additionalMinutes: Math.max(0, timeDifference),
        percentage: shortestRoute.estimatedTimeMinutes > 0 ? 
          Math.round((timeDifference / shortestRoute.estimatedTimeMinutes) * 100) : 0
      },
      distanceImpact: {
        additionalKm: Math.max(0, distanceDifference),
        percentage: shortestRoute.distanceKm > 0 ? 
          Math.round((distanceDifference / shortestRoute.distanceKm) * 100) : 0
      },
      costImpact: {
        additionalCost: Math.max(0, costDifference),
        percentage: shortestRoute.costEstimate > 0 ? 
          Math.round((costDifference / shortestRoute.costEstimate) * 100) : 0
      },
      efficiency: {
        carbonPerKm: {
          shortest: shortestRoute.carbonFootprintKg / shortestRoute.distanceKm,
          eco: ecoRoute.carbonFootprintKg / ecoRoute.distanceKm
        },
        costPerKm: {
          shortest: shortestRoute.costEstimate / shortestRoute.distanceKm,
          eco: ecoRoute.costEstimate / ecoRoute.distanceKm
        }
      }
    };
  }

  /**
   * Generate route recommendation based on comparison
   * @private
   */
  getRecommendation(comparison) {
    const { carbonSavings, timeImpact, costImpact } = comparison;
    
    // Decision matrix for recommendations
    if (carbonSavings.percentage > 20 && timeImpact.percentage < 15) {
      return {
        recommended: 'eco',
        reason: 'Significant carbon savings with minimal time impact',
        confidence: 'high'
      };
    } else if (carbonSavings.percentage > 10 && costImpact.percentage < 10) {
      return {
        recommended: 'eco',
        reason: 'Good environmental benefit with reasonable cost',
        confidence: 'medium'
      };
    } else if (timeImpact.percentage > 25) {
      return {
        recommended: 'shortest',
        reason: 'Eco route significantly impacts delivery time',
        confidence: 'high'
      };
    } else {
      return {
        recommended: 'shortest',
        reason: 'Time and cost efficiency prioritized',
        confidence: 'medium'
      };
    }
  }

  /**
   * Calculate carbon footprint using formula: carbon = distanceKm × emissionFactor
   * @private
   */
  calculateCarbonFootprint(distanceKm, emissionFactor) {
    return Math.round((distanceKm * emissionFactor) * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Estimate fuel consumption based on distance and vehicle type
   * @private
   */
  calculateFuelConsumption(distanceKm, fuelType, vehicleSize) {
    // Average fuel consumption (liters per 100km)
    const consumptionRates = {
      standard: { small: 8, medium: 12, large: 18 },
      electric: { small: 15, medium: 25, large: 40 }, // kWh per 100km
      hybrid: { small: 6, medium: 9, large: 14 }
    };

    const rate = consumptionRates[fuelType]?.[vehicleSize] || 10;
    return Math.round((distanceKm * rate / 100) * 100) / 100;
  }

  /**
   * Calculate estimated cost for route
   * @private
   */
  calculateCost(distanceKm, fuelType) {
    // Cost per km (includes fuel, maintenance, driver time)
    const costPerKm = {
      standard: 0.45,    // $0.45 per km
      electric: 0.25,     // $0.25 per km (electricity cheaper)
      hybrid: 0.35        // $0.35 per km
    };

    return Math.round((distanceKm * costPerKm[fuelType]) * 100) / 100;
  }

  /**
   * Determine vehicle category based on cargo weight
   * @private
   */
  getVehicleCategory(cargoWeight) {
    if (cargoWeight < 1000) return this.vehicleCategories.light;
    if (cargoWeight <= 3000) return this.vehicleCategories.medium;
    return this.vehicleCategories.heavy;
  }

  /**
   * Validate coordinate inputs
   * @private
   */
  validateCoordinates(coords, name) {
    if (!coords || typeof coords !== 'object') {
      throw new Error(`Invalid ${name} coordinates: must be an object`);
    }
    
    if (typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
      throw new Error(`Invalid ${name} coordinates: latitude and longitude must be numbers`);
    }
    
    if (coords.latitude < -90 || coords.latitude > 90) {
      throw new Error(`Invalid ${name} latitude: must be between -90 and 90`);
    }
    
    if (coords.longitude < -180 || coords.longitude > 180) {
      throw new Error(`Invalid ${name} longitude: must be between -180 and 180`);
    }
  }

  /**
   * Batch optimize multiple routes
   * @param {Array} routes - Array of {pickup, delivery, options} objects
   * @returns {Promise<Array>} Optimized routes with comparisons
   */
  async optimizeMultipleRoutes(routes) {
    const results = [];
    
    for (const route of routes) {
      try {
        const optimized = await this.optimizeRoute(route.pickup, route.delivery, route.options);
        results.push({
          ...optimized,
          originalRequest: route
        });
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          originalRequest: route
        });
      }
    }
    
    return results;
  }

  /**
   * Get optimization statistics and insights
   * @param {Array} optimizedRoutes - Array of optimized route results
   * @returns {Object} Aggregate statistics
   */
  getOptimizationStatistics(optimizedRoutes) {
    const successful = optimizedRoutes.filter(r => r.success);
    const failed = optimizedRoutes.filter(r => !r.success);

    const totalCarbonSavings = successful.reduce((sum, route) => {
      return sum + route.comparison.carbonSavings.kg;
    }, 0);

    const totalTimeImpact = successful.reduce((sum, route) => {
      return sum + route.comparison.timeImpact.additionalMinutes;
    }, 0);

    return {
      totalRoutes: optimizedRoutes.length,
      successful: successful.length,
      failed: failed.length,
      totalCarbonSavings: Math.round(totalCarbonSavings * 100) / 100,
      averageCarbonSavings: successful.length > 0 ? 
        Math.round((totalCarbonSavings / successful.length) * 100) / 100 : 0,
      totalTimeImpact: Math.round(totalTimeImpact),
      averageTimeImpact: successful.length > 0 ? 
        Math.round((totalTimeImpact / successful.length)) : 0,
      recommendations: {
        ecoChosen: successful.filter(r => r.recommendation.recommended === 'eco').length,
        shortestChosen: successful.filter(r => r.recommendation.recommended === 'shortest').length
      }
    };
  }
}

// Export singleton instance
const routeOptimizer = new RouteOptimizer();

export default routeOptimizer;
