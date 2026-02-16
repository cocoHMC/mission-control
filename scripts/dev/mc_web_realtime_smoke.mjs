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

async function pointerDrag(page, handle, start, target) {
  await handle.dispatchEvent('pointerdown', {
    pointerId: 1,
    bubbles: true,
    clientX: start.x,
    clientY: start.y,
    button: 0,
    isPrimary: true,
    pointerType: 'mouse',
  });

  const steps = 18;
  for (let i = 1; i <= steps; i++) {
    const x = start.x + ((target.x - start.x) * i) / steps;
    const y = start.y + ((target.y - start.y) * i) / steps;
    await page.dispatchEvent('body', 'pointermove', {
      pointerId: 1,
      bubbles: true,
      clientX: x,
      clientY: y,
      buttons: 1,
      isPrimary: true,
      pointerType: 'mouse',
    });
  }

  await page.dispatchEvent('body', 'pointerup', {
    pointerId: 1,
    bubbles: true,
    clientX: target.x,
    clientY: target.y,
    button: 0,
    isPrimary: true,
    pointerType: 'mouse',
  });
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
  // Drag is activated from the grip handle (not the whole card).
  const handleInA = cardInA.locator('button[aria-label="Drag task"]').first();
  await handleInA.waitFor({ timeout: 20_000 });
  const assignedHeaderA = pageA.getByText('Assigned', { exact: true }).first();
  await assignedHeaderA.waitFor({ timeout: 20_000 });
  // Column DOM structure: label -> inner header -> header wrapper -> column wrapper.
  const assignedColumnA = assignedHeaderA.locator('..').locator('..').locator('..');

  const handleBox = nonNullBox(await handleInA.boundingBox(), 'drag handle');
  const colBox = nonNullBox(await assignedColumnA.boundingBox(), 'assigned column');

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const targetX = colBox.x + colBox.width / 2;
  const targetY = colBox.y + colBox.height / 2;

  await pointerDrag(
    pageA,
    handleInA,
    { x: startX, y: startY },
    { x: targetX, y: targetY }
  );

  // Verify tab B re-renders the card under Assigned.
  const assignedHeaderB = pageB.getByText('Assigned', { exact: true }).first();
  await assignedHeaderB.waitFor({ timeout: 20_000 });
  const assignedColumnB = assignedHeaderB.locator('..').locator('..').locator('..');
  await assignedColumnB
    .getByRole('button', { name: title })
    .first()
    // The Assigned column may be scrollable; presence matters more than viewport visibility.
    .waitFor({ timeout: 12_000, state: 'attached' });
  await screenshot(pageB, 'tasks_b_after_realtime_move');

  await context.close();
} finally {
  await browser.close();
}

console.log('realtime smoke ok; screenshots in', outDir);
