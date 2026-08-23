/** Обёртки над эндпоинтами из docs/ARCHITECTURE.md §5.6. */
import type { ApiLocale } from '@/i18n';
import type {
  AdminQueueResponse,
  DecisionResult,
  DownloadUrlResponse,
  FileKind,
  FileMeta,
  LoginResponse,
  MeResponse,
  RateVersion,
  RatesResponse,
  RejectionReason,
  RequestResponse,
  RequestStatus,
  UploadUrlResponse,
} from './api-types';
import { apiRequest, setAccessToken } from './http';
import type {
  CeilingHeight,
  FinishPackage,
  ObjectType,
  PropertyCondition,
  WorkScope,
} from '@renovateam/pricing-core';

/* ----------------------------------- auth ---------------------------------- */

export interface RegisterPayload {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  locale: ApiLocale;
  quickEstimateIds?: string[];
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiRequest<{ userId: string; emailVerificationSent: true }>('/auth/register', {
      method: 'POST',
      body: payload,
      skipRefresh: true,
    }),

  login: async (email: string, password: string): Promise<LoginResponse> => {
    const result = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipRefresh: true,
    });
    setAccessToken(result.accessToken);
    return result;
  },

  logout: () => apiRequest<void>('/auth/logout', { method: 'POST', skipRefresh: true }),

  me: () => apiRequest<MeResponse>('/auth/me'),

  verify: (token: string) =>
    apiRequest<{ verified: true }>('/auth/verify', {
      method: 'POST',
      body: { token },
      skipRefresh: true,
    }),

  resendVerification: () =>
    apiRequest<{ sent: true; nextAllowedAt: string }>('/auth/resend-verification', {
      method: 'POST',
    }),
};

/* --------------------------------- pricing --------------------------------- */

export interface EstimatePayload {
  areaSqm: number;
  objectType: ObjectType;
  workScope: WorkScope;
  finishPackage: FinishPackage;
  condition: PropertyCondition;
  ceilingHeight: CeilingHeight;
  locale: ApiLocale;
}

export type EstimateApiResponse =
  | {
      id: string;
      needsManualReview: false;
      rateVersionId: string;
      amountBase: number;
      amountMin: number;
      amountMax: number;
      currency: 'AMD';
      expiresAt: string;
    }
  | {
      id: string;
      needsManualReview: true;
      rateVersionId: string;
      reason: 'DESIGNER_PACKAGE';
      expiresAt: string;
    };

export const pricingApi = {
  rates: () => apiRequest<RatesResponse>('/pricing/rates'),
  /** Сохраняет расчёт для аналитики; цену UI берёт из локального движка. */
  estimate: (payload: EstimatePayload) =>
    apiRequest<EstimateApiResponse>('/pricing/estimate', { method: 'POST', body: payload }),
};

/* -------------------------------- requests --------------------------------- */

export const requestsApi = {
  create: (payload: { quickEstimateId?: string; comment?: string; fileIds?: string[] }) =>
    apiRequest<RequestResponse>('/requests', { method: 'POST', body: payload }),
  mine: () => apiRequest<RequestResponse[]>('/requests/me'),
  byId: (id: string) => apiRequest<RequestResponse>(`/requests/${id}`),
  decide: (
    id: string,
    payload: { result: DecisionResult; reason?: RejectionReason; comment?: string },
  ) => apiRequest<RequestResponse>(`/requests/${id}/decision`, { method: 'POST', body: payload }),
};

/* ---------------------------------- files ---------------------------------- */

export const filesApi = {
  uploadUrl: (
    payload: {
      requestId?: string;
      kind: FileKind;
      originalName: string;
      mime: string;
      size: number;
    },
    signal?: AbortSignal,
  ) =>
    apiRequest<UploadUrlResponse>('/files/upload-url', {
      method: 'POST',
      body: payload,
      ...(signal ? { signal } : {}),
    }),

  confirm: (id: string, signal?: AbortSignal) =>
    apiRequest<{ id: string; uploadedAt: string; size: number }>(`/files/${id}/confirm`, {
      method: 'POST',
      ...(signal ? { signal } : {}),
    }),

  drafts: () => apiRequest<FileMeta[]>('/files/drafts'),

  remove: (id: string) => apiRequest<void>(`/files/${id}`, { method: 'DELETE' }),

  downloadUrl: (id: string) => apiRequest<DownloadUrlResponse>(`/files/${id}/download-url`),
};

/* ---------------------------------- admin ---------------------------------- */

export interface AdminQueueQuery {
  status?: RequestStatus;
  phone?: string;
  page?: number;
  pageSize?: number;
  sort?: 'createdAt:asc' | 'createdAt:desc';
}

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export const adminApi = {
  queue: (query: AdminQueueQuery) =>
    apiRequest<AdminQueueResponse>(`/admin/requests${toQueryString({ ...query })}`),

  request: (id: string) => apiRequest<RequestResponse>(`/admin/requests/${id}`),

  changeStatus: (id: string, payload: { to: RequestStatus; comment?: string }) =>
    apiRequest<RequestResponse>(`/admin/requests/${id}/status`, { method: 'PATCH', body: payload }),

  uploadQuote: (id: string, file: File, totalAmount: number) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('totalAmount', String(totalAmount));
    return apiRequest<{ id: string; totalAmount: number; createdAt: string; isCurrent: boolean }>(
      `/admin/requests/${id}/quote`,
      { method: 'POST', formData },
    );
  },

  quoteDownloadUrl: (id: string) =>
    apiRequest<DownloadUrlResponse>(`/admin/requests/${id}/quote/download-url`),

  rateVersions: () => apiRequest<{ items: RateVersion[] }>('/admin/pricing/rates/versions'),

  updateRates: (payload: { rates: Record<string, number>; note?: string }) =>
    apiRequest<{ versionId: string; createdAt: string }>('/admin/pricing/rates', {
      method: 'PUT',
      body: payload,
    }),
};
