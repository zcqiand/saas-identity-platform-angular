// Toast — sonner → MatSnackBar 等价物（REQ-2026-029 T-2）。
// react 页面里 toast.success/toast.error 的唯一落点；禁止各页自开 MatSnackBar。
import { Injectable, inject } from "@angular/core";
import { MatSnackBar, MatSnackBarConfig } from "@angular/material/snack-bar";

const BASE: MatSnackBarConfig = { duration: 4000 };

@Injectable({ providedIn: "root" })
export class ToastService {
  private readonly sb = inject(MatSnackBar);

  success(message: string): void {
    this.sb.open(message, "关闭", { ...BASE, panelClass: "toast-success" });
  }

  error(message: string): void {
    this.sb.open(message, "关闭", { ...BASE, panelClass: "toast-error" });
  }
}
