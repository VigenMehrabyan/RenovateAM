/**
 * Типы контрактов API (docs/ARCHITECTURE.md §5). Общего пакета shared-types
 * в репозитории нет, поэтому фронт держит собственное объявление —
 * оно повторяет таблицу §5.6 один в один.
 */
import type {
  CeilingHeight,
  FinishPackage,
  ObjectType,
  PropertyCondition,
  WorkScope,
} from '@renovateam/pricing-core';

export type UserRole = 'CLIENT' | 'ESTIMATOR' | 'ADMIN';

export type RequestStatus =
  'NEW' | 'IN_PROGRESS' | 'NEEDS_INFO' | 'QUOTE_READY' | 'ACCEPTED' | 'REJECTED';

export const REQUEST_STATUSES: readonly RequestStatus[] = [
  'NEW',
  'IN_PROGRESS',
  'NEEDS_INFO',
  'QUOTE_READY',
  'ACCEPTED',
  'REJECTED',
];

/** Матрица переходов статусов (ARCHITECTURE §8.1). UI не предлагает запрещённых. */
export const STATUS_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  NEW: ['IN_PROGRESS', 'NEEDS_INFO'],
  IN_PROGRESS: ['NEEDS_INFO', 'QUOTE_READY'],
  NEEDS_INFO: ['IN_PROGRESS', 'QUOTE_READY'],
  QUOTE_READY: ['ACCEPTED', 'REJECTED', 'NEEDS_INFO'],
  ACCEPTED: [],
  REJECTED: [],
};

/** Переходы, доступные сотруднику: решение клиента сметчик за него не принимает. */
export const STAFF_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  NEW: ['IN_PROGRESS', 'NEEDS_INFO'],
  IN_PROGRESS: ['NEEDS_INFO', 'QUOTE_READY'],
  NEEDS_INFO: ['IN_PROGRESS', 'QUOTE_READY'],
  QUOTE_READY: ['NEEDS_INFO'],
  ACCEPTED: [],
  REJECTED: [],
};

export type FileKind = 'BTI' | 'DESIGN';

export type DecisionResult = 'ACCEPTED' | 'REJECTED';

export type RejectionReason =
  'TOO_EXPENSIVE' | 'TOO_LONG' | 'CHOSE_ANOTHER' | 'POSTPONED' | 'OTHER';

export const REJECTION_REASONS: readonly RejectionReason[] = [
  'TOO_EXPENSIVE',
  'TOO_LONG',
  'CHOSE_ANOTHER',
  'POSTPONED',
  'OTHER',
];

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  locale: string;
  emailVerified: boolean;
}

export interface MeResponse extends AuthUser {
  phone: string;
  address: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RatesResponse {
  versionId: string;
  baseRateAmd: number;
  workScope: Record<WorkScope, number>;
  objectType: Record<ObjectType, number>;
  condition: Record<PropertyCondition, number>;
  ceilingHeight: Record<CeilingHeight, number>;
  rangeMin: number;
  rangeMax: number;
  validityDays: number;
}

export interface QuickEstimateView {
  id: string;
  areaSqm: number;
  objectType: ObjectType;
  workScope: WorkScope;
  finishPackage: FinishPackage;
  condition: PropertyCondition;
  ceilingHeight: CeilingHeight;
  amountMin: number | null;
  amountMax: number | null;
  needsManualReview: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface FileMeta {
  id: string;
  kind: FileKind;
  originalName: string;
  mime: string;
  size: number;
  uploadedAt: string | null;
}

export interface StatusLogEntry {
  id: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actorName: string | null;
  comment: string | null;
  createdAt: string;
}

export interface RequestResponse {
  id: string;
  number: number;
  status: RequestStatus;
  needsManual: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  estimate: QuickEstimateView | null;
  files: FileMeta[];
  quote: { id: string; totalAmount: number; createdAt: string } | null;
  decision: {
    result: DecisionResult;
    reason: RejectionReason | null;
    comment: string | null;
    createdAt: string;
  } | null;
  statusLog?: StatusLogEntry[];
  client?: AdminClient;
}

export interface AdminClient {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
}

export interface AdminQueueItem {
  id: string;
  number: number;
  status: RequestStatus;
  needsManual: boolean;
  createdAt: string;
  client: AdminClient;
  estimateSummary: { amountMin: number; amountMax: number } | null;
  filesCount: number;
  duplicatePhoneCount: number;
}

export interface AdminQueueResponse {
  items: AdminQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RateVersion {
  id: string;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string } | null;
  rates: Record<string, number>;
}

export interface UploadUrlResponse {
  fileId: string;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string;
}
