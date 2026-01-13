import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import {
  assignTicket,
  reassignTicket,
  unassignTicket,
  getAssignmentHistory
} from '../controllers/ticketAssignmentController.js';

const router = express.Router();

// @desc    Assign ticket to support agent
// @route   PATCH /api/tickets/:ticketId/assign
// @access  Private (Supervisor only)
router.patch('/:ticketId/assign', protect, authorizeRoles('Supervisor'), assignTicket);

// @desc    Reassign ticket to different support agent
// @route   PATCH /api/tickets/:ticketId/reassign
// @access  Private (Supervisor only)
router.patch('/:ticketId/reassign', protect, authorizeRoles('Supervisor'), reassignTicket);

// @desc    Unassign ticket from support agent
// @route   PATCH /api/tickets/:ticketId/unassign
// @access  Private (Supervisor only)
router.patch('/:ticketId/unassign', protect, authorizeRoles('Supervisor'), unassignTicket);

// @desc    Get assignment history for a ticket
// @route   GET /api/tickets/:ticketId/assignments
// @access  Private (Supervisor and assigned SupportAgent only)
router.get('/:ticketId/assignments', protect, authorizeRoles('Supervisor', 'SupportAgent'), getAssignmentHistory);

export default router;
