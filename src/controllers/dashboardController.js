// Returns supervisor-oriented operational overview data (accessible to Supervisor role)
const getSupervisorDashboard = (_req, res) => {
  res.status(200).json({
    summary: {
      totalParcels: 1250,
      activeDeliveries: 78,
      openTickets: 11,
    },
  });
};

// Returns driver-specific workload snapshot (accessible to Driver role and Supervisor override)
const getDriverDashboard = (req, res) => {
  // In a real system, this would query parcels assigned to the driver
  // For demo purposes, we return mock data with realistic parcel IDs
  res.status(200).json({
    assignedDeliveries: [
      { 
        id: 'PKG-2024-001', 
        destination: 'Warehouse 7', 
        etaMinutes: 45,
        status: 'PickedUp',
        currentLocation: 'Distribution Center'
      },
      { 
        id: 'PKG-2024-002', 
        destination: 'Downtown Hub', 
        etaMinutes: 90,
        status: 'PickedUp',
        currentLocation: 'Distribution Center'
      },
    ],
    statusSummary: {
      pending: 3,
      inTransit: 5,
      completedToday: 6,
    },
  });
};

// Returns support ticket snapshot (accessible to SupportAgent role and Supervisor override)
const getSupportDashboard = (_req, res) => {
  res.status(200).json({
    openTickets: [
      { id: 'TCK-4501', subject: 'Delayed parcel', priority: 'High' },
      { id: 'TCK-4502', subject: 'Address confirmation', priority: 'Medium' },
    ],
    resolvedTicketsCount: 32,
  });
};

export { getSupervisorDashboard, getDriverDashboard, getSupportDashboard };
