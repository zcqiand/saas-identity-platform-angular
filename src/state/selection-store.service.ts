// Selection Store — 页面级「焦点选中」状态（REQ-2026-029）。
// 移植自 saas-identity-platform-react/src/state/selection-context.tsx。
// localStorage 持久化 schema（每次写入同步）：
//   saas.selected.tenant = JSON { id, name }
//   saas.selected.app    = JSON { id, name }
// 默认值（首次访问、未持久化场景）与 react 仓一致。
import { Injectable, computed, signal } from "@angular/core";

const TENANT_STORAGE_KEY = "saas.selected.tenant";
const APP_STORAGE_KEY = "saas.selected.app";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_TENANT_NAME = "ACME Corp";
const DEFAULT_APP_ID = "lab-management";
const DEFAULT_APP_NAME = "建筑工程实验室管理系统";

export interface Selection {
  id: string;
  name: string;
}

function loadJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

@Injectable({ providedIn: "root" })
export class SelectionStoreService {
  // 同步从 localStorage hydrate，避免首屏渲染用默认值，刷新后默认选中被覆盖
  private readonly _selectedTenant = signal<Selection>(
    loadJSON<Selection>(safeGet(TENANT_STORAGE_KEY), {
      id: DEFAULT_TENANT_ID,
      name: DEFAULT_TENANT_NAME,
    }),
  );
  private readonly _selectedApp = signal<Selection>(
    loadJSON<Selection>(safeGet(APP_STORAGE_KEY), {
      id: DEFAULT_APP_ID,
      name: DEFAULT_APP_NAME,
    }),
  );

  readonly selectedTenant = computed(() => this._selectedTenant());
  readonly selectedApp = computed(() => this._selectedApp());

  setSelectedTenant(s: Selection): void {
    this._selectedTenant.set(s);
    try {
      localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* localStorage 不可用：忽略 */
    }
  }

  setSelectedApp(s: Selection): void {
    this._selectedApp.set(s);
    try {
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* localStorage 不可用：忽略 */
    }
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
