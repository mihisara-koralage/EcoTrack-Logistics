/**
 * Ticket-Parcel Integration Frontend Helper
 * Provides frontend functions for ticket-parcel integration
 */

class TicketParcelIntegration {
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

    // Get ticket with integrated parcel information
    async getTicketWithParcel(ticketId) {
        const response = await fetch(`${this.baseURL}/${ticketId}/with-parcel`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Get tickets with parcel summary
    async getTicketsWithParcelSummary(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`${this.baseURL}/with-parcel-summary?${queryString}`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }

    // Get parcel tracking information for ticket
    async getTicketParcelTracking(ticketId) {
        const response = await fetch(`${this.baseURL}/${ticketId}/parcel-tracking`, {
            headers: this.getHeaders()
        });
        return this.handleResponse(response);
    }
}

/**
 * Parcel UI Helper Functions
 */
class ParcelUI {
    // Display parcel information in ticket card
    static displayParcelInfo(parcel) {
        if (!parcel) return '';

        const progressClass = this.getProgressClass(parcel.deliveryProgress);
        const statusBadge = this.getStatusBadge(parcel.status);

        return `
            <div class="parcel-info">
                <div class="parcel-header">
                    <strong>Parcel:</strong> ${parcel.parcelId}
                    <span class="parcel-status">${statusBadge}</span>
                </div>
                <div class="parcel-progress">
                    <div class="progress-bar">
                        <div class="progress-fill ${progressClass}" style="width: ${parcel.deliveryProgress}%"></div>
                    </div>
                    <span class="progress-text">${parcel.deliveryProgress}% Complete</span>
                </div>
                <div class="parcel-details">
                    <div><strong>From:</strong> ${parcel.pickupLocation}</div>
                    <div><strong>To:</strong> ${parcel.deliveryLocation}</div>
                    ${parcel.currentLocation ? `
                        <div><strong>Current:</strong> ${parcel.currentLocation.name || parcel.currentLocation.address}</div>
                    ` : ''}
                    ${parcel.assignedDriver ? `
                        <div><strong>Driver:</strong> ${parcel.assignedDriver.name}</div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Display detailed parcel tracking
    static displayParcelTracking(trackingInfo) {
        if (!trackingInfo) return '<p>No parcel information available</p>';

        const timeline = this.generateTrackingTimeline(trackingInfo.trackingHistory);
        const nextMilestone = trackingInfo.nextMilestone ? 
            `<div class="next-milestone"><strong>Next:</strong> ${trackingInfo.nextMilestone}</div>` : '';

        return `
            <div class="parcel-tracking">
                <div class="tracking-summary">
                    <div class="tracking-item">
                        <strong>Parcel ID:</strong> ${trackingInfo.parcelId}
                    </div>
                    <div class="tracking-item">
                        <strong>Status:</strong> ${this.getStatusBadge(trackingInfo.currentStatus)}
                    </div>
                    <div class="tracking-item">
                        <strong>Progress:</strong> ${trackingInfo.deliveryProgress}%
                    </div>
                    ${trackingInfo.timeInTransit ? `
                        <div class="tracking-item">
                            <strong>Time in Transit:</strong> ${trackingInfo.timeInTransit.formatted}
                        </div>
                    ` : ''}
                    ${nextMilestone}
                </div>
                
                ${trackingInfo.currentLocation ? `
                    <div class="current-location">
                        <h4>Current Location</h4>
                        <div class="location-details">
                            <strong>${trackingInfo.currentLocation.name || trackingInfo.currentLocation.address}</strong>
                            ${trackingInfo.currentLocation.coordinates ? `
                                <div class="coordinates">
                                    Lat: ${trackingInfo.currentLocation.coordinates.latitude}, 
                                    Lng: ${trackingInfo.currentLocation.coordinates.longitude}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
                
                ${trackingInfo.assignedDriver ? `
                    <div class="driver-info">
                        <h4>Assigned Driver</h4>
                        <div class="driver-details">
                            <strong>Name:</strong> ${trackingInfo.assignedDriver.name}<br>
                            <strong>Email:</strong> ${trackingInfo.assignedDriver.email}<br>
                            ${trackingInfo.assignedDriver.phone ? `<strong>Phone:</strong> ${trackingInfo.assignedDriver.phone}` : ''}
                        </div>
                    </div>
                ` : ''}
                
                <div class="tracking-timeline">
                    <h4>Tracking History</h4>
                    ${timeline}
                </div>
            </div>
        `;
    }

    // Generate tracking timeline HTML
    static generateTrackingTimeline(history) {
        if (!history || history.length === 0) {
            return '<p>No tracking history available</p>';
        }

        return history.map((event, index) => `
            <div class="timeline-item">
                <div class="timeline-marker ${index === history.length - 1 ? 'active' : ''}"></div>
                <div class="timeline-content">
                    <div class="timeline-time">${new Date(event.timestamp).toLocaleString()}</div>
                    <div class="timeline-status"><strong>${event.status}</strong></div>
                    ${event.location ? `
                        <div class="timeline-location">${event.location.name || event.location.address}</div>
                    ` : ''}
                    ${event.description ? `
                        <div class="timeline-description">${event.description}</div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    // Get progress bar class based on percentage
    static getProgressClass(progress) {
        if (progress >= 100) return 'progress-complete';
        if (progress >= 75) return 'progress-high';
        if (progress >= 50) return 'progress-medium';
        if (progress >= 25) return 'progress-low';
        return 'progress-minimal';
    }

    // Get status badge HTML
    static getStatusBadge(status) {
        const statusClass = status.toLowerCase().replace(/\s+/g, '-');
        return `<span class="parcel-status status-${statusClass}">${status}</span>`;
    }

    // Display parcel summary in ticket list
    static displayParcelSummary(parcelSummary) {
        if (!parcelSummary) return '';

        const progressClass = this.getProgressClass(parcelSummary.deliveryProgress);
        const statusBadge = this.getStatusBadge(parcelSummary.status);

        return `
            <div class="parcel-summary">
                <div class="summary-item">
                    <strong>Parcel:</strong> ${parcelSummary.parcelId}
                </div>
                <div class="summary-item">
                    <strong>Status:</strong> ${statusBadge}
                </div>
                <div class="summary-item">
                    <strong>Progress:</strong> 
                    <div class="mini-progress">
                        <div class="mini-progress-fill ${progressClass}" style="width: ${parcelSummary.deliveryProgress}%"></div>
                        <span class="mini-progress-text">${parcelSummary.deliveryProgress}%</span>
                    </div>
                </div>
                ${parcelSummary.hasRoute ? `
                    <div class="summary-item">
                        <strong>Route:</strong> Optimized
                    </div>
                ` : ''}
            </div>
        `;
    }
}

/**
 * Enhanced Ticket Display with Parcel Integration
 */
class EnhancedTicketDisplay {
    // Display ticket card with parcel information
    static displayTicketWithParcel(ticket) {
        const parcelInfo = ticket.parcel ? 
            ParcelUI.displayParcelInfo(ticket.parcel) : 
            '<div class="parcel-info">No parcel associated</div>';

        return `
            <div class="ticket-card priority-${ticket.priority.toLowerCase()}">
                <div class="ticket-header">
                    <span class="ticket-id">${ticket.ticketId}</span>
                    <span class="ticket-status status-${ticket.status.toLowerCase()}">${ticket.status}</span>
                </div>
                <div class="ticket-meta">
                    <span><strong>Issue:</strong> ${ticket.issueType}</span>
                    <span><strong>Priority:</strong> ${ticket.priority}</span>
                    <span><strong>Created:</strong> ${new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="ticket-description">${ticket.description}</div>
                ${parcelInfo}
                <div class="ticket-meta">
                    <span><strong>Assigned To:</strong> ${ticket.assignedTo ? ticket.assignedTo.name : 'Unassigned'}</span>
                    <span><strong>Created By:</strong> ${ticket.createdBy.name}</span>
                </div>
                <div class="ticket-actions">
                    <button class="btn btn-primary" onclick="viewTicketWithParcel('${ticket.ticketId}')">View Details</button>
                    ${ticket.parcel ? `
                        <button class="btn btn-success" onclick="viewParcelTracking('${ticket.ticketId}')">Track Parcel</button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Display enhanced ticket details modal
    static displayTicketDetailsWithParcel(ticketData) {
        const { ticket, parcelIntegration } = ticketData;
        
        const parcelSection = ticket.parcel ? `
            <div class="parcel-section">
                <h3>Parcel Information</h3>
                ${ParcelUI.displayParcelInfo(ticket.parcel)}
                
                <div class="parcel-actions">
                    <button class="btn btn-success" onclick="viewFullParcelTracking('${ticket.ticketId}')">
                        Full Tracking Details
                    </button>
                    <button class="btn btn-primary" onclick="refreshParcelStatus('${ticket.ticketId}')">
                        Refresh Status
                    </button>
                </div>
            </div>
        ` : '<div class="parcel-section"><p>No parcel associated with this ticket</p></div>';

        return `
            <div class="enhanced-ticket-details">
                <div class="ticket-section">
                    <h3>Ticket Details</h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <label>Ticket ID:</label>
                            <span>${ticket.ticketId}</span>
                        </div>
                        <div class="detail-item">
                            <label>Issue Type:</label>
                            <span>${ticket.issueType}</span>
                        </div>
                        <div class="detail-item">
                            <label>Priority:</label>
                            <span>${ticket.priority}</span>
                        </div>
                        <div class="detail-item">
                            <label>Status:</label>
                            <span class="ticket-status status-${ticket.status.toLowerCase()}">${ticket.status}</span>
                        </div>
                        <div class="detail-item full-width">
                            <label>Description:</label>
                            <span>${ticket.description}</span>
                        </div>
                    </div>
                </div>
                
                ${parcelSection}
                
                <div class="integration-summary">
                    <h3>Integration Summary</h3>
                    <div class="summary-grid">
                        <div class="summary-item">
                            <label>Has Parcel:</label>
                            <span>${parcelIntegration.hasParcel ? 'Yes' : 'No'}</span>
                        </div>
                        ${parcelIntegration.hasParcel ? `
                            <div class="summary-item">
                                <label>Parcel Status:</label>
                                <span>${ParcelUI.getStatusBadge(parcelIntegration.parcelStatus)}</span>
                            </div>
                            <div class="summary-item">
                                <label>Delivery Progress:</label>
                                <div class="progress-display">
                                    <div class="progress-bar">
                                        <div class="progress-fill ${ParcelUI.getProgressClass(parcelIntegration.deliveryProgress)}" 
                                             style="width: ${parcelIntegration.deliveryProgress}%"></div>
                                    </div>
                                    <span>${parcelIntegration.deliveryProgress}%</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

// Export classes for use in other files
window.TicketParcelIntegration = TicketParcelIntegration;
window.ParcelUI = ParcelUI;
window.EnhancedTicketDisplay = EnhancedTicketDisplay;
