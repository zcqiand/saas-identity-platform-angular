// AppListPage — M04 平台级应用管理（CRUD + 启用/停用；同时承担 OAuth client 职责）。
// 移植自 saas-identity-platform-react/src/pages/AppListPage.tsx
// （REQ-2026-029 T-2）。2026-09-12 形状收敛：契约 OAuthClient
// （clientId/clientName/status:number/scopes:string），按 clientId（code 形）寻址。
// icon/sortOrder/isFirstParty 是 react 侧行扩展列（真后端 DTO 忽略未知字段）——
// 弹窗字段保留（1:1 平行），落库以契约字段为准。
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatTableModule } from "@angular/material/table";
import { firstValueFrom } from "rxjs";
import { QueryClient, injectQuery } from "@tanstack/angular-query";

import { AdminClientsService } from "../../api/endpoints/admin-clients/admin-clients.service";
import type {
  CreateOAuthClientRequest,
  OAuthClient,
  UpdateOAuthClientRequest,
} from "../../api/endpoints/model";
import { toApiError } from "../../api/api-error";
import { EmptyStateComponent } from "../ui/empty-state.component";
import { PageHeaderComponent } from "../ui/page-header.component";
import { PageLoadingComponent } from "../ui/page-loading.component";
import { StatusBadgeComponent } from "../ui/status-badge.component";
import { ToastService } from "../ui/toast.service";
import { openConfirm } from "../ui/confirm-dialog.component";
import { type FieldDef, openCrud } from "../ui/crud-dialog.component";

const LIST_KEY = "adminClientsListClients";

const STATUS_OPTIONS = [
  { value: "1", label: "启用" },
  { value: "0", label: "停用" },
];

const FIELDS: FieldDef[] = [
  {
    name: "clientName",
    label: "名称",
    required: true,
    placeholder: "建筑工程实验室管理系统",
  },
  { name: "clientId", label: "Client ID", required: true, placeholder: "lab-management" },
  { name: "icon", label: "图标（lucide 名称）", placeholder: "FlaskConical" },
  { name: "sortOrder", label: "排序", type: "number", defaultValue: 0 },
  {
    name: "isFirstParty",
    label: "一方应用",
    type: "checkbox",
    defaultValue: true,
    hint: "一方应用对租户可见",
  },
  {
    name: "status",
    label: "状态",
    type: "select",
    required: true,
    defaultValue: "1",
    options: STATUS_OPTIONS,
  },
  { name: "scopesText", label: "Scopes（逗号分隔）", placeholder: "lab.read, lab.write" },
];

const EDIT_FIELDS: FieldDef[] = FIELDS.filter((f) => f.name !== "clientId");

/** 展示行：契约 OAuthClient + react 侧扩展列（icon/sortOrder/isFirstParty，
 * 真后端不回，弹窗预填走缺省）。 */
type AppRow = OAuthClient & {
  icon?: string;
  sortOrder?: number;
  isFirstParty?: boolean;
};

/** 契约请求 + 行扩展列（显式交叉类型，不隐身）。 */
type ClientCreateInput = CreateOAuthClientRequest & {
  icon?: string;
  sortOrder?: number;
  isFirstParty?: boolean;
  status?: number;
};
type ClientUpdateInput = UpdateOAuthClientRequest & {
  icon?: string;
  sortOrder?: number;
  isFirstParty?: boolean;
  status?: number;
};

function scopesTextToScopes(scopesText: unknown): string {
  if (!scopesText) return "";
  return String(scopesText)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

function toClientInput(values: Record<string, unknown>): ClientCreateInput {
  return {
    // 契约 CreateOAuthClientRequest 必填：clientId/clientName/clientSecret/grantTypes/redirectUris
    clientId: String(values["clientId"] ?? "").trim(),
    clientName: String(values["clientName"] ?? "").trim(),
    clientSecret: `sec-${Math.random().toString(36).slice(2, 14)}`,
    grantTypes: "authorization_code,client_credentials",
    redirectUris: "",
    scopes: scopesTextToScopes(values["scopesText"]),
    status: Number(values["status"] ?? 1),
    // 行扩展列：真后端忽略
    icon: values["icon"] ? String(values["icon"]) : undefined,
    sortOrder: Number(values["sortOrder"] ?? 0),
    isFirstParty: Boolean(values["isFirstParty"]),
  };
}

@Component({
  selector: "app-app-list-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatTableModule,
    RouterLink,
    PageHeaderComponent,
    PageLoadingComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: "./app-list-page.html",
  styles: [
    `
      .al-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .al-card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        padding: 1rem 1.25rem;
      }
      .al-card-title {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 0.75rem;
      }
      .al-table-wrap {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
      }
      .al-code {
        font-family: monospace;
        font-size: 0.75rem;
      }
      .al-code-sub {
        font-family: monospace;
        font-size: 0.625rem;
        color: #64748b;
      }
      .al-name {
        font-weight: 500;
      }
      .al-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.25rem;
      }
      .al-del {
        color: #dc2626;
      }
    `,
  ],
})
export class AppListPageComponent {
  private readonly api = inject(AdminClientsService);
  private readonly dialog = inject(MatDialog);
  private readonly qc = inject(QueryClient);
  private readonly toast = inject(ToastService);

  readonly displayedColumns = ["clientId", "clientName", "status", "actions"];
  readonly createFields = FIELDS;
  readonly editFields = EDIT_FIELDS;

  readonly list = injectQuery(() => ({
    queryKey: [LIST_KEY],
    queryFn: async () => {
      const res = await firstValueFrom(this.api.adminClientsListClients());
      return res.items as AppRow[];
    },
  }));

  readonly apps = computed<AppRow[]>(() => this.list.data() ?? []);

  /** status 家族约定：smallint 数字（1=启用 / 0=停用；contract-test I49 锁 0/1 往返） */
  isActive(s: number): boolean {
    return s === 1;
  }

  rowScopes(a: AppRow): string[] {
    return a.scopes ? String(a.scopes).split(",").filter(Boolean) : [];
  }

  private async invalidate(): Promise<void> {
    await this.qc.invalidateQueries({ queryKey: [LIST_KEY] });
  }

  openCreate(): void {
    openCrud(this.dialog, {
      title: "新建应用",
      description: "应用同时也是 OAuth client；创建后会自动绑定到菜单树。",
      fields: FIELDS,
      submitText: "创建",
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(this.api.adminClientsCreateClient(toClientInput(values)));
          await this.invalidate();
          this.toast.success("应用已创建");
        } catch (err) {
          this.toast.error(`创建失败：${toApiError(err).message}`);
        }
      });
  }

  openEdit(a: AppRow): void {
    openCrud(this.dialog, {
      title: "编辑应用",
      fields: EDIT_FIELDS,
      initialValues: {
        clientName: a.clientName,
        icon: a.icon ?? "",
        sortOrder: a.sortOrder ?? 0,
        isFirstParty: a.isFirstParty ?? true,
        status: String(a.status ?? 1),
        scopesText: this.rowScopes(a).join(", "),
      },
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.api.adminClientsUpdateClient(a.clientId, {
              clientName: String(values["clientName"] ?? "").trim(),
              scopes: scopesTextToScopes(values["scopesText"]),
              icon: values["icon"] ? String(values["icon"]) : undefined,
              sortOrder: Number(values["sortOrder"] ?? 0),
              status: Number(values["status"] ?? 1),
              isFirstParty: Boolean(values["isFirstParty"]),
            } as ClientUpdateInput),
          );
          await this.invalidate();
          this.toast.success("应用已更新");
        } catch (err) {
          this.toast.error(`更新失败：${toApiError(err).message}`);
        }
      });
  }

  openDelete(a: AppRow): void {
    openConfirm(this.dialog, {
      title: `删除应用「${a.clientName}」？`,
      description: "应用删除将一并删除其下所有菜单。不可撤销。",
      confirmText: "删除",
      destructive: true,
    })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        try {
          await firstValueFrom(this.api.adminClientsDeleteClient(a.clientId));
          await this.invalidate();
          this.toast.success("应用已删除");
        } catch (err) {
          this.toast.error(`删除失败：${toApiError(err).message}`);
        }
      });
  }

  async toggleStatus(a: AppRow): Promise<void> {
    try {
      await firstValueFrom(
        this.api.adminClientsSetClientStatus(a.clientId, {
          status: this.isActive(a.status) ? 0 : 1,
        }),
      );
      await this.invalidate();
      this.toast.success("状态已切换");
    } catch (err) {
      this.toast.error(`状态切换失败：${toApiError(err).message}`);
    }
  }
}
