# @sift/storage — 持久层 schema

Sift 的 SQLite **规范 schema(单一真源)+ 前后端共享行类型**。`migrations/*.sql` 是语言中立的真源,Rust 端(`src-tauri/infra`,rusqlite/sqlx)执行同一份 SQL;前端经 Tauri 边界使用 `src/types.ts` 的行类型。

- 迁移:`migrations/0001_init.sql`;当前版本 `SCHEMA_VERSION = 1`。
- 约定:时间戳 `INTEGER` epoch 毫秒;布尔 `INTEGER 0/1`;枚举列用 `CHECK` 约束(与 TS 字面量并集同步);凭据密文为 `BLOB`,**密钥在 OS keychain / Tauri stronghold,绝不入库**;应用每条连接须 `PRAGMA foreign_keys = ON`。
- 校验:`test/schema.test.ts` 用 `node:sqlite` 把迁移应用到内存库,实测建表、外键级联删除、`CHECK`、`UNIQUE`、`BLOB` 往返与默认值。

## 表

| 表                  | 作用                                                                                                   | 关键关系                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `rules`             | 编译后的 Rule IR(点选/书源/手写)。`ir_json` 存 @sift/core-ir 序列化 `Rule`,`ir_version` 配 `irVersion` | —                                                    |
| `tasks`             | 可运行采集任务(规则 + 入口参数 + 可选 cron)                                                            | `rule_id → rules` (CASCADE)                          |
| `runs`              | 一次执行实例(状态/起止/行数/错误)。「上次结果」按 `task_id` 取最近                                     | `task_id → tasks` (CASCADE)                          |
| `results`           | 抓取行(友好列记录 `data_json`)                                                                         | `run_id → runs` (CASCADE),`UNIQUE(run_id,row_index)` |
| `credentials`       | 加密 Cookie/Token/Header/代理;IR 的 `credentialRef`/`proxyRef` 指向此 `id`                             | —                                                    |
| `downloads`         | 下载队列(text/image/video/file),`bytes_done` 即断点续传偏移                                            | `run_id → runs` (CASCADE, 可空)                      |
| `logs`              | 运行/系统日志(info/warn/error)                                                                         | `run_id → runs` (CASCADE, 可空)                      |
| `schema_migrations` | 迁移记账                                                                                               | —                                                    |

## 与 core-ir / 设计稿的对应

- `rules.ir_json` ←→ `@sift/core-ir` 的 `Rule`;`origin`/`source_type`/`status` 即 `RuleMeta` 同名字段。`parseRuleIr(row)` 在 DB↔IR 边界把 `ir_json` 解析并用 `isRule` 校验(脏数据返回 `null`)。
- `tasks`/`runs`/`results` 支撑设计稿的**任务列表 / 数据预览**(「来自点选/规则」「上次结果」「已抓 N 条」)。
- `downloads` 支撑**下载队列**(队列/并发/暂停/续传/进度)与**已完成**。
- `credentials` 支撑**凭据管理**(本地加密、按域名、Cookie/Token/代理三态),并落实 §2 凭据原则与 §5.2④。
- `logs` 支撑**日志**屏的三级色分。

## 后续(随阶段加迁移,不破已用表)

代理 profile 目前并入 `credentials(type='proxy')`;phase-2 的调度/增量/通知、phase-3 的视频下载等,新增列或新表即可。新版本以新增 `migrations/000N_*.sql` 前进,`SCHEMA_VERSION` 递增。
