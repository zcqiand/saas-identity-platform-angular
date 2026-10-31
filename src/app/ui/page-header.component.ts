// PageHeader — 页面级标题栏（移植 react components/app/page-header.tsx）。
// 每个功能页顶部统一走这里。title/description 左，actions 右（内容投影）。
// 富文本描述（如 TenantListPage 的「已选中」段）以 descriptionText 拼平——
// 语义等价、DOM 形状以 angular Material 体系为准（REQ-2026-029 约定）。
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

@Component({
  selector: "app-page-header",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div class="ph-row">
    <div>
      <h1 class="ph-title">{{ title() }}</h1>
      @if (descriptionText()) {
        <p class="ph-desc">{{ descriptionText() }}</p>
      }
    </div>
    <div class="ph-actions"><ng-content select="[phActions]" /></div>
  </div>`,
  styles: [
    `
      .ph-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }
      .ph-title {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
      }
      .ph-desc {
        margin: 0.25rem 0 0;
        color: var(--app-muted, #64748b);
        font-size: 0.875rem;
      }
      .ph-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly descriptionText = input<string>("");
}
