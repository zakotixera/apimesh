# apimesh

[English](README.md) | **简体中文**

可被其他项目 vendoring 的工具链，由 Agent 辅助维护 HTTP 录制数据、构建规范数据模型并生成可复现产物。

应用将 apimesh 固定在 `vendor/apimesh/`，元数据、录制、规范 API 和生成产物归应用根目录所有。[ARCHITECTURE.md](ARCHITECTURE.md) 集中说明职责边界、路径解析和产物契约。

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

## 开发与使用

创建应用 API 集合请阅读 [vendoring 与开发指南](DEVELOPMENT.md)。要求 Node.js **20+**、npm，以及能遵循工作流 skills 的 Agent。

在工具链的 `workflow/cli` 目录执行：

```sh
npm ci
npm run build
npm run apic -- --help
npm run typecheck
npm test
```

应用安装并构建其固定版本后，从应用根目录运行：

```sh
node vendor/apimesh/workflow/cli/dist/cli.js --root . validate
node vendor/apimesh/workflow/cli/dist/cli.js --root . render --all
node vendor/apimesh/workflow/cli/dist/cli.js --root . test
```

CLI 从自身安装目录加载 schema；省略 `--root` 时从当前目录向上发现集合。HAR 和显式 `--out` 路径相对于当前工作目录，默认产物相对于集合根目录。回放交互模式使用 `serve` 命令。

CI 验证临时合成集合和 vendoring 集成，无需真实应用数据。可在 `workflow/cli` 运行 `npm run test:har -- "/absolute/path/to/capture.har"` 检查真实 HAR 的处理与回放兼容性；该检查不执行语义分类或导入。

| 变更 | 必要检查 |
|---|---|
| 规范数据 | 校验、渲染、重复渲染检查稳定性、回放和审阅 |
| CLI | 构建、相关测试和受影响的下游检查 |
| 数据格式 | 同步更新 schema、校验器、skills 和消费者 |
| 生成行为 | 修改输入或渲染器，再重新生成 |
| 项目文档 | 保持中英文 README 一致 |

验证范围为结构一致性、可复现性、已提交产物同步和录制行为回放；不验证线上可用性或未观测行为。

## 项目结构

| 路径 | 职责 |
|---|---|
| `workflow/skills/` | 语义工作与流程编排 |
| `workflow/cli/` | TypeScript CLI、渲染器、回放服务与测试 |
| `workflow/templates/` | 经过 schema 校验的空集合元数据 |
| `schema/` | 规范数据 JSON Schema |
| `ARCHITECTURE.md` | 应用集合布局、产物契约和职责边界 |
| `workflow/cli/dist/` | 编译后的 CLI |
| `.github/workflows/` | 工具链 CI |

## 文档

- [从零建立 apimesh-bilishow：中文操作指南](DEVELOPMENT.zh-CN.md)。
- [执行层](workflow/README.md)、[skills](workflow/skills/README.md)。
- [CLI 使用与限制](workflow/cli/README.md)、[CI](.github/workflows/ci.yml)。

## 许可证

[Apache License 2.0](LICENSE)。
