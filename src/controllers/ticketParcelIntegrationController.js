import Ticket from '../models/Ticket.js';
import Parcel from '../models/Parcel.js';

/**
 * Ticket-Parcel Integration Controller for EcoTrack Logistics System
 * 
 * Provides integration between tickets and parcel tracking:
 * - Fetch parcel status when viewing tickets
 * - Display parcel delivery progress alongside ticket details
 * - Maintain parcel lifecycle integrity
 */

// @desc    Get ticket with integrated parcel information
// @route   GET /api/tickets/:ticketId/with-parcel
// @access  Private (Supervisor and SupportAgent only)
const getTicketWithParcel = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID is required.'
      });
    }

    // Find ticket with basic population
    const ticket = await Ticket.findOne({ ticketId, isDeleted: false })
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('parcel', 'parcelId status deliveryLocation pickupLocation');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // Role-based access control
    const isSupervisor = req.user.role === 'Supervisor';
    const isAssignedAgent = req.user.role === 'SupportAgent' && 
      ticket.assignedTo && ticket.assignedTo._id.toString() === req.user.id;

    if (!isSupervisor && !isAssignedAgent) {
      return res.status(403).json({
        success: false,
        message: 'You can only view tickets assigned to you.'
      });
    }

    // Enhanced parcel information if parcel exists
    let parcelDetails = null;
    if (ticket.parcel) {
      // Get full parcel details with tracking information
      const fullParcel = await Parcel.findOne({ parcelId: ticket.parcel.parcelId })
        .populate('currentLocation', 'name address')
        .populate('assignedDriver', 'name email')
        .populate('route', 'routeType distanceKm estimatedTimeMinutes');

      parcelDetails = {
        parcelId: fullParcel.parcelId,
        status: fullParcel.status,
        senderName: fullParcel.senderName,
        receiverName: fullParcel.receiverName,
        pickupLocation: fullParcel.pickupLocation,
        deliveryLocation: fullParcel.deliveryLocation,
        currentLocation: fullParcel.currentLocation,
        assignedDriver: fullParcel.assignedDriver,
        route: fullParcel.route,
        estimatedDelivery: fullParcel.estimatedDelivery,
        actualDelivery: fullParcel.actualDelivery,
        trackingHistory: fullParcel.trackingHistory || [],
        createdAt: fullParcel.createdAt,
        updatedAt: fullParcel.updatedAt,
        // Delivery progress calculation
        deliveryProgress: calculateDeliveryProgress(fullParcel),
        // Status timeline for ticket context
        statusTimeline: generateParcelStatusTimeline(fullParcel)
      };
    }

    res.status(200).json({
      success: true,
      data: {
        ticket: {
          ticketId: ticket.ticketId,
          issueType: ticket.issueType,
          priority: ticket.priority,
          status: ticket.status,
          description: ticket.description,
          createdBy: ticket.createdBy,
          assignedTo: ticket.assignedTo,
          parcel: parcelDetails,
          resolution: ticket.resolution,
          resolutionCategory: ticket.resolutionCategory,
          customerSatisfaction: ticket.customerSatisfaction,
          internalNotes: ticket.internalNotes,
          estimatedResolutionTime: ticket.estimatedResolutionTime,
          actualResolutionTime: ticket.actualResolutionTime,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          activityHistory: ticket.activityHistory
        },
        parcelIntegration: {
          hasParcel: !!parcelDetails,
          parcelStatus: parcelDetails ? parcelDetails.status : null,
          deliveryProgress: parcelDetails ? parcelDetails.deliveryProgress : null,
          lastTrackingUpdate: parcelDetails && parcelDetails.trackingHistory.length > 0 
            ? parcelDetails.trackingHistory[parcelDetails.trackingHistory.length - 1].timestamp 
            : null
        }
      },
      message: 'Ticket with parcel information retrieved successfully.'
    });

  } catch (error) {
    console.error('Get ticket with parcel error:', error);
    next(error);
  }
};

// @desc    Get tickets with parcel summary
// @route   GET /api/tickets/with-parcel-summary
// @access  Private (Supervisor and SupportAgent only)
const getTicketsWithParcelSummary = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      issueType,
      parcelStatus,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build base query
    let query = { isDeleted: false };

    // Apply role-based access control
    if (req.user.role === 'SupportAgent') {
      query.assignedTo = req.user.id;
    }

    // Apply filters
    if (status) {
      query.status = status;
    }
    if (priority) {
      query.priority = priority;
    }
    if (issueType) {
      query.issueType = issueType;
    }

    // Build sort options
    const sortOptions = {};
    const validSortFields = ['createdAt', 'updatedAt', 'priority', 'status', 'issueType'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    sortOptions[sortField] = sortDirection;

    // Execute query with parcel population
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate('createdBy', 'name email role')
        .populate('assignedTo', 'name email role')
        .populate('parcel', 'parcelId status deliveryLocation pickupLocation')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Ticket.countDocuments(query)
    ]);

    // Enhance with parcel summary information
    const enhancedTickets = await Promise.all(
      tickets.map(async (ticket) => {
        let parcelSummary = null;
        
        if (ticket.parcel) {
          const parcel = await Parcel.findOne({ parcelId: ticket.parcel.parcelId });
          parcelSummary = {
            parcelId: parcel.parcelId,
            status: parcel.status,
            deliveryProgress: calculateDeliveryProgress(parcel),
            lastUpdate: parcel.updatedAt,
            hasRoute: !!parcel.route,
            isDelivered: parcel.status === 'Delivered'
          };
        }

        return {
          ...ticket,
          parcelSummary
        };
      })
    );

    // Filter by parcel status if specified
    let filteredTickets = enhancedTickets;
    if (parcelStatus) {
      filteredTickets = enhancedTickets.filter(ticket => 
        ticket.parcelSummary && ticket.parcelSummary.status === parcelStatus
      );
    }

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: {
        tickets: filteredTickets,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalTickets: filteredTickets.length,
          limit: limitNum,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? pageNum + 1 : null,
          prevPage: hasPrevPage ? pageNum - 1 : null
        },
        filters: {
          status,
          priority,
          issueType,
          parcelStatus,
          sortBy,
          sortOrder
        },
        summary: {
          totalTickets: filteredTickets.length,
          ticketsWithParcels: filteredTickets.filter(t => t.parcelSummary).length,
          deliveredParcels: filteredTickets.filter(t => t.parcelSummary && t.parcelSummary.isDelivered).length,
          inTransitParcels: filteredTickets.filter(t => t.parcelSummary && t.parcelSummary.status === 'InTransit').length
        }
      },
      message: 'Tickets with parcel summary retrieved successfully.'
    });

  } catch (error) {
    console.error('Get tickets with parcel summary error:', error);
    next(error);
  }
};

// @desc    Get parcel tracking information for ticket
// @route   GET /api/tickets/:ticketId/parcel-tracking
// @access  Private (Supervisor and SupportAgent only)
const getTicketParcelTracking = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID is required.'
      });
    }

    // Find ticket
    const ticket = await Ticket.findOne({ ticketId, isDeleted: false });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // Role-based access control
    const isSupervisor = req.user.role === 'Supervisor';
    const isAssignedAgent = req.user.role === 'SupportAgent' && 
      ticket.assignedTo && ticket.assignedTo.toString() === req.user.id;

    if (!isSupervisor && !isAssignedAgent) {
      return res.status(403).json({
        success: false,
        message: 'You can only view tracking for tickets assigned to you.'
      });
    }

    // Get parcel tracking information
    let trackingInfo = null;
    if (ticket.parcel) {
      const parcel = await Parcel.findOne({ parcelId: ticket.parcel })
        .populate('currentLocation', 'name address coordinates')
        .populate('assignedDriver', 'name email phone')
        .populate('route', 'routeType waypoints distanceKm');

      if (parcel) {
        trackingInfo = {
          parcelId: parcel.parcelId,
          currentStatus: parcel.status,
          currentLocation: parcel.currentLocation,
          assignedDriver: parcel.assignedDriver,
          route: parcel.route,
          trackingHistory: parcel.trackingHistory || [],
          estimatedDelivery: parcel.estimatedDelivery,
          actualDelivery: parcel.actualDelivery,
          deliveryProgress: calculateDeliveryProgress(parcel),
          nextMilestone: getNextMilestone(parcel),
          timeInTransit: calculateTimeInTransit(parcel),
          createdAt: parcel.createdAt,
          updatedAt: parcel.updatedAt
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ticketId: ticket.ticketId,
        issueType: ticket.issueType,
        hasParcel: !!trackingInfo,
        trackingInfo,
        ticketStatus: ticket.status,
        ticketPriority: ticket.priority
      },
      message: 'Parcel tracking information retrieved successfully.'
    });

  } catch (error) {
    console.error('Get ticket parcel tracking error:', error);
    next(error);
  }
};

/**
 * Calculate delivery progress percentage
 * @private
 */
function calculateDeliveryProgress(parcel) {
  if (!parcel) return 0;

  const statusProgress = {
    'Created': 0,
    'PickedUp': 25,
    'InTransit': 50,
    'OutForDelivery': 75,
    'Delivered': 100,
    'Returned': 0,
    'Lost': 0
  };

  return statusProgress[parcel.status] || 0;
}

/**
 * Generate parcel status timeline
 * @private
 */
function generateParcelStatusTimeline(parcel) {
  if (!parcel || !parcel.trackingHistory) return [];

  return parcel.trackingHistory.map(event => ({
    timestamp: event.timestamp,
    status: event.status,
    location: event.location,
    description: event.description,
    type: 'status_change'
  })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/**
 * Get next delivery milestone
 * @private
 */
function getNextMilestone(parcel) {
  if (!parcel) return null;

  const milestones = {
    'Created': 'Pickup',
    'PickedUp': 'In Transit',
    'InTransit': 'Out for Delivery',
    'OutForDelivery': 'Delivery',
    'Delivered': null,
    'Returned': 'Return Processing',
    'Lost': 'Investigation Required'
  };

  return milestones[parcel.status] || null;
}

/**
 * Calculate time in transit
 * @private
 */
function calculateTimeInTransit(parcel) {
  if (!parcel || parcel.status !== 'InTransit') return null;

  const pickupTime = parcel.trackingHistory?.find(event => event.status === 'PickedUp')?.timestamp;
  if (!pickupTime) return null;

  const now = new Date();
  const pickup = new Date(pickupTime);
  const diffMs = now - pickup;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  return {
    totalHours: diffHours,
    totalDays: diffDays,
    formatted: diffDays > 0 ? `${diffDays}d ${diffHours % 24}h` : `${diffHours}h`
  };
}

export {
  getTicketWithParcel,
  getTicketsWithParcelSummary,
  getTicketParcelTracking
};
