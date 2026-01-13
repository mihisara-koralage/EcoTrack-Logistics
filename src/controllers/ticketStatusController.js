import Ticket from '../models/Ticket.js';
import User from '../models/User.js';

/**
 * Ticket Status Update Controller for EcoTrack Logistics System
 * 
 * Provides ticket status update functionality with role-based access control:
 * - SupportAgent and Supervisor access
 * - Valid status transitions enforcement
 * - Comprehensive activity logging
 * - Resolution tracking and validation
 */

// @desc    Update ticket status
// @route   PATCH /api/tickets/:ticketId/status
// @access  Private (SupportAgent and Supervisor only)
const updateTicketStatus = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { status, resolution, resolutionCategory, internalNotes, customerSatisfaction, actualResolutionTime } = req.body;

    // Validate required fields
    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID is required.'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required.'
      });
    }

    // Find the ticket
    const ticket = await Ticket.findOne({ ticketId, isDeleted: false });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // Validate status value
    const validStatuses = ['Open', 'InProgress', 'Resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: Open, InProgress, Resolved.'
      });
    }

    // Validate resolution category if status is Resolved
    if (status === 'Resolved') {
      const validResolutionCategories = [
        'Delivered',
        'Refunded',
        'Replaced',
        'Informational',
        'SystemUpdate',
        'ProcessImprovement',
        'Other'
      ];

      if (resolutionCategory && !validResolutionCategories.includes(resolutionCategory)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid resolution category. Must be one of: ' + validResolutionCategories.join(', ')
        });
      }

      // Validate customer satisfaction rating
      if (customerSatisfaction !== undefined) {
        if (typeof customerSatisfaction !== 'number' || customerSatisfaction < 1 || customerSatisfaction > 5) {
          return res.status(400).json({
            success: false,
            message: 'Customer satisfaction must be a number between 1 and 5.'
          });
        }
      }
    }

    // Role-based access control
    const isSupervisor = req.user.role === 'Supervisor';
    const isAssignedAgent = req.user.role === 'SupportAgent' && 
      ticket.assignedTo && ticket.assignedTo.toString() === req.user.id;

    if (!isSupervisor && !isAssignedAgent) {
      return res.status(403).json({
        success: false,
        message: 'You can only update status for tickets assigned to you.'
      });
    }

    // Validate status transitions
    const transitionValidation = validateStatusTransition(ticket.status, status);
    if (!transitionValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: transitionValidation.error
      });
    }

    // Store previous status for audit trail
    const previousStatus = ticket.status;
    const previousAssignedTo = ticket.assignedTo;

    // Update ticket status
    ticket.status = status;
    ticket.updatedBy = req.user.id;

    // Add resolution details if resolving
    if (status === 'Resolved') {
      if (resolution) {
        ticket.resolution = resolution;
      }
      if (resolutionCategory) {
        ticket.resolutionCategory = resolutionCategory;
      }
      if (customerSatisfaction !== undefined) {
        ticket.customerSatisfaction = customerSatisfaction;
      }
      if (actualResolutionTime) {
        const resolutionTime = new Date(actualResolutionTime);
        if (!isNaN(resolutionTime.getTime())) {
          ticket.actualResolutionTime = resolutionTime;
        }
      } else {
        ticket.actualResolutionTime = new Date(); // Default to current time
      }
    }

    // Add internal notes if provided
    if (internalNotes) {
      ticket.internalNotes = internalNotes;
    }

    // Add status change activity to history
    ticket.activityHistory.push({
      action: 'StatusChanged',
      performedBy: req.user.id,
      timestamp: new Date(),
      details: `Status changed from ${previousStatus} to ${status}${status === 'Resolved' ? ' - Ticket resolved' : ''}`,
      previousValue: {
        status: previousStatus,
        assignedTo: previousAssignedTo
      },
      newValue: {
        status: status,
        assignedTo: ticket.assignedTo
      }
    });

    await ticket.save();

    // Populate references for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTo', select: 'name email role' },
      { path: 'parcel', select: 'parcelId status deliveryLocation pickupLocation' },
      { path: 'activityHistory.performedBy', select: 'name email role' }
    ]);

    res.status(200).json({
      success: true,
      data: {
        ticketId: ticket.ticketId,
        issueType: ticket.issueType,
        priority: ticket.priority,
        status: ticket.status,
        description: ticket.description,
        assignedTo: ticket.assignedTo,
        createdBy: ticket.createdBy,
        parcel: ticket.parcel,
        resolution: ticket.resolution || null,
        resolutionCategory: ticket.resolutionCategory || null,
        customerSatisfaction: ticket.customerSatisfaction || null,
        internalNotes: ticket.internalNotes || null,
        actualResolutionTime: ticket.actualResolutionTime || null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        statusUpdate: {
          updatedBy: req.user.id,
          updatedAt: new Date(),
          previousStatus,
          newStatus: status,
          transitionValidation: transitionValidation
        }
      },
      message: `Ticket status updated to ${status} successfully.`
    });

  } catch (error) {
    console.error('Update ticket status error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validationErrors
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(500).json({
        success: false,
        message: 'Status update conflict. Please try again.'
      });
    }

    next(error);
  }
};

// @desc    Get status transition history for a ticket
// @route   GET /api/tickets/:ticketId/status-history
// @access  Private (SupportAgent and Supervisor only)
const getStatusHistory = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID is required.'
      });
    }

    // Find the ticket
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
        message: 'You can only view status history for tickets assigned to you.'
      });
    }

    // Filter status change activities
    const statusHistory = ticket.activityHistory.filter(activity => 
      activity.action === 'StatusChanged'
    );

    // Populate user details for activities
    await Ticket.populate({
      path: 'activityHistory.performedBy',
      select: 'name email role'
    });

    res.status(200).json({
      success: true,
      data: {
        ticketId: ticket.ticketId,
        currentStatus: ticket.status,
        statusHistory: statusHistory,
        totalStatusChanges: statusHistory.length,
        lastStatusChange: statusHistory.length > 0 ? statusHistory[statusHistory.length - 1] : null
      },
      message: 'Status history retrieved successfully.'
    });

  } catch (error) {
    console.error('Get status history error:', error);
    next(error);
  }
};

// @desc    Get available status transitions
// @route   GET /api/tickets/status-transitions
// @access  Private (SupportAgent and Supervisor only)
const getStatusTransitions = async (req, res, next) => {
  try {
    // Return allowed status transitions
    const transitions = {
      'Open': {
        'description': 'Ticket is newly created and awaiting assignment',
        'allowedTransitions': ['InProgress', 'Resolved'],
        'canTransitionFrom': null,
        'canTransitionTo': ['InProgress', 'Resolved']
      },
      'InProgress': {
        'description': 'Ticket is being worked on by support agent',
        'allowedTransitions': ['Open', 'Resolved'],
        'canTransitionFrom': ['Open'],
        'canTransitionTo': ['Open', 'Resolved']
      },
      'Resolved': {
        'description': 'Ticket has been resolved and closed',
        'allowedTransitions': ['Open'], // Can be reopened if needed
        'canTransitionFrom': ['Open', 'InProgress'],
        'canTransitionTo': ['Open']
      }
    };

    res.status(200).json({
      success: true,
      data: {
        transitions,
        statusTransitionMatrix: generateTransitionMatrix(transitions)
      },
      message: 'Status transitions retrieved successfully.'
    });

  } catch (error) {
    console.error('Get status transitions error:', error);
    next(error);
  }
};

/**
 * Validates status transitions according to business rules
 * @private
 */
function validateStatusTransition(currentStatus, newStatus) {
  const transitions = {
    'Open': ['InProgress', 'Resolved'],
    'InProgress': ['Open', 'Resolved'],
    'Resolved': ['Open'] // Can be reopened if needed
  };

  if (!transitions[currentStatus] || !transitions[currentStatus].includes(newStatus)) {
    return {
      isValid: false,
      error: `Invalid status transition from ${currentStatus} to ${newStatus}. Allowed transitions: ${transitions[currentStatus].join(', ')}`
    };
  }

  return {
    isValid: true,
    error: null
  };
}

/**
 * Generates a visual transition matrix for frontend
 * @private
 */
function generateTransitionMatrix(transitions) {
  const statuses = Object.keys(transitions);
  const matrix = {};

  statuses.forEach(fromStatus => {
    matrix[fromStatus] = {};
    statuses.forEach(toStatus => {
      matrix[fromStatus][toStatus] = transitions[fromStatus].includes(toStatus);
    });
  });

  return matrix;
}

export {
  updateTicketStatus,
  getStatusHistory,
  getStatusTransitions
};
