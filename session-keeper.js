const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Config
const SESSION_DIR = 'session';
const LOG_DIR = 'logs';
const STATUS_FILE = path.join(SESSION_DIR, 'status.json');
const COOKIE_FILE = path.join(SESSION_DIR, 'cookies.json');
const LOG_FILE = path.join(LOG_DIR, `activity-${new Date().toISOString().replace(/:/g, '-')}.log`);

// Ensure directories
[SESSION_DIR, LOG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Logger
function log(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  console.log(entry.trim());
}

// Status updater
function updateStatus(state, message = '') {
  const status = {
    timestamp: new Date().toISOString(),
    state,
    message,
    nextCheck: new Date(Date.now() + 5 * 60000).toISOString()
  };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  log(`STATUS: ${state} - ${message}`);
}

(async () => {
  let browser;
  try {
    // Initialize
    updateStatus('starting', 'Session initialization');
    browser = await chromium.launch({ headless: true });

    // Context setup
    const context = await browser.newContext();
    const page = await context.newPage();

    // Load saved cookies
    if (fs.existsSync(COOKIE_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE));
      await context.addCookies(cookies);
      log('Loaded saved cookies');
    }

    // Navigate to Android Studio
    await page.goto(process.env.TARGET_URL || 'https://developer.android.com');
    log(`Navigated to: ${page.url()}`);

    // Check login status
    const needsLogin = await page.isVisible('text="Sign in"');
    if (needsLogin) {
      log('Performing login...');
      
      // Login flow
      await page.click('text="Sign in"');
      await page.fill('input[type="email"]', process.env.ANDROID_USER);
      await page.click('button:has-text("Next")');
      await page.fill('input[type="password"]', process.env.ANDROID_PASS);
      await page.click('button:has-text("Sign in")');
      
      // Wait for login completion
      await page.waitForSelector('#android-studio-0-1', { timeout: 30000 });
      log('Login successful');
    }

    // Session activity
    log('Performing keep-alive actions');
    await page.click('#Android Studio-0.1');
    await page.waitForTimeout(10000);  // Simulate activity
    
    // Save session
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    updateStatus('active', 'Session refreshed');
    
    // Create restore point
    fs.copyFileSync(COOKIE_FILE, path.join(SESSION_DIR, 'cookies-backup.json'));
    log('Session state saved');

  } catch (error) {
    updateStatus('error', `Execution failed: ${error.message}`);
    log(`ERROR: ${error.stack}`);
    
    // Recovery attempt
    if (fs.existsSync(path.join(SESSION_DIR, 'cookies-backup.json'))) {
      fs.copyFileSync(
        path.join(SESSION_DIR, 'cookies-backup.json'),
        COOKIE_FILE
      );
      log('Restored from backup');
    }
  } finally {
    if (browser) await browser.close();
    log('Browser session ended');
  }
})();
