import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import {
  getTicketWithParcel,
  getTicketsWithParcelSummary,
  getTicketParcelTracking
} from '../controllers/ticketParcelIntegrationController.js';

const router = express.Router();

// @desc    Get ticket with integrated parcel information
// @route   GET /api/tickets/:ticketId/with-parcel
// @access  Private (Supervisor and SupportAgent only)
router.get('/:ticketId/with-parcel', protect, authorizeRoles('Supervisor', 'SupportAgent'), getTicketWithParcel);

// @desc    Get tickets with parcel summary
// @route   GET /api/tickets/with-parcel-summary
// @access  Private (Supervisor and SupportAgent only)
router.get('/with-parcel-summary', protect, authorizeRoles('Supervisor', 'SupportAgent'), getTicketsWithParcelSummary);

// @desc    Get parcel tracking information for ticket
// @route   GET /api/tickets/:ticketId/parcel-tracking
// @access  Private (Supervisor and SupportAgent only)
router.get('/:ticketId/parcel-tracking', protect, authorizeRoles('Supervisor', 'SupportAgent'), getTicketParcelTracking);

export default router;
