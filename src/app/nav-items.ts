// 侧边栏导航数据源 — 移植自 saas-identity-platform-react/src/components/app/nav-items.tsx
// （REQ-2026-029）。唯一锚点是 saas-identity-platform-shared/docs/functions/function-tree.md
// 的模块总览；fnId = 权限点（一个子项 = 一个权限点），页面挂 data-fn 用，改动须同 commit 评审。
// M01 用户管理：whoami 已接线顶栏徽标（app-shell），无独立控制台路由，不进 nav；
// M00.F04 角色权限挂角色下钻路由（/roles/:rid/menus），非 nav 直达页。
// 差异：react 用 lucide 图标节点，angular 侧不渲染图标（纯文字导航）。

export interface NavItem {
  to: string;
  label: string;
  group: string;
  /** data-fn M-ID for L5 alignment */
  fnId?: string;
}

export function buildNavItems(tenantForNav: string): NavItem[] {
  return [
    // M00 租户管理（模块）
    {
      to: "/tenants",
      label: "租户维护",
      group: "租户管理",
      fnId: "M00.F01.I01",
    },
    // M00.F05 租户应用（用户裁定 2026-09-11：顺序紧随租户维护）
    {
      to: `/tenants/${tenantForNav}/applications`,
      label: "租户应用",
      group: "租户管理",
      fnId: "M00.F05.I01",
    },
    {
      to: `/tenants/${tenantForNav}/members`,
      label: "租户成员",
      group: "租户管理",
      fnId: "M00.F02.I01",
    },
    {
      to: `/tenants/${tenantForNav}/roles`,
      label: "租户角色",
      group: "租户管理",
      fnId: "M00.F03.I01",
    },
    // M04 应用管理（模块）
    {
      to: "/admin/clients",
      label: "应用维护",
      group: "应用管理",
      fnId: "M04.F01.I01",
    },
    {
      to: "/admin/clients/lab-management/menus",
      label: "菜单管理",
      group: "应用管理",
      fnId: "M04.F04.I01",
    },
  ];
}
