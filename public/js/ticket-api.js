/**
 * Ticket Management API Helper
 * Provides common functions for ticket management frontend
 */

class TicketAPI {
    constructor() {
        this.baseURL = '/api/tickets';
        this.token = localStorage.getItem('token');
    }

    // Get headers with authentication
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }

    // Handle API errors
    async handleResponse(response) {
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'API request failed');
        }
        
        return data;
    }

    // Get all tickets (supervisor)
    async getAllTickets(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`${this.baseURL}?${queryString}`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Get my tickets (support agent)
    async getMyTickets(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`${this.baseURL}/my?${queryString}`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Get single ticket
    async getTicket(ticketId) {
        const response = await fetch(`${this.baseURL}/${ticketId}`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Create new ticket
    async createTicket(ticketData) {
        const response = await fetch(this.baseURL, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(ticketData)
        });
        return this.handleResponse(response);
    }

    // Assign ticket
    async assignTicket(ticketId, assignmentData) {
        const response = await fetch(`${this.baseURL}/${ticketId}/assign`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify(assignmentData)
        });
        return this.handleResponse(response);
    }

    // Reassign ticket
    async reassignTicket(ticketId, reassignmentData) {
        const response = await fetch(`${this.baseURL}/${ticketId}/reassign`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify(reassignmentData)
        });
        return this.handleResponse(response);
    }

    // Unassign ticket
    async unassignTicket(ticketId, reason) {
        const response = await fetch(`${this.baseURL}/${ticketId}/unassign`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify({ reason })
        });
        return this.handleResponse(response);
    }

    // Update ticket status
    async updateTicketStatus(ticketId, statusData) {
        const response = await fetch(`${this.baseURL}/${ticketId}/status`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify(statusData)
        });
        return this.handleResponse(response);
    }

    // Get status history
    async getStatusHistory(ticketId) {
        const response = await fetch(`${this.baseURL}/${ticketId}/status-history`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Get assignment history
    async getAssignmentHistory(ticketId) {
        const response = await fetch(`${this.baseURL}/${ticketId}/assignments`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Get status transitions
    async getStatusTransitions() {
        const response = await fetch(`${this.baseURL}/status-transitions`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Get statistics
    async getStatistics(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`${this.baseURL}/statistics?${queryString}`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Get support agents (for assignment)
    async getSupportAgents() {
        const response = await fetch('/api/users?role=SupportAgent', {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }
}

/**
 * UI Helper Functions
 */
class TicketUI {
    // Show message
    static showMessage(message, type = 'info', duration = 5000) {
        const container = document.getElementById('messageContainer') || this.createMessageContainer();
        const messageDiv = document.createElement('div');
        messageDiv.className = type;
        messageDiv.textContent = message;
        container.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.remove();
        }, duration);
    }

    // Create message container if it doesn't exist
    static createMessageContainer() {
        const container = document.createElement('div');
        container.id = 'messageContainer';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
        return container;
    }

    // Format date
    static formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    // Get status badge HTML
    static getStatusBadge(status) {
        const statusClass = status.toLowerCase().replace(' ', '');
        return `<span class="ticket-status status-${statusClass}">${status}</span>`;
    }

    // Get priority badge HTML
    static getPriorityBadge(priority) {
        const priorityClass = priority.toLowerCase();
        return `<span class="priority-badge priority-${priorityClass}">${priority}</span>`;
    }

    // Show loading
    static showLoading(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div class="loading">${message}</div>`;
        }
    }

    // Show error
    static showError(containerId, message) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div class="error">${message}</div>`;
        }
    }
}

/**
 * Authentication Helper
 */
class AuthHelper {
    // Check if user is authenticated
    static isAuthenticated() {
        return !!localStorage.getItem('token');
    }

    // Get current user
    static getCurrentUser() {
        return JSON.parse(localStorage.getItem('user') || '{}');
    }

    // Check user role
    static hasRole(role) {
        const user = this.getCurrentUser();
        return user.role === role;
    }

    // Redirect if not authenticated
    static requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/login.html';
            return false;
        }
        return true;
    }

    // Redirect if not authorized
    static requireRole(requiredRole) {
        if (!this.requireAuth()) {
            return false;
        }

        const user = this.getCurrentUser();
        if (user.role !== requiredRole) {
            alert(`Access denied. ${requiredRole}s only.`);
            window.location.href = '/login.html';
            return false;
        }
        return true;
    }

    // Logout
    static logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
}

/**
 * Form Helper
 */
class FormHelper {
    // Serialize form to object
    static serialize(form) {
        const formData = new FormData(form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        return data;
    }

    // Validate required fields
    static validateRequired(form, requiredFields) {
        const errors = [];
        const data = this.serialize(form);
        
        requiredFields.forEach(field => {
            if (!data[field] || data[field].trim() === '') {
                errors.push(`${field} is required`);
            }
        });
        
        return errors;
    }

    // Clear form
    static clear(form) {
        form.reset();
    }
}

// Export classes for use in other files
window.TicketAPI = TicketAPI;
window.TicketUI = TicketUI;
window.AuthHelper = AuthHelper;
window.FormHelper = FormHelper;
