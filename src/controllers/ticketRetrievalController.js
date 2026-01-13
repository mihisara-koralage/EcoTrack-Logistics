import Ticket from '../models/Ticket.js';
import User from '../models/User.js';

/**
 * Ticket Retrieval Controller for EcoTrack Logistics System
 * 
 * Provides role-based ticket retrieval with filtering and pagination:
 * - Supervisor: view all tickets
 * - SupportAgent: view assigned tickets only
 * - Filtering by status, priority, issue type
 * - Paginated results with metadata
 */

// @desc    Get tickets with filtering and pagination
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
      sortOrder = 'desc',
      startDate,
      endDate,
      search
    } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build base query
    let query = { isDeleted: false };

    // Apply role-based access control
    if (req.user.role === 'SupportAgent') {
      // Support agents can only see tickets assigned to them
      query.assignedTo = req.user.id;
    }
    // Supervisors can see all tickets (no additional filtering)

    // Apply filters
    if (status) {
      const validStatuses = ['Open', 'InProgress', 'Resolved'];
      if (validStatuses.includes(status)) {
        query.status = status;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be one of: Open, InProgress, Resolved.'
        });
      }
    }

    if (priority) {
      const validPriorities = ['Low', 'Medium', 'High'];
      if (validPriorities.includes(priority)) {
        query.priority = priority;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid priority. Must be one of: Low, Medium, High.'
        });
      }
    }

    if (issueType) {
      const validIssueTypes = ['Lost', 'Delayed', 'Damaged', 'General'];
      if (validIssueTypes.includes(issueType)) {
        query.issueType = issueType;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid issue type. Must be one of: Lost, Delayed, Damaged, General.'
        });
      }
    }

    if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    if (createdBy) {
      query.createdBy = createdBy;
    }

    // Date range filtering
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid start date format.'
          });
        }
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid end date format.'
          });
        }
        query.createdAt.$lte = end;
      }
    }

    // Text search (search in description and ticketId)
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { ticketId: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort options
    const sortOptions = {};
    const validSortFields = ['createdAt', 'updatedAt', 'priority', 'status', 'issueType'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    sortOptions[sortField] = sortDirection;

    // Execute query with pagination
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate('createdBy', 'name email role')
        .populate('assignedTo', 'name email role')
        .populate('parcel', 'parcelId status deliveryLocation pickupLocation')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(), // Use lean for better performance
      Ticket.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: {
        tickets,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalTickets: total,
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
          assignedTo,
          createdBy,
          startDate,
          endDate,
          search,
          sortBy,
          sortOrder
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

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID is required.'
      });
    }

    const ticket = await Ticket.findOne({ ticketId, isDeleted: false })
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('parcel', 'parcelId status deliveryLocation pickupLocation')
      .populate('activityHistory.performedBy', 'name email')
      .populate('attachments.uploadedBy', 'name email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // Role-based access control for single ticket
    if (req.user.role === 'SupportAgent') {
      // Support agents can only view tickets assigned to them
      if (!ticket.assignedTo || ticket.assignedTo._id.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only view tickets assigned to you.'
        });
      }
    }
    // Supervisors can view any ticket

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

// @desc    Get ticket statistics and analytics
// @route   GET /api/tickets/statistics
// @access  Private (Supervisor only)
const getTicketStatistics = async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      issueType,
      status,
      priority,
      assignedTo,
      groupBy = 'status' // Default grouping
    } = req.query;

    // Check supervisor access
    if (req.user.role !== 'Supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Only supervisors can access ticket statistics.'
      });
    }

    // Build filters
    const filters = { isDeleted: false };
    
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) {
        filters.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filters.createdAt.$lte = new Date(endDate);
      }
    }

    if (issueType) {
      filters.issueType = issueType;
    }
    if (status) {
      filters.status = status;
    }
    if (priority) {
      filters.priority = priority;
    }
    if (assignedTo) {
      filters.assignedTo = assignedTo;
    }

    // Get statistics based on grouping
    let statistics;
    const validGroups = ['status', 'priority', 'issueType', 'assignedTo', 'createdBy', 'resolutionCategory'];
    
    if (!validGroups.includes(groupBy)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid groupBy parameter. Must be one of: ' + validGroups.join(', ')
      });
    }

    switch (groupBy) {
      case 'status':
        statistics = await Ticket.aggregate([
          { $match: filters },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]);
        break;
        
      case 'priority':
        statistics = await Ticket.aggregate([
          { $match: filters },
          { $group: { _id: '$priority', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]);
        break;
        
      case 'issueType':
        statistics = await Ticket.aggregate([
          { $match: filters },
          { $group: { _id: '$issueType', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]);
        break;
        
      case 'assignedTo':
        statistics = await Ticket.aggregate([
          { $match: filters },
          { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
          { $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }},
          { $unwind: '$user' },
          { $group: { 
            _id: { 
              _id: '$user._id', 
              name: '$user.name', 
              email: '$user.email' 
            }, 
            count: { $sum: 1 } 
          }},
          { $sort: { count: -1 } }
        ]);
        break;
        
      case 'createdBy':
        statistics = await Ticket.aggregate([
          { $match: filters },
          { $group: { _id: '$createdBy', count: { $sum: 1 } } },
          { $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }},
          { $unwind: '$user' },
          { $group: { 
            _id: { 
              _id: '$user._id', 
              name: '$user.name', 
              email: '$user.email' 
            }, 
            count: { $sum: 1 } 
          }},
          { $sort: { count: -1 } }
        ]);
        break;
        
      case 'resolutionCategory':
        statistics = await Ticket.aggregate([
          { $match: { ...filters, status: 'Resolved' } },
          { $group: { _id: '$resolutionCategory', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]);
        break;
    }

    // Get overall counts
    const [totalTickets, openTickets, inProgressTickets, resolvedTickets] = await Promise.all([
      Ticket.countDocuments(filters),
      Ticket.countDocuments({ ...filters, status: 'Open' }),
      Ticket.countDocuments({ ...filters, status: 'InProgress' }),
      Ticket.countDocuments({ ...filters, status: 'Resolved' })
    ]);

    // Calculate resolution metrics
    const resolutionMetrics = await Ticket.aggregate([
      { $match: { ...filters, status: 'Resolved' } },
      {
        $group: {
          _id: null,
          avgResolutionTime: { $avg: '$resolutionDuration' },
          minResolutionTime: { $min: '$resolutionDuration' },
          maxResolutionTime: { $max: '$resolutionDuration' },
          totalResolved: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalTickets,
          openTickets,
          inProgressTickets,
          resolvedTickets,
          resolutionRate: totalTickets > 0 ? ((resolvedTickets / totalTickets) * 100).toFixed(1) : 0
        },
        statistics,
        resolutionMetrics: resolutionMetrics[0] || {
          avgResolutionTime: 0,
          minResolutionTime: 0,
          maxResolutionTime: 0,
          totalResolved: 0
        },
        filters: {
          startDate,
          endDate,
          issueType,
          status,
          priority,
          assignedTo,
          groupBy
        }
      },
      message: 'Ticket statistics retrieved successfully.'
    });

  } catch (error) {
    console.error('Get ticket statistics error:', error);
    next(error);
  }
};

// @desc    Get user's accessible tickets (role-based)
// @route   GET /api/tickets/my
// @access  Private (Supervisor and SupportAgent only)
const getMyTickets = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query based on user role
    let query = { isDeleted: false };
    
    if (req.user.role === 'SupportAgent') {
      // Support agents see only their assigned tickets
      query.assignedTo = req.user.id;
    } else if (req.user.role === 'Supervisor') {
      // Supervisors see tickets they created
      query.createdBy = req.user.id;
    }

    // Apply additional filters
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate('createdBy', 'name email')
        .populate('assignedTo', 'name email')
        .populate('parcel', 'parcelId status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Ticket.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      success: true,
      data: {
        tickets,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalTickets: total,
          limit: limitNum
        }
      },
      message: 'My tickets retrieved successfully.'
    });

  } catch (error) {
    console.error('Get my tickets error:', error);
    next(error);
  }
};

export {
  getTickets,
  getTicket,
  getTicketStatistics,
  getMyTickets
};
