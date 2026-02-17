export type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';

export type ReviewChecklistItem = { id: string; label: string; done: boolean };
export type ReviewChecklist = { version: 1; items: ReviewChecklistItem[] };

export type Task = {
  id: string;
  title: string;
  description?: string;
  context?: string;
  // Optional Vault credential handle (or hint) associated with the task.
  // This must never contain plaintext secrets.
  vaultItem?: string;
  status: TaskStatus;
  archived?: boolean;
  priority?: string;
  aiEffort?: string;
  aiThinking?: string;
  aiModelTier?: string;
  // Optional explicit OpenClaw model key/alias override for this task.
  aiModel?: string;
  assigneeIds?: string[];
  labels?: string[];
  requiredNodeId?: string;
  leaseOwnerAgentId?: string;
  leaseExpiresAt?: string;
  attemptCount?: number;
  lastProgressAt?: string;
  maxAutoNudges?: number;
  escalationAgentId?: string;
  createdAt?: string;
  updatedAt?: string;
  startAt?: string;
  dueAt?: string;
  completedAt?: string;
  requiresReview?: boolean;
  // Optional task-level policy knobs (e.g. future tool profile / escalation rules).
  policy?: unknown;
  // When requiresReview=true, this can enforce a "done" gate and provide deterministic review steps.
  reviewChecklist?: ReviewChecklist | null;
  order?: number;
  subtasksTotal?: number;
  subtasksDone?: number;
};

export type Agent = {
  id: string;
  displayName?: string;
  role?: string;
  openclawAgentId?: string;
  avatar?: string | string[];
  status?: string;
  currentTaskId?: string;
  lastSeenAt?: string;
  lastWorklogAt?: string;
  modelTier?: string;
  defaultNodeId?: string;
};

export type Activity = {
  id: string;
  type: string;
  summary: string;
  taskId?: string;
  createdAt?: string;
};

export type Message = {
  id: string;
  taskId: string;
  fromAgentId?: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DocumentRecord = {
  id: string;
  taskId?: string;
  title: string;
  content?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TaskFile = {
  id: string;
  taskId: string;
  title?: string;
  file?: string | string[];
  shareToken: string;
  createdAt?: string;
  updatedAt?: string;
};

export type NodeRecord = {
  id: string;
  nodeId?: string;
  displayName?: string;
  paired?: boolean;
  lastSeenAt?: string;
  os?: string;
  arch?: string;
  capabilities?: unknown;
  execPolicy?: string;
  allowlistSummary?: string;
};

export type PBList<T> = {
  items: T[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
};

export type Subtask = {
  id: string;
  taskId: string;
  title: string;
  done?: boolean;
  order?: number;
  assigneeIds?: string[];
  dueAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type VaultItemType = 'api_key' | 'username_password' | 'oauth_refresh' | 'secret';
export type VaultExposureMode = 'inject_only' | 'revealable';

export type VaultItem = {
  id: string;
  agent?: string;
  handle: string;
  type: VaultItemType;
  service?: string;
  username?: string;
  exposureMode?: VaultExposureMode;
  disabled?: boolean;
  notes?: string;
  tags?: unknown;
  lastUsedAt?: string;
  lastRotatedAt?: string;
  created?: string;
  updated?: string;
};

export type VaultAgentToken = {
  id: string;
  agent: string;
  label?: string;
  tokenPrefix: string;
  disabled?: boolean;
  lastUsedAt?: string;
  created?: string;
  updated?: string;
};

export type VaultAuditActorType = 'human' | 'agent';
export type VaultAuditAction = 'create' | 'update' | 'rotate' | 'disable' | 'enable' | 'delete' | 'resolve' | 'reveal';
export type VaultAuditStatus = 'ok' | 'deny' | 'error';

export type VaultAudit = {
  id: string;
  ts: string;
  actorType: VaultAuditActorType;
  agent?: string;
  vaultItem?: string;
  action: VaultAuditAction;
  sessionKey?: string;
  toolName?: string;
  status: VaultAuditStatus;
  error?: string;
  meta?: unknown;
  created?: string;
  updated?: string;
};

export type WorkflowKind = 'lobster' | 'manual';
export type Workflow = {
  id: string;
  name: string;
  description?: string;
  kind?: WorkflowKind;
  pipeline?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkflowRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type WorkflowRun = {
  id: string;
  workflowId: string;
  taskId?: string;
  status?: WorkflowRunStatus;
  sessionKey?: string;
  vars?: unknown;
  result?: unknown;
  log?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};
