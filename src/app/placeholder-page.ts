// W0 占位页：W1 逐页替换为真实现（REQ-2026-029 T-2）。不挂任何功能 ID。
import { ChangeDetectionStrategy, Component } from "@angular/core";

@Component({
  selector: "app-placeholder-page",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <p class="placeholder">功能移植中（REQ-2026-029 T-2）</p> `,
  styles: [
    `
      .placeholder {
        color: var(--color-fg);
        opacity: 0.6;
        padding: 2rem 0;
      }
    `,
  ],
})
export class PlaceholderPage {}
