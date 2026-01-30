/**
 * Payment Module
 * Handles Square payment integration
 */

const Payment = {
    // Square app ID (set from environment or config)
    appId: null,
    locationId: null,
    environment: 'production',

    // Square payment instances
    payments: null,
    card: null,

    // Prices (loaded from API)
    prices: {
        arbitration: { amount: 14999, display: '$149.99' },
        tariff: { amount: 34999, display: '$349.99' },
        boc3: { amount: 10999, display: '$109.99' },
        bundle_startup: { amount: 49999, display: '$499.99' },
        bundle_essentials: { amount: 22500, display: '$225.00' },
        bundle_startup_renewal: { amount: 29999, display: '$299.99' },
        bundle_essentials_renewal: { amount: 17900, display: '$179.00' }
    },

    /**
     * Initialize Square payments
     */
    async init(containerId, options = {}) {
        try {
            // Get configuration first (need environment for SDK URL)
            await this.loadConfig();

            // Load Square Web SDK if not already loaded
            if (!window.Square) {
                await this.loadSquareSDK();
            }

            // Initialize payments
            this.payments = window.Square.payments(this.appId, this.locationId);

            // Create card payment
            this.card = await this.payments.card();
            await this.card.attach(`#${containerId}`);

            return true;
        } catch (error) {
            console.error('Failed to initialize Square:', error);
            return false;
        }
    },

    /**
     * Load Square Web SDK
     */
    loadSquareSDK() {
        return new Promise((resolve, reject) => {
            if (window.Square) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            // Use sandbox or production SDK based on environment
            script.src = this.environment === 'sandbox'
                ? 'https://sandbox.web.squarecdn.com/v1/square.js'
                : 'https://web.squarecdn.com/v1/square.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    /**
     * Load payment configuration from server
     */
    async loadConfig() {
        try {
            // Load Square config from server
            const configResponse = await fetch('/api/payments/config');
            if (configResponse.ok) {
                const configData = await configResponse.json();
                if (configData.success && configData.data.configured) {
                    this.appId = configData.data.applicationId;
                    this.locationId = configData.data.locationId;
                    this.environment = configData.data.environment || 'production';
                }
            }

            // Load current prices
            const response = await fetch('/api/payments/prices');
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.prices = data.data.prices;
                }
            }
        } catch (error) {
            console.error('Failed to load payment config:', error);
        }
    },

    /**
     * Process payment
     */
    async processPayment(productType, options = {}) {
        if (!this.card) {
            throw new Error('Payment not initialized');
        }

        try {
            // Tokenize card
            const result = await this.card.tokenize();

            if (result.status !== 'OK') {
                throw new Error(result.errors?.[0]?.message || 'Card tokenization failed');
            }

            // Send to server
            const response = await Auth.request('/payments/process', {
                method: 'POST',
                body: JSON.stringify({
                    source_id: result.token,
                    product_type: productType,
                    verification_token: result.verificationToken,
                    ...options
                })
            });

            return response;
        } catch (error) {
            console.error('Payment processing error:', error);
            return {
                success: false,
                message: error.message || 'Payment failed'
            };
        }
    },

    /**
     * Get price for product
     */
    getPrice(productType) {
        return this.prices[productType] || null;
    },

    /**
     * Format price for display
     */
    formatPrice(cents) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(cents / 100);
    },

    /**
     * Calculate bundle savings
     */
    calculateSavings(bundleType) {
        const bundles = {
            startup: {
                includes: ['arbitration', 'tariff', 'boc3'],
                price: 49999  // $499.99
            },
            essentials: {
                includes: ['arbitration', 'boc3'],
                price: 22500  // $225.00
            },
            startup_renewal: {
                includes: ['arbitration', 'tariff', 'boc3'],
                price: 29999  // $299.99
            },
            essentials_renewal: {
                includes: ['arbitration', 'boc3'],
                price: 17900  // $179.00
            }
        };

        const bundle = bundles[bundleType];
        if (!bundle) return null;

        const individualTotal = bundle.includes.reduce((sum, item) => {
            return sum + (this.prices[item]?.amount || 0);
        }, 0);

        return {
            individual: individualTotal,
            bundle: bundle.price,
            savings: individualTotal - bundle.price,
            savingsPercent: Math.round(((individualTotal - bundle.price) / individualTotal) * 100)
        };
    },

    /**
     * Destroy payment form
     */
    async destroy() {
        if (this.card) {
            await this.card.destroy();
            this.card = null;
        }
    }
};

// Export
window.Payment = Payment;
