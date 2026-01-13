import Ticket from '../models/Ticket.js';
import Parcel from '../models/Parcel.js';
import User from '../models/User.js';

/**
 * Simple Ticket Controller for EcoTrack Logistics System
 * 
 * Simplified implementation focusing on core functionality:
 * - Basic ticket creation
 * - Role-based access control
 * - Priority auto-assignment
 * - Parcel validation
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

    // Generate simple ticket ID
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const ticketId = `TK-${date}-${randomSuffix}`;

    // Create ticket with minimal required fields
    const ticketData = {
      ticketId,
      issueType,
      priority: calculatedPriority,
      description,
      createdBy: req.user.id,
      parcel: parcelReference,
      assignedTo: assignedAgent,
      status: 'Open', // Set initial status
      tags: tags || []
    };

    const ticket = await Ticket.create(ticketData);

    // Populate references for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTo', select: 'name email role' },
      { path: 'parcel', select: 'parcelId status' }
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
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      },
      message: 'Ticket created successfully.'
    });

  } catch (error) {
    console.error('Create ticket error:', error);
    
    // Handle duplicate ticket ID error
    if (error.code === 11000) {
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

export { createTicket };
