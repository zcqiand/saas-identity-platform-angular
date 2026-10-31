// M01.F04.I03 — 账号密码登录（REQ-2026-029 T-2，移植 react tests/integration/login.test.tsx）
//
// 真化策略同 react：负路径（缺 token/401/423）打桩在 service 层
// （TestBed 注入的单例实例上 vi.spyOn；react 是 axios 层，angular 无全局 axios，
// 语义等价点 = HTTP 入口前的最后一层）；正路径真打 saas-nextjs :5101
// /api/v1/auth/login（凭证 = shared/scripts/seed-db.mjs 家族 dev 约定
// plain:dev123456 + 种子用户 alice），token 持久化断言走真响应。
//
// OAuth 2.0 授权码回跳（RFC 6749 §4.1.2）：mount 解析出 code+redirect_uri 即回跳；
// 登录成功后 onSubmit 的 setTimeout(0) 二次回跳——两次赋值都要等齐（react
// Phase 2 假红指纹：游离定时器把赋值落到下一个测试的 Proxy 里）。
//
// 与 react 的差异（有意）：
//   - 「无 client_id query 且 env 缺失」用例不存在——angular 无构建期 env 通道，
//     LOGIN_CLIENT_ID 恒有值；?client_id= 覆盖通道由 loginClientId computed 断言。
//   - ToastService/AuthService 打桩必须在 renderLogin()（configureModule）之后取
//     实例——TestBed.inject 在此之前拿到的是临时 injector 的实例，spy 打不中。
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from "vitest";
import { waitFor } from "@testing-library/dom";
import { of, throwError } from "rxjs";

import { AuthService } from "../../api/endpoints/auth/auth.service";
import { ApiError } from "../../api/api-error";
import { ToastService } from "../ui/toast.service";
import { LoginPageComponent } from "./login-page";
import {
  installRealChain,
  SEED,
  SESSION_STORAGE_KEY,
} from "../../../tests/helpers/real-chain";
import {
  TestHostComponent,
  interceptLocationHref,
  realChainProviders,
  settle,
  typeInto,
} from "../../../tests/helpers/ng-test";

/** 种子里 lab-management 已注册的 RP 回跳（angular 未注册，react 同值同语义）。 */
const RP_REDIRECT_URI = "https://lab-react.xiangru.uk/login";

/** 家族 dev 约定口令（shared/scripts/seed-db.mjs：sys_user.password = plain:dev123456）。 */
const SEED_DEV_PASSWORD = "dev123456";

/** outlet 里激活的 LoginPage 实例（fixture 根是路由宿主，页面经 By.directive 取）。 */
function loginPage(): LoginPageComponent {
  const el = fixture.debugElement.query(By.directive(LoginPageComponent));
  expect(el).toBeTruthy();
  return el!.componentInstance as LoginPageComponent;
}

let fixture: ComponentFixture<TestHostComponent>;
let toastError: Mock<(message: string) => void>;

/**
 * jsdom 侧同步设 URL 再挂路由宿主——LoginPage 经 /login 路由激活（非裸挂），
 * navigate(["/tenants"]) 的落点必须有 <router-outlet> 才会渲染（见 ng-test.ts）。
 * 激活用显式 navigateByUrl：TestBed 下 provideRouter 的初始导航不保证在
 * whenStable 前完成（2026-10-31 实测：outlet 空转 13 用例全挂），显式导航确定。
 */
async function renderLogin(url = "/login?client_id=saas-console"): Promise<{
  auth: AuthService;
}> {
  window.history.replaceState({}, "", url);
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    providers: realChainProviders(),
  });
  const toast = TestBed.inject(ToastService);
  toastError = vi.fn();
  vi.spyOn(toast, "error").mockImplementation(toastError);
  vi.spyOn(toast, "success").mockImplementation(vi.fn());
  fixture = TestBed.createComponent(TestHostComponent);
  const target = new URL(url, window.location.origin);
  await TestBed.inject(Router).navigateByUrl(target.pathname + target.search);
  await settle(fixture);
  return { auth: TestBed.inject(AuthService) };
}

/** 灌表单并提交（angular 侧经 ngModel input 事件，非 React 合成 change）。 */
async function fillAndSubmit(
  username = "alice",
  password = SEED_DEV_PASSWORD,
): Promise<void> {
  const user = document.querySelector<HTMLInputElement>('[data-testid="login-username"]');
  const pass = document.querySelector<HTMLInputElement>('[data-testid="login-password"]');
  expect(user).toBeTruthy();
  expect(pass).toBeTruthy();
  typeInto(user!, username);
  typeInto(pass!, password);
  await settle(fixture);
  (document.querySelector('[data-testid="login-submit"]') as HTMLButtonElement).click();
  await settle(fixture);
}

beforeEach(() => {
  localStorage.clear();
  installRealChain();
  window.history.replaceState({}, "", "/login");
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/login");
});

describe("M01.F04.I03 账号密码登录", () => {
  it("渲染登录表单，提交按钮挂 data-fn=M01.F04.I03", async () => {
    await renderLogin();
    const btn = document.querySelector('[data-testid="login-submit"]');
    expect(btn).toBeTruthy();
    expect(btn).toHaveAttribute("data-fn", "M01.F04.I03");
  });

  it("展示演示账号获取引导（账号列表已随密码下架删除，2026-09-01）", async () => {
    await renderLogin();
    expect(document.body.textContent).toMatch(/演示账号/);
    expect(document.body.textContent).toMatch(/公众号/);
  });

  it("?client_id= 覆盖 LOGIN_CLIENT_ID（B 方案 clientId 门）", async () => {
    await renderLogin("/login?client_id=lab-management");
    expect(loginPage().loginClientId()).toBe("lab-management");
  });

  it("无 ?client_id= 时回落 LOGIN_CLIENT_ID=saas-console", async () => {
    await renderLogin("/login");
    expect(loginPage().loginClientId()).toBe("saas-console");
  });

  it("登录响应缺 token -> toast 提示且不跳转（service 层打桩）", async () => {
    const { auth } = await renderLogin();
    // 组件侧 firstValueFrom 消费 Observable——桩必须回 Observable（Promise 会
    // 炸成 "source.subscribe is not a function"，2026-10-31 实测指纹）
    vi.spyOn(auth, "sessionsLogin").mockReturnValueOnce(
      of({
        accessToken: undefined as never,
        refreshToken: undefined as never,
        user: { id: "u-1" },
        availableTenants: [{ tenantId: SEED.tenants[0].id }],
      } as never) as never,
    );
    await fillAndSubmit("alice", "whatever");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0]?.[0])).toContain("token");
    expect(document.querySelector('[data-testid="tenants-page"]')).toBeNull();
  }, 30_000);

  it("错密码（401，service 层打桩）-> toast 显示用户名或密码错误", async () => {
    const { auth } = await renderLogin();
    // 桩抛 ApiError（toApiError 的原生形状）——裸 Error 会被归到 status 0
    vi.spyOn(auth, "sessionsLogin").mockReturnValueOnce(
      throwError(
        () => new ApiError(401, { message: "Invalid credentials" }, "401"),
      ) as never,
    );
    await fillAndSubmit("alice", "wrong-password");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith("用户名或密码错误");
  }, 30_000);

  it("账号锁定（423，service 层打桩）-> toast 显示锁定提示", async () => {
    const { auth } = await renderLogin();
    vi.spyOn(auth, "sessionsLogin").mockReturnValueOnce(
      throwError(() => new ApiError(423, { message: "account locked" }, "423")) as never,
    );
    await fillAndSubmit();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0]?.[0])).toContain("锁定");
  }, 30_000);

  it("登录成功（真凭证 alice/dev123456 真 POST :5101）-> session 写 localStorage + 跳 /tenants", async () => {
    const loc = interceptLocationHref();
    try {
      await renderLogin();
      await fillAndSubmit();
      // zoneless：轮询内驱动 CD，否则 stub 渲染不进 DOM（2026-10-31 实测指纹）
      await waitFor(
        () => {
          fixture.detectChanges();
          expect(document.querySelector('[data-testid="tenants-page"]')).toBeTruthy();
        },
        { timeout: 60_000 },
      );
      const stored = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}");
      // 真 HS256 JWT（三段式），不是 mock 字面量
      expect(String(stored.accessToken)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      // alice 的首个 membership（tenant.created_at ASC）= 种子 acme
      expect(stored.currentTenantId).toBe(SEED.tenants[0].id);
      // 无 OAuth 参数：不读 location.href（跳 /tenants 行为不变）
      expect(loc.assigned()).toBe("");
    } finally {
      loc.restore();
    }
  }, 90_000);
});

// === M01.F04.I03 OAuth code 回跳（RFC 6749 §4.1.2）===
describe("M01.F04.I03 OAuth code 回跳", () => {
  it("带 ?code=&redirect_uri=&state= 真登录成功 -> 302 redirect_uri?code&state（不跳 /tenants）", async () => {
    const loc = interceptLocationHref();
    try {
      await renderLogin(
        `/login?client_id=saas-console&code=auth-code-1&redirect_uri=${encodeURIComponent(RP_REDIRECT_URI)}&state=xyz`,
      );
      // mount 解析出 code+redirect_uri 即回跳，不 gate 登录态——第一次赋值 = mount 回跳
      await waitFor(() => expect(loc.count()).toBeGreaterThanOrEqual(1));
      await fillAndSubmit();
      // 登录成功后 onSubmit 的 setTimeout(0) 二次回跳，URL 相同（react 同款双回跳）
      await waitFor(() => expect(loc.count()).toBeGreaterThanOrEqual(2), {
        timeout: 60_000,
      });
      const target = new URL(loc.assigned());
      expect(target.origin + target.pathname).toBe(RP_REDIRECT_URI);
      expect(target.searchParams.get("code")).toBe("auth-code-1");
      expect(target.searchParams.get("state")).toBe("xyz");
      // 回跳 RP，而不是进 saas 自己的 /tenants
      expect(document.querySelector('[data-testid="tenants-page"]')).toBeNull();
    } finally {
      loc.restore();
      window.history.replaceState({}, "", "/login");
    }
  }, 90_000);

  it("已登录（TEST_TOKEN session）+ OAuth 跳板参数（无 code）-> mount 主动领码回跳，不要求再认证", async () => {
    const loc = interceptLocationHref();
    try {
      const { auth } = await renderLogin(
        `/login?client_id=lab-management&redirect_uri=${encodeURIComponent(RP_REDIRECT_URI)}&state=sso-1`,
      );
      const loginSpy = vi
        .spyOn(auth, "sessionsLogin")
        .mockReturnValue(throwError(() => new Error("must not be called")) as never);
      // 已登录路径：构造函数直接 /oauth/authorize（真后端）拿 code 回跳
      await waitFor(() => expect(loc.count()).toBeGreaterThanOrEqual(1), {
        timeout: 30_000,
      });
      const target = new URL(loc.assigned());
      expect(target.origin + target.pathname).toBe(RP_REDIRECT_URI);
      expect(target.searchParams.get("state")).toBe("sso-1");
      expect(target.searchParams.get("code")).toMatch(/^saas-code-/);
      expect(loginSpy).not.toHaveBeenCalled();
    } finally {
      loc.restore();
      window.history.replaceState({}, "", "/login");
    }
  }, 30_000);
});

// 2026-09-12：登录页 BackendBadge 切换器（dev 诊断，不挂功能 ID）
describe("登录页后端切换器", () => {
  function badgeTrigger(): HTMLElement {
    const badge = document.querySelector('[data-testid="backend-badge"]');
    expect(badge).toBeTruthy();
    const btn = badge!.querySelector("button");
    expect(btn).toBeTruthy();
    return btn as HTMLElement;
  }

  it("渲染 BackendBadge，未选择时显示 env 默认", async () => {
    await renderLogin();
    expect(badgeTrigger().textContent).toContain("(env 默认)");
  });

  it("选 springboot -> localStorage 持久化 + 触发按钮显示 springboot", async () => {
    await renderLogin();
    badgeTrigger().click();
    await settle(fixture);
    await waitFor(() => {
      expect(document.querySelector(".mat-mdc-menu-panel")).toBeTruthy();
    });
    const item = [...document.querySelectorAll(".mat-mdc-menu-item")].find((n) =>
      n.textContent?.includes("springboot"),
    );
    expect(item).toBeTruthy();
    (item as HTMLElement).click();
    await settle(fixture);
    expect(localStorage.getItem("saas.api.backend")).toBe("springboot");
    expect(badgeTrigger().textContent).toContain("springboot");
  });

  it("切回 env 默认 -> localStorage 清除", async () => {
    localStorage.setItem("saas.api.backend", "springboot");
    await renderLogin();
    expect(badgeTrigger().textContent).toContain("springboot");
    badgeTrigger().click();
    await settle(fixture);
    await waitFor(() => {
      expect(document.querySelector(".mat-mdc-menu-panel")).toBeTruthy();
    });
    const item = [...document.querySelectorAll(".mat-mdc-menu-item")].find((n) =>
      n.textContent?.includes("env 默认"),
    );
    expect(item).toBeTruthy();
    (item as HTMLElement).click();
    await settle(fixture);
    expect(localStorage.getItem("saas.api.backend")).toBeNull();
    expect(badgeTrigger().textContent).toContain("(env 默认)");
  });
});
