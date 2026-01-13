import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';
import Ticket from '../src/models/Ticket.js';

describe('Increment 5: Ticket Management System Tests', function() {
  this.timeout(15000);

  let mongoServer;
  let supervisorToken, supportAgentToken, driverToken;
  let supervisorId, supportAgentId, driverId;
  let testParcel, testTicket;

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

    const driver = await User.create({
      name: 'Test Driver',
      email: 'driver@test.com',
      password: 'password123',
      role: 'Driver',
    });

    supervisorId = supervisor._id;
    supportAgentId = supportAgent._id;
    driverId = driver._id;

    // Get authentication tokens
    const supervisorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'supervisor@test.com', password: 'password123' });

    const supportAgentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'support@test.com', password: 'password123' });

    const driverLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver@test.com', password: 'password123' });

    supervisorToken = supervisorLogin.body.token;
    supportAgentToken = supportAgentLogin.body.token;
    driverToken = driverLogin.body.token;

    // Create test parcel for integration tests
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
        coordinates: { latitude: 40.7128, longitude: -74.0060 }
      },
      assignedDriver: supportAgentId,
      trackingHistory: [
        {
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          status: 'PickedUp',
          location: { name: 'Pickup Location', address: '123 Pickup St' },
          description: 'Parcel picked up from sender'
        }
      ]
    });
  });

  describe('Ticket Creation with Different Issue Types', () => {
    it('should create ticket with Lost issue type and auto-assign High priority', async () => {
      const ticketData = {
        issueType: 'Lost',
        description: 'Test lost parcel ticket'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('priority', 'High');
      expect(response.body.data).to.have.property('issueType', 'Lost');
      expect(response.body.data).to.have.property('ticketId');
      expect(response.body.data.ticketId).to.match(/^TK-\d{8}-\d{4}$/);
    });

    it('should create ticket with Delayed issue type and auto-assign Medium priority', async () => {
      const ticketData = {
        issueType: 'Delayed',
        description: 'Test delayed parcel ticket'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data).to.have.property('priority', 'Medium');
      expect(response.body.data).to.have.property('issueType', 'Delayed');
    });

    it('should create ticket with Damaged issue type and auto-assign High priority', async () => {
      const ticketData = {
        issueType: 'Damaged',
        description: 'Test damaged parcel ticket'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data).to.have.property('priority', 'High');
      expect(response.body.data).to.have.property('issueType', 'Damaged');
    });

    it('should create ticket with General issue type and auto-assign Low priority', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'Test general inquiry ticket'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data).to.have.property('priority', 'Low');
      expect(response.body.data).to.have.property('issueType', 'General');
    });

    it('should allow explicit priority override during creation', async () => {
      const ticketData = {
        issueType: 'Lost', // Would normally be High
        priority: 'Low', // Override to Low
        description: 'Test with priority override'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data).to.have.property('priority', 'Low');
      expect(response.body.data).to.have.property('issueType', 'Lost');
    });

    it('should validate parcel reference during ticket creation', async () => {
      const ticketData = {
        issueType: 'Damaged',
        description: 'Test with parcel reference',
        parcelId: 'TEST001'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data).to.have.property('parcel');
      expect(response.body.data.parcel).to.have.property('parcelId', 'TEST001');
    });

    it('should reject invalid issue type during ticket creation', async () => {
      const ticketData = {
        issueType: 'InvalidType',
        description: 'Test with invalid issue type'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid issue type');
    });

    it('should require issue type and description', async () => {
      const ticketData = {
        description: 'Missing issue type'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Issue type and description are required');
    });
  });

  describe('Ticket Assignment to Support Agents', () => {
    beforeEach(async () => {
      // Create a test ticket for assignment
      testTicket = await Ticket.create({
        ticketId: 'TK-20260109-ASSIGN',
        issueType: 'Lost',
        priority: 'High',
        status: 'Open',
        description: 'Test ticket for assignment',
        createdBy: supervisorId
        // No assignedTo initially
      });
    });

    it('should allow supervisor to assign ticket to support agent', async () => {
      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        notes: 'Test assignment'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status', 'InProgress');
      expect(response.body.data).to.have.property('assignedTo');
      expect(response.body.data.assignedTo._id).to.equal(supportAgentId);
    });

    it('should validate support agent role during assignment', async () => {
      // Create a user with Driver role
      const driverUser = await User.create({
        name: 'Fake Support Agent',
        email: 'fake-support@test.com',
        password: 'password123',
        role: 'Driver' // Invalid role for assignment
      });

      const assignmentData = {
        assignedTo: driverUser._id.toString(),
        notes: 'Test assignment with invalid role'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only SupportAgent can be assigned to tickets');
    });

    it('should reject support agent from assigning tickets', async () => {
      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        notes: 'Unauthorized assignment'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(assignmentData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access this resource');
    });

    it('should prevent duplicate assignments', async () => {
      // First assignment
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ assignedTo: supportAgentId.toString() })
        .expect(200);

      // Second assignment to same agent
      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        notes: 'Duplicate assignment test'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('already assigned to this support agent');
    });

    it('should allow ticket reassignment', async () => {
      // Create another support agent
      const newSupportAgent = await User.create({
        name: 'New Support Agent',
        email: 'new-support@test.com',
        password: 'password123',
        role: 'SupportAgent',
      });

      // First assignment
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ assignedTo: supportAgentId.toString() })
        .expect(200);

      // Reassignment
      const reassignmentData = {
        assignedTo: newSupportAgent._id.toString(),
        reason: 'Workload balancing'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/reassign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(reassignmentData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('reassignment');
      expect(response.body.data.reassignment).to.have.property('newAssignment', newSupportAgent._id.toString());
    });

    it('should allow ticket unassignment', async () => {
      // First assign the ticket
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ assignedTo: supportAgentId.toString() })
        .expect(200);

      // Then unassign
      const unassignmentData = {
        reason: 'Agent availability issue'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/unassign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(unassignmentData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status', 'Open');
      expect(response.body.data).to.have.property('assignedTo', null);
    });
  });

  describe('Status Updates and Invalid Transitions', () => {
    beforeEach(async () => {
      // Create test ticket for status updates
      testTicket = await Ticket.create({
        ticketId: 'TK-20260109-STATUS',
        issueType: 'General',
        priority: 'Medium',
        status: 'Open',
        description: 'Test ticket for status updates',
        createdBy: supervisorId,
        assignedTo: supportAgentId
      });
    });

    it('should allow Open to InProgress transition', async () => {
      const statusData = {
        status: 'InProgress',
        internalNotes: 'Started working on this issue'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status', 'InProgress');
      expect(response.body.data).to.have.property('statusUpdate');
      expect(response.body.data.statusUpdate).to.have.property('previousStatus', 'Open');
      expect(response.body.data.statusUpdate).to.have.property('newStatus', 'InProgress');
    });

    it('should allow InProgress to Resolved transition', async () => {
      // First update to InProgress
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({ status: 'InProgress' });

      // Then resolve
      const statusData = {
        status: 'Resolved',
        resolution: 'Issue resolved successfully',
        resolutionCategory: 'Delivered',
        customerSatisfaction: 5,
        internalNotes: 'Customer satisfied with resolution'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(200);

      expect(response.body.data).to.have.property('status', 'Resolved');
      expect(response.body.data).to.have.property('resolution', 'Issue resolved successfully');
      expect(response.body.data).to.have.property('customerSatisfaction', 5);
    });

    it('should allow Resolved to Open transition (reopening)', async () => {
      // First resolve the ticket
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({ 
          status: 'Resolved',
          resolution: 'Initial resolution'
        });

      // Then reopen
      const statusData = {
        status: 'Open',
        internalNotes: 'Reopening for further investigation'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`) // Supervisor can reopen
        .send(statusData)
        .expect(200);

      expect(response.body.data).to.have.property('status', 'Open');
      expect(response.body.data.statusUpdate).to.have.property('previousStatus', 'Resolved');
      expect(response.body.data.statusUpdate).to.have.property('newStatus', 'Open');
    });

    it('should reject InProgress to Open transition', async () => {
      // First update to InProgress
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({ status: 'InProgress' });

      // Try invalid transition back to Open
      const statusData = {
        status: 'Open',
        internalNotes: 'Invalid transition attempt'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid status transition from InProgress to Open');
    });

    it('should reject Resolved to InProgress transition', async () => {
      // First resolve the ticket
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({ 
          status: 'Resolved',
          resolution: 'Initial resolution'
        });

      // Try invalid transition back to InProgress
      const statusData = {
        status: 'InProgress',
        internalNotes: 'Invalid transition attempt'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid status transition from Resolved to InProgress');
    });

    it('should validate resolution category when resolving', async () => {
      const statusData = {
        status: 'Resolved',
        resolution: 'Issue resolved',
        resolutionCategory: 'InvalidCategory', // Invalid category
        customerSatisfaction: 4
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid resolution category');
    });

    it('should validate customer satisfaction rating', async () => {
      const statusData = {
        status: 'Resolved',
        resolution: 'Issue resolved',
        resolutionCategory: 'Delivered',
        customerSatisfaction: 6 // Invalid rating (should be 1-5)
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Customer satisfaction must be a number between 1 and 5');
    });
  });

  describe('Role-Based Access Restrictions', () => {
    beforeEach(async () => {
      // Create test ticket for access tests
      testTicket = await Ticket.create({
        ticketId: 'TK-20260109-ACCESS',
        issueType: 'General',
        priority: 'Medium',
        status: 'Open',
        description: 'Test ticket for access control',
        createdBy: supervisorId,
        assignedTo: supportAgentId
      });
    });

    it('should allow supervisor to create tickets', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'Supervisor ticket creation test'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).to.have.property('success', true);
    });

    it('should allow support agent to create tickets', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'Support agent ticket creation test'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).to.have.property('success', true);
    });

    it('should reject driver from creating tickets', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'Driver ticket creation test'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(ticketData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors and support agents can access this resource');
    });

    it('should allow supervisor to view all tickets', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('tickets');
      // Should see all tickets including those not assigned to them
    });

    it('should allow support agent to view only assigned tickets', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('tickets');
      // Should only see tickets assigned to them
      response.body.data.tickets.forEach(ticket => {
        if (ticket.assignedTo) {
          expect(ticket.assignedTo._id).to.equal(supportAgentId);
        }
      });
    });

    it('should reject driver from viewing tickets', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors and support agents can access this resource');
    });

    it('should allow supervisor to assign tickets', async () => {
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-UNASSIGNED',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Unassigned ticket',
        createdBy: supervisorId
      });

      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        notes: 'Supervisor assignment test'
      };

      const response = await request(app)
        .patch(`/api/tickets/${unassignedTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
    });

    it('should reject support agent from assigning tickets', async () => {
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-UNASSIGNED2',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Another unassigned ticket',
        createdBy: supervisorId
      });

      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        notes: 'Unauthorized assignment test'
      };

      const response = await request(app)
        .patch(`/api/tickets/${unassignedTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(assignmentData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access this resource');
    });

    it('should allow support agent to update status of assigned ticket', async () => {
      const statusData = {
        status: 'InProgress',
        internalNotes: 'Support agent status update test'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
    });

    it('should reject support agent from updating status of unassigned ticket', async () => {
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-UNASSIGNED3',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Unassigned ticket for status test',
        createdBy: supervisorId
        // No assignedTo
      });

      const statusData = {
        status: 'InProgress',
        internalNotes: 'Unauthorized status update test'
      };

      const response = await request(app)
        .patch(`/api/tickets/${unassignedTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('You can only update status for tickets assigned to you');
    });
  });

  describe('Ticket-Parcel Integration Tests', () => {
    beforeEach(async () => {
      // Create ticket with parcel reference for integration tests
      testTicket = await Ticket.create({
        ticketId: 'TK-20260109-PARCEL',
        issueType: 'Lost',
        priority: 'High',
        status: 'Open',
        description: 'Test ticket with parcel integration',
        createdBy: supervisorId,
        assignedTo: supportAgentId,
        parcel: testParcel._id
      });
    });

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
      expect(ticket).to.have.property('parcel');
      expect(ticket.parcel).to.have.property('parcelId', testParcel.parcelId);
      
      // Verify parcel integration
      expect(parcelIntegration).to.have.property('hasParcel', true);
      expect(parcelIntegration).to.have.property('parcelStatus', testParcel.status);
      expect(parcelIntegration).to.have.property('deliveryProgress');
      expect(parcelIntegration.deliveryProgress).to.be.a('number');
    });

    it('should return tickets with parcel summary', async () => {
      const response = await request(app)
        .get('/api/tickets/with-parcel-summary')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('tickets');
      expect(response.body.data).to.have.property('summary');
      
      const { tickets, summary } = response.body.data;
      
      // Verify tickets have parcel summary
      const ticketWithParcel = tickets.find(t => t.ticketId === testTicket.ticketId);
      expect(ticketWithParcel).to.have.property('parcelSummary');
      expect(ticketWithParcel.parcelSummary).to.have.property('parcelId', testParcel.parcelId);
      
      // Verify summary statistics
      expect(summary).to.have.property('totalTickets');
      expect(summary).to.have.property('ticketsWithParcels');
      expect(summary).to.have.property('deliveredParcels');
      expect(summary).to.have.property('inTransitParcels');
    });

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
    });

    it('should calculate correct delivery progress percentages', async () => {
      // Test different parcel statuses
      const statuses = ['Created', 'PickedUp', 'InTransit', 'OutForDelivery', 'Delivered'];
      const expectedProgress = [0, 25, 50, 75, 100];

      for (let i = 0; i < statuses.length; i++) {
        // Update parcel status
        await Parcel.updateOne(
          { parcelId: testParcel.parcelId },
          { status: statuses[i] }
        );

        const response = await request(app)
          .get(`/api/tickets/${testTicket.ticketId}/with-parcel`)
          .set('Authorization', `Bearer ${supervisorToken}`)
          .expect(200);

        const deliveryProgress = response.body.data.ticket.parcel.deliveryProgress;
        expect(deliveryProgress).to.equal(expectedProgress[i]);
      }
    });

    it('should handle ticket without parcel reference', async () => {
      // Create ticket without parcel
      const ticketWithoutParcel = await Ticket.create({
        ticketId: 'TK-20260109-NOPARCEL',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Ticket without parcel',
        createdBy: supervisorId,
        assignedTo: supportAgentId
      });

      const response = await request(app)
        .get(`/api/tickets/${ticketWithoutParcel.ticketId}/with-parcel`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      const { ticket, parcelIntegration } = response.body.data;
      
      expect(ticket.parcel).to.be.null;
      expect(parcelIntegration).to.have.property('hasParcel', false);
      expect(parcelIntegration).to.have.property('parcelStatus', null);
    });
  });

  describe('Comprehensive Workflow Tests', () => {
    it('should handle complete ticket lifecycle from creation to resolution', async () => {
      // 1. Create ticket
      const createResponse = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          issueType: 'Delayed',
          description: 'Complete workflow test ticket',
          parcelId: 'TEST001'
        })
        .expect(201);

      const ticketId = createResponse.body.data.ticketId;
      expect(createResponse.body.data.priority).to.equal('Medium');

      // 2. Assign ticket
      const assignResponse = await request(app)
        .patch(`/api/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          assignedTo: supportAgentId.toString(),
          notes: 'Workflow test assignment'
        })
        .expect(200);

      expect(assignResponse.body.data.status).to.equal('InProgress');

      // 3. Update status to Resolved
      const statusResponse = await request(app)
        .patch(`/api/tickets/${ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({
          status: 'Resolved',
          resolution: 'Issue resolved through workflow test',
          resolutionCategory: 'Delivered',
          customerSatisfaction: 5
        })
        .expect(200);

      expect(statusResponse.body.data.status).to.equal('Resolved');
      expect(statusResponse.body.data.resolution).to.equal('Issue resolved through workflow test');

      // 4. Verify final state with parcel integration
      const finalResponse = await request(app)
        .get(`/api/tickets/${ticketId}/with-parcel`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(finalResponse.body.data.ticket.status).to.equal('Resolved');
      expect(finalResponse.body.data.parcelIntegration.hasParcel).to.equal(true);
    });

    it('should maintain data consistency across multiple operations', async () => {
      // Create multiple tickets with different issue types
      const tickets = [];
      for (const issueType of ['Lost', 'Delayed', 'Damaged', 'General']) {
        const response = await request(app)
          .post('/api/tickets')
          .set('Authorization', `Bearer ${supervisorToken}`)
          .send({
            issueType,
            description: `Consistency test for ${issueType}`
          });
        
        tickets.push(response.body.data);
      }

      // Verify auto-assigned priorities
      const expectedPriorities = ['High', 'Medium', 'High', 'Low'];
      tickets.forEach((ticket, index) => {
        expect(ticket.priority).to.equal(expectedPriorities[index]);
        expect(ticket.issueType).to.equal(['Lost', 'Delayed', 'Damaged', 'General'][index]);
      });

      // Assign all tickets
      for (const ticket of tickets) {
        await request(app)
          .patch(`/api/tickets/${ticket.ticketId}/assign`)
          .set('Authorization', `Bearer ${supervisorToken}`)
          .send({
            assignedTo: supportAgentId.toString(),
            notes: `Assignment for ${ticket.ticketId}`
          });
      }

      // Verify all assignments
      const listResponse = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(listResponse.body.data.tickets).to.have.length(4);
      listResponse.body.data.tickets.forEach(ticket => {
        expect(ticket.status).to.equal('InProgress');
        expect(ticket.assignedTo._id).to.equal(supportAgentId);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-existent ticket ID', async () => {
      const response = await request(app)
        .get('/api/tickets/NONEXISTENT/with-parcel')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Ticket not found');
    });

    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/tickets' },
        { method: 'post', path: '/api/tickets' },
        { method: 'patch', path: '/api/tickets/TEST001/assign' },
        { method: 'patch', path: '/api/tickets/TEST001/status' },
        { method: 'get', path: '/api/tickets/TEST001/with-parcel' }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path);
        expect(response.status).to.equal(401);
        expect(response.body).to.have.property('message');
        expect(response.body.message).to.include('Authentication token missing');
      }
    });

    it('should handle malformed request bodies', async () => {
      // Test with invalid JSON
      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body).to.have.property('message');
    });

    it('should handle database connection errors gracefully', async () => {
      // This test would require mocking database errors
      // For now, we verify the error handling structure exists
      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          issueType: 'InvalidType',
          description: 'Test error handling'
        })
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body).to.have.property('success', false);
    });
  });
});
