import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import {
  createRoute,
  getAllRoutes,
  getRouteById,
  optimizeRoute,
  deleteRoute,
  getEnvironmentalSummary
} from '../controllers/routeController.js';

const router = express.Router();

// @desc    Create a new route
// @route   POST /api/routes
// @access  Private (Supervisor only)
router.post('/', protect, authorizeRoles('Supervisor'), createRoute);

// @desc    Get all routes
// @route   GET /api/routes
// @access  Private
router.get('/', protect, getAllRoutes);

// @desc    Get environmental impact summary
// @route   GET /api/routes/environmental-summary
// @access  Private
router.get('/environmental-summary', protect, getEnvironmentalSummary);

// @desc    Get single route
// @route   GET /api/routes/:id
// @access  Private
router.get('/:id', protect, getRouteById);

// @desc    Optimize route
// @route   PATCH /api/routes/:id/optimize
// @access  Private (Supervisor only)
router.patch('/:id/optimize', protect, authorizeRoles('Supervisor'), optimizeRoute);

// @desc    Delete route
// @route   DELETE /api/routes/:id
// @access  Private (Supervisor only)
router.delete('/:id', protect, authorizeRoles('Supervisor'), deleteRoute);

export default router;
