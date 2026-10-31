import { defineConfig } from "orval";

// orval config (in angular 仓) — generates TS api-client from shared's OpenAPI.yaml.
//
// 架构照 react 仓（REQ-2026-029 全量同步；tags-split 细节见彼处注释）：
// - mode: "tags-split" — 按 shared tsp 的 @tag 拆成多文件，schemas 抽到 model/ 子目录
// - target: 目录（不是文件）—— orval tags-split 必须 dir，不能 file
// - client: "angular"（@orval/angular）—— 产 @Injectable 服务 + HttpClient + Observable，
//   替代 react 仓的 react-query hooks；页面层 query 状态由 @tanstack/angular-query
//   包 generated 服务方法（queryKey 保持 orval op 名前缀形状，与 react 仓对齐）。
//
// 此文件 owned by angular 仓；其他前端（react / vue / nextjs）有自己独立副本。
export default defineConfig({
  saas: {
    input: "../saas-identity-platform-shared/generated/openapi/openapi.yaml",
    output: {
      mode: "tags-split",
      target: "./src/api/endpoints",
      schemas: "./src/api/endpoints/model",
      // clean：生成前清空目标目录（2026-09-17 SSOT 清理）。整个 endpoints/
      // 目录 must stay orval-owned：手写文件一律放 src/api/ 下，不得混入。
      clean: ["./src/api/endpoints"],
      client: "angular",
      override: {
        useDates: false,
      },
    },
  },
});
