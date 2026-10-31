// 路由表 — 对应 react 仓 App.tsx 的 <Routes>（REQ-2026-029）。
// W0：全部业务路由先指 PlaceholderPage（W1 逐页替换为真实现，路由路径不动）。
import { Routes } from "@angular/router";
import { AppShell } from "./app-shell/app-shell";
import { authGuard } from "./auth.guard";
import { PlaceholderPage } from "./placeholder-page";

export const routes: Routes = [
  // Login: no sidebar（W1 实现真登录页）
  { path: "login", component: PlaceholderPage },

  // All other pages wrapped by AppShell (sidebar + header + content)
  {
    path: "",
    canActivate: [authGuard],
    component: AppShell,
    children: [
      { path: "tenants", component: PlaceholderPage },
      { path: "tenants/:tenantId/members", component: PlaceholderPage },
      { path: "tenants/:tenantId/roles", component: PlaceholderPage },
      { path: "tenants/:tenantId/roles/:roleId/menus", component: PlaceholderPage },
      { path: "tenants/:tenantId/applications", component: PlaceholderPage },
      { path: "admin/clients", component: PlaceholderPage },
      { path: "admin/clients/:clientId/menus", component: PlaceholderPage },
      { path: "", pathMatch: "full", redirectTo: "tenants" },
      { path: "**", redirectTo: "tenants" },
    ],
  },
];
