/**
 * Interstate Compliance Solutions
 * Main JavaScript File
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initMobileMenu();
    initFaqAccordion();
    initFormValidation();
    initSmoothScroll();
    initNavScroll();
    initFileUpload();
});

/**
 * Mobile Menu Toggle
 */
function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');

            // Update aria-expanded
            const isExpanded = !mobileMenu.classList.contains('hidden');
            menuBtn.setAttribute('aria-expanded', isExpanded);

            // Toggle hamburger/close icon
            const icon = menuBtn.querySelector('svg');
            if (isExpanded) {
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
            } else {
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>';
            }
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!menuBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
                mobileMenu.classList.add('hidden');
                menuBtn.setAttribute('aria-expanded', 'false');
                const icon = menuBtn.querySelector('svg');
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>';
            }
        });
    }
}

/**
 * FAQ Accordion
 */
function initFaqAccordion() {
    const faqToggles = document.querySelectorAll('.faq-toggle');

    faqToggles.forEach(function(toggle) {
        toggle.addEventListener('click', function() {
            const content = this.nextElementSibling;
            const icon = this.querySelector('.faq-icon');
            const isOpen = !content.classList.contains('hidden');

            // Close all other FAQs
            faqToggles.forEach(function(otherToggle) {
                if (otherToggle !== toggle) {
                    const otherContent = otherToggle.nextElementSibling;
                    const otherIcon = otherToggle.querySelector('.faq-icon');
                    otherContent.classList.add('hidden');
                    otherContent.classList.remove('active');
                    otherIcon.classList.remove('rotate');
                }
            });

            // Toggle current FAQ
            if (isOpen) {
                content.classList.add('hidden');
                content.classList.remove('active');
                icon.classList.remove('rotate');
            } else {
                content.classList.remove('hidden');
                content.classList.add('active');
                icon.classList.add('rotate');
            }
        });
    });
}

/**
 * Form Validation
 */
function initFormValidation() {
    const forms = document.querySelectorAll('form[data-validate]');

    forms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            // Clear previous errors
            clearErrors(form);

            // Validate form
            const isValid = validateForm(form);

            if (isValid) {
                // Show success message
                showToast('Form submitted successfully!', 'success');

                // In production, you would submit the form here
                // form.submit();

                // For demo, just reset the form
                form.reset();
            }
        });

        // Real-time validation
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(function(input) {
            input.addEventListener('blur', function() {
                validateField(input);
            });

            input.addEventListener('input', function() {
                // Clear error on input
                const errorElement = document.getElementById(input.id + '-error');
                if (errorElement) {
                    errorElement.remove();
                }
                input.classList.remove('input-error');
            });
        });
    });
}

/**
 * Validate entire form
 */
function validateForm(form) {
    let isValid = true;
    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(function(input) {
        if (!validateField(input)) {
            isValid = false;
        }
    });

    return isValid;
}

/**
 * Validate individual field
 */
function validateField(input) {
    const value = input.value.trim();
    let isValid = true;
    let errorMessage = '';

    // Required field validation
    if (input.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = 'This field is required';
    }

    // Email validation
    if (input.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address';
        }
    }

    // Phone validation
    if (input.type === 'tel' && value) {
        const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
        if (!phoneRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid phone number';
        }
    }

    // MC Number validation
    if (input.dataset.type === 'mc-number' && value) {
        const mcRegex = /^MC-?\d{4,8}$/i;
        if (!mcRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid MC number (e.g., MC-123456)';
        }
    }

    // USDOT Number validation
    if (input.dataset.type === 'usdot-number' && value) {
        const usdotRegex = /^\d{5,8}$/;
        if (!usdotRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid USDOT number (5-8 digits)';
        }
    }

    // Checkbox group validation
    if (input.type === 'checkbox' && input.hasAttribute('required')) {
        const checkboxGroup = input.closest('.checkbox-group');
        if (checkboxGroup) {
            const checked = checkboxGroup.querySelectorAll('input:checked').length;
            if (checked === 0) {
                isValid = false;
                errorMessage = 'Please select at least one option';
            }
        }
    }

    // Min length validation
    if (input.minLength && value.length < input.minLength) {
        isValid = false;
        errorMessage = `Minimum ${input.minLength} characters required`;
    }

    // Show/hide error
    if (!isValid) {
        showFieldError(input, errorMessage);
    } else {
        clearFieldError(input);
    }

    return isValid;
}

/**
 * Show field error
 */
function showFieldError(input, message) {
    input.classList.add('input-error');

    // Remove existing error
    const existingError = document.getElementById(input.id + '-error');
    if (existingError) {
        existingError.remove();
    }

    // Add error message
    const errorElement = document.createElement('p');
    errorElement.id = input.id + '-error';
    errorElement.className = 'error-message';
    errorElement.textContent = message;

    input.parentNode.appendChild(errorElement);
}

/**
 * Clear field error
 */
function clearFieldError(input) {
    input.classList.remove('input-error');
    const errorElement = document.getElementById(input.id + '-error');
    if (errorElement) {
        errorElement.remove();
    }
}

/**
 * Clear all errors in form
 */
function clearErrors(form) {
    const errors = form.querySelectorAll('.error-message');
    errors.forEach(function(error) {
        error.remove();
    });

    const inputs = form.querySelectorAll('.input-error');
    inputs.forEach(function(input) {
        input.classList.remove('input-error');
    });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Show toast
    setTimeout(function() {
        toast.classList.add('show');
    }, 100);

    // Hide and remove toast
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() {
            toast.remove();
        }, 300);
    }, 4000);
}

/**
 * Smooth scroll for anchor links
 */
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach(function(link) {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();

                // Close mobile menu if open
                const mobileMenu = document.getElementById('mobile-menu');
                if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                    mobileMenu.classList.add('hidden');
                }

                // Scroll to target
                const headerHeight = document.querySelector('nav').offsetHeight;
                const targetPosition = target.offsetTop - headerHeight - 20;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Navigation scroll effect
 */
function initNavScroll() {
    const nav = document.querySelector('nav');
    let lastScroll = 0;

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 50) {
            nav.classList.add('nav-scrolled');
        } else {
            nav.classList.remove('nav-scrolled');
        }

        lastScroll = currentScroll;
    });
}

/**
 * File upload preview
 */
function initFileUpload() {
    const fileInputs = document.querySelectorAll('input[type="file"]');

    fileInputs.forEach(function(input) {
        input.addEventListener('change', function(e) {
            const files = e.target.files;
            const label = this.closest('.file-upload').querySelector('.file-upload-label');
            const preview = this.closest('.file-upload').querySelector('.file-preview');

            if (files.length > 0) {
                const fileNames = Array.from(files).map(f => f.name).join(', ');

                if (preview) {
                    preview.textContent = fileNames;
                    preview.classList.remove('hidden');
                }

                label.classList.add('has-files');
            } else {
                if (preview) {
                    preview.textContent = '';
                    preview.classList.add('hidden');
                }
                label.classList.remove('has-files');
            }
        });
    });
}

/**
 * Format phone number as user types
 */
function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');

    if (value.length > 0) {
        if (value.length <= 3) {
            value = '(' + value;
        } else if (value.length <= 6) {
            value = '(' + value.slice(0, 3) + ') ' + value.slice(3);
        } else {
            value = '(' + value.slice(0, 3) + ') ' + value.slice(3, 6) + '-' + value.slice(6, 10);
        }
    }

    input.value = value;
}

/**
 * Format MC number as user types
 */
function formatMCNumber(input) {
    let value = input.value.replace(/[^0-9MC-]/gi, '').toUpperCase();

    if (value && !value.startsWith('MC')) {
        value = 'MC-' + value.replace(/MC-?/gi, '');
    }

    input.value = value;
}

/**
 * Price formatter
 */
function formatPrice(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Debounce function for search/input
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Checkbox group - select all functionality
 */
function initSelectAll() {
    const selectAllCheckboxes = document.querySelectorAll('[data-select-all]');

    selectAllCheckboxes.forEach(function(checkbox) {
        checkbox.addEventListener('change', function() {
            const groupName = this.dataset.selectAll;
            const group = document.querySelectorAll(`input[name="${groupName}"]`);

            group.forEach(function(cb) {
                cb.checked = checkbox.checked;
            });
        });
    });
}

/**
 * Form step navigation (for multi-step forms)
 */
function initFormSteps() {
    const forms = document.querySelectorAll('[data-multi-step]');

    forms.forEach(function(form) {
        const steps = form.querySelectorAll('.form-step');
        const nextBtns = form.querySelectorAll('[data-next]');
        const prevBtns = form.querySelectorAll('[data-prev]');
        const progressBar = form.querySelector('.progress-bar-fill');
        let currentStep = 0;

        function showStep(step) {
            steps.forEach(function(s, i) {
                s.classList.toggle('hidden', i !== step);
            });

            // Update progress
            if (progressBar) {
                const progress = ((step + 1) / steps.length) * 100;
                progressBar.style.width = progress + '%';
            }

            currentStep = step;
        }

        nextBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                // Validate current step before proceeding
                const currentStepEl = steps[currentStep];
                const inputs = currentStepEl.querySelectorAll('input, select, textarea');
                let isValid = true;

                inputs.forEach(function(input) {
                    if (!validateField(input)) {
                        isValid = false;
                    }
                });

                if (isValid && currentStep < steps.length - 1) {
                    showStep(currentStep + 1);
                }
            });
        });

        prevBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (currentStep > 0) {
                    showStep(currentStep - 1);
                }
            });
        });

        // Initialize first step
        showStep(0);
    });
}

/**
 * Copy to clipboard functionality
 */
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
            showToast('Copied to clipboard!', 'success');
        }).catch(function() {
            showToast('Failed to copy', 'error');
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Copied to clipboard!', 'success');
        } catch (err) {
            showToast('Failed to copy', 'error');
        }
        document.body.removeChild(textArea);
    }
}

/**
 * Calculate bundle savings
 */
function calculateSavings(regularPrice, bundlePrice) {
    const savings = regularPrice - bundlePrice;
    const percentage = Math.round((savings / regularPrice) * 100);
    return {
        amount: savings,
        percentage: percentage
    };
}

// Export functions for use in inline scripts
window.InterstateCompliance = {
    showToast: showToast,
    validateForm: validateForm,
    formatPhoneNumber: formatPhoneNumber,
    formatMCNumber: formatMCNumber,
    copyToClipboard: copyToClipboard,
    calculateSavings: calculateSavings
};
