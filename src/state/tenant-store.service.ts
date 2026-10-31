// Tenant Store — 当前租户 + 当前用户 + JWT holder（REQ-2026-029）。
// 移植自 saas-identity-platform-react/src/state/tenant-context.tsx：
// React Context + useState → Angular signals 服务（zoneless 下 OnPush 直读 signal）。
// 存储字段：currentTenantId / tenantCode / accessToken / refreshToken / user
// 默认值 = null（首次加载未登录）。路由守卫（authGuard）据此决定是否重定向 /login。
import { Injectable, computed, signal } from "@angular/core";

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
}

export interface LoginPayload {
  accessToken: string;
  refreshToken: string;
  userId: string;
  username: string;
  email?: string;
  currentTenantId: string;
  tenantCode?: string | null;
}

interface PersistedSession {
  currentTenantId: string | null;
  tenantCode: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
}

const STORAGE_KEY = "saas.tenant";

function emptySession(): PersistedSession {
  return {
    currentTenantId: null,
    tenantCode: null,
    accessToken: null,
    refreshToken: null,
    user: null,
  };
}

function loadSession(): PersistedSession {
  if (typeof window === "undefined") return emptySession();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) as PersistedSession;
    return {
      currentTenantId: parsed.currentTenantId ?? null,
      tenantCode: parsed.tenantCode ?? null,
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
      user: parsed.user ?? null,
    };
  } catch {
    return emptySession();
  }
}

function saveSession(s: PersistedSession): void {
  if (typeof window === "undefined") return;
  if (!s.accessToken || !s.user) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

@Injectable({ providedIn: "root" })
export class TenantStoreService {
  // 同步从 localStorage hydrate：避免首屏渲染用空 session，导致 authGuard
  // 在 hydrate 完成前误判未认证并重定向 /login
  private readonly _session = signal<PersistedSession>(loadSession());

  readonly currentTenantId = computed(() => this._session().currentTenantId);
  readonly tenantCode = computed(() => this._session().tenantCode);
  readonly accessToken = computed(() => this._session().accessToken);
  readonly refreshToken = computed(() => this._session().refreshToken);
  readonly user = computed(() => this._session().user);
  /** 已认证（accessToken 非空） */
  readonly isAuthenticated = computed(() =>
    Boolean(this._session().accessToken && this._session().user),
  );

  private persist(next: PersistedSession): void {
    this._session.set(next);
    saveSession(next);
  }

  /** 用 /auth/login 响应填全字段（access + refresh + user + currentTenant） */
  login(payload: LoginPayload): void {
    this.persist({
      currentTenantId: payload.currentTenantId,
      tenantCode: payload.tenantCode ?? null,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      user: {
        id: payload.userId,
        username: payload.username,
        email: payload.email,
      },
    });
  }

  /** 调 /auth/logout，清 localStorage，重置 state */
  async logout(): Promise<void> {
    // best-effort；后端未实现/不可达时吞错。直接 fetch（不走拦截器，避免循环依赖）。
    const token = this._session().accessToken;
    if (token) {
      try {
        const { getApiBaseUrl } = await import("../api/backend-config");
        await fetch(`${getApiBaseUrl()}/api/v1/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // best-effort
      }
    }
    this.persist(emptySession());
  }

  /** 直接覆盖 tenant（不调后端），用于跨租户切换 */
  setTenant(id: string | null, code: string | null, token: string | null): void {
    // 仅切换租户上下文，保留 user + refreshToken + accessToken 除非显式给 token
    this.persist({
      ...this._session(),
      currentTenantId: id,
      tenantCode: code,
      accessToken: token ?? this._session().accessToken,
    });
  }

  clear(): void {
    this.persist(emptySession());
  }
}
