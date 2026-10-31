// M00.F04 — 角色 ↔ 菜单授权页五项收口。移植 react tests/integration/role-menu-grant.test.tsx。
// 隔离纪律同 react T10-R1②：beforeEach 真 API 造 TEST- 前缀临时角色，并把 acme
// admin 的种子授权集灌进临时角色（只写 TEST- 行），驱动授权页；afterEach 按前缀
// DELETE 清扫本租户全部 TEST- 角色（role 删除级联清 sys_role_menu）。种子行零触碰。
// angular builder 双跑指纹（见 user-list-page.spec.ts 头注）：TEST- 行承载 +
// 每遍 globalSetup TRUNCATE 重灌自愈，双跑互不污染。
// it() 标题不带功能 ID 字面（fnReporter 泄漏禁令）；锚由页面 data-fn 属性承载。
// 与 react 断言的偏差：保存按钮文案用 textContent?.trim() 比对——prettier 会把
// 按钮内插值拆成多行（模板空白进 textContent），react JSX 单行无此问题。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RoleMenuGrantPageComponent } from "./role-menu-grant-page";
import {
  TestHostComponent,
  realChainProviders,
  settle,
} from "../../../tests/helpers/ng-test";
import {
  installRealChain,
  SEED,
  testToken,
  acmeAdminGrantCount,
  acmeRoleIdByCode,
  menusByAppCode,
} from "../../../tests/helpers/real-chain";

const TENANT_ID = SEED.tenants[0].id;
const APP_CODE = "lab-management";
const ROLES_PATH = `/api/v1/tenants/${TENANT_ID}/roles`;
const ROLE_CODE_PREFIX = "TEST-";
const API = "http://localhost:5101";

let fixture: ComponentFixture<TestHostComponent>;
/** beforeEach 造的临时角色 id，本文件用例串行消费。 */
let testRoleId = "";

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken()}`,
      ...init?.headers,
    },
  });
}

function seedGrant(): string[] {
  const adminRoleId = acmeRoleIdByCode("admin");
  const grant = SEED.roleMenus.find((g) => g.roleId === adminRoleId);
  if (!grant) throw new Error("seeds 缺 acme admin 的 sys_role_menu 行——种子契约漂移");
  return [...grant.menuIds];
}

/** 真 API 造 TEST- 前缀临时角色（roleCode 带随机尾，避开唯一键与残留行）。 */
async function createTestRole(): Promise<string> {
  const res = await api(ROLES_PATH, {
    method: "POST",
    body: JSON.stringify({
      clientId: APP_CODE,
      roleCode: `${ROLE_CODE_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
      roleName: "授权页临时角色",
    }),
  });
  expect(res.ok, `create TEST- role via ${ROLES_PATH}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  return body.id;
}

/** 按前缀清扫本租户全部 TEST- 角色（幂等；连上次失败遗留的一并清）。 */
async function purgeTestRoles(): Promise<void> {
  try {
    const res = await api(`${ROLES_PATH}?page=0&pageSize=100`);
    if (!res.ok) return;
    const body = (await res.json()) as { items: Array<{ id: string; roleCode: string }> };
    for (const role of body.items) {
      if (role.roleCode.startsWith(ROLE_CODE_PREFIX)) {
        await api(`${ROLES_PATH}/${role.id}`, { method: "DELETE" });
      }
    }
  } catch {
    /* 清扫失败不遮蔽断言：TEST- 行只污染 scratch 库，下轮重灌自愈 */
  }
}

async function putGrant(roleId: string, menuIds: string[]): Promise<void> {
  const res = await api(`/api/v1/tenants/${TENANT_ID}/roles/${roleId}/menus?clientId=`, {
    method: "PUT",
    body: JSON.stringify({ menuIds }),
  });
  expect(res.ok, `grant seed set to TEST- role ${roleId}`).toBeTruthy();
}

async function renderGrant(): Promise<void> {
  expect(testRoleId, "fail-fast: TEST- 角色 id 缺失——beforeEach 造角失败？").toBeTruthy();
  const url = `/tenants/${TENANT_ID}/roles/${testRoleId}/menus`;
  window.history.replaceState({}, "", url);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders([
      {
        path: "tenants/:tenantId/roles/:roleId/menus",
        component: RoleMenuGrantPageComponent,
      },
    ]),
  });
  fixture = TestBed.createComponent(TestHostComponent);
  await TestBed.inject(Router).navigateByUrl(url);
  await settle(fixture);
}

function fnButton(dataFn: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("data-fn") === dataFn,
  );
}

async function waitGrantRows(): Promise<HTMLElement[]> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(document.querySelectorAll('[data-testid="menu-grant-row"]').length).toBe(
        SEED.menus.length,
      );
    },
    { timeout: 30_000 },
  );
  return [...document.querySelectorAll<HTMLElement>('[data-testid="menu-grant-row"]')];
}

beforeEach(async () => {
  localStorage.clear();
  installRealChain();
  testRoleId = await createTestRole();
  // 把 acme admin 的种子授权集灌进临时角色（只写 TEST- 行）：初始勾选数断言
  // 继续锚种子契约值（acmeAdminGrantCount），而状态承载不借种子角色
  await putGrant(testRoleId, seedGrant());
}, 60_000);

afterEach(async () => {
  await purgeTestRoles();
});

describe("角色菜单授权页", () => {
  it("渲染多 app 分组菜单行，保存按钮挂授权保存锚", async () => {
    await renderGrant();
    await waitGrantRows();
    const save = fnButton("M00.F04.I03");
    expect(save).toBeTruthy();
    expect(save!.getAttribute("data-fn")).toBe("M00.F04.I03");
  }, 40_000);

  it("清空按钮挂授权清空锚", async () => {
    await renderGrant();
    await waitGrantRows();
    expect(fnButton("M00.F04.I04")).toBeTruthy();
  }, 40_000);

  it("保存按钮初始显示预灌授权数（锚种子授权集规模）", async () => {
    await renderGrant();
    await waitGrantRows();
    const save = fnButton("M00.F04.I03")!;
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(save.textContent?.trim()).toBe(`保存 (${acmeAdminGrantCount()})`);
      },
      { timeout: 10_000 },
    );
  }, 40_000);

  it("清空按钮把保存按钮数字归零", async () => {
    await renderGrant();
    await waitGrantRows();
    const clear = fnButton("M00.F04.I04")!;
    clear.click();
    const save = fnButton("M00.F04.I03")!;
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(save.textContent?.trim()).toBe("保存 (0)");
      },
      { timeout: 10_000 },
    );
  }, 40_000);

  it("勾选未授权菜单后保存：真 PUT 落库（读回验证，TEST- 行承载）", async () => {
    await renderGrant();
    const grant = seedGrant();
    // 目标：erp 下一个不在预灌授权集里的菜单
    const target = menusByAppCode("erp").find((m) => !grant.includes(m.id));
    expect(target).toBeTruthy();
    await waitGrantRows();
    const save = fnButton("M00.F04.I03")!;
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(save.textContent?.trim()).toBe(`保存 (${grant.length})`);
      },
      { timeout: 10_000 },
    );
    // 行内按 title 定位不行——种子三个 app 各有一个同名「仪表盘」。
    // 先把 DOM 走到目标 app 的 Card 内再找行，Card 内 title 唯一。
    const erpTitle = [...document.querySelectorAll("*")].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === "(erp)",
    );
    expect(erpTitle, "(erp) 分组标题").toBeTruthy();
    let card: Element | null = erpTitle!;
    while (card && !card.querySelector('[data-testid="menu-grant-row"]')) {
      card = card.parentElement;
    }
    expect(card).toBeTruthy();
    const row = [
      ...card!.querySelectorAll<HTMLElement>('[data-testid="menu-grant-row"]'),
    ].find((r) => r.textContent?.includes(target!.title));
    expect(row, `erp 卡内 ${target!.title} 行`).toBeTruthy();
    const checkbox = row!.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    checkbox!.click();
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(save.textContent?.trim()).toBe(`保存 (${grant.length + 1})`);
      },
      { timeout: 10_000 },
    );
    save.click();
    // 真 PUT 后读回：授权集含目标菜单（PUT 路由冷编译实测可达 20s+，轮询窗口给足）
    const grantPath = `/api/v1/tenants/${TENANT_ID}/roles/${testRoleId}/menus?clientId=`;
    await waitFor(
      async () => {
        const res = await api(grantPath);
        expect(res.ok).toBeTruthy();
        const body = (await res.json()) as { menuIds: string[] };
        expect(body.menuIds).toContain(target!.id);
        expect(body.menuIds.length).toBe(grant.length + 1);
      },
      { timeout: 45_000 },
    );
  }, 60_000);
});
