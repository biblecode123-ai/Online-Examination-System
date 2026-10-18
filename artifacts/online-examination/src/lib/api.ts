/**
 * Centralized API transport for the Ofijan student examination portal.
 *
 * Every HTTP call in this app goes through `apiRequest` so that:
 *  - the base URL is configured in exactly one place (VITE_API_BASE_URL),
 *  - the Sanctum bearer token is attached consistently,
 *  - 401 / network failures / rate limits are surfaced as one typed error,
 *  - request cancellation and timeouts work the same everywhere.
 *
 * The backend contract was verified against the Ofijan backend repository
 * (routes/api/v1/*.php) and the live API at https://2019api.ofijan.com/.
 */

const RAW_BASE =
  (typeof import.meta.env.VITE_API_BASE_URL === 'string' &&
    import.meta.env.VITE_API_BASE_URL.trim()) ||
  'https://2019api.ofijan.com';

/** e.g. https://2019api.ofijan.com (no trailing slash) */
export const API_BASE_URL = RAW_BASE.replace(/\/+$/, '');
/** All backend routes live under /api (see ofijan-backend/routes/api.php). */
export const API_ROOT = `${API_BASE_URL}/api`;

const TOKEN_STORAGE_KEY = 'ofijan.student.token.v1';

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse';

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  /** Backend `error_code` (e.g. DEPARTMENT_MISMATCH), when supplied. */
  readonly code?: string;
  /** Backend validation errors (`errors` bag), when supplied. */
  readonly errors?: Record<string, string[]>;
  /** Full parsed response body, so callers can read structured payloads. */
  readonly body?: unknown;

  constructor(
    message: string,
    status: number,
    kind: ApiErrorKind = 'http',
    code?: string,
    errors?: Record<string, string[]>,
    body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.code = code;
    this.errors = errors;
    this.body = body;
  }

  /** 429 from the backend's throttle middlewares. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Recoverable without user intervention — worth a manual retry. */
  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.status >= 500;
  }
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage unavailable — the session simply won't survive a reload */
  }
}

// ---------------------------------------------------------------------------
// Session expiry broadcast (any 401 outside of login drops the session)
// ---------------------------------------------------------------------------

type Listener = () => void;
const sessionListeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function broadcastSessionExpired(): void {
  sessionListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* one bad listener must not break the rest */
    }
  });
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON body (serialized automatically). */
  body?: unknown;
  /** Query string parameters; null/undefined entries are dropped. */
  query?: Record<string, QueryValue>;
  /** Caller-controlled cancellation (React Query abort signals, etc.). */
  signal?: AbortSignal;
  /** Defaults to 20s for reads, 30s for writes. */
  timeoutMs?: number;
  /** Do not attach the bearer token (login/logout-less public routes). */
  skipAuth?: boolean;
}

const DEFAULT_TIMEOUT_READ = 20_000;
const DEFAULT_TIMEOUT_WRITE = 30_000;

// ---------------------------------------------------------------------------
// Server clock sampling
// ---------------------------------------------------------------------------

let serverClock: { serverMs: number; sampledAt: number } | null = null;

/** Record an authoritative server timestamp (heartbeat `server_time`, etc.). */
export function noteServerTime(iso: string | number | null | undefined): void {
  if (iso === null || iso === undefined) return;
  const serverMs = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(serverMs)) return;
  serverClock = { serverMs, sampledAt: Date.now() };
}

/**
 * Best-effort current server time, so countdowns are immune to a skewed
 * client clock. Falls back to the local clock before the first sample.
 */
export function serverNow(): number {
  if (!serverClock) return Date.now();
  return serverClock.serverMs + (Date.now() - serverClock.sampledAt);
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_ROOT}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function linkSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
    timedOut: () => timedOut,
  };
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message) return record.message;
    if (typeof record.error === 'string' && record.error) return record.error;
    if (typeof record.error_type === 'string' && record.error_type) return record.error_type;
  }
  return fallback;
}

/**
 * Perform an API request against the Ofijan backend.
 *
 * Resolves with the parsed JSON body, rejects with {@link ApiError}.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    query,
    signal,
    timeoutMs = body ? DEFAULT_TIMEOUT_WRITE : DEFAULT_TIMEOUT_READ,
    skipAuth = false,
  } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = skipAuth ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const { signal: linkedSignal, cleanup, timedOut } = linkSignals(signal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: linkedSignal,
      credentials: 'omit',
    });
  } catch (error) {
    cleanup();
    if (timedOut()) {
      throw new ApiError('The server took too long to respond. Please try again.', 0, 'timeout');
    }
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(
      'Could not reach the examination server. Check your connection and retry.',
      0,
      'network',
    );
  }
  cleanup();

  // CORS-safelisted `Date` header gives a server-clock sample on every call.
  const dateHeader = response.headers.get('date');
  if (dateHeader) noteServerTime(dateHeader);

  const parsed = await parseBody(response);

  if (!response.ok) {
    const status = response.status;
    const record = (parsed ?? {}) as Record<string, unknown>;
    const errors =
      record.errors && typeof record.errors === 'object'
        ? (record.errors as Record<string, string[]>)
        : undefined;
    const code =
      typeof record.error_code === 'string'
        ? record.error_code
        : typeof record.code === 'string'
          ? record.code
          : undefined;

    // A 401 on any authenticated call means the token is gone/expired.
    if (status === 401 && !skipAuth && !path.endsWith('/login')) {
      setToken(null);
      broadcastSessionExpired();
    }

    throw new ApiError(
      messageFromBody(parsed, `Request failed (HTTP ${status}).`),
      status,
      'http',
      code,
      errors,
      parsed,
    );
  }

  return parsed as T;
}
