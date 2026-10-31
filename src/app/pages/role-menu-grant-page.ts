// RoleMenuGrantPage — M00.F04 角色 ↔ 菜单授权（按 client 分组的勾选矩阵 + 保存）。
// 移植自 saas-identity-platform-react/src/pages/RoleMenuGrantPage.tsx
// （REQ-2026-029 T-2）。app 寻址统一 code 形（clientId）：真后端按 client_id 列
// 查，行 UUID 会 404。granted 集合由 grantQ 数据经 effect 灌入（react useEffect
// 同构），勾选/清空只动本地集合，保存整集 PUT。
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { toSignal } from "@angular/core/rxjs-interop";
import { firstValueFrom, map } from "rxjs";
import { QueryClient, injectQuery } from "@tanstack/angular-query";

import { AdminClientsService } from "../../api/endpoints/admin-clients/admin-clients.service";
import { AdminTenantsService } from "../../api/endpoints/admin-tenants/admin-tenants.service";
import { ClientMenusService } from "../../api/endpoints/client-menus/client-menus.service";
import { TenantRoleMenusService } from "../../api/endpoints/tenant-role-menus/tenant-role-menus.service";
import type { SetSysRoleMenusRequest, SysMenu } from "../../api/endpoints/model";
import { toApiError } from "../../api/api-error";
import { PageHeaderComponent } from "../ui/page-header.component";
import { PageLoadingComponent } from "../ui/page-loading.component";
import { ToastService } from "../ui/toast.service";

const GRANT_KEY = "tenantRoleMenusListSysRoleMenus";

interface MenuGroup {
  appCode: string;
  appName: string;
  menus: SysMenu[];
}

@Component({
  selector: "app-role-menu-grant-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, PageHeaderComponent, PageLoadingComponent],
  templateUrl: "./role-menu-grant-page.html",
  styles: [
    `
      .rg-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .rg-card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        padding: 1rem 1.25rem;
      }
      .rg-card-title {
        font-size: 1rem;
        font-weight: 600;
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
      }
      .rg-code {
        font-family: monospace;
        font-size: 0.75rem;
        color: #64748b;
      }
      .rg-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        cursor: pointer;
      }
      .rg-row:hover {
        background: #f8fafc;
      }
      .rg-title {
        font-weight: 500;
        font-size: 0.875rem;
      }
      .rg-path {
        font-family: monospace;
        font-size: 0.75rem;
        color: #64748b;
      }
      .rg-summary {
        font-size: 0.875rem;
      }
      .rg-summary b {
        font-weight: 700;
      }
    `,
  ],
})
export class RoleMenuGrantPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AdminTenantsService);
  private readonly clientsApi = inject(AdminClientsService);
  private readonly menusApi = inject(ClientMenusService);
  private readonly roleMenusApi = inject(TenantRoleMenusService);
  private readonly qc = inject(QueryClient);
  private readonly toast = inject(ToastService);

  readonly tenantId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get("tenantId") ?? "")),
    { initialValue: this.route.snapshot.paramMap.get("tenantId") ?? "" },
  );
  readonly roleId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get("roleId") ?? "")),
    { initialValue: this.route.snapshot.paramMap.get("roleId") ?? "" },
  );

  /** 当前勾选集合（本地态；保存时整集 PUT）。 */
  readonly granted = signal<Set<string>>(new Set());
  readonly saving = signal(false);

  readonly tenantQ = injectQuery(() => ({
    queryKey: ["adminTenantsGetTenant", this.tenantId()],
    queryFn: async () =>
      await firstValueFrom(this.api.adminTenantsGetTenant(this.tenantId())),
    enabled: this.tenantId() !== "",
  }));

  readonly tenantLabel = computed(() => {
    const t = this.tenantQ.data();
    return t ? `${t.name}（${t.tenantKey}）` : "未知租户";
  });

  // 平台所有 client 下的菜单，按 client 分组（每张 Card 独立 menus，勿共享）
  readonly appsQ = injectQuery(() => ({
    queryKey: ["adminClientsListClients"],
    queryFn: async () => {
      const res = await firstValueFrom(this.clientsApi.adminClientsListClients());
      return res.items;
    },
  }));

  readonly apps = computed(() => this.appsQ.data() ?? []);
  readonly appsKey = computed(() =>
    this.apps()
      .map((a) => a.clientId)
      .join(","),
  );

  readonly groupsQ = injectQuery(() => ({
    queryKey: ["roleMenuGrantAllGroups", this.tenantId(), this.roleId(), this.appsKey()],
    queryFn: async (): Promise<MenuGroup[]> => {
      const items = this.apps();
      return Promise.all(
        items.map(async (a) => ({
          appCode: a.clientId,
          appName: a.clientName,
          menus: await firstValueFrom(this.menusApi.clientMenusListSysMenus(a.clientId)),
        })),
      );
    },
    enabled: this.tenantId() !== "" && this.roleId() !== "" && this.apps().length > 0,
  }));

  readonly groups = computed<MenuGroup[]>(() => this.groupsQ.data() ?? []);

  readonly grantQ = injectQuery(() => ({
    queryKey: [GRANT_KEY, this.tenantId(), this.roleId()],
    queryFn: async () =>
      await firstValueFrom(
        this.roleMenusApi.tenantRoleMenusListSysRoleMenus(
          this.tenantId(),
          this.roleId(),
          {
            clientId: "",
          },
        ),
      ),
    enabled: this.tenantId() !== "" && this.roleId() !== "",
  }));

  constructor() {
    effect(() => {
      const d = this.grantQ.data();
      if (d) this.granted.set(new Set(d.menuIds));
    });
  }

  toggle(id: string): void {
    const next = new Set(this.granted());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.granted.set(next);
  }

  clearAll(): void {
    this.granted.set(new Set());
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.roleMenusApi.tenantRoleMenusSetSysRoleMenus(
          this.tenantId(),
          this.roleId(),
          { menuIds: [...this.granted()] } as SetSysRoleMenusRequest,
          { clientId: "" },
        ),
      );
      await this.qc.invalidateQueries({
        queryKey: [GRANT_KEY, this.tenantId(), this.roleId()],
      });
      this.toast.success("菜单授权已保存");
    } catch (err) {
      this.toast.error(`保存失败：${toApiError(err).message}`);
    } finally {
      this.saving.set(false);
    }
  }
}
