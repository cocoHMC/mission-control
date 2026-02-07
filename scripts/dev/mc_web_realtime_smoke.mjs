import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

// This smoke is specifically for "remote client" mode where PocketBase is loopback-only.
// Use a non-loopback hostname (like localtest.me -> 127.0.0.1) to force the browser
// into using the Mission Control SSE realtime bridge.
const baseUrl =
  process.env.MC_BASE_URL ||
  `http://localtest.me:${process.env.MC_WEB_PORT || '4010'}`;
const user =
  process.env.MC_BASIC_USER ||
  process.env.MC_ADMIN_USER ||
  'dev';
const pass =
  process.env.MC_BASIC_PASS ||
  process.env.MC_ADMIN_PASSWORD ||
  'devpass';

const outDir = process.env.MC_SMOKE_DIR || '/tmp/mc-web-realtime-smoke';
await fs.mkdir(outDir, { recursive: true });

function toUrl(p) {
  if (!p.startsWith('/')) return `${baseUrl}/${p}`;
  return `${baseUrl}${p}`;
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true, caret: 'initial' });
}

function nonNullBox(box, label) {
  if (!box) throw new Error(`Could not get bounding box for ${label}`);
  return box;
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: user, password: pass },
  });

  const pageA = await context.newPage();
  const pageB = await context.newPage();

  // Open Tasks in two tabs.
  await pageA.goto(toUrl('/tasks'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await pageB.goto(toUrl('/tasks'), { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await pageA.getByText('Inbox', { exact: true }).first().waitFor({ timeout: 20_000 });
  await pageB.getByText('Inbox', { exact: true }).first().waitFor({ timeout: 20_000 });
  await pageA.waitForTimeout(1200);
  await pageB.waitForTimeout(1200);

  await screenshot(pageA, 'tasks_a_before');
  await screenshot(pageB, 'tasks_b_before');

  // Create a task in tab A.
  await pageA.goto(toUrl('/tasks/new'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const title = `SSE smoke ${Date.now()}`;
  await pageA.getByPlaceholder('Ship OpenClaw node onboarding').fill(title);
  await pageA.getByPlaceholder('Context, success criteria, or links.').fill('Created by Playwright SSE smoke test.');
  await pageA.getByRole('button', { name: 'Create task' }).click();
  await pageA.waitForURL('**/tasks', { timeout: 30_000 });
  await pageA.waitForTimeout(800);
  await screenshot(pageA, 'tasks_a_after_create');

  // Verify tab B receives the new card without reload (realtime bridge).
  const cardInB = pageB.getByRole('button', { name: title }).first();
  await cardInB.waitFor({ timeout: 12_000 });
  await screenshot(pageB, 'tasks_b_after_realtime_create');

  // Drag to Assigned in tab A (status update), and verify tab B follows.
  const cardInA = pageA.getByRole('button', { name: title }).first();
  await cardInA.waitFor({ timeout: 20_000 });
  const assignedHeaderA = pageA.getByText('Assigned', { exact: true }).first();
  await assignedHeaderA.waitFor({ timeout: 20_000 });

  const cardBox = nonNullBox(await cardInA.boundingBox(), 'task card');
  const headerRowBox = nonNullBox(await assignedHeaderA.locator('..').boundingBox(), 'assigned header row');

  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const targetX = headerRowBox.x + headerRowBox.width / 2;
  const targetY = headerRowBox.y + headerRowBox.height + 140;

  await pageA.mouse.move(startX, startY);
  await pageA.mouse.down();
  await pageA.mouse.move(targetX, targetY, { steps: 18 });
  await pageA.mouse.up();

  // Verify tab B re-renders the card under Assigned.
  const assignedHeaderB = pageB.getByText('Assigned', { exact: true }).first();
  await assignedHeaderB.waitFor({ timeout: 20_000 });
  const assignedColumnB = assignedHeaderB.locator('..').locator('..');
  await assignedColumnB.getByRole('button', { name: title }).first().waitFor({ timeout: 12_000 });
  await screenshot(pageB, 'tasks_b_after_realtime_move');

  await context.close();
} finally {
  await browser.close();
}

console.log('realtime smoke ok; screenshots in', outDir);

