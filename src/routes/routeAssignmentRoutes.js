import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeExactRoles } from '../middleware/authMiddleware.js';
import {
  assignRouteToParcel,
  getRouteAssignment,
  updateRouteAssignment,
  removeRouteAssignment,
  getAllRouteAssignments
} from '../controllers/routeAssignmentController.js';

const router = express.Router();

// @desc    Assign optimized route to parcel
// @route   POST /api/routes/assign
// @access  Private (Supervisor only)
router.post('/assign', protect, authorizeExactRoles('Supervisor'), assignRouteToParcel);

// @desc    Get route assignment for a parcel
// @route   GET /api/routes/assign/:parcelId
// @access  Private (Supervisor only)
router.get('/assign/:parcelId', protect, authorizeExactRoles('Supervisor'), getRouteAssignment);

// @desc    Update route assignment
// @route   PATCH /api/routes/assign/:parcelId
// @access  Private (Supervisor only)
router.patch('/assign/:parcelId', protect, authorizeExactRoles('Supervisor'), updateRouteAssignment);

// @desc    Remove route assignment from parcel
// @route   DELETE /api/routes/assign/:parcelId
// @access  Private (Supervisor only)
router.delete('/assign/:parcelId', protect, authorizeExactRoles('Supervisor'), removeRouteAssignment);

// @desc    Get all route assignments
// @route   GET /api/routes/assignments
// @access  Private (Supervisor only)
router.get('/assignments', protect, authorizeExactRoles('Supervisor'), getAllRouteAssignments);

export default router;
