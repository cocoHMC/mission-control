import { chromium, devices } from 'playwright';

const baseUrl = process.env.MC_BASE_URL || 'http://127.0.0.1:4015';
const user = process.env.MC_BASIC_USER || 'dev';
const pass = process.env.MC_BASIC_PASS || 'devpass';

async function run(viewport, colorScheme, name) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport,
    colorScheme,
    httpCredentials: { username: user, password: pass },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/sessions`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // Click the first visible session in inbox if available.
  const first = page.locator('section').first().locator('button').first();
  if (await first.count()) {
    await first.click({ timeout: 2000 }).catch(() => {});
  }

  // Scroll the thread a bit.
  const thread = page.locator('[data-mc-thread-scroll]');
  if (await thread.count()) {
    await thread.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    }).catch(() => {});
    await page.waitForTimeout(500);
    await thread.evaluate((el) => {
      el.scrollTop = Math.max(0, el.scrollTop - 600);
    }).catch(() => {});
  }

  // Keep the browser open for manual inspection.
  console.log(`Opened interactive ${name}. Close the browser window to exit.`);
  await page.waitForEvent('close').catch(() => {});
  await context.close();
  await browser.close();
}

const profile = process.argv[2] || 'desktop';
if (profile === 'mobile') {
  const iPhone = devices['iPhone 14'];
  await run(iPhone.viewport, 'light', 'mobile-light');
} else if (profile === 'tablet') {
  await run({ width: 820, height: 1180 }, 'light', 'tablet-light');
} else {
  await run({ width: 1440, height: 900 }, 'light', 'desktop-light');
}
