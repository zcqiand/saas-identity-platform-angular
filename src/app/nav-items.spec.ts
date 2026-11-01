// 侧边栏层级契约：一级 = 功能模块（M 级），二级 = 功能（F 级）。
// 移植 react tests/integration/nav-modules.test.tsx。与 saas-identity-platform-
// shared/docs/functions/function-tree.md 模块总览对齐：M00 租户管理（F01 租户维护 /
// F02 租户成员 / F03 租户角色 / F05 租户应用）、M04 应用管理（F01 应用维护 /
// F04 菜单管理）。fnId = 权限点，保持不变；自造分组（首页/身份管理/应用与菜单）
// 禁止回归。纯函数测试（buildNavItems 已随 T-3 落地，本 spec 为测试面收口）。
import { describe, it, expect } from "vitest";

import { buildNavItems } from "./nav-items";
import { SEED } from "../../tests/helpers/real-chain";

describe("侧边栏层级：一级=功能模块，二级=功能", () => {
  // 种子锚：acme（seeds/tenant.json 首行），替换旧 msw fixture 字面 id
  const items = buildNavItems(SEED.tenants[0].id);
  const groups = [...new Set(items.map((i) => i.group))];

  it("一级分组恰好是两个功能模块：租户管理（M00）、应用管理（M04）", () => {
    expect(groups).toEqual(["租户管理", "应用管理"]);
  });

  it("二级挂 F 级功能名，模块名不重复出现在二级", () => {
    const labels = items.map((i) => i.label);
    expect(labels).toEqual([
      "租户维护",
      "租户应用",
      "租户成员",
      "租户角色",
      "应用维护",
      "菜单管理",
    ]);
    // 旧自造标签不许回流（模块名 ≠ 二级项名）
    expect(labels).not.toContain("租户管理");
    expect(labels).not.toContain("应用管理");
  });

  it("权限点（fnId）与功能的对应关系不变", () => {
    const byFn = new Map(items.map((i) => [i.fnId, i]));
    const m = (id: string) => byFn.get(id);
    expect(m("M00.F01.I01")).toMatchObject({
      label: "租户维护",
      group: "租户管理",
      to: "/tenants",
    });
    expect(m("M00.F02.I01")).toMatchObject({ label: "租户成员", group: "租户管理" });
    expect(m("M00.F03.I01")).toMatchObject({ label: "租户角色", group: "租户管理" });
    expect(m("M00.F05.I01")).toMatchObject({ label: "租户应用", group: "租户管理" });
    expect(m("M04.F01.I01")).toMatchObject({ label: "应用维护", group: "应用管理" });
    expect(m("M04.F04.I01")).toMatchObject({ label: "菜单管理", group: "应用管理" });
    // 本仓路由表：/admin/clients（app.routes.ts）
    expect(m("M04.F01.I01")?.to).toBe("/admin/clients");
    expect(m("M04.F04.I01")?.to).toBe("/admin/clients/lab-management/menus");
    // 租户作用域路由携带 tenantForNav（种子 acme id）
    expect(m("M00.F02.I01")?.to).toContain(SEED.tenants[0].id);
  });

  it("每项都挂权限点 data-fn（不许无 fnId 的导航项）", () => {
    expect(items.every((i) => /^M0\d\.F\d{2}\.I\d{2}$/.test(i.fnId ?? ""))).toBe(true);
  });
});
