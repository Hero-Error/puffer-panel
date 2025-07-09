const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Setup logging
const logDir = 'logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logFile = path.join(logDir, `run-${Date.now()}.log`);

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(entry.trim());
}

function updateStatus(state, message = '') {
  const status = {
    timestamp: new Date().toISOString(),
    state,
    message,
    nextCheck: new Date(Date.now() + 5 * 60000).toISOString()
  };
  fs.writeFileSync('status.json', JSON.stringify(status, null, 2));
}

async function main() {
  try {
    updateStatus('starting', 'Initializing browser');
    
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    log('Browser launched successfully');
    const context = await browser.newContext();
    
    // Load session if exists
    if (fs.existsSync('session.json')) {
      const cookies = JSON.parse(fs.readFileSync('session.json'));
      await context.addCookies(cookies);
      log('Loaded existing session cookies');
    }
    
    const page = await context.newPage();
    await page.goto('https://developer.android.com/studio');  // Actual Android Studio URL
    
    // Check login state
    if (await page.$('text="Sign in"')) {
      log('Performing login...');
      await page.click('text="Sign in"');
      await page.fill('input[type="email"]', process.env.AS_USER);
      await page.click('button:has-text("Next")');
      await page.fill('input[type="password"]', process.env.AS_PASS);
      await page.click('button:has-text("Sign in")');
      await page.waitForSelector('#android-studio-0-1', { timeout: 30000 });
      log('Login successful');
    }
    
    // Keep-alive actions
    log('Performing keep-alive action');
    await page.click('#android-studio-0-1');
    await page.waitForTimeout(10000);  // 10-second activity
    
    // Save session
    const cookies = await context.cookies();
    fs.writeFileSync('session.json', JSON.stringify(cookies));
    log('Session saved');
    updateStatus('active', 'Session refreshed');
    
    await browser.close();
    log('Browser closed');
    
  } catch (error) {
    log(`ERROR: ${error.message}`);
    updateStatus('error', error.message);
  }
}

main();
