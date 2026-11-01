// MenuTreePage — M08 应用下树形菜单 CRUD。
// 移植自 saas-identity-platform-react/src/pages/MenuTreePage.tsx
// （REQ-2026-029 T-2）。应用切换器 + 默认 lab-management + localStorage 还原
// （SelectionStoreService，key saas.selected.app 存 {id,name}，id=code 形
// clientId）。真树表格（可展开/收起）：后端返回扁平 SysMenu[]，前端按 parentId
// 自构树。app 寻址统一 code 形（clientId）——真后端按 client_id 列查，行 UUID
// 会 404；queryKey 与 invalidate 必须同源（clientId），否则失效不命中。
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatTableModule } from "@angular/material/table";
import { firstValueFrom } from "rxjs";
import { QueryClient, injectQuery } from "@tanstack/angular-query";

import { AdminClientsService } from "../../api/endpoints/admin-clients/admin-clients.service";
import { ClientMenusService } from "../../api/endpoints/client-menus/client-menus.service";
import type {
  ClientMenusMoveSysMenuBody,
  CreateSysMenuRequest,
  OAuthClient,
  SysMenu,
} from "../../api/endpoints/model";
import { toApiError } from "../../api/api-error";
import { SelectionStoreService } from "../../state/selection-store.service";
import { EmptyStateComponent } from "../ui/empty-state.component";
import { PageHeaderComponent } from "../ui/page-header.component";
import { PageLoadingComponent } from "../ui/page-loading.component";
import { ToastService } from "../ui/toast.service";
import { openConfirm } from "../ui/confirm-dialog.component";
import { type FieldDef, openCrud } from "../ui/crud-dialog.component";

const MENUS_KEY = "clientMenusListSysMenus";

const TYPE_OPTIONS = [
  { value: "directory", label: "目录（容器）" },
  { value: "menu", label: "菜单（叶子）" },
  { value: "button", label: "按钮（操作）" },
];

const STATUS_OPTIONS = [
  { value: "1", label: "启用" },
  { value: "0", label: "停用" },
];

const FIELDS: FieldDef[] = [
  { name: "title", label: "标题", required: true, placeholder: "接样管理" },
  { name: "path", label: "路径", placeholder: "receipts" },
  {
    name: "type",
    label: "类型",
    type: "select",
    required: true,
    defaultValue: "menu",
    options: TYPE_OPTIONS,
  },
  {
    name: "parentId",
    label: "父菜单",
    type: "select",
    options: [],
    placeholder: "（无，顶级）",
  },
  { name: "sortOrder", label: "排序", type: "number", defaultValue: 0 },
  {
    name: "status",
    label: "状态",
    type: "select",
    required: true,
    defaultValue: "1",
    options: STATUS_OPTIONS,
  },
];

const EDIT_FIELDS: FieldDef[] = FIELDS.filter((f) => f.name !== "title");

interface MenuNode {
  menu: SysMenu;
  children: MenuNode[];
  hasChildren: boolean;
}

interface MenuRow extends SysMenu {
  depth: number;
  hasChildren: boolean;
}

function buildTree(menus: SysMenu[]): MenuNode[] {
  const byId = new Map<string, MenuNode>();
  for (const m of menus) byId.set(m.id, { menu: m, children: [], hasChildren: false });
  const roots: MenuNode[] = [];
  for (const m of menus) {
    const node = byId.get(m.id)!;
    if (m.parentId && byId.has(m.parentId)) {
      byId.get(m.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const n of byId.values()) n.hasChildren = n.children.length > 0;
  const sortByOrder = (a: MenuNode, b: MenuNode) =>
    a.menu.sortOrder - b.menu.sortOrder || a.menu.title.localeCompare(b.menu.title);
  const recurse = (ns: MenuNode[]): void => {
    ns.sort(sortByOrder);
    for (const n of ns) recurse(n.children);
  };
  recurse(roots);
  return roots;
}

function flattenTree(
  nodes: MenuNode[],
  expanded: Set<string>,
  depth: number,
  out: MenuRow[],
): void {
  for (const n of nodes) {
    out.push({ ...n.menu, depth, hasChildren: n.hasChildren });
    if (n.hasChildren && expanded.has(n.menu.id)) {
      flattenTree(n.children, expanded, depth + 1, out);
    }
  }
}

@Component({
  selector: "app-menu-tree-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatTableModule,
    PageHeaderComponent,
    PageLoadingComponent,
    EmptyStateComponent,
  ],
  templateUrl: "./menu-tree-page.html",
  styles: [
    `
      .mt-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .mt-card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        padding: 1rem 1.25rem;
      }
      .mt-card-title {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 0.75rem;
      }
      .mt-selector {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0.375rem 0.5rem;
        font-size: 0.875rem;
        min-width: 16rem;
      }
      .mt-table-wrap {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
      }
      .mt-name {
        font-family: monospace;
        font-size: 0.75rem;
      }
      .mt-indent {
        display: inline-flex;
        align-items: center;
      }
      .mt-toggle {
        margin-right: 0.25rem;
        border: none;
        background: none;
        cursor: pointer;
        color: #94a3b8;
        padding: 0;
        width: 1rem;
        height: 1rem;
        line-height: 1rem;
      }
      .mt-spacer {
        display: inline-block;
        width: 1rem;
      }
      .mt-chip {
        display: inline-flex;
        border-radius: 6px;
        background: #f1f5f9;
        padding: 2px 8px;
        font-size: 0.75rem;
        color: #334155;
      }
      .mt-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.25rem;
      }
      .mt-del {
        color: #dc2626;
      }
    `,
  ],
})
export class MenuTreePageComponent {
  private readonly api = inject(AdminClientsService);
  private readonly menusApi = inject(ClientMenusService);
  private readonly dialog = inject(MatDialog);
  private readonly qc = inject(QueryClient);
  private readonly toast = inject(ToastService);
  private readonly selection = inject(SelectionStoreService);

  readonly displayedColumns = ["title", "type", "status", "actions"];
  readonly typeOptions = TYPE_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;

  /** 用「collapsed」而不是「expanded」：初始空，首屏全部父级默认展开。 */
  private readonly collapsedIds = signal<Set<string>>(new Set());

  // 应用列表（平台 admin 视角）
  readonly appsQ = injectQuery(() => ({
    queryKey: ["adminClientsListClients"],
    queryFn: async () => {
      const res = await firstValueFrom(this.api.adminClientsListClients());
      return res.items;
    },
  }));

  readonly allApps = computed<OAuthClient[]>(() => this.appsQ.data() ?? []);

  // selection-context 按 code 持久化（DEFAULT_APP_ID="lab-management"），同时匹配
  // id/code 两路：真实场景 localStorage 存 code，UUID 路径留给迁移历史。
  readonly currentApp = computed<OAuthClient | undefined>(() => {
    const sel = this.selection.selectedApp();
    const apps = this.allApps();
    return apps.find((a) => a.clientId === sel.id || a.id === sel.id) ?? apps[0];
  });

  readonly menusQ = injectQuery(() => ({
    queryKey: [MENUS_KEY, this.currentApp()?.clientId],
    queryFn: async () => {
      const app = this.currentApp();
      return await firstValueFrom(this.menusApi.clientMenusListSysMenus(app!.clientId));
    },
    enabled: !!this.currentApp(),
  }));

  readonly allMenus = computed<SysMenu[]>(() => this.menusQ.data() ?? []);

  /** 父菜单下拉用：无视展开状态的扁平视图（深度缩进）。 */
  readonly flatForSelect = computed<Array<{ menu: SysMenu; depth: number }>>(() => {
    const out: Array<{ menu: SysMenu; depth: number }> = [];
    const walk = (nodes: MenuNode[], depth: number): void => {
      for (const n of nodes) {
        out.push({ menu: n.menu, depth });
        walk(n.children, depth + 1);
      }
    };
    walk(buildTree(this.allMenus()), 0);
    return out;
  });

  readonly rows = computed<MenuRow[]>(() => {
    const allMenus = this.allMenus();
    const tree = buildTree(allMenus);
    const parentIds = new Set<string>();
    for (const m of allMenus) if (m.parentId) parentIds.add(m.parentId);
    const collapsed = this.collapsedIds();
    const expanded = new Set<string>();
    for (const id of parentIds) if (!collapsed.has(id)) expanded.add(id);
    const out: MenuRow[] = [];
    flattenTree(tree, expanded, 0, out);
    return out;
  });

  isExpanded(id: string): boolean {
    return !this.collapsedIds().has(id);
  }

  toggleExpand(id: string): void {
    const next = new Set(this.collapsedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.collapsedIds.set(next);
  }

  typeLabel(t: string): string {
    return t === "directory" ? "目录" : t === "button" ? "按钮" : "菜单";
  }

  statusLabel(s: number): string {
    return s === 0 ? "停用" : "启用";
  }

  onAppChange(event: Event): void {
    const clientId = (event.target as HTMLSelectElement).value;
    const a = this.allApps().find((x) => x.clientId === clientId);
    if (a) this.selection.setSelectedApp({ id: a.clientId, name: a.clientName });
  }

  private async invalidate(): Promise<void> {
    await this.qc.invalidateQueries({
      queryKey: [MENUS_KEY, this.currentApp()?.clientId],
    });
  }

  private parentOptions(excludeId?: string): Array<{ value: string; label: string }> {
    return [
      { value: "", label: "（无，顶级）" },
      ...this.rows()
        .filter((m) => m.id !== excludeId)
        .map((m) => ({
          value: m.id,
          label: `${"  ".repeat(m.depth)}${m.title} · ${m.path ?? ""}`,
        })),
    ];
  }

  openCreate(): void {
    openCrud(this.dialog, {
      title: "新建菜单",
      fields: [
        ...FIELDS,
        {
          name: "parentId",
          label: "父菜单",
          type: "select",
          options: this.parentOptions(),
          defaultValue: "",
        },
      ],
      submitText: "创建",
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        const app = this.currentApp();
        if (!app) return;
        const parentId =
          values["parentId"] && values["parentId"] !== ""
            ? String(values["parentId"])
            : undefined;
        try {
          await firstValueFrom(
            this.menusApi.clientMenusCreateSysMenu(app.clientId, {
              title: String(values["title"] ?? "").trim(),
              path: (values["path"] as string) || undefined,
              type: values["type"] as SysMenu["type"],
              parentId,
              sortOrder: Number(values["sortOrder"] ?? 0),
            } as CreateSysMenuRequest),
          );
          await this.invalidate();
          this.toast.success("菜单已创建");
        } catch (err) {
          this.toast.error(`创建失败：${toApiError(err).message}`);
        }
      });
  }

  openEdit(m: SysMenu): void {
    openCrud(this.dialog, {
      title: "编辑菜单",
      fields: EDIT_FIELDS.map((f) =>
        f.name === "parentId"
          ? {
              ...f,
              options: [
                { value: "", label: "（无，顶级）" },
                ...this.flatForSelect()
                  .filter((x) => x.menu.id !== m.id)
                  .map((x) => ({
                    value: x.menu.id,
                    label: `${"  ".repeat(x.depth)}${x.menu.path ?? ""} · ${x.menu.title}`,
                  })),
              ],
            }
          : f,
      ),
      initialValues: {
        title: m.title,
        path: m.path ?? "",
        type: m.type,
        parentId: m.parentId ?? "",
        sortOrder: m.sortOrder,
        status: String(m.status ?? 1),
      },
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        const app = this.currentApp();
        if (!app) return;
        try {
          await firstValueFrom(
            this.menusApi.clientMenusUpdateSysMenu(app.clientId, m.id, {
              title: String(values["title"] ?? m.title),
              path: (values["path"] as string) || undefined,
              type: values["type"] as SysMenu["type"],
              sortOrder: Number(values["sortOrder"] ?? 0),
              status: Number(values["status"] ?? 1),
            }),
          );
          await this.invalidate();
          this.toast.success("菜单已更新");
        } catch (err) {
          this.toast.error(`更新失败：${toApiError(err).message}`);
        }
      });
  }

  openMove(m: SysMenu): void {
    openCrud(this.dialog, {
      title: `移动菜单：${m.title}`,
      description: "选择新的父级菜单。无父级 = 顶级。",
      fields: [
        {
          name: "parentId",
          label: "父菜单",
          type: "select",
          options: this.parentOptions(m.id),
        },
      ],
      submitText: "移动",
      initialValues: { parentId: m.parentId ?? "" },
    })
      .afterClosed()
      .subscribe(async (values) => {
        if (!values) return;
        const app = this.currentApp();
        if (!app) return;
        const parentId =
          values["parentId"] && values["parentId"] !== ""
            ? String(values["parentId"])
            : undefined;
        try {
          await firstValueFrom(
            this.menusApi.clientMenusMoveSysMenu(app.clientId, m.id, {
              parentId,
            } as ClientMenusMoveSysMenuBody),
          );
          await this.invalidate();
          this.toast.success("父级已切换");
        } catch (err) {
          this.toast.error(`移动失败：${toApiError(err).message}`);
        }
      });
  }

  openDelete(m: SysMenu): void {
    openConfirm(this.dialog, {
      title: `删除菜单「${m.title}」？`,
      description: "删除菜单会同时移除其下所有子菜单。不可撤销。",
      confirmText: "删除",
      destructive: true,
    })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        const app = this.currentApp();
        if (!app) return;
        try {
          await firstValueFrom(
            this.menusApi.clientMenusDeleteSysMenu(app.clientId, m.id),
          );
          await this.invalidate();
          this.toast.success("菜单已删除");
        } catch (err) {
          this.toast.error(`删除失败：${toApiError(err).message}`);
        }
      });
  }
}
