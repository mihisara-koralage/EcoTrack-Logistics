import mongoose from 'mongoose';

/**
 * Route Schema for EcoTrack Logistics System
 * 
 * This model defines delivery routes with environmental impact calculations.
 * Environmental fields help track sustainability metrics and support eco-friendly routing decisions.
 */

const routeSchema = new mongoose.Schema({
  // Reference to the associated parcel
  parcel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parcel',
    required: true,
    comment: 'Reference to the parcel being delivered'
  },

  // Geographic coordinates for pickup location
  pickupLocation: {
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
      comment: 'Pickup latitude in decimal degrees'
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
      comment: 'Pickup longitude in decimal degrees'
    }
  },

  // Geographic coordinates for delivery location
  deliveryLocation: {
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
      comment: 'Delivery latitude in decimal degrees'
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
      comment: 'Delivery longitude in decimal degrees'
    }
  },

  // Route metrics
  distanceKm: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Total route distance in kilometers'
  },

  estimatedTimeMinutes: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Estimated delivery time in minutes'
  },

  // Environmental impact calculations
  carbonFootprintKg: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Estimated CO2 emissions in kilograms for this route'
  },

  // Route optimization strategy
  routeType: {
    type: String,
    required: true,
    enum: ['Shortest', 'EcoFriendly'],
    default: 'Shortest',
    comment: 'Route optimization strategy: Shortest for fastest delivery, EcoFriendly for minimal environmental impact'
  },

  // Assignment tracking
  isActive: {
    type: Boolean,
    default: true,
    comment: 'Whether this route is currently active for the parcel'
  },
  assignedAt: {
    type: Date,
    default: Date.now,
    comment: 'When this route was assigned to the parcel'
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    comment: 'Supervisor who assigned this route'
  },
  assignmentNotes: {
    type: String,
    maxlength: 500,
    comment: 'Notes about route assignment'
  },

  // Deactivation tracking
  deactivationReason: {
    type: String,
    enum: ['Reassigned', 'Route type changed', 'Manual removal', 'Parcel delivered'],
    required: false,
    comment: 'Reason why route was deactivated'
  },
  deactivationDate: {
    type: Date,
    required: false,
    comment: 'When route was deactivated'
  },
  previousRouteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: false,
    comment: 'Previous route that this replaces'
  },
  lastUpdated: {
    type: Date,
    required: false,
    comment: 'Last time route was updated'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    comment: 'Route creation timestamp'
  }
}, {
  timestamps: true,
  collection: 'routes'
});

// Indexes for performance optimization
routeSchema.index({ parcel: 1 });
routeSchema.index({ routeType: 1 });
routeSchema.index({ createdAt: -1 });

// Static method to calculate carbon footprint based on distance and vehicle type
routeSchema.statics.calculateCarbonFootprint = function(distanceKm, routeType = 'Shortest') {
  // Base emission factors (kg CO2 per km)
  const emissionFactors = {
    'Shortest': 0.25,    // Standard delivery vehicle
    'EcoFriendly': 0.18   // Electric/hybrid vehicle optimization
  };

  const baseFactor = emissionFactors[routeType] || emissionFactors['Shortest'];
  return Math.round((distanceKm * baseFactor) * 100) / 100; // Round to 2 decimal places
};

// Static method to estimate delivery time
routeSchema.statics.estimateDeliveryTime = function(distanceKm, routeType = 'Shortest') {
  // Average speeds (km/hour)
  const averageSpeeds = {
    'Shortest': 45,      // Direct route, higher average speed
    'EcoFriendly': 35     // Optimized for efficiency, lower speed
  };

  const speed = averageSpeeds[routeType] || averageSpeeds['Shortest'];
  return Math.round((distanceKm / speed) * 60); // Convert to minutes
};

// Pre-save middleware to auto-calculate environmental metrics
routeSchema.pre('save', function(next) {
  if (this.isModified('distanceKm') || this.isModified('routeType')) {
    // Auto-calculate carbon footprint if not provided
    if (!this.carbonFootprintKg) {
      this.carbonFootprintKg = this.constructor.calculateCarbonFootprint(this.distanceKm, this.routeType);
    }

    // Auto-calculate delivery time if not provided
    if (!this.estimatedTimeMinutes) {
      this.estimatedTimeMinutes = this.constructor.estimateDeliveryTime(this.distanceKm, this.routeType);
    }
  }
  next();
});

const Route = mongoose.model('Route', routeSchema);

export default Route;
