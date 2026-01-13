import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import {
  updateTicketStatus,
  getStatusHistory,
  getStatusTransitions
} from '../controllers/ticketStatusController.js';

const router = express.Router();

// @desc    Update ticket status
// @route   PATCH /api/tickets/:ticketId/status
// @access  Private (SupportAgent and Supervisor only)
router.patch('/:ticketId/status', protect, authorizeRoles('Supervisor', 'SupportAgent'), updateTicketStatus);

// @desc    Get status transition history for a ticket
// @route   GET /api/tickets/:ticketId/status-history
// @access  Private (SupportAgent and Supervisor only)
router.get('/:ticketId/status-history', protect, authorizeRoles('Supervisor', 'SupportAgent'), getStatusHistory);

// @desc    Get available status transitions
// @route   GET /api/tickets/status-transitions
// @access  Private (SupportAgent and Supervisor only)
router.get('/status-transitions', protect, authorizeRoles('Supervisor', 'SupportAgent'), getStatusTransitions);

export default router;
