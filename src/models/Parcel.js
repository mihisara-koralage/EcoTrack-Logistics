import mongoose from 'mongoose';

const { Schema } = mongoose;

const statusHistorySchema = new Schema(
  {
    status: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// Defines the possible lifecycle states of a parcel
const parcelStatus = ['PickedUp', 'InTransit', 'OutForDelivery', 'Delivered'];

const parcelSchema = new Schema(
  {
    // A unique, human-readable identifier for tracking the parcel (e.g., 'ECO-12345')
    parcelId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true, // Index for fast lookups by parcelId
    },
    // The name of the person or entity sending the parcel
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    // The name of the person or entity receiving the parcel
    receiverName: {
      type: String,
      required: true,
      trim: true,
    },
    // The full address where the parcel is collected from
    pickupLocation: {
      type: String,
      required: true,
      trim: true,
    },
    // The full address where the parcel is to be delivered
    deliveryLocation: {
      type: String,
      required: true,
      trim: true,
    },
    // The current stage of the parcel in the delivery lifecycle
    status: {
      type: String,
      enum: parcelStatus,
      default: 'PickedUp',
      index: true, // Index for querying parcels by their status
    },
    // Reference to the Driver user responsible for the delivery
    assignedDriver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true, // Index for finding all parcels assigned to a specific driver
    },
    // The last known geographical coordinates// GPS location tracking
    currentLocation: {
      latitude: { type: Number, required: false },
      longitude: { type: Number, required: false },
      timestamp: { type: Date, required: false },
      accuracy: { type: Number, required: false } // GPS accuracy in meters
    },
    // Route optimization reference
    optimizedRoute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: false
    },
    lastOptimizedAt: {
      type: Date,
      required: false
    },
    // Route assignment tracking
    routeAssignmentStatus: {
      type: String,
      enum: ['Unassigned', 'Assigned', 'Reassigned'],
      default: 'Unassigned',
      comment: 'Current assignment status of the parcel'
    },
    assignedRouteType: {
      type: String,
      enum: ['Shortest', 'EcoFriendly'],
      required: false,
      comment: 'Type of route assigned to this parcel'
    },
    lastAssignedAt: {
      type: Date,
      required: false,
      comment: 'When a route was last assigned to this parcel'
    },
    // A log of all status changes for this parcel
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  {
    // Automatically adds createdAt and updatedAt timestamps
    timestamps: true,
  }
);

const Parcel = mongoose.model('Parcel', parcelSchema);

export { parcelStatus };
export default Parcel;
