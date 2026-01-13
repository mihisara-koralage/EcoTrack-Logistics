import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Ticket from '../src/models/Ticket.js';

describe('Ticket Status Update API Tests', function() {
  this.timeout(10000);

  let mongoServer;
  let supervisorToken, supportAgentToken, driverToken;
  let supervisorId, supportAgentId, driverId;
  let testTicket;

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

    // Get tokens
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

    // Create test ticket
    testTicket = await Ticket.create({
      ticketId: 'TK-20260109-0001',
      issueType: 'Lost',
      priority: 'High',
      status: 'Open',
      description: 'Test ticket for status updates',
      createdBy: supervisorId,
      assignedTo: supportAgentId
    });
  });

  describe('PATCH /api/tickets/:ticketId/status - Basic Status Updates', () => {
    it('should allow support agent to update ticket status to InProgress', async () => {
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
      expect(response.body.data.statusUpdate).to.have.property('newStatus', 'InProgress');
      expect(response.body.data.statusUpdate).to.have.property('previousStatus', 'Open');
    });

    it('should allow supervisor to update ticket status', async () => {
      const statusData = {
        status: 'InProgress',
        internalNotes: 'Supervisor status update'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(statusData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status', 'InProgress');
    });

    it('should allow support agent to resolve ticket', async () => {
      const statusData = {
        status: 'Resolved',
        resolution: 'Package found and delivered successfully',
        resolutionCategory: 'Delivered',
        customerSatisfaction: 5,
        actualResolutionTime: new Date().toISOString(),
        internalNotes: 'Customer satisfied with delivery'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status', 'Resolved');
      expect(response.body.data).to.have.property('resolution', 'Package found and delivered successfully');
      expect(response.body.data).to.have.property('resolutionCategory', 'Delivered');
      expect(response.body.data).to.have.property('customerSatisfaction', 5);
    });

    it('should reject invalid status values', async () => {
      const statusData = {
        status: 'InvalidStatus'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid status. Must be one of: Open, InProgress, Resolved');
    });

    it('should require status field', async () => {
      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({}) // Missing status
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Status is required');
    });

    it('should handle non-existent ticket', async () => {
      const statusData = {
        status: 'InProgress'
      };

      const response = await request(app)
        .patch(`/api/tickets/NONEXISTENT/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(statusData)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Ticket not found');
    });
  });

  describe('Status Transition Validation', () => {
    it('should allow Open → InProgress transition', async () => {
      const statusData = {
        status: 'InProgress'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(200);

      expect(response.body.data.statusUpdate.transitionValidation.isValid).to.equal(true);
    });

    it('should allow InProgress → Resolved transition', async () => {
      // First update to InProgress
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({ status: 'InProgress' });

      // Then resolve
      const resolveData = {
        status: 'Resolved',
        resolution: 'Issue resolved successfully'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(resolveData)
        .expect(200);

      expect(response.body.data.statusUpdate.transitionValidation.isValid).to.equal(true);
    });

    it('should allow Resolved → Open transition (reopening)', async () => {
      // First resolve the ticket
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ 
          status: 'Resolved',
          resolution: 'Issue resolved successfully'
        });

      // Then reopen
      const reopenData = {
        status: 'Open',
        internalNotes: 'Reopening ticket for further investigation'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(reopenData)
        .expect(200);

      expect(response.body.data.statusUpdate.transitionValidation.isValid).to.equal(true);
      expect(response.body.data.status).to.equal('Open');
    });

    it('should reject InProgress → Open transition', async () => {
      const statusData = {
        status: 'Open'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid status transition');
    });

    it('should reject Resolved → InProgress transition', async () => {
      const statusData = {
        status: 'InProgress'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid status transition');
    });
  });

  describe('Role-Based Access Control', () => {
    it('should reject driver from updating ticket status', async () => {
      const statusData = {
        status: 'InProgress'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send(statusData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('You can only update status for tickets assigned to you');
    });

    it('should reject unassigned support agent from updating ticket status', async () => {
      // Create unassigned ticket
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-0002',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Unassigned ticket',
        createdBy: supervisorId
      });

      const statusData = {
        status: 'InProgress'
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

  describe('Resolution Features', () => {
    it('should validate resolution category when resolving', async () => {
      const statusData = {
        status: 'Resolved',
        resolutionCategory: 'InvalidCategory'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid resolution category');
    });

    it('should validate customer satisfaction rating', async () => {
      const statusData = {
        status: 'Resolved',
        customerSatisfaction: 6 // Invalid rating (should be 1-5)
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(statusData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Customer satisfaction must be a number between 1 and 5');
    });

    it('should set actual resolution time when resolving', async () => {
      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const statusData = {
        status: 'Resolved',
        actualResolutionTime: futureTime.toISOString()
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(statusData)
        .expect(200);

      expect(response.body.data.actualResolutionTime).to.be.a('string');
      expect(new Date(response.body.data.actualResolutionTime)).to.be.closeTo(futureTime, 1000);
    });
  });

  describe('GET /api/tickets/:ticketId/status-history - Status History', () => {
    beforeEach(async () => {
      // Add some status changes to the ticket
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({ status: 'InProgress' });

      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({ status: 'Open', internalNotes: 'Reopened for investigation' });

      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send({ status: 'Resolved', resolution: 'Issue resolved' });
    });

    it('should allow assigned support agent to view status history', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/status-history`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('statusHistory');
      expect(response.body.data.statusHistory).to.be.an('array');
      expect(response.body.data.totalStatusChanges).to.be.at.least(2); // Open→InProgress→Resolved
    });

    it('should allow supervisor to view status history', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/status-history`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.statusHistory).to.be.an('array');
      expect(response.body.data.totalStatusChanges).to.be.at.least(2);
    });

    it('should filter status change activities only', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/status-history`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.statusHistory).to.be.an('array');
      response.body.data.statusHistory.forEach(activity => {
        expect(activity.action).to.equal('StatusChanged');
      });
    });

    it('should reject unassigned support agent from viewing status history', async () => {
      // Create unassigned ticket
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-0003',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Unassigned ticket',
        createdBy: supervisorId
      });

      const response = await request(app)
        .get(`/api/tickets/${unassignedTicket.ticketId}/status-history`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('You can only view status history for tickets assigned to you');
    });
  });

  describe('GET /api/tickets/status-transitions - Status Transitions', () => {
    it('should return available status transitions', async () => {
      const response = await request(app)
        .get('/api/tickets/status-transitions')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('transitions');
      expect(response.body.data).to.have.property('statusTransitionMatrix');
      
      // Check that all expected transitions are allowed
      expect(response.body.data.transitions.Open.allowedTransitions).to.include.members(['InProgress', 'Resolved']);
      expect(response.body.data.transitions.InProgress.allowedTransitions).to.include.members(['Open', 'Resolved']);
      expect(response.body.data.transitions.Resolved.allowedTransitions).to.include.members(['Open']);
    });

    it('should allow both supervisor and support agent access', async () => {
      // Test supervisor access
      const supervisorResponse = await request(app)
        .get('/api/tickets/status-transitions')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(supervisorResponse.body).to.have.property('success', true);

      // Test support agent access
      const supportAgentResponse = await request(app)
        .get('/api/tickets/status-transitions')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(supportAgentResponse.body).to.have.property('success', true);
    });

    it('should reject driver from accessing status transitions', async () => {
      const driverLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'driver@test.com', password: 'password123' });

      const driverToken = driverLogin.body.token;

      const response = await request(app)
        .get('/api/tickets/status-transitions')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Access denied');
    });
  });
});
