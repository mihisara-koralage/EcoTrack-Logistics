import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  optimizeRoute,
  optimizeMultipleRoutes,
  compareRoutes,
  getOptimizationParameters,
  calculateCarbonFootprint
} from '../controllers/routeOptimizationController.js';

const router = express.Router();

// @desc    Optimize single route
// @route   POST /api/route-optimization/optimize
// @access  Private
router.post('/optimize', protect, optimizeRoute);

// @desc    Optimize multiple routes
// @route   POST /api/route-optimization/batch
// @access  Private
router.post('/batch', protect, optimizeMultipleRoutes);

// @desc    Compare multiple routes
// @route   POST /api/route-optimization/compare
// @access  Private
router.post('/compare', protect, compareRoutes);

// @desc    Get optimization parameters
// @route   GET /api/route-optimization/parameters
// @access  Private
router.get('/parameters', protect, getOptimizationParameters);

// @desc    Calculate carbon footprint
// @route   POST /api/route-optimization/carbon-footprint
// @access  Private
router.post('/carbon-footprint', protect, calculateCarbonFootprint);

export default router;
