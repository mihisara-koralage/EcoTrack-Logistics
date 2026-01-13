import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';
import Ticket from '../src/models/Ticket.js';

describe('Ticket-Parcel Integration API Tests', function() {
  this.timeout(10000);

  let mongoServer;
  let supervisorToken, supportAgentToken;
  let supervisorId, supportAgentId;
  let testTicket, testParcel;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Parcel.deleteMany({});
    await Ticket.deleteMany({});

    // Create test users
    const supervisor = await User.create({
      name: 'Test Supervisor',
      email: 'supervisor@test.com',
      password: 'password123',
      role: 'Supervisor',
    });

    const supportAgent = await User.create({
      name: 'Test Support Agent',
      email: 'support@test.com',
      password: 'password123',
      role: 'SupportAgent',
    });

    supervisorId = supervisor._id;
    supportAgentId = supportAgent._id;

    // Get tokens
    const supervisorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'supervisor@test.com', password: 'password123' });

    const supportAgentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'support@test.com', password: 'password123' });

    supervisorToken = supervisorLogin.body.token;
    supportAgentToken = supportAgentLogin.body.token;

    // Create test parcel
    testParcel = await Parcel.create({
      parcelId: 'TEST001',
      senderName: 'Test Sender',
      receiverName: 'Test Receiver',
      pickupLocation: '123 Pickup St',
      deliveryLocation: '456 Delivery Ave',
      status: 'InTransit',
      currentLocation: {
        name: 'Distribution Center',
        address: '789 Logistics Way',
        coordinates: {
          latitude: 40.7128,
          longitude: -74.0060
        }
      },
      assignedDriver: supportAgentId,
      trackingHistory: [
        {
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          status: 'PickedUp',
          location: {
            name: 'Pickup Location',
            address: '123 Pickup St'
          },
          description: 'Parcel picked up from sender'
        },
        {
          timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
          status: 'InTransit',
          location: {
            name: 'Distribution Center',
            address: '789 Logistics Way'
          },
          description: 'Parcel in transit to destination'
        }
      ]
    });

    // Create test ticket with parcel reference
    testTicket = await Ticket.create({
      ticketId: 'TK-20260109-0001',
      issueType: 'Lost',
      priority: 'High',
      status: 'Open',
      description: 'Test ticket with parcel integration',
      createdBy: supervisorId,
      assignedTo: supportAgentId,
      parcel: testParcel._id
    });
  });

  describe('GET /api/tickets/:ticketId/with-parcel - Enhanced Ticket Details', () => {
    it('should return ticket with integrated parcel information', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/with-parcel`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticket');
      expect(response.body.data).to.have.property('parcelIntegration');
      
      const { ticket, parcelIntegration } = response.body.data;
      
      // Verify ticket information
      expect(ticket).to.have.property('ticketId', testTicket.ticketId);
      expect(ticket).to.have.property('issueType', 'Lost');
      expect(ticket).to.have.property('priority', 'High');
      expect(ticket).to.have.property('status', 'Open');
      
      // Verify parcel integration
      expect(parcelIntegration).to.have.property('hasParcel', true);
      expect(parcelIntegration).to.have.property('parcelStatus', testParcel.status);
      expect(parcelIntegration).to.have.property('deliveryProgress');
      expect(parcelIntegration.deliveryProgress).to.be.a('number');
      expect(parcelIntegration.deliveryProgress).to.be.at.least(0);
      expect(parcelIntegration.deliveryProgress).to.be.at.most(100);
    });

    it('should include full parcel details in ticket data', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/with-parcel`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      const ticket = response.body.data.ticket;
      
      expect(ticket).to.have.property('parcel');
      expect(ticket.parcel).to.have.property('parcelId', testParcel.parcelId);
      expect(ticket.parcel).to.have.property('status', testParcel.status);
      expect(ticket.parcel).to.have.property('pickupLocation', testParcel.pickupLocation);
      expect(ticket.parcel).to.have.property('deliveryLocation', testParcel.deliveryLocation);
      expect(ticket.parcel).to.have.property('currentLocation');
      expect(ticket.parcel).to.have.property('trackingHistory');
      expect(ticket.parcel).to.have.property('deliveryProgress');
      expect(ticket.parcel).to.have.property('statusTimeline');
    });

    it('should allow support agent to view assigned ticket with parcel', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/with-parcel`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.ticket).to.have.property('parcel');
    });

    it('should reject support agent from viewing unassigned ticket', async () => {
      // Create unassigned ticket
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-0002',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Unassigned ticket',
        createdBy: supervisorId
        // No assignedTo
      });

      const response = await request(app)
        .get(`/api/tickets/${unassignedTicket.ticketId}/with-parcel`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('You can only view tickets assigned to you');
    });

    it('should handle ticket without parcel reference', async () => {
      // Create ticket without parcel
      const ticketWithoutParcel = await Ticket.create({
        ticketId: 'TK-20260109-0003',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Ticket without parcel',
        createdBy: supervisorId,
        assignedTo: supportAgentId
        // No parcel reference
      });

      const response = await request(app)
        .get(`/api/tickets/${ticketWithoutParcel.ticketId}/with-parcel`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      const { ticket, parcelIntegration } = response.body.data;
      
      expect(ticket.parcel).to.be.null;
      expect(parcelIntegration).to.have.property('hasParcel', false);
      expect(parcelIntegration).to.have.property('parcelStatus', null);
      expect(parcelIntegration).to.have.property('deliveryProgress', null);
    });
  });

  describe('GET /api/tickets/with-parcel-summary - Tickets with Parcel Summary', () => {
    it('should return tickets with parcel summary information', async () => {
      const response = await request(app)
        .get('/api/tickets/with-parcel-summary')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('tickets');
      expect(response.body.data).to.have.property('pagination');
      expect(response.body.data).to.have.property('summary');
      
      const { tickets, summary } = response.body.data;
      
      // Verify tickets have parcel summary
      const ticketWithParcel = tickets.find(t => t.ticketId === testTicket.ticketId);
      expect(ticketWithParcel).to.have.property('parcelSummary');
      expect(ticketWithParcel.parcelSummary).to.have.property('parcelId', testParcel.parcelId);
      expect(ticketWithParcel.parcelSummary).to.have.property('status', testParcel.status);
      expect(ticketWithParcel.parcelSummary).to.have.property('deliveryProgress');
      
      // Verify summary statistics
      expect(summary).to.have.property('totalTickets');
      expect(summary).to.have.property('ticketsWithParcels');
      expect(summary).to.have.property('deliveredParcels');
      expect(summary).to.have.property('inTransitParcels');
    });

    it('should filter by parcel status', async () => {
      const response = await request(app)
        .get('/api/tickets/with-parcel-summary?parcelStatus=InTransit')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      
      const tickets = response.body.data.tickets;
      tickets.forEach(ticket => {
        if (ticket.parcelSummary) {
          expect(ticket.parcelSummary.status).to.equal('InTransit');
        }
      });
    });

    it('should support pagination with parcel summary', async () => {
      const response = await request(app)
        .get('/api/tickets/with-parcel-summary?page=1&limit=10')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data).to.have.property('pagination');
      expect(response.body.data.pagination).to.have.property('limit', 10);
      expect(response.body.data.pagination).to.have.property('currentPage', 1);
    });
  });

  describe('GET /api/tickets/:ticketId/parcel-tracking - Parcel Tracking', () => {
    it('should return parcel tracking information for ticket', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/parcel-tracking`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('trackingInfo');
      
      const trackingInfo = response.body.data.trackingInfo;
      
      // Verify tracking information
      expect(trackingInfo).to.have.property('parcelId', testParcel.parcelId);
      expect(trackingInfo).to.have.property('currentStatus', testParcel.status);
      expect(trackingInfo).to.have.property('currentLocation');
      expect(trackingInfo).to.have.property('trackingHistory');
      expect(trackingInfo).to.have.property('deliveryProgress');
      expect(trackingInfo).to.have.property('nextMilestone');
      expect(trackingInfo).to.have.property('timeInTransit');
    });

    it('should include driver information in tracking', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/parcel-tracking`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      const trackingInfo = response.body.data.trackingInfo;
      
      expect(trackingInfo).to.have.property('assignedDriver');
      expect(trackingInfo.assignedDriver).to.have.property('_id', supportAgentId);
      expect(trackingInfo.assignedDriver).to.have.property('name', 'Test Support Agent');
    });

    it('should calculate time in transit correctly', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/parcel-tracking`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      const trackingInfo = response.body.data.trackingInfo;
      
      if (testParcel.status === 'InTransit') {
        expect(trackingInfo).to.have.property('timeInTransit');
        expect(trackingInfo.timeInTransit).to.have.property('totalHours');
        expect(trackingInfo.timeInTransit).to.have.property('totalDays');
        expect(trackingInfo.timeInTransit).to.have.property('formatted');
      }
    });

    it('should handle ticket without parcel', async () => {
      // Create ticket without parcel
      const ticketWithoutParcel = await Ticket.create({
        ticketId: 'TK-20260109-0004',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Ticket without parcel',
        createdBy: supervisorId,
        assignedTo: supportAgentId
      });

      const response = await request(app)
        .get(`/api/tickets/${ticketWithoutParcel.ticketId}/parcel-tracking`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data).to.have.property('hasParcel', false);
      expect(response.body.data).to.have.property('trackingInfo', null);
    });

    it('should reject unauthorized access for support agent', async () => {
      // Create unassigned ticket
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-0005',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Unassigned ticket',
        createdBy: supervisorId
      });

      const response = await request(app)
        .get(`/api/tickets/${unassignedTicket.ticketId}/parcel-tracking`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('You can only view tracking for tickets assigned to you');
    });
  });

  describe('Delivery Progress Calculation', () => {
    it('should calculate correct delivery progress percentages', async () => {
      // Test different parcel statuses
      const statuses = ['Created', 'PickedUp', 'InTransit', 'OutForDelivery', 'Delivered'];
      const expectedProgress = [0, 25, 50, 75, 100];

      for (let i = 0; i < statuses.length; i++) {
        const testParcel = await Parcel.create({
          parcelId: `TEST${i + 10}`,
          senderName: 'Test Sender',
          receiverName: 'Test Receiver',
          pickupLocation: '123 Pickup St',
          deliveryLocation: '456 Delivery Ave',
          status: statuses[i]
        });

        const testTicket = await Ticket.create({
          ticketId: `TK-20260109-${i + 10}`,
          issueType: 'General',
          priority: 'Low',
          status: 'Open',
          description: `Test ticket for ${statuses[i]}`,
          createdBy: supervisorId,
          assignedTo: supportAgentId,
          parcel: testParcel._id
        });

        const response = await request(app)
          .get(`/api/tickets/${testTicket.ticketId}/with-parcel`)
          .set('Authorization', `Bearer ${supervisorToken}`)
          .expect(200);

        const deliveryProgress = response.body.data.ticket.parcel.deliveryProgress;
        expect(deliveryProgress).to.equal(expectedProgress[i]);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent ticket', async () => {
      const response = await request(app)
        .get('/api/tickets/NONEXISTENT/with-parcel')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Ticket not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/with-parcel`)
        .expect(401);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Authentication token missing');
    });

    it('should validate ticket ID parameter', async () => {
      const response = await request(app)
        .get('/api/tickets//with-parcel')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(404);

      expect(response.body).to.have.property('message');
    });
  });
});
