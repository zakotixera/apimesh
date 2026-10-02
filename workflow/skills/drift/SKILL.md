---
name: drift
description: 结合新捕获与既有规范数据，评估 apic drift 报告中的兼容性变化，并在用户要求应用时更新数据。用于响应差异分析、漂移报告评估和变更应用；首次分类使用 classify，完整 HAR 导入使用 pipeline。
---

# drift · 漂移评估

基于录制证据评估差异及其影响。CLI 报告中的 `kind` 是自动分类结果，需要结合上下文确认兼容性结论。

## 输入与范围

1. 阅读 [共享契约](../references/contracts.md) 和本次 `.reports/drift-*.json`，确认任务范围是分析、提出修改建议或应用变更。分析任务仅输出结论，保持规范数据和版本不变。
2. 阅读对应 definition、examples、`glossary.json`、`collection.json`。应用变更时遵循 [classify](../classify/SKILL.md) 的合并规则与兼容性限制。
3. 查找产生报告的新捕获及其已脱敏 YAML。使用录制帧核实差异摘要；缺少证据时列出所需材料，保持 example、捕获时间和响应 body 未确定。
4. 没有报告但用户提供 HAR 时，从应用根目录运行 `node vendor/apimesh/workflow/cli/dist/cli.js --root . drift <实际 HAR 路径列表>`；首次构建按 [pipeline](../pipeline/SKILL.md) 准备。需要抽取证据时调用 extract，遵守 manifest 管理规则与批次范围。

## 理解当前报告

当前结构定义在工具链的 `workflow/cli/src/lib/types.ts` 的 `DriftReport` / `DriftChange`：顶层有 `command`、`baseline`、`changes`、`breaking`、`nonBreaking`、`noise`；每条 change 有 `api`、`kind`、`summary`、`detail`。`baseline` 当前记录输入 HAR 文件名，不是旧 canonical 版本标识；应核对报告对应的 canonical 是否仍是当前版本。

报告结构以本地实现为准。CLI 发现差异时也可返回退出码 0；空 changes 仅表示当前规则未检测到差异。CLI 按 method/path 与录制样例中的 HTTP/code 组合匹配；没有样例时回退到声明数组。多个变体匹配时报告歧义，不按数组顺序猜测。值变化、缺失或二进制 body 仍需结合录制内容核查。

## 逐条评估

| 结论 | 证据要求 | 处置 |
|---|---|---|
| 破坏性 | 已有语义或消费者依赖的类型 / 行为确实不再成立 | 指明受影响 variant / 字段 / 消费者及证据，给出迁移补丁；应用时同步版本和 changelog |
| 非破坏性 | 已有语义仍成立，新增状态码组合、样例、接口或兼容字段 | 按 classify 合并，保留原 slug 与历史观测；CLI 标记与证据不一致时说明修正依据 |
| 噪声 | 与契约无关的值变化，或单次样例缺字段且无必填依据 | 保留原 schema 字段与规范数据；必要时记录检测规则的局限 |

BodyNode 未定义字段必填性，因此单次字段缺失不能证明破坏性删除；新增失败响应也需结合既有契约评估。检查类型变化时，排除捕获缺失、错误页和不同语义变体等原因，区分类型替换与新增类型观测。证据不足的条目标记为「待评估」，列出所缺材料，暂不分类或调整版本。

## 应用补丁

1. 应用有证据支持且在任务范围内的结论，修改 `apis/**` 及必要的 `glossary.json`。遵循 classify 的命名、响应头、兼容性、冲突和未分类观测处理规则。
2. 对已确认的破坏性变更更新 `collection.json.version`，向 changelog 追加 `{version, date, notes}` 并保留旧条目。版本增量依据仓库发布策略或用户目标；缺少约定时提出建议。CLI 的 `breaking` 计数仅作为评估输入。
3. 按需更新相关 notes。独立应用时执行 validate → render --all → 两次渲染稳定性检查 → test；交由 pipeline 执行时注明待运行检查，避免重复执行。具体命令见 pipeline。

## 输出与完成条件

逐条列出 `api / variant / 字段`、原 `kind`、评估结论或待评估状态、证据及拟改或已改文件。说明版本处理、验证结果和未决项。

分析任务完成时，每条差异应有结论或明确的证据缺口。应用任务完成时，变更应已保存、相关检查通过，且未决项已说明；证据不足时标记为部分完成。评估结论写入交接内容，`.reports/` 中的报告由 CLI 重新生成。
