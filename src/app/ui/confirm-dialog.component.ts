// ConfirmDialog — 危险操作二次确认（移植 react confirm-dialog.tsx）。
// 删除、批量作废等统一走 openConfirm()，禁止 window.confirm。
// 形态差异：react 受控组件由调用方持 open + onConfirm 里做异步 loading；
// angular 走 MatDialog afterClosed——返回 true 才执行删除，禁双击语义由
// 页面主按钮 loading 承担。
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatDialogContent, MatDialogTitle } from "@angular/material/dialog";

export interface ConfirmDialogData {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

@Component({
  selector: "app-confirm-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatDialogTitle, MatDialogContent, MatButtonModule],
  template: `
    <h2 mat-dialog-title data-testid="confirm-title">{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.description) {
        <p class="cd-desc" data-testid="confirm-description">{{ data.description }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close data-testid="confirm-cancel">
        {{ data.cancelText ?? "取消" }}
      </button>
      <button
        mat-flat-button
        [mat-dialog-close]="true"
        data-testid="confirm-ok"
        [class.cd-danger]="data.destructive"
        [color]="data.destructive ? 'warn' : 'primary'"
      >
        {{ data.confirmText ?? "确认" }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .cd-desc {
        margin: 0;
        color: var(--app-muted, #475569);
        font-size: 0.875rem;
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  readonly data: ConfirmDialogData = inject(MatDialogRef).config
    .data as ConfirmDialogData;
}

/** 便捷入口：afterClosed() 为 true 时才执行破坏性操作。 */
export function openConfirm(
  dialog: MatDialog,
  data: ConfirmDialogData,
): MatDialogRef<ConfirmDialogComponent, boolean> {
  return dialog.open(ConfirmDialogComponent, {
    data,
    width: "420px",
  });
}
