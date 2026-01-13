import Ticket from '../models/Ticket.js';
import User from '../models/User.js';

/**
 * Ticket Assignment Controller for EcoTrack Logistics System
 * 
 * Provides ticket assignment functionality with validation and status updates:
 * - Supervisor-only assignment capabilities
 * - Support agent role validation
 * - Automatic status updates
 * - Assignment tracking and notifications
 */

// @desc    Assign ticket to support agent
// @route   PATCH /api/tickets/:ticketId/assign
// @access  Private (Supervisor only)
const assignTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { assignedTo, notes, priority, estimatedResolutionTime } = req.body;

    // Validate required fields
    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID is required.'
      });
    }

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Support agent ID is required for assignment.'
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

    // Check if ticket is already resolved
    if (ticket.status === 'Resolved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign resolved tickets.'
      });
    }

    // Validate support agent role
    const supportAgent = await User.findById(assignedTo);

    if (!supportAgent) {
      return res.status(400).json({
        success: false,
        message: 'Support agent not found.'
      });
    }

    if (supportAgent.role !== 'SupportAgent') {
      return res.status(400).json({
        success: false,
        message: 'Invalid user role. Only SupportAgent can be assigned to tickets.'
      });
    }

    // Check if agent is already assigned to this ticket
    if (ticket.assignedTo && ticket.assignedTo.toString() === assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Ticket is already assigned to this support agent.'
      });
    }

    // Store previous assignment for audit trail
    const previousAssignment = ticket.assignedTo;
    const previousStatus = ticket.status;

    // Update ticket assignment
    ticket.assignedTo = assignedTo;
    ticket.status = 'InProgress'; // Update status as required
    ticket.updatedBy = req.user.id; // Track who made the assignment

    // Add optional fields
    if (notes) {
      ticket.internalNotes = notes;
    }

    if (priority && ['Low', 'Medium', 'High'].includes(priority)) {
      ticket.priority = priority;
    }

    if (estimatedResolutionTime) {
      const resolutionTime = new Date(estimatedResolutionTime);
      if (!isNaN(resolutionTime.getTime())) {
        ticket.estimatedResolutionTime = resolutionTime;
      }
    }

    // Add assignment activity to history
    ticket.activityHistory.push({
      action: 'Assigned',
      performedBy: req.user.id,
      timestamp: new Date(),
      details: `Ticket assigned to ${supportAgent.name} (${supportAgent.email})`,
      previousValue: {
        assignedTo: previousAssignment,
        status: previousStatus
      },
      newValue: {
        assignedTo: assignedTo,
        status: 'InProgress'
      }
    });

    await ticket.save();

    // Populate references for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTo', select: 'name email role' },
      { path: 'parcel', select: 'parcelId status deliveryLocation pickupLocation' },
      { path: 'activityHistory.performedBy', select: 'name email' }
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
        internalNotes: ticket.internalNotes,
        estimatedResolutionTime: ticket.estimatedResolutionTime,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        assignment: {
          assignedBy: req.user.id,
          assignedAt: new Date(),
          previousAssignment,
          statusChange: {
            from: previousStatus,
            to: 'InProgress'
          }
        }
      },
      message: 'Ticket assigned successfully.'
    });

  } catch (error) {
    console.error('Assign ticket error:', error);
    
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
        message: 'Assignment conflict. Please try again.'
      });
    }

    next(error);
  }
};

// @desc    Reassign ticket to different support agent
// @route   PATCH /api/tickets/:ticketId/reassign
// @access  Private (Supervisor only)
const reassignTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { assignedTo, reason, notes } = req.body;

    // Validate required fields
    if (!ticketId || !assignedTo || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID, new support agent ID, and reason are required.'
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

    // Check supervisor access
    if (req.user.role !== 'Supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Only supervisors can reassign tickets.'
      });
    }

    // Validate new support agent role
    const newSupportAgent = await User.findById(assignedTo);

    if (!newSupportAgent || newSupportAgent.role !== 'SupportAgent') {
      return res.status(400).json({
        success: false,
        message: 'Invalid support agent. Only SupportAgent can be assigned to tickets.'
      });
    }

    // Check if reassigning to same agent
    if (ticket.assignedTo && ticket.assignedTo.toString() === assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Ticket is already assigned to this support agent.'
      });
    }

    // Store previous assignment for audit trail
    const previousAssignment = ticket.assignedTo;

    // Update ticket assignment
    ticket.assignedTo = assignedTo;
    ticket.updatedBy = req.user.id;

    // Add reassignment notes
    if (notes) {
      ticket.internalNotes = notes;
    }

    // Add reassignment activity to history
    ticket.activityHistory.push({
      action: 'Reassigned',
      performedBy: req.user.id,
      timestamp: new Date(),
      details: `Ticket reassigned from previous agent to ${newSupportAgent.name} (${newSupportAgent.email}). Reason: ${reason}`,
      previousValue: {
        assignedTo: previousAssignment
      },
      newValue: {
        assignedTo: assignedTo,
        reason: reason
      }
    });

    await ticket.save();

    // Populate references for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTo', select: 'name email role' },
      { path: 'parcel', select: 'parcelId status' }
    ]);

    res.status(200).json({
      success: true,
      data: {
        ticketId: ticket.ticketId,
        issueType: ticket.issueType,
        status: ticket.status,
        assignedTo: ticket.assignedTo,
        createdBy: ticket.createdBy,
        parcel: ticket.parcel,
        internalNotes: ticket.internalNotes,
        reassignment: {
          reassignedBy: req.user.id,
          reassignedAt: new Date(),
          previousAssignment,
          newAssignment: assignedTo,
          reason
        }
      },
      message: 'Ticket reassigned successfully.'
    });

  } catch (error) {
    console.error('Reassign ticket error:', error);
    next(error);
  }
};

// @desc    Unassign ticket from support agent
// @route   PATCH /api/tickets/:ticketId/unassign
// @access  Private (Supervisor only)
const unassignTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { reason } = req.body;

    // Validate required fields
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

    // Check supervisor access
    if (req.user.role !== 'Supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Only supervisors can unassign tickets.'
      });
    }

    // Check if ticket is assigned
    if (!ticket.assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Ticket is not currently assigned to any agent.'
      });
    }

    // Store previous assignment for audit trail
    const previousAssignment = ticket.assignedTo;

    // Update ticket to unassign
    ticket.assignedTo = null;
    ticket.status = 'Open'; // Reset to Open status
    ticket.updatedBy = req.user.id;

    // Add unassignment notes
    if (reason) {
      ticket.internalNotes = reason;
    }

    // Add unassignment activity to history
    ticket.activityHistory.push({
      action: 'Unassigned',
      performedBy: req.user.id,
      timestamp: new Date(),
      details: `Ticket unassigned from ${previousAssignment.name} (${previousAssignment.email}). Reason: ${reason}`,
      previousValue: {
        assignedTo: previousAssignment,
        status: 'InProgress'
      },
      newValue: {
        assignedTo: null,
        status: 'Open'
      }
    });

    await ticket.save();

    // Populate references for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'parcel', select: 'parcelId status' }
    ]);

    res.status(200).json({
      success: true,
      data: {
        ticketId: ticket.ticketId,
        issueType: ticket.issueType,
        status: ticket.status,
        assignedTo: null,
        createdBy: ticket.createdBy,
        parcel: ticket.parcel,
        internalNotes: ticket.internalNotes,
        unassignment: {
          unassignedBy: req.user.id,
          unassignedAt: new Date(),
          previousAssignment,
          reason
        }
      },
      message: 'Ticket unassigned successfully.'
    });

  } catch (error) {
    console.error('Unassign ticket error:', error);
    next(error);
  }
};

// @desc    Get assignment history for a ticket
// @route   GET /api/tickets/:ticketId/assignments
// @access  Private (Supervisor and assigned SupportAgent only)
const getAssignmentHistory = async (req, res, next) => {
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
    if (req.user.role === 'SupportAgent') {
      // Support agents can only see assignment history for their assigned tickets
      if (!ticket.assignedTo || ticket.assignedTo.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only view assignment history for tickets assigned to you.'
        });
      }
    }
    // Supervisors can see any assignment history

    // Filter assignment-related activities
    const assignmentActivities = ticket.activityHistory.filter(activity => 
      ['Assigned', 'Reassigned', 'Unassigned'].includes(activity.action)
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
        currentAssignment: ticket.assignedTo,
        assignmentHistory: assignmentActivities,
        totalAssignments: assignmentActivities.length
      },
      message: 'Assignment history retrieved successfully.'
    });

  } catch (error) {
    console.error('Get assignment history error:', error);
    next(error);
  }
};

export {
  assignTicket,
  reassignTicket,
  unassignTicket,
  getAssignmentHistory
};
