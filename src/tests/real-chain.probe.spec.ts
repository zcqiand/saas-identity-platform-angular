// 真链路探针（REQ-2026-029 T-3，工程设施测试——不挂业务 ID）。
// 验证 angular 测试栈的全链路桥：globalSetup 种子 + 真 :5101 + 真 JWT →
// localStorage 契约 key → TenantStoreService hydrate → authInterceptor 取
// Bearer → orval MeService → 真后端 /api/v1/me 200。
// 任何一环断，先于所有页面测试红——这是页面测试的地基。
import { TestBed } from "@angular/core/testing";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideTanStackQuery, QueryClient } from "@tanstack/angular-query";
import { firstValueFrom } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";

import { installRealChain, SEED } from "../../tests/helpers/real-chain";
import { TenantStoreService } from "../state/tenant-store.service";
import {
  apiBaseUrlInterceptor,
  authInterceptor,
  unauthorizedInterceptor,
} from "../api/interceptors";
import { MeService } from "../api/endpoints/me/me.service";

describe("真链路探针（工程设施，无 fn ID）", () => {
  beforeEach(() => {
    installRealChain();
  });

  it("meWhoami 经 拦截器+orval+真后端 返回种子 alice", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            apiBaseUrlInterceptor,
            authInterceptor,
            unauthorizedInterceptor,
          ]),
        ),
        provideTanStackQuery(() => new QueryClient()),
      ],
    });
    const store = TestBed.inject(TenantStoreService);
    // hydrate 接桥成立：beforeEach 写的 localStorage 契约 key 被服务读到
    expect(store.accessToken()).toBeTruthy();
    expect(store.currentTenantId()).toBe(SEED.tenants[0].id);

    const me = await firstValueFrom(TestBed.inject(MeService).meWhoami());
    // CurrentUser 契约面 = id/email/memberships/currentTenantId（无 username，
    // 与 react 同款断言收紧到契约字段）
    expect(me.id).toBe(SEED.users[0].id);
  });
});
