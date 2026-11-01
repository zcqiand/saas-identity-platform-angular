# REQ-2026-029 参照 react 仓全量同步前端功能到 angular 仓

| 项 | 值 |
|---|---|
| 提出人 | 用户（原话：「参考react，同步所有前端功能吧」） |
| 提出日期 | 2026-10-31 |
| 优先级 | P1 |
| 状态 | 开发中 |
| 关联 ADR | —（前置：REQ-2026-027 骨架首航） |

## 1. 需求描述

> 用户原话：「参考react，同步所有前端功能吧」

把 `saas-identity-platform-react` 的全部前端功能 1:1 移植到本仓：8 页面 / 13 F（M00 租户管理 5F + M01 用户管理 4F + M04 应用管理 4F），含登录（密码 + OAuth client 流）、租户切换、RBAC 守卫、菜单树管理。

### 澄清记录

| 疑问 | 澄清结论 | 澄清人 | 日期 |
|---|---|---|---|
| UI 底座用什么替代 radix/shadcn | Angular Material（人裁 2026-10-31） | 用户 | 2026-10-31 |
| 测试链是否跟 react 同标准真化 | 真化（global-setup 起真 nextjs :5101 + 种子 PG + 真 JWT，同 react 仓；gate L4 依赖 live 栈） | 用户 | 2026-10-31 |
| 执行顺序 | saas-angular 先行（验证移植架构）→ lab-angular 复刻 | Claude 判断，用户默认 | 2026-10-31 |

技术栈映射（react → angular）：orval `react-query` client → `angular` client（@orval/angular 7.21，HttpClient+Observable 服务）；@tanstack/react-query → @tanstack/angular-query（queryKey 形状保持 orval op 名前缀）；radix/shadcn → Angular Material；sonner → MatSnackBar；react-router 守卫 → Router canActivate；Context → signals 服务；dnd-kit 无（saas 不用）。

## 2. 验收标准

| 编号 | 场景（给定） | 操作（当） | 预期（则） |
|---|---|---|---|
| AC-1 | 本仓 gate（live 栈活着） | `python scripts/gate.py -p saas-identity-platform-angular` | exit 0，L0-L5 全绿 |
| AC-2 | trace.json | fnReporter 产出 | 13 F 全部有测试锚（fnTest 挂 ID），无 skip/xfail 挂 ID |
| AC-3 | API 面 | 检查 src/api/endpoints/ | 100% orval 生成物（input=../saas-identity-platform-shared/generated/openapi/openapi.yaml，tags-split+clean），手写件只在 src/api/ 根 |
| AC-4 | 页面清单 | 对照 react 仓 src/pages/ | 8 页面 + 登录/OAuth 流 + 租户切换 + 后端切换全部有 angular 等价路由与组件 |
| AC-5 | 真化测试 | 起 live 栈跑 `ng test` | 与 react 仓同标准：种子 DB + 真 JWT + 真 HTTP，断言锚种子行固定 id |

## 3. 任务拆解

| 任务 ID | 任务描述 | 类型 | 负责人 | 预估 | 状态 |
|---|---|---|---|---|---|
| T-1 | W0 基建：deps（Material/CDK X15 槽首装 + angular-query + orval）出 endpoints/、HTTP 拦截器（Bearer+401）、tenant/selection signals 状态、路由+守卫+AppShell、backend-config 移植 | 开发 | Claude | — | 完成 |
| T-2 | W1 页面移植 ×8（tenant-list / user-list / role-list / role-menu-grant / tenant-applications / app-list / menu-tree / login）+ 壳层回归（sidebar 高亮/面包屑/whoami/tenant-switcher/require-auth），70 测试真链全绿 | 开发 | Claude | — | 完成 |
| T-3 | 测试真化链：global-setup（seed-db 灌 saas_test + 复用 nextjs :5101 + jose 铸真 JWT + 五步探活），zoneless+jsdom 指纹（TestHost+native input/信号） | 开发 | Claude | — | 完成 |
| T-4 | 收官：树状态推进（规划→开发中 mirror 免批 ×64 已落 2026-11-01；开发中→已上线 GA 批 ×50 已随人工验收通过另批）、gate 全绿、handoff | 收口 | Claude | — | 完成 |

## 4. 功能影响（需求与功能对齐的唯一位置）

| 功能 ID | 功能名称 | 影响类型 | 说明 | 关联任务 |
|---|---|---|---|---|
| M00.F01-F05 | 租户管理 5F | 变更 | 状态 规划→已上线（随实现推进） | T-1/T-2 |
| M01.F01-F04 | 用户管理 4F | 变更 | 同上（F04 含 OAuth client 流） | T-1/T-2 |
| M04.F01-F04 | 应用管理 4F | 变更 | 同上 | T-1/T-2 |

## 5. 流程影响

无（前端移植，不改后端流程）。

## 6. 风险与回滚

| 风险 | 影响面 | 缓解 | 回滚方式 |
|---|---|---|---|
| Angular unit-test builder 对 global-setup/真链支持未知 | T-3 | 先 spike 验证 builder 的 vitest 配置通道；不通则用 setup 文件内幂等单例起链 | 测试基建独立提交，可单独回退 |
| Material 与 zoneless 兼容边角 | 全局 | 首页移植即验证，动画用 provideAnimationsAsync | 逐页可独立回退（页面级 commit） |
| mold 托管文件漂移（app.config.ts/angular.json/styles.css 需改） | --sync 警告 | 漂移随批注释说明，sync_always 三锚文件不碰 | git revert 页面级 commit |

## 7. 收官记录（2026-11-01）

- **人工验收：通过**（2026-11-01 人裁）。八页 + 壳层 14 文件 70 测试真链全绿，gate exit 0（66 条目引用完整）。GA 翻转批（50 ID 开发中→已上线，镜像 react 已上线状态）据此走 tree_change mirror 免批。
- **偏差一（追认不移植）**：react `tests/unit/oauth-client.test.ts` 不移植——其被测对象 `src/lib/oauth-flow.ts` 在 react 仓为零消费者的测试-only 死代码；angular 登录链仅接 oAuthAuthorize + token 兑换，无 refresh_token grant 接线（grep 实证），故 M04.F03.I03「令牌刷新」不登记进 angular 树。人裁追认 2026-11-01。
- **偏差二（人裁废弃）**：M01.F04.I07「登出（全局 SSO）」跟随 react 裁「已废弃」（人裁 2026-11-01；废弃不属 mirror 免批类，随本批人工批准通道落树）。
- 保持「开发中」（镜像 react 非已上线状态）：M00.F02.I06 邀请成员 / M00.F02.I07 接受邀请 / M01.F01 / M00.F04.I02 等以 react 树实况为准；仍「规划」2 条 = M00.F02.I07、M01.F04.I07（随废弃批转出）。
