import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.MC_BASE_URL || 'http://127.0.0.1:4015';
const user = process.env.MC_BASIC_USER || 'dev';
const pass = process.env.MC_BASIC_PASS || 'devpass';

const shotsDir = process.env.MC_SHOTS_DIR || '/tmp/mc-shots2';
await fs.mkdir(shotsDir, { recursive: true });

const scenarios = [
  { name: 'desktop-light', viewport: { width: 1440, height: 900 }, colorScheme: 'light', path: '/sessions?sessionKey=agent:main:mc:qsktcx9zwtc52i0' },
  { name: 'desktop-dark', viewport: { width: 1440, height: 900 }, colorScheme: 'dark', path: '/sessions?sessionKey=agent:main:mc:qsktcx9zwtc52i0' },
  { name: 'tablet-light', viewport: { width: 820, height: 1180 }, colorScheme: 'light', path: '/sessions?sessionKey=agent:main:mc:qsktcx9zwtc52i0' },
  { name: 'mobile-inbox-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', path: '/sessions' },
  { name: 'mobile-thread-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', path: '/sessions?sessionKey=agent:main:mc:qsktcx9zwtc52i0' },
  { name: 'mobile-thread-dark', viewport: { width: 390, height: 844 }, colorScheme: 'dark', path: '/sessions?sessionKey=agent:main:mc:qsktcx9zwtc52i0' },
];

const browser = await chromium.launch();
try {
  for (const s of scenarios) {
    const context = await browser.newContext({
      viewport: s.viewport,
      colorScheme: s.colorScheme,
      httpCredentials: { username: user, password: pass },
    });
    const page = await context.newPage();
    const url = `${baseUrl}${s.path}`;
    // The sessions UI is intentionally data-fetch heavy at load; wait for stable idle.
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${shotsDir}/sessions-${s.name}.png`, fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('saved to', shotsDir);
