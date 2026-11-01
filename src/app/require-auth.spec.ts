// 路由守卫 authGuard：未登录时访问受保护路由自动重定向到 /login。
// 移植 react tests/integration/require-auth.test.tsx。真路由表（app.routes.ts）
// + 真 guard，localStorage 清空 = 无 session（不 installRealChain，等价 react
// 的 axios 全量 reject 桩：任何漏网请求都会因无 token 暴露）。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach } from "vitest";

import {
  TestHostComponent,
  realChainProviders,
  settle,
} from "../../tests/helpers/ng-test";
import { routes } from "./app.routes";

let fixture: ComponentFixture<TestHostComponent>;

beforeEach(() => {
  localStorage.clear();
});

async function renderAt(path: string): Promise<void> {
  window.history.replaceState({}, "", path);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders(routes),
  });
  fixture = TestBed.createComponent(TestHostComponent);
  await TestBed.inject(Router).navigateByUrl(path);
  await settle(fixture);
}

describe("路由守卫 authGuard", () => {
  it("未登录访问 /tenants → 重定向到 /login", async () => {
    await renderAt("/tenants");
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(document.body.textContent).toContain("SaaS 多租户多应用身份平台");
      },
      { timeout: 10_000 },
    );
  });

  it("未登录访问租户工作区深链 → 同样重定向 /login", async () => {
    await renderAt("/tenants/acme/members");
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(document.body.textContent).toContain("SaaS 多租户多应用身份平台");
      },
      { timeout: 10_000 },
    );
  });
});
