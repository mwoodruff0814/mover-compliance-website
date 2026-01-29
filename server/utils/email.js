const nodemailer = require('nodemailer');

// Admin email for notifications
const ADMIN_EMAIL = 'matt@worryfreemovers.com';

// Create transporter - using Gmail service for better reliability
const createTransporter = () => {
  // Use Gmail service (simpler and more reliable than host/port)
  if (process.env.EMAIL_HOST === 'smtp.gmail.com' || !process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  // Fallback to custom SMTP
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Get formatted "from" address with display name
const getFromAddress = () => {
  const displayName = process.env.COMPANY_NAME || 'Interstate Compliance Solutions';
  const email = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  return `"${displayName}" <${email}>`;
};

// Email templates
const templates = {
  enrollmentConfirmation: (user, enrollment) => ({
    subject: 'Welcome to the Arbitration Program - Interstate Compliance Solutions',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; }
          .content { padding: 30px; background: #f9f9f9; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .details h3 { color: #0a1628; margin-top: 0; }
          .highlight { color: #c9a227; font-weight: bold; }
          .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interstate Compliance Solutions</h1>
            <p>FMCSA Compliance Made Simple</p>
          </div>
          <div class="content">
            <h2>Welcome to the Arbitration Program!</h2>
            <p>Dear ${user.contact_name || user.company_name},</p>
            <p>Thank you for enrolling in our Arbitration Program. Your enrollment is now <span class="highlight">ACTIVE</span>.</p>

            <div class="details">
              <h3>Enrollment Details</h3>
              <p><strong>Company:</strong> ${user.company_name}</p>
              <p><strong>MC Number:</strong> ${user.mc_number}</p>
              <p><strong>USDOT Number:</strong> ${user.usdot_number}</p>
              <p><strong>Enrollment Date:</strong> ${new Date(enrollment.enrolled_date).toLocaleDateString()}</p>
              <p><strong>Expiration Date:</strong> ${new Date(enrollment.expiry_date).toLocaleDateString()}</p>
            </div>

            <h3>What's Next?</h3>
            <ol>
              <li><strong>Download Your Arbitration Summary</strong> - Log in to your dashboard to download the Arbitration Summary document you must provide to customers.</li>
              <li><strong>Provide to Customers</strong> - Give the Arbitration Summary to every shipper BEFORE they sign the Bill of Lading.</li>
              <li><strong>Keep Records</strong> - Maintain a copy for your records and provide upon FMCSA request.</li>
            </ol>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Access Your Dashboard</a>
            </p>

            <p>If you have any questions, please don't hesitate to contact us.</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  orderConfirmation: (user, order, orderType) => {
    const orderNames = {
      tariff: 'Tariff Publishing',
      boc3: 'BOC-3 Process Agent',
      bundle: `${order.bundle_type?.charAt(0).toUpperCase()}${order.bundle_type?.slice(1)} Bundle`
    };

    return {
      subject: `Order Confirmation - ${orderNames[orderType]} - Interstate Compliance Solutions`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; color: #c9a227; }
            .content { padding: 30px; background: #f9f9f9; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .highlight { color: #c9a227; font-weight: bold; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Interstate Compliance Solutions</h1>
            </div>
            <div class="content">
              <h2>Order Confirmation</h2>
              <p>Dear ${user.contact_name || user.company_name},</p>
              <p>Thank you for your order! We have received your request for <span class="highlight">${orderNames[orderType]}</span>.</p>

              <div class="details">
                <h3>Order Details</h3>
                <p><strong>Order ID:</strong> #${order.id}</p>
                <p><strong>Service:</strong> ${orderNames[orderType]}</p>
                <p><strong>Status:</strong> ${order.status}</p>
                <p><strong>Amount:</strong> $${order.amount_paid?.toFixed(2) || 'N/A'}</p>
                <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
              </div>

              <h3>What Happens Next?</h3>
              ${orderType === 'tariff' ? `
                <p>Our team will begin creating your custom Tariff document. This typically takes 3-5 business days. You will receive an email when your document is ready for download.</p>
              ` : orderType === 'boc3' ? `
                <p>We will process your BOC-3 filing with our blanket agent. Filing typically takes 1-2 business days. You will receive confirmation once your BOC-3 is on file with FMCSA.</p>
              ` : `
                <p>We will begin processing all services included in your bundle. You will receive updates as each service is completed.</p>
              `}

              <p>You can track your order status in your dashboard.</p>
            </div>
            <div class="footer">
              <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
              <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'}</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  },

  passwordReset: (email, companyName, token) => {
    // Use Render URL directly until custom domain DNS propagates
    const appUrl = 'https://mover-compliance-website.onrender.com';
    const resetUrl = `${appUrl}/forgot-password?token=${token}`;

    return {
      subject: 'Password Reset Request - Interstate Compliance Solutions',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; color: #c9a227; }
            .content { padding: 30px; background: #f9f9f9; }
            .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Interstate Compliance Solutions</h1>
            </div>
            <div class="content">
              <h2>Password Reset Request</h2>
              <p>Hello${companyName ? ` ${companyName}` : ''},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>

              <p style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>

              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request this, you can safely ignore this email. Your password will not be changed.</p>
            </div>
            <div class="footer">
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p>${resetUrl}</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  },

  contactNotification: (submission) => ({
    subject: `New Contact Form Submission - ${submission.subject}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Reference ID:</strong> #${submission.id}</p>
      <p><strong>Name:</strong> ${submission.name}</p>
      <p><strong>Email:</strong> ${submission.email}</p>
      <p><strong>Phone:</strong> ${submission.phone || 'Not provided'}</p>
      <p><strong>Subject:</strong> ${submission.subject}</p>
      <p><strong>Date:</strong> ${new Date(submission.created_at).toLocaleString()}</p>
      <hr>
      <p><strong>Message:</strong></p>
      <p>${submission.message.replace(/\n/g, '<br>')}</p>
    `
  }),

  contactConfirmation: (name) => ({
    subject: 'We Received Your Message - Interstate Compliance Solutions',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; }
          .content { padding: 30px; background: #f9f9f9; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interstate Compliance Solutions</h1>
          </div>
          <div class="content">
            <h2>Thank You for Contacting Us</h2>
            <p>Dear ${name},</p>
            <p>We have received your message and will get back to you within 24 hours.</p>
            <p>If your matter is urgent, please call us at <strong>${process.env.COMPANY_PHONE || '1-800-555-0199'}</strong>.</p>
            <p>Thank you for your interest in our services!</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  adminNewAccount: (user) => ({
    subject: `New Account Created - ${user.company_name}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 20px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; font-size: 20px; }
          .content { padding: 20px; background: #f9f9f9; }
          .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .label { color: #666; font-size: 12px; text-transform: uppercase; }
          .value { font-weight: bold; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🆕 New Account Created</h1>
          </div>
          <div class="content">
            <p>A new customer account has been created.</p>

            <div class="details">
              <p class="label">Company Name</p>
              <p class="value">${user.company_name}</p>

              <p class="label">Contact Email</p>
              <p class="value">${user.email}</p>

              <p class="label">MC Number</p>
              <p class="value">${user.mc_number || 'Not provided'}</p>

              <p class="label">USDOT Number</p>
              <p class="value">${user.usdot_number || 'Not provided'}</p>

              <p class="label">Phone</p>
              <p class="value">${user.phone || 'Not provided'}</p>

              <p class="label">Created At</p>
              <p class="value">${new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  adminPurchaseNotification: (user, orderType, order) => {
    const orderNames = {
      tariff: 'Tariff Publishing',
      boc3: 'BOC-3 Process Agent',
      arbitration: 'Arbitration Program',
      bundle: `${order.bundle_type?.charAt(0).toUpperCase()}${order.bundle_type?.slice(1)} Bundle`
    };

    return {
      subject: `💰 New Purchase - ${orderNames[orderType]} - ${user.company_name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #22c55e; color: white; padding: 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 20px; }
            .content { padding: 20px; background: #f9f9f9; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .label { color: #666; font-size: 12px; text-transform: uppercase; }
            .value { font-weight: bold; margin-bottom: 10px; }
            .amount { font-size: 24px; color: #22c55e; font-weight: bold; }
            .product { font-size: 18px; color: #c9a227; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💰 New Purchase!</h1>
            </div>
            <div class="content">
              <p style="text-align: center;"><span class="product">${orderNames[orderType]}</span></p>
              <p style="text-align: center;"><span class="amount">$${order.amount_paid?.toFixed(2) || 'N/A'}</span></p>

              <div class="details">
                <p class="label">Customer</p>
                <p class="value">${user.company_name}</p>

                <p class="label">Email</p>
                <p class="value">${user.email}</p>

                <p class="label">MC Number</p>
                <p class="value">${user.mc_number || 'N/A'}</p>

                <p class="label">Order ID</p>
                <p class="value">#${order.id}</p>

                <p class="label">Payment ID</p>
                <p class="value">${order.payment_id || 'N/A'}</p>

                <p class="label">Status</p>
                <p class="value">${order.status}</p>

                <p class="label">Date</p>
                <p class="value">${new Date().toLocaleString()}</p>
              </div>

              ${orderType === 'tariff' ? `
                <div class="details">
                  <p class="label">Tariff Details</p>
                  <p><strong>Pricing Method:</strong> ${order.pricing_method}</p>
                  <p><strong>Service Territory:</strong> ${order.service_territory}</p>
                </div>
              ` : ''}

              ${orderType === 'boc3' ? `
                <div class="details">
                  <p class="label">BOC-3 Details</p>
                  <p><strong>Filing Type:</strong> ${order.filing_type}</p>
                </div>
              ` : ''}
            </div>
          </div>
        </body>
        </html>
      `
    };
  },

  welcomeEmail: (user) => ({
    subject: 'Welcome to Interstate Compliance Solutions!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; }
          .content { padding: 30px; background: #f9f9f9; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .highlight { color: #c9a227; font-weight: bold; }
          .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .services { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .service-item { padding: 10px 0; border-bottom: 1px solid #eee; }
          .service-item:last-child { border-bottom: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interstate Compliance Solutions</h1>
            <p>FMCSA Compliance Made Simple</p>
          </div>
          <div class="content">
            <h2>Welcome, ${user.contact_name || user.company_name}!</h2>
            <p>Thank you for creating an account with Interstate Compliance Solutions. We're here to help you stay compliant with FMCSA regulations.</p>

            <div class="details">
              <h3>Your Account Details</h3>
              <p><strong>Company:</strong> ${user.company_name}</p>
              <p><strong>MC Number:</strong> ${user.mc_number || 'Not provided'}</p>
              <p><strong>USDOT Number:</strong> ${user.usdot_number || 'Not provided'}</p>
              <p><strong>Email:</strong> ${user.email}</p>
            </div>

            <div class="services">
              <h3>Our Services</h3>
              <div class="service-item">
                <strong>Tariff Publishing</strong> - $299<br>
                <small>Custom HHG tariff document compliant with 49 CFR Part 1310</small>
              </div>
              <div class="service-item">
                <strong>BOC-3 Process Agent</strong> - $99/year<br>
                <small>Blanket agent filing for all 50 states + DC</small>
              </div>
              <div class="service-item">
                <strong>Arbitration Program</strong> - $99/year<br>
                <small>FMCSA-compliant dispute resolution program</small>
              </div>
            </div>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Go to Your Dashboard</a>
            </p>

            <p>If you have any questions, don't hesitate to reach out. We're here to help!</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  boc3FilingComplete: (user, order) => ({
    subject: 'Your BOC-3 Filing is Complete! - Interstate Compliance Solutions',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; }
          .content { padding: 30px; background: #f9f9f9; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .success { color: #22c55e; font-weight: bold; }
          .highlight { color: #c9a227; font-weight: bold; }
          .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .info-box { background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #22c55e; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interstate Compliance Solutions</h1>
            <p>FMCSA Compliance Made Simple</p>
          </div>
          <div class="content">
            <h2>Your BOC-3 Filing is <span class="success">Complete!</span></h2>
            <p>Dear ${user.contact_name || user.company_name},</p>
            <p>Great news! Your BOC-3 (Designation of Process Agents) has been successfully filed with the FMCSA.</p>

            <div class="details">
              <h3>Filing Details</h3>
              <p><strong>Company:</strong> ${user.company_name}</p>
              <p><strong>MC Number:</strong> ${user.mc_number}</p>
              <p><strong>USDOT Number:</strong> ${user.usdot_number}</p>
              <p><strong>Filing Type:</strong> ${order.filing_type}</p>
              <p><strong>Status:</strong> <span class="success">Filed with FMCSA</span></p>
              <p><strong>Order ID:</strong> #${order.id}</p>
            </div>

            <div class="info-box">
              <h4 style="margin-top: 0;">What This Means</h4>
              <p>Your BOC-3 is now on file with the Federal Motor Carrier Safety Administration. This filing designates process agents in all 50 states plus Washington D.C. who can receive legal documents on your behalf.</p>
              <p><strong>No action is required on your part.</strong> Your BOC-3 will remain active for as long as you maintain your account.</p>
            </div>

            ${order.document_url ? `
              <p style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Download Your BOC-3 Confirmation</a>
              </p>
            ` : ''}

            <p>If you have any questions about your BOC-3 filing, please don't hesitate to contact us.</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  documentReady: (user, orderType, order) => {
    const orderNames = {
      tariff: 'Tariff Document',
      boc3: 'BOC-3 Confirmation',
      arbitration: 'Arbitration Program Documents'
    };

    return {
      subject: `Your ${orderNames[orderType]} is Ready! - Interstate Compliance Solutions`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; color: #c9a227; }
            .content { padding: 30px; background: #f9f9f9; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .success { color: #22c55e; font-weight: bold; }
            .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .attachment-notice { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #c9a227; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Interstate Compliance Solutions</h1>
              <p>FMCSA Compliance Made Simple</p>
            </div>
            <div class="content">
              <h2>Your ${orderNames[orderType]} is <span class="success">Ready!</span></h2>
              <p>Dear ${user.contact_name || user.company_name},</p>
              <p>Your document has been prepared and is ready for download.</p>

              <div class="details">
                <h3>Order Details</h3>
                <p><strong>Company:</strong> ${user.company_name}</p>
                <p><strong>MC Number:</strong> ${user.mc_number}</p>
                <p><strong>Document:</strong> ${orderNames[orderType]}</p>
                <p><strong>Order ID:</strong> #${order.id}</p>
                <p><strong>Status:</strong> <span class="success">Completed</span></p>
              </div>

              <div class="attachment-notice">
                <strong>📎 Document Attached</strong><br>
                <small>Your document is attached to this email. You can also download it from your dashboard at any time.</small>
              </div>

              <p style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/dashboard" class="button">View in Dashboard</a>
              </p>

              <p>If you have any questions, please don't hesitate to contact us.</p>
            </div>
            <div class="footer">
              <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
              <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  },

  tariffDocumentReady: (user, order) => ({
    subject: 'Your Tariff Document is Ready! - Interstate Compliance Solutions',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; }
          .content { padding: 30px; background: #f9f9f9; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .details h3 { color: #0a1628; margin-top: 0; }
          .highlight { color: #c9a227; font-weight: bold; }
          .success { color: #22c55e; font-weight: bold; }
          .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .steps { background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .steps h4 { color: #2e7d32; margin-top: 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interstate Compliance Solutions</h1>
            <p>FMCSA Compliance Made Simple</p>
          </div>
          <div class="content">
            <h2>Your Tariff Document is <span class="success">Ready!</span></h2>
            <p>Dear ${user.contact_name || user.company_name},</p>
            <p>Great news! Your custom tariff document has been generated and is ready for download.</p>

            <div class="details">
              <h3>Order Details</h3>
              <p><strong>Company:</strong> ${user.company_name}</p>
              <p><strong>MC Number:</strong> ${user.mc_number}</p>
              <p><strong>Order ID:</strong> #${order.id}</p>
              <p><strong>Status:</strong> <span class="success">Completed</span></p>
              <p><strong>Pricing Method:</strong> ${order.pricing_method}</p>
              <p><strong>Service Territory:</strong> ${order.service_territory}</p>
            </div>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Download Your Tariff</a>
            </p>

            <div class="steps">
              <h4>Next Steps:</h4>
              <ol>
                <li><strong>Download your tariff</strong> - Log in to your dashboard to download the PDF</li>
                <li><strong>Customize your rates</strong> - Fill in the rate tables with your actual rates (marked as XX.XX)</li>
                <li><strong>Print and keep on file</strong> - Maintain a copy at your principal place of business</li>
                <li><strong>Make available for inspection</strong> - You must allow customers to inspect your tariff upon request</li>
              </ol>
            </div>

            <p><strong>Important:</strong> Federal law (49 CFR Part 1310) requires you to maintain a tariff containing your rates, rules, and service terms. This tariff must be available for public inspection.</p>

            <p>If you have any questions about customizing your tariff, please contact us.</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Expiration warning - 30 days
  expirationWarning30: (user, serviceName, expiryDate) => ({
    subject: `Your ${serviceName} expires in 30 days - Interstate Compliance Solutions`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; }
          .content { padding: 30px; background: #f9f9f9; }
          .warning-box { background: #fff3cd; border: 1px solid #ffc107; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interstate Compliance Solutions</h1>
          </div>
          <div class="content">
            <h2>Renewal Reminder</h2>
            <p>Dear ${user.contact_name || user.company_name},</p>

            <div class="warning-box">
              <strong>Your ${serviceName} expires on ${new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
              <p style="margin-bottom: 0;">That's only 30 days away. Renew now to ensure continuous compliance.</p>
            </div>

            <p>To maintain your FMCSA compliance status, please renew your ${serviceName} before the expiration date.</p>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Renew Now</a>
            </p>

            <p>If you have any questions or need assistance, please contact us.</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Expiration warning - 5 days (urgent)
  expirationWarning5: (user, serviceName, expiryDate) => ({
    subject: `URGENT: Your ${serviceName} expires in 5 days - Interstate Compliance Solutions`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #c41e3a; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: white; }
          .content { padding: 30px; background: #f9f9f9; }
          .urgent-box { background: #f8d7da; border: 2px solid #c41e3a; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; background: #c41e3a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>URGENT RENEWAL NOTICE</h1>
          </div>
          <div class="content">
            <h2>Action Required Immediately</h2>
            <p>Dear ${user.contact_name || user.company_name},</p>

            <div class="urgent-box">
              <strong style="color: #c41e3a; font-size: 18px;">Your ${serviceName} expires in 5 DAYS</strong>
              <p><strong>Expiration Date:</strong> ${new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style="margin-bottom: 0;">Failure to renew may result in loss of FMCSA compliance status.</p>
            </div>

            <p><strong>Don't risk operating out of compliance.</strong> Renew your ${serviceName} today to avoid any interruption in service.</p>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">RENEW NOW</a>
            </p>

            <p>Need help? Contact us immediately at ${process.env.COMPANY_PHONE || '1-800-555-0199'}.</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Autopay reminder - 10 days before
  autopayReminder10: (user, serviceName, chargeDate, amount, cardLast4, cardBrand) => ({
    subject: `Upcoming Autopay: ${serviceName} renewal in 10 days - Interstate Compliance Solutions`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; }
          .content { padding: 30px; background: #f9f9f9; }
          .info-box { background: #e8f4f8; border: 1px solid #17a2b8; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .payment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
          .button { display: inline-block; background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; margin: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interstate Compliance Solutions</h1>
            <p>Autopay Notification</p>
          </div>
          <div class="content">
            <h2>Upcoming Automatic Renewal</h2>
            <p>Dear ${user.contact_name || user.company_name},</p>

            <div class="info-box">
              <p style="margin: 0;"><strong>Your ${serviceName} will be automatically renewed in 10 days.</strong></p>
            </div>

            <div class="payment-details">
              <h3 style="margin-top: 0;">Payment Details</h3>
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>Charge Date:</strong> ${new Date(chargeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p><strong>Amount:</strong> $${(amount / 100).toFixed(2)}</p>
              <p><strong>Payment Method:</strong> ${cardBrand || 'Card'} ending in ${cardLast4 || '****'}</p>
            </div>

            <p>No action is required - your service will continue uninterrupted. If you need to update your payment method or cancel autopay, you can do so from your dashboard.</p>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Manage Autopay Settings</a>
            </p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Autopay success
  autopaySuccess: (user, serviceName, amount, newExpiryDate, cardLast4) => ({
    subject: `Renewal Successful: ${serviceName} - Interstate Compliance Solutions`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; }
          .content { padding: 30px; background: #f9f9f9; }
          .success-box { background: #d4edda; border: 1px solid #28a745; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .receipt { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
          .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Renewal Successful!</h1>
          </div>
          <div class="content">
            <p>Dear ${user.contact_name || user.company_name},</p>

            <div class="success-box">
              <strong>Your ${serviceName} has been successfully renewed!</strong>
              <p style="margin-bottom: 0;">Your compliance status remains active with no interruption in service.</p>
            </div>

            <div class="receipt">
              <h3 style="margin-top: 0;">Receipt</h3>
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>Amount Charged:</strong> $${(amount / 100).toFixed(2)}</p>
              <p><strong>Payment Method:</strong> Card ending in ${cardLast4 || '****'}</p>
              <p><strong>New Expiration Date:</strong> ${new Date(newExpiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <p>Your updated documents are available in your dashboard.</p>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">View Dashboard</a>
            </p>

            <p>Thank you for your continued trust in Interstate Compliance Solutions.</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Autopay failed
  autopayFailed: (user, serviceName, reason, expiryDate) => ({
    subject: `ACTION REQUIRED: ${serviceName} renewal payment failed - Interstate Compliance Solutions`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #c41e3a; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; }
          .content { padding: 30px; background: #f9f9f9; }
          .error-box { background: #f8d7da; border: 2px solid #c41e3a; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; background: #c41e3a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .button-secondary { display: inline-block; background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Failed</h1>
          </div>
          <div class="content">
            <h2>Action Required</h2>
            <p>Dear ${user.contact_name || user.company_name},</p>

            <div class="error-box">
              <strong>We were unable to process your automatic renewal payment for ${serviceName}.</strong>
              <p><strong>Reason:</strong> ${reason || 'Payment declined'}</p>
              <p style="margin-bottom: 0;"><strong>Service Expires:</strong> ${new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <h3>What to do:</h3>
            <ol>
              <li><strong>Update your payment method</strong> - Your card may have expired or been replaced</li>
              <li><strong>Ensure sufficient funds</strong> - Check that your card has available credit</li>
              <li><strong>Renew manually</strong> - You can complete the renewal with a different payment method</li>
            </ol>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Update Payment Method</a>
            </p>

            <p><strong>Don't let your compliance lapse!</strong> Update your payment information as soon as possible to avoid service interruption.</p>

            <p>Need help? Call us at ${process.env.COMPANY_PHONE || '1-800-555-0199'}.</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Tariff updated (after rate edit)
  tariffUpdated: (user, order) => ({
    subject: `Your Tariff has been updated - Interstate Compliance Solutions`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0a1628; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a1628; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; color: #c9a227; }
          .content { padding: 30px; background: #f9f9f9; }
          .info-box { background: #d4edda; border: 1px solid #28a745; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; background: #c9a227; color: #0a1628; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interstate Compliance Solutions</h1>
          </div>
          <div class="content">
            <h2>Tariff Document Updated</h2>
            <p>Dear ${user.contact_name || user.company_name},</p>

            <div class="info-box">
              <strong>Your Tariff document has been updated with your new rates.</strong>
              <p style="margin-bottom: 0;">A new PDF has been generated and is ready for download.</p>
            </div>

            <p><strong>Reminder:</strong> Your updated tariff must be available for public inspection at your principal place of business as required by federal law.</p>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Download Updated Tariff</a>
            </p>

            <p>If you have any questions, please contact us.</p>
          </div>
          <div class="footer">
            <p>${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}</p>
            <p>Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'} | Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Send functions
const sendEmail = async (to, template, attachments = null) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: getFromAddress(),
    to,
    subject: template.subject,
    html: template.html
  };

  // Add attachments if provided
  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to: ${to}`);
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error.message);
    throw error;
  }
};

const sendEnrollmentConfirmation = async (user, enrollment) => {
  await sendEmail(user.email, templates.enrollmentConfirmation(user, enrollment));
};

const sendOrderConfirmation = async (user, order, orderType) => {
  await sendEmail(user.email, templates.orderConfirmation(user, order, orderType));
};

const sendPasswordResetEmail = async (email, companyName, token) => {
  await sendEmail(email, templates.passwordReset(email, companyName, token));
};

const sendContactNotification = async (submission) => {
  const adminEmail = process.env.COMPANY_EMAIL || process.env.EMAIL_USER;
  await sendEmail(adminEmail, templates.contactNotification(submission));
};

const sendContactConfirmation = async (name, email) => {
  await sendEmail(email, templates.contactConfirmation(name));
};

const sendTariffDocumentReady = async (user, order) => {
  await sendEmail(user.email, templates.tariffDocumentReady(user, order));
};

const sendAdminNewAccountNotification = async (user) => {
  try {
    await sendEmail(ADMIN_EMAIL, templates.adminNewAccount(user));
    console.log('Admin notification sent for new account:', user.email);
  } catch (error) {
    console.error('Failed to send admin new account notification:', error);
    // Don't throw - this shouldn't block the registration
  }
};

const sendAdminPurchaseNotification = async (user, orderType, order) => {
  try {
    await sendEmail(ADMIN_EMAIL, templates.adminPurchaseNotification(user, orderType, order));
    console.log('Admin notification sent for purchase:', orderType, order.id);
  } catch (error) {
    console.error('Failed to send admin purchase notification:', error);
    // Don't throw - this shouldn't block the order
  }
};

const sendWelcomeEmail = async (user) => {
  try {
    await sendEmail(user.email, templates.welcomeEmail(user));
    console.log('Welcome email sent to:', user.email);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
};

const sendBOC3FilingComplete = async (user, order) => {
  try {
    await sendEmail(user.email, templates.boc3FilingComplete(user, order));
    console.log('BOC-3 filing complete email sent to:', user.email);
  } catch (error) {
    console.error('Failed to send BOC-3 filing complete email:', error);
  }
};

const sendDocumentReadyWithAttachment = async (user, orderType, order, filePath = null) => {
  try {
    let attachments = null;

    // If a file path is provided, attach the document
    if (filePath) {
      const path = require('path');
      const fs = require('fs');

      // Check if file exists
      if (fs.existsSync(filePath)) {
        const filename = path.basename(filePath);
        attachments = [{
          filename: filename,
          path: filePath
        }];
      }
    }

    await sendEmail(user.email, templates.documentReady(user, orderType, order), attachments);
    console.log('Document ready email sent to:', user.email, attachments ? 'with attachment' : 'without attachment');
  } catch (error) {
    console.error('Failed to send document ready email:', error);
  }
};

// Expiration warning - 30 days
const sendExpirationWarning30 = async (user, serviceName, expiryDate) => {
  try {
    await sendEmail(user.email, templates.expirationWarning30(user, serviceName, expiryDate));
    console.log('30-day expiration warning sent to:', user.email, 'for', serviceName);
  } catch (error) {
    console.error('Failed to send 30-day expiration warning:', error);
  }
};

// Expiration warning - 5 days
const sendExpirationWarning5 = async (user, serviceName, expiryDate) => {
  try {
    await sendEmail(user.email, templates.expirationWarning5(user, serviceName, expiryDate));
    console.log('5-day expiration warning sent to:', user.email, 'for', serviceName);
  } catch (error) {
    console.error('Failed to send 5-day expiration warning:', error);
  }
};

// Autopay reminder - 10 days
const sendAutopayReminder10 = async (user, serviceName, chargeDate, amount, cardLast4, cardBrand) => {
  try {
    await sendEmail(user.email, templates.autopayReminder10(user, serviceName, chargeDate, amount, cardLast4, cardBrand));
    console.log('Autopay reminder sent to:', user.email, 'for', serviceName);
  } catch (error) {
    console.error('Failed to send autopay reminder:', error);
  }
};

// Autopay success
const sendAutopaySuccess = async (user, serviceName, amount, newExpiryDate, cardLast4) => {
  try {
    await sendEmail(user.email, templates.autopaySuccess(user, serviceName, amount, newExpiryDate, cardLast4));
    console.log('Autopay success email sent to:', user.email, 'for', serviceName);
  } catch (error) {
    console.error('Failed to send autopay success email:', error);
  }
};

// Autopay failed
const sendAutopayFailed = async (user, serviceName, reason, expiryDate) => {
  try {
    await sendEmail(user.email, templates.autopayFailed(user, serviceName, reason, expiryDate));
    console.log('Autopay failed email sent to:', user.email, 'for', serviceName);
  } catch (error) {
    console.error('Failed to send autopay failed email:', error);
  }
};

// Tariff updated
const sendTariffUpdated = async (user, order) => {
  try {
    await sendEmail(user.email, templates.tariffUpdated(user, order));
    console.log('Tariff updated email sent to:', user.email);
  } catch (error) {
    console.error('Failed to send tariff updated email:', error);
  }
};

module.exports = {
  sendEmail,
  sendEnrollmentConfirmation,
  sendOrderConfirmation,
  sendPasswordResetEmail,
  sendContactNotification,
  sendContactConfirmation,
  sendTariffDocumentReady,
  sendAdminNewAccountNotification,
  sendAdminPurchaseNotification,
  sendWelcomeEmail,
  sendBOC3FilingComplete,
  sendDocumentReadyWithAttachment,
  sendExpirationWarning30,
  sendExpirationWarning5,
  sendAutopayReminder10,
  sendAutopaySuccess,
  sendAutopayFailed,
  sendTariffUpdated
};
