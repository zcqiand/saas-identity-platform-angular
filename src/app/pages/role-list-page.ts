// RoleListPage — M00.F03 tenant-scoped 角色列表（CRUD + 菜单授权入口）。
// 移植自 saas-identity-platform-react/src/pages/RoleListPage.tsx（REQ-2026-029 T-2）。
// 契约字段 code/name→roleCode/roleName；删 I01 权限矩阵死按钮（PUT permissions
// 契约已废弃，权限面由 role-menus 承接，对齐 vue/nextjs 基准）。
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatTableModule } from "@angular/material/table";
import { toSignal } from "@angular/core/rxjs-interop";
import { firstValueFrom, map } from "rxjs";
import { QueryClient, injectQuery } from "@tanstack/angular-query";

import { AdminTenantsService } from "../../api/endpoints/admin-tenants/admin-tenants.service";
import { TenantRolesService } from "../../api/endpoints/tenant-roles/tenant-roles.service";
import type {
  CreateSysRoleRequest,
  SysRole,
  UpdateSysRoleRequest,
} from "../../api/endpoints/model";
import { toApiError } from "../../api/api-error";
import { PageHeaderComponent } from "../ui/page-header.component";
import { PageLoadingComponent } from "../ui/page-loading.component";
import { ToastService } from "../ui/toast.service";
import { openConfirm } from "../ui/confirm-dialog.component";
import { type FieldDef, openCrud } from "../ui/crud-dialog.component";

const LIST_KEY = "tenantRolesListSysRoles";

const FIELDS: FieldDef[] = [
  { name: "roleCode", label: "Code", required: true, placeholder: "admin" },
  { name: "roleName", label: "名称", required: true, placeholder: "管理员" },
];

const EDIT_FIELDS: FieldDef[] = FIELDS.filter((f) => f.name !== "roleCode");

@Component({
  selector: "app-role-list-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatTableModule,
    RouterLink,
    PageHeaderComponent,
    PageLoadingComponent,
  ],
  templateUrl: "./role-list-page.html",
  styles: [
    `
      .rl-table-wrap {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
      }
      .rl-code {
        font-family: monospace;
        font-size: 0.75rem;
      }
      .rl-name {
        font-weight: 500;
      }
      .rl-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.25rem;
      }
      .rl-del {
        color: #dc2626;
      }
    `,
  ],
})
export class RoleListPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AdminTenantsService);
  private readonly rolesApi = inject(TenantRolesService);
  private readonly dialog = inject(MatDialog);
  private readonly qc = inject(QueryClient);
  private readonly toast = inject(ToastService);

  readonly tenantId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get("tenantId") ?? "")),
    { initialValue: this.route.snapshot.paramMap.get("tenantId") ?? "" },
  );

  readonly displayedColumns = ["roleCode", "roleName", "actions"];
  readonly createFields = FIELDS;
  readonly editFields = EDIT_FIELDS;

  readonly tenantQ = injectQuery(() => ({
    queryKey: ["adminTenantsGetTenant", this.tenantId()],
    queryFn: async () => {
      const res = await firstValueFrom(this.api.adminTenantsGetTenant(this.tenantId()));
      return res;
    },
    enabled: this.tenantId() !== "",
  }));

  readonly list = injectQuery(() => ({
    queryKey: [LIST_KEY, this.tenantId()],
    queryFn: async () => {
      const res = await firstValueFrom(
        this.rolesApi.tenantRolesListSysRoles(this.tenantId(), { clientId: "" }),
      );
      return res.items;
    },
    enabled: this.tenantId() !== "",
  }));

  readonly tenantLabel = computed(() => {
    const t = this.tenantQ.data();
    return t ? `租户 ${t.name}（${t.tenantKey}）` : "租户未知";
  });
  readonly roles = computed<SysRole[]>(() => this.list.data() ?? []);

  private async invalidate(): Promise<void> {
    await this.qc.invalidateQueries({ queryKey: [LIST_KEY, this.tenantId()] });
  }

  openCreate(): void {
    openCrud(this.dialog, {
      title: "新建角色",
      fields: FIELDS,
      submitText: "创建",
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.rolesApi.tenantRolesCreateSysRole(this.tenantId(), {
              ...(values as unknown as CreateSysRoleRequest),
              clientId: "saas-console",
            }),
          );
          await this.invalidate();
          this.toast.success("角色已创建");
        } catch (err) {
          this.toast.error(`创建失败：${toApiError(err).message}`);
        }
      });
  }

  openEdit(r: SysRole): void {
    openCrud(this.dialog, {
      title: "编辑角色",
      fields: EDIT_FIELDS,
      initialValues: { roleName: r.roleName },
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.rolesApi.tenantRolesUpdateSysRole(this.tenantId(), r.id, {
              roleName: values["roleName"] as string,
            } as unknown as UpdateSysRoleRequest),
          );
          await this.invalidate();
          this.toast.success("角色已更新");
        } catch (err) {
          this.toast.error(`更新失败：${toApiError(err).message}`);
        }
      });
  }

  openDelete(r: SysRole): void {
    openConfirm(this.dialog, {
      title: `删除角色「${r.roleName}」？`,
      description: "角色删除将一并解除角色与用户的绑定关系。",
      confirmText: "删除",
      destructive: true,
    })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        try {
          await firstValueFrom(
            this.rolesApi.tenantRolesDeleteSysRole(this.tenantId(), r.id),
          );
          await this.invalidate();
          this.toast.success("角色已删除");
        } catch (err) {
          this.toast.error(`删除失败：${toApiError(err).message}`);
        }
      });
  }
}
