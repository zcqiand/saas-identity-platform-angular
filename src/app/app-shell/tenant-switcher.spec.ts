// M00.F02.I03 — 当前用户跨租户切换。移植 react tests/integration/tenant-switch.test.tsx。
// 真 GET /me/tenants（alice 的 acme/globex 成员关系）+ 真 POST
// /me/tenants/:id/switch（签发 tenant-scoped 新 token 落 session）。
// 切换不落业务表，afterEach 复位 localStorage 即可。
// 与 react 差异：Radix DropdownMenu 在 jsdom 下要点 PointerEvent shim；angular
// mat-menu 在 jsdom 下直接 click 触发即可（noop 动画）。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { TenantSwitcher } from "./tenant-switcher";
import { realChainProviders } from "../../../tests/helpers/ng-test";
import { installRealChain, SEED } from "../../../tests/helpers/real-chain";

let fixture: ComponentFixture<TenantSwitcher>;

function renderSwitcher(): void {
  TestBed.configureTestingModule({
    imports: [TenantSwitcher],
    providers: realChainProviders(),
  });
  fixture = TestBed.createComponent(TenantSwitcher);
  fixture.detectChanges();
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
});

afterEach(() => {
  localStorage.clear();
});

describe("当前用户跨租户切换", () => {
  it("渲染切换器，触发按钮挂切换锚且显示当前租户名", async () => {
    renderSwitcher();
    const btn = document.querySelector('[data-testid="tenant-switcher"]');
    expect(btn, "tenant-switcher trigger").toBeTruthy();
    expect(btn!.getAttribute("data-fn")).toBe("M00.F02.I03");
    // 真数据锚：当前租户名来自 /me/tenants ⨝ admin/tenants（种子 acme）
    await waitFor(() => {
      fixture.detectChanges();
      expect(btn!.textContent).toContain(SEED.tenants[0].name);
    });
  });

  it("点开菜单切到 globex：真 switch 请求 + session 换新租户", async () => {
    renderSwitcher();
    const btn = document.querySelector<HTMLButtonElement>(
      '[data-testid="tenant-switcher"]',
    )!;
    await waitFor(() => {
      fixture.detectChanges();
      expect(btn.textContent).toContain(SEED.tenants[0].name);
    });
    // 打开 mat-menu（jsdom 下 click 触发即挂 overlay 容器）
    btn.click();
    fixture.detectChanges();
    const globexItem = await waitFor(() => {
      fixture.detectChanges();
      const items = [...document.querySelectorAll("button.mat-mdc-menu-item")];
      const hit = items.find((b) => b.textContent?.includes(SEED.tenants[1].name));
      expect(hit, `menu item for ${SEED.tenants[1].name}`).toBeTruthy();
      return hit!;
    });
    (globexItem as HTMLElement).click();
    // setTenant + navigate：session 的 currentTenantId 换成 globex 种子 id
    await waitFor(
      () => {
        const stored = JSON.parse(localStorage.getItem("saas.tenant") ?? "{}") as {
          currentTenantId?: string;
        };
        expect(stored.currentTenantId).toBe(SEED.tenants[1].id);
      },
      { timeout: 30_000 },
    );
    // 切换响应里的 accessToken 是服务端真签的 tenant-scoped JWT（三段式）
    const stored = JSON.parse(localStorage.getItem("saas.tenant") ?? "{}") as {
      accessToken?: string;
    };
    expect(String(stored.accessToken)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  }, 40_000);
});
