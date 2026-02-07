import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

type Body = {
  sessionKey?: string;
  key?: string;
  label?: string;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  responseUsage?: string;
  elevatedLevel?: string;
  execHost?: string;
  execSecurity?: string;
  execAsk?: string;
  execNode?: string;
  model?: string;
  spawnedBy?: string;
  sendPolicy?: string;
  groupActivation?: string;
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSessionKey(raw: string) {
  let sessionKey = raw;
  try {
    sessionKey = decodeURIComponent(raw);
  } catch {
    sessionKey = raw;
  }
  return sessionKey.replace(/ /g, '+').trim();
}

function normalizeThinkingLevel(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['off', 'minimal', 'low', 'medium', 'high', 'max', 'xhigh'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeVerboseLevel(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['on', 'off'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeReasoningLevel(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['off', 'on', 'stream'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeResponseUsage(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['off', 'tokens', 'full'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeElevatedLevel(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['on', 'off', 'ask', 'full'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeExecHost(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['sandbox', 'gateway', 'node'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeExecSecurity(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['deny', 'allowlist', 'full'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeExecAsk(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['off', 'on-miss', 'always'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeSendPolicy(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['allow', 'deny'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeGroupActivation(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'default') return 'default';
  const allowed = ['mention', 'always'];
  if (!allowed.includes(v)) return '';
  return v;
}

function normalizeOptionalString(raw: string) {
  const v = raw.trim();
  if (!v) return '';
  if (v.toLowerCase() === 'default') return 'default';
  return v;
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const sessionKey = normalizeSessionKey(safeString(body.sessionKey) || safeString(body.key));
  if (!sessionKey) return NextResponse.json({ ok: false, error: 'sessionKey required' }, { status: 400 });

  const labelRaw = safeString(body.label);
  const label = normalizeOptionalString(labelRaw);

  const thinkingLevelRaw = safeString(body.thinkingLevel);
  const thinkingLevel = normalizeThinkingLevel(thinkingLevelRaw);
  if (thinkingLevelRaw && !thinkingLevel) {
    return NextResponse.json({ ok: false, error: 'Invalid thinkingLevel (use default|off|minimal|low|medium|high|max|xhigh).' }, { status: 400 });
  }

  const verboseLevelRaw = safeString(body.verboseLevel);
  const verboseLevel = normalizeVerboseLevel(verboseLevelRaw);
  if (verboseLevelRaw && !verboseLevel) {
    return NextResponse.json({ ok: false, error: 'Invalid verboseLevel (use default|on|off).' }, { status: 400 });
  }

  const reasoningLevelRaw = safeString(body.reasoningLevel);
  const reasoningLevel = normalizeReasoningLevel(reasoningLevelRaw);
  if (reasoningLevelRaw && !reasoningLevel) {
    return NextResponse.json({ ok: false, error: 'Invalid reasoningLevel (use default|off|on|stream).' }, { status: 400 });
  }

  const responseUsageRaw = safeString(body.responseUsage);
  const responseUsage = normalizeResponseUsage(responseUsageRaw);
  if (responseUsageRaw && !responseUsage) {
    return NextResponse.json({ ok: false, error: 'Invalid responseUsage (use default|off|tokens|full).' }, { status: 400 });
  }

  const elevatedLevelRaw = safeString(body.elevatedLevel);
  const elevatedLevel = normalizeElevatedLevel(elevatedLevelRaw);
  if (elevatedLevelRaw && !elevatedLevel) {
    return NextResponse.json({ ok: false, error: 'Invalid elevatedLevel (use default|off|on|ask|full).' }, { status: 400 });
  }

  const execHostRaw = safeString(body.execHost);
  const execHost = normalizeExecHost(execHostRaw);
  if (execHostRaw && !execHost) {
    return NextResponse.json({ ok: false, error: 'Invalid execHost (use default|sandbox|gateway|node).' }, { status: 400 });
  }

  const execSecurityRaw = safeString(body.execSecurity);
  const execSecurity = normalizeExecSecurity(execSecurityRaw);
  if (execSecurityRaw && !execSecurity) {
    return NextResponse.json({ ok: false, error: 'Invalid execSecurity (use default|deny|allowlist|full).' }, { status: 400 });
  }

  const execAskRaw = safeString(body.execAsk);
  const execAsk = normalizeExecAsk(execAskRaw);
  if (execAskRaw && !execAsk) {
    return NextResponse.json({ ok: false, error: 'Invalid execAsk (use default|off|on-miss|always).' }, { status: 400 });
  }

  const execNode = normalizeOptionalString(safeString(body.execNode));
  const model = normalizeOptionalString(safeString(body.model));
  const spawnedBy = normalizeOptionalString(safeString(body.spawnedBy));

  const sendPolicyRaw = safeString(body.sendPolicy);
  const sendPolicy = normalizeSendPolicy(sendPolicyRaw);
  if (sendPolicyRaw && !sendPolicy) {
    return NextResponse.json({ ok: false, error: 'Invalid sendPolicy (use default|allow|deny).' }, { status: 400 });
  }

  const groupActivationRaw = safeString(body.groupActivation);
  const groupActivation = normalizeGroupActivation(groupActivationRaw);
  if (groupActivationRaw && !groupActivation) {
    return NextResponse.json({ ok: false, error: 'Invalid groupActivation (use default|mention|always).' }, { status: 400 });
  }

  if (
    !label &&
    !thinkingLevel &&
    !verboseLevel &&
    !reasoningLevel &&
    !responseUsage &&
    !elevatedLevel &&
    !execHost &&
    !execSecurity &&
    !execAsk &&
    !execNode &&
    !model &&
    !spawnedBy &&
    !sendPolicy &&
    !groupActivation
  ) {
    return NextResponse.json({ ok: false, error: 'Provide at least one patch field.' }, { status: 400 });
  }

  const params: Record<string, unknown> = { key: sessionKey };
  if (label) params.label = label === 'default' ? null : label;
  if (thinkingLevel) params.thinkingLevel = thinkingLevel === 'default' ? null : thinkingLevel;
  if (verboseLevel) params.verboseLevel = verboseLevel === 'default' ? null : verboseLevel;
  if (reasoningLevel) params.reasoningLevel = reasoningLevel === 'default' ? null : reasoningLevel;
  if (responseUsage) params.responseUsage = responseUsage === 'default' ? null : responseUsage;
  if (elevatedLevel) params.elevatedLevel = elevatedLevel === 'default' ? null : elevatedLevel;
  if (execHost) params.execHost = execHost === 'default' ? null : execHost;
  if (execSecurity) params.execSecurity = execSecurity === 'default' ? null : execSecurity;
  if (execAsk) params.execAsk = execAsk === 'default' ? null : execAsk;
  if (execNode) params.execNode = execNode === 'default' ? null : execNode;
  if (model) params.model = model === 'default' ? null : model;
  if (spawnedBy) params.spawnedBy = spawnedBy === 'default' ? null : spawnedBy;
  if (sendPolicy) params.sendPolicy = sendPolicy === 'default' ? null : sendPolicy;
  if (groupActivation) params.groupActivation = groupActivation === 'default' ? null : groupActivation;

  const res = await runOpenClaw(
    ['gateway', 'call', 'sessions.patch', '--params', JSON.stringify(params), '--json', '--timeout', '10000'],
    { timeoutMs: 12_000 }
  );
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to update session.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, result: parsed });
  } catch {
    return NextResponse.json({ ok: true, raw: redactText(stdout).slice(0, 4000) });
  }
}
