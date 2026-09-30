---
name: classify
description: 将 apic extract 的 YAML 抽取稿合并为 apis/ 下的 canonical 定义与样例，维护 glossary 的语义命名。用户要求分类响应、合并变体或处理 unclassified 时使用；完整 HAR 导入链交给 pipeline，漂移报告裁决交给 drift。
---

# classify · 语义分类

把已打码的观测整理成可验证的 canonical（W3）。变体以语义 slug 为主键，HTTP / 业务码只是观测信号；相同数字在不同接口可能含义不同。

## 开始前

1. 读 [共享契约](../references/contracts.md)，按其中的路径约定定位仓库根。
2. 确定用户指定的 YAML 文件或 pipeline 传入的抽取目录。没有指定时检查 `.raw/`，只处理本次范围，避免把历史稿当成新捕获。
3. 读相关 definition、已挂载 examples、`glossary.json`、`collection.json`，以及 `schema/definition.schema.json`、`schema/example.schema.json`。字段含义与分类规则见下文「分类与合并」；若文档示例与 schema / validator 冲突，报告冲突，不照抄示例。

## 输入与输出

抽取稿是 `version: 1`、`generated_from`、`endpoints[]`；每个 endpoint 有 `method`、`path`、`frames[]`。每帧含 `http`、`code`、`captured`、可选 `origin`、`account`、`request`、`response`。以内容里的 method/path 为准，不从文件名猜接口。body 表示与限制见 [CLI 文档](../../cli/README.md)。

仅写本次涉及的：

- `apis/<static path>/definition.json`
- `apis/<static path>/examples/<http>.<codeN|http-only>.<variant>.json`
- `glossary.json` 中有证据支持的新语义域

例如 `/x/web-interface/view` 对应 `apis/x/web-interface/view/`；`ok` 变体的 HTTP 200、业务码 0 样例名为 `200.code0.ok.json`。第三段必须等于 variant，不能另起 `normal` 之类的别名。

## 分类与合并

1. **先检查是否可落库。** 保留打码、捕获时间、请求、响应与 body 表示。当前 example schema 不接受 `request.bodyMeta` / `response.bodyMeta`；遇到这些帧，保留抽取稿并报告兼容性阻塞，不删 metadata、不把文本 JSON 改成对象、不转存到渲染器不识别的 `x-` 字段来绕过校验。兼容性需另行修复 schema 与消费链后才能导入；无该问题的帧可以继续。
2. **解析分类信号。** 对照帧 `code` 与响应 body；CLI 按有限数字 `code`、其次有限数字 `errno` 解析业务码，否则为 `null`。JSON 文本可为分析解析，但不替换存储值。schema 要求业务码为整数；类型不支持或冗余值不一致时报告，不把字符串码强转、不把异常值猜成成功。`null` 才使用 `http-only`。
3. **找已有语义。** 对照端点上下文、响应消息、结构和既有 examples，先匹配该接口的 `responses[]`。同语义才合并，不能仅凭 HTTP 200、code 0 或 glossary 的数字提示决定。
4. **查 glossary。** 没有对应变体时，查 `known-codes` / `http-shapes` 和 `meaning`；这些是提示，不是 code → meaning 的硬映射。有清晰新语义时先添加最小 glossary 域，再引用其 slug；保留接口特有解释于 variant 的 `status`。
5. **合并已确认观测。** 保留已有 slug / api id；把新 code 和 HTTP 状态追加到 `codes[]` / `http[]` 并去重，保留语义顺序，不因一次捕获缺席就删除旧观测。挂载样例，`examples[]` 按捕获时间排列，每个文件恰好被一个 variant 引用。
6. **构建观测结构。** `request.query` / `request.body` 的参数用 `{type, required, default, desc}`；headers / cookies 是名 → 字符串值。`default` 是观测值，不是服务端默认值；单次出现不能证明参数必填或鉴权 required，缺乏证据时保守省略并在交接中说明。响应 `schema` 用 BodyNode 类型树，不放 `const` / `default` / `desc`；多类型观测用类型并集，空数组 `items: null`，body 不可信用 `schema: null`。变体 headers 只保留所有挂载样例中键值均一致的公共头。

同语义跨壳示例：已确认的「稿件不存在」分别表现为 HTTP 200 + `code: -404` 和 HTTP 404 + 无业务码，仍可归入同一个 `not-found`，`codes: [-404]`、`http: [200, 404]`，分别挂载 `200.code-404.not-found.json` 与 `404.http-only.not-found.json`。

## 歧义与模型限制

- **unclassified：** 证据不足时不落臆测变体、不新增无依据的 glossary 域。保留原抽取稿，在交接中列出 method/path、稿件文件、捕获时间、HTTP/code、已知证据、缺失信息及下一步。`unclassified` 是处理状态，不是默认存在的 glossary slug；也没有裸 `flag` 字段。已确认部分可落库，但报告「部分完成」。
- **文件名冲突：** 同 endpoint / HTTP / code / variant 只能对应当前规范的一个文件名。已有记录与新帧相同则复用；不同则保留已有文件和新抽取稿，报告冲突。不要覆盖录像、加时间后缀、改 slug 来腾位置。
- **端点冲突：** 当前目录只能放一个 definition。遇到同路径不同 method、host 不同且语义不同，或无法映射到静态路径的动态段时报告建模阻塞；不覆盖接口、不擅自将 URL 路径改写为 query。
- **输入保护：** 不改 `sources/`、抽取稿或 manifest；不手写 `dist/`。抽取安全打码并不保证任意文本或二进制已脱敏，明显未打码内容不得复制进 canonical 或交接报告。

## 校验与交接

按共享契约格式保存。独立调用时，从 `workflow/cli` 运行 `npm run apic -- validate`；由 pipeline 调用时交还它执行同一闸门，避免重复运行。修复本次引入的错误，保留并说明已有错误和 warnings；不能通过删样例、改断言或手改报告让校验变绿。

输出简短交接：已改文件与接口、每个语义归类的依据、复用 / 新增的 slug、未导入帧及原因、validate 的结果或待运行状态。0 error 只说明已落库数据有效；所有目标帧均有去向且无未决项，才报告分类完成。
