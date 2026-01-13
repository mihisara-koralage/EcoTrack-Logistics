import { Router } from 'express';

import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/profile', protect, (req, res) => {
  res.status(200).json({
    message: 'Protected profile data retrieved.',
    user: req.user,
  });
});

router.get('/deliveries', protect, authorizeRoles('Driver'), (_req, res) => {
  res.status(200).json({ message: 'Driver resource access granted.' });
});

router.get('/tickets', protect, authorizeRoles('SupportAgent'), (_req, res) => {
  res.status(200).json({ message: 'Support agent resource access granted.' });
});

export default router;
