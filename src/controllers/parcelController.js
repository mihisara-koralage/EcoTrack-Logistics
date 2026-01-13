import Parcel from '../models/Parcel.js';
import User from '../models/User.js';
import { simulateLocationUpdate } from '../utils/gpsSimulator.js';

// @desc    Create a new parcel
// @route   POST /api/parcels
// @access  Private (Supervisor only)
const createParcel = async (req, res, next) => {
  try {
    const {
      parcelId,
      senderName,
      receiverName,
      pickupLocation,
      deliveryLocation,
      assignedDriver,
    } = req.body;

    // Basic validation
    if (!parcelId || !senderName || !receiverName || !pickupLocation || !deliveryLocation) {
      return res.status(400).json({ message: 'Please provide all required parcel details.' });
    }

    const newParcel = await Parcel.create({
      parcelId,
      senderName,
      receiverName,
      pickupLocation,
      deliveryLocation,
      assignedDriver,
    });

    res.status(201).json(newParcel);
  } catch (error) {
    // Handle potential duplicate parcelId error
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A parcel with this ID already exists.' });
    }
    next(error);
  }
};

// @desc    Get all parcels
// @route   GET /api/parcels
// @access  Private
const getAllParcels = async (req, res, next) => {
  try {
    const parcels = await Parcel.find({}).populate('assignedDriver', 'name email');
    res.status(200).json(parcels);
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single parcel by its parcelId
// @route   GET /api/parcels/:parcelId
// @access  Private
const getParcelById = async (req, res, next) => {
  try {
    const parcel = await Parcel.findOne({ parcelId: req.params.parcelId }).populate(
      'assignedDriver',
      'name email'
    );

    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found.' });
    }

    res.status(200).json(parcel);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a parcel's details
// @route   PUT /api/parcels/:parcelId
// @access  Private (Supervisor only)
const updateParcel = async (req, res, next) => {
  try {
    const parcel = await Parcel.findOneAndUpdate(
      { parcelId: req.params.parcelId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found.' });
    }

    res.status(200).json(parcel);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a parcel
// @route   DELETE /api/parcels/:parcelId
// @access  Private (Supervisor only)
const deleteParcel = async (req, res, next) => {
  try {
    const parcel = await Parcel.findOneAndDelete({ parcelId: req.params.parcelId });

    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found.' });
    }

    res.status(200).json({ message: 'Parcel deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign a driver to a parcel
// @route   PATCH /api/parcels/:parcelId/assign-driver
// @access  Private (Supervisor only)
const assignDriverToParcel = async (req, res, next) => {
  try {
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({ message: 'Driver ID is required.' });
    }

    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found.' });
    }

    if (driver.role !== 'Driver') {
      return res.status(400).json({ message: 'The assigned user is not a driver.' });
    }

    const parcel = await Parcel.findOneAndUpdate(
      { parcelId: req.params.parcelId },
      {
        assignedDriver: driverId,
        status: 'PickedUp',
      },
      { new: true, runValidators: true }
    ).populate('assignedDriver', 'name email');

    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found.' });
    }

    res.status(200).json(parcel);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a parcel's status
// @route   PATCH /api/parcels/:parcelId/status
// @access  Private (Driver only)
const updateParcelStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'Status is required.' });
    }

    const parcel = await Parcel.findOne({ parcelId: req.params.parcelId });
    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found.' });
    }

    // Check if user is the assigned driver
    const isAssignedDriver = parcel.assignedDriver && parcel.assignedDriver.equals(req.user.id);
    if (!isAssignedDriver) {
      return res.status(403).json({ message: 'Only the assigned driver can update parcel status.' });
    }

    // Enforce the allowed status transition flow
    const statusFlow = {
      PickedUp: 'InTransit',
      InTransit: 'OutForDelivery',
      OutForDelivery: 'Delivered',
    };

    if (statusFlow[parcel.status] !== status) {
      return res.status(400).json({ message: `Invalid status transition from ${parcel.status} to ${status}.` });
    }

    // Update status and log the change
    parcel.status = status;
    parcel.statusHistory.push({ status });

    // Simulate GPS location update based on new status
    const simulatedLocation = simulateLocationUpdate(status, parcel.currentLocation);
    parcel.currentLocation = {
      latitude: simulatedLocation.latitude,
      longitude: simulatedLocation.longitude,
      timestamp: simulatedLocation.timestamp,
      accuracy: simulatedLocation.accuracy,
    };

    await parcel.save();

    res.status(200).json(parcel);
  } catch (error) {
    next(error);
  }
};

// @desc    Track a parcel by its ID
// @route   GET /api/parcels/track/:parcelId
// @access  Private (Supervisor, SupportAgent, assigned Driver)
const trackParcel = async (req, res, next) => {
  try {
    const parcel = await Parcel.findOne({ parcelId: req.params.parcelId }).populate(
      'assignedDriver',
      'name email'
    );

    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found.' });
    }

    const { user } = req;

    // Custom authorization logic
    const isSupervisor = user.role === 'Supervisor';
    const isSupportAgent = user.role === 'SupportAgent';
    const isAssignedDriver =
      user.role === 'Driver' && parcel.assignedDriver && 
      (parcel.assignedDriver._id ? parcel.assignedDriver._id.toString() === user.id : parcel.assignedDriver.toString() === user.id);

    if (!isSupervisor && !isSupportAgent && !isAssignedDriver) {
      return res.status(403).json({ message: 'You are not authorized to track this parcel.' });
    }

    // Use simulated GPS location for tracking details
    const trackingData = {
      status: parcel.status,
      assignedDriver: parcel.assignedDriver,
      currentLocation: parcel.currentLocation || {
        latitude: 34.0522,
        longitude: -118.2437,
      },
      estimatedDeliveryTime: '2024-08-26T18:00:00Z',
    };

    res.status(200).json(trackingData);
  } catch (error) {
    next(error);
  }
};

export {
  createParcel,
  getAllParcels,
  getParcelById,
  updateParcel,
  deleteParcel,
  assignDriverToParcel,
  updateParcelStatus,
  trackParcel,
};
