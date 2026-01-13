import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import {
  createTicket,
  getTickets,
  getTicket,
  updateTicketStatus,
  assignTicket,
  getTicketStatistics
} from '../controllers/ticketController.js';

const router = express.Router();

// @desc    Create a new ticket
// @route   POST /api/tickets
// @access  Private (Supervisor and SupportAgent only)
router.post('/', protect, authorizeRoles('Supervisor', 'SupportAgent'), createTicket);

// @desc    Get all tickets with filtering and pagination
// @route   GET /api/tickets
// @access  Private (Supervisor and SupportAgent only)
router.get('/', protect, authorizeRoles('Supervisor', 'SupportAgent'), getTickets);

// @desc    Get single ticket by ID
// @route   GET /api/tickets/:ticketId
// @access  Private (Supervisor and SupportAgent only)
router.get('/:ticketId', protect, authorizeRoles('Supervisor', 'SupportAgent'), getTicket);

// @desc    Update ticket status
// @route   PATCH /api/tickets/:ticketId/status
// @access  Private (Supervisor and assigned SupportAgent only)
router.patch('/:ticketId/status', protect, authorizeRoles('Supervisor', 'SupportAgent'), updateTicketStatus);

// @desc    Assign ticket to support agent
// @route   PATCH /api/tickets/:ticketId/assign
// @access  Private (Supervisor only)
router.patch('/:ticketId/assign', protect, authorizeRoles('Supervisor'), assignTicket);

// @desc    Get ticket statistics
// @route   GET /api/tickets/statistics
// @access  Private (Supervisor only)
router.get('/statistics', protect, authorizeRoles('Supervisor'), getTicketStatistics);

export default router;
