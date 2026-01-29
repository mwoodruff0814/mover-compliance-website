const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Ensure temp directory exists
const tempDir = path.join(__dirname, '..', '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Generate Arbitration Enrollment Certificate PDF for enrolled carriers
 * @param {Object} user - User data (company_name, mc_number, usdot_number)
 * @param {Object} enrollment - Enrollment data (enrolled_date, expiry_date)
 * @param {boolean} returnBuffer - If true, returns buffer instead of file path
 * @returns {Promise<string|Buffer>} - File path or buffer
 */
const generateArbitrationPDF = async (user, enrollment, returnBuffer = false) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: 'Arbitration Program Enrollment Certificate',
          Author: process.env.COMPANY_NAME || 'Interstate Compliance Solutions',
          Subject: `Arbitration Enrollment Certificate for ${user.company_name}`
        }
      });

      const chunks = [];

      if (returnBuffer) {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        const fileName = `arbitration-certificate-${user.mc_number?.replace(/[^a-zA-Z0-9]/g, '') || user.id}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, fileName);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        writeStream.on('finish', () => resolve(`/temp/${fileName}`));
      }

      // Colors
      const navy = '#0a1628';
      const gold = '#c9a227';
      const lightBlue = '#e8f4f8';

      // Background border/frame
      doc.rect(30, 30, 552, 732).lineWidth(3).strokeColor(navy).stroke();
      doc.rect(35, 35, 542, 722).lineWidth(1).strokeColor(gold).stroke();

      // Light background
      doc.rect(40, 40, 532, 712).fill(lightBlue);

      // Company Logo/Header area
      doc.fillColor(navy)
        .fontSize(28)
        .font('Helvetica-Bold')
        .text(process.env.COMPANY_NAME || 'INTERSTATE COMPLIANCE', 0, 80, { align: 'center', width: 612 });

      doc.fontSize(14)
        .font('Helvetica')
        .text('SOLUTIONS', 0, 112, { align: 'center', width: 612 });

      doc.moveDown(3);

      // Main Title
      doc.fillColor(navy)
        .fontSize(26)
        .font('Helvetica-Bold')
        .text('ARBITRATION PROGRAM', { align: 'center' });

      doc.fontSize(24)
        .text('ENROLLMENT CERTIFICATE', { align: 'center' });

      doc.moveDown(0.5);

      // Years from enrollment
      const enrolledYear = new Date(enrollment.enrolled_date).getFullYear();
      const expiryDate = new Date(enrollment.expiry_date);
      const expiryFormatted = expiryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      doc.fontSize(14)
        .font('Helvetica-Oblique')
        .fillColor('#444')
        .text(`Effective Through ${expiryFormatted}`, { align: 'center' });

      doc.moveDown(3);

      // Carrier info box
      doc.fillColor(navy)
        .rect(100, doc.y, 412, 80)
        .fill();

      const carrierBoxY = doc.y;
      doc.fillColor('white')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(user.company_name?.toUpperCase() || 'COMPANY NAME', 120, carrierBoxY + 15, { width: 372, align: 'center' });

      doc.fontSize(12)
        .font('Helvetica')
        .text(`MC Number: ${user.mc_number || 'N/A'}`, 120, carrierBoxY + 40, { width: 372, align: 'center' })
        .text(`USDOT Number: ${user.usdot_number || 'N/A'}`, 120, carrierBoxY + 55, { width: 372, align: 'center' });

      doc.y = carrierBoxY + 100;
      doc.moveDown(1);

      // Enrollment text
      doc.fillColor(navy)
        .fontSize(12)
        .font('Helvetica-Oblique')
        .text(
          `Upon successful payment of the annual program fee, this carrier was enrolled in the ${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'} Dispute Settlement program for calendar year ${enrolledYear}. Any questions on the program may be addressed to:`,
          80, doc.y,
          { align: 'center', width: 452 }
        );

      doc.moveDown(2);

      // Contact info
      doc.font('Helvetica-Bold')
        .fontSize(11)
        .text(process.env.COMPANY_NAME || 'Interstate Compliance Solutions', { align: 'center' });

      doc.font('Helvetica')
        .fontSize(10)
        .text(process.env.COMPANY_ADDRESS || '123 Compliance Way', { align: 'center' })
        .text(process.env.COMPANY_CITY_STATE || 'Washington, DC 20001', { align: 'center' })
        .text(`Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'}`, { align: 'center' })
        .text(`Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}`, { align: 'center' });

      // Signature area at bottom
      // Try to use a handwriting font for signature
      const lucidaHand = 'C:/Windows/Fonts/LHANDW.TTF'; // Lucida Handwriting

      let signatureFont = 'Helvetica-Oblique';
      if (fs.existsSync(lucidaHand)) {
        doc.registerFont('Signature', lucidaHand);
        signatureFont = 'Signature';
      }

      doc.fontSize(18)
        .font(signatureFont)
        .fillColor('#00008B')
        .text('Matthew Woodruff', 90, 572);

      // Signature line
      doc.strokeColor(navy)
        .lineWidth(1)
        .moveTo(80, 600)
        .lineTo(300, 600)
        .stroke();

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(navy)
        .text('Matthew Woodruff', 80, 608);

      doc.font('Helvetica')
        .text('President', 80, 621)
        .text(process.env.COMPANY_NAME || 'Interstate Compliance Solutions', 80, 634);

      // Footer
      doc.strokeColor(gold)
        .lineWidth(2)
        .moveTo(50, 710)
        .lineTo(562, 710)
        .stroke();

      doc.fillColor('#666')
        .fontSize(9)
        .text(`© ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Interstate Compliance Solutions'}`, 0, 720, { align: 'center', width: 612 });

      doc.fillColor('#c41e3a')
        .fontSize(8)
        .text('This enrollment must be renewed annually to remain valid.', 0, 735, { align: 'center', width: 612 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate Arbitration Consumer Document PDF for shippers
 * @param {Object} user - Carrier data (company_name, mc_number, usdot_number)
 * @param {Object} enrollment - Enrollment data (enrolled_date, expiry_date)
 * @param {boolean} returnBuffer - If true, returns buffer instead of file path
 * @returns {Promise<string|Buffer>} - File path or buffer
 */
const generateArbitrationConsumerPDF = async (user, enrollment, returnBuffer = false) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 60, bottom: 60, left: 72, right: 72 },
        info: {
          Title: 'Arbitration Program for Dispute Settlement',
          Author: process.env.COMPANY_NAME || 'Interstate Compliance Solutions',
          Subject: 'Arbitration Program Information for Shippers'
        }
      });

      const chunks = [];

      if (returnBuffer) {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        const fileName = `arbitration-consumer-${user.mc_number?.replace(/[^a-zA-Z0-9]/g, '') || user.id}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, fileName);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        writeStream.on('finish', () => resolve(`/temp/${fileName}`));
      }

      // Colors
      const navy = '#0a1628';
      const gold = '#c9a227';

      const companyName = process.env.COMPANY_NAME || 'Interstate Compliance Solutions';
      const companyPhone = process.env.COMPANY_PHONE || '1-800-555-0199';
      const companyEmail = process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com';
      const expiryDate = new Date(enrollment.expiry_date);
      const expiryFormatted = expiryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      // Header
      doc.fillColor(navy)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('ARBITRATION PROGRAM FOR DISPUTE SETTLEMENT', { align: 'center' });

      doc.moveDown(0.5);

      // Carrier info box
      doc.fillColor(navy).rect(72, doc.y, 468, 50).fill();
      const boxY = doc.y;
      doc.fillColor('white').fontSize(11).font('Helvetica');
      doc.text(`Your carrier, ${user.company_name} (MC# ${user.mc_number || 'N/A'}), belongs to the`, 82, boxY + 10, { width: 448, align: 'center' });
      doc.text(`${companyName} Dispute Settlement Program, an arbitration program to help`, 82, boxY + 23, { width: 448, align: 'center' });
      doc.text('consumers resolve disputed claims on interstate household goods shipments.', 82, boxY + 36, { width: 448, align: 'center' });

      doc.y = boxY + 60;

      doc.fillColor(gold).fontSize(11).font('Helvetica-Bold')
        .text(`Effective Through ${expiryFormatted}`, { align: 'center' });

      doc.moveDown(1);

      // Helper for section headers
      const sectionHeader = (title) => {
        doc.fillColor(navy).fontSize(11).font('Helvetica-Bold').text(title, 72, doc.y, { width: 468 });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(10);
      };

      // Helper for paragraphs
      const para = (text) => {
        doc.fillColor(navy).fontSize(10).font('Helvetica').text(text, 72, doc.y, { align: 'justify', width: 468 });
        doc.moveDown(0.5);
      };

      // What is arbitration?
      sectionHeader('What is arbitration?');
      para('Arbitration is an alternative to going to court when you have a dispute with your carrier that cannot be resolved to your satisfaction. A team of retired judges and other experts working with our program will review information about the dispute, submitted from both the shipper (you) and the carrier, and render a decision that is binding. Arbitration does not use legal rules of evidence and is not conducted in a courtroom; it is designed to offer an alternative to the higher costs and longer process involved in filing a lawsuit and going to court.');

      // When is arbitration used?
      sectionHeader('When is arbitration used?');
      para('When a shipper (you) cannot resolve a claim with the carrier who transported his/her household goods on an interstate shipment, and if the claim is a result of 1) loss or damage involving items contained in the shipment, or 2) additional charges that were billed to you by your carrier after your shipment was delivered, then arbitration can be used. Disputes regarding charges that were collected by your carrier when your shipment was delivered are not subject to mandatory arbitration, only those additional charges that were billed by your carriers after your goods were delivered are subject to mandatory arbitration.');

      // About the arbitration process
      sectionHeader('About the arbitration process');
      para('Before you can initiate the arbitration process you must exhaust your remedies through the carrier\'s regular claims process and have received the carrier\'s final offer to you. You must file a claim for loss or damage with your carrier within nine months of the delivery of your goods. The carrier has 30 days after receiving your claim to acknowledge it, and has 120 days to pay, deny, make a settlement offer or tell you the status of your claim and the reason for any delay. Your claim for disputed charges must be filed within 180 days of receiving your carrier\'s invoice. Disputes involving other types of claims may be arbitrated only if both the carrier and the shipper agree to use the program to resolve the claim.');

      // The program
      sectionHeader(`The ${companyName} program`);
      para(`${companyName} uses National Arbitration and Mediation, Inc. (NAM) in NY to administer the program for its members, in compliance with Federal regulations. NAM is an independent company that is not affiliated with any household goods moving company or with ${companyName}. It uses a panel of independent arbitrators who are former judges and practicing specialists who are uniquely qualified and skilled in resolving disputes.`);

      para(`${companyName} acts only to provide oversight to the program to make sure both the shipper and carrier comply with the rules of the program. The decision rendered by NAM is confidential and will not be disclosed without your permission, except in response to a legal action in a US or state court, etc.`);

      para('If the shipper requests arbitration on a disputed claim of $10,000 or less, the claim must be submitted to binding arbitration by the carrier when no settlement can be reached. On claims of more than $10,000 the disputed claim will be submitted to arbitration only if both the shipper and the carrier agree to binding arbitration. In other words, for claims of more than $10,000 the carrier may elect to not send the dispute to NAM for binding arbitration.');

      // Page break
      doc.addPage();

      // What are the legal effects?
      sectionHeader('What are the legal effects?');
      para('NAM will handle the dispute and provide a neutral decision by a panel of arbitrators. The arbitrator\'s decision is legally binding on both parties and can be enforced in any court having jurisdiction over the dispute. Under the rules of the program there is a limited right to appeal the decision, however, courts will not usually revise findings in a binding arbitration award.');

      para('The arbitrator may make any award it feels is just and appropriate as concerns the agreement between the shipper and carrier. The award may not exceed the mover\'s liability under the bill of lading, or in the case of disputed charges, the total amount of disputed additional charges.');

      para('The arbitrator will consider the applicable laws and provisions of the tariff as well as applicable practices of the moving industry when reaching a decision. Only claims for loss or damage to the household goods transported, disputed additional transportation and service-related charges assessed by the carrier in addition to those collected at delivery, or other disputes concerning the transportation of the shipment that are mutually agreed upon by the shipper and the carrier, in writing, can be considered for arbitration.');

      // How much does it cost?
      sectionHeader('How much does it cost?');
      para(`NAM charges an administrative fee, which is divided between the shipper and the carrier. The fee is sent directly to NAM; ${companyName} does not retain any portion of the arbitration fee. You and your carrier will each pay a fair share of the cost of arbitration. If the claim is for more than $10,000 federal regulations state a carrier may decline to go to arbitration and your recourse would be to use civil court instead.`);

      // Fee table
      doc.moveDown(0.3);
      const tableHeaderY = doc.y;
      doc.fillColor(navy).rect(72, tableHeaderY, 468, 20).fill();
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
      doc.text('Claim Amount', 82, tableHeaderY + 5, { width: 150 });
      doc.text('NAM Administrative Fee', 250, tableHeaderY + 5, { width: 280 });
      doc.y = tableHeaderY + 22;

      const fees = [
        { amount: '$10,000 or less', fee: '$635 ($295 from shipper; $340 from carrier)' },
        { amount: '$10,001 - $20,000', fee: '$685 ($320 from shipper; $365 from carrier)' },
        { amount: '$20,001 - $30,000', fee: '$735 ($345 from shipper; $390 from carrier)' },
        { amount: '$30,001 - $40,000', fee: '$785 ($370 from shipper; $415 from carrier)' },
        { amount: '$40,001 - $50,000', fee: '$835 ($395 from shipper; $440 from carrier)' }
      ];

      doc.fontSize(8).font('Helvetica').fillColor(navy);
      fees.forEach((row, i) => {
        const rowY = doc.y;
        if (i % 2 === 0) {
          doc.fillColor('#f0f3f9').rect(72, rowY, 468, 16).fill();
        }
        doc.fillColor(navy);
        doc.text(row.amount, 82, rowY + 4, { width: 150 });
        doc.text(row.fee, 250, rowY + 4, { width: 280 });
        doc.y = rowY + 16;
      });

      doc.moveDown(1);

      // How do I get started?
      sectionHeader('How do I get started with arbitration?');
      para(`First you must have received in writing a written offer to settle your claim from the carrier or its claim settlement company. If you decline to accept the carrier's offer you must call ${companyName} to verify the carrier participates in the arbitration program. Please have the carrier MC number (at the top of the paperwork you signed) when you call. ${companyName} will then email you information on the program along with the forms you will need to complete and return to NAM should you decide to request arbitration.`);

      // Contact box
      doc.moveDown(1);
      const contactY = doc.y;
      doc.fillColor('#f0f3f9').rect(72, contactY, 468, 90).fill();

      // Left column - Company contact
      doc.fillColor(navy).fontSize(11).font('Helvetica-Bold');
      doc.text(`You can contact ${companyName} at:`, 82, contactY + 10, { width: 200 });
      doc.fontSize(10).font('Helvetica');
      doc.text(`Phone: ${companyPhone}`, 82, contactY + 30, { width: 200 });
      doc.text(`Email: ${companyEmail}`, 82, contactY + 48, { width: 200 });

      // Right column - NAM info
      doc.font('Helvetica-Bold');
      doc.text('Arbitration Provider:', 310, contactY + 10, { width: 220 });
      doc.font('Helvetica');
      doc.text('National Arbitration & Mediation, Inc.', 310, contactY + 28, { width: 220 });
      doc.text('990 Stewart Avenue, First Floor', 310, contactY + 43, { width: 220 });
      doc.text('Garden City, NY 11530', 310, contactY + 58, { width: 220 });
      doc.text('www.namadr.com', 310, contactY + 73, { width: 220 });

      doc.y = contactY + 100;

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate Tariff Document PDF for household goods movers
 * @param {Object} user - User data (company_name, mc_number, usdot_number, address, city, state, zip, phone, email)
 * @param {Object} order - Order data (pricing_method, service_territory, accessorials, special_notes)
 * @param {boolean} returnBuffer - If true, returns buffer instead of file path
 * @returns {Promise<string|Buffer>} - File path or buffer
 */
const generateTariffPDF = async (user, order, returnBuffer = false) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 72, bottom: 72, left: 72, right: 72 },
        bufferPages: true,
        info: {
          Title: `Tariff - ${user.company_name}`,
          Author: process.env.COMPANY_NAME || 'Interstate Compliance Solutions',
          Subject: `Household Goods Tariff for ${user.company_name}`
        }
      });

      const chunks = [];

      if (returnBuffer) {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        const fileName = `tariff-${user.mc_number?.replace(/[^a-zA-Z0-9]/g, '') || user.id}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, fileName);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        writeStream.on('finish', () => resolve(`/temp/${fileName}`));
      }

      // Colors
      const navy = '#0a1628';
      const gold = '#c9a227';
      const lightGray = '#f5f5f5';

      // Parse accessorials
      let accessorials = [];
      try {
        accessorials = typeof order.accessorials === 'string'
          ? JSON.parse(order.accessorials)
          : (order.accessorials || []);
      } catch (e) {
        accessorials = [];
      }

      // Parse rates from order
      let rates = {};
      try {
        rates = typeof order.rates === 'string'
          ? JSON.parse(order.rates)
          : (order.rates || {});
      } catch (e) {
        rates = {};
      }

      // Helper to format rate value
      const formatRate = (value, suffix = '') => {
        if (!value || value === 0) return `$XX.XX${suffix}`;
        return `$${value.toFixed(2)}${suffix}`;
      };

      const formatRateNoSymbol = (value) => {
        if (!value || value === 0) return 'XX.XX';
        return value.toFixed(2);
      };

      const effectiveDate = order.enrolled_date ? new Date(order.enrolled_date) : new Date();
      const formattedEffectiveDate = effectiveDate.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      // Format expiry date
      const expiryDate = order.expiry_date ? new Date(order.expiry_date) : new Date(effectiveDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      const formattedExpiryDate = expiryDate.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      // Helper function for section headers
      // Helper to check if we need a page break
      const checkPageBreak = (neededSpace = 100) => {
        const pageHeight = 720; // Approximate usable page height
        if (doc.y > pageHeight - neededSpace) {
          doc.addPage();
        }
      };

      const sectionHeader = (title, itemNumber) => {
        doc.addPage();
        doc.fillColor(navy)
          .fontSize(18)
          .font('Helvetica-Bold')
          .text(`ITEM ${itemNumber}`, { align: 'center' });
        doc.fontSize(14)
          .text(title, { align: 'center' });
        doc.moveDown(0.5);
        doc.strokeColor(gold)
          .lineWidth(2)
          .moveTo(72, doc.y)
          .lineTo(540, doc.y)
          .stroke();
        doc.moveDown(1);
      };

      // Helper for subsection - ensures header stays with content
      const subSection = (title) => {
        checkPageBreak(120); // Need room for heading + at least some content
        doc.moveDown(0.5);
        doc.x = 72; // Reset x position to left margin
        doc.fillColor(navy)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(title, 72, doc.y, { width: 468 });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(10);
      };

      // Helper for paragraphs - prevents orphan lines
      const paragraph = (text) => {
        checkPageBreak(60); // Need room for at least a few lines
        doc.fillColor(navy)
          .fontSize(10)
          .font('Helvetica')
          .text(text, { width: 468, align: 'justify' });
        doc.moveDown(0.5);
      };

      // ==================== TITLE PAGE ====================
      doc.moveDown(4);

      doc.fillColor(navy)
        .fontSize(32)
        .font('Helvetica-Bold')
        .text('TARIFF', { align: 'center' });

      doc.moveDown(0.5);

      doc.fontSize(14)
        .font('Helvetica')
        .text('NAMING RULES, REGULATIONS, RATES AND CHARGES', { align: 'center' });

      doc.moveDown(0.3);
      doc.text('FOR THE TRANSPORTATION OF', { align: 'center' });
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold')
        .text('HOUSEHOLD GOODS', { align: 'center' });

      doc.moveDown(2);

      // Gold line
      doc.strokeColor(gold)
        .lineWidth(3)
        .moveTo(150, doc.y)
        .lineTo(462, doc.y)
        .stroke();

      doc.moveDown(2);

      // Company Info Box
      doc.fillColor(navy)
        .rect(120, doc.y, 372, 120)
        .fill();

      const boxY = doc.y;
      doc.fillColor('white')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(user.company_name?.toUpperCase() || 'COMPANY NAME', 140, boxY + 20, { width: 332, align: 'center' });

      doc.fontSize(11)
        .font('Helvetica')
        .text(`MC Number: ${user.mc_number || 'N/A'}`, 140, boxY + 50, { width: 332, align: 'center' })
        .text(`USDOT Number: ${user.usdot_number || 'N/A'}`, 140, boxY + 65, { width: 332, align: 'center' })
        .text(`${user.address || ''} ${user.city || ''}, ${user.state || ''} ${user.zip || ''}`.trim() || 'Address on file', 140, boxY + 85, { width: 332, align: 'center' })
        .text(`Phone: ${user.phone || 'N/A'}`, 140, boxY + 100, { width: 332, align: 'center' });

      doc.y = boxY + 140;
      doc.moveDown(2);

      doc.fillColor(navy)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(`Effective Date: ${formattedEffectiveDate}`, { align: 'center' });

      doc.moveDown(0.3);

      doc.fillColor('#c41e3a')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`Valid Through: ${formattedExpiryDate}`, { align: 'center' });

      doc.moveDown(0.5);

      doc.fillColor(navy)
        .fontSize(10)
        .font('Helvetica')
        .text(`Service Territory: ${order.service_territory || 'Nationwide'}`, { align: 'center' });

      doc.moveDown(3);

      doc.fontSize(9)
        .fillColor('#666')
        .text('This tariff is published in compliance with 49 U.S.C. § 13702 and 49 CFR Part 1310', { align: 'center' })
        .text('Issued by: Interstate Compliance Solutions', { align: 'center' });

      doc.moveDown(0.5);
      doc.fontSize(8)
        .fillColor('#c41e3a')
        .text(`This tariff expires on ${formattedExpiryDate} and must be renewed annually to remain valid.`, { align: 'center' });

      // ==================== TABLE OF CONTENTS ====================
      doc.addPage();

      doc.fillColor(navy)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('TABLE OF CONTENTS', { align: 'center' });

      doc.moveDown(1);
      doc.strokeColor(gold).lineWidth(2).moveTo(72, doc.y).lineTo(540, doc.y).stroke();
      doc.moveDown(1);

      const tocItems = [
        { item: '100', title: 'APPLICATION OF TARIFF', page: '3' },
        { item: '110', title: 'DEFINITIONS', page: '4' },
        { item: '200', title: 'SCOPE OF OPERATIONS', page: '6' },
        { item: '300', title: 'RATES AND CHARGES', page: '7' },
        { item: '310', title: 'TRANSPORTATION RATES', page: '8' },
        { item: '320', title: 'ORIGIN & DEST. SERVICES', page: '9' },
        { item: '330', title: 'MINIMUM CHARGES', page: '10' },
        { item: '400', title: 'ACCESSORIAL SERVICES', page: '11' },
        { item: '410', title: 'PACKING AND UNPACKING', page: '12' },
        { item: '420', title: 'STORAGE IN TRANSIT', page: '13' },
        { item: '430', title: 'EXTRA LABOR CHARGES', page: '14' },
        { item: '440', title: 'SPECIAL SERVICES', page: '15' },
        { item: '500', title: 'VALUATION AND LIABILITY', page: '16' },
        { item: '510', title: 'RELEASED VALUE', page: '17' },
        { item: '520', title: 'FULL VALUE PROTECTION', page: '18' },
        { item: '600', title: 'CLAIMS PROCEDURES', page: '19' },
        { item: '700', title: 'PAYMENT TERMS', page: '20' },
        { item: '800', title: 'CUSTOMER DISCLOSURES', page: '21' },
        { item: '900', title: 'GENERAL RULES', page: '22' }
      ];

      // Two-column TOC layout
      const tocStartY = doc.y;
      const tocMidPoint = Math.ceil(tocItems.length / 2);

      doc.fontSize(10).font('Helvetica').fillColor(navy);

      // Left column
      tocItems.slice(0, tocMidPoint).forEach((item, i) => {
        const yPos = tocStartY + (i * 20);
        doc.text(`Item ${item.item}`, 72, yPos, { width: 45 });
        doc.text(item.title, 120, yPos, { width: 130 });
        doc.text(item.page, 255, yPos, { width: 30 });
      });

      // Right column
      tocItems.slice(tocMidPoint).forEach((item, i) => {
        const yPos = tocStartY + (i * 20);
        doc.text(`Item ${item.item}`, 300, yPos, { width: 45 });
        doc.text(item.title, 348, yPos, { width: 130 });
        doc.text(item.page, 483, yPos, { width: 30 });
      });

      doc.y = tocStartY + (tocMidPoint * 20) + 30;

      // ==================== ITEM 100: APPLICATION OF TARIFF ====================
      sectionHeader('APPLICATION OF TARIFF', '100');

      paragraph('This tariff contains the rules, regulations, rates, and charges for the transportation of household goods by motor vehicle, as defined herein, between points in the United States.');

      paragraph('This tariff applies to transportation services provided by the carrier named on the title page and is published in accordance with the requirements of 49 U.S.C. § 13702 and 49 CFR Part 1310.');

      subSection('A. Governing Publications');
      paragraph('This tariff is governed by and subject to all applicable federal regulations, including but not limited to:');
      doc.text('    • 49 CFR Part 375 - Transportation of Household Goods in Interstate Commerce');
      doc.text('    • 49 CFR Part 371 - Brokers of Property');
      doc.text('    • 49 CFR Part 387 - Minimum Levels of Financial Responsibility');
      doc.text('    • 49 CFR Part 1310 - Tariff Requirements');
      doc.moveDown(0.5);

      subSection('B. Amendments');
      paragraph('This tariff may be amended, changed, or modified by the carrier at any time. Amended provisions shall be effective upon publication unless otherwise noted. Shippers will be notified of material changes affecting quoted rates.');

      subSection('C. Conflicting Provisions');
      paragraph('In the event of conflict between the provisions of this tariff and any contract, agreement, or other document, the provisions most favorable to the shipper shall govern, unless specifically waived in writing by the shipper.');

      // ==================== ITEM 110: DEFINITIONS ====================
      sectionHeader('DEFINITIONS', '110');

      const definitions = [
        { term: 'Bill of Lading', def: 'The receipt for goods and the contract for their transportation, containing terms and conditions of the agreement between the shipper and the carrier.' },
        { term: 'Carrier', def: 'The motor carrier named on the title page of this tariff, including its agents and employees.' },
        { term: 'Consignee', def: 'The person or entity to whom the shipment is to be delivered.' },
        { term: 'Consignor/Shipper', def: 'The person or entity from whom the shipment originates and who enters into the contract of carriage with the carrier.' },
        { term: 'Household Goods', def: 'Personal effects and property used or to be used in a dwelling, including furniture, fixtures, equipment, and the property of family members.' },
        { term: 'Interstate Commerce', def: 'Transportation of property between a point in one state and a point in another state, or between points within a state through another state.' },
        { term: 'Line Haul', def: 'The transportation charges assessed for moving a shipment from origin to destination, exclusive of accessorial charges.' },
        { term: 'Order for Service', def: 'A document authorizing the carrier to perform transportation services as specified therein.' },
        { term: 'Released Value', def: 'The maximum amount of carrier liability for loss or damage as declared by the shipper.' },
        { term: 'Shipment', def: 'The household goods tendered by one shipper at one time, from one origin point, to one destination.' },
        { term: 'Tariff', def: 'This publication containing the rules, regulations, rates, and charges applicable to the transportation of household goods.' },
        { term: 'Weight Ticket', def: 'An official document showing the weight of the shipment as determined by certified scales.' }
      ];

      definitions.forEach(d => {
        doc.fillColor(navy)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(d.term + ': ', { continued: true })
          .font('Helvetica')
          .text(d.def);
        doc.moveDown(0.3);
      });

      // ==================== ITEM 200: SCOPE OF OPERATIONS ====================
      sectionHeader('SCOPE OF OPERATIONS', '200');

      const territoryDescriptions = {
        'Nationwide (All 50 States)': 'This carrier is authorized to provide transportation services for household goods between all points in the 48 contiguous United States, Alaska, Hawaii, and the District of Columbia.',
        'Regional - Northeast': 'This carrier is authorized to provide transportation services for household goods between points in the Northeastern United States, including Connecticut, Delaware, Maine, Maryland, Massachusetts, New Hampshire, New Jersey, New York, Pennsylvania, Rhode Island, Vermont, and the District of Columbia.',
        'Regional - Southeast': 'This carrier is authorized to provide transportation services for household goods between points in the Southeastern United States, including Alabama, Arkansas, Florida, Georgia, Kentucky, Louisiana, Mississippi, North Carolina, South Carolina, Tennessee, Virginia, and West Virginia.',
        'Regional - Midwest': 'This carrier is authorized to provide transportation services for household goods between points in the Midwestern United States, including Illinois, Indiana, Iowa, Kansas, Michigan, Minnesota, Missouri, Nebraska, North Dakota, Ohio, South Dakota, and Wisconsin.',
        'Regional - Southwest': 'This carrier is authorized to provide transportation services for household goods between points in the Southwestern United States, including Arizona, New Mexico, Oklahoma, and Texas.',
        'Regional - West': 'This carrier is authorized to provide transportation services for household goods between points in the Western United States, including California, Colorado, Idaho, Montana, Nevada, Oregon, Utah, Washington, and Wyoming.',
        'Custom Territory': 'This carrier operates within a custom service territory as defined by operating authority. Contact carrier for specific service area details.'
      };

      paragraph(territoryDescriptions[order.service_territory] || territoryDescriptions['Nationwide (All 50 States)']);

      subSection('A. Type of Service');
      paragraph('The carrier provides the following types of service for the transportation of household goods:');
      doc.text('    • Local moving services (within 50 miles)');
      doc.text('    • Long-distance moving services (over 50 miles)');
      doc.text('    • Packing and unpacking services');
      doc.text('    • Storage-in-transit services');
      doc.text('    • Special handling for high-value items');
      doc.moveDown(0.5);

      subSection('B. Excluded Items');
      paragraph('The following items are excluded from transportation under this tariff unless specifically agreed upon in writing:');
      doc.text('    • Hazardous materials as defined by DOT regulations');
      doc.text('    • Perishable goods');
      doc.text('    • Live plants and animals');
      doc.text('    • Currency, securities, precious metals, or jewelry exceeding $1,000 in value');
      doc.text('    • Items requiring special permits or licenses');

      // ==================== ITEM 300: RATES AND CHARGES ====================
      sectionHeader('RATES AND CHARGES', '300');

      paragraph('All rates and charges in this tariff are stated in United States dollars and cents. Rates are subject to change upon notice to the shipper. The following rate structures are available:');

      const pricingMethod = order.pricing_method || 'Weight-Based';

      subSection('A. Rate Determination Method');
      doc.fillColor(navy).fontSize(10).font('Helvetica');
      doc.text(`Primary Pricing Method: ${pricingMethod}`, { continued: false });
      doc.moveDown(0.5);

      if (pricingMethod === 'Weight-Based (per lb)' || pricingMethod === 'Mixed Methods') {
        paragraph('Weight-based rates are determined by the actual weight of the shipment and the distance of the move. Weight is certified by weighing the loaded vehicle and subtracting the tare (empty) weight.');
      }

      if (pricingMethod === 'Hourly Rate' || pricingMethod === 'Mixed Methods') {
        paragraph('Hourly rates are charged based on the actual time required to complete the move, including loading, transit, and unloading. Portal-to-portal time may apply.');
      }

      if (pricingMethod === 'Cubic Feet Based' || pricingMethod === 'Mixed Methods') {
        paragraph('Cubic foot rates are based on the volume of space occupied by the shipment in the moving vehicle, calculated by standard industry measurement practices.');
      }

      if (pricingMethod === 'Flat Rate' || pricingMethod === 'Mixed Methods') {
        paragraph('Flat rates are quoted based on an assessment of the shipment and distance. The quoted rate is guaranteed provided the inventory is accurate and no additional services are required.');
      }

      subSection('B. Fuel Surcharge');
      const fuelSurcharge = rates.accessorial?.fuel_surcharge || 0;
      if (fuelSurcharge > 0) {
        paragraph(`A fuel surcharge of ${fuelSurcharge}% will be applied to all transportation charges. This surcharge is subject to adjustment based on current fuel prices and will be disclosed on estimates and invoices.`);
      } else {
        paragraph('A fuel surcharge may be applied to all transportation charges based on current fuel prices. The surcharge percentage will be disclosed on estimates and invoices.');
      }

      // ==================== ITEM 310: TRANSPORTATION/LINE HAUL RATES ====================
      sectionHeader('TRANSPORTATION RATES (LINE HAUL)', '310');

      paragraph('Transportation charges for interstate household goods moves are based on the actual weight of the shipment and the distance traveled. Federal regulations require that interstate moves be charged by weight, not by the hour. This ensures fair and consistent pricing based on the actual size of your shipment.');

      doc.moveDown(0.5);
      subSection('A. Rate Schedule - Weight & Distance Matrix');
      paragraph('Rates are shown per pound and vary based on shipment weight and distance traveled. Larger shipments receive lower per-pound rates.');

      // Get rate matrix from order (new format)
      const trans = rates.transportation || {};
      const getMatrixRate = (weight, distance) => {
        const w = trans[`w${weight}`];
        return w ? (w[`d${distance}`] || 0) : 0;
      };

      // Weight x Distance Rate Table
      const tableX = 72;
      const tableWidth = 468;
      const colWidths = [90, 75, 75, 85, 85]; // Weight, 0-250, 251-500, 501-1000, 1000+
      const rowHeight = 20;

      // Table Header
      doc.fillColor(navy).rect(tableX, doc.y, tableWidth, 25).fill();
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
      let headerX = tableX + 5;
      doc.text('Weight', headerX, doc.y + 8, { width: colWidths[0] - 10 });
      headerX += colWidths[0];
      doc.text('0-250 mi', headerX, doc.y - 17, { width: colWidths[1] - 5, align: 'center' });
      headerX += colWidths[1];
      doc.text('251-500 mi', headerX, doc.y - 17, { width: colWidths[2] - 5, align: 'center' });
      headerX += colWidths[2];
      doc.text('501-1000 mi', headerX, doc.y - 17, { width: colWidths[3] - 5, align: 'center' });
      headerX += colWidths[3];
      doc.text('1000+ mi', headerX, doc.y - 17, { width: colWidths[4] - 5, align: 'center' });
      doc.y += 25;

      // Weight tiers
      const weightTiers = [
        { label: '1,000 lbs', weight: 1000 },
        { label: '2,000 lbs', weight: 2000 },
        { label: '4,000 lbs', weight: 4000 },
        { label: '6,000 lbs', weight: 6000 },
        { label: '8,000+ lbs', weight: 8000 }
      ];
      const distanceTiers = [250, 500, 1000, 1500];

      doc.fontSize(9).font('Helvetica');
      weightTiers.forEach((tier, i) => {
        if (i % 2 === 0) {
          doc.fillColor(lightGray).rect(tableX, doc.y, tableWidth, rowHeight).fill();
        }
        doc.fillColor(navy);
        let cellX = tableX + 5;
        doc.font('Helvetica-Bold').text(tier.label, cellX, doc.y + 5, { width: colWidths[0] - 10 });
        doc.font('Helvetica');
        cellX += colWidths[0];

        distanceTiers.forEach((dist, j) => {
          const rate = getMatrixRate(tier.weight, dist);
          const rateText = rate > 0 ? `$${rate.toFixed(2)}` : '$X.XX';
          doc.text(rateText, cellX, doc.y + 5 - (j === 0 ? 0 : 20), { width: colWidths[j + 1] - 5, align: 'center' });
          cellX += colWidths[j + 1];
        });
        doc.y += rowHeight;
      });

      doc.moveDown(0.8);

      // Minimum weights note
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666');
      doc.text('Minimum weights apply: 1,000 lbs (0-250 mi), 2,000 lbs (251-500 mi), 3,000 lbs (501-1000 mi), 4,000 lbs (1000+ mi)', tableX, doc.y);
      doc.moveDown(1);

      // ===== TWO COLUMN LAYOUT FOR B AND C =====
      const columnStartY = doc.y;
      const leftColX = 72;
      const rightColX = 300;
      const colWidth = 220;

      // ----- LEFT COLUMN: B. Sample Transportation Charges -----
      doc.fillColor(navy).fontSize(12).font('Helvetica-Bold');
      doc.text('B. Sample Transportation Charges', leftColX, columnStartY, { width: colWidth });
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica');
      doc.text('Example: 5,000 lb shipment, 400 miles', leftColX, doc.y, { width: colWidth });
      doc.moveDown(0.5);

      // Get sample rate (use 4000 lb tier at 500 mile distance as example)
      const sampleRate = getMatrixRate(4000, 500);

      // Sample charges mini-table
      doc.fillColor(navy).rect(leftColX, doc.y, colWidth, 16).fill();
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
      doc.text('Weight', leftColX + 5, doc.y + 4, { width: 55 });
      doc.text('Rate/lb', leftColX + 60, doc.y - 12, { width: 45 });
      doc.text('Calculation', leftColX + 105, doc.y - 12, { width: 60 });
      doc.text('Total', leftColX + 170, doc.y - 12, { width: 50 });
      doc.y += 16;

      // Show sample calculations using actual rates from matrix
      const sampleCalcs = [
        { weight: 2000, rate: getMatrixRate(2000, 500) },
        { weight: 4000, rate: getMatrixRate(4000, 500) },
        { weight: 6000, rate: getMatrixRate(6000, 500) },
        { weight: 8000, rate: getMatrixRate(8000, 500) }
      ];

      doc.fillColor(navy).fontSize(8).font('Helvetica');
      sampleCalcs.forEach((calc, i) => {
        if (i % 2 === 0) {
          doc.fillColor(lightGray).rect(leftColX, doc.y, colWidth, 14).fill();
        }
        doc.fillColor(navy);
        doc.text(`${calc.weight.toLocaleString()} lbs`, leftColX + 5, doc.y + 3, { width: 55 });
        doc.text(calc.rate > 0 ? `$${calc.rate.toFixed(2)}` : '$X.XX', leftColX + 60, doc.y - 11, { width: 45 });
        doc.text(calc.rate > 0 ? `${calc.weight.toLocaleString()} × $${calc.rate.toFixed(2)}` : 'Rate TBD', leftColX + 105, doc.y - 11, { width: 60 });
        doc.text(calc.rate > 0 ? `$${(calc.weight * calc.rate).toFixed(2)}` : '$XX.XX', leftColX + 170, doc.y - 11, { width: 50 });
        doc.y += 14;
      });

      const leftColEndY = doc.y;

      // ----- RIGHT COLUMN: C. Weight Determination -----
      doc.fillColor(navy).fontSize(12).font('Helvetica-Bold');
      doc.text('C. Weight Determination', rightColX, columnStartY, { width: colWidth });
      let rightY = columnStartY + 18;
      doc.fontSize(9).font('Helvetica');
      doc.text('Certified weighing methods:', rightColX, rightY, { width: colWidth });
      rightY += 18;

      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Origin Weigh:', rightColX, rightY, { width: colWidth });
      rightY += 12;
      doc.font('Helvetica').fontSize(8);
      doc.text('Vehicle weighed before loading (tare) and after loading (gross). Net weight = gross - tare.', rightColX, rightY, { width: colWidth });
      rightY += 32;

      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Destination Weigh:', rightColX, rightY, { width: colWidth });
      rightY += 12;
      doc.font('Helvetica').fontSize(8);
      doc.text('Loaded vehicle weighed on arrival (gross) and after unloading (tare). Net weight = gross - tare.', rightColX, rightY, { width: colWidth });
      rightY += 32;

      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Constructive Weight:', rightColX, rightY, { width: colWidth });
      rightY += 12;
      doc.font('Helvetica').fontSize(8);
      doc.text('For shipments under 1,000 lbs: 7 lbs per cubic foot of van space occupied.', rightColX, rightY, { width: colWidth });
      rightY += 24;

      doc.fontSize(8).font('Helvetica-Oblique');
      doc.text('All weighing on certified scales. Weight tickets provided upon request.', rightColX, rightY, { width: colWidth });

      // Set Y to the lower of the two columns
      doc.y = Math.max(leftColEndY, rightY + 20);
      doc.moveDown(0.5);

      subSection('D. Shipper\'s Right to Observe Weighing');
      paragraph('The shipper or their representative has the right to observe all weighings. If you wish to observe the weighing, please inform the driver before loading begins. The carrier must provide reasonable notice of when and where weighing will occur.');

      subSection('E. Reweigh Requests');
      paragraph('If you believe your shipment was weighed incorrectly, you have the right to request a reweigh. The reweigh must be requested before unloading or within a reasonable time after delivery. If the reweigh shows a difference of more than 100 pounds or 1% of the original weight (whichever is greater), the carrier will adjust the charges and bear the cost of the reweigh.');

      subSection('F. Fuel Surcharge');
      const fuelPct = rates.accessorial?.fuel_surcharge || 0;
      if (fuelPct > 0) {
        paragraph(`A fuel surcharge of ${fuelPct}% is applied to all transportation (line haul) charges. This surcharge helps offset fluctuations in fuel costs.`);
        doc.moveDown(0.3);
        doc.fillColor(lightGray).rect(72, doc.y, 468, 40).fill();
        doc.fillColor(navy).fontSize(10).font('Helvetica');
        doc.text(`Formula: Fuel Surcharge = Transportation Charge × ${fuelPct}%`, 82, doc.y + 8, { width: 448 });
        const fuelExampleRate = getMatrixRate(4000, 500);
        if (fuelExampleRate > 0) {
          const sampleTrans = 5000 * fuelExampleRate;
          const sampleFuel = sampleTrans * (fuelPct / 100);
          doc.text(`Example: $${sampleTrans.toFixed(2)} transportation × ${fuelPct}% = $${sampleFuel.toFixed(2)} fuel surcharge`, 82, doc.y + 10, { width: 448 });
        }
        doc.y += 45;
      } else {
        paragraph('A fuel surcharge may be applied to transportation charges based on current fuel prices. The current fuel surcharge percentage, if applicable, will be disclosed on your estimate and bill of lading.');
      }

      doc.moveDown(0.5);
      subSection('G. What Transportation Charges Include');
      paragraph('Your transportation (line haul) charge covers the following services and costs:');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(navy);
      doc.text('• Vehicle and driver for the entire journey from origin to destination', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Fuel for the vehicle (plus any applicable fuel surcharge)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Moving equipment (dollies, hand trucks, straps, load bars)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Moving blankets and basic padding for furniture protection', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Insurance coverage as required by federal regulations', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• All highway tolls incurred during transportation', 82, doc.y, { width: 448 });
      doc.moveDown(0.8);

      subSection('H. What Transportation Charges Do NOT Include');
      paragraph('The following services are billed separately and are not included in your transportation charge:');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(navy);
      doc.text('• Loading labor at origin (see Item 320)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Unloading labor at destination (see Item 320)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Packing and unpacking services (see Item 410)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Storage-in-transit (see Item 420)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Stair carry, long carry, and other accessorial services (see Items 430-440)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Valuation coverage above the minimum (see Item 500)', 82, doc.y, { width: 448 });

      // ==================== ITEM 320: ORIGIN & DESTINATION LABOR ====================
      sectionHeader('ORIGIN & DESTINATION SERVICES', '320');

      paragraph('Labor charges for loading and unloading are separate from transportation charges. For interstate household goods moves, labor is charged on a per-man, per-hour basis at the origin (loading) and destination (unloading) locations. This separation ensures transparent pricing and compliance with federal regulations.');

      const loadingRate = rates.loading?.per_man_hour || 0;
      const loadingMinHours = rates.loading?.min_hours || 2;
      const loadingMinMen = rates.loading?.min_men || 2;
      const unloadingRate = rates.unloading?.per_man_hour || 0;
      const unloadingMinHours = rates.unloading?.min_hours || 2;
      const unloadingMinMen = rates.unloading?.min_men || 2;

      doc.moveDown(0.5);
      subSection('A. Loading Labor at Origin');

      doc.fillColor(navy).rect(72, doc.y, 468, 22).fill();
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      doc.text('LOADING RATE: ' + formatRate(loadingRate, ' per man, per hour'), 82, doc.y + 5, { width: 350 });
      doc.y += 22;

      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(navy);
      doc.text(`Minimum Crew Size: ${loadingMinMen} men          Minimum Time: ${loadingMinHours} hours`, 72, doc.y, { width: 468 });
      doc.moveDown(0.8);

      paragraph('Loading labor includes the following services at the origin location:');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(navy);
      doc.text('• Protecting floors, doorways, and banisters with padding materials', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Wrapping furniture with moving blankets and padding', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Disassembly of standard furniture (beds, tables, shelving units)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Careful handling and loading of all household items onto the vehicle', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Securing items in the truck with straps and load bars', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Creating detailed inventory of all items loaded', 82, doc.y, { width: 448 });
      doc.moveDown(0.8);

      // Loading calculations table
      doc.fillColor(navy).rect(72, doc.y, 468, 20).fill();
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
      doc.text('Sample Loading Calculations', 82, doc.y + 5, { width: 200 });
      doc.text('Cost', 450, doc.y - 15, { width: 80 });
      doc.y += 20;

      const loadCalcs = [
        { desc: '2 men × 2 hours (minimum)', cost: loadingRate * 2 * 2 },
        { desc: '2 men × 4 hours', cost: loadingRate * 2 * 4 },
        { desc: '3 men × 3 hours', cost: loadingRate * 3 * 3 },
        { desc: '3 men × 5 hours', cost: loadingRate * 3 * 5 },
        { desc: '4 men × 4 hours', cost: loadingRate * 4 * 4 }
      ];

      doc.fillColor(navy).fontSize(9).font('Helvetica');
      loadCalcs.forEach((row, i) => {
        if (i % 2 === 0) {
          doc.fillColor(lightGray).rect(72, doc.y, 468, 16).fill();
        }
        doc.fillColor(navy);
        doc.text(row.desc, 82, doc.y + 3, { width: 350 });
        doc.text(loadingRate > 0 ? `$${row.cost.toFixed(2)}` : '$XX.XX', 450, doc.y - 13, { width: 80 });
        doc.y += 16;
      });

      doc.moveDown(1);
      subSection('B. Unloading Labor at Destination');

      doc.fillColor(navy).rect(72, doc.y, 468, 22).fill();
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      doc.text('UNLOADING RATE: ' + formatRate(unloadingRate, ' per man, per hour'), 82, doc.y + 5, { width: 350 });
      doc.y += 22;

      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(navy);
      doc.text(`Minimum Crew Size: ${unloadingMinMen} men          Minimum Time: ${unloadingMinHours} hours`, 72, doc.y, { width: 468 });
      doc.moveDown(0.8);

      paragraph('Unloading labor includes the following services at the destination location:');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(navy);
      doc.text('• Protecting floors, doorways, and banisters at the new residence', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Carefully unloading all items from the vehicle', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Placing furniture and boxes in designated rooms as directed', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Reassembly of furniture that was disassembled at origin', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Unwrapping furniture and removing packing materials', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Final walkthrough with customer to verify delivery', 82, doc.y, { width: 448 });
      doc.moveDown(0.8);

      // Unloading calculations table
      doc.fillColor(navy).rect(72, doc.y, 468, 20).fill();
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
      doc.text('Sample Unloading Calculations', 82, doc.y + 5, { width: 200 });
      doc.text('Cost', 450, doc.y - 15, { width: 80 });
      doc.y += 20;

      const unloadCalcs = [
        { desc: '2 men × 2 hours (minimum)', cost: unloadingRate * 2 * 2 },
        { desc: '2 men × 3 hours', cost: unloadingRate * 2 * 3 },
        { desc: '3 men × 3 hours', cost: unloadingRate * 3 * 3 },
        { desc: '3 men × 4 hours', cost: unloadingRate * 3 * 4 },
        { desc: '4 men × 3 hours', cost: unloadingRate * 4 * 3 }
      ];

      doc.fillColor(navy).fontSize(9).font('Helvetica');
      unloadCalcs.forEach((row, i) => {
        if (i % 2 === 0) {
          doc.fillColor(lightGray).rect(72, doc.y, 468, 16).fill();
        }
        doc.fillColor(navy);
        doc.text(row.desc, 82, doc.y + 3, { width: 350 });
        doc.text(unloadingRate > 0 ? `$${row.cost.toFixed(2)}` : '$XX.XX', 450, doc.y - 13, { width: 80 });
        doc.y += 16;
      });

      doc.moveDown(1);
      subSection('C. Services NOT Included in Standard Labor');
      paragraph('The following services are NOT included in standard loading/unloading labor and will be charged separately:');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor(navy);
      doc.text('• Packing and unpacking of boxes (see Item 410)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Stair carry charges for flights of stairs (see Item 430)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Long carry charges for excessive walking distance (see Item 430)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Disassembly/reassembly of specialty items (cribs, exercise equipment)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Appliance servicing (disconnecting/reconnecting washers, dryers)', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Furniture hoisting through windows or balconies', 82, doc.y, { width: 448 });
      doc.moveDown(0.3);
      doc.text('• Waiting time beyond 30 minutes due to customer delays', 82, doc.y, { width: 448 });

      doc.moveDown(1);
      subSection('D. Total Move Cost Calculation');
      paragraph('For interstate moves, the total cost is calculated using the following formula:');

      doc.moveDown(0.5);
      doc.fillColor(lightGray).rect(72, doc.y, 468, 80).fill();
      doc.fillColor(navy).fontSize(10).font('Helvetica-Bold');
      doc.text('TOTAL MOVE COST =', 82, doc.y + 8, { width: 448 });
      doc.font('Helvetica').fontSize(9);
      doc.text('1. Loading Labor: (number of men) × (hours at origin) × (per man/hour rate)', 92, doc.y + 15, { width: 438 });
      doc.text('2. Transportation: (shipment weight in lbs) × (rate per lb based on distance)', 92, doc.y + 13, { width: 438 });
      doc.text('3. Unloading Labor: (number of men) × (hours at destination) × (per man/hour rate)', 92, doc.y + 13, { width: 438 });
      doc.text('4. Accessorial Charges: packing, stairs, long carry, etc. as applicable', 92, doc.y + 13, { width: 438 });
      doc.text('5. Fuel Surcharge: percentage applied to transportation charges', 92, doc.y + 13, { width: 438 });
      doc.y += 90;

      doc.moveDown(0.5);
      subSection('E. Sample Complete Move Estimate');

      const sampleWeight = 5000;
      const sampleDistance = '500 miles';
      // Use 4000 lb tier rate for 5000 lb shipment (rounds down to applicable tier)
      const sampleTransRate = getMatrixRate(4000, 500) || 0.75;
      const sampleLoadHours = 4;
      const sampleUnloadHours = 3;
      const sampleMen = 3;

      const loadCost = loadingRate * sampleMen * sampleLoadHours;
      const transCost = sampleWeight * sampleTransRate;
      const unloadCost = unloadingRate * sampleMen * sampleUnloadHours;
      const fuelPctSample = rates.accessorial?.fuel_surcharge || 0;
      const fuelCost = transCost * (fuelPctSample / 100);
      const stairCost = (rates.accessorial?.stairs || 75) * 2;
      const subtotal = loadCost + transCost + unloadCost + fuelCost + stairCost;

      paragraph(`The following example illustrates pricing for a typical ${sampleWeight.toLocaleString()} lb household move traveling ${sampleDistance}:`);

      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');

      if (loadingRate > 0 && sampleTransRate > 0) {
        doc.fillColor(navy).rect(72, doc.y, 468, 18).fill();
        doc.fillColor('white').font('Helvetica-Bold');
        doc.text('Service', 82, doc.y + 4);
        doc.text('Calculation', 250, doc.y - 14);
        doc.text('Amount', 450, doc.y - 14);
        doc.y += 18;

        const sampleLines = [
          { service: 'Loading Labor', calc: `${sampleMen} men × ${sampleLoadHours} hrs × $${loadingRate.toFixed(2)}`, amount: `$${loadCost.toFixed(2)}` },
          { service: 'Transportation (Line Haul)', calc: `${sampleWeight.toLocaleString()} lbs × $${sampleTransRate.toFixed(2)}/lb`, amount: `$${transCost.toFixed(2)}` },
          { service: 'Unloading Labor', calc: `${sampleMen} men × ${sampleUnloadHours} hrs × $${unloadingRate.toFixed(2)}`, amount: `$${unloadCost.toFixed(2)}` },
          { service: `Fuel Surcharge (${fuelPctSample}%)`, calc: `$${transCost.toFixed(2)} × ${fuelPctSample}%`, amount: `$${fuelCost.toFixed(2)}` },
          { service: 'Stair Carry (2 flights)', calc: `2 × $${(rates.accessorial?.stairs || 75).toFixed(2)}`, amount: `$${stairCost.toFixed(2)}` }
        ];

        doc.fillColor(navy).fontSize(9).font('Helvetica');
        sampleLines.forEach((row, i) => {
          if (i % 2 === 0) {
            doc.fillColor(lightGray).rect(72, doc.y, 468, 16).fill();
          }
          doc.fillColor(navy);
          doc.text(row.service, 82, doc.y + 3, { width: 150 });
          doc.text(row.calc, 250, doc.y - 13, { width: 180 });
          doc.text(row.amount, 450, doc.y - 13, { width: 80 });
          doc.y += 16;
        });

        doc.fillColor(navy).rect(72, doc.y, 468, 20).fill();
        doc.fillColor('white').font('Helvetica-Bold').fontSize(10);
        doc.text('ESTIMATED TOTAL', 82, doc.y + 5);
        doc.text(`$${subtotal.toFixed(2)}`, 450, doc.y - 13);
        doc.y += 20;
      } else {
        doc.text('(Enter your rates in the order form to see a complete sample calculation)');
      }

      doc.moveDown(1);

      // ==================== ITEM 330: MINIMUM CHARGES ====================
      sectionHeader('MINIMUM CHARGES', '330');

      paragraph('The following minimum charges apply to all shipments regardless of actual weight or time:');

      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      doc.text(`    • Local moves (under 50 miles): ${formatRate(rates.minimums?.local)} minimum`);
      doc.text(`    • Long-distance moves (50+ miles): ${formatRate(rates.minimums?.long_distance)} minimum`);
      doc.text(`    • Minimum hours: ${rates.minimums?.hours || 2} hours`);
      doc.text('    • Small shipments (under 500 lbs): Subject to minimum charge per rate table');
      doc.moveDown(1);

      paragraph('Minimum charges ensure coverage of basic operational costs including crew, equipment, and transportation.');

      // ==================== ITEM 400: ACCESSORIAL SERVICES ====================
      sectionHeader('ACCESSORIAL SERVICES', '400');

      paragraph('The following accessorial services are available at additional charge. Not all services may be available at all locations. Services must be requested in advance when possible.');

      const allAccessorials = [
        { name: 'Packing Services', code: '410' },
        { name: 'Storage', code: '420' },
        { name: 'Stair Carry', code: '430' },
        { name: 'Long Carry', code: '430' },
        { name: 'Shuttle Service', code: '440' },
        { name: 'Bulky Items', code: '440' }
      ];

      doc.moveDown(0.5);
      doc.fontSize(10);

      subSection('Selected Services for This Tariff:');
      if (accessorials.length > 0) {
        accessorials.forEach(acc => {
          doc.text(`    ✓ ${acc}`);
        });
      } else {
        doc.text('    All standard accessorial services are available upon request.');
      }

      doc.moveDown(1);
      paragraph('See subsequent items for detailed rates and conditions for each accessorial service.');

      // ==================== ITEM 410: PACKING AND UNPACKING ====================
      sectionHeader('PACKING AND UNPACKING', '410');

      paragraph('Professional packing and unpacking services are available to protect your belongings during transport.');

      subSection('A. Packing Materials');

      // Packing materials table
      doc.fillColor(navy).rect(72, doc.y, 468, 25).fill();
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      doc.text('Material', 82, doc.y + 7, { width: 200 });
      doc.text('Unit Price', 350, doc.y - 11, { width: 100 });

      doc.y += 25;

      const packingMaterials = [
        { item: 'Small Box (1.5 cu ft)', price: '$X.XX each' },
        { item: 'Medium Box (3.0 cu ft)', price: '$X.XX each' },
        { item: 'Large Box (4.5 cu ft)', price: '$X.XX each' },
        { item: 'Wardrobe Box', price: '$XX.XX each' },
        { item: 'Dish Pack Box', price: '$XX.XX each' },
        { item: 'Packing Paper (25 lb bundle)', price: '$XX.XX' },
        { item: 'Bubble Wrap (per roll)', price: '$XX.XX' },
        { item: 'Packing Tape (per roll)', price: '$X.XX' }
      ];

      doc.fillColor(navy).fontSize(9).font('Helvetica');
      packingMaterials.forEach((row, i) => {
        if (i % 2 === 0) {
          doc.fillColor(lightGray).rect(72, doc.y, 468, 18).fill();
        }
        doc.fillColor(navy);
        doc.text(row.item, 82, doc.y + 4, { width: 200 });
        doc.text(row.price, 350, doc.y - 14, { width: 100 });
        doc.y += 18;
      });

      doc.moveDown(1);

      subSection('B. Packing Labor');
      paragraph(`Packing labor is charged at ${formatRate(rates.accessorial?.packing)} per hour per packer, with a minimum of 2 hours. Full-service packing includes all materials and labor to professionally pack the entire household.`);

      // ==================== ITEM 420: STORAGE IN TRANSIT ====================
      sectionHeader('STORAGE IN TRANSIT', '420');

      paragraph('Storage-in-transit (SIT) is available when delivery cannot be completed immediately. Goods are stored in a secure, climate-controlled facility.');

      subSection('A. Storage Rates');
      doc.fontSize(10).font('Helvetica');
      doc.text(`    • Monthly storage: ${formatRate(rates.accessorial?.storage)} per month`);
      doc.text('    • Handling-in: $X.XX per 100 lbs');
      doc.text('    • Handling-out: $X.XX per 100 lbs');
      doc.moveDown(0.5);

      subSection('B. Storage Conditions');
      paragraph('Storage charges begin on the date goods are placed in storage. The shipper is responsible for storage charges until goods are removed. A minimum of 48 hours notice is required for removal from storage.');

      // ==================== ITEM 430: EXTRA LABOR CHARGES ====================
      sectionHeader('EXTRA LABOR CHARGES', '430');

      paragraph('Additional labor charges apply when extra effort is required to complete the move:');

      subSection('A. Stair Carry');
      doc.fontSize(10).font('Helvetica');
      doc.text(`    • Per flight of stairs (8+ steps): ${formatRate(rates.accessorial?.stairs)} per flight`);
      doc.text('    • Applicable at both origin and destination');
      doc.text('    • Elevator service: No charge when available and operational');
      doc.moveDown(0.5);

      subSection('B. Long Carry');
      doc.text(`    • Distance exceeding 75 feet from truck to door: ${formatRate(rates.accessorial?.long_carry)} per 100 feet`);
      doc.text('    • Measured at both origin and destination');
      doc.moveDown(0.5);

      subSection('C. Waiting Time');
      paragraph(`If crew must wait due to circumstances beyond carrier's control (elevator delays, customer not ready, etc.), waiting time is charged at ${formatRate(rates.accessorial?.waiting)} per hour after the first 30 minutes.`);

      // ==================== ITEM 440: SPECIAL SERVICES ====================
      sectionHeader('SPECIAL SERVICES', '440');

      subSection('A. Shuttle Service');
      paragraph('When access to the residence is restricted and the primary vehicle cannot reach the loading/unloading point, a shuttle vehicle may be required.');
      doc.fontSize(10).font('Helvetica');
      doc.text(`    • Shuttle charge: ${formatRate(rates.accessorial?.shuttle)} minimum`);
      doc.moveDown(0.5);

      subSection('B. Bulky Items');
      paragraph('Additional charges apply for items requiring special handling due to size, weight, or fragility:');
      doc.text(`    • Piano (upright): ${formatRate(rates.specialty?.piano_upright)}`);
      doc.text(`    • Piano (grand): ${formatRate(rates.specialty?.piano_grand)}`);
      doc.text(`    • Pool table: ${formatRate(rates.specialty?.pool_table)}`);
      doc.text(`    • Safe (per 100 lbs): ${formatRate(rates.specialty?.safe)}`);
      doc.text('    • Hot tub/spa: Quote required');
      doc.text(`    • Gym equipment: ${formatRate(rates.specialty?.gym)} per piece`);
      doc.text(`    • Appliance service: ${formatRate(rates.specialty?.appliance)}`);
      doc.moveDown(0.5);

      subSection('C. Third-Party Services');
      paragraph('The carrier can arrange for third-party services such as appliance servicing, crating, and specialty item handling. Charges are quoted separately.');

      // ==================== ITEM 500: VALUATION AND LIABILITY ====================
      sectionHeader('VALUATION AND LIABILITY', '500');

      paragraph('Federal law requires carriers to offer shippers the opportunity to select the level of carrier liability for loss or damage to their goods.');

      subSection('A. Shipper\'s Responsibility');
      paragraph('It is the shipper\'s responsibility to:');
      doc.fontSize(10).font('Helvetica');
      doc.text('    • Declare the value of the shipment before moving');
      doc.text('    • Select the appropriate level of liability coverage');
      doc.text('    • Sign the appropriate valuation declaration');
      doc.text('    • Understand the terms of the selected coverage');
      doc.moveDown(0.5);

      subSection('B. Carrier\'s Liability');
      paragraph('The carrier\'s liability for loss or damage is limited to the valuation option selected by the shipper. The two options available are described in Items 510 and 520.');

      // ==================== ITEM 510: RELEASED VALUE ====================
      sectionHeader('RELEASED VALUE', '510');

      paragraph('Released Value protection is the most economical option and is provided at no additional charge.');

      subSection('Coverage');
      doc.fontSize(10).font('Helvetica');
      doc.text('    • Carrier liability: $0.60 per pound per article');
      doc.text('    • No additional charge for this coverage');
      doc.text('    • Example: A 50-pound item would have maximum coverage of $30.00');
      doc.moveDown(0.5);

      subSection('Limitations');
      paragraph('This option does not provide full replacement value protection. Shippers with valuable items should consider Full Value Protection.');

      // ==================== ITEM 520: FULL VALUE PROTECTION ====================
      sectionHeader('FULL VALUE PROTECTION', '520');

      paragraph('Full Value Protection (FVP) provides comprehensive coverage for loss or damage to your shipment.');

      subSection('Coverage');
      doc.fontSize(10).font('Helvetica');
      doc.text('    • Carrier will repair, replace, or provide cash settlement for lost/damaged items');
      doc.text('    • Minimum valuation: $6.00 per pound multiplied by shipment weight');
      doc.text('    • Higher declared values available at additional cost');
      doc.moveDown(0.5);

      subSection('Cost');
      paragraph('Full Value Protection is charged based on the declared value of the shipment:');
      doc.text('    • Standard rate: $X.XX per $100 of declared value');
      doc.text('    • Deductible options may reduce premium cost');
      doc.moveDown(0.5);

      subSection('Deductible Options');
      doc.text('    • $0 deductible (standard): Full premium rate');
      doc.text('    • $250 deductible: XX% reduction in premium');
      doc.text('    • $500 deductible: XX% reduction in premium');

      // ==================== ITEM 600: CLAIMS PROCEDURES ====================
      sectionHeader('CLAIMS PROCEDURES', '600');

      paragraph('In the event of loss or damage to your shipment, the following procedures apply:');

      subSection('A. Filing a Claim');
      doc.fontSize(10).font('Helvetica');
      doc.text('    1. Notify the carrier of any loss or damage at time of delivery');
      doc.text('    2. Note all damage on the delivery receipt/inventory');
      doc.text('    3. File a written claim within 9 months of delivery');
      doc.text('    4. Include documentation: photos, receipts, repair estimates');
      doc.moveDown(0.5);

      subSection('B. Carrier Response');
      paragraph('Upon receipt of a claim, the carrier will:');
      doc.text('    • Acknowledge receipt within 30 days');
      doc.text('    • Complete investigation of the claim');
      doc.text('    • Pay, decline, or make settlement offer within 120 days');
      doc.moveDown(0.5);

      subSection('C. Arbitration');
      paragraph('If you are not satisfied with the carrier\'s response, you may request arbitration. For claims of $10,000 or less, the carrier must participate in binding arbitration if you request it. See your Arbitration Summary for details.');

      // ==================== ITEM 700: PAYMENT TERMS ====================
      sectionHeader('PAYMENT TERMS', '700');

      subSection('A. Payment Due');
      paragraph('Payment of all charges is due upon delivery unless credit has been arranged in advance. The carrier reserves the right to require payment before unloading.');

      subSection('B. Accepted Payment Methods');
      doc.fontSize(10).font('Helvetica');
      doc.text('    • Cash or certified check');
      doc.text('    • Credit card (Visa, MasterCard, American Express, Discover)');
      doc.text('    • Personal check (with prior approval and valid ID)');
      doc.text('    • Money order or cashier\'s check');
      doc.moveDown(0.5);

      subSection('C. Charges Subject to Collection');
      paragraph('If payment is not received, the carrier may:');
      doc.text('    • Place goods in storage at shipper\'s expense');
      doc.text('    • Assess storage and redelivery charges');
      doc.text('    • Exercise carrier\'s lien rights under applicable law');
      doc.moveDown(0.5);

      subSection('D. Binding vs. Non-Binding Estimates');
      paragraph('BINDING ESTIMATE: The total charges will not exceed the estimate amount, provided there are no changes to the services requested.');
      paragraph('NON-BINDING ESTIMATE: Actual charges may vary based on actual weight and services. Federal law limits collect-on-delivery charges to the estimate plus 10% on non-binding estimates.');

      // ==================== ITEM 800: CUSTOMER DISCLOSURES ====================
      sectionHeader('CUSTOMER DISCLOSURES', '800');

      paragraph('Federal regulations require the carrier to provide the following documents to all shippers:');

      subSection('A. Required Documents');
      doc.fontSize(10).font('Helvetica');
      doc.text('    • "Your Rights and Responsibilities When You Move" booklet');
      doc.text('    • Written estimate of charges');
      doc.text('    • Order for Service');
      doc.text('    • Bill of Lading');
      doc.text('    • Inventory of items');
      doc.text('    • Arbitration information');
      doc.moveDown(0.5);

      subSection('B. Before the Move');
      paragraph('Before loading, the carrier will provide a written estimate and explain valuation options. The shipper must sign the valuation declaration and receive a copy of all documents.');

      subSection('C. At Delivery');
      paragraph('At delivery, the shipper should:');
      doc.text('    • Be present or have an authorized representative present');
      doc.text('    • Verify inventory and note any loss or damage');
      doc.text('    • Sign delivery documents');
      doc.text('    • Make payment as agreed');

      // ==================== ITEM 900: GENERAL RULES ====================
      sectionHeader('GENERAL RULES', '900');

      subSection('A. Carrier\'s Equipment');
      paragraph('The carrier provides all necessary equipment for a standard residential move, including the moving vehicle, dollies, blankets, and hand tools. Specialty equipment may incur additional charges.');

      subSection('B. Access Requirements');
      paragraph('The shipper is responsible for ensuring adequate access for the carrier\'s vehicles and equipment. Parking permits, building access, and elevator reservations are the shipper\'s responsibility.');

      subSection('C. Items Prepared by Shipper');
      paragraph('Items packed by the shipper (PBO - Packed By Owner) are transported at owner\'s risk unless damage to the container is evident. The carrier is not liable for damage to contents of PBO containers.');

      subSection('D. Appliances');
      paragraph('The shipper is responsible for preparing appliances for transport (disconnecting, draining, securing drums, etc.) unless the carrier is contracted to provide this service.');

      subSection('E. Delays');
      paragraph('The carrier is not responsible for delays caused by weather, road conditions, mechanical failure, or other circumstances beyond its control. The carrier will make reasonable efforts to notify the shipper of delays.');

      subSection('F. Amendment');
      paragraph('This tariff may be amended at any time. The current version supersedes all previous versions.');

      // ==================== SIGNATURE PAGE ====================
      doc.addPage();

      doc.fillColor(navy)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('TARIFF ACKNOWLEDGMENT', { align: 'center' });

      doc.moveDown(1);
      doc.strokeColor(gold).lineWidth(2).moveTo(72, doc.y).lineTo(540, doc.y).stroke();
      doc.moveDown(1);

      paragraph('This tariff has been prepared for:');

      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica-Bold').text(user.company_name || 'Company Name');
      doc.fontSize(11).font('Helvetica');
      doc.text(`MC Number: ${user.mc_number || 'N/A'}`);
      doc.text(`USDOT Number: ${user.usdot_number || 'N/A'}`);
      doc.text(`Effective Date: ${formattedEffectiveDate}`);

      doc.moveDown(2);

      paragraph('This tariff is the official rate schedule for the carrier identified above and is published in compliance with federal regulations. The carrier agrees to:');
      doc.fontSize(10).font('Helvetica');
      doc.text('    1. Maintain this tariff and make it available for customer inspection upon request');
      doc.text('    2. Provide customers with accurate estimates based on these published rates');
      doc.text('    3. File amendments when rates or services change');
      doc.text('    4. Perform all services in accordance with applicable FMCSA regulations');

      doc.moveDown(2);

      doc.fillColor(lightGray).rect(72, doc.y, 468, 100).fill();
      doc.fillColor(navy).fontSize(10);
      doc.text('Carrier Acknowledgment:', 90, doc.y + 15);
      doc.moveDown(0.5);
      doc.text('Authorized Signature: _________________________________', 90);
      doc.moveDown(0.3);
      doc.text('Printed Name: _________________________________', 90);
      doc.moveDown(0.3);
      doc.text('Title: _________________________________', 90);
      doc.moveDown(0.3);
      doc.text('Date: _________________________________', 90);

      doc.y += 85;
      doc.moveDown(2);

      // Footer
      doc.fillColor('#666')
        .fontSize(8)
        .text('This tariff document was generated by Interstate Compliance Solutions.', { align: 'center' })
        .text(`Document ID: TARIFF-${user.mc_number?.replace(/[^a-zA-Z0-9]/g, '') || 'N/A'}-${Date.now()}`, { align: 'center' })
        .text('www.interstatecompliancesolutions.com', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate "Your Rights and Responsibilities When You Move" PDF
 * Required FMCSA document for all HHG shippers
 * @param {Object} user - User data
 * @param {boolean} returnBuffer - If true, returns buffer instead of file path
 * @returns {Promise<string|Buffer>} - File path or buffer
 */
const generateRightsAndResponsibilitiesPDF = async (user, returnBuffer = false) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 60, bottom: 60, left: 72, right: 72 },
        info: {
          Title: 'Your Rights and Responsibilities When You Move',
          Author: user.company_name || 'Interstate Compliance Solutions',
          Subject: 'FMCSA Required Consumer Information'
        }
      });

      const chunks = [];

      if (returnBuffer) {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        const fileName = `rights-responsibilities-${user.mc_number?.replace(/[^a-zA-Z0-9]/g, '') || user.id}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, fileName);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        writeStream.on('finish', () => resolve(`/temp/${fileName}`));
      }

      const navy = '#0a1628';
      const gold = '#c9a227';
      const blue = '#004c97';
      const lightBlue = '#e8f4fc';

      // Helper: check page break
      const checkPage = (needed = 100) => {
        if (doc.y > 680 - needed) doc.addPage();
      };

      // Helper: major section header (blue bar)
      const majorSection = (title) => {
        checkPage(80);
        const rectY = doc.y;
        doc.fillColor(blue).rect(72, rectY, 468, 28).fill();
        doc.fillColor('white').fontSize(16).font('Helvetica-Bold');
        doc.text(title, 82, rectY + 7, { width: 448 });
        doc.y = rectY + 38;
        doc.fillColor(navy).fontSize(10).font('Helvetica');
      };

      // Helper: subsection header
      const subSection = (title) => {
        checkPage(60);
        doc.moveDown(0.5);
        doc.fillColor(blue).fontSize(12).font('Helvetica-Bold').text(title, { width: 468 });
        doc.moveDown(0.3);
        doc.fillColor(navy).fontSize(10).font('Helvetica');
      };

      // Helper: paragraph
      const para = (text) => {
        checkPage(50);
        doc.fillColor(navy).fontSize(10).font('Helvetica').text(text, { align: 'justify', width: 468 });
        doc.moveDown(0.5);
      };

      // Helper: bullet
      const bullet = (text, indent = 20) => {
        doc.fillColor(navy).fontSize(10).font('Helvetica').text(`• ${text}`, 72 + indent, doc.y, { width: 468 - indent });
        doc.moveDown(0.2);
      };

      // Helper: numbered item
      const numbered = (num, text) => {
        const startY = doc.y;
        doc.fillColor(gold).fontSize(10).font('Helvetica-Bold').text(num, 82, startY);
        const textHeight = doc.heightOfString(text, { width: 440 });
        doc.fillColor(navy).fontSize(10).font('Helvetica').text(text, 100, startY, { width: 440 });
        doc.y = startY + Math.max(textHeight, 14) + 5;
      };

      // ==================== COVER PAGE ====================
      doc.rect(0, 0, 612, 400).fill(navy);

      doc.fillColor(gold).fontSize(36).font('Helvetica-Bold');
      doc.text('Your Rights', 0, 100, { align: 'center', width: 612 });
      doc.fillColor('white').text('and', { align: 'center', width: 612 });
      doc.fillColor(gold).text('Responsibilities', { align: 'center', width: 612 });
      doc.fillColor('white').text('When You Move', { align: 'center', width: 612 });

      doc.y = 420;
      doc.fillColor(navy).fontSize(12).font('Helvetica');
      doc.text('Furnished By Your Mover, As Required By Federal Law', { align: 'center' });

      doc.moveDown(2);

      // Carrier box
      doc.fillColor(lightBlue).rect(120, doc.y, 372, 90).fill();
      const cBoxY = doc.y;
      doc.fillColor(navy).fontSize(14).font('Helvetica-Bold');
      doc.text(user.company_name || 'Your Moving Company', 140, cBoxY + 15, { width: 332, align: 'center' });
      doc.fontSize(10).font('Helvetica');
      doc.text(`MC#: ${user.mc_number || 'N/A'}  |  USDOT#: ${user.usdot_number || 'N/A'}`, 140, cBoxY + 38, { width: 332, align: 'center' });
      doc.text(`Phone: ${user.phone || 'N/A'}`, 140, cBoxY + 53, { width: 332, align: 'center' });
      doc.text(`${user.city || ''}, ${user.state || ''}`.trim() || 'Address on file', 140, cBoxY + 68, { width: 332, align: 'center' });

      doc.y = cBoxY + 110;
      doc.moveDown(2);

      doc.fillColor('#666').fontSize(9);
      doc.text('U.S. Department of Transportation', { align: 'center' });
      doc.fillColor(navy).font('Helvetica-Bold');
      doc.text('Federal Motor Carrier Safety Administration', { align: 'center' });

      // ==================== TABLE OF CONTENTS ====================
      doc.addPage();
      doc.fillColor(navy).fontSize(20).font('Helvetica-Bold').text('TABLE OF CONTENTS', { align: 'left' });
      doc.moveDown(1);

      const tocItems = [
        'General Requirements',
        'Regulations and Interstate Transportation',
        'Legitimate Movers and Brokers',
        'Customer\'s Responsibilities',
        'Estimates',
        'Your Mover\'s Liability and Your Claims',
        'Moving Paperwork',
        'Collection of Charges',
        'Transportation of your Shipment',
        'Resolving Disputes with your Mover',
        'Important Points to Remember',
        'Definitions and Common Terms'
      ];

      doc.fontSize(11).font('Helvetica').fillColor(navy);
      tocItems.forEach((item, i) => {
        doc.text(`${item}`, 72, doc.y, { width: 400 });
        doc.moveDown(0.4);
      });

      // ==================== GENERAL REQUIREMENTS ====================
      doc.addPage();
      majorSection('General Requirements');

      para('The Federal Motor Carrier Safety Administration\'s (FMCSA) regulations protect consumers of interstate moves and define the rights and responsibilities of consumers (shippers) and household goods carriers (movers).');

      para('The household goods motor carrier gave you this booklet to provide information about your rights and responsibilities as an individual shipper of household goods. Your primary responsibilities are to ensure that you understand the terms and conditions of the moving contract (bill of lading), and know what to do in case problems arise.');

      para('The primary responsibility for protecting your move lies with you in selecting a reputable household goods mover or household goods broker, and making sure you understand the terms and conditions of your contract and the remedies that are available to you in case problems arise.');

      majorSection('Regulations and Interstate Transportation');

      para('FMCSA\'s regulations apply to motor carriers that engage in the interstate transportation of household goods and brokers that arrange for such transportation. These regulations require your mover to perform certain services and provide you with specific documents.');

      para('The regulations only apply to your mover when the mover transports your household goods by motor vehicle in interstate or foreign commerce – that is when you move from one State to another or internationally. The regulations do not apply when your move takes place within a commercial zone or between two points in the same State.');

      // ==================== LEGITIMATE MOVERS ====================
      doc.addPage();
      majorSection('Legitimate Movers and Brokers');

      para('Legitimate movers and brokers are registered with FMCSA to engage in interstate operations involving the interstate transportation of household goods. A legitimate mover explains whether they are a broker or a mover.');

      para('Household goods brokers or movers must provide you with basic information before you move. You should expect to receive:');

      bullet('A written estimate');
      bullet('The "Ready to Move" Brochure');
      bullet('Information about the mover\'s arbitration program');
      bullet('Written notice about access to the mover\'s tariff');
      bullet('The process for handling claims');
      bullet('This booklet, "Your Rights and Responsibilities When You Move"');

      doc.moveDown(0.5);
      para('You should avoid brokers and movers that are not registered with FMCSA or refuse to perform a physical survey of your household goods.');

      majorSection('Customer\'s Responsibilities');

      para('As a customer, you have responsibilities both to your mover and yourself. They include:');

      bullet('Reading all moving documents issued by the mover or broker');
      bullet('Being available at the time of pickup and delivery of your shipment');
      bullet('Promptly notifying your mover if something has changed regarding your shipment');
      bullet('Making payment in the amount required and in the form agreed to');
      bullet('Promptly filing claims for loss, damage or delays with your mover, if necessary');

      // ==================== ESTIMATES ====================
      doc.addPage();
      majorSection('Estimates');

      para('Your mover must provide an estimate based upon a physical survey of your household goods. A physical survey means a survey which is conducted on-site or virtually, that allows your mover to see the household goods to be transported.');

      para('FMCSA requires your mover to provide written estimates on every shipment transported for you. Your mover must provide you with a written estimate of all charges including transportation, accessorial and advanced charges. This written estimate must be dated and signed by you and the mover.');

      para('The estimate provided to you by your mover will include a statement notifying you of two options of liability coverage for your shipment:');

      bullet('Full Value Protection');
      bullet('Waiver of Full Value Protection (Released Value of 60 cents per pound per article)');

      subSection('Binding Estimates');

      para('A binding estimate guarantees that you cannot be required to pay more than the amount on the estimate at the time of delivery. However, if you add additional items to your shipment or request additional services, you and your mover may agree to prepare a new binding estimate or convert to a non-binding estimate.');

      para('If you are unable to pay 100 percent of the charges on a binding estimate at delivery, your mover may place your shipment in storage at your expense.');

      subSection('Non-Binding Estimates');

      para('A non-binding estimate is intended to provide you with an estimate of the cost of your move. It is not a guarantee of your final costs, but it should be reasonably accurate. The estimate must indicate that your final charges will be based upon the actual weight of your shipment, the services provided, and the mover\'s published tariff.');

      para('Under a non-binding estimate, the mover cannot require you to pay more than 110 percent of the non-binding estimate at the time of delivery. The mover will bill you for any remaining charges after 30 days from delivery.');

      // ==================== LIABILITY ====================
      doc.addPage();
      majorSection('Your Mover\'s Liability and Your Claims');

      para('In general, your mover is legally liable for loss or damage that occurs during the transportation of your shipment and all related services identified on the bill of lading.');

      para('All moving companies are required to assume liability for the value of the household goods they transport. There are two different levels of liability that apply to interstate moves:');

      subSection('Full Value Protection');

      para('This is the most comprehensive option available to protect your household goods, but it will increase the cost of your move. Under your mover\'s Full Value Protection level of liability, if any article is lost, destroyed or damaged while in your mover\'s custody, your mover will, at its option, either:');

      numbered('1', 'Repair the article to the extent necessary to restore it to the same condition as when it was received by your mover, or pay you for the cost of such repairs.');
      numbered('2', 'Replace the article with an article of like, kind and quality, or pay you for the cost to replace the items.');

      para('The minimum level for determining the Full Value Protection of your shipment is $6.00 per pound times the weight of your shipment.');

      subSection('Waiver of Full Value Protection (Released Value - 60 cents per pound)');

      para('Released Value is minimal protection; however, it is the most economical protection available as there is no charge to you. Under this option, the mover assumes liability for no more than 60 cents per pound, per article.');

      const exBoxY = doc.y;
      doc.fillColor(lightBlue).rect(72, exBoxY, 468, 45).fill();
      doc.fillColor(navy).fontSize(9).font('Helvetica-Oblique');
      doc.text('Example: If a 10 pound stereo component valued at $1,000 were lost or destroyed, the mover would be liable for no more than $6.00 (10 pounds x $0.60).', 82, exBoxY + 10, { width: 448 });
      doc.y = exBoxY + 55;

      subSection('Loss and Damage Claims');

      para('You have 9 months from the date of delivery to file your claim. The claim must be submitted in writing to your mover. After you submit your claim, your mover has 30 days to acknowledge receipt of it. The mover then has 120 days to provide you with a disposition.');

      // ==================== MOVING PAPERWORK ====================
      doc.addPage();
      majorSection('Moving Paperwork');

      const warnBoxY = doc.y;
      doc.fillColor(blue).rect(72, warnBoxY, 468, 30).fill();
      doc.fillColor('white').fontSize(11).font('Helvetica-Bold');
      doc.text('DO NOT SIGN BLANK DOCUMENTS!', 82, warnBoxY + 8, { width: 448, align: 'center' });
      doc.y = warnBoxY + 40;

      subSection('Inventory');

      para('Your mover must prepare an inventory of your shipment. This is usually done at the time the mover loads your shipment. The mover is required to list any damage or unusual wear to any items.');

      para('After completing the inventory, both you and the mover must sign each page. It is important that before signing you make sure the inventory lists every item in your shipment and that entries regarding the condition of each item are correct.');

      subSection('Bill of Lading');

      para('Your mover is required by law to prepare a bill of lading for your shipment. The bill of lading is the contract between you and the mover for the transportation of your shipment. The driver who loads your shipment must give you a copy of the bill of lading before or at the time of loading your shipment.');

      doc.fillColor(blue).fontSize(10).font('Helvetica-Bold');
      doc.text('IT IS YOUR RESPONSIBILITY TO READ THE BILL OF LADING BEFORE YOU ACCEPT IT', { align: 'center' });
      doc.moveDown(0.5);

      para('The bill of lading requires the mover to provide the service you requested and requires you to pay the charges for the service. If you do not agree with something on the bill of lading, do not sign it until you are satisfied it is correct.');

      subSection('Weight Tickets');

      para('Your mover must obtain weight tickets if your shipment is moving under a non-binding estimate. Each time your shipment is weighed, a separate weight ticket must be obtained and signed by the weigh master. The weight tickets must be presented with the invoice.');

      // ==================== COLLECTION OF CHARGES ====================
      doc.addPage();
      majorSection('Collection of Charges');

      para('Your mover must issue you an honest and truthful invoice for each shipment transported. When your shipment is delivered you will be expected to pay either:');

      numbered('1', '100 percent of the charges on your binding estimate, or');
      numbered('2', '110 percent of the charges on your non-binding estimate.');

      para('You should verify in advance what method of payment your mover will accept. Your mover must note in writing on the bill of lading the forms of payment it accepts at delivery.');

      para('If you do not pay the charges due at the time of delivery the mover has the right to refuse to deliver your shipment and to place it into storage at your expense until the charges are paid.');

      majorSection('Transportation of your Shipment');

      subSection('Pickup and Delivery');

      para('Before you move, be sure to reach an agreement with your mover on the dates for pickup and delivery of your shipment. Once an agreement is reached, your mover must enter those dates upon the bill of lading.');

      para('Do not agree to have your shipment picked up or delivered "as soon as possible". The dates or periods you and your mover agree upon should be definite.');

      subSection('Weighing Shipments');

      para('If your mover transports your household goods on a non-binding estimate, your mover must determine the actual weight of your shipment on a certified scale in order to calculate its lawful tariff charge.');

      para('You have the right, and your mover must inform you of your right, to observe all weighing of your shipment. If you believe that the weight may not be accurate, you have the right to request that the shipment be reweighed before it is unloaded.');

      // ==================== RESOLVING DISPUTES ====================
      doc.addPage();
      majorSection('Resolving Disputes with your Mover');

      para('The FMCSA maintains regulations to govern the processing of loss and damage claims, however, we cannot resolve these claims on your behalf. If you cannot reach a settlement with your mover, you have the right to request arbitration from your mover.');

      para('All movers are required to participate in an arbitration program and your mover is required to provide you with a summary of its arbitration program before you sign the bill of lading.');

      subSection('Arbitration');

      para('Arbitration gives you the opportunity to settle loss or damage claims and certain types of disputed charges through a neutral arbitrator. You may find submitting your claim to arbitration is a less expensive and more convenient way to seek recovery of your claim than filing a lawsuit.');

      bullet('For claims of $10,000 or less, the mover must agree to arbitration if you request it');
      bullet('For claims over $10,000, both parties must agree to arbitration');
      bullet('The arbitrator\'s decision is binding on both parties');

      doc.moveDown(0.5);

      const fmcsaBoxY = doc.y;
      doc.fillColor(blue).rect(72, fmcsaBoxY, 468, 50).fill();
      doc.fillColor('white').fontSize(11).font('Helvetica-Bold');
      doc.text('The FMCSA cannot settle your dispute with your mover.', 82, fmcsaBoxY + 8, { width: 448, align: 'center' });
      doc.fontSize(9).font('Helvetica');
      doc.text('You must resolve your own loss and damage and/or moving charge disputes with your mover.', 82, fmcsaBoxY + 28, { width: 448, align: 'center' });
      doc.y = fmcsaBoxY + 60;

      para('If your mover refuses to deliver your shipment unless you pay an amount the mover is not entitled to charge – contact FMCSA immediately at (888) 368-7238.');

      // ==================== IMPORTANT POINTS ====================
      doc.addPage();
      majorSection('Important Points to Remember');

      const importantPoints = [
        'Movers must give written estimates. The estimates may be either binding or non-binding.',
        'Do not sign blank documents. Verify the document is complete before you sign.',
        'Be sure you understand the mover\'s responsibility for loss or damage.',
        'Understand the type of liability to which you agree.',
        'Notify your mover if you have high value items (valued at more than $100 per pound).',
        'You have the right to be present each time your shipment is weighed.',
        'Confirm with your mover the types of payment acceptable prior to delivery.',
        'Consider requesting arbitration to settle disputed claims with your mover.',
        'Know if the company you are dealing with is a mover or broker.',
        'Do not sign the delivery receipt if it contains language releasing the mover from liability.'
      ];

      importantPoints.forEach((point, i) => {
        checkPage(40);
        const startY = doc.y;
        doc.fillColor(gold).fontSize(14).font('Helvetica-Bold').text(`${i + 1}`, 72, startY);
        const textHeight = doc.heightOfString(point, { width: 440, fontSize: 10 });
        doc.fillColor(navy).fontSize(10).font('Helvetica').text(point, 100, startY, { width: 440 });
        doc.y = startY + Math.max(textHeight, 18) + 8;
      });

      // ==================== DEFINITIONS ====================
      doc.addPage();
      majorSection('Definitions and Common Terms');

      const definitions = [
        { term: 'Bill of Lading', def: 'The receipt for your shipment and the contract for its transportation.' },
        { term: 'Binding Estimate', def: 'A written agreement that guarantees the total cost of the move based on the items and services listed.' },
        { term: 'Broker', def: 'A company that arranges for the transportation of household goods by a registered moving company.' },
        { term: 'Full Value Protection', def: 'The liability coverage option where the mover will repair, replace, or pay for lost/damaged items.' },
        { term: 'Household Goods', def: 'Personal effects or property used in a dwelling, transported as part of a move.' },
        { term: 'Inventory', def: 'The detailed list of your household goods showing the number and condition of each item.' },
        { term: 'Line-Haul Charges', def: 'The charges for the transportation portion of your move.' },
        { term: 'Non-Binding Estimate', def: 'The carrier\'s approximation of cost based on estimated weight and services.' },
        { term: 'Released Value', def: 'Minimal protection where mover liability is limited to 60 cents per pound per article.' },
        { term: 'Tariff', def: 'A document containing rates, rules, regulations, and provisions issued by the mover.' },
        { term: 'Valuation', def: 'The monetary value you declare for your shipment, determining maximum liability.' }
      ];

      definitions.forEach(d => {
        checkPage(40);
        doc.fillColor(navy).fontSize(10).font('Helvetica-Bold').text(d.term, 72, doc.y, { continued: true });
        doc.font('Helvetica').text(` – ${d.def}`, { width: 468 });
        doc.moveDown(0.4);
      });

      // ==================== FOOTER ON LAST PAGE ====================
      doc.moveDown(2);
      doc.strokeColor(gold).lineWidth(1).moveTo(72, doc.y).lineTo(540, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fillColor('#666').fontSize(8).font('Helvetica');
      doc.text('U.S. Department of Transportation - Federal Motor Carrier Safety Administration', { align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Document provided by: ${user.company_name || 'Moving Company'}`, { align: 'center' });
      doc.text(`MC#: ${user.mc_number || 'N/A'} | USDOT#: ${user.usdot_number || 'N/A'}`, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate "Ready to Move" Guide PDF
 * FMCSA recommended consumer preparation guide
 * @param {Object} user - User data
 * @param {boolean} returnBuffer - If true, returns buffer instead of file path
 * @returns {Promise<string|Buffer>} - File path or buffer
 */
const generateReadyToMovePDF = async (user, returnBuffer = false) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 54, bottom: 54, left: 54, right: 54 },
        info: {
          Title: 'Ready to Move - FMCSA Consumer Guide',
          Author: user.company_name || 'Interstate Compliance Solutions',
          Subject: 'Interstate Moving Consumer Information'
        }
      });

      const chunks = [];

      if (returnBuffer) {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        const fileName = `ready-to-move-${user.mc_number?.replace(/[^a-zA-Z0-9]/g, '') || user.id}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, fileName);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        writeStream.on('finish', () => resolve(`/temp/${fileName}`));
      }

      const navy = '#003366';
      const gold = '#c9a227';
      const blue = '#0066cc';
      const darkGray = '#333333';

      // Helper: draw checkbox and text
      const checkboxItem = (text, indent = 10) => {
        const startY = doc.y;
        // Draw checkbox square
        doc.rect(54 + indent, startY + 2, 8, 8).stroke(navy);
        // Draw text
        doc.fillColor(darkGray).fontSize(10).font('Helvetica');
        doc.text(text, 54 + indent + 14, startY, { width: 490 - indent - 14 });
        doc.moveDown(0.35);
      };

      // Helper function for section headers
      const sectionHeader = (title) => {
        const rectY = doc.y;
        doc.fillColor(navy).rect(54, rectY, 504, 22).fill();
        doc.fillColor('white').fontSize(12).font('Helvetica-Bold');
        doc.text(title, 60, rectY + 5, { width: 492 });
        doc.y = rectY + 30;
      };

      // Helper to check page space
      const checkPage = (needed = 100) => {
        if (doc.y > 700 - needed) {
          doc.addPage();
        }
      };

      // ==================== COVER PAGE ====================
      // Blue header bar
      doc.rect(0, 0, 612, 100).fill(navy);

      doc.fillColor('white').fontSize(28).font('Helvetica-Bold');
      doc.text('READY TO MOVE', 54, 30, { align: 'center', width: 504 });
      doc.fontSize(14).font('Helvetica');
      doc.text('Tips for a Successful Interstate Move', 54, 65, { align: 'center', width: 504 });

      doc.y = 120;

      // Carrier info box
      doc.fillColor(navy).rect(100, doc.y, 412, 75).fill();
      const boxY = doc.y;
      doc.fillColor('white').fontSize(13).font('Helvetica-Bold');
      doc.text(user.company_name || 'Your Moving Company', 110, boxY + 12, { width: 392, align: 'center' });
      doc.fontSize(10).font('Helvetica');
      doc.text(`MC: ${user.mc_number || 'N/A'}  |  USDOT: ${user.usdot_number || 'N/A'}`, 110, boxY + 32, { width: 392, align: 'center' });
      doc.text(`Phone: ${user.phone || 'N/A'}  |  Email: ${user.email || 'N/A'}`, 110, boxY + 48, { width: 392, align: 'center' });

      doc.y = boxY + 95;

      // Introduction
      doc.fillColor(darkGray).fontSize(10).font('Helvetica');
      doc.text('This brochure provides important information from the Federal Motor Carrier Safety Administration (FMCSA) to help you prepare for your interstate move. Use the checklists below to stay organized before, during, and after your move.', {
        align: 'justify',
        width: 504
      });

      doc.moveDown(1);

      // Gold divider
      doc.strokeColor(gold).lineWidth(2).moveTo(54, doc.y).lineTo(558, doc.y).stroke();
      doc.moveDown(0.8);

      // ==================== BEFORE YOU MOVE CHECKLIST ====================
      sectionHeader('BEFORE YOU MOVE CHECKLIST');

      doc.fillColor(darkGray).fontSize(10).font('Helvetica');

      const beforeMove = [
        'Research and get written estimates from at least 3 moving companies',
        'Verify your mover\'s registration at www.safersys.gov (FMCSA website)',
        'Confirm your mover has a valid USDOT number and MC number',
        'Check for complaints filed against your mover with FMCSA',
        'Read and understand all documents before signing',
        'Get a written estimate - know if it\'s binding or non-binding',
        'Ask about the mover\'s liability/valuation coverage options',
        'Review the "Your Rights and Responsibilities When You Move" booklet',
        'Create a detailed inventory of your belongings',
        'Keep valuable items (jewelry, documents, medications) with you',
        'Know what items movers cannot transport (hazardous materials, plants, etc.)',
        'Get everything in writing - don\'t rely on verbal promises',
        'Understand payment requirements and accepted methods',
        'Ask about additional charges (stairs, long carry, shuttle service)',
        'Confirm pickup and delivery dates in writing'
      ];

      beforeMove.forEach(item => {
        checkPage(20);
        checkboxItem(item);
      });

      // ==================== MOVING DAY CHECKLIST ====================
      checkPage(180);
      doc.moveDown(0.8);
      sectionHeader('MOVING DAY CHECKLIST');

      doc.fillColor(darkGray).fontSize(10).font('Helvetica');

      const movingDay = [
        'Be present (or have a representative) when movers arrive',
        'Review the Bill of Lading before signing - this is your contract',
        'Make sure the Bill of Lading shows the agreed-upon price',
        'Verify the delivery address and contact phone numbers',
        'Confirm valuation/liability coverage on the Bill of Lading',
        'Complete a walk-through with the driver noting condition of items',
        'Review and sign the inventory sheets after inspection',
        'Note any damaged or missing items BEFORE the truck leaves',
        'Get driver\'s contact information and truck number',
        'Get the estimated delivery date/spread in writing',
        'Keep your copy of all documents - don\'t give them to the driver',
        'Take photos of valuable items before they are loaded',
        'Do a final walk-through of your home after loading',
        'Keep your "essentials box" with you, not on the truck'
      ];

      movingDay.forEach(item => {
        checkPage(20);
        checkboxItem(item);
      });

      // ==================== DELIVERY DAY CHECKLIST ====================
      checkPage(180);
      doc.moveDown(0.8);
      sectionHeader('DELIVERY DAY CHECKLIST');

      doc.fillColor(darkGray).fontSize(10).font('Helvetica');

      const deliveryDay = [
        'Be present at delivery (or have an authorized representative)',
        'Check each item against the inventory as it\'s unloaded',
        'Inspect items for damage BEFORE signing the delivery receipt',
        'Note ANY damage or missing items on the delivery receipt',
        'Open boxes and inspect contents before driver leaves if possible',
        'Do not let the driver rush you - take time to inspect',
        'If items are damaged, write the details on ALL copies of paperwork',
        'Take photos of any damage immediately',
        'Keep all packaging materials if you find concealed damage later',
        'Know that you have 9 months to file a claim for loss or damage',
        'File damage claims in writing as soon as possible',
        'Understand that movers must acknowledge claims within 30 days',
        'Movers must resolve claims within 120 days of receipt',
        'Pay only the amount shown on the Bill of Lading at delivery'
      ];

      deliveryDay.forEach(item => {
        checkPage(20);
        checkboxItem(item);
      });

      // ==================== KEY DEFINITIONS ====================
      doc.addPage();
      sectionHeader('KEY DEFINITIONS');

      doc.fillColor(darkGray).fontSize(10);

      doc.font('Helvetica-Bold').text('BROKER', { continued: true });
      doc.font('Helvetica').text(' - A company that arranges transportation of your household goods. Brokers do not actually transport your belongings; they connect you with a motor carrier. Brokers must be registered with FMCSA and have a valid MC number. If you work with a broker, make sure you know which company will actually move your goods.');
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('MOTOR CARRIER', { continued: true });
      doc.font('Helvetica').text(' - The company that actually transports your household goods. Motor carriers must have valid USDOT and MC numbers. You can verify a carrier\'s registration status at www.safersys.gov.');
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('BILL OF LADING', { continued: true });
      doc.font('Helvetica').text(' - The contract between you and the mover. It includes pickup and delivery dates, valuation coverage, total cost, and other important terms. Read it carefully before signing and keep your copy.');
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('TARIFF', { continued: true });
      doc.font('Helvetica').text(' - The document containing the mover\'s rates, rules, and charges. Federal regulations require movers to make their tariff available for your review upon request.');
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('BINDING ESTIMATE', { continued: true });
      doc.font('Helvetica').text(' - A written estimate that guarantees the total cost of the move based on the items listed. The mover cannot charge more than this amount unless you add services or items.');
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('NON-BINDING ESTIMATE', { continued: true });
      doc.font('Helvetica').text(' - An approximation of the cost. The final price is based on actual weight and services. By law, you cannot be required to pay more than 110% of the estimate at delivery; any additional charges are due within 30 days.');
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('VALUATION COVERAGE', { continued: true });
      doc.font('Helvetica').text(' - Protection for your belongings during the move. Options include Released Value (minimal protection at no additional cost, 60 cents per pound per item) or Full Value Protection (mover must repair, replace, or pay current market value for damaged/lost items).');
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('ORDER FOR SERVICE', { continued: true });
      doc.font('Helvetica').text(' - The document that authorizes the mover to transport your shipment. It lists agreed-upon services, dates, and costs.');

      // ==================== QUESTIONS & ANSWERS ====================
      checkPage(200);
      doc.moveDown(1.2);
      sectionHeader('FREQUENTLY ASKED QUESTIONS');

      doc.fillColor(darkGray).fontSize(10);

      doc.font('Helvetica-Bold').text('Q: How do I verify that a mover is legitimate?');
      doc.font('Helvetica').text('A: Check the mover\'s USDOT and MC numbers at www.safersys.gov. Also search for complaints at www.fmcsa.dot.gov. Legitimate movers will have current registration and insurance on file.', { indent: 15 });
      doc.moveDown(0.7);

      checkPage(60);
      doc.font('Helvetica-Bold').text('Q: What if my mover holds my belongings hostage?');
      doc.font('Helvetica').text('A: Federal law prohibits movers from holding shipments hostage for payment above the original estimate (110% rule for non-binding estimates). If this occurs, file a complaint with FMCSA immediately at 1-888-DOT-SAFT (1-888-368-7238).', { indent: 15 });
      doc.moveDown(0.7);

      checkPage(60);
      doc.font('Helvetica-Bold').text('Q: What items can\'t be moved?');
      doc.font('Helvetica').text('A: Movers cannot transport hazardous materials including: flammable liquids, explosives, corrosives, propane tanks, ammunition, and similar items. Perishable food, plants, and items requiring climate control may also be restricted.', { indent: 15 });
      doc.moveDown(0.7);

      checkPage(60);
      doc.font('Helvetica-Bold').text('Q: How long do I have to file a claim?');
      doc.font('Helvetica').text('A: You have 9 months from the date of delivery to file a written claim for loss or damage. The mover must acknowledge your claim within 30 days and must make a settlement offer or deny the claim within 120 days.', { indent: 15 });
      doc.moveDown(0.7);

      checkPage(60);
      doc.font('Helvetica-Bold').text('Q: Do I have to pay for the move before inspecting my items?');
      doc.font('Helvetica').text('A: The mover can require payment before unloading, but you should inspect items as they come off the truck and note any damage on the inventory sheets. You have the right to note damage before signing final delivery documents.', { indent: 15 });

      // ==================== PROTECT YOURSELF ====================
      doc.addPage();
      sectionHeader('PROTECT YOURSELF FROM FRAUD');

      doc.fillColor(darkGray).fontSize(10).font('Helvetica');
      doc.text('Watch for these warning signs of a potentially fraudulent mover:', { width: 504 });
      doc.moveDown(0.5);

      const warnings = [
        'The mover doesn\'t do an in-home estimate or video survey',
        'The estimate seems too good to be true (significantly lower than others)',
        'The mover asks for a large cash deposit upfront',
        'The company answers the phone with a generic "Moving Company"',
        'No physical address or the address is a P.O. Box',
        'The mover won\'t provide their USDOT or MC numbers',
        'The website has no company history or customer reviews',
        'You receive a blank or incomplete Bill of Lading',
        'The truck arrives unmarked or with rented moving trucks',
        'The mover demands cash or full payment before delivery'
      ];

      warnings.forEach(item => {
        checkPage(20);
        doc.fillColor('#cc0000').font('Helvetica-Bold').text('• ', { continued: true });
        doc.fillColor(darkGray).font('Helvetica').text(item);
        doc.moveDown(0.3);
      });

      // ==================== YOUR RIGHTS ====================
      checkPage(200);
      doc.moveDown(1);
      sectionHeader('YOUR RIGHTS AS A CONSUMER');

      doc.fillColor(darkGray).fontSize(10).font('Helvetica');
      doc.text('Federal regulations protect you when moving interstate:', { width: 504 });
      doc.moveDown(0.5);

      const rights = [
        'Right to a written estimate before the move',
        'Right to review the mover\'s tariff (rates and rules)',
        'Right to receive the "Your Rights and Responsibilities" booklet',
        'Right to choose your level of liability/valuation coverage',
        'Right to be present at weighing of your shipment',
        'Right to receive the Bill of Lading before loading',
        'Right to not pay more than 110% of a non-binding estimate at delivery',
        'Right to file a claim for loss or damage within 9 months',
        'Right to receive a response to claims within required timeframes',
        'Right to file complaints with FMCSA about mover conduct'
      ];

      rights.forEach(item => {
        checkPage(20);
        doc.fillColor(blue).font('Helvetica-Bold').text('✓ ', { continued: true });
        doc.fillColor(darkGray).font('Helvetica').text(item);
        doc.moveDown(0.3);
      });

      // ==================== FMCSA RESOURCES ====================
      checkPage(200);
      doc.moveDown(1);
      sectionHeader('FMCSA RESOURCES');

      doc.fillColor(darkGray).fontSize(10).font('Helvetica');

      doc.text('Use these official resources for more information and to file complaints:');
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('Verify Mover Registration:');
      doc.font('Helvetica').text('www.safersys.gov', { indent: 20 });
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold').text('Search Complaints & Safety Records:');
      doc.font('Helvetica').text('www.fmcsa.dot.gov/protect-your-move', { indent: 20 });
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold').text('File a Complaint:');
      doc.font('Helvetica').text('www.fmcsa.dot.gov/consumer-protection/file-complaint', { indent: 20 });
      doc.font('Helvetica').text('Or call: 1-888-DOT-SAFT (1-888-368-7238)', { indent: 20 });
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold').text('Moving Fraud Hotline:');
      doc.font('Helvetica').text('1-888-368-7238', { indent: 20 });

      // ==================== CONTACT PAGE ====================
      doc.addPage();
      doc.moveDown(2);

      // Questions banner
      doc.fillColor(navy).rect(54, doc.y, 504, 35).fill();
      doc.fillColor('white').fontSize(16).font('Helvetica-Bold');
      doc.text('QUESTIONS ABOUT YOUR MOVE?', 54, doc.y - 25, { width: 504, align: 'center' });
      doc.y += 20;
      doc.moveDown(1.5);

      // Carrier contact box
      doc.fillColor(navy).rect(100, doc.y, 412, 110).fill();
      const contactY = doc.y;
      doc.fillColor('white').fontSize(16).font('Helvetica-Bold');
      doc.text(user.company_name || 'Your Moving Company', 110, contactY + 15, { width: 392, align: 'center' });
      doc.fontSize(11).font('Helvetica');
      doc.text(`Phone: ${user.phone || 'N/A'}`, 110, contactY + 45, { width: 392, align: 'center' });
      doc.text(`Email: ${user.email || 'N/A'}`, 110, contactY + 62, { width: 392, align: 'center' });
      doc.text(`MC#: ${user.mc_number || 'N/A'}  |  USDOT#: ${user.usdot_number || 'N/A'}`, 110, contactY + 79, { width: 392, align: 'center' });

      doc.y = contactY + 130;
      doc.moveDown(1.5);

      // Final notes
      doc.fillColor(darkGray).fontSize(10).font('Helvetica');
      doc.text('We are committed to making your move as smooth as possible. Please don\'t hesitate to contact us with any questions or concerns.', { align: 'center', width: 504 });
      doc.moveDown(1);
      doc.text('Verify our registration at www.safersys.gov using our USDOT or MC number.', { align: 'center', width: 504 });

      // Footer
      doc.moveDown(3);
      doc.strokeColor(gold).lineWidth(1).moveTo(100, doc.y).lineTo(512, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fillColor('#666666').fontSize(8);
      doc.text('This document contains consumer protection information from the Federal Motor Carrier Safety Administration.', { align: 'center', width: 504 });
      doc.text('For the latest information, visit www.fmcsa.dot.gov/protect-your-move', { align: 'center', width: 504 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  generateArbitrationPDF,
  generateArbitrationConsumerPDF,
  generateTariffPDF,
  generateRightsAndResponsibilitiesPDF,
  generateReadyToMovePDF
};
