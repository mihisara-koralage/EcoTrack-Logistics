import Ticket from '../models/Ticket.js';
import Parcel from '../models/Parcel.js';
import User from '../models/User.js';

/**
 * Ticket Controller for EcoTrack Logistics System
 * 
 * Provides comprehensive ticket management functionality:
 * - Ticket creation with validation and auto-assignment
 * - Role-based access control and permissions
 * - Priority calculation based on issue type
 * - Parcel reference validation
 */

// @desc    Create a new ticket
// @route   POST /api/tickets
// @access  Private (Supervisor and SupportAgent only)
const createTicket = async (req, res, next) => {
  try {
    const {
      parcelId,
      issueType,
      priority,
      description,
      tags,
      assignedTo
    } = req.body;

    // Validate required fields
    if (!issueType || !description) {
      return res.status(400).json({
        success: false,
        message: 'Issue type and description are required.'
      });
    }

    // Validate issue type
    const validIssueTypes = ['Lost', 'Delayed', 'Damaged', 'General'];
    if (!validIssueTypes.includes(issueType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid issue type. Must be one of: Lost, Delayed, Damaged, General.'
      });
    }

    // Validate priority if provided
    if (priority) {
      const validPriorities = ['Low', 'Medium', 'High'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid priority. Must be one of: Low, Medium, High.'
        });
      }
    }

    // Validate parcel reference if provided
    let parcelReference = null;
    if (parcelId) {
      const parcel = await Parcel.findOne({ parcelId });
      if (!parcel) {
        return res.status(400).json({
          success: false,
          message: 'Parcel not found with the provided parcel ID.'
        });
      }
      parcelReference = parcel._id;
    }

    // Validate assigned support agent if provided
    let assignedAgent = null;
    if (assignedTo) {
      const agent = await User.findById(assignedTo);
      if (!agent || agent.role !== 'SupportAgent') {
        return res.status(400).json({
          success: false,
          message: 'Invalid support agent assignment.'
        });
      }
      assignedAgent = agent._id;
    }

    // Auto-assign priority based on issue type if not provided
    let calculatedPriority = priority;
    if (!priority) {
      calculatedPriority = calculatePriorityByIssueType(issueType);
    }

    // Create ticket with auto-generated ID
    const ticketData = {
      issueType,
      priority: calculatedPriority,
      description,
      createdBy: req.user.id,
      parcel: parcelReference,
      assignedTo: assignedAgent,
      status: 'Open', // Set initial status
      tags: tags || []
    };

    // Generate ticket ID manually to avoid middleware issues
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const sequence = await Ticket.getNextSequence(date);
    ticketData.ticketId = `TK-${date}-${sequence.toString().padStart(4, '0')}`;

    const ticket = await Ticket.create(ticketData);

    // Populate references for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTo', select: 'name email role' },
      { path: 'parcel', select: 'parcelId status deliveryLocation' }
    ]);

    res.status(201).json({
      success: true,
      data: {
        ticketId: ticket.ticketId,
        issueType: ticket.issueType,
        priority: ticket.priority,
        status: ticket.status,
        description: ticket.description,
        parcel: ticket.parcel,
        createdBy: ticket.createdBy,
        assignedTo: ticket.assignedTo,
        tags: ticket.tags,
        estimatedResolutionTime: ticket.estimatedResolutionTime,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      },
      message: 'Ticket created successfully.'
    });

  } catch (error) {
    console.error('Create ticket error:', error);
    
    // Handle duplicate ticket ID error
    if (error.code === 11000 && error.keyPattern?.ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID generation conflict. Please try again.'
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validationErrors
      });
    }

    next(error);
  }
};

// @desc    Get all tickets with filtering and pagination
// @route   GET /api/tickets
// @access  Private (Supervisor and SupportAgent only)
const getTickets = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      issueType,
      assignedTo,
      createdBy,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { isDeleted: false };

    // Apply filters
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (issueType) query.issueType = issueType;
    if (assignedTo) query.assignedTo = assignedTo;
    if (createdBy) query.createdBy = createdBy;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate('createdBy', 'name email role')
        .populate('assignedTo', 'name email role')
        .populate('parcel', 'parcelId status')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      Ticket.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        tickets,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalTickets: total,
          limit: parseInt(limit)
        }
      },
      message: 'Tickets retrieved successfully.'
    });

  } catch (error) {
    console.error('Get tickets error:', error);
    next(error);
  }
};

// @desc    Get single ticket by ID
// @route   GET /api/tickets/:ticketId
// @access  Private (Supervisor and SupportAgent only)
const getTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

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

    res.status(200).json({
      success: true,
      data: ticket,
      message: 'Ticket retrieved successfully.'
    });

  } catch (error) {
    console.error('Get ticket error:', error);
    next(error);
  }
};

// @desc    Update ticket status
// @route   PATCH /api/tickets/:ticketId/status
// @access  Private (Supervisor and assigned SupportAgent only)
const updateTicketStatus = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { status, resolution, resolutionCategory } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required.'
      });
    }

    const validStatuses = ['Open', 'InProgress', 'Resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: Open, InProgress, Resolved.'
      });
    }

    const ticket = await Ticket.findOne({ ticketId, isDeleted: false });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // Check permissions
    const isSupervisor = req.user.role === 'Supervisor';
    const isAssignedAgent = req.user.role === 'SupportAgent' && 
      ticket.assignedTo && ticket.assignedTo.toString() === req.user.id;

    if (!isSupervisor && !isAssignedAgent) {
      return res.status(403).json({
        success: false,
        message: 'You can only update tickets assigned to you.'
      });
    }

    // Store previous status for activity log
    const previousStatus = ticket.status;

    // Update ticket
    ticket.status = status;
    ticket.updatedBy = req.user.id;

    // Handle resolution details
    if (status === 'Resolved') {
      if (resolution) ticket.resolution = resolution;
      if (resolutionCategory) ticket.resolutionCategory = resolutionCategory;
      ticket.actualResolutionTime = new Date();
    }

    await ticket.save();

    // Populate for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTo', select: 'name email role' },
      { path: 'parcel', select: 'parcelId status' }
    ]);

    res.status(200).json({
      success: true,
      data: ticket,
      message: 'Ticket status updated successfully.'
    });

  } catch (error) {
    console.error('Update ticket status error:', error);
    next(error);
  }
};

// @desc    Assign ticket to support agent
// @route   PATCH /api/tickets/:ticketId/assign
// @access  Private (Supervisor only)
const assignTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { assignedTo, notes } = req.body;

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Support agent ID is required.'
      });
    }

    // Validate support agent
    const agent = await User.findById(assignedTo);
    if (!agent || agent.role !== 'SupportAgent') {
      return res.status(400).json({
        success: false,
        message: 'Invalid support agent.'
      });
    }

    const ticket = await Ticket.findOne({ ticketId, isDeleted: false });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // Update assignment
    const previousAssignee = ticket.assignedTo;
    ticket.assignedTo = assignedTo;
    ticket.updatedBy = req.user.id;

    if (notes) {
      ticket.internalNotes = notes;
    }

    await ticket.save();

    // Populate for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTo', select: 'name email role' },
      { path: 'parcel', select: 'parcelId status' }
    ]);

    res.status(200).json({
      success: true,
      data: ticket,
      message: 'Ticket assigned successfully.'
    });

  } catch (error) {
    console.error('Assign ticket error:', error);
    next(error);
  }
};

// @desc    Get ticket statistics
// @route   GET /api/tickets/statistics
// @access  Private (Supervisor only)
const getTicketStatistics = async (req, res, next) => {
  try {
    const { startDate, endDate, issueType, status } = req.query;

    // Build filters
    const filters = {};
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }
    if (issueType) filters.issueType = issueType;
    if (status) filters.status = status;

    const statistics = await Ticket.getStatistics(filters);

    res.status(200).json({
      success: true,
      data: statistics,
      message: 'Ticket statistics retrieved successfully.'
    });

  } catch (error) {
    console.error('Get ticket statistics error:', error);
    next(error);
  }
};

/**
 * Helper function to calculate priority based on issue type
 * @private
 */
const calculatePriorityByIssueType = (issueType) => {
  const priorityMapping = {
    'Lost': 'High',        // Lost parcels are critical
    'Delayed': 'Medium',     // Delays are standard priority
    'Damaged': 'High',      // Damaged items need urgent attention
    'General': 'Low'        // General inquiries are lower priority
  };

  return priorityMapping[issueType] || 'Medium';
};

export {
  createTicket,
  getTickets,
  getTicket,
  updateTicketStatus,
  assignTicket,
  getTicketStatistics
};
