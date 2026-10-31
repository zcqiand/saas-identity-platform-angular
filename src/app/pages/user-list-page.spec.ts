// M00.F02/M01.F02 — tenant-scoped 成员管理页八项收口。
// 移植 react tests/integration/user-list.test.tsx。真化同 react：直连真 nextjs :5101。
// 断言锚 saas-shared seeds：tenant1（tenants[0]）alice/bob active、carol invited。
// 与 react 的关键差异：angular builder 一轮会把 spec 文件跑两遍（双 global-setup
// 实测 2026-11-01），共享真库上第二遍会踩第一遍的写入——所以写路径用例一律
// API 自建独立 fixture（随机后缀）+ afterEach 真删除清理，不依赖种子行可变性。
// it() 标题不带功能 ID 字面（fnReporter 泄漏禁令）；UI 锚由页面 data-fn 属性承载。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { Router } from "@angular/router";
import { waitFor } from "@testing-library/dom";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { UserListPageComponent } from "./user-list-page";
import {
  TestHostComponent,
  realChainProviders,
  settle,
  typeInto,
} from "../../../tests/helpers/ng-test";
import { installRealChain, SEED, testToken } from "../../../tests/helpers/real-chain";

const TENANT_ID = SEED.tenants[0].id;
const API = "http://localhost:5101/api/v1";

let fixture: ComponentFixture<TestHostComponent>;

/** 本用例创建的成员 username 集合，afterEach 按列表反查 userId 统一真删除。 */
const createdMembers = new Set<string>();

function uniq(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

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

async function createMember(username: string): Promise<string> {
  const res = await api(`/tenants/${TENANT_ID}/members`, {
    method: "POST",
    body: JSON.stringify({
      username,
      password: `${username}-pass-123`,
      email: `${username}@acme.io`,
    }),
  });
  expect(res.ok, `create fixture member ${username}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  createdMembers.add(username);
  return body.id;
}

async function deleteMemberByUsername(username: string): Promise<void> {
  try {
    const res = await api(`/tenants/${TENANT_ID}/members?pageSize=200`);
    if (!res.ok) return;
    const body = (await res.json()) as { items: Array<{ id: string; username: string }> };
    const hit = body.items.find((m) => m.username === username);
    if (hit) await api(`/tenants/${TENANT_ID}/members/${hit.id}`, { method: "DELETE" });
  } catch {
    /* 清理失败不遮蔽断言 */
  }
}

async function renderMembers(): Promise<void> {
  const url = `/tenants/${TENANT_ID}/members`;
  window.history.replaceState({}, "", url);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders([
      { path: "tenants/:tenantId/members", component: UserListPageComponent },
    ]),
  });
  fixture = TestBed.createComponent(TestHostComponent);
  await TestBed.inject(Router).navigateByUrl(url);
  await settle(fixture);
}

async function waitUserRows(count: number): Promise<HTMLElement[]> {
  await waitFor(
    () => {
      fixture.detectChanges();
      expect(
        document.querySelectorAll('[data-testid="user-row"]').length,
      ).toBeGreaterThanOrEqual(count);
    },
    { timeout: 30_000 },
  );
  return [...document.querySelectorAll<HTMLElement>('[data-testid="user-row"]')];
}

async function findRow(username: string): Promise<HTMLElement> {
  const rows = await waitUserRows(1);
  const row = rows.find((r) => r.textContent?.includes(username));
  expect(row, `row for ${username}`).toBeTruthy();
  return row!;
}

function rowButton(row: HTMLElement, name: string): HTMLButtonElement {
  const btn = [...row.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  );
  expect(btn, `button ${name} in row`).toBeTruthy();
  return btn!;
}

function setSelect(testid: string, value: string): void {
  const sel = document.querySelector<HTMLSelectElement>(`[data-testid="${testid}"]`);
  expect(sel, testid).toBeTruthy();
  sel!.value = value;
  sel!.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
});

afterEach(async () => {
  for (const username of [...createdMembers]) {
    await deleteMemberByUsername(username);
  }
  createdMembers.clear();
});

describe("成员管理页（tenant-scoped 用户列表）", () => {
  it("渲染种子成员行：alice / bob 在列", async () => {
    await renderMembers();
    const rows = await waitUserRows(3);
    const text = rows.map((r) => r.textContent).join("|");
    expect(text).toContain("alice");
    expect(text).toContain("bob");
  });

  it("状态过滤 invited：只剩种子里的已邀请成员行", async () => {
    await renderMembers();
    await waitUserRows(3);
    setSelect("status-filter", "invited");
    // 种子：tenant1 的 invited 成员恰 1 行（carol = SEED.users[2]）
    await waitFor(
      () => {
        fixture.detectChanges();
        const rows = [...document.querySelectorAll('[data-testid="user-row"]')];
        expect(rows.length).toBe(1);
        expect(rows[0].textContent).toContain(SEED.users[2].username);
      },
      { timeout: 30_000 },
    );
  });

  it("每页 2 条分页：翻到第 2 页页码指示更新", async () => {
    await renderMembers();
    await waitUserRows(3);
    setSelect("page-size", "2");
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(document.querySelectorAll('[data-testid="user-row"]').length).toBe(2);
      },
      { timeout: 30_000 },
    );
    const next = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "下一页",
    )!;
    next.click();
    await waitFor(() => {
      fixture.detectChanges();
      const indicator = document.querySelector('[data-testid="user-page-indicator"]');
      expect(indicator?.textContent).toContain("第 2 页");
    });
  });

  it("行内详情弹层：展示邮箱与角色码完整信息", async () => {
    const username = uniq("detail");
    await createMember(username);
    await renderMembers();
    const row = await findRow(username);
    rowButton(row, "详情").click();
    const dlg = await waitFor(() => {
      const el = document.querySelector('[data-testid="member-detail-dialog"]');
      expect(el).toBeTruthy();
      return el!;
    });
    fixture.detectChanges();
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(dlg.textContent).toContain(username);
        expect(dlg.textContent).toContain(`${username}@acme.io`);
      },
      { timeout: 10_000 },
    );
  });

  it("创建成员并勾选 admin 角色：行内角色计数为 1 项", async () => {
    const username = uniq("dora");
    await renderMembers();
    await waitUserRows(3);
    const open = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "创建成员",
    )!;
    open.click();
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="member-field-username"]'),
      ).toBeTruthy();
    });
    const uInput = document.querySelector<HTMLInputElement>(
      '[data-testid="member-field-username"]',
    )!;
    typeInto(uInput, username);
    typeInto(
      document.querySelector<HTMLInputElement>('[data-testid="member-field-password"]')!,
      `${username}-pass-123`,
    );
    typeInto(
      document.querySelector<HTMLInputElement>('[data-testid="member-field-email"]')!,
      `${username}@acme.io`,
    );
    const adminOpt = await waitFor(() => {
      fixture.detectChanges();
      const el = document.querySelector('[data-testid="role-opt-admin"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // jsdom 里点 mat-checkbox host 不翻内层 input——点真正的 checkbox 节点
    const adminInput = adminOpt.querySelector("input") as HTMLInputElement;
    expect(adminInput).toBeTruthy();
    adminInput.click();
    (
      document.querySelector('[data-testid="member-form-submit"]') as HTMLButtonElement
    ).click();
    // 创建成功后自动 assignRoles → 行渲染且角色计数为 1 项
    //（waitFor 兜住「先出现 0 项、assignRoles 刷新后 1 项」的中间态）
    await waitFor(
      () => {
        fixture.detectChanges();
        const row = [...document.querySelectorAll('[data-testid="user-row"]')].find((r) =>
          r.textContent?.includes(username),
        );
        expect(row).toBeTruthy();
        expect(row!.textContent).toContain("1 项");
      },
      { timeout: 30_000 },
    );
    createdMembers.add(username);
  }, 40_000);

  it("邀请成员：邀请后新行出现", async () => {
    await renderMembers();
    await waitUserRows(3);
    const email = `ivy-${uniq("t")}@acme.io`;
    const ivyUsername = email.split("@")[0]!;
    const open = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "邀请成员",
    )!;
    open.click();
    await waitFor(() => {
      expect(document.querySelector('[data-testid="crud-field-email"]')).toBeTruthy();
    });
    typeInto(
      document.querySelector<HTMLInputElement>('[data-testid="crud-field-email"]')!,
      email,
    );
    (document.querySelector('[data-testid="crud-submit"]') as HTMLButtonElement).click();
    // 后端语义：username=email 前缀、无邀请链接展示面（brief 断言核心=行出现）。
    // 徽标不在此断言：nextjs invite 实建 tenant_member.status=active（与其自身
    // seeds 的 invited 行漂移），后端零触碰——候选修复记入任务报告，不在前端硬凑。
    await waitFor(
      () => {
        fixture.detectChanges();
        const row = [...document.querySelectorAll('[data-testid="user-row"]')].find((r) =>
          r.textContent?.includes(ivyUsername),
        );
        expect(row).toBeTruthy();
        expect(row!.textContent).toContain(email);
      },
      { timeout: 30_000 },
    );
    createdMembers.add(ivyUsername);
  }, 40_000);

  it("编辑成员：可改邮箱与手机号，弹窗无状态字段", async () => {
    const username = uniq("edit");
    await createMember(username);
    await renderMembers();
    const row = await findRow(username);
    rowButton(row, "编辑").click();
    const emailInput = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>(
        '[data-testid="crud-field-email"]',
      );
      expect(el).toBeTruthy();
      return el!;
    });
    expect(emailInput.value).toBe(`${username}@acme.io`);
    // 状态已从编辑弹窗移除（独立启停走行内按钮 + changeTenantUserStatus）
    expect(document.querySelector('[data-testid="crud-field-status"]')).toBeNull();
    const newEmail = `${username}-2@acme.io`;
    typeInto(
      document.querySelector<HTMLInputElement>('[data-testid="crud-field-mobile"]')!,
      "13800000000",
    );
    typeInto(emailInput, newEmail);
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "保存")!
      .click();
    await waitFor(
      () => {
        fixture.detectChanges();
        expect(document.body.textContent).toContain(newEmail);
      },
      { timeout: 30_000 },
    );
  });

  it("行内停用经确认后：状态徽标翻转为暂停", async () => {
    const username = uniq("susp");
    await createMember(username);
    await renderMembers();
    const row = await findRow(username);
    rowButton(row, "停用").click();
    const confirm = await waitFor(() => {
      const el = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "确认",
      );
      expect(el).toBeTruthy();
      return el!;
    });
    confirm.click();
    await waitFor(
      () => {
        fixture.detectChanges();
        const refreshed = [
          ...document.querySelectorAll<HTMLElement>('[data-testid="user-row"]'),
        ].find((r) => r.textContent?.includes(username));
        expect(refreshed).toBeTruthy();
        expect(refreshed!.textContent).toContain("已暂停");
      },
      { timeout: 30_000 },
    );
  }, 40_000);
});
