// StatusBadge — tenant/user/api-key/audit 状态语义色（移植 react status-badge.tsx）。
import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { MatChipsModule } from "@angular/material/chips";

export type AppStatus =
  "active" | "suspended" | "archived" | "invited" | "disabled" | "revoked" | "expired";

const LABEL_ZH: Record<AppStatus, string> = {
  active: "活跃",
  invited: "已邀请",
  suspended: "已暂停",
  disabled: "已禁用",
  archived: "已归档",
  revoked: "已吊销",
  expired: "已过期",
};

@Component({
  selector: "app-status-badge",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule],
  template: ` <span class="badge badge--{{ tone() }}" data-testid="status-badge">{{
    label()
  }}</span>`,
  styles: [
    `
      .badge {
        display: inline-flex;
        border-radius: 6px;
        padding: 2px 8px;
        font-size: 0.75rem;
        font-weight: 400;
      }
      .badge--primary {
        background: #e0f2fe;
        color: #075985;
      }
      .badge--secondary {
        background: #f1f5f9;
        color: #475569;
      }
      .badge--destructive {
        background: #fee2e2;
        color: #b91c1c;
      }
      .badge--outline {
        background: transparent;
        color: #475569;
        border: 1px solid #cbd5e1;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  readonly status = input.required<AppStatus>();
  readonly label = computed(() => LABEL_ZH[this.status()]);
  readonly tone = computed(() => {
    const s = this.status();
    if (s === "active") return "primary";
    if (s === "revoked" || s === "expired") return "destructive";
    if (s === "invited") return "outline";
    return "secondary";
  });
}
