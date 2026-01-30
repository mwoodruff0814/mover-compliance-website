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
        orders: null,
        notifications: [],
        autopay: null,
        history: null,
        bundles: null
    },

    // Notification dropdown open state
    notificationsOpen: false,

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

        // Load notifications
        await this.loadNotifications();

        // Load autopay status
        await this.loadAutopayStatus();

        // Connect to SSE for real-time updates
        this.connectSSE();

        // Close notification dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('notification-dropdown');
            const bell = document.getElementById('notification-bell');
            if (dropdown && !dropdown.contains(e.target) && !bell.contains(e.target)) {
                dropdown.classList.add('hidden');
                this.notificationsOpen = false;
            }
        });

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
            const [overview, documents, orders, history, bundles] = await Promise.all([
                Auth.request('/dashboard/overview'),
                Auth.request('/dashboard/documents'),
                Auth.request('/dashboard/orders'),
                Auth.request('/dashboard/history'),
                Auth.request('/orders/bundles')
            ]);

            // Store data
            this.data.overview = overview.data;
            this.data.documents = documents.data;
            this.data.orders = orders.data;
            this.data.history = history.data;
            this.data.bundles = bundles.data?.orders || [];

            // Render dashboard
            this.renderOverview();
            this.renderServices();
            this.renderBundles();
            this.renderDocuments();
            this.renderOrders();
            this.renderHistory();
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
                detailsHtml = `
                    <p>Document created: ${new Date(service.created_at).toLocaleDateString()}</p>
                    ${service.expiry_date ? `<p>Expires: ${new Date(service.expiry_date).toLocaleDateString()}</p>` : ''}
                `;
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
                    ${service.expiry_date ? `<p>Expires: ${new Date(service.expiry_date).toLocaleDateString()}</p>` : ''}
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
                    <button onclick="Dashboard.openPurchaseModal('arbitration')" class="flex-1 text-center border border-navy-200 hover:bg-navy-50 text-navy-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Renew
                    </button>
                `;
            } else if (service.status === 'expired') {
                actionsHtml = `
                    <button onclick="Dashboard.openPurchaseModal('arbitration')" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Renew Now
                    </button>
                `;
            } else if (!service.active && service.status !== 'pending') {
                actionsHtml = `
                    <button onclick="Dashboard.openPurchaseModal('arbitration')" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Buy Now - $149.99
                    </button>
                `;
            }
        } else if (prefix === 'tariff') {
            if (service.status === 'completed' && service.document_url) {
                actionsHtml = `
                    <a href="${service.document_url}" target="_blank" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Download Tariff
                    </a>
                    <button onclick="Dashboard.openTariffEditModal(${service.id})" class="flex-1 text-center border border-navy-200 hover:bg-navy-50 text-navy-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Edit Rates
                    </button>
                `;
            } else if (service.status !== 'pending' && service.status !== 'in_progress') {
                actionsHtml = `
                    <button onclick="Dashboard.openPurchaseModal('tariff')" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Buy Now - $349.99
                    </button>
                `;
            } else {
                actionsHtml = '<p class="text-sm text-navy-500">Processing...</p>';
            }
        } else if (prefix === 'boc3') {
            if (!service.active && service.status !== 'pending' && service.status !== 'filed') {
                actionsHtml = `
                    <button onclick="Dashboard.openPurchaseModal('boc3')" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                        Buy Now - $109.99
                    </button>
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
     * Render bundles section
     */
    renderBundles() {
        const bundles = this.data.bundles || [];
        const section = document.getElementById('bundles-section');
        const container = document.getElementById('bundles-list');

        if (!bundles || bundles.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');

        const bundleNames = {
            startup: 'New Authority Startup Bundle',
            essentials: 'Essentials Bundle',
            renewal: 'Renewal Bundle'
        };

        const bundleServices = {
            startup: ['Arbitration Program', 'Tariff Publishing', 'BOC-3 Process Agent'],
            essentials: ['Arbitration Program', 'BOC-3 Process Agent'],
            renewal: ['Arbitration Program', 'BOC-3 Process Agent']
        };

        container.innerHTML = bundles.map(bundle => {
            const isActive = bundle.status === 'active';
            const isExpired = bundle.expiry_date && new Date(bundle.expiry_date) < new Date();
            const daysUntilExpiry = bundle.expiry_date
                ? Math.ceil((new Date(bundle.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
                : null;

            let statusBadge = '';
            if (isExpired) {
                statusBadge = '<span class="status-badge status-expired">Expired</span>';
            } else if (isActive) {
                statusBadge = '<span class="status-badge status-active">Active</span>';
            } else {
                statusBadge = `<span class="status-badge status-pending">${bundle.status}</span>`;
            }

            const services = bundleServices[bundle.bundle_type] || [];

            return `
                <div class="bg-white rounded-xl shadow-sm border border-navy-100 overflow-hidden">
                    <div class="h-2 bg-gradient-to-r from-gold-500 to-gold-400"></div>
                    <div class="p-6">
                        <div class="flex items-start justify-between mb-4">
                            <div class="flex items-center">
                                <div class="w-12 h-12 bg-gold-100 rounded-lg flex items-center justify-center mr-4">
                                    <svg class="w-6 h-6 text-gold-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="font-semibold text-navy-900">${bundleNames[bundle.bundle_type] || 'Bundle'}</h3>
                                    <p class="text-xs text-navy-400 font-mono">${bundle.order_id || 'BDL-' + bundle.id}</p>
                                </div>
                            </div>
                            ${statusBadge}
                        </div>

                        <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                            <div>
                                <p class="text-navy-500">Enrolled</p>
                                <p class="font-medium text-navy-900">${bundle.enrolled_date ? new Date(bundle.enrolled_date).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-navy-500">Expires</p>
                                <p class="font-medium ${isExpired ? 'text-red-600' : daysUntilExpiry && daysUntilExpiry <= 30 ? 'text-yellow-600' : 'text-navy-900'}">
                                    ${bundle.expiry_date ? new Date(bundle.expiry_date).toLocaleDateString() : 'N/A'}
                                    ${daysUntilExpiry && daysUntilExpiry > 0 && daysUntilExpiry <= 30 ? `<span class="text-xs">(${daysUntilExpiry} days)</span>` : ''}
                                </p>
                            </div>
                        </div>

                        <div class="border-t border-navy-100 pt-4 mb-4">
                            <p class="text-sm font-medium text-navy-700 mb-2">Included Services:</p>
                            <div class="space-y-1">
                                ${services.map(service => `
                                    <div class="flex items-center text-sm">
                                        <svg class="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                                        </svg>
                                        <span class="text-navy-600">${service}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="flex gap-2">
                            ${isExpired || (daysUntilExpiry && daysUntilExpiry <= 30) ? `
                                <button onclick="Dashboard.renewBundle(${bundle.id})" class="flex-1 text-center bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                                    Renew Bundle - $179
                                </button>
                            ` : ''}
                            <button onclick="Dashboard.viewBundleDetails(${bundle.id})" class="flex-1 text-center border border-navy-200 hover:bg-navy-50 text-navy-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                                View Details
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Renew a bundle
     */
    async renewBundle(bundleId) {
        if (!confirm('Renew this bundle for $179? This will extend all services for another year.')) return;

        // Check if user has autopay card
        if (this.data.autopay?.has_card && this.data.autopay?.autopay_enabled) {
            // Use autopay card
            try {
                const result = await Auth.request(`/orders/bundles/${bundleId}/renew`, {
                    method: 'POST'
                });

                if (result.success) {
                    InterstateCompliance.showToast('Bundle renewed successfully!', 'success');
                    this.loadDashboardData();
                } else {
                    InterstateCompliance.showToast(result.message || 'Failed to renew bundle', 'error');
                }
            } catch (error) {
                InterstateCompliance.showToast('Failed to renew bundle', 'error');
            }
        } else {
            // Need to collect payment - open modal
            this.currentBundleRenewal = bundleId;
            this.openPurchaseModal('bundle_renewal');
        }
    },

    currentBundleRenewal: null,

    /**
     * View bundle details
     */
    async viewBundleDetails(bundleId) {
        try {
            const result = await Auth.request(`/orders/bundles/${bundleId}`);
            if (result.success) {
                const bundle = result.data.bundle;
                const services = result.data.services;

                let detailsHtml = `
                    <div class="space-y-4">
                        <div>
                            <p class="text-sm text-navy-500">Order ID</p>
                            <p class="font-mono text-navy-900">${bundle.order_id || 'BDL-' + bundle.id}</p>
                        </div>
                        <div>
                            <p class="text-sm text-navy-500">Amount Paid</p>
                            <p class="text-navy-900">$${parseFloat(bundle.amount_paid || 0).toFixed(2)}</p>
                        </div>
                `;

                if (services.arbitration) {
                    detailsHtml += `
                        <div class="border-t pt-4">
                            <p class="font-medium text-navy-800 mb-2">Arbitration Program</p>
                            <p class="text-sm text-navy-600">Status: ${services.arbitration.status}</p>
                            ${services.arbitration.document_url ? `<a href="${services.arbitration.document_url}" target="_blank" class="text-sm text-gold-600 hover:text-gold-700">Download Document</a>` : ''}
                        </div>
                    `;
                }

                if (services.boc3) {
                    detailsHtml += `
                        <div class="border-t pt-4">
                            <p class="font-medium text-navy-800 mb-2">BOC-3 Process Agent</p>
                            <p class="text-sm text-navy-600">Status: ${services.boc3.status}</p>
                            <p class="text-sm text-navy-600">Filing Type: ${services.boc3.filing_type || 'New'}</p>
                        </div>
                    `;
                }

                if (services.tariff) {
                    detailsHtml += `
                        <div class="border-t pt-4">
                            <p class="font-medium text-navy-800 mb-2">Tariff Publishing</p>
                            <p class="text-sm text-navy-600">Status: ${services.tariff.status}</p>
                            ${services.tariff.document_url ? `<a href="${services.tariff.document_url}" target="_blank" class="text-sm text-gold-600 hover:text-gold-700">Download Tariff</a>` : ''}
                        </div>
                    `;
                }

                detailsHtml += '</div>';

                // Show in a simple alert-style modal
                alert('Bundle Details:\n\n' +
                    'Order ID: ' + (bundle.order_id || 'BDL-' + bundle.id) + '\n' +
                    'Type: ' + bundle.bundle_type + '\n' +
                    'Amount: $' + parseFloat(bundle.amount_paid || 0).toFixed(2) + '\n' +
                    'Enrolled: ' + (bundle.enrolled_date ? new Date(bundle.enrolled_date).toLocaleDateString() : 'N/A') + '\n' +
                    'Expires: ' + (bundle.expiry_date ? new Date(bundle.expiry_date).toLocaleDateString() : 'N/A')
                );
            }
        } catch (error) {
            InterstateCompliance.showToast('Failed to load bundle details', 'error');
        }
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
                </button>
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
                        No orders yet. <a href="/pricing" class="text-gold-600 hover:text-gold-700">Get started</button> with our services.
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
     * Render service history
     */
    renderHistory() {
        const history = this.data.history?.history || [];
        const container = document.getElementById('history-list');

        if (!history || history.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-8 text-center text-navy-500">
                        <svg class="w-12 h-12 mx-auto mb-4 text-navy-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <p>No expired services</p>
                        <p class="text-sm mt-1">Your expired services will appear here.</p>
                    </td>
                </tr>
            `;
            return;
        }

        const typeLabels = {
            arbitration: 'Arbitration Program',
            tariff: 'Tariff Publishing',
            boc3: 'BOC-3 Process Agent'
        };

        container.innerHTML = history.map(item => `
            <tr class="hover:bg-navy-50 transition-colors">
                <td class="px-6 py-4">
                    <p class="font-medium text-navy-900">${typeLabels[item.type] || item.type}</p>
                </td>
                <td class="px-6 py-4 text-sm text-red-600">
                    ${item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A'}
                </td>
                <td class="px-6 py-4">
                    ${item.document_url ? `
                        <a href="${item.document_url}" target="_blank" class="text-gold-600 hover:text-gold-700 text-sm font-medium">
                            Download
                        </a>
                    ` : '<span class="text-navy-400 text-sm">-</span>'}
                </td>
                <td class="px-6 py-4">
                    <button onclick="Dashboard.openPurchaseModal('${item.type}')" class="text-sm bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-1.5 px-3 rounded-lg transition-colors">
                        Renew
                    </button>
                </td>
            </tr>
        `).join('');
    },

    /**
     * Load notifications from API
     */
    async loadNotifications() {
        try {
            const result = await Auth.request('/dashboard/notifications');
            if (result.success) {
                this.data.notifications = result.data.notifications || [];
                this.renderNotifications();
                this.updateNotificationBadge();
            }
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    },

    /**
     * Toggle notification dropdown
     */
    toggleNotifications() {
        const dropdown = document.getElementById('notification-dropdown');
        this.notificationsOpen = !this.notificationsOpen;
        if (this.notificationsOpen) {
            dropdown.classList.remove('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
    },

    /**
     * Update notification badge count
     */
    updateNotificationBadge() {
        const badge = document.getElementById('notification-badge');
        const unread = this.data.notifications.filter(n => !n.read).length;
        if (unread > 0) {
            badge.textContent = unread > 9 ? '9+' : unread;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    /**
     * Render notifications in dropdown
     */
    renderNotifications() {
        const container = document.getElementById('notification-list');
        const notifications = this.data.notifications;

        if (!notifications || notifications.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-navy-400 text-sm">No notifications</div>';
            return;
        }

        const serviceLabels = {
            arbitration: 'Arbitration Program',
            tariff: 'Tariff Publishing',
            boc3: 'BOC-3 Filing'
        };

        const typeIcons = {
            expiration_warning: '⚠️',
            autopay_reminder: '💳',
            autopay_success: '✅',
            autopay_failed: '❌',
            tariff_updated: '📄'
        };

        container.innerHTML = notifications.map(n => `
            <div class="p-3 border-b border-navy-100 hover:bg-navy-50 cursor-pointer ${n.read ? 'opacity-60' : ''}"
                 onclick="Dashboard.markNotificationRead(${n.id})">
                <div class="flex items-start">
                    <span class="text-lg mr-2">${typeIcons[n.type] || '🔔'}</span>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-navy-900 ${n.read ? '' : 'font-semibold'}">
                            ${serviceLabels[n.service_type] || n.service_type}
                        </p>
                        <p class="text-xs text-navy-600 mt-0.5">${n.message || 'Notification'}</p>
                        <p class="text-xs text-navy-400 mt-1">${this.formatTimeAgo(n.created_at)}</p>
                    </div>
                    ${!n.read ? '<span class="w-2 h-2 bg-gold-500 rounded-full flex-shrink-0"></span>' : ''}
                </div>
            </div>
        `).join('');
    },

    /**
     * Mark single notification as read
     */
    async markNotificationRead(id) {
        try {
            await Auth.request(`/dashboard/notifications/${id}/read`, { method: 'POST' });
            const notification = this.data.notifications.find(n => n.id === id);
            if (notification) {
                notification.read = true;
                this.renderNotifications();
                this.updateNotificationBadge();
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    },

    /**
     * Mark all notifications as read
     */
    async markAllNotificationsRead() {
        try {
            await Auth.request('/dashboard/notifications/read-all', { method: 'POST' });
            this.data.notifications.forEach(n => n.read = true);
            this.renderNotifications();
            this.updateNotificationBadge();
            InterstateCompliance.showToast('All notifications marked as read', 'success');
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
        }
    },

    /**
     * Format time ago for notifications
     */
    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    },

    /**
     * Load autopay status
     */
    async loadAutopayStatus() {
        try {
            const result = await Auth.request('/autopay/status');
            if (result.success) {
                this.data.autopay = result.data;
                this.renderAutopaySettings();
            }
        } catch (error) {
            console.error('Failed to load autopay status:', error);
        }
    },

    /**
     * Render autopay settings
     */
    renderAutopaySettings() {
        const container = document.getElementById('autopay-settings');
        if (!container) return;

        const autopay = this.data.autopay;
        if (!autopay) return;

        const cardDisplay = autopay.has_card
            ? `${autopay.card_brand || 'Card'} ****${autopay.card_last4}`
            : 'No card on file';

        container.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <div>
                    <p class="text-sm text-navy-600">Automatic renewal for all services</p>
                    <p class="text-xs text-navy-400 mt-1">Card: ${cardDisplay}</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="autopay-toggle" class="sr-only peer"
                           ${autopay.autopay_enabled ? 'checked' : ''}
                           ${!autopay.has_card ? 'disabled' : ''}
                           onchange="Dashboard.toggleAutopay(this.checked)">
                    <div class="w-11 h-6 bg-navy-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gold-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-500 peer-disabled:opacity-50"></div>
                </label>
            </div>
            <div class="flex gap-2">
                ${autopay.has_card ? `
                    <button onclick="Dashboard.openUpdateCardModal()" class="flex-1 text-sm border border-navy-200 hover:bg-navy-50 text-navy-700 font-medium py-2 px-3 rounded-lg transition-colors">
                        Update Card
                    </button>
                    <button onclick="Dashboard.removeAutopayCard()" class="text-sm border border-red-200 hover:bg-red-50 text-red-600 font-medium py-2 px-3 rounded-lg transition-colors">
                        Remove
                    </button>
                ` : `
                    <button onclick="Dashboard.openSetupAutopayModal()" class="flex-1 text-sm bg-gold-500 hover:bg-gold-600 text-navy-900 font-medium py-2 px-3 rounded-lg transition-colors">
                        Set Up Autopay
                    </button>
                `}
            </div>
        `;
    },

    /**
     * Toggle autopay on/off
     */
    async toggleAutopay(enabled) {
        try {
            const result = await Auth.request('/autopay/toggle', {
                method: 'POST',
                body: JSON.stringify({ enabled })
            });
            if (result.success) {
                this.data.autopay.autopay_enabled = enabled;
                InterstateCompliance.showToast(enabled ? 'Autopay enabled' : 'Autopay disabled', 'success');
            } else {
                // Revert toggle
                document.getElementById('autopay-toggle').checked = !enabled;
                InterstateCompliance.showToast(result.message || 'Failed to update autopay', 'error');
            }
        } catch (error) {
            document.getElementById('autopay-toggle').checked = !enabled;
            InterstateCompliance.showToast('Failed to update autopay', 'error');
        }
    },

    /**
     * Remove autopay card
     */
    async removeAutopayCard() {
        if (!confirm('Remove your card and disable autopay?')) return;
        try {
            const result = await Auth.request('/autopay/remove', { method: 'DELETE' });
            if (result.success) {
                this.data.autopay = { autopay_enabled: false, has_card: false };
                this.renderAutopaySettings();
                InterstateCompliance.showToast('Card removed and autopay disabled', 'success');
            } else {
                InterstateCompliance.showToast(result.message || 'Failed to remove card', 'error');
            }
        } catch (error) {
            InterstateCompliance.showToast('Failed to remove card', 'error');
        }
    },

    /**
     * Open setup autopay modal
     */
    async openSetupAutopayModal() {
        document.getElementById('autopay-modal-title').textContent = 'Set Up Autopay';
        document.getElementById('autopay-modal').classList.remove('hidden');
        document.getElementById('autopay-modal-content').classList.remove('hidden');
        document.getElementById('autopay-modal-success').classList.add('hidden');
        await this.initializeAutopayCard();
    },

    /**
     * Open update card modal
     */
    async openUpdateCardModal() {
        document.getElementById('autopay-modal-title').textContent = 'Update Card';
        document.getElementById('autopay-modal').classList.remove('hidden');
        document.getElementById('autopay-modal-content').classList.remove('hidden');
        document.getElementById('autopay-modal-success').classList.add('hidden');
        await this.initializeAutopayCard();
    },

    /**
     * Close autopay modal
     */
    closeAutopayModal() {
        document.getElementById('autopay-modal').classList.add('hidden');
        if (this.autopayCard) {
            this.autopayCard.destroy();
            this.autopayCard = null;
        }
    },

    autopayCard: null,

    /**
     * Initialize Square card for autopay
     */
    async initializeAutopayCard() {
        const cardContainer = document.getElementById('autopay-card-container');
        cardContainer.innerHTML = '<p class="text-navy-400 text-sm p-4">Loading payment form...</p>';
        try {
            if (!this.square) {
                const configRes = await fetch('/api/payments/config');
                const config = await configRes.json();
                if (!config.success || !config.data.configured) {
                    throw new Error('Payment system not configured');
                }
                this.square = await window.Square.payments(config.data.applicationId, config.data.locationId);
            }
            this.autopayCard = await this.square.card();
            cardContainer.innerHTML = '';
            await this.autopayCard.attach('#autopay-card-container');
            document.getElementById('autopay-save-btn').disabled = false;
        } catch (error) {
            console.error('Square init error:', error);
            cardContainer.innerHTML = '<p class="text-red-600 text-sm p-4">Payment form unavailable.</p>';
        }
    },

    /**
     * Save autopay card
     */
    async saveAutopayCard() {
        if (!this.autopayCard) return;
        const btn = document.getElementById('autopay-save-btn');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
            const result = await this.autopayCard.tokenize();
            if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message || 'Card verification failed');

            const endpoint = this.data.autopay?.has_card ? '/autopay/update-card' : '/autopay/setup';
            const method = this.data.autopay?.has_card ? 'PUT' : 'POST';

            const saveResult = await Auth.request(endpoint, {
                method,
                body: JSON.stringify({
                    source_id: result.token,
                    card_details: {
                        last4: result.details?.card?.last4,
                        brand: result.details?.card?.brand
                    }
                })
            });

            if (!saveResult.success) throw new Error(saveResult.message || 'Failed to save card');

            this.data.autopay = saveResult.data;
            this.renderAutopaySettings();
            document.getElementById('autopay-modal-content').classList.add('hidden');
            document.getElementById('autopay-modal-success').classList.remove('hidden');
        } catch (error) {
            InterstateCompliance.showToast(error.message || 'Failed to save card', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Card';
        }
    },

    // Tariff editing
    editTariffId: null,
    editTariffData: null,

    /**
     * Open tariff edit modal
     */
    async openTariffEditModal(tariffId) {
        this.editTariffId = tariffId;
        document.getElementById('tariff-edit-modal').classList.remove('hidden');
        document.getElementById('tariff-edit-content').innerHTML = '<p class="text-navy-500 text-sm">Loading tariff details...</p>';
        document.getElementById('tariff-edit-actions').classList.add('hidden');
        await this.loadTariffForEdit(tariffId);
    },

    /**
     * Close tariff edit modal
     */
    closeTariffEditModal() {
        document.getElementById('tariff-edit-modal').classList.add('hidden');
        this.editTariffId = null;
        this.editTariffData = null;
    },

    /**
     * Load tariff details for editing
     */
    async loadTariffForEdit(tariffId) {
        try {
            const result = await Auth.request(`/orders/tariff/${tariffId}`);
            if (result.success) {
                // API returns { order: {...}, pending_method_change: {...} }
                const tariff = result.data.order || result.data;
                this.editTariffData = tariff;
                this.renderTariffEditForm(tariff);
                document.getElementById('tariff-edit-actions').classList.remove('hidden');
            } else {
                document.getElementById('tariff-edit-content').innerHTML = '<p class="text-red-600">Failed to load tariff details.</p>';
            }
        } catch (error) {
            console.error('Failed to load tariff:', error);
            document.getElementById('tariff-edit-content').innerHTML = '<p class="text-red-600">Failed to load tariff details.</p>';
        }
    },

    /**
     * Render tariff edit form
     */
    renderTariffEditForm(tariff) {
        const container = document.getElementById('tariff-edit-content');
        const rates = tariff.rates || {};
        const pricingMethod = tariff.pricing_method || rates.pricing_method || 'weight';

        const methodLabels = {
            weight: 'Weight-Based (per lb)',
            cubic: 'Cubic Feet Based',
            flat: 'Flat Rate',
            mixed: 'Mixed/Combination'
        };

        let ratesHtml = '';

        // Show pricing method (read-only - needs admin approval to change)
        ratesHtml += `
            <div class="mb-4 p-3 bg-navy-50 rounded-lg">
                <p class="text-sm text-navy-700"><strong>Pricing Method:</strong> ${methodLabels[pricingMethod] || pricingMethod}</p>
                <p class="text-xs text-navy-500 mt-1">To change your pricing method, click "Request Method Change" below.</p>
            </div>
        `;

        // Render editable rates based on pricing method (show empty form if no rates yet)
        if (pricingMethod === 'weight') {
            ratesHtml += this.renderWeightRatesEdit(rates.transportation || {});
        } else if (pricingMethod === 'cubic') {
            ratesHtml += this.renderCubicRatesEdit(rates.transportation || {});
        } else if (pricingMethod === 'flat') {
            ratesHtml += this.renderFlatRatesEdit(rates.flat || {});
        } else if (pricingMethod === 'mixed') {
            ratesHtml += this.renderWeightRatesEdit(rates.transportation || {});
        }

        // Common rates (loading, unloading, accessorial)
        ratesHtml += this.renderCommonRatesEdit(rates);

        container.innerHTML = ratesHtml;
    },

    /**
     * Render weight-based rates for editing
     */
    renderWeightRatesEdit(transportation) {
        const weights = ['w1000', 'w2000', 'w4000', 'w6000', 'w8000'];
        const weightLabels = { w1000: '1,000 lbs', w2000: '2,000 lbs', w4000: '4,000 lbs', w6000: '6,000 lbs', w8000: '8,000+ lbs' };
        const distances = ['d250', 'd500', 'd1000', 'd1500'];
        const distLabels = { d250: '0-250 mi', d500: '251-500 mi', d1000: '501-1000 mi', d1500: '1000+ mi' };

        let html = `
            <details class="border border-navy-200 rounded bg-white mb-3" open>
                <summary class="px-3 py-2 cursor-pointer text-sm font-medium text-navy-800 hover:bg-navy-50">Transportation Rates (per lb)</summary>
                <div class="p-3 border-t text-xs overflow-x-auto">
                    <table class="w-full text-center">
                        <thead><tr class="bg-navy-100">
                            <th class="p-1 text-navy-700 text-left">Weight</th>
                            ${distances.map(d => `<th class="p-1 text-navy-700">${distLabels[d]}</th>`).join('')}
                        </tr></thead>
                        <tbody>
        `;
        weights.forEach((w, i) => {
            html += `<tr class="${i % 2 ? 'bg-navy-50' : ''}">
                <td class="p-1 text-left font-medium">${weightLabels[w]}</td>
                ${distances.map(d => `
                    <td class="p-1"><input type="number" step="0.01" id="edit-rate-${w}-${d}" class="edit-rate w-14 border rounded px-1 py-0.5 text-center" value="${transportation[w]?.[d] || ''}"></td>
                `).join('')}
            </tr>`;
        });
        html += '</tbody></table></div></details>';
        return html;
    },

    /**
     * Render cubic rates for editing
     */
    renderCubicRatesEdit(transportation) {
        const volumes = ['c300', 'c600', 'c1000', 'c1500'];
        const volLabels = { c300: '0-300 cu ft', c600: '301-600 cu ft', c1000: '601-1000 cu ft', c1500: '1001+ cu ft' };
        const distances = ['d250', 'd500', 'd1000', 'd1500'];
        const distLabels = { d250: '0-250 mi', d500: '251-500 mi', d1000: '501-1000 mi', d1500: '1000+ mi' };

        let html = `
            <details class="border border-navy-200 rounded bg-white mb-3" open>
                <summary class="px-3 py-2 cursor-pointer text-sm font-medium text-navy-800 hover:bg-navy-50">Transportation Rates (per cu ft)</summary>
                <div class="p-3 border-t text-xs overflow-x-auto">
                    <table class="w-full text-center">
                        <thead><tr class="bg-navy-100">
                            <th class="p-1 text-navy-700 text-left">Volume</th>
                            ${distances.map(d => `<th class="p-1 text-navy-700">${distLabels[d]}</th>`).join('')}
                        </tr></thead>
                        <tbody>
        `;
        volumes.forEach((v, i) => {
            html += `<tr class="${i % 2 ? 'bg-navy-50' : ''}">
                <td class="p-1 text-left font-medium">${volLabels[v]}</td>
                ${distances.map(d => `
                    <td class="p-1"><input type="number" step="0.01" id="edit-rate-${v}-${d}" class="edit-rate w-14 border rounded px-1 py-0.5 text-center" value="${transportation[v]?.[d] || ''}"></td>
                `).join('')}
            </tr>`;
        });
        html += '</tbody></table></div></details>';
        return html;
    },

    /**
     * Render flat rates for editing
     */
    renderFlatRatesEdit(flat) {
        const sizes = ['sq1000', 'sq1500', 'sq2500', 'sq3000'];
        const sizeLabels = { sq1000: '0-1,000 sq ft', sq1500: '1,001-1,500 sq ft', sq2500: '1,501-2,500 sq ft', sq3000: '2,500+ sq ft' };
        const distances = ['local', 'd500', 'd1000', 'd1500'];
        const distLabels = { local: 'Local', d500: '0-500 mi', d1000: '500-1000 mi', d1500: '1000+ mi' };

        let html = `
            <details class="border border-navy-200 rounded bg-white mb-3" open>
                <summary class="px-3 py-2 cursor-pointer text-sm font-medium text-navy-800 hover:bg-navy-50">Flat Rates by Square Footage</summary>
                <div class="p-3 border-t text-xs overflow-x-auto">
                    <table class="w-full text-center">
                        <thead><tr class="bg-navy-100">
                            <th class="p-1 text-navy-700 text-left">Square Feet</th>
                            ${distances.map(d => `<th class="p-1 text-navy-700">${distLabels[d]}</th>`).join('')}
                        </tr></thead>
                        <tbody>
        `;
        sizes.forEach((s, i) => {
            html += `<tr class="${i % 2 ? 'bg-navy-50' : ''}">
                <td class="p-1 text-left font-medium">${sizeLabels[s]}</td>
                ${distances.map(d => `
                    <td class="p-1"><input type="number" step="1" id="edit-rate-flat-${s}-${d}" class="edit-rate w-16 border rounded px-1 py-0.5 text-center" value="${flat[s]?.[d] || ''}"></td>
                `).join('')}
            </tr>`;
        });
        html += `</tbody></table>
                <div class="mt-3 pt-3 border-t border-navy-200 grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-navy-600">Overage Threshold (%)</label>
                        <input type="number" step="1" id="edit-rate-flat-overage-threshold" class="edit-rate w-full border rounded px-2 py-1" value="${flat.overage?.threshold_percent || 10}">
                    </div>
                    <div>
                        <label class="text-navy-600">Overage Rate ($/lb)</label>
                        <input type="number" step="0.01" id="edit-rate-flat-overage-rate" class="edit-rate w-full border rounded px-2 py-1" value="${flat.overage?.rate_per_lb || 0.55}">
                    </div>
                </div>
            </div></details>`;
        return html;
    },

    /**
     * Render common rates for editing
     */
    renderCommonRatesEdit(rates) {
        const loading = rates.loading || {};
        const accessorial = rates.accessorial || {};

        return `
            <details class="border border-navy-200 rounded bg-white mb-3">
                <summary class="px-3 py-2 cursor-pointer text-sm font-medium text-navy-800 hover:bg-navy-50">Labor Rates</summary>
                <div class="p-3 border-t text-xs grid grid-cols-3 gap-3">
                    <div>
                        <label class="text-navy-600">Loading ($/man-hr)</label>
                        <input type="number" step="0.01" id="edit-rate-loading" class="edit-rate w-full border rounded px-2 py-1" value="${loading.per_man_hour || ''}">
                    </div>
                    <div>
                        <label class="text-navy-600">Unloading ($/man-hr)</label>
                        <input type="number" step="0.01" id="edit-rate-unloading" class="edit-rate w-full border rounded px-2 py-1" value="${rates.unloading?.per_man_hour || ''}">
                    </div>
                    <div>
                        <label class="text-navy-600">Min Hours</label>
                        <input type="number" step="0.5" id="edit-rate-min-hours" class="edit-rate w-full border rounded px-2 py-1" value="${loading.min_hours || 2}">
                    </div>
                </div>
            </details>
            <details class="border border-navy-200 rounded bg-white mb-3">
                <summary class="px-3 py-2 cursor-pointer text-sm font-medium text-navy-800 hover:bg-navy-50">Accessorial Charges</summary>
                <div class="p-3 border-t text-xs grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-navy-600">Packing ($/box)</label>
                        <input type="number" step="0.01" id="edit-rate-packing" class="edit-rate w-full border rounded px-2 py-1" value="${accessorial.packing || ''}">
                    </div>
                    <div>
                        <label class="text-navy-600">Storage ($/day)</label>
                        <input type="number" step="0.01" id="edit-rate-storage" class="edit-rate w-full border rounded px-2 py-1" value="${accessorial.storage || ''}">
                    </div>
                    <div>
                        <label class="text-navy-600">Stairs ($/flight)</label>
                        <input type="number" step="0.01" id="edit-rate-stairs" class="edit-rate w-full border rounded px-2 py-1" value="${accessorial.stairs || ''}">
                    </div>
                    <div>
                        <label class="text-navy-600">Long Carry ($/100ft)</label>
                        <input type="number" step="0.01" id="edit-rate-longcarry" class="edit-rate w-full border rounded px-2 py-1" value="${accessorial.long_carry || ''}">
                    </div>
                    <div>
                        <label class="text-navy-600">Fuel Surcharge (%)</label>
                        <input type="number" step="0.1" id="edit-rate-fuel" class="edit-rate w-full border rounded px-2 py-1" value="${accessorial.fuel_surcharge || ''}">
                    </div>
                </div>
            </details>
        `;
    },

    /**
     * Save tariff rates
     */
    async saveTariffRates() {
        if (!this.editTariffId || !this.editTariffData) return;

        const btn = document.getElementById('tariff-save-btn');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const pricingMethod = this.editTariffData.pricing_method || this.editTariffData.rates?.pricing_method || 'weight';
            const getVal = (id) => {
                const el = document.getElementById(id);
                return el && el.value ? parseFloat(el.value) : 0;
            };

            const rates = {
                pricing_method: pricingMethod,
                loading: {
                    per_man_hour: getVal('edit-rate-loading'),
                    min_hours: getVal('edit-rate-min-hours') || 2
                },
                unloading: {
                    per_man_hour: getVal('edit-rate-unloading'),
                    min_hours: getVal('edit-rate-min-hours') || 2
                },
                accessorial: {
                    packing: getVal('edit-rate-packing'),
                    storage: getVal('edit-rate-storage'),
                    stairs: getVal('edit-rate-stairs'),
                    long_carry: getVal('edit-rate-longcarry'),
                    fuel_surcharge: getVal('edit-rate-fuel')
                }
            };

            // Add transportation rates based on pricing method
            if (pricingMethod === 'weight') {
                rates.transportation = {};
                ['w1000', 'w2000', 'w4000', 'w6000', 'w8000'].forEach(w => {
                    rates.transportation[w] = {};
                    ['d250', 'd500', 'd1000', 'd1500'].forEach(d => {
                        rates.transportation[w][d] = getVal(`edit-rate-${w}-${d}`);
                    });
                });
            } else if (pricingMethod === 'cubic') {
                rates.transportation = {};
                ['c300', 'c600', 'c1000', 'c1500'].forEach(c => {
                    rates.transportation[c] = {};
                    ['d250', 'd500', 'd1000', 'd1500'].forEach(d => {
                        rates.transportation[c][d] = getVal(`edit-rate-${c}-${d}`);
                    });
                });
            } else if (pricingMethod === 'flat') {
                rates.flat = {};
                ['sq1000', 'sq1500', 'sq2500', 'sq3000'].forEach(s => {
                    rates.flat[s] = {};
                    ['local', 'd500', 'd1000', 'd1500'].forEach(d => {
                        rates.flat[s][d] = getVal(`edit-rate-flat-${s}-${d}`);
                    });
                });
                rates.flat.overage = {
                    threshold_percent: getVal('edit-rate-flat-overage-threshold') || 10,
                    rate_per_lb: getVal('edit-rate-flat-overage-rate') || 0.55
                };
            }

            const result = await Auth.request(`/orders/tariff/${this.editTariffId}/rates`, {
                method: 'PUT',
                body: JSON.stringify({ rates })
            });

            if (result.success) {
                InterstateCompliance.showToast('Tariff updated! New PDF has been generated.', 'success');
                this.closeTariffEditModal();
                this.loadDashboardData();
            } else {
                InterstateCompliance.showToast(result.message || 'Failed to update tariff', 'error');
            }
        } catch (error) {
            console.error('Failed to save tariff:', error);
            InterstateCompliance.showToast('Failed to update tariff', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    },

    /**
     * Request pricing method change
     */
    async requestPricingMethodChange() {
        const currentMethod = this.editTariffData?.pricing_method || this.editTariffData?.rates?.pricing_method || 'weight';
        const methods = {
            weight: 'Weight-Based (per lb)',
            cubic: 'Cubic Feet Based',
            flat: 'Flat Rate',
            mixed: 'Mixed/Combination'
        };

        const otherMethods = Object.entries(methods).filter(([k]) => k !== currentMethod);
        const options = otherMethods.map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

        const newMethod = prompt(`Current method: ${methods[currentMethod]}\n\nSelect new pricing method:\n${otherMethods.map(([k, v], i) => `${i + 1}. ${v}`).join('\n')}\n\nEnter number (1-${otherMethods.length}):`);

        if (!newMethod) return;
        const idx = parseInt(newMethod) - 1;
        if (isNaN(idx) || idx < 0 || idx >= otherMethods.length) {
            InterstateCompliance.showToast('Invalid selection', 'error');
            return;
        }

        const requestedMethod = otherMethods[idx][0];
        const reason = prompt('Please briefly explain why you need to change your pricing method:');
        if (!reason) return;

        try {
            const result = await Auth.request(`/orders/tariff/${this.editTariffId}/request-method-change`, {
                method: 'POST',
                body: JSON.stringify({
                    requested_method: requestedMethod,
                    reason
                })
            });

            if (result.success) {
                InterstateCompliance.showToast('Request submitted! We will review and contact you.', 'success');
                this.closeTariffEditModal();
            } else {
                InterstateCompliance.showToast(result.message || 'Failed to submit request', 'error');
            }
        } catch (error) {
            InterstateCompliance.showToast('Failed to submit request', 'error');
        }
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

            // Only allow email and phone updates (company info requires admin)
            const result = await Auth.updateProfile({
                email: document.getElementById('settings-email').value,
                phone: document.getElementById('settings-phone').value
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

        // Profile change request form
        const changeTypeSelect = document.getElementById('change-type');
        const changeHint = document.getElementById('change-hint');

        changeTypeSelect?.addEventListener('change', (e) => {
            const hints = {
                company_name: 'Enter your new legal company name',
                contact_name: 'Enter the new contact person\'s name',
                address: 'Format: 123 Main St, City, ST 12345'
            };
            if (hints[e.target.value]) {
                changeHint.textContent = hints[e.target.value];
                changeHint.classList.remove('hidden');
            } else {
                changeHint.classList.add('hidden');
            }
        });

        document.getElementById('profile-change-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const changeType = document.getElementById('change-type').value;
            const newValue = document.getElementById('change-new-value').value;
            const reason = document.getElementById('change-reason').value;

            if (!changeType) {
                InterstateCompliance.showToast('Please select what you want to change', 'error');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Submitting...';

            try {
                const result = await Auth.request('/auth/profile/request-change', {
                    method: 'POST',
                    body: JSON.stringify({ change_type: changeType, requested_value: newValue, reason })
                });

                btn.disabled = false;
                btn.textContent = 'Submit Request';

                if (result.success) {
                    InterstateCompliance.showToast('Change request submitted! We\'ll review it shortly.', 'success');
                    e.target.reset();
                    changeHint.classList.add('hidden');
                    this.loadProfileChangeRequests();
                } else {
                    InterstateCompliance.showToast(result.message || 'Failed to submit request', 'error');
                }
            } catch (error) {
                btn.disabled = false;
                btn.textContent = 'Submit Request';
                InterstateCompliance.showToast('Failed to submit request', 'error');
            }
        });

        // Load pending profile change requests
        this.loadProfileChangeRequests();
    },

    /**
     * Load profile change requests
     */
    async loadProfileChangeRequests() {
        try {
            const result = await Auth.request('/auth/profile/requests');
            if (result.success && result.data.requests.length > 0) {
                const pending = result.data.requests.filter(r => r.status === 'pending');
                const container = document.getElementById('pending-profile-requests');
                const list = document.getElementById('profile-requests-list');

                if (pending.length > 0) {
                    container.classList.remove('hidden');
                    const typeLabels = { company_name: 'Company Name', contact_name: 'Contact Name', address: 'Address' };
                    list.innerHTML = pending.map(req => `
                        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                            <div class="flex justify-between">
                                <span class="font-medium text-yellow-800">${typeLabels[req.change_type] || req.change_type}</span>
                                <span class="text-yellow-600 text-xs">Pending</span>
                            </div>
                            <p class="text-yellow-700 mt-1">New: ${req.requested_value}</p>
                        </div>
                    `).join('');
                } else {
                    container.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Failed to load profile requests:', error);
        }
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
                this.loadNotifications();
                break;

            case 'notification':
                // New notification received
                this.loadNotifications();
                InterstateCompliance.showToast(data.message || 'New notification', 'info');
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
    },

    // Square Payment Integration
    square: null,
    card: null,
    currentProduct: null,

    products: {
        arbitration: { name: 'Arbitration Program', price: 14999, display: '$149.99', period: '/year' },
        tariff: { name: 'Tariff Publishing', price: 34999, display: '$349.99', period: '/year' },
        boc3: { name: 'BOC-3 Process Agent', price: 10999, display: '$109.99', period: '/year' },
        bundle_renewal: { name: 'Bundle Renewal', price: 17900, display: '$179.00', period: '/year' }
    },

    async openPurchaseModal(productType) {
        const product = this.products[productType];
        if (!product) return;
        this.currentProduct = productType;
        document.getElementById('purchase-title').textContent = 'Purchase ' + product.name;
        document.getElementById('purchase-description').textContent = 'Complete your purchase below.';
        document.getElementById('purchase-product').textContent = product.name;
        document.getElementById('purchase-price').textContent = product.display + product.period;
        document.getElementById('purchase-btn-text').textContent = 'Pay ' + product.display;
        document.getElementById('purchase-content').classList.remove('hidden');
        document.getElementById('purchase-success').classList.add('hidden');
        document.getElementById('purchase-error').classList.add('hidden');
        document.getElementById('purchase-btn').disabled = true;

        // Show tariff options only for tariff purchases
        const tariffOptions = document.getElementById('tariff-options');
        if (tariffOptions) {
            if (productType === 'tariff') {
                tariffOptions.classList.remove('hidden');
                // Reset to weight-based and show that section
                const pricingSelect = document.getElementById('tariff-pricing-method');
                if (pricingSelect) {
                    pricingSelect.value = 'weight';
                    this.switchPricingMethod('weight');
                }
            } else {
                tariffOptions.classList.add('hidden');
            }
        }

        document.getElementById('purchase-modal').classList.remove('hidden');
        await this.initializeSquare();
    },

    closePurchaseModal() {
        document.getElementById('purchase-modal').classList.add('hidden');
        this.currentProduct = null;
        if (this.card) { this.card.destroy(); this.card = null; }
    },

    switchPricingMethod(method) {
        // Hide all pricing method rate sections
        document.querySelectorAll('.pricing-method-rates').forEach(el => {
            el.classList.add('hidden');
        });
        // Show the selected one
        const targetSection = document.getElementById(`rates-${method}`);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }
    },

    async initializeSquare() {
        const cardContainer = document.getElementById('card-container');
        cardContainer.innerHTML = '<div class="border border-navy-200 rounded-lg p-4 min-h-[50px]"><p class="text-navy-400 text-sm">Loading payment form...</p></div>';
        try {
            if (!this.square) {
                // Fetch config from server
                const configRes = await fetch('/api/payments/config');
                const config = await configRes.json();
                if (!config.success || !config.data.configured) {
                    throw new Error('Payment system not configured');
                }
                // Square SDK is pre-loaded in HTML, just initialize with config
                if (!window.Square) {
                    throw new Error('Square SDK not loaded');
                }
                this.square = await window.Square.payments(config.data.applicationId, config.data.locationId);
            }
            this.card = await this.square.card();
            cardContainer.innerHTML = '';
            await this.card.attach('#card-container');
            document.getElementById('purchase-btn').disabled = false;
        } catch (error) {
            console.error('Square init error:', error);
            cardContainer.innerHTML = '<div class="border border-red-200 rounded-lg p-4"><p class="text-red-600 text-sm">Payment form unavailable.</p></div>';
        }
    },

    async processPurchase() {
        if (!this.card || !this.currentProduct) return;
        const btn = document.getElementById('purchase-btn');
        const btnText = document.getElementById('purchase-btn-text');
        const btnLoading = document.getElementById('purchase-btn-loading');
        const errorDiv = document.getElementById('purchase-error');
        btn.disabled = true;
        btnText.classList.add('hidden');
        btnLoading.classList.remove('hidden');
        errorDiv.classList.add('hidden');
        try {
            const result = await this.card.tokenize();
            if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message || 'Card verification failed');
            const paymentResult = await Auth.request('/payments/process', {
                method: 'POST',
                body: JSON.stringify({ source_id: result.token, product_type: this.currentProduct, buyer_email_address: Auth.getUser()?.email })
            });
            if (!paymentResult.success) throw new Error(paymentResult.message || 'Payment failed');
            let orderResult;
            if (this.currentProduct === 'arbitration') {
                orderResult = await Auth.request('/enrollments', { method: 'POST', body: JSON.stringify({ payment_id: paymentResult.data.payment_id, payment_amount: paymentResult.data.amount / 100 }) });
            } else if (this.currentProduct === 'tariff') {
                // Get tariff customization options from form
                const pricingMethod = document.getElementById('tariff-pricing-method')?.value || 'weight';
                const territory = document.getElementById('tariff-territory')?.value || 'nationwide';
                const accessorialCheckboxes = document.querySelectorAll('.tariff-accessorial:checked');
                const accessorials = Array.from(accessorialCheckboxes).map(cb => cb.value);

                // Collect all rates from the form
                const getRate = (id) => {
                    const el = document.getElementById(id);
                    return el && el.value ? parseFloat(el.value) : 0;
                };

                // Build rates object based on pricing method
                const rates = {
                    pricing_method: pricingMethod,
                    loading: {
                        per_man_hour: getRate('rate-loading'),
                        min_hours: getRate('rate-min-hours') || 2,
                        min_men: getRate('rate-min-men') || 2
                    },
                    unloading: {
                        per_man_hour: getRate('rate-unloading'),
                        min_hours: getRate('rate-min-hours') || 2,
                        min_men: getRate('rate-min-men') || 2
                    },
                    minimums: {
                        local: getRate('rate-min-local'),
                        long_distance: getRate('rate-min-longdist'),
                        hours: getRate('rate-min-hours') || 2
                    },
                    accessorial: {
                        packing: getRate('rate-packing'),
                        storage: getRate('rate-storage'),
                        stairs: getRate('rate-stairs'),
                        long_carry: getRate('rate-longcarry'),
                        shuttle: getRate('rate-shuttle'),
                        waiting: getRate('rate-waiting'),
                        fuel_surcharge: getRate('rate-fuel')
                    },
                    specialty: {
                        piano_upright: getRate('rate-piano-upright'),
                        piano_grand: getRate('rate-piano-grand'),
                        pool_table: getRate('rate-pool-table'),
                        safe: getRate('rate-safe'),
                        gym: getRate('rate-gym'),
                        appliance: getRate('rate-appliance')
                    }
                };

                // Add pricing method specific rates
                if (pricingMethod === 'weight') {
                    rates.transportation = {
                        w1000: { d250: getRate('rate-1000-250'), d500: getRate('rate-1000-500'), d1000: getRate('rate-1000-1000'), d1500: getRate('rate-1000-1500') },
                        w2000: { d250: getRate('rate-2000-250'), d500: getRate('rate-2000-500'), d1000: getRate('rate-2000-1000'), d1500: getRate('rate-2000-1500') },
                        w4000: { d250: getRate('rate-4000-250'), d500: getRate('rate-4000-500'), d1000: getRate('rate-4000-1000'), d1500: getRate('rate-4000-1500') },
                        w6000: { d250: getRate('rate-6000-250'), d500: getRate('rate-6000-500'), d1000: getRate('rate-6000-1000'), d1500: getRate('rate-6000-1500') },
                        w8000: { d250: getRate('rate-8000-250'), d500: getRate('rate-8000-500'), d1000: getRate('rate-8000-1000'), d1500: getRate('rate-8000-1500') }
                    };
                } else if (pricingMethod === 'cubic') {
                    rates.transportation = {
                        c300: { d250: getRate('rate-cubic-300-250'), d500: getRate('rate-cubic-300-500'), d1000: getRate('rate-cubic-300-1000'), d1500: getRate('rate-cubic-300-1500') },
                        c600: { d250: getRate('rate-cubic-600-250'), d500: getRate('rate-cubic-600-500'), d1000: getRate('rate-cubic-600-1000'), d1500: getRate('rate-cubic-600-1500') },
                        c1000: { d250: getRate('rate-cubic-1000-250'), d500: getRate('rate-cubic-1000-500'), d1000: getRate('rate-cubic-1000-1000'), d1500: getRate('rate-cubic-1000-1500') },
                        c1500: { d250: getRate('rate-cubic-1500-250'), d500: getRate('rate-cubic-1500-500'), d1000: getRate('rate-cubic-1500-1000'), d1500: getRate('rate-cubic-1500-1500') }
                    };
                } else if (pricingMethod === 'flat') {
                    rates.flat = {
                        sq1000: { local: getRate('rate-flat-sq1000-local'), d500: getRate('rate-flat-sq1000-500'), d1000: getRate('rate-flat-sq1000-1000'), d1500: getRate('rate-flat-sq1000-1500') },
                        sq1500: { local: getRate('rate-flat-sq1500-local'), d500: getRate('rate-flat-sq1500-500'), d1000: getRate('rate-flat-sq1500-1000'), d1500: getRate('rate-flat-sq1500-1500') },
                        sq2500: { local: getRate('rate-flat-sq2500-local'), d500: getRate('rate-flat-sq2500-500'), d1000: getRate('rate-flat-sq2500-1000'), d1500: getRate('rate-flat-sq2500-1500') },
                        sq3000: { local: getRate('rate-flat-sq3000-local'), d500: getRate('rate-flat-sq3000-500'), d1000: getRate('rate-flat-sq3000-1000'), d1500: getRate('rate-flat-sq3000-1500') },
                        overage: {
                            threshold_percent: getRate('rate-flat-overage-threshold') || 10,
                            rate_per_lb: getRate('rate-flat-overage-rate') || 0.55
                        }
                    };
                } else if (pricingMethod === 'mixed') {
                    rates.mixed = {
                        local: {
                            two_men: getRate('rate-mixed-local-2men'),
                            three_men: getRate('rate-mixed-local-3men')
                        },
                        long_distance: {
                            base_rate: getRate('rate-mixed-ld-base'),
                            min_weight: getRate('rate-mixed-ld-minwt') || 2000
                        }
                    };
                }

                orderResult = await Auth.request('/orders/tariff', {
                    method: 'POST',
                    body: JSON.stringify({
                        pricing_method: pricingMethod,
                        service_territory: territory,
                        accessorials: accessorials.length > 0 ? accessorials : ['packing', 'storage', 'stairs'],
                        rates: rates,
                        payment_id: paymentResult.data.payment_id,
                        payment_amount: paymentResult.data.amount / 100
                    })
                });
            } else if (this.currentProduct === 'boc3') {
                orderResult = await Auth.request('/orders/boc3', { method: 'POST', body: JSON.stringify({ filing_type: 'new_authority', payment_id: paymentResult.data.payment_id, payment_amount: paymentResult.data.amount / 100 }) });
            } else if (this.currentProduct === 'bundle_renewal' && this.currentBundleRenewal) {
                orderResult = await Auth.request(`/orders/bundles/${this.currentBundleRenewal}/renew`, {
                    method: 'POST',
                    body: JSON.stringify({ source_id: result.token })
                });
                this.currentBundleRenewal = null;
            }
            if (!orderResult?.success) throw new Error(orderResult?.message || 'Order creation failed');
            document.getElementById('purchase-content').classList.add('hidden');
            document.getElementById('purchase-success').classList.remove('hidden');
        } catch (error) {
            console.error('Purchase error:', error);
            errorDiv.textContent = error.message || 'Purchase failed.';
            errorDiv.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btnText.classList.remove('hidden');
            btnLoading.classList.add('hidden');
        }
    }
};

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', () => { Dashboard.init(); });
window.addEventListener('beforeunload', () => { Dashboard.cleanup(); });
window.Dashboard = Dashboard;
