# apimesh

[English](README.md) | **简体中文**

由 Agent 辅助维护 HTTP 录制数据、构建规范数据模型并生成可复现产物的工作流。

## 设计目标

- 使用统一的规范数据源生成文档、Agent 参考资料和回放测试数据。
- 保留录制的请求、响应及元数据，作为分类与说明的依据。
- 为已观测的成功和失败结果维护稳定的语义标识。
- 由 Agent skills 负责语义分析，由确定性工具负责数据处理。
- 将人工参与集中在录制和审阅环节。
- 保持生成结果可复现、变更可审查。

## 架构

| 组件 | 职责 | 输出 |
|---|---|---|
| 人工 | 录制流量、审阅变更 | HAR 录制文件、审阅结论 |
| Agent skills | 分析观测结果、维护规范数据、编排流程 | 定义、样例、说明、元数据更新 |
| `apic` CLI | 抽取、脱敏、去重、校验、渲染、比较、回放 | 抽取稿、报告、面向不同使用方的产物 |
| CI | 构建、测试、校验、产物一致性检查、回放 | 验证结果 |

### 数据模型

| 概念 | 用途 |
|---|---|
| Canonical（规范数据源） | 持续维护的 JSON 定义与样例，供所有渲染器使用 |
| Collection（合集） | 标识、版本、来源地址、占位符声明、变更历史 |
| Glossary（词汇表） | 统一的语义名称与分类提示 |
| Definition（定义） | 请求描述及已观测的响应变体 |
| Variant（变体） | 稳定的语义标识（slug）、已观测的状态码与业务码、样例引用 |
| Example（样例） | 脱敏后的请求、响应及采集元数据 |
| Notes（说明） | 基于录制数据的可选说明 |

### 约束

- Agent skills 维护规范数据，CLI 生成面向不同使用方的产物。
- 渲染过程不依赖 Agent 推理。
- 相同输入生成的文件集合及文件内容逐字节一致。
- 变体以 slug 标识语义，状态码与业务码仅表示观测值。
- 词汇表提供命名参考，定义中的变体条目确定样例归属。
- 暂不支持或存在歧义的观测结果保留为待处理项，并注明原因。

## 工作流

| 阶段 | 执行者 | 结果 |
|---|---|---|
| 1. 录制 | 人工 | HAR 原始录制文件 |
| 2. 抽取 | `apic extract` | 脱敏、分组、去重后的 YAML 抽取稿 |
| 3. 分类 | `classify` skill | 规范数据源中的定义与样例 |
| 4. 校验 | `apic validate` | Schema、标识、引用与一致性检查 |
| 5. 渲染 | `apic render --all` | 文档、Agent 参考资料、Postman 合集 |
| 6. 稳定性验证 | 重复渲染并比较 | 文件集合及内容一致性检查 |
| 7. 回放 | `apic test` | 基于本地录制数据的 Newman 断言结果 |
| 8. 审阅 | 人工与 CI | 变更审阅结论与自动检查结果 |

| Skill | 职责 |
|---|---|
| [`pipeline`](workflow/skills/pipeline/SKILL.md) | 编排流程、处理失败、整理审阅材料 |
| [`classify`](workflow/skills/classify/SKILL.md) | 按语义分类，将结果合并至规范数据源 |
| [`notes`](workflow/skills/notes/SKILL.md) | 按需编写基于录制数据的说明 |
| [`drift`](workflow/skills/drift/SKILL.md) | 分析 `apic drift` 差异报告，按任务要求更新规范数据源 |

### 异常处理

- 校验错误：定位并修复对应组件或数据，重新运行受影响的检查。
- 警告：保留在审阅材料中。
- 存在歧义或暂不支持的观测结果：保留抽取稿并说明原因。
- 部分导入：分别列出已导入记录与待处理记录。
- 数据漂移：应用更新前，区分破坏性变更、兼容性新增、无关波动和待确认差异。

## 开发

环境要求：Node.js **20+**、npm；语义分析阶段需要由 Agent 按仓库中的 skill 指令执行。

从仓库根目录运行：

```sh
cd workflow/cli
npm ci
npm run build
npm run apic -- --help
```

在 `workflow/cli` 目录中运行 CLI 检查：

```sh
npm run typecheck
npm run test:local
```

### 变更检查

| 变更类型 | 检查与同步要求 |
|---|---|
| 规范数据 | 校验、渲染、渲染稳定性验证、回放、审阅 |
| CLI | 构建、运行相关测试及受影响的后续检查 |
| 数据格式 | 同步更新 Schema、校验器、受影响的 skills 及数据使用方 |
| 产物生成逻辑 | 修改规范数据源或渲染器后重新生成 |
| 项目文档 | 保持中英文 README 内容一致 |

验证范围：数据结构一致性、生成结果可复现性、已提交产物与规范数据源的一致性，以及录制数据回放。回放检查不覆盖线上服务可用性或未录制的行为。

## 项目结构

| 路径 | 用途 |
|---|---|
| `workflow/skills/` | 语义分析与流程编排指令 |
| `workflow/cli/` | TypeScript 执行器、渲染器、回放服务、测试 |
| `schema/` | 规范数据的 JSON Schema |
| `collection.json`、`glossary.json` | 共享元数据与词汇表 |
| `sources/` | HAR 原始录制文件 |
| `apis/` | 规范数据源中的定义、样例与说明 |
| `.raw/`、`.reports/` | 临时抽取稿与诊断信息 |
| `dist/` | 面向不同使用方的生成产物 |
| `workflow/cli/dist/` | CLI 编译结果 |
| `.github/workflows/` | CI 配置 |

## 文档

- 工作流：[执行层](workflow/README.md)、[Agent skills](workflow/skills/README.md)。
- 工具：[CLI 用法与限制](workflow/cli/README.md)、[CI](.github/workflows/ci.yml)。

## 许可证

[Apache License 2.0](LICENSE)。
