// M00.F02.I03 / M01.F03.I02 — 租户切换器（REQ-2026-029，移植自 react 仓同名组件）。
// @entry M01.F03.I01 — 列出我的租户成员关系（GET /me/tenants 渲染切换菜单）
// 成员关系：GET /me/tenants（TenantMember[]，契约无租户名）；
// 显示名：join 平台租户列表（复用 adminTenantsListTenants 同 query key 缓存）。
// 切换：POST /me/tenants/:id/switch → 新 tenant-scoped token 落 session → 进该租户工作区。
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { injectQuery } from "@tanstack/angular-query";
import { AdminTenantsService } from "../../api/endpoints/admin-tenants/admin-tenants.service";
import { MeService } from "../../api/endpoints/me/me.service";
import { TenantStoreService } from "../../state/tenant-store.service";
import { toApiError } from "../../api/api-error";
import { firstValueFrom } from "rxjs";

@Component({
  selector: "app-tenant-switcher",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatMenuModule, MatIconModule],
  template: `
    <button
      mat-stroked-button
      [matMenuTriggerFor]="menu"
      data-testid="tenant-switcher"
      data-fn="M00.F02.I03"
      class="switcher-btn"
    >
      <mat-icon class="icon">apartment</mat-icon>
      <span class="label">{{ currentName() }}</span>
      <mat-icon class="icon small">unfold_more</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      <div class="menu-label">切换租户</div>
      @for (m of memberships(); track m.id) {
        <button mat-menu-item (click)="onSwitch(m.tenantId)">
          <mat-icon>apartment</mat-icon>
          <span class="col">
            <span class="name">{{
              nameById().get(m.tenantId) ?? m.tenantId.slice(0, 8)
            }}</span>
            <span class="key">{{ tenantKeyById().get(m.tenantId) ?? "" }}</span>
          </span>
        </button>
      }
    </mat-menu>
  `,
  styles: [
    `
      .switcher-btn {
        gap: 0.5rem;
      }
      .label {
        font-weight: 500;
      }
      .icon.small {
        transform: scale(0.75);
        opacity: 0.55;
      }
      .menu-label {
        padding: 0.5rem 1rem;
        font-size: 0.75rem;
        color: var(--color-fg);
        opacity: 0.6;
      }
      .col {
        display: flex;
        flex-direction: column;
      }
      .name {
        font-weight: 500;
      }
      .key {
        font-size: 0.7rem;
        font-family: monospace;
        opacity: 0.55;
      }
    `,
  ],
})
export class TenantSwitcher {
  private readonly tenantStore = inject(TenantStoreService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly meService = inject(MeService);
  private readonly adminTenantsService = inject(AdminTenantsService);

  private readonly membershipsQ = injectQuery(() => ({
    queryKey: ["meListMyTenants"],
    queryFn: () => firstValueFrom(this.meService.meListMyTenants({ clientId: "" })),
  }));
  private readonly tenantsQ = injectQuery(() => ({
    queryKey: ["adminTenantsListTenants"],
    queryFn: async () => {
      const body = await firstValueFrom(
        this.adminTenantsService.adminTenantsListTenants(),
      );
      return body.items;
    },
  }));

  // react 仓 items 包裹在 .data.items；angular orval 生成物直接返回 body（无 axios 壳）
  private readonly tenantItems = computed(() => this.tenantsQ.data() ?? []);
  readonly memberships = computed(() =>
    (this.membershipsQ.data() ?? []).filter((m) => m.status !== "disabled"),
  );
  private readonly nameByIdSig = computed(
    () => new Map(this.tenantItems().map((t) => [t.id, t.name] as const)),
  );
  private readonly tenantKeyByIdSig = computed(
    () => new Map(this.tenantItems().map((t) => [t.id, t.tenantKey] as const)),
  );
  readonly nameById = this.nameByIdSig;
  readonly tenantKeyById = this.tenantKeyByIdSig;

  readonly currentName = computed(() => {
    const currentTenantId = this.tenantStore.currentTenantId();
    const current = (this.membershipsQ.data() ?? []).find(
      (m) => m.tenantId === currentTenantId,
    );
    return current ? (this.nameByIdSig().get(current.tenantId) ?? "…") : "选择租户";
  });

  private readonly switching = signal(false);

  async onSwitch(tenantId: string): Promise<void> {
    if (this.switching()) return;
    this.switching.set(true);
    try {
      const res = await firstValueFrom(
        this.meService.meSwitchTenant(tenantId, { clientId: "" }),
      );
      this.tenantStore.setTenant(tenantId, null, res.accessToken);
      await this.router.navigate(["/tenants", tenantId, "members"]);
    } catch (err) {
      const apiErr = toApiError(err);
      this.snackBar.open(
        apiErr.status === 404
          ? "该租户不存在或你不是其成员"
          : `切换失败：${apiErr.message}`,
        "关闭",
        { duration: 4000 },
      );
    } finally {
      this.switching.set(false);
    }
  }
}
