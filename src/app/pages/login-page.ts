// LoginPage — M01.F04.I03 账号密码登录（独立布局：登录页绕过 AppShell）。
// 移植自 saas-identity-platform-react/src/pages/LoginPage.tsx（REQ-2026-029 T-2）。
//
// 提交：调 AuthService.sessionsLogin（orval；LoginRequest 契约 clientId required）；
// 成功后写 TenantStoreService session；失败：toast.error。
// clientId 门（B 方案 2026-09-11，对齐 vue 基准）：?client_id= ?? LOGIN_CLIENT_ID
// （值 = saas-console 自身应用，见 backend-config.ts 注）。
//
// SSO 返回（OAuth 2.0 授权码模式，RFC 6749）：URL 带 ?code=&redirect_uri=&state=
// （lab RP 经 /api/auth/sso/authorize 领 code 后跳来）。saas 认证资源所有者后，
// 302 redirect_uri?code&state（§4.1.2）原样透传给 RP。镜像 saas-nextjs app/login。
// 2026-09-24 race fix 与 5.108⑤ 的 URL 字面判定纪律在本文件原样保留。
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { AuthService } from "../../api/endpoints/auth/auth.service";
import { OauthService } from "../../api/endpoints/oauth/oauth.service";
import {
  getApiMode,
  getSelectedBackend,
  LOGIN_CLIENT_ID,
} from "../../api/backend-config";
import { toApiError } from "../../api/api-error";
import { TenantStoreService } from "../../state/tenant-store.service";
import { BackendBadge } from "../app-shell/backend-badge";
import { ToastService } from "../ui/toast.service";

interface OauthReturn {
  redirectUri: string;
  code: string;
  state: string;
}

@Component({
  selector: "app-login-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    BackendBadge,
  ],
  templateUrl: "./login-page.html",
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }
      .lp-wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: linear-gradient(135deg, #f1f5f9, #ffffff, #e2e8f0);
      }
      .lp-card {
        width: 100%;
        max-width: 420px;
      }
      .lp-card mat-card-title {
        font-size: 1.05rem;
      }
      .lp-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .lp-form mat-form-field {
        width: 100%;
      }
      .lp-footer {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #e2e8f0;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .lp-demo {
        border: 1px solid #fde68a;
        background: #fffbeb;
        border-radius: 6px;
        padding: 0.75rem;
        font-size: 0.75rem;
        color: #92400e;
      }
      .lp-demo p {
        margin: 0 0 0.5rem;
        font-weight: 500;
      }
      .lp-demo ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .lp-demo code {
        font-family: monospace;
        background: #fff;
        border: 1px solid #fde68a;
        border-radius: 4px;
        padding: 0 4px;
      }
      .lp-mode-label {
        font-size: 0.75rem;
        color: #94a3b8;
        margin: 0 0 0.25rem;
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly router = inject(Router);
  private readonly store = inject(TenantStoreService);
  private readonly auth = inject(AuthService);
  private readonly oauth = inject(OauthService);
  private readonly toast = inject(ToastService);

  readonly username = signal("");
  readonly password = signal("");
  readonly submitting = signal(false);

  // B 方案：clientId 取 ?client_id= ?? LOGIN_CLIENT_ID（saas-console 自身应用）。
  // 禁 fallback 到 demo 字面量（ADR-0019）——常量即本应用自标识，非猜值。
  readonly loginClientId = computed(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("client_id");
    return fromUrl || LOGIN_CLIENT_ID;
  });

  readonly apiMode = getApiMode();

  // RFC 6749 §4.1.1 授权码范式：lab 后端（confidential client）已替浏览器领到
  // code，saas 登录页只负责认证资源所有者，成功后 302 redirect_uri?code&state。
  readonly oauthReturn = signal<OauthReturn | null>(this.parseOauthReturn());

  /** 解析 OAuth 2.0 authorize 回跳：?code=&redirect_uri=&state=。
   *  用 window.location.search 直接读，不依赖路由的 query 时序。 */
  private parseOauthReturn(): OauthReturn | null {
    const sp = new URLSearchParams(window.location.search);
    const code = sp.get("code");
    const redirect = sp.get("redirect_uri");
    if (code && redirect) {
      return { redirectUri: redirect, code, state: sp.get("state") ?? "" };
    }
    return null;
  }

  constructor() {
    // RFC 6749 §4.1.2：授权码回跳不依赖 onSubmit——资源所有者已登录
    // （saas session 已在）时无需再认证，解析出 code+redirect_uri 即刻回跳。
    // 否则已登录用户落在登录页没表单可提交，code 永远回不到 RP。
    const ret = this.oauthReturn();
    if (ret) {
      this.redirectWithCode(ret.redirectUri, ret.code, ret.state);
      return;
    }
    // 2026-08-29 OAuth 跳板：lab RP 跳过来 ?redirect_uri=&state=&client_id=
    // （无 ?code=，lab 后端不再代理调 saas authorize），已登录用户主动调
    // saas /api/v1/oauth/authorize 拿 code 跳回 RP。
    // 2026-09-24 race fix：直接用 URL 字面判定（不依赖 signal 更新时序）。
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("code") && sp.get("redirect_uri")) return; // code 回跳——上面接管
    const redirectUri = sp.get("redirect_uri");
    const state = sp.get("state") ?? "";
    const clientId = sp.get("client_id") ?? "";
    if (!redirectUri || !clientId) return; // 非 OAuth 跳板 URL
    if (!this.store.isAuthenticated()) return; // 未登录，显示表单让用户输密码
    void this.authorizeAndRedirect(redirectUri, clientId, state);
  }

  /** 用 saas session 领授权码并回跳 RP；失败留在登录页（用户可重试输密码）。 */
  private async authorizeAndRedirect(
    redirectUri: string,
    clientId: string,
    state: string,
  ): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.oauth.oAuthAuthorize({
          clientId,
          redirectUri,
          responseType: "code",
          scope: "lab.read lab.write",
          state,
        }),
      );
      this.redirectWithCode(redirectUri, res.code, state);
    } catch (err) {
      console.error("[SSO/login] oauth authorize failed:", err);
    }
  }

  private redirectWithCode(redirectUri: string, code: string, state: string): void {
    try {
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      if (state) target.searchParams.set("state", state);
      window.location.href = target.toString();
    } catch (err) {
      console.error("[SSO/login] oauth redirect build failed:", err);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    try {
      const res = await firstValueFrom(
        this.auth.sessionsLogin({
          username: this.username(),
          password: this.password(),
          clientId: this.loginClientId(),
        }),
      );
      const { accessToken, refreshToken } = res;
      if (!accessToken || !refreshToken) {
        this.toast.error("登录响应缺少 token，请联系管理员");
        return;
      }
      this.store.login({
        accessToken,
        refreshToken,
        userId: res.user?.id ?? "",
        username: this.username(),
        email: res.user?.email,
        currentTenantId: res.availableTenants?.[0]?.tenantId ?? "",
      });
      // OAuth 2.0 code 回跳 / 跳板判定（与构造函数 hydrate 分支同款守卫，
      // URL 字面直接判——2026-09-24 race fix / 5.108⑤ 纪律：URL 已带 code 时
      // 只走 oauthReturn 分支回跳，禁止对同一 URL 二次领码）。
      setTimeout(() => {
        const ret = this.oauthReturn();
        if (ret) {
          this.redirectWithCode(ret.redirectUri, ret.code, ret.state);
          return;
        }
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("code")) return;
        const redirectUri = sp.get("redirect_uri");
        const state = sp.get("state") ?? "";
        const clientId = sp.get("client_id") ?? "";
        if (redirectUri && clientId) {
          void this.authorizeAndRedirect(redirectUri, clientId, state);
          return;
        }
        void this.router.navigate(["/tenants"]);
      }, 0);
    } catch (err) {
      const apiErr = toApiError(err);
      // M01.F04.I02 - 423 = 失败 5 次锁定（后端 15min 自动解锁）
      const msg =
        apiErr.status === 423
          ? "账号已被锁定，请 15 分钟后再试"
          : apiErr.status === 401
            ? "用户名或密码错误"
            : apiErr.status === 0
              ? // 显示实际请求目标（选择器可切，env 标签会误导）：未选择 = env 默认
                `后端不可达（${getSelectedBackend() || `${this.apiMode}·env 默认`}）：${apiErr.message}`
              : apiErr.message;
      this.toast.error(msg);
    } finally {
      this.submitting.set(false);
    }
  }
}
