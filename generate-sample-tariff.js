/**
 * Generate a sample tariff PDF for marketing purposes
 * Run with: node generate-sample-tariff.js
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Fake company info for sample
const sampleUser = {
  company_name: 'ABC Moving & Storage Co.',
  mc_number: 'MC-123456',
  usdot_number: '1234567',
  contact_name: 'John Smith',
  phone: '(555) 123-4567',
  email: 'info@abcmoving.com',
  address: '123 Main Street',
  city: 'Columbus',
  state: 'OH',
  zip: '43215'
};

// Sample tariff order with binding rates
const sampleOrder = {
  id: 1,
  order_id: 'TRF-SAMPLE01',
  pricing_method: 'binding',
  effective_date: new Date().toISOString(),
  expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  rates: {
    // Binding estimate rates
    rate_per_cf_under_1000: '4.50',
    rate_per_cf_1000_2000: '4.00',
    rate_per_cf_over_2000: '3.50',
    // Packing rates
    packing_sm_box: '8.00',
    packing_md_box: '12.00',
    packing_lg_box: '15.00',
    packing_dish_pack: '18.00',
    packing_wardrobe: '20.00',
    // Additional services
    stair_carry: '85.00',
    long_carry: '95.00',
    shuttle_service: '450.00',
    elevator_fee: '75.00',
    storage_in_transit: '0.55',
    // Valuation
    basic_liability: '0.60',
    full_value_deductible_0: '25.00',
    full_value_deductible_250: '18.00',
    full_value_deductible_500: '12.00',
    // Fuel surcharge
    fuel_surcharge: '8.5'
  },
  territory: 'Continental United States (48 States)',
  created_at: new Date().toISOString()
};

// Generate the PDF
const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  info: {
    Title: `Tariff - ${sampleUser.company_name}`,
    Author: 'Interstate Compliance Solutions',
    Subject: 'FMCSA Compliant Tariff Document'
  }
});

const outputPath = path.join(__dirname, 'sample-tariff.pdf');
const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Colors
const navy = '#1e3a5f';
const gold = '#c9a227';
const darkGray = '#333333';
const lightGray = '#f5f5f5';

// Helper functions
const drawTableRow = (y, cols, isHeader = false, bgColor = null) => {
  const colWidths = [260, 125, 127];
  let x = 50;

  if (bgColor) {
    doc.fillColor(bgColor).rect(50, y, 512, 22).fill();
  }

  cols.forEach((col, i) => {
    doc.fillColor(isHeader ? 'white' : darkGray)
       .fontSize(isHeader ? 10 : 9)
       .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
       .text(col, x + 5, y + 6, { width: colWidths[i] - 10, align: i === 0 ? 'left' : 'center' });
    x += colWidths[i];
  });

  return y + 22;
};

const sectionTitle = (title) => {
  doc.fillColor(navy).rect(50, doc.y, 512, 24).fill();
  doc.fillColor('white').fontSize(11).font('Helvetica-Bold');
  doc.text(title, 55, doc.y + 6, { width: 502 });
  doc.y += 32;
};

// ==================== PAGE 1: HEADER & COMPANY INFO ====================

// Header bar
doc.rect(0, 0, 612, 90).fill(navy);
doc.fillColor('white').fontSize(22).font('Helvetica-Bold');
doc.text('INTERSTATE MOVING TARIFF', 50, 25, { width: 512, align: 'center' });
doc.fontSize(11).font('Helvetica');
doc.text('Federal Motor Carrier Safety Administration Compliant', 50, 55, { width: 512, align: 'center' });

doc.y = 110;

// Company Information Box
doc.fillColor(navy).rect(50, doc.y, 512, 85).fill();
const companyBoxY = doc.y;

doc.fillColor('white').fontSize(16).font('Helvetica-Bold');
doc.text(sampleUser.company_name, 60, companyBoxY + 12, { width: 492, align: 'center' });

doc.fontSize(10).font('Helvetica');
doc.text(`MC Number: ${sampleUser.mc_number}  |  USDOT: ${sampleUser.usdot_number}`, 60, companyBoxY + 35, { width: 492, align: 'center' });
doc.text(`${sampleUser.address}, ${sampleUser.city}, ${sampleUser.state} ${sampleUser.zip}`, 60, companyBoxY + 50, { width: 492, align: 'center' });
doc.text(`Phone: ${sampleUser.phone}  |  Email: ${sampleUser.email}`, 60, companyBoxY + 65, { width: 492, align: 'center' });

doc.y = companyBoxY + 100;

// Document Info
doc.fillColor(darkGray).fontSize(9).font('Helvetica');
const effectiveDate = new Date(sampleOrder.effective_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const expiryDate = new Date(sampleOrder.expiry_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

doc.text(`Tariff ID: ${sampleOrder.order_id}`, 50, doc.y);
doc.text(`Effective Date: ${effectiveDate}`, 300, doc.y - 11);
doc.moveDown(0.3);
doc.text(`Pricing Method: Binding Estimates (Cubic Feet)`, 50, doc.y);
doc.text(`Expiration Date: ${expiryDate}`, 300, doc.y - 11);
doc.moveDown(0.3);
doc.text(`Territory: ${sampleOrder.territory}`, 50, doc.y);

doc.moveDown(1);

// Gold divider
doc.strokeColor(gold).lineWidth(2).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
doc.moveDown(1);

// ==================== TRANSPORTATION RATES ====================
sectionTitle('TRANSPORTATION RATES - BINDING ESTIMATES');

doc.fillColor(darkGray).fontSize(9).font('Helvetica');
doc.text('Binding estimates are based on cubic feet of shipment. Final price is guaranteed based on the estimated volume.', 50, doc.y, { width: 512 });
doc.moveDown(1);

let tableY = doc.y;
tableY = drawTableRow(tableY, ['Volume Range', 'Rate per Cubic Foot', 'Minimum Charge'], true, navy);
tableY = drawTableRow(tableY, ['Under 1,000 cubic feet', `$${sampleOrder.rates.rate_per_cf_under_1000}`, '$500.00'], false, lightGray);
tableY = drawTableRow(tableY, ['1,000 - 2,000 cubic feet', `$${sampleOrder.rates.rate_per_cf_1000_2000}`, 'N/A'], false);
tableY = drawTableRow(tableY, ['Over 2,000 cubic feet', `$${sampleOrder.rates.rate_per_cf_over_2000}`, 'N/A'], false, lightGray);

doc.y = tableY + 15;

// ==================== PACKING SERVICES ====================
sectionTitle('PACKING MATERIALS & SERVICES');

tableY = doc.y;
tableY = drawTableRow(tableY, ['Item', 'Price Each', 'Notes'], true, navy);
tableY = drawTableRow(tableY, ['Small Box (1.5 cu ft)', `$${sampleOrder.rates.packing_sm_box}`, 'Books, small items'], false, lightGray);
tableY = drawTableRow(tableY, ['Medium Box (3.0 cu ft)', `$${sampleOrder.rates.packing_md_box}`, 'Kitchen items, toys'], false);
tableY = drawTableRow(tableY, ['Large Box (4.5 cu ft)', `$${sampleOrder.rates.packing_lg_box}`, 'Bedding, linens'], false, lightGray);
tableY = drawTableRow(tableY, ['Dish Pack Box (5.2 cu ft)', `$${sampleOrder.rates.packing_dish_pack}`, 'Fragile items, dishes'], false);
tableY = drawTableRow(tableY, ['Wardrobe Box', `$${sampleOrder.rates.packing_wardrobe}`, 'Hanging clothes'], false, lightGray);

doc.y = tableY + 15;

// ==================== ADDITIONAL SERVICES ====================
sectionTitle('ADDITIONAL SERVICES & ACCESSORIAL CHARGES');

tableY = doc.y;
tableY = drawTableRow(tableY, ['Service', 'Rate', 'Description'], true, navy);
tableY = drawTableRow(tableY, ['Stair Carry', `$${sampleOrder.rates.stair_carry}/flight`, 'Per flight of stairs'], false, lightGray);
tableY = drawTableRow(tableY, ['Long Carry (75+ feet)', `$${sampleOrder.rates.long_carry}`, 'Distance from truck to door'], false);
tableY = drawTableRow(tableY, ['Shuttle Service', `$${sampleOrder.rates.shuttle_service}`, 'When large truck cannot access'], false, lightGray);
tableY = drawTableRow(tableY, ['Elevator Fee', `$${sampleOrder.rates.elevator_fee}`, 'Per use of elevator'], false);
tableY = drawTableRow(tableY, ['Storage-in-Transit', `$${sampleOrder.rates.storage_in_transit}/cu ft/day`, 'Temporary storage'], false, lightGray);
tableY = drawTableRow(tableY, ['Fuel Surcharge', `${sampleOrder.rates.fuel_surcharge}%`, 'Applied to transportation'], false);

doc.y = tableY + 15;

// ==================== PAGE 2: VALUATION & TERMS ====================
doc.addPage();

// Header on page 2
doc.rect(0, 0, 612, 50).fill(navy);
doc.fillColor('white').fontSize(14).font('Helvetica-Bold');
doc.text('INTERSTATE MOVING TARIFF (Continued)', 50, 18, { width: 512, align: 'center' });

doc.y = 70;

// ==================== VALUATION OPTIONS ====================
sectionTitle('VALUATION / LIABILITY COVERAGE OPTIONS');

doc.fillColor(darkGray).fontSize(9).font('Helvetica');
doc.text('Per FMCSA regulations, you must select one of the following valuation options:', 50, doc.y, { width: 512 });
doc.moveDown(0.8);

tableY = doc.y;
tableY = drawTableRow(tableY, ['Coverage Option', 'Rate', 'Details'], true, navy);
tableY = drawTableRow(tableY, ['Released Value (Basic)', `$${sampleOrder.rates.basic_liability}/lb/article`, 'Included at no charge'], false, lightGray);
tableY = drawTableRow(tableY, ['Full Value - $0 Deductible', `$${sampleOrder.rates.full_value_deductible_0}/thousand`, 'Per $1,000 declared value'], false);
tableY = drawTableRow(tableY, ['Full Value - $250 Deductible', `$${sampleOrder.rates.full_value_deductible_250}/thousand`, 'Per $1,000 declared value'], false, lightGray);
tableY = drawTableRow(tableY, ['Full Value - $500 Deductible', `$${sampleOrder.rates.full_value_deductible_500}/thousand`, 'Per $1,000 declared value'], false);

doc.y = tableY + 20;

// ==================== PAYMENT TERMS ====================
sectionTitle('PAYMENT TERMS & CONDITIONS');

doc.fillColor(darkGray).fontSize(9).font('Helvetica');
const paymentTerms = [
  'Payment is due upon delivery unless other arrangements have been made in writing.',
  'Accepted forms of payment: Cash, Certified Check, Money Order, Credit Card (Visa, MasterCard, Discover, American Express).',
  'Personal checks accepted only with prior approval and may delay delivery.',
  'For COD shipments, payment must be made before unloading begins.',
  'A deposit of up to 25% may be required at the time of booking for binding estimates.'
];

paymentTerms.forEach(term => {
  doc.text(`• ${term}`, 55, doc.y, { width: 502, align: 'left' });
  doc.moveDown(0.5);
});

doc.moveDown(0.5);

// ==================== CLAIMS INFORMATION ====================
sectionTitle('CLAIMS FILING INFORMATION');

doc.fillColor(darkGray).fontSize(9).font('Helvetica');
const claimsInfo = [
  'Claims for loss or damage must be filed in writing within 9 months of delivery.',
  'The carrier must acknowledge receipt of your claim within 30 days.',
  'The carrier must pay, decline, or make a settlement offer within 120 days.',
  'For unresolved disputes, you may request arbitration through the carrier\'s arbitration program.',
  'Arbitration is available for claims up to $10,000 without carrier consent; over $10,000 requires mutual agreement.'
];

claimsInfo.forEach(info => {
  doc.text(`• ${info}`, 55, doc.y, { width: 502, align: 'left' });
  doc.moveDown(0.5);
});

doc.moveDown(1);

// ==================== CERTIFICATION ====================
doc.strokeColor(gold).lineWidth(2).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
doc.moveDown(1);

doc.fillColor(navy).fontSize(11).font('Helvetica-Bold');
doc.text('CARRIER CERTIFICATION', 50, doc.y, { width: 512, align: 'center' });
doc.moveDown(0.8);

doc.fillColor(darkGray).fontSize(9).font('Helvetica');
doc.text('This tariff is filed in compliance with 49 CFR Part 375 and applicable FMCSA regulations governing the transportation of household goods in interstate commerce. All rates and charges contained herein are the maximum rates that may be charged.', 50, doc.y, { width: 512, align: 'justify' });

doc.moveDown(1.5);

// Signature lines
doc.text('Authorized Signature: _______________________________', 50, doc.y);
doc.text(`Date: ${new Date().toLocaleDateString()}`, 400, doc.y - 11);
doc.moveDown(1);
doc.text(`${sampleUser.contact_name}, Owner/Operator`, 50, doc.y);
doc.text(`${sampleUser.company_name}`, 50, doc.y + 12);

// Footer
doc.fontSize(8).fillColor('#666666');
doc.text('This tariff was prepared by Interstate Compliance Solutions | (330) 754-2648 | www.interstatecompliancesolutions.com', 50, 730, { width: 512, align: 'center' });

// Finalize
doc.end();

writeStream.on('finish', () => {
  console.log(`\nSample tariff PDF generated successfully!`);
  console.log(`File saved to: ${outputPath}`);
  console.log(`\nFake company used: ${sampleUser.company_name}`);
  console.log(`MC: ${sampleUser.mc_number} | USDOT: ${sampleUser.usdot_number}`);
});
