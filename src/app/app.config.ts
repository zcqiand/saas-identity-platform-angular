import { ApplicationConfig, provideZonelessChangeDetection } from "@angular/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { provideTanStackQuery, QueryClient } from "@tanstack/angular-query";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";

import { routes } from "./app.routes";
import {
  apiBaseUrlInterceptor,
  authInterceptor,
  unauthorizedInterceptor,
} from "../api/interceptors";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    // 顺序：baseUrl 前缀 → Bearer → 401 处理（同 react axios 拦截器链语义）
    provideHttpClient(
      withInterceptors([apiBaseUrlInterceptor, authInterceptor, unauthorizedInterceptor]),
    ),
    provideTanStackQuery(() => new QueryClient()),
    provideAnimationsAsync(),
  ],
};
