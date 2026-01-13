import Route from '../models/Route.js';
import mapService from '../services/mapService.js';

/**
 * Route Controller for EcoTrack Logistics System
 * 
 * Handles route creation, optimization, and environmental impact calculations
 * using Map API integration for accurate distance and time calculations.
 */

// @desc    Create a new route with calculated metrics
// @route   POST /api/routes
// @access  Private (Supervisor only)
const createRoute = async (req, res, next) => {
  try {
    const {
      parcel,
      pickupLocation,
      deliveryLocation,
      routeType = 'Shortest'
    } = req.body;

    // Validate required fields
    if (!parcel || !pickupLocation || !deliveryLocation) {
      return res.status(400).json({ 
        message: 'Parcel, pickup location, and delivery location are required.' 
      });
    }

    // Validate coordinates
    if (!pickupLocation.latitude || !pickupLocation.longitude ||
        !deliveryLocation.latitude || !deliveryLocation.longitude) {
      return res.status(400).json({ 
        message: 'Valid latitude and longitude coordinates are required for both locations.' 
      });
    }

    // Check if map service is configured
    if (!mapService.isConfigured()) {
      return res.status(503).json({ 
        message: 'Map service is not configured. Please check environment variables.' 
      });
    }

    // Calculate distance and time using Map API
    const mapData = await mapService.calculateDistanceAndTime(
      pickupLocation.latitude,
      pickupLocation.longitude,
      deliveryLocation.latitude,
      deliveryLocation.longitude
    );

    // Create route with calculated metrics
    const newRoute = await Route.create({
      parcel,
      pickupLocation,
      deliveryLocation,
      distanceKm: mapData.distanceKm,
      estimatedTimeMinutes: mapData.durationMinutes,
      carbonFootprintKg: Route.calculateCarbonFootprint(mapData.distanceKm, routeType),
      routeType,
      provider: mapData.provider
    });

    res.status(201).json({
      success: true,
      data: newRoute,
      mapData: {
        provider: mapData.provider,
        calculatedDistance: mapData.distanceKm,
        estimatedTime: mapData.durationMinutes
      }
    });
  } catch (error) {
    console.error('Route creation error:', error);
    next(error);
  }
};

// @desc    Get all routes
// @route   GET /api/routes
// @access  Private
const getAllRoutes = async (req, res, next) => {
  try {
    const routes = await Route.find({})
      .populate('parcel', 'parcelId senderName receiverName status')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: routes.length,
      data: routes
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single route by ID
// @route   GET /api/routes/:id
// @access  Private
const getRouteById = async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate('parcel', 'parcelId senderName receiverName status');

    if (!route) {
      return res.status(404).json({ 
        message: 'Route not found.' 
      });
    }

    res.status(200).json({
      success: true,
      data: route
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update route optimization type
// @route   PATCH /api/routes/:id/optimize
// @access  Private (Supervisor only)
const optimizeRoute = async (req, res, next) => {
  try {
    const { routeType } = req.body;

    if (!routeType || !['Shortest', 'EcoFriendly'].includes(routeType)) {
      return res.status(400).json({ 
        message: 'Valid route type (Shortest or EcoFriendly) is required.' 
      });
    }

    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ 
        message: 'Route not found.' 
      });
    }

    // Recalculate metrics with new route type
    const carbonFootprintKg = Route.calculateCarbonFootprint(route.distanceKm, routeType);
    const estimatedTimeMinutes = Route.estimateDeliveryTime(route.distanceKm, routeType);

    const updatedRoute = await Route.findByIdAndUpdate(
      req.params.id,
      {
        routeType,
        carbonFootprintKg,
        estimatedTimeMinutes
      },
      { new: true, runValidators: true }
    ).populate('parcel', 'parcelId senderName receiverName status');

    res.status(200).json({
      success: true,
      data: updatedRoute,
      optimization: {
        previousType: route.routeType,
        newType: routeType,
        carbonSavings: route.carbonFootprintKg - carbonFootprintKg,
        timeDifference: estimatedTimeMinutes - route.estimatedTimeMinutes
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a route
// @route   DELETE /api/routes/:id
// @access  Private (Supervisor only)
const deleteRoute = async (req, res, next) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id);

    if (!route) {
      return res.status(404).json({ 
        message: 'Route not found.' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Route deleted successfully.',
      data: route
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get environmental impact summary
// @route   GET /api/routes/environmental-summary
// @access  Private
const getEnvironmentalSummary = async (req, res, next) => {
  try {
    const summary = await Route.aggregate([
      {
        $group: {
          _id: '$routeType',
          totalRoutes: { $sum: 1 },
          totalDistance: { $sum: '$distanceKm' },
          totalCarbonFootprint: { $sum: '$carbonFootprintKg' },
          averageDistance: { $avg: '$distanceKm' },
          averageCarbonFootprint: { $avg: '$carbonFootprintKg' }
        }
      },
      {
        $group: {
          _id: null,
          routeTypes: {
            $push: {
              type: '$_id',
              metrics: {
                totalRoutes: '$totalRoutes',
                totalDistance: '$totalDistance',
                totalCarbonFootprint: '$totalCarbonFootprint',
                averageDistance: '$averageDistance',
                averageCarbonFootprint: '$averageCarbonFootprint'
              }
            }
          },
          overallStats: {
            $sum: {
              totalRoutes: '$totalRoutes',
              totalDistance: '$totalDistance',
              totalCarbonFootprint: '$totalCarbonFootprint'
            }
          }
        }
      }
    ]);

    const overallSummary = summary[0] || {
      routeTypes: [],
      overallStats: { totalRoutes: 0, totalDistance: 0, totalCarbonFootprint: 0 }
    };

    res.status(200).json({
      success: true,
      data: {
        routeTypes: overallSummary.routeTypes,
        overall: overallSummary.overallStats,
        environmentalImpact: {
          totalCarbonSaved: overallSummary.routeTypes
            .filter(rt => rt.type === 'EcoFriendly')
            .reduce((total, rt) => {
              const equivalentShortRoutes = rt.metrics.totalRoutes * 0.25; // Standard emission factor
              return total + (equivalentShortRoutes - rt.metrics.totalCarbonFootprint);
            }, 0)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export {
  createRoute,
  getAllRoutes,
  getRouteById,
  optimizeRoute,
  deleteRoute,
  getEnvironmentalSummary
};
