import { Router } from 'express';

import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import {
  getSupervisorDashboard,
  getDriverDashboard,
  getSupportDashboard,
} from '../controllers/dashboardController.js';

const router = Router();

// Supervisor dashboard: only Supervisor role should access summary overview
router.get('/supervisor', protect, authorizeRoles('Supervisor'), getSupervisorDashboard);

// Driver dashboard: Driver role (and Supervisor via override) can view delivery assignments
router.get('/driver', protect, authorizeRoles('Driver'), getDriverDashboard);

// Support dashboard: SupportAgent role (and Supervisor via override) can view ticket status
router.get('/support', protect, authorizeRoles('SupportAgent'), getSupportDashboard);

export default router;
