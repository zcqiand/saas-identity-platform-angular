// AppShell 回归三组：sidebar 选中态唯一性 / 面包屑 label map 防回潮 / 顶栏
// whoami 徽标。移植 react tests/integration/sidebar-active.test.tsx。
// 与 react 的差异：react 用 axios spy 桩隔离壳层（stub 页承载面包屑断言），
// angular 直接真链路（读端点全只读）+ 两个壳层桩页（壳 label map 断言不进
// 页面逻辑）。高亮类名 nav-active（react 侧 bg-slate-700 同语义，
// routerLinkActiveOptions exact 对齐 NavLink end={true}）。
import { Component } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach } from "vitest";

import { AppShell } from "./app-shell";
import { MenuTreePageComponent } from "../pages/menu-tree-page";
import {
  TestHostComponent,
  realChainProviders,
  settle,
} from "../../../tests/helpers/ng-test";
import { installRealChain, SEED } from "../../../tests/helpers/real-chain";

/** 面包屑断言用的最小桩页：只验证壳层 label map，不进页面逻辑（react 同款）。 */
@Component({
  selector: "app-members-page-stub",
  standalone: true,
  template: `<div data-testid="members-page-stub"></div>`,
})
class MembersPageStubComponent {}

@Component({
  selector: "app-applications-page-stub",
  standalone: true,
  template: `<div data-testid="applications-page-stub"></div>`,
})
class ApplicationsPageStubComponent {}

let fixture: ComponentFixture<TestHostComponent>;

async function renderShellAt(path: string): Promise<void> {
  window.history.replaceState({}, "", path);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders([
      {
        path: "",
        component: AppShell,
        children: [
          { path: "admin/clients/:clientId/menus", component: MenuTreePageComponent },
          { path: "tenants/:tenantId/members", component: MembersPageStubComponent },
          {
            path: "tenants/:tenantId/applications",
            component: ApplicationsPageStubComponent,
          },
        ],
      },
    ]),
  });
  fixture = TestBed.createComponent(TestHostComponent);
  await TestBed.inject(Router).navigateByUrl(path);
  await settle(fixture);
}

async function waitShellReady(): Promise<void> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(
        document.querySelectorAll('[data-testid^="sidebar-nav-item-"]').length,
      ).toBeGreaterThanOrEqual(6);
    },
    { timeout: 30_000 },
  );
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
});

describe("sidebar 选中态唯一性回归", () => {
  it("在菜单树路由高亮「菜单管理」，「应用维护」不高亮", async () => {
    await renderShellAt("/admin/clients/lab-management/menus");
    await waitShellReady();
    fixture.detectChanges();
    const menuLink = document.querySelector(
      '[data-testid="sidebar-nav-item-M04.F04.I01"]',
    );
    const appLink = document.querySelector(
      '[data-testid="sidebar-nav-item-M04.F01.I01"]',
    );
    expect(menuLink, "菜单管理 nav item").toBeTruthy();
    expect(appLink, "应用维护 nav item").toBeTruthy();
    expect(menuLink!.classList.contains("nav-active")).toBe(true);
    expect(appLink!.classList.contains("nav-active")).toBe(false);
  });

  it("整页只有一条 sidebar item 高亮 active 态", async () => {
    await renderShellAt("/admin/clients/lab-management/menus");
    await waitShellReady();
    fixture.detectChanges();
    const items = [
      ...document.querySelectorAll<HTMLElement>('a[data-testid^="sidebar-nav-item-"]'),
    ];
    const active = items.filter((el) => el.classList.contains("nav-active"));
    expect(active.length).toBe(1);
    expect(active[0]!.getAttribute("data-fn")).toBe("M04.F04.I01");
  });
});

// 面包屑 label map 防回潮（2026-09-21 终审 I-1/M-a）：路由段已从 users/applications
// 改齐为 members/clients，SUB_PATH_LABEL 按段字面建键——键名漂移就会把裸段字面
// （members/clients）直接渲染进面包屑。这里的断言锁住「段 → 中文 label」映射。
describe("面包屑 label map 防回潮", () => {
  it("租户工作区成员页面包屑含「用户」，不含裸 members 段", async () => {
    await renderShellAt(`/tenants/${SEED.tenants[0].id}/members`);
    await waitShellReady();
    fixture.detectChanges();
    const nav = document.querySelector('nav[aria-label="breadcrumb"]');
    expect(nav, "breadcrumb nav").toBeTruthy();
    expect(nav!.textContent).toContain("用户");
    expect(nav!.textContent).not.toContain("members");
  });

  it("租户工作区应用页面包屑含「应用」，不含裸 applications 段", async () => {
    await renderShellAt(`/tenants/${SEED.tenants[0].id}/applications`);
    await waitShellReady();
    fixture.detectChanges();
    const nav = document.querySelector('nav[aria-label="breadcrumb"]');
    expect(nav).toBeTruthy();
    expect(nav!.textContent).toContain("应用");
    expect(nav!.textContent).not.toContain("applications");
  });

  it("菜单树路由面包屑翻齐 admin/clients/menus 三段", async () => {
    await renderShellAt("/admin/clients/lab-management/menus");
    await waitShellReady();
    fixture.detectChanges();
    const nav = document.querySelector('nav[aria-label="breadcrumb"]');
    expect(nav).toBeTruthy();
    expect(nav!.textContent).toContain("平台管理");
    expect(nav!.textContent).toContain("应用");
    expect(nav!.textContent).toContain("菜单");
  });
});

// 顶栏 whoami 徽标（真链路）：徽标数据来自真 /api/v1/me（TEST_TOKEN 身份 =
// 种子 alice，带 email）。
describe("顶栏 whoami 徽标", () => {
  it("顶栏渲染 whoami 徽标（email，降级 id）", async () => {
    await renderShellAt("/admin/clients/lab-management/menus");
    const badge = await waitFor(() => {
      const el = document.querySelector('[data-testid="whoami-badge"]');
      fixture.detectChanges();
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(badge.textContent).toContain("@"); // TEST_TOKEN 身份为种子用户（有 email）
    expect(badge.getAttribute("title")).toBeTruthy(); // title=id
  });
});
