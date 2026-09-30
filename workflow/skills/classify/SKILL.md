---
name: classify
description: 将 apic extract 的 YAML 抽取结果合并为 apis/ 下的规范定义与样例，维护 glossary 的语义命名。用于响应分类、变体合并和未分类观测处理；完整 HAR 导入使用 pipeline，漂移评估使用 drift。
---

# classify · 语义分类

将已脱敏的观测整理为规范数据（canonical）。变体以语义 slug 标识，HTTP 状态码和业务码用于辅助分类；相同数值在不同接口中可能具有不同含义。

## 开始前

1. 阅读 [共享契约](../references/contracts.md)，按路径约定定位仓库根目录。
2. 确认用户指定的 YAML 文件或 pipeline 提供的抽取目录。未指定时检查 `.raw/`，区分本次输入与历史抽取结果。
3. 阅读相关 definition、引用的 examples、`glossary.json`、`collection.json` 及 definition、example schema。文档示例与 schema 或校验器不一致时，报告差异及其影响。

## 输入与输出

抽取结果包含 `version: 1`、`generated_from`、`endpoints[]`；每个 endpoint 包含 `method`、`path`、`frames[]`。每帧包含 `http`、`code`、`captured`、可选 `origin`、`account`、`request`、`response`。以内容中的 method/path 确定端点。body 表示方式与限制见 [CLI 文档](../../cli/README.md)。

仅写本次涉及的：

- `apis/<static path>/definition.json`
- `apis/<static path>/examples/<http>.<codeN|http-only>.<variant>[.<recording-id>].json`
- `glossary.json` 中有证据支持的新语义域

例如 `/catalog/items` 对应 `apis/catalog/items/`；`ok` 变体的 HTTP 200、业务码 0 样例名为 `200.code0.ok.json`。文件名第三段与 variant 保持一致。

## 分类与合并

1. **检查导入兼容性。** 保留脱敏标记、捕获时间、请求、响应与 body 表示。schema 支持 `request.bodyMeta` / `response.bodyMeta`；保留 JSON 文本和元数据，不转换或丢弃。缺失 body、未捕获的文件上传或不可回放的表示保留在抽取目录，按共享契约报告未决原因。请求 method 和 URL pathname 必须与 definition.endpoint 一致。
2. **解析分类信号。** 对照帧 `code` 与响应 body。CLI 优先读取有限数字 `code`，其次读取有限数字 `errno`，否则返回 `null`。schema 要求业务码为整数；类型不支持或冗余值不一致时报告，不强制转换字符串码。仅 `null` 使用 `http-only`。JSON 文本可解析用于分析，存储值保持原样。
3. **匹配已有变体。** 结合端点上下文、响应消息、结构和既有 examples，检查该接口的 `responses[]`。确认语义一致后合并；HTTP 状态码、业务码和 glossary 数值提示不能单独确定语义。
4. **维护 glossary。** 没有对应变体时，参考 `known-codes`、`http-shapes` 和 `meaning`。有证据支持新语义时添加必要的 glossary 域，再引用其 slug；接口特有说明保留在 variant 的 `status` 中。
5. **合并已确认观测。** 保留已有 slug、API 标识与历史观测。将新增 code 和 HTTP 状态追加到 `codes[]` / `http[]` 并去重，保留语义顺序。`examples[]` 按捕获时间排列，每个样例文件恰好由一个 variant 引用。
6. **描述观测结构。** `request.query` / `request.body` 的参数使用 `{type, required, default, desc}`；headers / cookies 使用名称到字符串值的映射。`default` 表示观测值；参数必填性和鉴权要求需有独立依据，证据不足时省略可选声明并说明。响应 `schema` 使用 BodyNode 类型树，不包含 `const` / `default` / `desc`；多类型观测使用类型并集，空数组使用 `items: null`，无法确定可信 body 结构时使用 `schema: null`。变体 headers 仅保留所有引用样例中键值均一致的响应头。

同一语义可以对应不同的状态码组合。例如，已确认的「条目不存在」分别表现为 HTTP 200 + `code: 1004` 和 HTTP 404 + 无业务码时，可归入同一个 `not-found`，使用 `codes: [1004]`、`http: [200, 404]`，分别引用 `200.code1004.not-found.json` 与 `404.http-only.not-found.json`。

## 歧义与模型限制

- **未分类观测：** 证据不足时保留原抽取结果，列出 method/path、文件、捕获时间、HTTP/code、已知证据、缺失信息及下一步。`unclassified` 是处理状态，不是预设 glossary slug；schema 未定义独立的 `flag` 字段。已确认部分可以导入，结果标记为「部分完成」。
- **重复录制：** 相同 endpoint / HTTP / code / variant 可保留多个样例。已有记录与新帧相同则复用；不同时使用稳定的 `.recording-id` 后缀（小写字母、数字和连字符，例如脱敏帧的内容摘要），保留原文件名并添加引用。避免覆盖、顺序重编号或为文件名改变语义 slug。后缀仍冲突时保留两份输入并报告。
- **端点冲突：** 每个目录只能包含一个 definition。同路径不同 method、不同 host 且语义不同，或动态路径无法映射到静态路径时，保留输入并报告建模限制，不覆盖已有定义或改写请求路径。
- **输入保护：** 保持 `sources/`、抽取结果和 manifest 不变。任意文本或二进制可能仍含未脱敏信息；发现时保留待处理状态，避免复制到规范数据或交接内容。

## 校验与交接

按共享契约格式保存。独立调用时，从 `workflow/cli` 运行 `npm run apic -- validate`；由 pipeline 调用时交由其执行校验。修复本次引入的错误，报告已有错误和警告；保留有效样例、校验规则及 CLI 生成的报告。

交接内容包括变更文件与接口、分类依据、复用或新增的 slug、未导入帧及原因，以及校验结果或待运行状态。校验通过说明已导入数据通过检查；所有目标帧均已处理且无未决项时，才报告分类完成。
