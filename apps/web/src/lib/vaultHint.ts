const START = '<!-- mc:vault-hint:start -->';
const END = '<!-- mc:vault-hint:end -->';

export function buildVaultHintMarkdown(params: { handle: string; includeUsernameRef?: boolean }) {
  const handle = String(params.handle || '').trim();
  if (!handle) return '';
  const includeUsernameRef = Boolean(params.includeUsernameRef);

  const lines: string[] = [];
  lines.push(START);
  lines.push('### Credential hint');
  lines.push(`- Vault handle: \`${handle}\``);
  lines.push(`- Placeholder: \`{{vault:${handle}}}\``);
  if (includeUsernameRef) lines.push(`- Username ref: \`{{vault:${handle}.username}}\``);
  lines.push(END);
  return lines.join('\n');
}

export function stripVaultHintMarkdown(input: string) {
  const s = String(input || '');
  const startIdx = s.indexOf(START);
  const endIdx = s.indexOf(END);
  if (startIdx === -1 || endIdx === -1) return s;
  if (endIdx < startIdx) return s;
  const afterEnd = endIdx + END.length;
  const out = (s.slice(0, startIdx) + s.slice(afterEnd)).replace(/\n{3,}/g, '\n\n').trimEnd();
  return out;
}

export function upsertVaultHintMarkdown(input: string, hintBlock: string) {
  const stripped = stripVaultHintMarkdown(input);
  const hint = String(hintBlock || '').trim();
  if (!hint) return stripped;
  const base = stripped.trimEnd();
  if (!base) return `${hint}\n`;
  return `${base}\n\n${hint}\n`;
}

