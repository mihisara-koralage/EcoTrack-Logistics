import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';
import Ticket from '../src/models/Ticket.js';

describe('Ticket Assignment API Tests', function() {
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
      description: 'Test ticket for assignment',
      createdBy: supervisorId
      // Not assigned initially
    });
  });

  describe('PATCH /api/tickets/:ticketId/assign - Basic Assignment', () => {
    it('should allow supervisor to assign ticket', async () => {
      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        notes: 'Initial assignment for testing'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId', testTicket.ticketId);
      expect(response.body.data).to.have.property('status', 'InProgress');
      expect(response.body.data).to.have.property('assignedTo');
      expect(response.body.data.assignedTo._id).to.equal(supportAgentId);
      expect(response.body.data.assignment).to.have.property('assignedBy', supervisorId);
      expect(response.body.data.assignment).to.have.property('assignedAt');
      expect(response.body.data.assignment).to.have.property('statusChange');
      expect(response.body.data.assignment.statusChange.from).to.equal('Open');
      expect(response.body.data.assignment.statusChange.to).to.equal('InProgress');
    });

    it('should reject support agent from assigning ticket', async () => {
      const assignmentData = {
        assignedTo: supportAgentId.toString()
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(assignmentData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access this resource');
    });

    it('should reject driver from assigning ticket', async () => {
      const assignmentData = {
        assignedTo: supportAgentId.toString()
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send(assignmentData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access this resource');
    });

    it('should validate support agent role', async () => {
      // Create a user with Driver role
      const driverUser = await User.create({
        name: 'Fake Support Agent',
        email: 'fake-support@test.com',
        password: 'password123',
        role: 'Driver' // Invalid role
      });

      const assignmentData = {
        assignedTo: driverUser._id.toString()
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only SupportAgent can be assigned to tickets');
    });

    it('should require assignedTo field', async () => {
      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({}) // Missing assignedTo
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Support agent ID is required');
    });

    it('should handle non-existent ticket', async () => {
      const assignmentData = {
        assignedTo: supportAgentId.toString()
      };

      const response = await request(app)
        .patch('/api/tickets/NONEXISTENT/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Ticket not found');
    });

    it('should prevent assignment to resolved tickets', async () => {
      // Create a resolved ticket
      const resolvedTicket = await Ticket.create({
        ticketId: 'TK-20260109-0002',
        issueType: 'General',
        priority: 'Low',
        status: 'Resolved',
        description: 'Already resolved ticket',
        createdBy: supervisorId
      });

      const assignmentData = {
        assignedTo: supportAgentId.toString()
      };

      const response = await request(app)
        .patch(`/api/tickets/${resolvedTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Cannot assign resolved tickets');
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
        assignedTo: supportAgentId.toString()
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('already assigned to this support agent');
    });
  });

  describe('PATCH /api/tickets/:ticketId/assign - Advanced Features', () => {
    it('should allow priority override during assignment', async () => {
      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        priority: 'High', // Override priority
        notes: 'Priority changed to High during assignment'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(200);

      expect(response.body.data.priority).to.equal('High');
      expect(response.body.data.internalNotes).to.include('Priority changed to High during assignment');
    });

    it('should allow estimated resolution time setting', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        estimatedResolutionTime: futureDate.toISOString(),
        notes: 'Estimated resolution time set'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(200);

      expect(response.body.data.estimatedResolutionTime).to.be.a('string');
      expect(new Date(response.body.data.estimatedResolutionTime)).to.be.closeTo(futureDate, 1000);
    });

    it('should validate priority field', async () => {
      const assignmentData = {
        assignedTo: supportAgentId.toString(),
        priority: 'InvalidPriority'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Validation failed');
    });
  });

  describe('PATCH /api/tickets/:ticketId/reassign - Reassignment', () => {
    beforeEach(async () => {
      // First assign the ticket to support agent
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ assignedTo: supportAgentId.toString() });
    });

    it('should allow supervisor to reassign ticket', async () => {
      // Create another support agent
      const newSupportAgent = await User.create({
        name: 'New Support Agent',
        email: 'new-support@test.com',
        password: 'password123',
        role: 'SupportAgent',
      });

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
      expect(response.body.data.reassignment).to.have.property('reason', 'Workload balancing');
      expect(response.body.data.reassignment).to.have.property('previousAssignment', supportAgentId.toString());
    });

    it('should reject support agent from reassigning ticket', async () => {
      const reassignmentData = {
        assignedTo: supportAgentId.toString(),
        reason: 'Unauthorized reassignment'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/reassign`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(reassignmentData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can reassign tickets');
    });

    it('should require reason for reassignment', async () => {
      const newSupportAgent = await User.create({
        name: 'Another Support Agent',
        email: 'another-support@test.com',
        password: 'password123',
        role: 'SupportAgent',
      });

      const reassignmentData = {
        assignedTo: newSupportAgent._id.toString()
        // Missing reason
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/reassign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(reassignmentData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('new support agent ID, and reason are required');
    });
  });

  describe('PATCH /api/tickets/:ticketId/unassign - Unassignment', () => {
    beforeEach(async () => {
      // First assign the ticket to support agent
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ assignedTo: supportAgentId.toString() });
    });

    it('should allow supervisor to unassign ticket', async () => {
      const unassignmentData = {
        reason: 'Agent availability issues'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/unassign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(unassignmentData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status', 'Open');
      expect(response.body.data).to.have.property('assignedTo', null);
      expect(response.body.data).to.have.property('unassignment');
      expect(response.body.data.unassignment).to.have.property('previousAssignment', supportAgentId.toString());
      expect(response.body.data.unassignment).to.have.property('reason', 'Agent availability issues');
    });

    it('should reject support agent from unassigning ticket', async () => {
      const unassignmentData = {
        reason: 'Unauthorized unassignment'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/unassign`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(unassignmentData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can unassign tickets');
    });

    it('should handle unassignment of unassigned ticket', async () => {
      // Create unassigned ticket
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-0003',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Unassigned ticket',
        createdBy: supervisorId
      });

      const unassignmentData = {
        reason: 'Test unassignment'
      };

      const response = await request(app)
        .patch(`/api/tickets/${unassignedTicket.ticketId}/unassign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(unassignmentData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Ticket is not currently assigned to any agent');
    });
  });

  describe('GET /api/tickets/:ticketId/assignments - Assignment History', () => {
    beforeEach(async () => {
      // Assign ticket to support agent first
      await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ assignedTo: supportAgentId.toString() });
    });

    it('should allow supervisor to view assignment history', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/assignments`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId', testTicket.ticketId);
      expect(response.body.data).to.have.property('assignmentHistory');
      expect(response.body.data.assignmentHistory).to.be.an('array');
      expect(response.body.data.totalAssignments).to.be.at.least(1);
    });

    it('should allow assigned support agent to view assignment history', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/assignments`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.assignmentHistory).to.be.an('array');
    });

    it('should reject unassigned support agent from viewing assignment history', async () => {
      // Create unassigned ticket
      const unassignedTicket = await Ticket.create({
        ticketId: 'TK-20260109-0004',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'Unassigned ticket',
        createdBy: supervisorId
      });

      const response = await request(app)
        .get(`/api/tickets/${unassignedTicket.ticketId}/assignments`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('You can only view assignment history for tickets assigned to you');
    });

    it('should filter assignment-related activities', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}/assignments`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.assignmentHistory).to.be.an('array');
      
      // Check that only assignment-related activities are included
      response.body.data.assignmentHistory.forEach(activity => {
        expect(['Assigned', 'Reassigned', 'Unassigned']).to.include(activity.action);
      });
    });
  });
});
