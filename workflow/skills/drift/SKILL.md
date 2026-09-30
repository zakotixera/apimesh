---
name: drift
description: 对 apic drift 报告逐条做语义裁决，结合新捕获与既有 canonical 区分破坏性、非破坏性和噪声，并在要求应用时更新 canonical。用户要求分析新旧响应差异、判断兼容性、处理漂移报告或应用漂移补丁时使用；首次导入抽取稿用 classify，完整导入链用 pipeline。
---

# drift · 漂移裁决

基于录制证据裁决漂移。CLI 输出机械差异，本 skill 解释影响；报告中的 `kind` 是建议，不是已确认的兼容性结论。

## 输入与范围

1. 读 [共享契约](../references/contracts.md) 和本次 `.reports/drift-*.json`；从请求确定用户要分析、补丁建议还是直接应用。分析请求只输出裁决，不改 canonical 或版本。
2. 读对应 definition、examples、`glossary.json`、`collection.json`。需要落库时读 [classify](../classify/SKILL.md) 的合并规则与兼容性限制。
3. 找到产生报告的新捕获及其已打码 YAML。报告只有差异摘要，不能替代录像；没有帧证据时不编造 example、捕获时间或响应 body。
4. 没有报告但用户提供 HAR 时，从 `workflow/cli` 使用 `npm run apic -- drift <实际 HAR 路径列表>`；没有构建先按 [pipeline](../pipeline/SKILL.md) 准备。需要抽取证据时调用 extract，遵守 manifest 保护与批次范围。

## 理解当前报告

当前结构定义在 `workflow/cli/src/lib/types.ts` 的 `DriftReport` / `DriftChange`：顶层有 `command`、`baseline`、`changes`、`breaking`、`nonBreaking`、`noise`；每条 change 有 `api`、`kind`、`summary`、`detail`。`baseline` 当前记录输入 HAR 文件名，不是旧 canonical 版本标识；应核对报告对应的 canonical 是否仍是当前版本。

报告不是冻结的公共 schema；以本地实现为准。CLI 发现差异也可返回退出码 0，且没有 change 不代表不存在语义变化。它按 method/path 与 HTTP/code 机械匹配；混合业务码和 HTTP-only 的语义变体、值变化以及缺失 / 二进制 body 都可能需要额外核查。

## 逐条裁决

| 裁决 | 证据要求 | 处置 |
|---|---|---|
| 破坏性 | 已有语义或消费者依赖的类型 / 行为确实不再成立 | 指明受影响 variant / 字段 / 消费者及证据，给出迁移补丁；应用时同步版本和 changelog |
| 非破坏性 | 已有语义仍成立，只新增观测壳、样例、接口或兼容字段 | 按 classify 合并，保留原 slug 与历史观测；新壳即使被 CLI 标为 breaking，也可据证据重新裁决 |
| 噪声 | 与契约无关的值抖动，或单次样例缺字段且无必填依据 | 不删原 schema 字段，不改 canonical；必要时记录需改进的机械规则 |

BodyNode 没有 required-field 契约，因此一次字段缺失不能证明破坏性删除；新失败面也不自动意味着破坏性。类型变化需排除捕获缺失、错误页、不同语义变体等原因，并区分真实替换与历史未覆盖的类型并集。证据不足的条目写「待裁决」和所缺材料，不硬塞进三分类，不 bump 版本。

## 应用补丁

1. 只应用有证据且在用户任务范围内的裁决，修改 `apis/**` / 必要的 `glossary.json`；遵守 classify 的命名、公共 headers、bodyMeta 阻塞、冲突及 unclassified 处理。
2. 对确认的破坏性变更更新 `collection.json.version`，追加 `{version, date, notes}` 到 changelog，保留旧条目。版本增量遵循仓库已有发布策略或用户目标；缺少约定时明确提出建议，不能从 CLI 的 `breaking` 计数直接决定版本。
3. 需要时更新相关 notes。独立应用时运行 validate → render --all → 两次渲染稳定性检查 → test；交由 pipeline 执行时注明待运行闸门，不重复执行。具体命令见 pipeline。

## 输出与完成条件

交付逐条裁决表：`api / variant / 字段`、原 `kind`、最终裁决（或待裁决）、证据、拟改或已改文件。再列版本处理、验证结果及未决项。

分析模式以完整裁决和清楚的不确定性结束；应用模式须补丁已落库、相关闸门通过、未决项有交接。缺证据时可交付部分结果，但不能声称漂移已全部解决。`.reports/` 报告只读，更新报告只能调用 CLI；不把裁决手写回报告。
