export type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';

export type Task = {
  id: string;
  title: string;
  description?: string;
  context?: string;
  status: TaskStatus;
  archived?: boolean;
  priority?: string;
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
  order?: number;
  subtasksTotal?: number;
  subtasksDone?: number;
};

export type Agent = {
  id: string;
  displayName?: string;
  role?: string;
  openclawAgentId?: string;
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
