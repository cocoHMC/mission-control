// Small, defensive redaction helpers for anything we return from OpenClaw.
// We prefer false positives over leaking secrets (tokens, cookies, API keys).

const REDACTED = '[redacted]';

export function redactText(input: string) {
  if (!input) return input;

  let text = String(input);

  // Authorization headers / bearer tokens.
  text = text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, `Bearer ${REDACTED}`);

  // Common env-style secrets.
  text = text.replace(
    /\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|SLACK_BOT_TOKEN|DISCORD_TOKEN|TELEGRAM_BOT_TOKEN)\s*=\s*([^\s]+)/gi,
    (_m, k) => `${k}=${REDACTED}`
  );

  // Generic key=value patterns.
  text = text.replace(/\b(token|password|secret|api[_-]?key)\s*=\s*([^\s]+)/gi, (_m, k) => `${k}=${REDACTED}`);

  // JSON-ish patterns: "token": "..."
  text = text.replace(
    /"(token|password|secret|api[_-]?key)"\s*:\s*"([^"]+)"/gi,
    (_m, k) => `"${k}":"${REDACTED}"`
  );

  return text;
}

export function redactLines(lines: string[]) {
  return lines.map((l) => redactText(l));
}

