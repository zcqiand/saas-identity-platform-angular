// CrudDialog — 通用 CRUD 弹窗（移植 react crud-dialog.tsx，创建/编辑共用）。
// 字段配置驱动（FieldDef[]），统一提交/取消。经 openCrud() 打开，提交返回
// Record<string, FieldValue>，取消/关闭返回 undefined。
// renderField 自定义通道：react 靠 render prop；angular 用 fieldRenderer 输入
// （page 持有的 DirectiveRef），本批 8 页全部用默认渲染，未走自定义。
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";

export type FieldValue = string | number | boolean | string[] | undefined | null;

export interface FieldDef {
  /** 字段名，作为 form state 的 key */
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  type?: "text" | "number" | "textarea" | "select" | "checkbox";
  options?: Array<{ value: string; label: string }>;
  defaultValue?: FieldValue;
}

export interface CrudDialogData {
  title: string;
  description?: string;
  fields: FieldDef[];
  /** 初始值（编辑模式）；缺省的键用 fields 的 defaultValue */
  initialValues?: Record<string, FieldValue>;
  submitText?: string;
  cancelText?: string;
}

@Component({
  selector: "app-crud-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.description) {
        <p class="cr-desc">{{ data.description }}</p>
      }
      <div class="cr-fields">
        @for (f of data.fields; track f.name) {
          <div class="cr-field">
            @if (f.type === "checkbox") {
              <mat-checkbox
                [ngModel]="value(f)"
                (ngModelChange)="setField(f.name, $event)"
                data-testid="crud-field-{{ f.name }}"
              >
                {{ f.label }}
                @if (f.hint) {
                  <span class="cr-hint">&nbsp;{{ f.hint }}</span>
                }
              </mat-checkbox>
            } @else {
              <mat-form-field appearance="outline" class="cr-form-field">
                <mat-label
                  >{{ f.label }}
                  @if (f.required) {
                    <span class="cr-req">*</span>
                  }
                </mat-label>
                @switch (f.type) {
                  @case ("textarea") {
                    <textarea
                      matInput
                      [ngModel]="value(f)"
                      (ngModelChange)="setField(f.name, $event)"
                      [placeholder]="f.placeholder ?? ''"
                      rows="3"
                      data-testid="crud-field-{{ f.name }}"
                    ></textarea>
                  }
                  @case ("select") {
                    <mat-select
                      [ngModel]="value(f)"
                      (ngModelChange)="setField(f.name, $event)"
                      data-testid="crud-field-{{ f.name }}"
                    >
                      @for (o of f.options ?? []; track o.value) {
                        <mat-option [value]="o.value">{{ o.label }}</mat-option>
                      }
                    </mat-select>
                  }
                  @default {
                    <input
                      matInput
                      [type]="f.type === 'number' ? 'number' : 'text'"
                      [ngModel]="value(f)"
                      (ngModelChange)="setField(f.name, $event)"
                      [placeholder]="f.placeholder ?? ''"
                      data-testid="crud-field-{{ f.name }}"
                    />
                  }
                }
                @if (f.hint && f.type !== "checkbox") {
                  <mat-hint>{{ f.hint }}</mat-hint>
                }
              </mat-form-field>
            }
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close data-testid="crud-cancel">
        {{ data.cancelText ?? "取消" }}
      </button>
      <button
        mat-flat-button
        color="primary"
        (click)="submit()"
        data-fn="crud.submit"
        data-testid="crud-submit"
      >
        {{ data.submitText ?? "保存" }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .cr-desc {
        margin: 0 0 0.75rem;
        color: var(--app-muted, #475569);
        font-size: 0.875rem;
      }
      .cr-fields {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 380px;
      }
      .cr-form-field {
        width: 100%;
      }
      .cr-req {
        color: #dc2626;
      }
      .cr-hint {
        font-weight: 400;
        color: var(--app-muted, #64748b);
      }
    `,
  ],
})
export class CrudDialogComponent {
  readonly data: CrudDialogData = inject(MatDialogRef).config.data as CrudDialogData;
  private readonly ref =
    inject<MatDialogRef<CrudDialogComponent, Record<string, FieldValue>>>(MatDialogRef);

  private readonly _values = signal<Record<string, FieldValue>>(this.init());
  readonly values = this._values.asReadonly();

  private init(): Record<string, FieldValue> {
    const out: Record<string, FieldValue> = {};
    for (const f of this.data.fields) {
      out[f.name] = this.data.initialValues?.[f.name] ?? f.defaultValue ?? "";
    }
    return out;
  }

  value(f: FieldDef): FieldValue {
    return this._values()[f.name];
  }

  setField(name: string, v: FieldValue): void {
    this._values.update((prev) => ({ ...prev, [name]: v }));
  }

  submit(): void {
    this.ref.close(this._values());
  }
}

export function openCrud(
  dialog: MatDialog,
  data: CrudDialogData,
): MatDialogRef<CrudDialogComponent, Record<string, FieldValue>> {
  return dialog.open(CrudDialogComponent, { data, width: "520px" });
}
