const cron = require('node-cron');
const { checkExpirations } = require('./expiration-checker');
const { processAutopay } = require('./autopay-processor');
const { markExpiredServices } = require('./expire-services');

/**
 * Initialize all scheduled jobs
 */
const initScheduler = () => {
  console.log('Initializing scheduled jobs...');

  // Run daily at 8:00 AM - Check for expiring services and send notifications
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Running daily expiration check at', new Date().toISOString());
    try {
      await checkExpirations();
      console.log('[CRON] Expiration check completed');
    } catch (error) {
      console.error('[CRON] Expiration check failed:', error);
    }
  });

  // Run daily at 9:00 AM - Process autopay renewals
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Running autopay processor at', new Date().toISOString());
    try {
      await processAutopay();
      console.log('[CRON] Autopay processing completed');
    } catch (error) {
      console.error('[CRON] Autopay processing failed:', error);
    }
  });

  // Run daily at midnight - Mark expired services
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Running expired services check at', new Date().toISOString());
    try {
      await markExpiredServices();
      console.log('[CRON] Expired services check completed');
    } catch (error) {
      console.error('[CRON] Expired services check failed:', error);
    }
  });

  console.log('Scheduled jobs initialized:');
  console.log('  - Expiration check: Daily at 8:00 AM');
  console.log('  - Autopay processor: Daily at 9:00 AM');
  console.log('  - Expire services: Daily at midnight');
};

/**
 * Run jobs manually (for testing)
 */
const runJobManually = async (jobName) => {
  console.log(`[MANUAL] Running job: ${jobName}`);

  switch (jobName) {
    case 'expiration-check':
      await checkExpirations();
      break;
    case 'autopay':
      await processAutopay();
      break;
    case 'expire-services':
      await markExpiredServices();
      break;
    default:
      console.error(`Unknown job: ${jobName}`);
  }
};

module.exports = {
  initScheduler,
  runJobManually
};
