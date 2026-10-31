// TenantListPage — M00.F01 平台级租户管理（CRUD）。
// 移植自 saas-identity-platform-react/src/pages/TenantListPage.tsx（REQ-2026-029 T-2）。
// 选中行高亮 + 默认必选中（acme，SelectionStoreService localStorage hydrate）+
// 选中后 localStorage 记住 id+name；CRUD 走 adminTenants*（orval 1:1 端点）。
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatTableModule } from "@angular/material/table";
import { firstValueFrom } from "rxjs";
import { QueryClient, injectQuery } from "@tanstack/angular-query";

import { AdminTenantsService } from "../../api/endpoints/admin-tenants/admin-tenants.service";
import type {
  CreateTenantRequest,
  Tenant,
  TenantStatus,
  UpdateTenantRequest,
} from "../../api/endpoints/model";
import { toApiError } from "../../api/api-error";
import { SelectionStoreService } from "../../state/selection-store.service";
import { EmptyStateComponent } from "../ui/empty-state.component";
import { PageHeaderComponent } from "../ui/page-header.component";
import { PageLoadingComponent } from "../ui/page-loading.component";
import { StatusBadgeComponent } from "../ui/status-badge.component";
import { ToastService } from "../ui/toast.service";
import { openConfirm } from "../ui/confirm-dialog.component";
import { type FieldDef, type FieldValue, openCrud } from "../ui/crud-dialog.component";

const LIST_KEY = "adminTenantsListTenants";

// 契约字段 tenantKey（shared OpenAPI；9/7 起 code→tenantKey，页面 2026-09-11 随 E2E 铺开迁移）
const FIELDS: FieldDef[] = [
  { name: "tenantKey", label: "Code", required: true, placeholder: "acme" },
  { name: "name", label: "名称", required: true, placeholder: "ACME Corp" },
  {
    name: "status",
    label: "状态",
    type: "select",
    required: true,
    defaultValue: "active",
    options: [
      { value: "active", label: "启用" },
      { value: "suspended", label: "暂停" },
    ],
  },
];

@Component({
  selector: "app-tenant-list-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    PageHeaderComponent,
    PageLoadingComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: "./tenant-list-page.html",
  styles: [
    `
      .tl-table-wrap {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
      }
      .tl-key {
        font-family: monospace;
        font-size: 0.75rem;
      }
      .tl-name {
        font-weight: 500;
      }
      .tl-row {
        cursor: pointer;
      }
      .tl-row.selected {
        background: #eff6ff;
      }
      .tl-check {
        color: #2563eb;
      }
      .tl-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.25rem;
      }
      .tl-del {
        color: #dc2626;
      }
    `,
  ],
})
export class TenantListPageComponent {
  private readonly api = inject(AdminTenantsService);
  private readonly dialog = inject(MatDialog);
  private readonly qc = inject(QueryClient);
  private readonly toast = inject(ToastService);
  readonly selection = inject(SelectionStoreService);

  readonly displayedColumns = ["check", "tenantKey", "name", "status", "actions"];
  readonly fields = FIELDS;

  readonly list = injectQuery(() => ({
    queryKey: [LIST_KEY],
    queryFn: async () => {
      const res = await firstValueFrom(this.api.adminTenantsListTenants());
      return res.items;
    },
  }));

  readonly tenants = computed<Tenant[]>(() => this.list.data() ?? []);
  readonly selectedId = computed(() => this.selection.selectedTenant().id);
  readonly descriptionText = computed(() => {
    const sel = this.selection.selectedTenant();
    const base = "管理 SaaS 平台上的所有租户账号";
    return sel ? `${base} · 已选中 ${sel.name} (${sel.id.slice(0, 8)})` : base;
  });

  selectTenant(t: Tenant): void {
    this.selection.setSelectedTenant({ id: t.id, name: t.name });
  }

  private async invalidate(): Promise<void> {
    await this.qc.invalidateQueries({ queryKey: [LIST_KEY] });
  }

  openCreate(): void {
    openCrud(this.dialog, {
      title: "新建租户",
      description: "创建一个新的租户账号。Code 与名称不可重复。",
      fields: FIELDS,
      submitText: "创建",
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.api.adminTenantsCreateTenant(values as unknown as CreateTenantRequest),
          );
          await this.invalidate();
          this.toast.success("租户已创建");
        } catch (err) {
          this.toast.error(`创建失败：${toApiError(err).message}`);
        }
      });
  }

  openEdit(t: Tenant): void {
    openCrud(this.dialog, {
      title: "编辑租户",
      fields: FIELDS,
      initialValues: {
        tenantKey: t.tenantKey,
        name: t.name,
        status: t.status,
      } as Record<string, FieldValue>,
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.api.adminTenantsUpdateTenant(t.id, {
              name: values["name"] as string,
              status: values["status"] as TenantStatus,
            } as unknown as UpdateTenantRequest),
          );
          await this.invalidate();
          this.toast.success("租户已更新");
        } catch (err) {
          this.toast.error(`更新失败：${toApiError(err).message}`);
        }
      });
  }

  openDelete(t: Tenant): void {
    openConfirm(this.dialog, {
      title: `删除租户「${t.name}」？`,
      description: "删除后该租户下的用户、角色、API Key 数据将无法访问。操作不可撤销。",
      confirmText: "删除",
      destructive: true,
    })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        try {
          await firstValueFrom(this.api.adminTenantsDeleteTenant(t.id));
          await this.invalidate();
          this.toast.success("租户已删除");
        } catch (err) {
          this.toast.error(`删除失败：${toApiError(err).message}`);
        }
      });
  }
}
