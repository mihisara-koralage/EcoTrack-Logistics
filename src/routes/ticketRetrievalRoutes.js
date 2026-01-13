import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import {
  getTickets,
  getTicket,
  getTicketStatistics,
  getMyTickets
} from '../controllers/ticketRetrievalController.js';

const router = express.Router();

// @desc    Get all tickets with filtering and pagination
// @route   GET /api/tickets
// @access  Private (Supervisor and SupportAgent only)
router.get('/', protect, authorizeRoles('Supervisor', 'SupportAgent'), getTickets);

// @desc    Get single ticket by ID
// @route   GET /api/tickets/:ticketId
// @access  Private (Supervisor and SupportAgent only)
router.get('/:ticketId', protect, authorizeRoles('Supervisor', 'SupportAgent'), getTicket);

// @desc    Get ticket statistics and analytics
// @route   GET /api/tickets/statistics
// @access  Private (Supervisor only)
router.get('/statistics', protect, authorizeRoles('Supervisor'), getTicketStatistics);

// @desc    Get user's accessible tickets (role-based)
// @route   GET /api/tickets/my
// @access  Private (Supervisor and SupportAgent only)
router.get('/my', protect, authorizeRoles('Supervisor', 'SupportAgent'), getMyTickets);

export default router;
