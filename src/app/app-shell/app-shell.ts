// AppShell — 顶栏（面包屑 + whoami 徽标 + 租户切换 + 登出）+ 左侧栏 + 主内容。
// 移植自 saas-identity-platform-react/src/components/app/app-shell.tsx（REQ-2026-029）。
// 侧边栏 `:tenantId` 占位由 SelectionStore 的 selectedTenantId 动态替换。
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { Router, RouterLink, RouterOutlet } from "@angular/router";
import { injectQuery } from "@tanstack/angular-query";
import { AdminTenantsService } from "../../api/endpoints/admin-tenants/admin-tenants.service";
import { MeService } from "../../api/endpoints/me/me.service";
import { SelectionStoreService } from "../../state/selection-store.service";
import { TenantStoreService } from "../../state/tenant-store.service";
import { firstValueFrom } from "rxjs";
import { buildNavItems, type NavItem } from "../nav-items";
import { BackendBadge } from "./backend-badge";
import { TenantSwitcher } from "./tenant-switcher";

interface Crumb {
  label: string;
  to: string;
}

const SUB_PATH_LABEL: Record<string, string> = {
  members: "用户",
  roles: "角色",
  clients: "应用",
  applications: "应用",
  menus: "菜单",
  admin: "平台管理",
};

@Component({
  selector: "app-app-shell",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    TenantSwitcher,
    BackendBadge,
  ],
  templateUrl: "./app-shell.html",
  styleUrl: "./app-shell.css",
})
export class AppShell {
  private readonly router = inject(Router);
  private readonly tenantStore = inject(TenantStoreService);
  private readonly selectionStore = inject(SelectionStoreService);
  private readonly meService = inject(MeService);
  private readonly adminTenantsService = inject(AdminTenantsService);

  readonly currentTenantId = this.tenantStore.currentTenantId;

  // 顶栏 whoami 徽标（M01 用户管理接线）：失败静默降级（retry:false + 条件渲染）
  private readonly whoamiQ = injectQuery(() => ({
    queryKey: ["meWhoami"],
    queryFn: () => firstValueFrom(this.meService.meWhoami()),
    retry: false,
  }));
  readonly whoami = computed(() => this.whoamiQ.data() ?? null);

  // 面包屑租户名：拉一次租户列表建 id->tenant 字典（staleTime Infinity 同 react）
  private readonly tenantMapQ = injectQuery(() => ({
    queryKey: ["adminTenantsListTenants", "breadcrumb"],
    queryFn: async () => {
      const body = await firstValueFrom(
        this.adminTenantsService.adminTenantsListTenants(),
      );
      return body.items;
    },
    staleTime: Infinity,
  }));

  readonly navItems = computed(() => {
    const tenantForNav =
      this.selectionStore.selectedTenant().id ??
      this.currentTenantId() ??
      "00000000-0000-0000-0000-000000000001";
    return [...buildNavItems(tenantForNav)];
  });

  readonly groups = computed(() => {
    const byGroup = new Map<string, NavItem[]>();
    for (const item of this.navItems()) {
      const list = byGroup.get(item.group) ?? [];
      list.push(item);
      byGroup.set(item.group, list);
    }
    return [...byGroup.entries()].map(([name, items]) => ({ name, items }));
  });

  readonly crumbs = computed<Crumb[]>(() => this.buildBreadcrumbs(this.router.url));

  private buildBreadcrumbs(pathname: string): Crumb[] {
    const tenantById = new Map<
      string,
      { id: string; name: string; tenantKey?: string }
    >();
    for (const t of this.tenantMapQ.data() ?? []) {
      tenantById.set(t.id, t);
      if (t.tenantKey) tenantById.set(t.tenantKey, t);
    }
    const fallbackTenantId =
      this.selectionStore.selectedTenant().id ?? this.currentTenantId() ?? "";
    if (pathname === "/tenants" || pathname === "/") {
      return [{ label: "首页", to: "/tenants" }];
    }
    const segments = pathname.split("?")[0].split("/").filter(Boolean);
    const crumbs: Crumb[] = [{ label: "首页", to: "/tenants" }];
    let path = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      path += "/" + seg;
      const prev = i > 0 ? segments[i - 1] : null;
      if (seg === "tenants" && i + 1 < segments.length) continue;
      if (prev === "tenants") {
        // 优先用 URL 段；找不到再回退 selectedTenantId（用户裁定 2026-09-11：只显示名称）
        const tenant = tenantById.get(seg) ?? tenantById.get(fallbackTenantId);
        crumbs.push({ label: tenant ? tenant.name : "未知租户", to: path });
        continue;
      }
      crumbs.push({ label: SUB_PATH_LABEL[seg] ?? seg, to: path });
    }
    return crumbs;
  }

  async onLogout(): Promise<void> {
    await this.tenantStore.logout();
    await this.router.navigate(["/login"]);
  }
}
