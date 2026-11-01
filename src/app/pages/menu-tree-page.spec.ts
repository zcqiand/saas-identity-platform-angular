// M08.F01 — 菜单树九项收口。移植 react tests/integration/menu-tree.test.tsx。
// 断言锚 saas-shared seeds/sys_menu.json（lab-management 27 项 / erp 7 项 /
// crm 7 项，按 parentId 构树）。应用切换走 SelectionStoreService（localStorage
// key saas.selected.app 存 {id,name}，id=code 形 clientId）。全部用例只读。
// builder 双跑指纹见 user-list-page.spec.ts 头注。it() 标题不带功能 ID 字面。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach } from "vitest";

import { MenuTreePageComponent } from "./menu-tree-page";
import {
  TestHostComponent,
  realChainProviders,
  settle,
} from "../../../tests/helpers/ng-test";
import {
  installRealChain,
  SEED,
  menusByAppCode,
} from "../../../tests/helpers/real-chain";

let fixture: ComponentFixture<TestHostComponent>;

function selectApp(clientId: string): void {
  const app = SEED.apps.find((a) => a.clientId === clientId);
  if (!app) throw new Error(`seeds 缺应用 ${clientId}`);
  localStorage.setItem(
    "saas.selected.app",
    JSON.stringify({ id: app.clientId, name: app.clientName }),
  );
}

async function renderTree(): Promise<void> {
  const url = "/admin/clients/lab-management/menus";
  window.history.replaceState({}, "", url);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders([
      { path: "admin/clients/:clientId/menus", component: MenuTreePageComponent },
    ]),
  });
  fixture = TestBed.createComponent(TestHostComponent);
  await TestBed.inject(Router).navigateByUrl(url);
  await settle(fixture);
}

function fnButtons(dataFn: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.getAttribute("data-fn") === dataFn,
  );
}

async function waitMenuRows(count: number): Promise<HTMLElement[]> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(
        document.querySelectorAll('[data-testid="menu-row"]').length,
      ).toBeGreaterThanOrEqual(count);
    },
    { timeout: 30_000 },
  );
  return [...document.querySelectorAll<HTMLElement>('[data-testid="menu-row"]')];
}

/** 精确行数轮询（菜单树渲染行数随展开态变化，>= 不够用）。 */
async function waitMenuRowsExact(count: number): Promise<HTMLElement[]> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(document.querySelectorAll('[data-testid="menu-row"]').length).toBe(count);
    },
    { timeout: 30_000 },
  );
  return [...document.querySelectorAll<HTMLElement>('[data-testid="menu-row"]')];
}

function leafTextHits(re: RegExp): number {
  return [...document.querySelectorAll("*")].filter(
    (el) => el.children.length === 0 && el.textContent && re.test(el.textContent),
  ).length;
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
});

describe("菜单树", () => {
  it("默认选中 lab-management，渲染种子全部菜单行 + 新建按钮挂创建锚", async () => {
    await renderTree();
    await waitMenuRowsExact(menusByAppCode("lab-management").length);
    expect(leafTextHits(/建筑工程实验室管理系统/)).toBeGreaterThanOrEqual(1);
    const btn = fnButtons("M04.F04.I02");
    expect(btn.length).toBeGreaterThanOrEqual(1);
  });

  it("应用切换器存在", async () => {
    await renderTree();
    await waitMenuRows(1);
    expect(document.querySelector('[data-testid="app-selector-trigger"]')).toBeTruthy();
  });

  it("切到 erp 后渲染 7 项菜单", async () => {
    selectApp("erp");
    await renderTree();
    const rows = await waitMenuRowsExact(menusByAppCode("erp").length);
    expect(leafTextHits(/企业资源计划系统/)).toBeGreaterThanOrEqual(1);
    const rowText = rows.map((r) => r.textContent).join("|");
    expect(rowText).toMatch(/采购管理/);
    expect(rowText).toMatch(/系统设置/);
  });

  it("切到 crm 后渲染 7 项菜单", async () => {
    selectApp("crm");
    await renderTree();
    const rows = await waitMenuRowsExact(menusByAppCode("crm").length);
    expect(leafTextHits(/客户关系管理系统/)).toBeGreaterThanOrEqual(1);
    const rowText = rows.map((r) => r.textContent).join("|");
    expect(rowText).toMatch(/客户管理/);
    expect(rowText).toMatch(/销售线索/);
    expect(rowText).toMatch(/商机管理/);
    expect(rowText).toMatch(/销售报表/);
  });

  it("reload 后从 localStorage 还原选中应用", async () => {
    selectApp("crm");
    await renderTree();
    await waitMenuRowsExact(menusByAppCode("crm").length);
  });

  it("菜单行挂删除锚按钮（每个菜单 1 个）", async () => {
    await renderTree();
    await waitMenuRows(1);
    expect(fnButtons("M04.F04.I05").length).toBe(menusByAppCode("lab-management").length);
  });

  it("父级菜单行带 menu-toggle 切换按钮", async () => {
    await renderTree();
    await waitMenuRowsExact(menusByAppCode("lab-management").length);
    const toggles = [
      ...document.querySelectorAll<HTMLElement>('button[data-testid^="menu-toggle-"]'),
    ];
    expect(toggles.length).toBeGreaterThan(0);
  });

  it("点击父级切换按钮后子级行数减少", async () => {
    await renderTree();
    const before = (await waitMenuRowsExact(menusByAppCode("lab-management").length))
      .length;
    const firstToggle = [
      ...document.querySelectorAll<HTMLButtonElement>(
        'button[data-testid^="menu-toggle-"]',
      ),
    ][0]!;
    firstToggle.click();
    await waitFor(
      () => {
        fixture.detectChanges();
        const after = document.querySelectorAll('[data-testid="menu-row"]').length;
        expect(after).toBeLessThan(before);
        expect(after).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );
  });

  it("至少一行带 data-depth > 0（证明真的按 parentId 构树）", async () => {
    await renderTree();
    const rows = await waitMenuRowsExact(menusByAppCode("lab-management").length);
    const nested = rows.filter((r) => Number(r.getAttribute("data-depth")) > 0);
    expect(nested.length).toBeGreaterThan(0);
  });
});
