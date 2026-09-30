---
name: notes
description: 基于接口 definition、录像 examples 和已有说明，为 apis/ 下新增或变更接口编写简短中文 notes.md。用户要求接口导读、解释成功与失败面、补充鉴权或参数坑位，或 pipeline 需要同步变更后的说明时使用；不用于分类响应、修改 canonical JSON 或编写通用项目文档。
---

# notes · 接口导读

W4 的可选说明层。让读者快速理解接口用途、已观测行为与边界；机器事实仍来自 canonical。

## 输入与范围

读 [共享契约](../references/contracts.md)，确定用户或 pipeline 指定的接口。逐个读取 definition、其引用的 examples、已有 notes，必要时查 `glossary.json` 与 `collection.json`。只改本次范围内的 `apis/<static path>/notes.md`，不改 definition、examples、glossary 或 `dist/`。

## 写作步骤

1. 对照 endpoint、auth、request 与 responses，核查每项说明能追溯到定义或样例。缺 example 时明确「尚无录像佐证」；JSON 与录像矛盾时记录并交 classify / drift，不靠散文替它们裁决。
2. 用简短中文说明用途、关键参数、鉴权与成功路径。仅解释有用信息，不复制完整参数表、JSON 或响应类型树。
3. 每个失败变体用一句话解释语义和观测码；HTTP 200 不等于业务成功。存在同语义跨 HTTP 壳时点明即可。
4. 说明有依据的坑位：参数 `default` 只是样例观测值；`schema: null` 是 body 不可信或无可用形状，不能写成保证空响应；`{{NAME}}` / `<redacted:...>` 是打码标记，不能当作可用凭证。
5. 保留仍准确的人工上下文，修正过时描述，避免整篇无差别重写。对缺少证据的必填性、登录要求、限流、重试策略或线上可用性保持未知，不从一次成功推导服务保证。

## 输出形态

每份 notes 以一屏内可读完为目标：用途一段，调用 / 鉴权一段，成功与失败面一段（变体较多时可用短列表），必要的坑位一段。没有证据的栏目可省略，不填空泛模板。遵循 UTF-8 无 BOM、LF、末尾换行。

例如有 `not-found` 的两种观测时，可写：「目标不存在时可见 HTTP 200 + code -404，也可见 HTTP 404 且无业务码；两者在本接口归为 not-found。业务失败不能仅凭 HTTP 状态判断。」只在实际 examples 支持时使用该表述。

## 检查与交接

逐句复核事实、检查修改范围只含目标 notes，并输出改动接口清单及待核实问题。纯文字修改不要求重新跑 canonical JSON 校验；由 pipeline 在后续 render 时同步生成文档。独立任务包含同步生成物时调用 CLI render，不手改 `dist/docs/`。

notes 是可选增强项；资料不足时给出简短、诚实的说明或跳过并说明原因，不因此阻断其余有效的导入步骤。
