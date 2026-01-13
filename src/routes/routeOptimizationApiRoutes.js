import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles, authorizeExactRoles } from '../middleware/authMiddleware.js';
import {
  optimizeRouteForParcel,
  getOptimizationHistory,
  updateOptimizedRoute,
  deleteOptimizedRoute
} from '../controllers/routeOptimizationApiController.js';

const router = express.Router();

// @desc    Optimize route for a specific parcel
// @route   POST /api/routes/optimize
// @access  Private (Supervisor and Driver only)
router.post('/optimize', protect, authorizeRoles('Supervisor', 'Driver'), optimizeRouteForParcel);

// @desc    Get optimization history for a parcel
// @route   GET /api/routes/optimize/:parcelId/history
// @access  Private (Supervisor and Driver only)
router.get('/optimize/:parcelId/history', protect, authorizeRoles('Supervisor', 'Driver'), getOptimizationHistory);

// @desc    Update optimized route
// @route   PATCH /api/routes/optimize/:routeId
// @access  Private (Supervisor and assigned Driver only)
router.patch('/optimize/:routeId', protect, updateOptimizedRoute);

// @desc    Delete optimized route
// @route   DELETE /api/routes/optimize/:routeId
// @access  Private (Supervisor only)
router.delete('/optimize/:routeId', protect, authorizeExactRoles('Supervisor'), deleteOptimizedRoute);

export default router;
