#!/usr/bin/env node
/* eslint-disable no-console */

function bad(v) {
  return !v || !String(v).trim();
}

function basicAuth(user, pass) {
  const token = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json };
}

async function waitForOk(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const base = String(process.env.MC_TEST_BASE_URL || "").replace(/\/$/, "");
  if (bad(base)) throw new Error("Missing MC_TEST_BASE_URL (example: http://127.0.0.1:4021)");

  const adminUser = process.env.MC_ADMIN_USER;
  const adminPass = process.env.MC_ADMIN_PASSWORD;
  if (bad(adminUser) || bad(adminPass)) throw new Error("Missing MC_ADMIN_USER/MC_ADMIN_PASSWORD in env");

  const auth = basicAuth(adminUser, adminPass);
  const headers = { "content-type": "application/json", authorization: auth };

  await waitForOk(`${base}/api/health`, 60_000);

  const agent = "e2e-openclaw";
  const handle = `e2e_key_${Date.now().toString(36)}`;
  const secret = `shhh_${Math.random().toString(16).slice(2)}_1234567890`;

  // 0) Ensure PB schema is current (adds missing Vault/task fields)
  {
    const { res, json } = await fetchJson(`${base}/api/vault/repair`, { method: "POST", headers: { authorization: auth } });
    // Older running builds may not have this endpoint yet; in that case tests may still pass if
    // schema is already correct. If schema is missing, subsequent calls will fail anyway.
    if (!res.ok && res.status !== 404) throw new Error(`Repair failed: ${res.status} ${JSON.stringify(json)}`);
  }

  // 1) Create credential
  {
    const { res, json } = await fetchJson(`${base}/api/vault/agents/${encodeURIComponent(agent)}/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "api_key",
        handle,
        service: "E2E",
        secret,
        exposureMode: "inject_only",
        notes: "Created by e2e_vault_task_test.mjs",
        tags: { e2e: true },
      }),
    });
    if (!res.ok) throw new Error(`Create credential failed: ${res.status} ${JSON.stringify(json)}`);
  }

  // 2) Create vault access token
  let token = "";
  {
    const { res, json } = await fetchJson(`${base}/api/vault/agents/${encodeURIComponent(agent)}/tokens`, {
      method: "POST",
      headers,
      body: JSON.stringify({ label: "e2e" }),
    });
    if (!res.ok) throw new Error(`Create token failed: ${res.status} ${JSON.stringify(json)}`);
    token = String(json?.token || "");
    if (bad(token)) throw new Error("Token missing from response");
  }

  // 3) Resolve via agent-facing endpoint (simulates OpenClaw vault plugin)
  {
    const { res, json } = await fetchJson(`${base}/api/vault/resolve-batch`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        requests: [{ key: "k", handle }],
        sessionKey: "e2e",
        toolName: "e2e-test",
      }),
    });
    if (!res.ok) throw new Error(`resolve-batch failed: ${res.status} ${JSON.stringify(json)}`);
    const got = String(json?.values?.k || "");
    if (got !== secret) throw new Error(`resolve-batch mismatch: expected ${secret.length} chars, got ${got.length} chars`);
  }

  // 4) Create task that references the handle (hint)
  {
    const { res, json } = await fetchJson(`${base}/api/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "E2E: Use Vault credential",
        description: `Use {{vault:${handle}}} in a tool call.`,
        context: "",
        vaultItem: handle,
        assigneeIds: [agent],
        status: "assigned",
        labels: ["e2e", "vault"],
        requiresReview: false,
      }),
    });
    if (!res.ok) throw new Error(`Create task failed: ${res.status} ${JSON.stringify(json)}`);
    if (String(json?.vaultItem || "") !== handle) throw new Error("Task did not persist vaultItem");
  }

  console.log("[e2e] ok: created credential, resolved secret, created task w/ vaultItem");
}

main().catch((err) => {
  console.error("[e2e] failed:", err?.message || err);
  process.exit(1);
});
