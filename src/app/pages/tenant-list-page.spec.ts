// M00.F01 — 租户列表（平台）——移植 react tests/integration/tenant-list.test.tsx
// 选中行高亮 + 默认选中 acme + 选中后 localStorage 同时存 id+name + reload 还原。
// 真化同 react：直连真 nextjs :5101，断言锚 saas-shared seeds/tenant.json。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach } from "vitest";

import { TenantListPageComponent } from "./tenant-list-page";
import {
  TestHostComponent,
  realChainProviders,
  settle,
} from "../../../tests/helpers/ng-test";
import { installRealChain, SEED } from "../../../tests/helpers/real-chain";

let fixture: ComponentFixture<TestHostComponent>;

/** 挂路由宿主并显式导航到 /tenants（TestBed 初始导航不确定，见 login spec 注）。 */
async function renderTenants(): Promise<void> {
  window.history.replaceState({}, "", "/tenants");
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders([
      { path: "tenants", component: TenantListPageComponent },
    ]),
  });
  fixture = TestBed.createComponent(TestHostComponent);
  await TestBed.inject(Router).navigateByUrl("/tenants");
  await settle(fixture);
}

/** 等 tenant-row 渲染到指定行数（真链路异步查询 + zoneless CD 轮询驱动）。 */
async function waitRows(count: number): Promise<HTMLElement[]> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(document.querySelectorAll('[data-testid="tenant-row"]').length).toBe(count);
    },
    { timeout: 30_000 },
  );
  return [...document.querySelectorAll<HTMLElement>('[data-testid="tenant-row"]')];
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
  window.history.replaceState({}, "", "/tenants");
});

describe("M00.F01 租户列表（平台）", () => {
  it("渲染 3 行租户（来自种子数据），新建按钮挂 data-fn=M00.F01.I02", async () => {
    await renderTenants();
    const rows = await waitRows(SEED.tenants.length);
    expect(rows.length).toBe(SEED.tenants.length);
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("data-fn") === "M00.F01.I02",
    );
    expect(btn).toBeTruthy();
  });

  it("默认选中 acme（data-selected=true + ✓ 标记）", async () => {
    await renderTenants();
    const rows = await waitRows(SEED.tenants.length);
    const acmeRow = rows.find((r) => r.textContent?.includes(SEED.tenants[0].tenantKey));
    expect(acmeRow?.getAttribute("data-selected")).toBe("true");
    expect(document.querySelectorAll('[data-testid="tenant-selected-mark"]').length).toBe(
      1,
    );
  });

  it("点击另一行切换选中", async () => {
    await renderTenants();
    const rows = await waitRows(SEED.tenants.length);
    const globexRow = rows.find((r) =>
      r.textContent?.includes(SEED.tenants[1].tenantKey),
    )!;
    globexRow.click();
    await settle(fixture);
    expect(globexRow.getAttribute("data-selected")).toBe("true");
    expect(document.querySelectorAll('[data-testid="tenant-selected-mark"]').length).toBe(
      1,
    );
  });

  it("选中后 localStorage 存 id+name", async () => {
    await renderTenants();
    const rows = await waitRows(SEED.tenants.length);
    const globexRow = rows.find((r) =>
      r.textContent?.includes(SEED.tenants[1].tenantKey),
    )!;
    globexRow.click();
    await settle(fixture);
    const raw = localStorage.getItem("saas.selected.tenant");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { id: string; name: string };
    expect(parsed.id).toBe(SEED.tenants[1].id);
    expect(parsed.name).toBe(SEED.tenants[1].name);
  });

  it("reload 后从 localStorage 还原选中", async () => {
    localStorage.setItem(
      "saas.selected.tenant",
      JSON.stringify({ id: SEED.tenants[1].id, name: SEED.tenants[1].name }),
    );
    await renderTenants();
    const rows = await waitRows(SEED.tenants.length);
    const globexRow = rows.find((r) =>
      r.textContent?.includes(SEED.tenants[1].tenantKey),
    )!;
    expect(globexRow.getAttribute("data-selected")).toBe("true");
  });
});
