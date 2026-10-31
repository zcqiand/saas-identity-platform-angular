// M04 — 平台级应用列表九项收口。移植 react tests/integration/app-list.test.tsx +
// app-list-contract-shape.test.tsx（两文件并入一 spec 的两个 describe）。
// 断言锚 saas-shared seeds/oauth_client.json（lab-management / erp / crm /
// saas-console 四应用）。全部用例只读（种子行零触碰，免 fixture 清理）。
// builder 双跑指纹见 user-list-page.spec.ts 头注。it() 标题不带功能 ID 字面。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach } from "vitest";

import { AppListPageComponent } from "./app-list-page";
import {
  TestHostComponent,
  realChainProviders,
  settle,
} from "../../../tests/helpers/ng-test";
import { installRealChain, SEED, testToken } from "../../../tests/helpers/real-chain";

const API = "http://localhost:5101";

let fixture: ComponentFixture<TestHostComponent>;

async function renderApp(): Promise<void> {
  const url = "/admin/clients";
  window.history.replaceState({}, "", url);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders([
      { path: "admin/clients", component: AppListPageComponent },
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

function fnButtons(dataFn: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.getAttribute("data-fn") === dataFn,
  );
}

/** 叶子元素按完整文本匹配（testing-library getAllByText 同构）。 */
function leafsByText(text: string): Element[] {
  return [...document.querySelectorAll("*")].filter(
    (el) => el.children.length === 0 && el.textContent?.trim() === text,
  );
}

async function waitAppRows(count: number): Promise<HTMLElement[]> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(
        document.querySelectorAll('[data-testid="app-row"]').length,
      ).toBeGreaterThanOrEqual(count);
    },
    { timeout: 30_000 },
  );
  return [...document.querySelectorAll<HTMLElement>('[data-testid="app-row"]')];
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
});

describe("应用列表（平台级）", () => {
  it("渲染 4 个应用行，新建按钮挂创建锚", async () => {
    await renderApp();
    await waitAppRows(SEED.apps.length);
    expect(fnButton("M04.F01.I02")).toBeTruthy();
  });

  it("应用行挂启停锚按钮", async () => {
    await renderApp();
    await waitAppRows(1);
    expect(fnButtons("M04.F02.I01").length).toBeGreaterThanOrEqual(1);
  });

  it("应用行挂删除锚按钮（每个应用 1 个）", async () => {
    await renderApp();
    await waitAppRows(1);
    expect(fnButtons("M04.F01.I05").length).toBe(SEED.apps.length);
  });

  it("应用行展示 clientId（列表精简为 Code/ClientID、名称、状态、操作）", async () => {
    await renderApp();
    await waitAppRows(1);
    for (const app of SEED.apps) {
      const hits = leafsByText(`clientId: ${app.clientId}`);
      expect(hits.length, `clientId line for ${app.clientId}`).toBe(1);
    }
  });

  it("展示种子四应用：lab-management / erp / crm / saas-console", async () => {
    await renderApp();
    await waitAppRows(1);
    for (const app of SEED.apps) {
      expect(
        leafsByText(app.clientName).length,
        `clientName ${app.clientName}`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("应用列表——契约 OAuthClient 形状", () => {
  it("真响应字段符合 OAuthClient 契约（clientId/clientName/status:number/scopes:string）", async () => {
    const res = await fetch(`${API}/api/v1/admin/clients`, {
      headers: { Authorization: `Bearer ${testToken()}` },
    });
    expect(res.ok).toBeTruthy();
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    const items = body.items;
    expect(items.length).toBe(SEED.apps.length);
    for (const row of items) {
      expect(typeof row["clientId"]).toBe("string");
      expect(typeof row["clientName"]).toBe("string");
      expect(typeof row["status"]).toBe("number"); // ADR-0032：smallint 数字，不是 "active" 字符串
      expect(typeof row["scopes"]).toBe("string"); // 9/7 SSOT pivot：逗号分隔字符串，非数组
      expect(typeof row["autoApprove"]).toBe("boolean");
    }
    // 与种子集对齐（clientId = code 形）
    expect(items.map((r) => r["clientId"]).sort()).toEqual(
      SEED.apps.map((a) => a.clientId).sort(),
    );
  });

  it("clientName 渲染到名称列（真后端下名称不再空白）", async () => {
    await renderApp();
    await waitAppRows(1);
    for (const app of SEED.apps) {
      expect(
        leafsByText(app.clientName).length,
        `clientName ${app.clientName}`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("数字 status：种子四应用全为 1 → 每行渲染活跃徽章", async () => {
    await renderApp();
    await waitAppRows(1);
    expect(leafsByText("活跃").length).toBe(
      SEED.apps.filter((a) => a.status === 1).length,
    );
    expect(leafsByText("已暂停").length).toBe(0);
  });

  it("clientId 行渲染契约 clientId 字符串", async () => {
    await renderApp();
    await waitAppRows(1);
    expect(leafsByText("clientId: lab-management").length).toBeGreaterThanOrEqual(1);
    expect(leafsByText("clientId: saas-console").length).toBeGreaterThanOrEqual(1);
  });
});
