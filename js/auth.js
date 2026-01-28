/**
 * Authentication Module
 * Handles user login, registration, logout, and session management
 */

const Auth = {
    // API base URL
    baseUrl: '/api',

    // Storage keys
    TOKEN_KEY: 'ics_token',
    USER_KEY: 'ics_user',

    /**
     * Get stored token
     */
    getToken() {
        return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY);
    },

    /**
     * Get stored user
     */
    getUser() {
        const userStr = localStorage.getItem(this.USER_KEY) || sessionStorage.getItem(this.USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
    },

    /**
     * Store auth data
     */
    setAuth(token, user, remember = false) {
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(this.TOKEN_KEY, token);
        storage.setItem(this.USER_KEY, JSON.stringify(user));
    },

    /**
     * Clear auth data
     */
    clearAuth() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        sessionStorage.removeItem(this.TOKEN_KEY);
        sessionStorage.removeItem(this.USER_KEY);
    },

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return !!this.getToken();
    },

    /**
     * Make authenticated API request
     */
    async request(endpoint, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                headers
            });

            const data = await response.json();

            // Handle token expiration
            if (response.status === 401 && data.message === 'Token expired') {
                this.clearAuth();
                window.location.href = '/login?expired=1';
                return { success: false, message: 'Session expired' };
            }

            return data;
        } catch (error) {
            console.error('API request error:', error);
            return { success: false, message: 'Network error' };
        }
    },

    /**
     * Login user
     */
    async login(email, password, remember = false) {
        const result = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (result.success && result.data) {
            this.setAuth(result.data.token, result.data.user, remember);
        }

        return result;
    },

    /**
     * Register new user
     */
    async register(userData) {
        const result = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        if (result.success && result.data) {
            this.setAuth(result.data.token, result.data.user, true);
        }

        return result;
    },

    /**
     * Logout user
     */
    logout() {
        this.clearAuth();
        window.location.href = '/login';
    },

    /**
     * Get current user from API
     */
    async getCurrentUser() {
        return await this.request('/auth/me');
    },

    /**
     * Update user profile
     */
    async updateProfile(profileData) {
        const result = await this.request('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });

        if (result.success && result.data) {
            const token = this.getToken();
            const remember = !!localStorage.getItem(this.TOKEN_KEY);
            this.setAuth(token, result.data.user, remember);
        }

        return result;
    },

    /**
     * Change password
     */
    async changePassword(currentPassword, newPassword) {
        return await this.request('/auth/password', {
            method: 'PUT',
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
    },

    /**
     * Request password reset
     */
    async forgotPassword(email) {
        return await this.request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    /**
     * Reset password with token
     */
    async resetPassword(token, newPassword) {
        return await this.request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, new_password: newPassword })
        });
    },

    /**
     * Protect page - redirect to login if not authenticated
     */
    requireAuth() {
        if (!this.isLoggedIn()) {
            const currentPage = encodeURIComponent(window.location.pathname);
            window.location.href = `/login?redirect=${currentPage}`;
            return false;
        }
        return true;
    },

    /**
     * Redirect authenticated users away from auth pages
     */
    redirectIfLoggedIn(destination = '/dashboard') {
        if (this.isLoggedIn()) {
            window.location.href = destination;
            return true;
        }
        return false;
    }
};

// Export for use in other scripts
window.Auth = Auth;
