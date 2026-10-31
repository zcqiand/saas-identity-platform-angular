// UserListPage — M00.F02/M01.F02 tenant-scoped 成员管理（列表/创建/邀请/详情/编辑/启停/角色/删除）。
// 移植自 saas-identity-platform-react/src/pages/UserListPage.tsx（REQ-2026-029 T-2）。
// 走 tenantMembers* orval 生成物 1:1；angular 契约 list 返回扁平 TenantMemberUserView
// （ADR-0029 双形态归一化在契约层已收敛，无需 react 的 normalizeMemberRow）。
// 创建走 CreateSysUserRequest（角色不在 create body）→ 成功后二步 assignTenantMemberRoles；
// 编辑只走 UpdateSysUserRequest {email?, mobile?}（状态已移出，独立启停走 I08）。
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatTableModule } from "@angular/material/table";
import { toSignal } from "@angular/core/rxjs-interop";
import { firstValueFrom, map } from "rxjs";
import { QueryClient, injectQuery } from "@tanstack/angular-query";

import { AdminTenantsService } from "../../api/endpoints/admin-tenants/admin-tenants.service";
import { TenantMembersService } from "../../api/endpoints/tenant-members/tenant-members.service";
import { TenantRolesService } from "../../api/endpoints/tenant-roles/tenant-roles.service";
import type {
  CreateSysUserRequest,
  SysRole,
  TenantMemberStatus,
  TenantMemberUserView,
  UpdateSysUserRequest,
} from "../../api/endpoints/model";
import { toApiError } from "../../api/api-error";
import { PageHeaderComponent } from "../ui/page-header.component";
import { PageLoadingComponent } from "../ui/page-loading.component";
import { StatusBadgeComponent } from "../ui/status-badge.component";
import { ToastService } from "../ui/toast.service";
import { openConfirm } from "../ui/confirm-dialog.component";
import { openCrud } from "../ui/crud-dialog.component";

const LIST_KEY = "tenantMembersListTenantUsers";

// 含 2：分页行为断言需要「每页 2 条」档（tenant1 种子 3 人 → 首页 2 行 + 第 2 页 1 行）
const PAGE_SIZES = [2, 5, 10, 20];

const STATUS_FILTER_OPTIONS: Array<{ value: TenantMemberStatus; label: string }> = [
  { value: "active", label: "启用" },
  { value: "invited", label: "已邀请" },
  { value: "suspended", label: "暂停" },
  { value: "disabled", label: "停用" },
];

// 编辑只走契约 UpdateSysUserRequest {email?, mobile?}——status 已移出编辑弹窗，
// 独立启停走行内按钮 + changeTenantUserStatus（M00.F02.I08）。
const EDIT_FIELDS = [
  { name: "email", label: "邮箱", required: true, placeholder: "alice@acme.io" },
  { name: "mobile", label: "手机号", placeholder: "13800000000" },
];

/** 创建成员弹窗：用户名/初始密码/邮箱 + 角色多选（创建成功后页面二步 assignRoles）。 */
@Component({
  selector: "app-member-create-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>创建成员</h2>
    <mat-dialog-content>
      <p class="dlg-hint">
        向租户添加一个新用户（契约 CreateSysUserRequest：用户名 + 初始密码 +
        邮箱；角色创建后二步绑定）。
      </p>
      <mat-form-field appearance="outline" class="dlg-field">
        <mat-label>用户名 *</mat-label>
        <input
          matInput
          data-testid="member-field-username"
          [value]="username()"
          (input)="onField('username', $event)"
          placeholder="alice"
        />
      </mat-form-field>
      <mat-form-field appearance="outline" class="dlg-field">
        <mat-label>初始密码 *</mat-label>
        <input
          matInput
          type="password"
          data-testid="member-field-password"
          [value]="password()"
          (input)="onField('password', $event)"
          placeholder="至少 8 位"
        />
      </mat-form-field>
      <mat-form-field appearance="outline" class="dlg-field">
        <mat-label>邮箱 *</mat-label>
        <input
          matInput
          type="email"
          data-testid="member-field-email"
          [value]="email()"
          (input)="onField('email', $event)"
          placeholder="alice@acme.io"
        />
      </mat-form-field>
      <div class="role-list" data-testid="member-role-list">
        @if (data.roles.length === 0) {
          <div class="role-empty">暂无角色</div>
        }
        @for (r of data.roles; track r.id) {
          <mat-checkbox
            [attr.data-testid]="'role-opt-' + r.roleCode"
            [checked]="selected().includes(r.id)"
            (change)="toggle(r.id, $event.checked)"
          >
            <span class="role-code">{{ r.roleCode }}</span>
            {{ r.roleName }}
          </mat-checkbox>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>取消</button>
      <button
        mat-flat-button
        color="primary"
        data-testid="member-form-submit"
        (click)="submit()"
      >
        创建
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dlg-hint {
        margin: 0 0 12px;
        color: #64748b;
        font-size: 0.8rem;
      }
      .dlg-field {
        display: block;
        margin-bottom: 4px;
      }
      .role-list {
        display: flex;
        max-height: 12rem;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 8px;
      }
      .role-empty {
        color: #94a3b8;
        font-size: 0.75rem;
      }
      .role-code {
        font-family: monospace;
        font-size: 0.75rem;
      }
    `,
  ],
})
export class MemberCreateDialogComponent {
  readonly data: { roles: SysRole[] } = inject(MAT_DIALOG_DATA) as { roles: SysRole[] };
  private readonly ref = inject(MatDialogRef);

  readonly username = signal("");
  readonly password = signal("");
  readonly email = signal("");
  readonly selected = signal<string[]>([]);

  // jsdom/zoneless 下 ngModel accessor 时序不稳（实测 [diag] 指纹：首字段 CD 被打回
  // 空），弹窗字段直接吃原生 input 事件——语义等价、无 accessor 中间层。
  onField(name: "username" | "password" | "email", event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (name === "username") this.username.set(v);
    else if (name === "password") this.password.set(v);
    else this.email.set(v);
  }

  toggle(roleId: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(roleId);
    else next.delete(roleId);
    this.selected.set([...next]);
  }

  submit(): void {
    if (!this.username().trim() || !this.password() || !this.email().trim()) return;
    this.ref.close({
      username: this.username().trim(),
      password: this.password(),
      email: this.email(),
      roleIds: this.selected(),
    });
  }
}

/** 分配角色弹窗：角色多选（已选预勾选），保存走 assignTenantMemberRoles。 */
@Component({
  selector: "app-member-roles-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>分配角色：{{ data.username }}</h2>
    <mat-dialog-content>
      <div class="role-list">
        @if (data.roles.length === 0) {
          <div class="role-empty">暂无角色</div>
        }
        @for (r of data.roles; track r.id) {
          <mat-checkbox
            [attr.data-testid]="'role-opt-' + r.roleCode"
            [checked]="data.initialRoleIds.includes(r.id)"
            (change)="toggle(r.id, $event.checked)"
          >
            <span class="role-code">{{ r.roleCode }}</span>
            {{ r.roleName }}
          </mat-checkbox>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>取消</button>
      <button
        mat-flat-button
        color="primary"
        data-testid="member-roles-submit"
        (click)="submit()"
      >
        保存角色
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .role-list {
        display: flex;
        max-height: 12rem;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 8px;
      }
      .role-empty {
        color: #94a3b8;
        font-size: 0.75rem;
      }
      .role-code {
        font-family: monospace;
        font-size: 0.75rem;
      }
    `,
  ],
})
export class MemberRolesDialogComponent {
  readonly data: { roles: SysRole[]; initialRoleIds: string[]; username: string } =
    inject(MAT_DIALOG_DATA) as {
      roles: SysRole[];
      initialRoleIds: string[];
      username: string;
    };
  private readonly ref = inject(MatDialogRef);

  private readonly selected = signal<string[]>([...this.data.initialRoleIds]);

  toggle(roleId: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(roleId);
    else next.delete(roleId);
    this.selected.set([...next]);
  }

  submit(): void {
    this.ref.close({ roleIds: this.selected() });
  }
}

/** 成员详情弹层：契约 TenantMemberUserView 完整信息（只读）。 */
@Component({
  selector: "app-member-detail-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, StatusBadgeComponent],
  template: `
    <h2 mat-dialog-title>成员详情：{{ data.detail.username }}</h2>
    <mat-dialog-content>
      <div class="detail-body" data-testid="member-detail-dialog">
        <div class="detail-row">
          <span class="k">用户名</span><span>{{ data.detail.username }}</span>
        </div>
        <div class="detail-row">
          <span class="k">邮箱</span><span>{{ data.detail.email ?? "—" }}</span>
        </div>
        <div class="detail-row">
          <span class="k">状态</span>
          <app-status-badge [status]="data.detail.status" />
        </div>
        <div class="detail-row">
          <span class="k">所属租户</span>
          <span class="mono">{{ data.detail.tenantId }}</span>
        </div>
        <div class="detail-row">
          <span class="k">角色</span><span>{{ roleText() }}</span>
        </div>
        <div class="detail-row">
          <span class="k">创建时间</span><span>{{ data.detail.createdAt }}</span>
        </div>
        <div class="detail-row">
          <span class="k">更新时间</span><span>{{ data.detail.updatedAt }}</span>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>关闭</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .detail-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.875rem;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
      }
      .k {
        color: #64748b;
      }
      .mono {
        font-family: monospace;
        font-size: 0.75rem;
      }
    `,
  ],
})
export class MemberDetailDialogComponent {
  readonly data: { detail: TenantMemberUserView; roles: SysRole[] } = inject(
    MAT_DIALOG_DATA,
  ) as {
    detail: TenantMemberUserView;
    roles: SysRole[];
  };

  readonly roleText = computed(
    () =>
      this.data.detail.roleIds
        .map((id) => this.data.roles.find((r) => r.id === id)?.roleCode)
        .filter((c): c is string => Boolean(c))
        .join("、") || "—",
  );
}

@Component({
  selector: "app-user-list-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatTableModule,
    PageHeaderComponent,
    PageLoadingComponent,
    StatusBadgeComponent,
  ],
  templateUrl: "./user-list-page.html",
  styles: [
    `
      .ul-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ul-toolbar select {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 0.8rem;
      }
      .ul-table-wrap {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
      }
      .ul-name {
        font-weight: 500;
      }
      .ul-email {
        color: #64748b;
      }
      .ul-rolecount {
        color: #64748b;
        font-size: 0.75rem;
      }
      .ul-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.125rem;
      }
      .ul-del {
        color: #dc2626;
      }
      .ul-pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 24px;
        font-size: 0.8rem;
      }
      .ul-pager-btns {
        display: flex;
        gap: 8px;
      }
    `,
  ],
})
export class UserListPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly membersApi = inject(TenantMembersService);
  private readonly tenantsApi = inject(AdminTenantsService);
  private readonly rolesApi = inject(TenantRolesService);
  private readonly dialog = inject(MatDialog);
  private readonly qc = inject(QueryClient);
  private readonly toast = inject(ToastService);

  readonly tenantId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get("tenantId") ?? "")),
    { initialValue: this.route.snapshot.paramMap.get("tenantId") ?? "" },
  );

  readonly pageSizes = PAGE_SIZES;
  readonly statusOptions = STATUS_FILTER_OPTIONS;
  readonly displayedColumns = ["username", "email", "status", "roleCount", "actions"];

  readonly statusFilter = signal<TenantMemberStatus | "">("");
  readonly page = signal(0);
  readonly pageSize = signal(20);

  readonly tenantQ = injectQuery(() => ({
    queryKey: ["adminTenantsGetTenant", this.tenantId()],
    queryFn: async () =>
      await firstValueFrom(this.tenantsApi.adminTenantsGetTenant(this.tenantId())),
    enabled: this.tenantId() !== "",
  }));

  readonly list = injectQuery(() => ({
    queryKey: [
      LIST_KEY,
      this.tenantId(),
      this.page(),
      this.pageSize(),
      this.statusFilter(),
    ],
    queryFn: async () => {
      const sf = this.statusFilter();
      const res = await firstValueFrom(
        this.membersApi.tenantMembersListTenantUsers(this.tenantId(), {
          page: this.page(),
          pageSize: this.pageSize(),
          ...(sf ? { status: sf } : {}),
        }),
      );
      return { rows: res.items, total: res.total };
    },
    enabled: this.tenantId() !== "",
  }));

  readonly rolesQ = injectQuery(() => ({
    queryKey: ["tenantRolesListSysRoles", this.tenantId()],
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
  readonly users = computed<TenantMemberUserView[]>(() => this.list.data()?.rows ?? []);
  readonly total = computed(() => this.list.data()?.total ?? 0);
  readonly roles = computed<SysRole[]>(() => this.rolesQ.data() ?? []);

  onStatusFilter(event: Event): void {
    this.statusFilter.set(
      (event.target as HTMLSelectElement).value as TenantMemberStatus | "",
    );
    this.page.set(0);
  }

  onPageSize(event: Event): void {
    this.pageSize.set(Number((event.target as HTMLSelectElement).value));
    this.page.set(0);
  }

  prevPage(): void {
    this.page.set(Math.max(0, this.page() - 1));
  }

  nextPage(): void {
    this.page.set(this.page() + 1);
  }

  hasPrev(): boolean {
    return this.page() > 0;
  }

  hasNext(): boolean {
    return (this.page() + 1) * this.pageSize() < this.total();
  }

  private async invalidate(): Promise<void> {
    await this.qc.invalidateQueries({ queryKey: [LIST_KEY, this.tenantId()] });
  }

  openCreate(): void {
    this.dialog
      .open(MemberCreateDialogComponent, { data: { roles: this.roles() } })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          const created = await firstValueFrom(
            this.membersApi.tenantMembersCreateTenantUser(this.tenantId(), {
              username: values.username,
              password: values.password,
              email: values.email || undefined,
            } as CreateSysUserRequest),
          );
          if (values.roleIds.length > 0) {
            await firstValueFrom(
              this.membersApi.tenantMembersAssignTenantMemberRoles(
                this.tenantId(),
                created.id,
                {
                  roleIds: values.roleIds,
                },
              ),
            );
          }
          await this.invalidate();
          this.toast.success("用户已创建");
        } catch (err) {
          this.toast.error(`创建失败：${toApiError(err).message}`);
        }
      });
  }

  openInvite(): void {
    openCrud(this.dialog, {
      title: "邀请成员",
      description:
        "发送邀请（后端语义：新建 status=invited 的成员，username 取邮箱前缀；无邀请链接展示面）。",
      fields: [
        { name: "email", label: "邮箱", required: true, placeholder: "ivy@acme.io" },
        { name: "mobile", label: "手机号", placeholder: "13800000000" },
      ],
      submitText: "发送邀请",
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.membersApi.tenantMembersInviteTenantUser(this.tenantId(), {
              email: values["email"] ? String(values["email"]) : undefined,
              mobile: values["mobile"] ? String(values["mobile"]) : undefined,
            }),
          );
          await this.invalidate();
          this.toast.success("邀请已发送");
        } catch (err) {
          this.toast.error(`邀请失败：${toApiError(err).message}`);
        }
      });
  }

  openEdit(u: TenantMemberUserView): void {
    openCrud(this.dialog, {
      title: "编辑用户",
      fields: EDIT_FIELDS,
      initialValues: { email: u.email ?? "", mobile: "" },
      submitText: "保存",
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.membersApi.tenantMembersUpdateTenantUser(this.tenantId(), u.id, {
              email: values["email"] as string,
              mobile: values["mobile"] ? String(values["mobile"]) : undefined,
            } as UpdateSysUserRequest),
          );
          await this.invalidate();
          this.toast.success("用户已更新");
        } catch (err) {
          this.toast.error(`更新失败：${toApiError(err).message}`);
        }
      });
  }

  openRoles(u: TenantMemberUserView): void {
    this.dialog
      .open(MemberRolesDialogComponent, {
        data: { roles: this.roles(), initialRoleIds: u.roleIds, username: u.username },
      })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        try {
          await firstValueFrom(
            this.membersApi.tenantMembersAssignTenantMemberRoles(this.tenantId(), u.id, {
              roleIds: values.roleIds,
            }),
          );
          await this.invalidate();
          this.toast.success("角色已分配");
        } catch (err) {
          this.toast.error(`角色分配失败：${toApiError(err).message}`);
        }
      });
  }

  async openDetail(u: TenantMemberUserView): Promise<void> {
    try {
      const detail = await firstValueFrom(
        this.membersApi.tenantMembersGetTenantUser(this.tenantId(), u.id),
      );
      this.dialog.open(MemberDetailDialogComponent, {
        data: { detail, roles: this.roles() },
      });
    } catch (err) {
      this.toast.error(`详情加载失败：${toApiError(err).message}`);
    }
  }

  openStatusToggle(u: TenantMemberUserView): void {
    const suspending = u.status === "active";
    openConfirm(this.dialog, {
      title: `确认${suspending ? "停用" : "启用"}「${u.username}」？`,
      description: suspending
        ? "停用后该成员将无法登录本租户。"
        : "启用后该成员恢复登录本租户。",
      confirmText: "确认",
    })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        try {
          await firstValueFrom(
            this.membersApi.tenantMembersChangeTenantUserStatus(this.tenantId(), u.id, {
              status: suspending ? "suspended" : "active",
            }),
          );
          await this.invalidate();
        } catch (err) {
          this.toast.error(`状态变更失败：${toApiError(err).message}`);
        }
      });
  }

  openDelete(u: TenantMemberUserView): void {
    openConfirm(this.dialog, {
      title: `删除用户「${u.username}」？`,
      description: "用户删除后不可恢复，已分配的关联角色也会一并解除。",
      confirmText: "删除",
      destructive: true,
    })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        try {
          await firstValueFrom(
            this.membersApi.tenantMembersDeleteTenantUser(this.tenantId(), u.id),
          );
          await this.invalidate();
          this.toast.success("用户已删除");
        } catch (err) {
          this.toast.error(`删除失败：${toApiError(err).message}`);
        }
      });
  }
}
