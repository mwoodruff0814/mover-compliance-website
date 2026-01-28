const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
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

  passwordReset: (email, companyName, token) => ({
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
              <a href="${process.env.FRONTEND_URL}/reset-password?token=${token}" class="button">Reset Password</a>
            </p>

            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email. Your password will not be changed.</p>
          </div>
          <div class="footer">
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p>${process.env.FRONTEND_URL}/reset-password?token=${token}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

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
  })
};

// Send functions
const sendEmail = async (to, template) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `"Interstate Compliance Solutions" <${process.env.EMAIL_USER}>`,
    to,
    subject: template.subject,
    html: template.html
  });
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

module.exports = {
  sendEmail,
  sendEnrollmentConfirmation,
  sendOrderConfirmation,
  sendPasswordResetEmail,
  sendContactNotification,
  sendContactConfirmation,
  sendTariffDocumentReady
};
