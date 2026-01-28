// Validation middleware and helper functions

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// MC Number format: MC-XXXXXX or MCXXXXXX (6-7 digits)
const mcNumberRegex = /^MC-?\d{6,7}$/i;

// USDOT Number format: 5-8 digits
const usdotRegex = /^\d{5,8}$/;

// Phone validation (10+ digits)
const phoneRegex = /^[\d\s\-\(\)\+]{10,}$/;

// Validation rules
const validators = {
  required: (value) => {
    if (value === undefined || value === null || value === '') {
      return 'This field is required';
    }
    return null;
  },

  email: (value) => {
    if (value && !emailRegex.test(value)) {
      return 'Please enter a valid email address';
    }
    return null;
  },

  mcNumber: (value) => {
    if (value && !mcNumberRegex.test(value.replace(/\s/g, ''))) {
      return 'Please enter a valid MC number (e.g., MC-123456)';
    }
    return null;
  },

  usdotNumber: (value) => {
    if (value && !usdotRegex.test(value.replace(/\s/g, ''))) {
      return 'Please enter a valid USDOT number (5-8 digits)';
    }
    return null;
  },

  phone: (value) => {
    if (value && !phoneRegex.test(value)) {
      return 'Please enter a valid phone number';
    }
    return null;
  },

  minLength: (min) => (value) => {
    if (value && value.length < min) {
      return `Must be at least ${min} characters`;
    }
    return null;
  },

  maxLength: (max) => (value) => {
    if (value && value.length > max) {
      return `Must be no more than ${max} characters`;
    }
    return null;
  },

  password: (value) => {
    if (value && value.length < 8) {
      return 'Password must be at least 8 characters';
    }
    return null;
  }
};

// Validate request body against a schema
const validateRequest = (schema) => {
  return (req, res, next) => {
    const errors = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      for (const rule of rules) {
        let error;

        if (typeof rule === 'string') {
          error = validators[rule](value);
        } else if (typeof rule === 'function') {
          error = rule(value);
        }

        if (error) {
          errors[field] = error;
          break; // Stop at first error for this field
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    next();
  };
};

// Common validation schemas
const schemas = {
  register: {
    email: ['required', 'email'],
    password: ['required', 'password'],
    company_name: ['required', validators.minLength(2)],
    mc_number: ['mcNumber'],
    usdot_number: ['usdotNumber']
  },

  login: {
    email: ['required', 'email'],
    password: ['required']
  },

  enrollment: {
    company_name: ['required'],
    mc_number: ['required', 'mcNumber'],
    usdot_number: ['required', 'usdotNumber'],
    email: ['required', 'email'],
    phone: ['required', 'phone']
  },

  tariffOrder: {
    pricing_method: ['required'],
    service_territory: ['required']
  },

  boc3Order: {
    filing_type: ['required'],
    company_name: ['required'],
    mc_number: ['required', 'mcNumber'],
    usdot_number: ['required', 'usdotNumber']
  },

  verification: {
    consumer_name: ['required'],
    consumer_email: ['required', 'email'],
    mover_mc_number: ['required', 'mcNumber']
  },

  contact: {
    name: ['required'],
    email: ['required', 'email'],
    message: ['required', validators.minLength(10)]
  }
};

// Sanitize string input
const sanitize = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
};

// Sanitize request body
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitize(req.body[key]);
      }
    }
  }
  next();
};

// Format MC number consistently
const formatMCNumber = (mc) => {
  if (!mc) return null;
  const digits = mc.replace(/\D/g, '');
  return `MC-${digits}`;
};

// Format USDOT number consistently
const formatUSDOT = (usdot) => {
  if (!usdot) return null;
  return usdot.replace(/\D/g, '');
};

module.exports = {
  validators,
  validateRequest,
  schemas,
  sanitize,
  sanitizeBody,
  formatMCNumber,
  formatUSDOT
};
