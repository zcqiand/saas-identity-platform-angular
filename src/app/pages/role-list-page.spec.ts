// M02.F01 — tenant-scoped 角色列表——移植 react tests/integration/role-list.test.tsx
// 真化同 react：直连真 nextjs :5101（JWT tenant_id 与路径 :tenantId 一致才放行），
// 断言锚 saas-shared seeds/sys_role.json（acme: admin/member）。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach } from "vitest";

import { RoleListPageComponent } from "./role-list-page";
import {
  TestHostComponent,
  realChainProviders,
  settle,
} from "../../../tests/helpers/ng-test";
import {
  installRealChain,
  SEED,
  acmeRoleIdByCode,
} from "../../../tests/helpers/real-chain";

let fixture: ComponentFixture<TestHostComponent>;

async function renderRoles(tenantId: string): Promise<void> {
  const url = `/tenants/${tenantId}/roles`;
  window.history.replaceState({}, "", url);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders([
      { path: "tenants/:tenantId/roles", component: RoleListPageComponent },
    ]),
  });
  fixture = TestBed.createComponent(TestHostComponent);
  await TestBed.inject(Router).navigateByUrl(url);
  await settle(fixture);
}

async function waitRoleRows(count: number): Promise<HTMLElement[]> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(document.querySelectorAll('[data-testid="role-row"]').length).toBe(count);
    },
    { timeout: 30_000 },
  );
  return [...document.querySelectorAll<HTMLElement>('[data-testid="role-row"]')];
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
});

describe("M02.F01 角色权限（tenant-scoped）", () => {
  it("渲染角色列表，新建角色按钮挂 data-fn=M00.F03.I02", async () => {
    await renderRoles(SEED.tenants[0].id);
    await waitRoleRows(2);
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("data-fn") === "M00.F03.I02",
    );
    expect(btn).toBeTruthy();
  });

  it("渲染种子角色 admin / member 行（真数据锚，菜单授权链接按种子 roleId 寻址）", async () => {
    await renderRoles(SEED.tenants[0].id);
    const rows = await waitRoleRows(2);
    const rowText = rows.map((r) => r.textContent).join("|");
    expect(rowText).toContain("admin");
    expect(rowText).toContain("member");
    const adminRow = rows.find((r) => r.textContent?.includes("admin"))!;
    const grantLink = adminRow.querySelector(`a[href*="${acmeRoleIdByCode("admin")}"]`);
    expect(grantLink).toBeTruthy();
  });
});
