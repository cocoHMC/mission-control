import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl =
  process.env.MC_BASE_URL ||
  `http://127.0.0.1:${process.env.MC_WEB_PORT || '4010'}`;
const user =
  process.env.MC_BASIC_USER ||
  process.env.MC_ADMIN_USER ||
  'dev';
const pass =
  process.env.MC_BASIC_PASS ||
  process.env.MC_ADMIN_PASSWORD ||
  'devpass';
const shouldAssign = ['1', 'true', 'yes', 'y', 'on'].includes(String(process.env.MC_SMOKE_ASSIGN || '').trim().toLowerCase());
const assignLabel =
  process.env.MC_SMOKE_ASSIGN_LABEL ||
  process.env.NEXT_PUBLIC_MC_LEAD_AGENT_NAME ||
  process.env.MC_LEAD_AGENT_NAME ||
  'Coco (Main)';

const outDir = process.env.MC_SMOKE_DIR || '/tmp/mc-web-smoke';
await fs.mkdir(outDir, { recursive: true });

function safeName(p) {
  const clean = p.replace(/^\//, '').replace(/\?.*$/, '');
  return clean ? clean.replace(/[^a-zA-Z0-9._-]+/g, '_') : 'root';
}

function toUrl(p) {
  if (!p.startsWith('/')) return `${baseUrl}/${p}`;
  return `${baseUrl}${p}`;
}

async function screenshot(page, name) {
  // Avoid mutating the DOM (e.g. hiding caret) during hydration-sensitive moments.
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true, caret: 'initial' });
}

async function visit(page, p, { expectText } = {}) {
  const url = toUrl(p);
  let lastErr = null;
  let status = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const resp = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      status = resp ? resp.status() : null;
      if (status && status >= 400) throw new Error(`HTTP ${status} for ${p}`);
      lastErr = null;
      break;
    } catch (err) {
      const msg = String(err?.message || err);
      lastErr = err;
      // Next.js dev + rapid page crawls can intermittently abort navigations while recompiling.
      if (!msg.includes('net::ERR_ABORTED') || attempt === 3) break;
      await page.waitForTimeout(600);
    }
  }
  if (lastErr) throw lastErr;
  if (expectText) await page.getByText(expectText, { exact: false }).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshot(page, safeName(p));
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: user, password: pass },
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err?.message || String(err)}`));
  page.on('response', (res) => {
    // Capture conflict responses explicitly; these often show up as an unhelpful
    // "Failed to load resource: 409 (Conflict)" console error without a URL.
    if (res.status() !== 409) return;
    const req = res.request();
    errors.push(`http 409: ${req.method()} ${res.url()}`);
  });
  page.on('console', (msg) => {
    // Filter out noisy warnings; we only fail on real errors.
    if (msg.type() !== 'error') return;
    const text = msg.text() || '';
    // Next.js dev HMR WebSocket sometimes fails in headless/basic-auth setups.
    // This is dev-only and doesn't impact `next build && next start`.
    if (text.includes('/_next/webpack-hmr')) return;
    // Update checks can legitimately fail in restricted/offline environments.
    // Treat this as non-fatal for local smoke.
    if (text.includes('/api/openclaw/update/status') && text.includes('502')) return;
    const loc = msg.location?.() || {};
    const where = loc.url ? ` (${loc.url}:${(loc.lineNumber ?? 0) + 1}:${(loc.columnNumber ?? 0) + 1})` : '';
    errors.push(`console.error: ${text}${where}`);
  });

  // Core pages
  await visit(page, '/', { expectText: 'Task Pulse' });
  await visit(page, '/tasks', { expectText: 'Inbox' });
  await visit(page, '/agents', { expectText: 'Agents' });
  await visit(page, '/nodes', { expectText: 'Nodes' });
  await visit(page, '/activity', { expectText: 'Activity' });
  await visit(page, '/docs', { expectText: 'Documents' });
  await visit(page, '/sessions', { expectText: 'Sessions' });
  await visit(page, '/settings', { expectText: 'Getting Started' });
  await visit(page, '/openclaw', { expectText: 'OpenClaw' });

  // OpenClaw sub-pages (read-only-ish)
  const openclawPages = [
    '/openclaw/status',
    '/openclaw/system',
    '/openclaw/logs',
    '/openclaw/skills',
    '/openclaw/models',
    '/openclaw/approvals',
    '/openclaw/gateway',
    '/openclaw/cron',
    '/openclaw/devices',
    '/openclaw/channels',
    '/openclaw/plugins',
    '/openclaw/security',
    '/openclaw/configure',
    '/openclaw/config',
    '/openclaw/doctor',
    '/openclaw/update',
  ];
  for (const p of openclawPages) {
    await visit(page, p, { expectText: 'OpenClaw' });
  }

  // Create a task through the UI and exercise common controls.
  await page.goto(toUrl('/tasks/new'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const title = `Smoke UI task ${Date.now()}`;
  await page.getByPlaceholder('Ship OpenClaw node onboarding').fill(title);
  await page.getByPlaceholder('Context, success criteria, or links.').fill('Created by Playwright smoke test.');
  await page.getByPlaceholder('New subtask...').fill('subtask a');
  await page.getByRole('button', { name: 'Add' }).first().click();
  await page.getByPlaceholder('New subtask...').fill('subtask b');
  await page.getByRole('button', { name: 'Add' }).first().click();

  // Optional: assign to a lead agent via checkbox in the form.
  // Default: off (avoids waking OpenClaw agents during routine smoke runs).
  // Enable with: MC_SMOKE_ASSIGN=1 (and optionally set MC_SMOKE_ASSIGN_LABEL).
  if (shouldAssign) {
    const leadRow = page.getByText(assignLabel, { exact: false }).first();
    if (await leadRow.count()) await leadRow.click();
  }

  await page.getByRole('button', { name: 'Create task' }).click();
  await page.waitForURL('**/tasks', { timeout: 30_000 });
  await page.waitForTimeout(800);
  await screenshot(page, 'tasks_after_create');

  // Open task drawer.
  await page.getByRole('button', { name: title }).first().click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Close', exact: true }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);

  // Capture the task id for deterministic waits later (avoids flaky race conditions).
  const openPageHref = await page.getByRole('link', { name: 'Open page' }).first().getAttribute('href');
  const taskId = openPageHref?.split('/').pop();
  if (!taskId) throw new Error('Could not determine task id from drawer');

  // Thread: send an update (no @mentions to avoid unnecessary agent wakeups).
  await page.getByPlaceholder('Add an update, @mention an agent, or paste a log.').fill('Smoke: UI thread update');
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/messages') && r.request().method() === 'POST' && r.ok(),
      { timeout: 20_000 }
    ),
    page.getByRole('button', { name: 'Send update' }).click(),
  ]);
  await page.getByText('Smoke: UI thread update', { exact: false }).first().waitFor({ timeout: 15_000 });

  // Docs: create a document.
  const docTitle = `Smoke doc ${Date.now()}`;
  await page.getByPlaceholder('Document title').fill(docTitle);
  await page.getByPlaceholder('Document content (Markdown)').fill('# Smoke\n\nThis is a document created by the UI smoke test.');
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/documents') && r.request().method() === 'POST' && r.ok(),
      { timeout: 20_000 }
    ),
    page.getByRole('button', { name: 'Create doc' }).click(),
  ]);
  await page.getByText(docTitle, { exact: false }).first().waitFor({ timeout: 30_000 });

  // Subtasks: toggle the first checkbox.
  // Be precise with the scope; a loose `div:has-text("Subtasks")` can match the entire page and
  // accidentally click unrelated checkboxes.
  const subtasksCard = page
    .getByText('Subtasks', { exact: true })
    .first()
    .locator('..') // header row
    .locator('..'); // card container
  const firstSubtaskCheckbox = subtasksCard.locator('input[type="checkbox"]').first();
  if (await firstSubtaskCheckbox.count()) {
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/subtasks/') && r.request().method() === 'PATCH' && r.ok(),
        { timeout: 20_000 }
      ),
      firstSubtaskCheckbox.click(),
    ]);
  }

  // Status: block with reason (this creates a deterministic message).
  const blockReason = 'Smoke: blocking to validate UI flow';
  await page.getByPlaceholder('Reason + next action').fill(blockReason);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`/api/tasks/${taskId}`) && r.request().method() === 'PATCH' && r.ok(),
      { timeout: 20_000 }
    ),
    page.getByRole('button', { name: 'Block with reason' }).click(),
  ]);
  const blocked = page.getByText(`BLOCKED: ${blockReason}`, { exact: false }).first();
  await blocked.waitFor({ timeout: 30_000, state: 'attached' });
  try {
    await blocked.scrollIntoViewIfNeeded();
  } catch {
    // ignore
  }

  await screenshot(page, 'task_drawer_after_actions');

  // Close drawer
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(400);

  if (errors.length) {
    const unique = Array.from(new Set(errors));
    await fs.writeFile(path.join(outDir, 'errors.txt'), unique.join('\n') + '\n');
    throw new Error(`UI smoke detected ${unique.length} console/page error(s); see ${path.join(outDir, 'errors.txt')}`);
  }

  await context.close();
} finally {
  await browser.close();
}

console.log('smoke ok; screenshots in', outDir);
