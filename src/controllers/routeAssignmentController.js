import Route from '../models/Route.js';
import Parcel from '../models/Parcel.js';

/**
 * Route Assignment Controller for EcoTrack Logistics System
 * 
 * Handles route assignment functionality with supervisor control
 * and ensures one active route per parcel.
 */

// @desc    Assign optimized route to parcel
// @route   POST /api/routes/assign
// @access  Private (Supervisor only)
const assignRouteToParcel = async (req, res, next) => {
  try {
    const {
      parcelId,
      routeId,
      routeType = 'Shortest',
      assignmentNotes = ''
    } = req.body;

    // Validate required fields
    if (!parcelId || !routeId) {
      return res.status(400).json({ 
        message: 'Parcel ID and Route ID are required.' 
      });
    }

    // Validate route type
    if (!['Shortest', 'EcoFriendly'].includes(routeType)) {
      return res.status(400).json({ 
        message: 'Route type must be either "Shortest" or "EcoFriendly".' 
      });
    }

    // Find the parcel
    const parcel = await Parcel.findOne({ parcelId });
    if (!parcel) {
      return res.status(404).json({ 
        message: 'Parcel not found.' 
      });
    }

    // Find the route
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({ 
        message: 'Route not found.' 
      });
    }

    // Verify route belongs to this parcel (if already linked)
    if (route.parcel && route.parcel.toString() !== parcel._id.toString()) {
      return res.status(400).json({ 
        message: 'Route is already assigned to a different parcel.' 
      });
    }

    // Deactivate any existing routes for this parcel
    await Route.updateMany(
      { parcel: parcel._id, isActive: true },
      { isActive: false, deactivationReason: 'Reassigned', deactivationDate: new Date() }
    );

    // Update route with parcel assignment
    const assignedRoute = await Route.findByIdAndUpdate(
      routeId,
      {
        parcel: parcel._id,
        routeType: routeType,
        isActive: true,
        assignedAt: new Date(),
        assignedBy: req.user.id,
        assignmentNotes: assignmentNotes
      },
      { new: true, runValidators: true }
    );

    // Update parcel with route reference
    const updatedParcel = await Parcel.findByIdAndUpdate(
      parcel._id,
      { 
        optimizedRoute: routeId,
        routeAssignmentStatus: 'Assigned',
        lastAssignedAt: new Date(),
        assignedRouteType: routeType
      },
      { new: true, runValidators: true }
    ).populate('optimizedRoute', 'distanceKm estimatedTimeMinutes carbonFootprintKg routeType');

    res.status(200).json({
      success: true,
      data: {
        parcel: {
          parcelId: updatedParcel.parcelId,
          status: updatedParcel.status,
          routeAssignmentStatus: updatedParcel.routeAssignmentStatus
        },
        assignedRoute: {
          routeId: assignedRoute._id,
          routeType: assignedRoute.routeType,
          distanceKm: assignedRoute.distanceKm,
          estimatedTimeMinutes: assignedRoute.estimatedTimeMinutes,
          carbonFootprintKg: assignedRoute.carbonFootprintKg,
          assignedAt: assignedRoute.assignedAt,
          isActive: assignedRoute.isActive
        },
        previousRoutes: {
          deactivated: await Route.find({ 
            parcel: parcel._id, 
            isActive: false 
          }).sort({ deactivationDate: -1 }).limit(5)
        }
      },
      message: 'Route assigned to parcel successfully'
    });

  } catch (error) {
    console.error('Route assignment error:', error);
    next(error);
  }
};

// @desc    Get route assignment for a parcel
// @route   GET /api/routes/assign/:parcelId
// @access  Private (Supervisor only)
const getRouteAssignment = async (req, res, next) => {
  try {
    const { parcelId } = req.params;

    if (!parcelId) {
      return res.status(400).json({ 
        message: 'Parcel ID is required.' 
      });
    }

    // Find the parcel with route assignment
    const parcel = await Parcel.findOne({ parcelId })
      .populate({
        path: 'optimizedRoute',
        select: 'routeType distanceKm estimatedTimeMinutes carbonFootprintKg pickupLocation deliveryLocation isActive assignedAt'
      });

    if (!parcel) {
      return res.status(404).json({ 
        message: 'Parcel not found.' 
      });
    }

    // Get all routes for this parcel (active and inactive)
    const allRoutes = await Route.find({ parcel: parcel._id })
      .sort({ assignedAt: -1 })
      .populate('assignedBy', 'name email');

    const activeRoute = allRoutes.find(route => route.isActive);
    const inactiveRoutes = allRoutes.filter(route => !route.isActive);

    res.status(200).json({
      success: true,
      data: {
        parcel: {
          parcelId: parcel.parcelId,
          status: parcel.status,
          routeAssignmentStatus: parcel.routeAssignmentStatus || 'Unassigned',
          assignedRouteType: parcel.assignedRouteType
        },
        activeRoute: activeRoute ? {
          routeId: activeRoute._id,
          routeType: activeRoute.routeType,
          distanceKm: activeRoute.distanceKm,
          estimatedTimeMinutes: activeRoute.estimatedTimeMinutes,
          carbonFootprintKg: activeRoute.carbonFootprintKg,
          assignedAt: activeRoute.assignedAt,
          assignedBy: activeRoute.assignedBy,
          assignmentNotes: activeRoute.assignmentNotes
        } : null,
        routeHistory: inactiveRoutes.map(route => ({
          routeId: route._id,
          routeType: route.routeType,
          distanceKm: route.distanceKm,
          estimatedTimeMinutes: route.estimatedTimeMinutes,
          carbonFootprintKg: route.carbonFootprintKg,
          assignedAt: route.assignedAt,
          deactivationReason: route.deactivationReason,
          deactivationDate: route.deactivationDate
        })),
        statistics: {
          totalRoutes: allRoutes.length,
          activeRoutes: activeRoute ? 1 : 0,
          totalDistance: allRoutes.reduce((sum, route) => sum + route.distanceKm, 0),
          totalCarbonFootprint: allRoutes.reduce((sum, route) => sum + route.carbonFootprintKg, 0),
          averageDistance: allRoutes.length > 0 ? 
            Math.round((allRoutes.reduce((sum, route) => sum + route.distanceKm, 0) / allRoutes.length) * 100) / 100 : 0
        }
      },
      message: 'Route assignment retrieved successfully'
    });

  } catch (error) {
    console.error('Get route assignment error:', error);
    next(error);
  }
};

// @desc    Update route assignment (change route type)
// @route   PATCH /api/routes/assign/:parcelId
// @access  Private (Supervisor only)
const updateRouteAssignment = async (req, res, next) => {
  try {
    const { parcelId } = req.params;
    const { routeType, assignmentNotes = '' } = req.body;

    if (!parcelId) {
      return res.status(400).json({ 
        message: 'Parcel ID is required.' 
      });
    }

    if (!['Shortest', 'EcoFriendly'].includes(routeType)) {
      return res.status(400).json({ 
        message: 'Route type must be either "Shortest" or "EcoFriendly".' 
      });
    }

    // Find the parcel
    const parcel = await Parcel.findOne({ parcelId });
    if (!parcel) {
      return res.status(404).json({ 
        message: 'Parcel not found.' 
      });
    }

    // Check if parcel has an active route
    if (!parcel.optimizedRoute) {
      return res.status(400).json({ 
        message: 'Parcel has no assigned route to update.' 
      });
    }

    // Find the active route
    const activeRoute = await Route.findOne({ 
      parcel: parcel._id, 
      isActive: true 
    });

    if (!activeRoute) {
      return res.status(404).json({ 
        message: 'No active route found for this parcel.' 
      });
    }

    // Create a new route with updated type if needed
    let updatedRoute;
    if (activeRoute.routeType !== routeType) {
      // Create new route with different type
      updatedRoute = await Route.create({
        parcel: parcel._id,
        pickupLocation: activeRoute.pickupLocation,
        deliveryLocation: activeRoute.deliveryLocation,
        distanceKm: activeRoute.distanceKm,
        estimatedTimeMinutes: activeRoute.estimatedTimeMinutes,
        carbonFootprintKg: activeRoute.carbonFootprintKg,
        routeType: routeType,
        isActive: true,
        assignedAt: new Date(),
        assignedBy: req.user.id,
        assignmentNotes: assignmentNotes,
        previousRouteId: activeRoute._id
      });

      // Deactivate the old route
      await Route.findByIdAndUpdate(
        activeRoute._id,
        {
          isActive: false,
          deactivationReason: 'Route type changed',
          deactivationDate: new Date()
        }
      );

      // Update parcel with new route reference
      await Parcel.findByIdAndUpdate(
        parcel._id,
        {
          optimizedRoute: updatedRoute._id,
          routeAssignmentStatus: 'Reassigned',
          assignedRouteType: routeType,
          lastAssignedAt: new Date()
        }
      );
    } else {
      // Just update the assignment notes
      updatedRoute = await Route.findByIdAndUpdate(
        activeRoute._id,
        {
          assignmentNotes: assignmentNotes,
          lastUpdated: new Date()
        },
        { new: true, runValidators: true }
      );
    }

    res.status(200).json({
      success: true,
      data: {
        parcel: {
          parcelId: parcel.parcelId,
          routeAssignmentStatus: 'Reassigned',
          assignedRouteType: routeType
        },
        updatedRoute: {
          routeId: updatedRoute._id,
          routeType: updatedRoute.routeType,
          distanceKm: updatedRoute.distanceKm,
          estimatedTimeMinutes: updatedRoute.estimatedTimeMinutes,
          carbonFootprintKg: updatedRoute.carbonFootprintKg,
          assignedAt: updatedRoute.assignedAt,
          assignmentNotes: updatedRoute.assignmentNotes
        },
        changes: {
          routeTypeChanged: activeRoute.routeType !== routeType,
          previousRouteType: activeRoute.routeType,
          newRouteType: routeType
        }
      },
      message: 'Route assignment updated successfully'
    });

  } catch (error) {
    console.error('Update route assignment error:', error);
    next(error);
  }
};

// @desc    Remove route assignment from parcel
// @route   DELETE /api/routes/assign/:parcelId
// @access  Private (Supervisor only)
const removeRouteAssignment = async (req, res, next) => {
  try {
    const { parcelId } = req.params;
    const { reason = 'Manual removal' } = req.body;

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

    // Deactivate all routes for this parcel
    const deactivatedRoutes = await Route.updateMany(
      { parcel: parcel._id, isActive: true },
      {
        isActive: false,
        deactivationReason: reason,
        deactivationDate: new Date()
      }
    );

    // Update parcel to remove route assignment
    const updatedParcel = await Parcel.findByIdAndUpdate(
      parcel._id,
      {
        $unset: { 
          optimizedRoute: 1, 
          routeAssignmentStatus: 1, 
          assignedRouteType: 1, 
          lastAssignedAt: 1 
        }
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: {
        parcel: {
          parcelId: updatedParcel.parcelId,
          status: updatedParcel.status,
          routeAssignmentStatus: 'Unassigned'
        },
        deactivation: {
          routesDeactivated: deactivatedRoutes.modifiedCount,
          reason: reason,
          deactivationDate: new Date()
        }
      },
      message: 'Route assignment removed successfully'
    });

  } catch (error) {
    console.error('Remove route assignment error:', error);
    next(error);
  }
};

// @desc    Get all route assignments (for supervisor dashboard)
// @route   GET /api/routes/assignments
// @access  Private (Supervisor only)
const getAllRouteAssignments = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = 'all', 
      routeType = 'all' 
    } = req.query;

    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (status !== 'all') {
      filter.isActive = status === 'active';
    }
    if (routeType !== 'all') {
      filter.routeType = routeType;
    }

    // Get assignments with parcel data
    const assignments = await Route.find(filter)
      .populate({
        path: 'parcel',
        select: 'parcelId status senderName receiverName',
        match: status !== 'all' ? { status: status } : {}
      })
      .populate('assignedBy', 'name email')
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const totalAssignments = await Route.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        assignments: assignments.map(assignment => ({
          routeId: assignment._id,
          routeType: assignment.routeType,
          distanceKm: assignment.distanceKm,
          estimatedTimeMinutes: assignment.estimatedTimeMinutes,
          carbonFootprintKg: assignment.carbonFootprintKg,
          isActive: assignment.isActive,
          assignedAt: assignment.assignedAt,
          parcel: assignment.parcel,
          assignedBy: assignment.assignedBy,
          assignmentNotes: assignment.assignmentNotes
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalAssignments / limit),
          totalAssignments,
          hasNext: page * limit < totalAssignments,
          hasPrev: page > 1
        }
      },
      message: 'Route assignments retrieved successfully'
    });

  } catch (error) {
    console.error('Get all route assignments error:', error);
    next(error);
  }
};

export {
  assignRouteToParcel,
  getRouteAssignment,
  updateRouteAssignment,
  removeRouteAssignment,
  getAllRouteAssignments
};
