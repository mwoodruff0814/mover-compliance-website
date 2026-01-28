/**
 * Dashboard Module
 * Handles dashboard data loading, real-time updates via SSE, and UI interactions
 */

const Dashboard = {
    // SSE connection
    eventSource: null,

    // Data cache
    data: {
        overview: null,
        documents: null,
        orders: null
    },

    /**
     * Initialize dashboard
     */
    async init() {
        // Check authentication
        if (!Auth.requireAuth()) return;

        // Load user info into sidebar
        this.loadUserInfo();

        // Initialize navigation
        this.initNavigation();

        // Initialize sidebar toggle
        this.initSidebar();

        // Load dashboard data
        await this.loadDashboardData();

        // Connect to SSE for real-time updates
        this.connectSSE();

        // Initialize forms
        this.initForms();
    },

    /**
     * Load user info into sidebar
     */
    loadUserInfo() {
        const user = Auth.getUser();
        if (user) {
            document.getElementById('user-company').textContent = user.company_name || 'Company';
            document.getElementById('user-mc').textContent = user.mc_number || 'No MC#';

            // Set initials
            const initials = (user.company_name || 'U')
                .split(' ')
                .map(w => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();
            document.getElementById('user-initials').textContent = initials;
        }
    },

    /**
     * Initialize sidebar navigation
     */
    initNavigation() {
        const links = document.querySelectorAll('.sidebar-link[data-section]');
        const sections = document.querySelectorAll('[id^="section-"]');

        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();

                // Update active state
                links.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // Scroll to section
                const sectionId = 'section-' + link.dataset.section;
                const section = document.getElementById(sectionId);
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth' });
                }

                // Update page title
                document.getElementById('page-title').textContent =
                    link.textContent.trim() || 'Dashboard';

                // Close mobile sidebar
                this.closeSidebar();
            });
        });
    },

    /**
     * Initialize sidebar toggle for mobile
     */
    initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const openBtn = document.getElementById('open-sidebar');
        const closeBtn = document.getElementById('close-sidebar');

        openBtn?.addEventListener('click', () => this.openSidebar());
        closeBtn?.addEventListener('click', () => this.closeSidebar());
        overlay?.addEventListener('click', () => this.closeSidebar());
    },

    openSidebar() {
        document.getElementById('sidebar').classList.remove('-translate-x-full');
        document.getElementById('sidebar-overlay').classList.remove('hidden');
    },

    closeSidebar() {
        document.getElementById('sidebar').classList.add('-translate-x-full');
        document.getElementById('sidebar-overlay').classList.add('hidden');
    },

    /**
     * Load all dashboard data
     */
    async loadDashboardData() {
        try {
            const [overview, documents, orders] = await Promise.all([
                Auth.request('/dashboard/overview'),
                Auth.request('/dashboard/documents'),
                Auth.request('/dashboard/orders')
            ]);

            // Store data
            this.data.overview = overview.data;
            this.data.documents = documents.data;
            this.data.orders = orders.data;

            // Render dashboard
            this.renderOverview();
            this.renderServices();
            this.renderDocuments();
            this.renderOrders();
            this.loadSettings();

            // Show content, hide loading
            document.getElementById('loading-state').classList.add('hidden');
            document.getElementById('dashboard-content').classList.remove('hidden');

        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showError('Failed to load dashboard data. Please refresh the page.');
        }
    },

    /**
     * Render overview section
     */
    renderOverview() {
        const { overview, renewals } = this.data.overview;

        // Update stats
        document.getElementById('stat-active').textContent = overview.active_services;
        document.getElementById('stat-renewals').textContent = overview.upcoming_renewals;

        // Compliance status
        const complianceEl = document.getElementById('stat-compliance');
        const complianceIcon = document.getElementById('compliance-icon');
        const complianceNote = document.getElementById('compliance-note');

        if (overview.active_services === 3) {
            complianceEl.textContent = 'Fully Compliant';
            complianceEl.className = 'text-xl font-bold text-green-600';
            complianceIcon.className = 'w-12 h-12 bg-green-100 rounded-full flex items-center justify-center';
            complianceNote.textContent = 'All services active';
        } else if (overview.active_services > 0) {
            complianceEl.textContent = 'Partial';
            complianceEl.className = 'text-xl font-bold text-yellow-600';
            complianceIcon.className = 'w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center';
            complianceNote.textContent = `${3 - overview.active_services} service(s) needed`;
        } else {
            complianceEl.textContent = 'Not Enrolled';
            complianceEl.className = 'text-xl font-bold text-red-600';
            complianceIcon.className = 'w-12 h-12 bg-red-100 rounded-full flex items-center justify-center';
            complianceNote.textContent = 'No active services';
        }

        // Renewal alerts
        if (renewals && renewals.length > 0) {
            const alertsDiv = document.getElementById('renewal-alerts');
            const listDiv = document.getElementById('renewal-list');

            listDiv.innerHTML = renewals.map(r => `
                <p class="text-sm text-yellow-700">
                    <strong>${r.service}</strong> expires in ${r.days_remaining} days
                    (${new Date(r.expiry_date).toLocaleDateString()})
                </p>
            `).join('');

            alertsDiv.classList.remove('hidden');
        }
    },

    /**
     * Render services section
     */
    renderServices() {
        const { services } = this.data.overview;

        // Arbitration
        this.renderServiceCard('arb', services.arbitration, {
            activeText: 'Active',
            pendingText: 'Pending',
            expiredText: 'Expired',
            noneText: 'Not Enrolled',
            enrollUrl: '/arbitration-program',
            renewUrl: '/arbitration-program?renew=1'
        });

        // Tariff
        this.renderServiceCard('tariff', services.tariff, {
            completedText: 'Completed',
            pendingText: 'In Progress',
            noneText: 'Not Ordered',
            orderUrl: '/tariff'
        });

        // BOC-3
        this.renderServiceCard('boc3', services.boc3, {
            activeText: 'Active',
            filedText: 'Filed',
            pendingText: 'Processing',
            noneText: 'Not Filed',
            orderUrl: '/boc-3'
        });
    },

    /**
     * Render individual service card
     */
    renderServiceCard(prefix, service, config) {
        const badge = document.getElementById(`${prefix}-status-badge`);
        const details = document.getElementById(`${prefix}-details`);
        const actions = document.getElementById(`${prefix}-actions`);

        // Set badge
        let badgeClass = 'status-badge ';
        let badgeText = '';

        if (service.active || service.status === 'active' || service.status === 'filed') {
            badgeClass += 'status-active';
            badgeText = config.activeText || config.filedText || 'Active';
        } else if (service.status === 'completed') {
            badgeClass += 'status-active';
            badgeText = config.completedText || 'Completed';
        } else if (service.status === 'pending' || service.status === 'in_progress') {
            badgeClass += 'status-pending';
            badgeText = config.pendingText || 'Pending';
        } else if (service.status === 'expired') {
            badgeClass += 'status-expired';
            badgeText = config.expiredText || 'Expired';
        } else {
            badgeClass += 'status-none';
            badgeText = config.noneText || 'None';
        }

        badge.className = badgeClass;
        badge.textContent = badgeText;

        // Set details
        let detailsHtml = '';

        if (prefix === 'arb') {
            if (service.active) {
                detailsHtml = `
                    <p>Enrolled: ${new Date(service.enrolled_date).toLocaleDateString()}</p>
                    <p>Expires: ${new Date(service.expiry_date).toLocaleDateString()}</p>
                `;
            } else if (service.status === 'expired') {
                detailsHtml = '<p class="text-red-600">Your enrollment has expired. Renew to stay compliant.</p>';
            } else {
                detailsHtml = '<p>FMCSA-required arbitration program for interstate movers.</p>';
            }
        } else if (prefix === 'tariff') {
            if (service.status === 'completed') {
                detailsHtml = `<p>Document created: ${new Date(service.created_at).toLocaleDateString()}</p>`;
            } else if (service.status === 'pending' || service.status === 'in_progress') {
                detailsHtml = '<p>Your tariff document is being prepared.</p>';
            } else {
                detailsHtml = '<p>Custom 30+ page rate document required by FMCSA.</p>';
            }
        } else if (prefix === 'boc3') {
            if (service.active || service.status === 'filed') {
                detailsHtml = `
                    <p>Filing type: ${service.filing_type || 'Standard'}</p>
                    ${service.filed_date ? `<p>Filed: ${new Date(service.filed_date).toLocaleDateString()}</p>` : ''}
                `;
            } else if (service.status === 'pending') {
                detailsHtml = '<p>Your BOC-3 filing is being processed.</p>';
            } else {
                detailsHtml = '<p>Process agent designation for all 50 states.</p>';
            }
        }

        details.innerHTML = detailsHtml;

        // Set actions
        let actionsHtml = '';

        if (prefix === 'arb') {
            if (service.active && service.document_url) {
                actionsHtml = `
                    <a href="${service.document_url}" target="_blank" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Download PDF
                    </a>
                    <a href="${config.renewUrl}" class="flex-1 text-center border border-navy-200 hover:bg-navy-50 text-navy-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Renew
                    </a>
                `;
            } else if (service.status === 'expired') {
                actionsHtml = `
                    <a href="${config.renewUrl}" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Renew Now
                    </a>
                `;
            } else if (!service.active && service.status !== 'pending') {
                actionsHtml = `
                    <a href="${config.enrollUrl}" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Enroll Now
                    </a>
                `;
            }
        } else if (prefix === 'tariff') {
            if (service.status === 'completed' && service.document_url) {
                actionsHtml = `
                    <a href="${service.document_url}" target="_blank" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Download Tariff
                    </a>
                `;
            } else if (service.status !== 'pending' && service.status !== 'in_progress') {
                actionsHtml = `
                    <a href="${config.orderUrl}" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Order Now
                    </a>
                `;
            } else {
                actionsHtml = '<p class="text-sm text-navy-500">Processing...</p>';
            }
        } else if (prefix === 'boc3') {
            if (!service.active && service.status !== 'pending' && service.status !== 'filed') {
                actionsHtml = `
                    <a href="${config.orderUrl}" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        File Now
                    </a>
                `;
            } else if (service.status === 'pending') {
                actionsHtml = '<p class="text-sm text-navy-500">Processing your filing...</p>';
            } else {
                actionsHtml = '<p class="text-sm text-green-600">BOC-3 on file with FMCSA</p>';
            }
        }

        actions.innerHTML = actionsHtml;
    },

    /**
     * Render documents section
     */
    renderDocuments() {
        const { documents } = this.data.documents;
        const container = document.getElementById('documents-list');

        if (!documents || documents.length === 0) {
            container.innerHTML = `
                <div class="p-6 text-center text-navy-500">
                    <svg class="w-12 h-12 mx-auto mb-4 text-navy-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <p>No documents yet</p>
                    <p class="text-sm mt-1">Documents will appear here after you enroll in services.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = documents.map(doc => `
            <div class="flex items-center justify-between p-4 hover:bg-navy-50 transition-colors">
                <div class="flex items-center">
                    <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                        <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                        </svg>
                    </div>
                    <div>
                        <p class="font-medium text-navy-900">${doc.name}</p>
                        <p class="text-sm text-navy-500">Created ${new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                <a href="${doc.document_url}" target="_blank" class="text-gold-600 hover:text-gold-700 font-medium text-sm flex items-center">
                    Download
                    <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                </a>
            </div>
        `).join('');
    },

    /**
     * Render orders section
     */
    renderOrders() {
        const { orders } = this.data.orders;
        const container = document.getElementById('orders-list');

        if (!orders || orders.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-8 text-center text-navy-500">
                        No orders yet. <a href="/pricing" class="text-gold-600 hover:text-gold-700">Get started</a> with our services.
                    </td>
                </tr>
            `;
            return;
        }

        const typeLabels = {
            arbitration: 'Arbitration Program',
            tariff: 'Tariff Publishing',
            boc3: 'BOC-3 Process Agent',
            bundle: 'Bundle'
        };

        const statusClasses = {
            active: 'status-badge status-active',
            completed: 'status-badge status-active',
            filed: 'status-badge status-active',
            pending: 'status-badge status-pending',
            in_progress: 'status-badge status-pending',
            expired: 'status-badge status-expired'
        };

        container.innerHTML = orders.map(order => `
            <tr class="hover:bg-navy-50 transition-colors">
                <td class="px-6 py-4">
                    <p class="font-medium text-navy-900">${order.product || typeLabels[order.type] || order.type}</p>
                </td>
                <td class="px-6 py-4 text-sm text-navy-500">
                    ${new Date(order.created_at).toLocaleDateString()}
                </td>
                <td class="px-6 py-4">
                    <span class="${statusClasses[order.status] || 'status-badge status-none'}">${order.status}</span>
                </td>
                <td class="px-6 py-4 text-sm text-navy-900">
                    ${order.amount_paid ? '$' + parseFloat(order.amount_paid).toFixed(2) : '-'}
                </td>
            </tr>
        `).join('');
    },

    /**
     * Load settings form
     */
    loadSettings() {
        const user = Auth.getUser();
        if (user) {
            document.getElementById('settings-company').value = user.company_name || '';
            document.getElementById('settings-contact').value = user.contact_name || '';
            document.getElementById('settings-email').value = user.email || '';
            document.getElementById('settings-phone').value = user.phone || '';
            document.getElementById('settings-address').value = user.address || '';
            document.getElementById('settings-city').value = user.city || '';
            document.getElementById('settings-state').value = user.state || '';
            document.getElementById('settings-zip').value = user.zip || '';
        }
    },

    /**
     * Initialize forms
     */
    initForms() {
        // Settings form
        document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            const result = await Auth.updateProfile({
                company_name: document.getElementById('settings-company').value,
                contact_name: document.getElementById('settings-contact').value,
                phone: document.getElementById('settings-phone').value,
                address: document.getElementById('settings-address').value,
                city: document.getElementById('settings-city').value,
                state: document.getElementById('settings-state').value,
                zip: document.getElementById('settings-zip').value
            });

            btn.disabled = false;
            btn.textContent = 'Save Changes';

            if (result.success) {
                InterstateCompliance.showToast('Settings saved successfully!', 'success');
                this.loadUserInfo();
            } else {
                InterstateCompliance.showToast(result.message || 'Failed to save settings', 'error');
            }
        });

        // Password form
        document.getElementById('password-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const current = document.getElementById('current-password').value;
            const newPass = document.getElementById('new-password').value;
            const confirm = document.getElementById('confirm-password').value;

            if (newPass !== confirm) {
                InterstateCompliance.showToast('Passwords do not match', 'error');
                return;
            }

            if (newPass.length < 8) {
                InterstateCompliance.showToast('Password must be at least 8 characters', 'error');
                return;
            }

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Updating...';

            const result = await Auth.changePassword(current, newPass);

            btn.disabled = false;
            btn.textContent = 'Update Password';

            if (result.success) {
                InterstateCompliance.showToast('Password updated successfully!', 'success');
                e.target.reset();
            } else {
                InterstateCompliance.showToast(result.message || 'Failed to update password', 'error');
            }
        });
    },

    /**
     * Connect to SSE for real-time updates
     */
    connectSSE() {
        const token = Auth.getToken();
        if (!token) return;

        // Close existing connection
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource(`/api/dashboard/events?token=${token}`);

        this.eventSource.onopen = () => {
            console.log('SSE connected');
            this.updateSSEStatus(true);
        };

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleSSEEvent(data);
            } catch (error) {
                console.error('SSE parse error:', error);
            }
        };

        this.eventSource.onerror = () => {
            console.log('SSE disconnected, reconnecting...');
            this.updateSSEStatus(false);

            // Reconnect after delay
            setTimeout(() => {
                if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
                    this.connectSSE();
                }
            }, 5000);
        };
    },

    /**
     * Update SSE status indicator
     */
    updateSSEStatus(connected) {
        const indicator = document.getElementById('sse-status');
        if (indicator) {
            const dot = indicator.querySelector('span:first-child');
            if (connected) {
                dot.className = 'w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse';
            } else {
                dot.className = 'w-2 h-2 bg-gray-400 rounded-full mr-2';
            }
        }
    },

    /**
     * Handle SSE events
     */
    handleSSEEvent(data) {
        console.log('SSE event:', data);

        switch (data.type) {
            case 'order_status':
                // Refresh relevant section
                this.loadDashboardData();
                InterstateCompliance.showToast(`Order status updated: ${data.status}`, 'success');
                break;

            case 'document_ready':
                // Refresh documents
                this.loadDashboardData();
                InterstateCompliance.showToast('Your document is ready for download!', 'success');
                break;

            case 'renewal_reminder':
                InterstateCompliance.showToast(`Reminder: ${data.service} expires soon`, 'warning');
                break;

            case 'connected':
                console.log('SSE connected:', data.message);
                break;
        }
    },

    /**
     * Show error message
     */
    showError(message) {
        document.getElementById('loading-state').innerHTML = `
            <div class="text-center">
                <svg class="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <p class="text-red-600 font-medium">${message}</p>
                <button onclick="location.reload()" class="mt-4 text-gold-600 hover:text-gold-700 font-medium">
                    Try Again
                </button>
            </div>
        `;
    },

    /**
     * Cleanup on page unload
     */
    cleanup() {
        if (this.eventSource) {
            this.eventSource.close();
        }
    }
};

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', () => {
    Dashboard.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    Dashboard.cleanup();
});

// Export for use in other scripts
window.Dashboard = Dashboard;
