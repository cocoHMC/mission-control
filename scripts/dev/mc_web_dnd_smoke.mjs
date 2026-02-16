import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.MC_BASE_URL || `http://127.0.0.1:${process.env.MC_WEB_PORT || '4010'}`;
const user = process.env.MC_BASIC_USER || process.env.MC_ADMIN_USER || 'dev';
const pass = process.env.MC_BASIC_PASS || process.env.MC_ADMIN_PASSWORD || 'devpass';

const outDir = process.env.MC_SMOKE_DIR || '/tmp/mc-web-dnd-smoke';
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
  const page = await context.newPage();

  // Create a deterministic task to drag.
  await page.goto(toUrl('/tasks/new'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const title = `DnD smoke ${Date.now()}`;
  await page.getByPlaceholder('Ship OpenClaw node onboarding').fill(title);
  await page.getByPlaceholder('Context, success criteria, or links.').fill('Created by Playwright DnD smoke test.');
  await page.getByRole('button', { name: 'Create task' }).click();
  await page.waitForURL('**/tasks', { timeout: 30_000 });

  // Give the client time to flip from the non-DnD render to the DndContext render.
  await page.waitForTimeout(800);

  const card = page.getByRole('button', { name: title }).first();
  await card.waitFor({ timeout: 20_000 });
  // Drag is activated from the grip handle (not the whole card).
  const handle = card.locator('button[aria-label="Drag task"]').first();
  await handle.waitFor({ timeout: 20_000 });

  const assignedHeader = page.getByText('Assigned', { exact: true }).first();
  await assignedHeader.waitFor({ timeout: 20_000 });
  // Column DOM structure: label -> inner header -> header wrapper -> column wrapper.
  const assignedColumn = assignedHeader.locator('..').locator('..').locator('..');

  // Drag the card to the Assigned column.
  const handleBox = nonNullBox(await handle.boundingBox(), 'drag handle');
  const colBox = nonNullBox(await assignedColumn.boundingBox(), 'assigned column');

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const targetX = colBox.x + colBox.width / 2;
  const targetY = colBox.y + colBox.height / 2;

  const patchWait = page.waitForResponse(
    (r) => {
      if (!r.ok()) return false;
      if (!r.url().includes('/api/tasks/')) return false;
      if (r.request().method() !== 'PATCH') return false;
      const body = r.request().postData() || '';
      return body.includes('"status":"assigned"');
    },
    { timeout: 20_000 }
  );

  await pointerDrag(
    page,
    handle,
    { x: startX, y: startY },
    { x: targetX, y: targetY }
  );

  await patchWait;

  // Verify it now renders under Assigned.
  await assignedColumn
    .getByRole('button', { name: title })
    .first()
    // The Assigned column may be scrollable; the card can be present but not immediately visible.
    .waitFor({ timeout: 10_000, state: 'attached' });

  await screenshot(page, 'dnd_after_drop');
  await context.close();
} finally {
  await browser.close();
}

console.log('dnd smoke ok; screenshots in', outDir);
