// HTTP 拦截器 — 移植自 saas-identity-platform-react/src/api/http-client.ts 的
// axios 双拦截器（REQ-2026-029）。orval angular 生成物走相对路径 `/api/v1/...`
// + inject(HttpClient)，三件事在 Angular 侧由 functional interceptor 承接：
//   1) baseUrl 前缀（每次请求动态读 getApiBaseUrl()，后端切换切完即生效）
//   2) Bearer token（从 TenantStoreService 取，避免循环依赖同 react 的 callback 形态）
//   3) 401 → 清本地会话并踢回登录页（用户裁定 2026-09-12，保留后端切换选择）
import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { getApiBaseUrl } from "./backend-config";
import { TenantStoreService } from "../state/tenant-store.service";

export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  // 绝对 URL（真化测试直打 baseUrl / 外部跳转）不加工
  if (/^https?:\/\//.test(req.url)) return next(req);
  return next(req.clone({ url: getApiBaseUrl() + req.url }));
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TenantStoreService).accessToken();
  if (!token) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

/** 401 时清本地会话并跳登录页（保留后端切换选择）。 */
function handleUnauthorized(): void {
  // 2026-09-13 修 prod 登录死循环（react 同源注释）：扫全部 saas.* 键，只留后端切换选择。
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("saas.") && k !== "saas.api.backend") stale.push(k);
    }
    stale.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* localStorage 不可用：ignore */
  }
  window.location.assign("/login");
}

export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        const isAuthFlow = /\/api\/v1\/(auth|oauth)\//.test(req.url);
        const onLogin = window.location.pathname.startsWith("/login");
        if (!isAuthFlow && !onLogin) {
          handleUnauthorized();
        }
      }
      return throwError(() => err);
    }),
  );
