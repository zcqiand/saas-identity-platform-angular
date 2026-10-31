// M00.F05 — tenant-scoped 应用订阅列表（CRUD + 状态切换）
// 移植 react tests/integration/tenant-applications-list.test.tsx。真化同 react：
// 直连真 nextjs :5101。种子语义（shared/scripts/seed-db.mjs）：每租户固定预订阅
// lab-management 一行；订阅写路径走真 POST，测试订阅 erp 后 afterEach 真 DELETE
// 清理（隔离纪律：不留状态）。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { TenantApplicationsListPageComponent } from "./tenant-applications-list-page";
import {
  TestHostComponent,
  realChainProviders,
  settle,
  typeInto,
} from "../../../tests/helpers/ng-test";
import { installRealChain, SEED, testToken } from "../../../tests/helpers/real-chain";

const TENANT_ID = SEED.tenants[0].id;
const SUBSCRIBE_PATH = `http://localhost:5101/api/v1/tenants/${TENANT_ID}/applications`;

let fixture: ComponentFixture<TestHostComponent>;

async function renderApps(): Promise<void> {
  const url = `/tenants/${TENANT_ID}/applications`;
  window.history.replaceState({}, "", url);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders([
      {
        path: "tenants/:tenantId/applications",
        component: TenantApplicationsListPageComponent,
      },
    ]),
  });
  fixture = TestBed.createComponent(TestHostComponent);
  await TestBed.inject(Router).navigateByUrl(url);
  await settle(fixture);
}

async function waitAppRows(count: number): Promise<HTMLElement[]> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(document.querySelectorAll('[data-testid="tenant-app-row"]').length).toBe(
        count,
      );
    },
    { timeout: 30_000 },
  );
  return [...document.querySelectorAll<HTMLElement>('[data-testid="tenant-app-row"]')];
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
});

// 写路径隔离：测试订阅的 erp 行无论断言成败都真 DELETE（幂等：不存在时 404 吞掉）
afterEach(async () => {
  try {
    await fetch(`${SUBSCRIBE_PATH}/erp`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${testToken()}` },
    });
  } catch {
    /* 404 = 本用例没成功订阅，无需清理 */
  }
});

describe("M00.F05 租户应用", () => {
  it("渲染租户应用页，订阅应用按钮挂 data-fn=M00.F05.I02", async () => {
    await renderApps();
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("data-fn") === "M00.F05.I02",
    );
    expect(btn?.textContent).toContain("订阅应用");
  });

  it("渲染种子的预订阅行：lab-management（appName 由 adminClients 列表富化）", async () => {
    await renderApps();
    await waitAppRows(1);
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(document.body.textContent).toContain("建筑工程实验室管理系统");
      },
      { timeout: 30_000 },
    );
    expect(document.body.textContent).toContain("lab-management");
  });

  it("打开订阅对话框、填 clientId 提交（真 POST，afterEach 清理）", async () => {
    await renderApps();
    const open = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("订阅应用"),
    )!;
    open.click();
    await waitFor(() => {
      expect(document.querySelector('[data-testid="crud-field-clientId"]')).toBeTruthy();
    });
    const clientInput = document.querySelector<HTMLInputElement>(
      '[data-testid="crud-field-clientId"]',
    )!;
    typeInto(clientInput, "erp");
    (document.querySelector('[data-testid="crud-submit"]') as HTMLButtonElement).click();
    // 真 POST 落库 + refetch：erp 订阅行出现（appName 解析自 adminClients）
    await waitFor(
      () => {
        fixture.detectChanges();
        const rows = [...document.querySelectorAll('[data-testid="tenant-app-row"]')];
        expect(rows.some((r) => r.textContent?.includes("企业资源计划系统"))).toBe(true);
      },
      { timeout: 20_000 },
    );
  }, 30_000);
});
