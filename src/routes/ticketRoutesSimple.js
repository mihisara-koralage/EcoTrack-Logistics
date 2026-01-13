import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import { createTicket } from '../controllers/ticketControllerSimple.js';

const router = express.Router();

// @desc    Create a new ticket
// @route   POST /api/tickets
// @access  Private (Supervisor and SupportAgent only)
router.post('/', protect, authorizeRoles('Supervisor', 'SupportAgent'), createTicket);

export default router;
