import routeOptimizer from '../services/routeOptimizer.js';

/**
 * Route Optimization Controller for EcoTrack Logistics System
 * 
 * Provides intelligent route optimization with environmental impact analysis
 * and comparison between shortest and eco-friendly routing options.
 */

// @desc    Optimize single route with comparison
// @route   POST /api/route-optimization/optimize
// @access  Private
const optimizeRoute = async (req, res, next) => {
  try {
    const {
      pickup,
      delivery,
      options = {}
    } = req.body;

    // Validate required fields
    if (!pickup || !delivery) {
      return res.status(400).json({ 
        message: 'Pickup and delivery coordinates are required.' 
      });
    }

    // Set default options
    const optimizationOptions = {
      vehicleType: 'medium',
      fuelType: 'hybrid',
      includeTraffic: true,
      timeOfDay: 'current',
      cargoWeight: 1000,
      ...options
    };

    const result = await routeOptimizer.optimizeRoute(pickup, delivery, optimizationOptions);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Route optimization completed successfully'
    });

  } catch (error) {
    console.error('Route optimization error:', error);
    next(error);
  }
};

// @desc    Optimize multiple routes in batch
// @route   POST /api/route-optimization/batch
// @access  Private
const optimizeMultipleRoutes = async (req, res, next) => {
  try {
    const { routes } = req.body;

    if (!Array.isArray(routes) || routes.length === 0) {
      return res.status(400).json({ 
        message: 'Routes array is required and cannot be empty.' 
      });
    }

    // Validate each route
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (!route.pickup || !route.delivery) {
        return res.status(400).json({ 
          message: `Route ${i + 1}: Pickup and delivery coordinates are required.` 
        });
      }
    }

    const results = await routeOptimizer.optimizeMultipleRoutes(routes);

    res.status(200).json({
      success: true,
      data: results,
      statistics: routeOptimizer.getOptimizationStatistics(results),
      message: 'Batch route optimization completed'
    });

  } catch (error) {
    console.error('Batch route optimization error:', error);
    next(error);
  }
};

// @desc    Get optimization comparison for existing coordinates
// @route   POST /api/route-optimization/compare
// @access  Private
const compareRoutes = async (req, res, next) => {
  try {
    const {
      routes = []
    } = req.body;

    if (!Array.isArray(routes) || routes.length < 2) {
      return res.status(400).json({ 
        message: 'At least 2 routes are required for comparison.' 
      });
    }

    const comparisons = [];

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      
      if (!route.pickup || !route.delivery) {
        return res.status(400).json({ 
          message: `Route ${i + 1}: Pickup and delivery coordinates are required.` 
        });
      }

      try {
        const optimization = await routeOptimizer.optimizeRoute(
          route.pickup, 
          route.delivery, 
          route.options || {}
        );
        
        comparisons.push({
          routeIndex: i,
          ...optimization,
          routeLabel: route.label || `Route ${i + 1}`
        });
      } catch (error) {
        comparisons.push({
          routeIndex: i,
          success: false,
          error: error.message,
          routeLabel: route.label || `Route ${i + 1}`
        });
      }
    }

    // Generate comparison summary
    const successfulComparisons = comparisons.filter(c => c.success);
    const comparisonSummary = {
      totalRoutes: routes.length,
      successful: successfulComparisons.length,
      failed: comparisons.length - successfulComparisons.length,
      averageCarbonSavings: successfulComparisons.length > 0 ?
        Math.round(
          successfulComparisons.reduce((sum, c) => sum + c.comparison.carbonSavings.kg, 0) / 
          successfulComparisons.length * 100
        ) / 100 : 0,
      recommendations: {
        ecoRecommended: successfulComparisons.filter(c => c.recommendation.recommended === 'eco').length,
        shortestRecommended: successfulComparisons.filter(c => c.recommendation.recommended === 'shortest').length
      }
    };

    res.status(200).json({
      success: true,
      data: comparisons,
      summary: comparisonSummary,
      message: 'Route comparison completed successfully'
    });

  } catch (error) {
    console.error('Route comparison error:', error);
    next(error);
  }
};

// @desc    Get optimization parameters and available options
// @route   GET /api/route-optimization/parameters
// @access  Private
const getOptimizationParameters = async (req, res, next) => {
  try {
    const parameters = {
      vehicleTypes: [
        { type: 'light', description: 'Light cargo (< 1 ton)', emissionFactor: 0.22 },
        { type: 'medium', description: 'Medium cargo (1-3 tons)', emissionFactor: 0.28 },
        { type: 'heavy', description: 'Heavy cargo (> 3 tons)', emissionFactor: 0.35 }
      ],
      fuelTypes: [
        { type: 'standard', description: 'Standard fuel (diesel/gasoline)', costPerKm: 0.45 },
        { type: 'electric', description: 'Electric vehicle', costPerKm: 0.25 },
        { type: 'hybrid', description: 'Hybrid vehicle', costPerKm: 0.35 }
      ],
      optimizationStrategies: [
        { 
          type: 'Shortest', 
          description: 'Minimize travel distance and time',
          bestFor: 'Time-sensitive deliveries'
        },
        { 
          type: 'EcoFriendly', 
          description: 'Minimize carbon footprint',
          bestFor: 'Environmentally conscious shipping'
        }
      ],
      assumptions: {
        emissionFactors: {
          standard: { small: 0.22, medium: 0.28, large: 0.35 },
          electric: { small: 0.08, medium: 0.12, large: 0.18 },
          hybrid: { small: 0.15, medium: 0.19, large: 0.25 }
        },
        ecoRouteAdjustments: {
          distanceMultiplier: 1.08,    // Eco routes 8% longer on average
          speedAdjustment: 0.85,        // 15% slower for efficiency
          emissionReduction: 0.35          // 35% reduction in emissions
        },
        costFactors: {
          standard: 0.45,    // $0.45 per km
          electric: 0.25,     // $0.25 per km
          hybrid: 0.35        // $0.35 per km
        }
      }
    };

    res.status(200).json({
      success: true,
      data: parameters,
      message: 'Optimization parameters retrieved successfully'
    });

  } catch (error) {
    console.error('Get parameters error:', error);
    next(error);
  }
};

// @desc    Calculate carbon footprint for custom route
// @route   POST /api/route-optimization/carbon-footprint
// @access  Private
const calculateCarbonFootprint = async (req, res, next) => {
  try {
    const {
      distanceKm,
      vehicleType = 'medium',
      fuelType = 'hybrid'
    } = req.body;

    if (!distanceKm || distanceKm <= 0) {
      return res.status(400).json({ 
        message: 'Valid distance in kilometers is required.' 
      });
    }

    // Get emission factors from optimizer
    const emissionFactors = {
      standard: { small: 0.22, medium: 0.28, large: 0.35 },
      electric: { small: 0.08, medium: 0.12, large: 0.18 },
      hybrid: { small: 0.15, medium: 0.19, large: 0.25 }
    };

    const emissionFactor = emissionFactors[fuelType]?.[vehicleType];
    if (!emissionFactor) {
      return res.status(400).json({ 
        message: 'Invalid vehicle type or fuel type.' 
      });
    }

    const carbonFootprint = Math.round((distanceKm * emissionFactor) * 100) / 100;

    res.status(200).json({
      success: true,
      data: {
        distanceKm,
        vehicleType,
        fuelType,
        emissionFactor,
        carbonFootprintKg: carbonFootprint,
        calculation: 'carbon = distanceKm × emissionFactor',
        environmentalEquivalent: {
          treesNeeded: Math.ceil(carbonFootprint / 21), // 1 tree absorbs ~21kg CO2/year
          carEmissionEquivalent: Math.round(carbonFootprint / 4.6), // Average car emits 4.6kg CO2/day
          householdDays: Math.round(carbonFootprint / 0.6) // Average household emits 0.6kg CO2/day
        }
      },
      message: 'Carbon footprint calculated successfully'
    });

  } catch (error) {
    console.error('Carbon footprint calculation error:', error);
    next(error);
  }
};

export {
  optimizeRoute,
  optimizeMultipleRoutes,
  compareRoutes,
  getOptimizationParameters,
  calculateCarbonFootprint
};
