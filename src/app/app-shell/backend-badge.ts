// 后端切换器 — 移植自 saas-identity-platform-react/src/components/app/backend-badge.tsx
// （REQ-2026-029；2026-09-11 用户裁定恢复运行时切换）。选择持久化 localStorage
// （saas.api.backend），拦截器每次请求动态读取，切完下一个请求即生效。
// variant="sidebar"（默认）：深色侧边栏 footer 用白字样式；variant="plain"：浅色背景。
import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import {
  SELECTABLE_BACKENDS,
  getSelectedBackend,
  resolveSelectedBackendUrl,
  setSelectedBackend,
} from "../../api/backend-config";

@Component({
  selector: "app-backend-badge",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatMenuModule, MatIconModule],
  template: `
    <div
      class="wrap"
      [class.sidebar]="variant() === 'sidebar'"
      data-testid="backend-badge"
    >
      <button mat-stroked-button [matMenuTriggerFor]="menu" class="trigger">
        <mat-icon class="icon">dns</mat-icon>
        <span class="label">{{ current()?.key ?? "(env 默认)" }}</span>
        <mat-icon class="icon small">unfold_more</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        <div class="menu-label">切换后端</div>
        <button mat-menu-item (click)="pick('')">(env 默认)</button>
        @for (b of backends; track b.key) {
          <button mat-menu-item (click)="pick(b.key)">
            <span class="col">
              <span class="name">{{ b.key }}</span>
              <span class="key">{{ resolveSelectedBackendUrl(b.key) }}</span>
            </span>
          </button>
        }
      </mat-menu>
    </div>
  `,
  styles: [
    `
      .wrap {
        width: 100%;
        font-size: 0.75rem;
      }
      .trigger {
        width: 100%;
        justify-content: flex-start;
        gap: 0.5rem;
      }
      .wrap.sidebar .trigger {
        color: rgba(255, 255, 255, 0.8);
      }
      .label {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .icon.small {
        transform: scale(0.75);
        opacity: 0.55;
      }
      .menu-label {
        padding: 0.5rem 1rem;
        font-size: 0.75rem;
        opacity: 0.6;
      }
      .col {
        display: flex;
        flex-direction: column;
      }
      .key {
        font-size: 0.7rem;
        font-family: monospace;
        opacity: 0.55;
      }
    `,
  ],
})
export class BackendBadge {
  readonly variant = input<"sidebar" | "plain">("sidebar");
  readonly backends = SELECTABLE_BACKENDS;
  readonly current = () =>
    SELECTABLE_BACKENDS.find((b) => b.key === getSelectedBackend());
  protected readonly resolveSelectedBackendUrl = resolveSelectedBackendUrl;

  pick(key: string): void {
    setSelectedBackend(key);
  }
}
