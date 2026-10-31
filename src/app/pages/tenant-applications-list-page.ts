// TenantApplicationsListPage — M00.F05 租户应用订阅列表（subscribe/update/remove）。
// 移植自 saas-identity-platform-react/src/pages/TenantApplicationsListPage.tsx
// （REQ-2026-029 T-2）。状态码（家族约定 2026-09-10）：0=待激活/1=启用/2=停用；
// appName 由 adminClients 列表富化（clientId → clientName 唯一寻址路径）。
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatTableModule } from "@angular/material/table";
import { toSignal } from "@angular/core/rxjs-interop";
import { firstValueFrom, map } from "rxjs";
import { QueryClient, injectQuery } from "@tanstack/angular-query";

import { AdminClientsService } from "../../api/endpoints/admin-clients/admin-clients.service";
import { AdminTenantsService } from "../../api/endpoints/admin-tenants/admin-tenants.service";
import { TenantApplicationsService } from "../../api/endpoints/tenant-applications/tenant-applications.service";
import type {
  SubscribeTenantApplicationRequest,
  TenantApplication,
  UpdateTenantApplicationRequest,
} from "../../api/endpoints/model";
import { toApiError } from "../../api/api-error";
import { EmptyStateComponent } from "../ui/empty-state.component";
import { PageHeaderComponent } from "../ui/page-header.component";
import { PageLoadingComponent } from "../ui/page-loading.component";
import { ToastService } from "../ui/toast.service";
import { openConfirm } from "../ui/confirm-dialog.component";
import { type FieldDef, openCrud } from "../ui/crud-dialog.component";

const LIST_KEY = "tenantApplicationsListTenantApplications";

/** M00.F05 状态码（家族约定 2026-09-10）：0=待激活 / 1=启用 / 2=停用 */
const STATUS_OPTIONS = [
  { value: "0", label: "待激活" },
  { value: "1", label: "启用" },
  { value: "2", label: "停用" },
];

function statusToLabel(s: number): string {
  return STATUS_OPTIONS.find((o) => o.value === String(s))?.label ?? `状态 ${s}`;
}

function formatExpireTime(expireTime?: string): string {
  if (!expireTime) return "永久";
  return expireTime.slice(0, 10);
}

const SUBSCRIBE_FIELDS: FieldDef[] = [
  { name: "clientId", label: "Client ID", required: true, placeholder: "lab-management" },
  {
    name: "expireTime",
    label: "到期时间",
    placeholder: "2027-01-01T00:00:00Z（留空=永久）",
  },
];

const UPDATE_FIELDS: FieldDef[] = [
  {
    name: "status",
    label: "状态",
    type: "select",
    required: true,
    defaultValue: "1",
    options: STATUS_OPTIONS,
  },
  { name: "expireTime", label: "到期时间", placeholder: "留空=永久" },
];

@Component({
  selector: "app-tenant-applications-list-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatTableModule,
    PageHeaderComponent,
    PageLoadingComponent,
    EmptyStateComponent,
  ],
  templateUrl: "./tenant-applications-list-page.html",
  styles: [
    `
      .ta-table-wrap {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
      }
      .ta-name {
        font-weight: 500;
      }
      .ta-client {
        font-family: monospace;
        font-size: 0.75rem;
      }
      .ta-expire {
        color: #475569;
        font-size: 0.75rem;
      }
      .ta-status {
        display: inline-flex;
        border-radius: 6px;
        padding: 2px 8px;
        font-size: 0.75rem;
      }
      .ta-status--1 {
        background: #eff6ff;
        color: #1d4ed8;
      }
      .ta-status--0 {
        background: #fffbeb;
        color: #b45309;
      }
      .ta-status--other {
        background: #f1f5f9;
        color: #475569;
      }
      .ta-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.25rem;
      }
      .ta-del {
        color: #dc2626;
      }
    `,
  ],
})
export class TenantApplicationsListPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AdminTenantsService);
  private readonly clientsApi = inject(AdminClientsService);
  private readonly appsApi = inject(TenantApplicationsService);
  private readonly dialog = inject(MatDialog);
  private readonly qc = inject(QueryClient);
  private readonly toast = inject(ToastService);

  readonly tenantId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get("tenantId") ?? "")),
    { initialValue: this.route.snapshot.paramMap.get("tenantId") ?? "" },
  );

  readonly displayedColumns = ["appName", "clientId", "status", "expireTime", "actions"];
  readonly subscribeFields = SUBSCRIBE_FIELDS;
  readonly updateFields = UPDATE_FIELDS;

  readonly tenantQ = injectQuery(() => ({
    queryKey: ["adminTenantsGetTenant", this.tenantId()],
    queryFn: async () =>
      await firstValueFrom(this.api.adminTenantsGetTenant(this.tenantId())),
    enabled: this.tenantId() !== "",
  }));

  readonly list = injectQuery(() => ({
    queryKey: [LIST_KEY, this.tenantId()],
    queryFn: async () => {
      const res = await firstValueFrom(
        this.appsApi.tenantApplicationsListTenantApplications(this.tenantId()),
      );
      return res.items;
    },
    enabled: this.tenantId() !== "",
  }));

  // 应用名称解析：单键 clientId → clientName（2026-09-12 契约形状收敛后唯一寻址路径）
  readonly clientsQ = injectQuery(() => ({
    queryKey: ["adminClientsListClients"],
    queryFn: async () => {
      const res = await firstValueFrom(this.clientsApi.adminClientsListClients());
      return res.items;
    },
  }));

  readonly tenantLabel = computed(() => {
    const t = this.tenantQ.data();
    return t ? `租户 ${t.name}（${t.tenantKey}）` : "租户未知";
  });
  readonly apps = computed<TenantApplication[]>(() => this.list.data() ?? []);
  readonly clients = computed(() => this.clientsQ.data() ?? []);

  appName(clientId: string): string {
    return this.clients().find((c) => c.clientId === clientId)?.clientName ?? "未知应用";
  }

  statusLabel(s: number): string {
    return statusToLabel(s);
  }

  expireText(expireTime?: string): string {
    return formatExpireTime(expireTime);
  }

  private async invalidate(): Promise<void> {
    await this.qc.invalidateQueries({ queryKey: [LIST_KEY, this.tenantId()] });
  }

  openSubscribe(): void {
    openCrud(this.dialog, {
      title: "订阅应用",
      description:
        "输入应用 Client ID 与（可选）到期时间。订阅后租户内的角色可分配菜单权限。",
      fields: SUBSCRIBE_FIELDS,
      submitText: "创建",
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.appsApi.tenantApplicationsSubscribeTenantApplication(this.tenantId(), {
              clientId: String(values["clientId"] ?? "").trim(),
              expireTime: values["expireTime"] ? String(values["expireTime"]) : undefined,
            } as SubscribeTenantApplicationRequest),
          );
          await this.invalidate();
          this.toast.success("应用已订阅");
        } catch (err) {
          this.toast.error(`订阅失败：${toApiError(err).message}`);
        }
      });
  }

  openEdit(a: TenantApplication): void {
    openCrud(this.dialog, {
      title: "编辑订阅",
      fields: UPDATE_FIELDS,
      initialValues: { status: String(a.status), expireTime: a.expireTime ?? "" },
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.appsApi.tenantApplicationsUpdateTenantApplication(
              this.tenantId(),
              a.clientId,
              {
                status: Number(values["status"]),
                expireTime: values["expireTime"]
                  ? String(values["expireTime"])
                  : undefined,
              } as UpdateTenantApplicationRequest,
            ),
          );
          await this.invalidate();
          this.toast.success("订阅已更新");
        } catch (err) {
          this.toast.error(`更新失败：${toApiError(err).message}`);
        }
      });
  }

  openRemove(a: TenantApplication): void {
    openConfirm(this.dialog, {
      title: `取消订阅「${a.clientId}」？`,
      description: "租户下该应用的所有角色菜单授权将一并清除。不可撤销。",
      confirmText: "取消订阅",
      destructive: true,
    })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        try {
          await firstValueFrom(
            this.appsApi.tenantApplicationsRemoveTenantApplication(
              this.tenantId(),
              a.clientId,
            ),
          );
          await this.invalidate();
          this.toast.success("订阅已取消");
        } catch (err) {
          this.toast.error(`取消失败：${toApiError(err).message}`);
        }
      });
  }
}
