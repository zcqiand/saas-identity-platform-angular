// PageLoading — 统一加载中（移植 react components/app/page-loading.tsx）。
// 列表页 loading 态与路由 fallback 都走这里；禁止各页手写"加载中…"。
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

@Component({
  selector: "app-page-loading",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressSpinnerModule],
  template: ` <div
    class="pl-wrap"
    role="status"
    aria-live="polite"
    data-testid="page-loading"
  >
    <mat-spinner diameter="24" />
    <span>加载中…</span>
  </div>`,
  styles: [
    `
      .pl-wrap {
        min-height: 200px;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        color: var(--app-muted, #94a3b8);
        font-size: 0.875rem;
      }
    `,
  ],
})
export class PageLoadingComponent {}
