import Route from '../models/Route.js';
import Parcel from '../models/Parcel.js';
import routeOptimizer from '../services/routeOptimizer.js';

/**
 * Route Optimization API Controller for EcoTrack Logistics System
 * 
 * Provides route optimization endpoints with database integration
 * and role-based access control for Supervisors and Drivers.
 */

// @desc    Optimize route for a specific parcel
// @route   POST /api/routes/optimize
// @access  Private (Supervisor and Driver only)
const optimizeRouteForParcel = async (req, res, next) => {
  try {
    const {
      parcelId,
      pickupLocation,
      deliveryLocation,
      options = {}
    } = req.body;

    // Validate required fields
    if (!parcelId || !pickupLocation || !deliveryLocation) {
      return res.status(400).json({ 
        message: 'Parcel ID, pickup location, and delivery location are required.' 
      });
    }

    // Validate coordinate structure
    if (!pickupLocation.latitude || !pickupLocation.longitude ||
        !deliveryLocation.latitude || !deliveryLocation.longitude) {
      return res.status(400).json({ 
        message: 'Valid latitude and longitude coordinates are required for both locations.' 
      });
    }

    // Find the parcel
    const parcel = await Parcel.findOne({ parcelId });
    if (!parcel) {
      return res.status(404).json({ 
        message: 'Parcel not found.' 
      });
    }

    // Check authorization: Supervisor can optimize any parcel, Driver only assigned parcels
    const isSupervisor = req.user.role === 'Supervisor';
    const isAssignedDriver = req.user.role === 'Driver' && 
      parcel.assignedDriver && parcel.assignedDriver.toString() === req.user.id;

    if (!isSupervisor && !isAssignedDriver) {
      return res.status(403).json({ 
        message: 'You can only optimize routes for parcels assigned to you.' 
      });
    }

    // Set default optimization options based on user role and parcel
    const optimizationOptions = {
      vehicleType: 'medium',
      fuelType: 'hybrid',
      includeTraffic: true,
      timeOfDay: 'current',
      cargoWeight: 1000,
      ...options
    };

    // Perform route optimization
    const optimizationResult = await routeOptimizer.optimizeRoute(
      pickupLocation,
      deliveryLocation,
      optimizationOptions
    );

    // Check if fallback was used and add warning
    if (optimizationResult.fallbackUsed) {
      console.warn('Route optimization used fallback data:', optimizationResult.fallbackReason);
    }

    // Store the selected route in database
    const selectedRoute = optimizationResult.recommendation.recommended === 'eco' 
      ? optimizationResult.routes.eco 
      : optimizationResult.routes.shortest;

    const newRoute = await Route.create({
      parcel: parcel._id,
      pickupLocation: {
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude
      },
      deliveryLocation: {
        latitude: deliveryLocation.latitude,
        longitude: deliveryLocation.longitude
      },
      distanceKm: selectedRoute.distanceKm,
      estimatedTimeMinutes: selectedRoute.estimatedTimeMinutes,
      carbonFootprintKg: selectedRoute.carbonFootprintKg,
      routeType: selectedRoute.type === 'EcoFriendly' ? 'EcoFriendly' : 'Shortest',
      optimizationData: {
        comparison: optimizationResult.comparison,
        recommendation: optimizationResult.recommendation,
        alternativeRoute: selectedRoute.type === 'Shortest' 
          ? optimizationResult.routes.eco 
          : optimizationResult.routes.shortest,
        options: optimizationOptions
      }
    });

    // Update parcel with route reference
    await Parcel.findByIdAndUpdate(
      parcel._id,
      { 
        optimizedRoute: newRoute._id,
        lastOptimizedAt: new Date()
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: {
        parcel: {
          parcelId: parcel.parcelId,
          status: parcel.status,
          senderName: parcel.senderName,
          receiverName: parcel.receiverName
        },
        optimizedRoutes: {
          shortest: optimizationResult.routes.shortest,
          eco: optimizationResult.routes.eco
        },
        selectedRoute: {
          type: selectedRoute.type,
          distanceKm: selectedRoute.distanceKm,
          estimatedTimeMinutes: selectedRoute.estimatedTimeMinutes,
          carbonFootprintKg: selectedRoute.carbonFootprintKg,
          fuelConsumptionLiters: selectedRoute.fuelConsumptionLiters,
          costEstimate: selectedRoute.costEstimate
        },
        comparison: optimizationResult.comparison,
        recommendation: optimizationResult.recommendation,
        storedRoute: {
          routeId: newRoute._id,
          routeType: newRoute.routeType,
          createdAt: newRoute.createdAt
        },
        fallback: {
          used: optimizationResult.fallbackUsed || false,
          reason: optimizationResult.fallbackReason || null,
          cacheUsed: optimizationResult.cacheUsed || false,
          criticalFallback: optimizationResult.criticalFallback || false
        },
        warning: optimizationResult.fallbackUsed ? 
          'Route calculated using fallback data due to Map API unavailability. Accuracy may be reduced.' : null
      },
      message: 'Route optimization completed and stored successfully'
    });

  } catch (error) {
    console.error('Route optimization API error:', error);
    next(error);
  }
};

// @desc    Get optimization history for a parcel
// @route   GET /api/routes/optimize/:parcelId/history
// @access  Private (Supervisor and Driver only)
const getOptimizationHistory = async (req, res, next) => {
  try {
    const { parcelId } = req.params;

    if (!parcelId) {
      return res.status(400).json({ 
        message: 'Parcel ID is required.' 
      });
    }

    // Find the parcel
    const parcel = await Parcel.findOne({ parcelId });
    if (!parcel) {
      return res.status(404).json({ 
        message: 'Parcel not found.' 
      });
    }

    // Check authorization
    const isSupervisor = req.user.role === 'Supervisor';
    const isAssignedDriver = req.user.role === 'Driver' && 
      parcel.assignedDriver && parcel.assignedDriver.toString() === req.user.id;

    if (!isSupervisor && !isAssignedDriver) {
      return res.status(403).json({ 
        message: 'You can only view optimization history for parcels assigned to you.' 
      });
    }

    // Get optimization history
    const routes = await Route.find({ parcel: parcel._id })
      .sort({ createdAt: -1 })
      .limit(10); // Last 10 optimizations

    res.status(200).json({
      success: true,
      data: {
        parcel: {
          parcelId: parcel.parcelId,
          status: parcel.status,
          totalOptimizations: routes.length
        },
        optimizationHistory: routes.map(route => ({
          routeId: route._id,
          routeType: route.routeType,
          distanceKm: route.distanceKm,
          estimatedTimeMinutes: route.estimatedTimeMinutes,
          carbonFootprintKg: route.carbonFootprintKg,
          createdAt: route.createdAt,
          comparison: route.optimizationData?.comparison,
          recommendation: route.optimizationData?.recommendation
        }))
      },
      message: 'Optimization history retrieved successfully'
    });

  } catch (error) {
    console.error('Get optimization history error:', error);
    next(error);
  }
};

// @desc    Update route optimization with new parameters
// @route   PATCH /api/routes/optimize/:routeId
// @access  Private (Supervisor and assigned Driver only)
const updateOptimizedRoute = async (req, res, next) => {
  try {
    const { routeId } = req.params;
    const { options = {} } = req.body;

    if (!routeId) {
      return res.status(400).json({ 
        message: 'Route ID is required.' 
      });
    }

    // Find the route
    const route = await Route.findById(routeId).populate('parcel');
    if (!route) {
      return res.status(404).json({ 
        message: 'Route not found.' 
      });
    }

    // Check authorization
    const isSupervisor = req.user.role === 'Supervisor';
    const isAssignedDriver = req.user.role === 'Driver' && 
      route.parcel.assignedDriver && route.parcel.assignedDriver.toString() === req.user.id;

    if (!isSupervisor && !isAssignedDriver) {
      return res.status(403).json({ 
        message: 'You can only update routes for parcels assigned to you.' 
      });
    }

    // Re-optimize with new options
    const newOptimizationOptions = {
      vehicleType: 'medium',
      fuelType: 'hybrid',
      includeTraffic: true,
      timeOfDay: 'current',
      cargoWeight: 1000,
      ...options
    };

    const optimizationResult = await routeOptimizer.optimizeRoute(
      route.pickupLocation,
      route.deliveryLocation,
      newOptimizationOptions
    );

    // Update route with new optimization data
    const selectedRoute = optimizationResult.recommendation.recommended === 'eco' 
      ? optimizationResult.routes.eco 
      : optimizationResult.routes.shortest;

    const updatedRoute = await Route.findByIdAndUpdate(
      routeId,
      {
        distanceKm: selectedRoute.distanceKm,
        estimatedTimeMinutes: selectedRoute.estimatedTimeMinutes,
        carbonFootprintKg: selectedRoute.carbonFootprintKg,
        routeType: selectedRoute.type === 'EcoFriendly' ? 'EcoFriendly' : 'Shortest',
        optimizationData: {
          comparison: optimizationResult.comparison,
          recommendation: optimizationResult.recommendation,
          alternativeRoute: selectedRoute.type === 'Shortest' 
            ? optimizationResult.routes.eco 
            : optimizationResult.routes.shortest,
          options: newOptimizationOptions,
          lastUpdated: new Date()
        }
      },
      { new: true, runValidators: true }
    ).populate('parcel', 'parcelId senderName receiverName');

    res.status(200).json({
      success: true,
      data: {
        previousRoute: {
          routeType: route.routeType,
          distanceKm: route.distanceKm,
          estimatedTimeMinutes: route.estimatedTimeMinutes,
          carbonFootprintKg: route.carbonFootprintKg
        },
        updatedRoute: {
          routeId: updatedRoute._id,
          routeType: updatedRoute.routeType,
          distanceKm: updatedRoute.distanceKm,
          estimatedTimeMinutes: updatedRoute.estimatedTimeMinutes,
          carbonFootprintKg: updatedRoute.carbonFootprintKg,
          fuelConsumptionLiters: selectedRoute.fuelConsumptionLiters,
          costEstimate: selectedRoute.costEstimate
        },
        comparison: {
          distanceChange: selectedRoute.distanceKm - route.distanceKm,
          timeChange: selectedRoute.estimatedTimeMinutes - route.estimatedTimeMinutes,
          carbonChange: selectedRoute.carbonFootprintKg - route.carbonFootprintKg
        },
        optimization: optimizationResult
      },
      message: 'Route updated with new optimization successfully'
    });

  } catch (error) {
    console.error('Update optimized route error:', error);
    next(error);
  }
};

// @desc    Delete optimized route
// @route   DELETE /api/routes/optimize/:routeId
// @access  Private (Supervisor only)
const deleteOptimizedRoute = async (req, res, next) => {
  try {
    const { routeId } = req.params;

    if (!routeId) {
      return res.status(400).json({ 
        message: 'Route ID is required.' 
      });
    }

    // Find the route
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({ 
        message: 'Route not found.' 
      });
    }

    // Only supervisors can delete routes
    if (req.user.role !== 'Supervisor') {
      return res.status(403).json({ 
        message: 'Only supervisors can delete optimized routes.' 
      });
    }

    // Delete the route
    await Route.findByIdAndDelete(routeId);

    // Remove route reference from parcel
    if (route.parcel) {
      await Parcel.findByIdAndUpdate(
        route.parcel,
        { 
          $unset: { optimizedRoute: 1, lastOptimizedAt: 1 }
        }
      );
    }

    res.status(200).json({
      success: true,
      data: {
        deletedRoute: {
          routeId: route._id,
          routeType: route.routeType,
          distanceKm: route.distanceKm,
          carbonFootprintKg: route.carbonFootprintKg
        }
      },
      message: 'Optimized route deleted successfully'
    });

  } catch (error) {
    console.error('Delete optimized route error:', error);
    next(error);
  }
};

export {
  optimizeRouteForParcel,
  getOptimizationHistory,
  updateOptimizedRoute,
  deleteOptimizedRoute
};
