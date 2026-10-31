// 路由守卫 — 对应 react 仓 App.tsx 的 <RequireAuth>（REQ-2026-029）：
// 未登录（accessToken 缺失）一律重定向 /login。
import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { TenantStoreService } from "../state/tenant-store.service";

export const authGuard: CanActivateFn = () => {
  const store = inject(TenantStoreService);
  const router = inject(Router);
  return store.isAuthenticated() ? true : router.createUrlTree(["/login"]);
};
