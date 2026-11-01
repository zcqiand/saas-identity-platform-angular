// 路由表 — 对应 react 仓 App.tsx 的 <Routes>（REQ-2026-029）。
// W1 收口：八页真实现全部接线（路径与 W0 占位一致，路由路径不动）。
import { Routes } from "@angular/router";
import { AppShell } from "./app-shell/app-shell";
import { authGuard } from "./auth.guard";
import { AppListPageComponent } from "./pages/app-list-page";
import { LoginPageComponent } from "./pages/login-page";
import { MenuTreePageComponent } from "./pages/menu-tree-page";
import { RoleListPageComponent } from "./pages/role-list-page";
import { RoleMenuGrantPageComponent } from "./pages/role-menu-grant-page";
import { TenantApplicationsListPageComponent } from "./pages/tenant-applications-list-page";
import { TenantListPageComponent } from "./pages/tenant-list-page";
import { UserListPageComponent } from "./pages/user-list-page";

export const routes: Routes = [
  // Login: no sidebar
  { path: "login", component: LoginPageComponent },

  // All other pages wrapped by AppShell (sidebar + header + content)
  {
    path: "",
    canActivate: [authGuard],
    component: AppShell,
    children: [
      { path: "tenants", component: TenantListPageComponent },
      { path: "tenants/:tenantId/members", component: UserListPageComponent },
      { path: "tenants/:tenantId/roles", component: RoleListPageComponent },
      {
        path: "tenants/:tenantId/roles/:roleId/menus",
        component: RoleMenuGrantPageComponent,
      },
      {
        path: "tenants/:tenantId/applications",
        component: TenantApplicationsListPageComponent,
      },
      { path: "admin/clients", component: AppListPageComponent },
      { path: "admin/clients/:clientId/menus", component: MenuTreePageComponent },
      { path: "", pathMatch: "full", redirectTo: "tenants" },
      { path: "**", redirectTo: "tenants" },
    ],
  },
];
