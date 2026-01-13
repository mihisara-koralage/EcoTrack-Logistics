import { Router } from 'express';

import {
  createParcel,
  getAllParcels,
  getParcelById,
  updateParcel,
  deleteParcel,
  assignDriverToParcel,
  updateParcelStatus,
  trackParcel,
} from '../controllers/parcelController.js';
import { protect, authorizeRoles, authorizeExactRoles } from '../middleware/authMiddleware.js';

const router = Router();

// Protect all routes in this file
router.use(protect);

router
  .route('/')
  // All authenticated users can view parcels
  .get(getAllParcels)
  // Only Supervisors can create parcels
  .post(authorizeRoles('Supervisor'), createParcel);

router
  .route('/:parcelId')
  // All authenticated users can view a single parcel
  .get(getParcelById)
  // Only Supervisors can update parcels
  .put(authorizeRoles('Supervisor'), updateParcel)
  // Only Supervisors can delete parcels
  .delete(authorizeRoles('Supervisor'), deleteParcel);

router.route('/:parcelId/assign-driver').patch(authorizeRoles('Supervisor'), assignDriverToParcel);

router.route('/:parcelId/status').patch(authorizeExactRoles('Driver'), updateParcelStatus);

router.route('/track/:parcelId').get(trackParcel);

export default router;
