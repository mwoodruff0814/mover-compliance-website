const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Ensure temp directory exists
const tempDir = path.join(__dirname, '..', '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Generate Arbitration Summary PDF for enrolled movers
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
        margins: { top: 72, bottom: 72, left: 72, right: 72 },
        info: {
          Title: 'Arbitration Program Summary',
          Author: process.env.COMPANY_NAME || 'Interstate Compliance Solutions',
          Subject: `Arbitration Summary for ${user.company_name}`
        }
      });

      const chunks = [];

      if (returnBuffer) {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        const fileName = `arbitration-summary-${user.mc_number?.replace(/[^a-zA-Z0-9]/g, '') || user.id}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, fileName);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        writeStream.on('finish', () => resolve(`/temp/${fileName}`));
      }

      // Colors
      const navy = '#0a1628';
      const gold = '#c9a227';

      // Header
      doc.fillColor(navy)
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('ARBITRATION PROGRAM', { align: 'center' });

      doc.fontSize(16)
        .text('SUMMARY FOR SHIPPERS', { align: 'center' });

      doc.moveDown(0.5);

      // Gold line
      doc.strokeColor(gold)
        .lineWidth(2)
        .moveTo(72, doc.y)
        .lineTo(540, doc.y)
        .stroke();

      doc.moveDown(1);

      // Company Info Box
      doc.fillColor(navy)
        .rect(72, doc.y, 468, 80)
        .fill();

      const boxY = doc.y;
      doc.fillColor('white')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('MOTOR CARRIER INFORMATION', 90, boxY + 15);

      doc.fontSize(11)
        .font('Helvetica')
        .text(`Company Name: ${user.company_name}`, 90, boxY + 35)
        .text(`MC Number: ${user.mc_number || 'N/A'}`, 90, boxY + 50)
        .text(`USDOT Number: ${user.usdot_number || 'N/A'}`, 300, boxY + 50);

      doc.y = boxY + 95;

      // Enrollment Status
      const enrolledDate = new Date(enrollment.enrolled_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      const expiryDate = new Date(enrollment.expiry_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      doc.fillColor(navy)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Program Enrollment: ', { continued: true })
        .font('Helvetica')
        .text(`Active from ${enrolledDate} through ${expiryDate}`);

      doc.moveDown(1.5);

      // What is Arbitration Section
      doc.fillColor(navy)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('WHAT IS ARBITRATION?');

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica')
        .text(
          'Arbitration is a dispute resolution process that provides an alternative to court litigation. ' +
          'Under Federal regulations, interstate household goods carriers must offer arbitration to ' +
          'shippers for disputes involving loss, damage, or charges. This process is typically faster ' +
          'and less expensive than going to court.',
          { align: 'justify' }
        );

      doc.moveDown(1);

      // When is Arbitration Available
      doc.fillColor(navy)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('WHEN IS ARBITRATION AVAILABLE?');

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica')
        .text('Arbitration is available for disputes involving:');

      doc.moveDown(0.3);

      const availableFor = [
        'Loss or damage to your household goods during the move',
        'Disputes over charges billed after delivery',
        'Collection of charges assessed in addition to the original estimate'
      ];

      availableFor.forEach(item => {
        doc.text(`    • ${item}`);
      });

      doc.moveDown(1);

      // Before Requesting Arbitration
      doc.fillColor(navy)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('BEFORE REQUESTING ARBITRATION');

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica')
        .text('You must first file a written claim with the motor carrier. The carrier must:', { align: 'justify' });

      doc.moveDown(0.3);

      const requirements = [
        'Acknowledge receipt of your claim within 30 days',
        'Pay, decline, or make a settlement offer within 120 days'
      ];

      requirements.forEach(item => {
        doc.text(`    • ${item}`);
      });

      doc.moveDown(0.3);

      doc.text(
        'If you are not satisfied with the carrier\'s response or they fail to respond within the ' +
        'required timeframes, you may request arbitration.',
        { align: 'justify' }
      );

      doc.moveDown(1);

      // Arbitration Thresholds
      doc.fillColor(navy)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('CLAIM AMOUNT THRESHOLDS');

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .text('Claims of $10,000 or less:', { continued: true })
        .font('Helvetica')
        .text(' You may request binding arbitration, and the carrier must participate if you choose this option.');

      doc.moveDown(0.3);

      doc.font('Helvetica-Bold')
        .text('Claims over $10,000:', { continued: true })
        .font('Helvetica')
        .text(' Both you and the carrier must agree to arbitration. If the carrier declines, you may pursue your claim through court.');

      doc.moveDown(1);

      // Arbitration Fees
      doc.fillColor(navy)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('ARBITRATION FEES');

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica')
        .text(
          'Arbitration fees are split between the shipper and the motor carrier. Fees are paid ' +
          'directly to the arbitration provider and vary based on the claim amount. The arbitrator\'s ' +
          'decision on fee allocation is final.',
          { align: 'justify' }
        );

      doc.moveDown(1);

      // How to Request Arbitration
      doc.fillColor(navy)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('HOW TO REQUEST ARBITRATION');

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica');

      const steps = [
        'Contact Interstate Compliance Solutions to verify the carrier\'s enrollment status',
        'Gather all documentation (Bill of Lading, claim correspondence, photos, estimates)',
        'File your arbitration request with the designated arbitration provider',
        'Pay your portion of the arbitration fee',
        'Participate in the arbitration process'
      ];

      steps.forEach((step, i) => {
        doc.text(`    ${i + 1}. ${step}`);
      });

      doc.moveDown(1);

      // Contact Information Box
      doc.fillColor('#f0f3f9')
        .rect(72, doc.y, 468, 100)
        .fill();

      const contactBoxY = doc.y;

      doc.fillColor(navy)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('CONTACT INFORMATION', 90, contactBoxY + 10);

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .text('Arbitration Program Administrator:', 90, contactBoxY + 30)
        .font('Helvetica')
        .text(process.env.COMPANY_NAME || 'Interstate Compliance Solutions', 90, contactBoxY + 43)
        .text(`Phone: ${process.env.COMPANY_PHONE || '1-800-555-0199'}`, 90, contactBoxY + 56)
        .text(`Email: ${process.env.COMPANY_EMAIL || 'info@interstatecompliancesolutions.com'}`, 90, contactBoxY + 69);

      doc.font('Helvetica-Bold')
        .text('Arbitration Provider:', 320, contactBoxY + 30)
        .font('Helvetica')
        .text('NAM (National Arbitration and Mediation)', 320, contactBoxY + 43)
        .text('Phone: 1-800-358-2550', 320, contactBoxY + 56)
        .text('Website: www.namadr.com', 320, contactBoxY + 69);

      // Footer
      doc.fillColor('#666666')
        .fontSize(8)
        .text(
          'This document is provided as a summary of your arbitration rights under Federal law (49 CFR Part 375). ' +
          'This summary does not create any additional rights or obligations beyond those established by regulation.',
          72, 700,
          { align: 'center', width: 468 }
        );

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

      const effectiveDate = new Date();
      const formattedEffectiveDate = effectiveDate.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      // Helper function for section headers
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

      // Helper for subsection
      const subSection = (title) => {
        doc.moveDown(0.5);
        doc.fillColor(navy)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(title);
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(10);
      };

      // Helper for paragraphs
      const paragraph = (text) => {
        doc.fillColor(navy)
          .fontSize(10)
          .font('Helvetica')
          .text(text, { align: 'justify' });
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

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica')
        .text(`Service Territory: ${order.service_territory || 'Nationwide'}`, { align: 'center' });

      doc.moveDown(3);

      doc.fontSize(9)
        .fillColor('#666')
        .text('This tariff is published in compliance with 49 U.S.C. § 13702 and 49 CFR Part 1310', { align: 'center' })
        .text('Issued by: Interstate Compliance Solutions', { align: 'center' });

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
        { item: '310', title: 'WEIGHT-BASED RATES', page: '8' },
        { item: '320', title: 'HOURLY RATES', page: '9' },
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

      doc.fontSize(11).font('Helvetica');
      tocItems.forEach(item => {
        doc.fillColor(navy)
          .text(`Item ${item.item}`, 72, doc.y, { continued: true, width: 80 })
          .text(item.title, { continued: true, width: 300 })
          .text(item.page, { align: 'right', width: 80 });
        doc.moveDown(0.3);
      });

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

      // ==================== ITEM 310: WEIGHT-BASED RATES ====================
      sectionHeader('WEIGHT-BASED RATES', '310');

      paragraph('The following weight-based rates apply to shipments charged by weight. Rates are per 100 pounds (CWT) based on distance:');

      doc.moveDown(0.5);

      // Rate table
      doc.fillColor(navy).rect(72, doc.y, 468, 25).fill();
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      doc.text('Distance (Miles)', 82, doc.y + 7, { width: 100 });
      doc.text('Rate per CWT', 200, doc.y - 11, { width: 100 });
      doc.text('Min. Weight', 320, doc.y - 11, { width: 100 });
      doc.text('Min. Charge', 420, doc.y - 11, { width: 100 });

      doc.y += 25;

      const weightRates = [
        { distance: '0 - 50', rate: '$XX.XX', minWeight: '1,000 lbs', minCharge: '$XXX.XX' },
        { distance: '51 - 100', rate: '$XX.XX', minWeight: '1,500 lbs', minCharge: '$XXX.XX' },
        { distance: '101 - 250', rate: '$XX.XX', minWeight: '2,000 lbs', minCharge: '$XXX.XX' },
        { distance: '251 - 500', rate: '$XX.XX', minWeight: '2,500 lbs', minCharge: '$XXX.XX' },
        { distance: '501 - 1000', rate: '$XX.XX', minWeight: '3,000 lbs', minCharge: '$XXX.XX' },
        { distance: '1001 - 1500', rate: '$XX.XX', minWeight: '3,500 lbs', minCharge: '$XXX.XX' },
        { distance: '1501+', rate: '$XX.XX', minWeight: '4,000 lbs', minCharge: '$XXX.XX' }
      ];

      doc.fillColor(navy).fontSize(9).font('Helvetica');
      weightRates.forEach((row, i) => {
        if (i % 2 === 0) {
          doc.fillColor(lightGray).rect(72, doc.y, 468, 18).fill();
        }
        doc.fillColor(navy);
        doc.text(row.distance, 82, doc.y + 4, { width: 100 });
        doc.text(row.rate, 200, doc.y - 14, { width: 100 });
        doc.text(row.minWeight, 320, doc.y - 14, { width: 100 });
        doc.text(row.minCharge, 420, doc.y - 14, { width: 100 });
        doc.y += 18;
      });

      doc.moveDown(1);
      paragraph('Note: Carrier should replace "XX.XX" with actual rates. All rates are subject to fuel surcharge when applicable.');

      // ==================== ITEM 320: HOURLY RATES ====================
      sectionHeader('HOURLY RATES', '320');

      paragraph('The following hourly rates apply to shipments charged on a time basis:');

      doc.moveDown(0.5);

      // Hourly rate table
      doc.fillColor(navy).rect(72, doc.y, 468, 25).fill();
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      doc.text('Crew Size', 82, doc.y + 7, { width: 150 });
      doc.text('Hourly Rate', 250, doc.y - 11, { width: 100 });
      doc.text('Minimum Hours', 380, doc.y - 11, { width: 100 });

      doc.y += 25;

      const hourlyRates = [
        { crew: '2 Men + Truck', rate: '$XXX.XX/hour', min: '2 hours' },
        { crew: '3 Men + Truck', rate: '$XXX.XX/hour', min: '2 hours' },
        { crew: '4 Men + Truck', rate: '$XXX.XX/hour', min: '3 hours' },
        { crew: '5+ Men + Truck', rate: '$XXX.XX/hour', min: '3 hours' },
        { crew: 'Additional Man', rate: '$XX.XX/hour', min: 'N/A' }
      ];

      doc.fillColor(navy).fontSize(9).font('Helvetica');
      hourlyRates.forEach((row, i) => {
        if (i % 2 === 0) {
          doc.fillColor(lightGray).rect(72, doc.y, 468, 18).fill();
        }
        doc.fillColor(navy);
        doc.text(row.crew, 82, doc.y + 4, { width: 150 });
        doc.text(row.rate, 250, doc.y - 14, { width: 100 });
        doc.text(row.min, 380, doc.y - 14, { width: 100 });
        doc.y += 18;
      });

      doc.moveDown(1);

      subSection('Travel Time');
      paragraph('Travel time charges may apply for the time required to travel from the carrier\'s facility to the origin and from the destination back to the facility. Travel time is charged at the applicable hourly rate.');

      // ==================== ITEM 330: MINIMUM CHARGES ====================
      sectionHeader('MINIMUM CHARGES', '330');

      paragraph('The following minimum charges apply to all shipments regardless of actual weight or time:');

      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      doc.text('    • Local moves (under 50 miles): $XXX.XX minimum');
      doc.text('    • Long-distance moves (50+ miles): $XXX.XX minimum');
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
      paragraph('Packing labor is charged at $XX.XX per hour per packer, with a minimum of 2 hours. Full-service packing includes all materials and labor to professionally pack the entire household.');

      // ==================== ITEM 420: STORAGE IN TRANSIT ====================
      sectionHeader('STORAGE IN TRANSIT', '420');

      paragraph('Storage-in-transit (SIT) is available when delivery cannot be completed immediately. Goods are stored in a secure, climate-controlled facility.');

      subSection('A. Storage Rates');
      doc.fontSize(10).font('Helvetica');
      doc.text('    • First 30 days: $X.XX per 100 lbs per month (minimum $XXX.XX)');
      doc.text('    • After 30 days: $X.XX per 100 lbs per month');
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
      doc.text('    • Per flight of stairs (8+ steps): $XX.XX per flight');
      doc.text('    • Applicable at both origin and destination');
      doc.text('    • Elevator service: No charge when available and operational');
      doc.moveDown(0.5);

      subSection('B. Long Carry');
      doc.text('    • Distance exceeding 75 feet from truck to door: $XX.XX per 100 feet');
      doc.text('    • Measured at both origin and destination');
      doc.moveDown(0.5);

      subSection('C. Waiting Time');
      paragraph('If crew must wait due to circumstances beyond carrier\'s control (elevator delays, customer not ready, etc.), waiting time is charged at $XX.XX per hour after the first 30 minutes.');

      // ==================== ITEM 440: SPECIAL SERVICES ====================
      sectionHeader('SPECIAL SERVICES', '440');

      subSection('A. Shuttle Service');
      paragraph('When access to the residence is restricted and the primary vehicle cannot reach the loading/unloading point, a shuttle vehicle may be required.');
      doc.fontSize(10).font('Helvetica');
      doc.text('    • Shuttle charge: $XXX.XX minimum plus $X.XX per 100 lbs');
      doc.moveDown(0.5);

      subSection('B. Bulky Items');
      paragraph('Additional charges apply for items requiring special handling due to size, weight, or fragility:');
      doc.text('    • Piano (upright): $XXX.XX');
      doc.text('    • Piano (grand): $XXX.XX');
      doc.text('    • Pool table: $XXX.XX - $XXX.XX');
      doc.text('    • Safe (per 100 lbs): $XX.XX');
      doc.text('    • Hot tub/spa: Quote required');
      doc.text('    • Gym equipment: $XX.XX per piece');
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

      paragraph('This tariff document is provided as a template for your use. It is the carrier\'s responsibility to:');
      doc.fontSize(10).font('Helvetica');
      doc.text('    1. Review all provisions for accuracy and applicability to your operations');
      doc.text('    2. Fill in all rate amounts marked with "XX.XX" or "XXX.XX"');
      doc.text('    3. Modify provisions as needed to reflect your actual practices');
      doc.text('    4. Maintain this tariff and make it available for inspection');
      doc.text('    5. Update this tariff when rates or services change');

      doc.moveDown(2);

      doc.fillColor(lightGray).rect(72, doc.y, 468, 100).fill();
      doc.fillColor(navy).fontSize(10);
      doc.text('For Carrier Use:', 90, doc.y + 15);
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

module.exports = {
  generateArbitrationPDF,
  generateTariffPDF
};
