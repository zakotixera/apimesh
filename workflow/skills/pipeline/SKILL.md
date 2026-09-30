---
name: pipeline
description: 编排 HAR 导入、分类、可选说明、校验、渲染和本地回放，并整理审阅结果。用于批量 HAR 导入、合集更新、失败恢复和导入 PR 准备；单独分类、说明编写和漂移评估分别使用 classify、notes、drift。
---

# pipeline · 流程编排

组织抽取、分类、校验、渲染与回放，并整理审阅材料。每一步使用已核实的上游结果；失败时定位原因，修复后从受影响的步骤继续。

## 准备

1. 阅读 [共享契约](../references/contracts.md) 和 [CLI 文档](../../cli/README.md)，运行 `git status --short` 记录已有修改。确认本次 HAR、接口范围及交付形式（本地结果或 PR）。
2. 定位含 `collection.json` 和 `workflow/` 的仓库根目录。下列命令从 `workflow/cli` 运行；仓库根目录的 `dist/` 保存消费者产物，`workflow/cli/dist/` 保存 CLI 编译结果。
3. 检查 Node.js ≥20。首次运行或依赖变化时执行 `npm ci`，然后执行 `npm run build`。构建成功后通过 `npm run apic -- <command>` 调用本地 CLI；`npx apic` 可能下载同名包，全局 link 为可选配置。
4. 检查用户指定的 HAR 文件与 `sources/`。缺少可用输入时报告所需文件，等待真实录制数据。恢复运行时复用已确认的输入和上游结果。

## 执行与检查

| 步骤 | 操作 | 完成证据 / 失败处理 |
|---|---|---|
| 1 抽取 | `npm run apic -- extract <明确的 HAR 路径列表>` | 核对退出码、报告、YAML 文件与帧数。结果为空或解析失败时先检查输入 |
| 2 分类 | 读取并执行 [classify](../classify/SKILL.md) | 记录文件清单、分类依据与未决帧。保留未分类、bodyMeta 不兼容或文件名冲突的帧，并说明处理状态 |
| 3 可选导读 | 需要新增或更新说明时执行 [notes](../notes/SKILL.md) | 说明与本次变更接口一致；缺少说明不阻断导入，已有说明受变更影响时应同步修正 |
| 4 校验 | `npm run apic -- validate` | `.reports/validate.json` 无错误；保留警告信息。根据诊断定位规范数据、schema 或 CLI 的问题 |
| 5 渲染 | `npm run apic -- render --all` | 生成文档、Agent 参考和 Postman 产物；失败时检查输入与渲染器，修复后重新生成 |
| 6 稳定性 | 记录 `dist/docs`、`dist/agent`、`dist/postman` 的文件路径和内容哈希，再运行一次 render 对比 | 相同输入下文件集合与字节均相同；报告新增、删除或内容变化，不仅检查 Git 已跟踪文件 |
| 7 本地回放 | `npm run apic -- test` | 全部录制样例的断言通过。修改规范数据后重复 4–7；修改 CLI 后先构建并运行相关测试，再重复受影响的检查 |
| 8 审阅交接 | 审查本次 diff，整理变更说明和验证证据；任务包含 PR 时创建 PR | 列出未决项。仅要求本地结果时提供本地交接；PR 创建条件不足时保留可审阅成果并说明原因 |

`<明确的 HAR 路径列表>` 是占位说明，执行时替换为实际文件，例如 `../../sources/capture.har`，路径含空格时引用。CLI 不展开 glob；PowerShell 可用下面方式把选定目录的 HAR 作为一个批次传入：

```powershell
$harFiles = @(Get-ChildItem -LiteralPath '../../sources' -File -Filter '*.har' |
  Sort-Object Name | ForEach-Object { $_.FullName })
if ($harFiles.Count -eq 0) { throw 'No HAR files found in sources/' }
npm run apic -- extract @harFiles
if ($LASTEXITCODE -ne 0) { throw 'apic extract failed' }
```

用户指定部分 HAR 时，仅传入这些文件。每次 extract 会替换当前 manifest 管理的抽取结果集合，因此同一批次的 HAR 应通过一次调用传入。

## 恢复规则

- **抽取文件冲突：** 保留原文件与 manifest，使用新的 `--out` 目录（相对 CLI 工作目录解析），并将实际输出目录传给 classify。
- **分类尚未完成：** 可对已确认的子集继续验证，交接注明「部分完成」及未导入帧。既有数据通过校验不代表全部新捕获已导入。
- **重复失败：** 根据错误与输入定位原因。没有新诊断或修复时停止重复执行同一命令，报告失败阶段和下一步。
- **CLI 缺陷：** 在任务范围内修复源代码，重新构建并运行相关测试；超出范围时交接具体问题。保留断言要求，由 CLI 重新生成产物。
- **审阅范围：** 保留已有无关修改，仅纳入本次任务文件。临时抽取结果、凭证和评估产物不进入 PR；合并 PR 需有相应任务授权。

## 完成报告

列出输入、变更接口与文件、各项检查的实际结果、警告、未决项及 PR 链接（如已创建）。未运行项注明原因；本地回放仅验证录制行为与生成产物的一致性。

两次 render 的文件集合与哈希相等用于验证确定性。CI 检查 `git status --porcelain=v1 --untracked-files=all -- dist/` 的输出是否为空，用于验证已提交产物与规范数据同步。本地预期新增的产物可以与 HEAD 不同；确定性比较仍需包含未跟踪文件。
