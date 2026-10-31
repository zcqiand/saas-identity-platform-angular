// 后端配置 — 移植自 saas-identity-platform-react/src/api/backend-config.ts（REQ-2026-029）。
// 差异：无 Vite import.meta.env —— IS_PROD_BUILD 用 Angular isDevMode() 判
//（ng serve=dev 端口表 / ng build 默认 configuration=production → prod 域名表），
// env.VITE_API_BASE_URL 通道无构建期注入点，dev 默认值即常量 "http://localhost:5101"。

import { isDevMode } from "@angular/core";

export const BACKENDS = [
  {
    key: "nextjs",
    baseUrl: "http://localhost:5101",
    prodBaseUrl: "https://saas-nextjs.xiangru.uk",
  },
  {
    key: "aspnetcore",
    baseUrl: "http://localhost:5104",
    prodBaseUrl: "https://saas-aspnetcore.xiangru.uk",
  },
  {
    key: "springboot",
    baseUrl: "http://localhost:5105",
    prodBaseUrl: "https://saas-springboot.xiangru.uk",
  },
] as const;

function IS_PROD_BUILD(): boolean {
  return !isDevMode();
}

/** 切换器可见项：prod 构建剔除无 prodBaseUrl 的项（防旧 localStorage 残留让 find 落空）。 */
export const SELECTABLE_BACKENDS = BACKENDS.filter(
  (b) => !IS_PROD_BUILD() || b.prodBaseUrl !== null,
);

/** 按构建形态解析实际 base URL（prod 构建已确保 prodBaseUrl 非空才可见）。 */
function resolveBaseUrl(b: (typeof BACKENDS)[number]): string {
  return (IS_PROD_BUILD() && b.prodBaseUrl) || b.baseUrl;
}

/** 展示用：某后端 key 的实际 base URL（prod 构建 → prod 域名，dev → localhost）。 */
export function resolveSelectedBackendUrl(key: string): string {
  const hit = BACKENDS.find((b) => b.key === key);
  return hit ? resolveBaseUrl(hit) : "";
}

const BACKEND_LS_KEY = "saas.api.backend";

/** 当前选中的后端 key（"" = 未选择，走默认）。SSR 环境返回 ""。 */
export function getSelectedBackend(): string {
  try {
    return globalThis.localStorage?.getItem(BACKEND_LS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setSelectedBackend(key: string): void {
  try {
    if (key) localStorage.setItem(BACKEND_LS_KEY, key);
    else localStorage.removeItem(BACKEND_LS_KEY);
  } catch {
    /* localStorage 不可用（隐私模式）：忽略 */
  }
}

export function getApiBaseUrl(): string {
  // 运行时切换优先；未选择（或选中项在当前构建不可见，如 prod 残留旧 key）时走默认。
  const selected = getSelectedBackend();
  if (selected) {
    const hit = SELECTABLE_BACKENDS.find((b) => b.key === selected);
    if (hit) return resolveBaseUrl(hit);
  }
  return "http://localhost:5101";
}

export function getApiMode(): string {
  return "nextjs";
}
