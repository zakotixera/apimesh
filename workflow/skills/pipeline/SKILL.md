---
name: pipeline
description: 编排 bilibili-collection 的 HAR 导入全链：extract、classify、可选 notes、validate、render、本地 replay 与 PR 交接。用户要求处理一批 HAR、更新合集并验证生成物、恢复失败流水线或准备完整导入 PR 时使用；仅分类、写导读、裁决漂移分别交给 classify、notes、drift。
---

# pipeline · 总编排

串联 W2–W7 并交接审阅（W9）。每一步消费前一步可检查的结果；失败后修复责任层，再从受影响的闸门继续。

## 准备

1. 读 [共享契约](../references/contracts.md)、[CLI 文档](../../cli/README.md) 与 `git status --short`，记录已有修改，从用户任务确定本次 HAR / 接口范围及交付形式（本地结果或 PR）。
2. 定位含 `collection.json` 和 `workflow/` 的仓库根。下面命令统一从 `workflow/cli` 运行；仓库根 `dist/` 是生成物，`workflow/cli/dist/` 是 CLI 编译结果。
3. 检查 Node.js ≥20。首次运行或依赖变化时执行 `npm ci`，执行 `npm run build`；失败先解决环境或编译问题。不使用可能下载同名包的 `npx apic`，也不要求全局 link。
4. 没有 HAR 时先找用户指定文件与 `sources/`。无可用输入则报告缺失文件；不凭空生成录像。恢复运行时复用已确认的输入和上游结果。

## 执行与失败分支

| 步骤 | 操作 | 完成证据 / 失败处理 |
|---|---|---|
| 1 抽取 | `npm run apic -- extract <明确的 HAR 路径列表>` | 检查退出码、报告、实际 YAML 与帧数。空稿或解析错误先核对输入，不直接进入分类 |
| 2 分类 | 读取并执行 [classify](../classify/SKILL.md) | 收到文件清单、分类依据与未决帧。unclassified、bodyMeta 不兼容、文件名冲突须保留并报告，不能算全量成功 |
| 3 可选导读 | 需要新增或更新说明时执行 [notes](../notes/SKILL.md) | 只针对本次变更接口；省略说明不阻断核心链，但不能保留本次引入的错误说明 |
| 4 校验 | `npm run apic -- validate` | `.reports/validate.json` 0 error；warnings 原样交接。按错误定位 canonical / schema / CLI，不一律归咎 classify |
| 5 渲染 | `npm run apic -- render --all` | 三类消费者输出生成；失败排查输入与 renderer，只在责任层修复后再生成 |
| 6 稳定性 | 记录 `dist/docs`、`dist/agent`、`dist/postman` 的文件路径和内容哈希，再运行一次 render 对比 | 相同输入下文件集合与字节均相同；报告新增、删除或内容变化，不仅检查 Git 已跟踪文件 |
| 7 本地回放 | `npm run apic -- test` | 全部录像断言通过。修 canonical 后重跑 4–7；修 CLI 后先 build 并跑相关测试，再重跑受影响闸门 |
| 8 审阅交接 | 审查本次 diff，准备变更说明和验证证据；按用户范围创建 PR | 未决项显式列出。仅本地任务给出本地交接；要求 PR 但缺远端、凭证或发布授权时保留可审阅成果并说明阻塞 |

`<明确的 HAR 路径列表>` 是占位说明，执行时替换为实际文件，例如 `../../sources/capture.har`，路径含空格时引用。CLI 不展开 glob；PowerShell 可用下面方式把选定目录的 HAR 作为一个批次传入：

```powershell
$harFiles = @(Get-ChildItem -LiteralPath '../../sources' -File -Filter '*.har' |
  Sort-Object Name | ForEach-Object { $_.FullName })
if ($harFiles.Count -eq 0) { throw 'No HAR files found in sources/' }
npm run apic -- extract @harFiles
if ($LASTEXITCODE -ne 0) { throw 'apic extract failed' }
```

若用户只指定某些 HAR，枚举这些文件即可，不扩大范围。每次 extract 会替换当前受 manifest 管理的稿件集合；不要把多个 HAR 拆成独立调用后假定之前的稿仍在。

## 恢复规则

- **抽取 ownership 冲突：** 不删文件或 manifest、不强制覆盖。用新的 `--out` 目录（相对 CLI 工作目录解析），把真实输出目录传给 classify；保留旧稿以供比较。
- **分类尚未完成：** 可对已确认的子集继续验证，交接注明「部分完成」以及排除的帧。通过现有 canonical 的闸门并不能证明全部新捕获已导入。
- **重复失败：** 查看具体错误与输入，做能解释该错误的修复；没有新证据时停止重复同一命令，报告失败阶段、诊断与最小下一步。
- **CLI 缺陷：** 在任务授权范围内修复源代码，重建并运行相关测试；超出范围时交接具体缺陷。不能手改生成物或削弱断言掩盖缺陷。
- **审阅范围：** 保留他人修改，只纳入本次任务文件；不把临时抽取稿、凭证或评估产物加入 PR，不自动 merge。

## 完成报告

列出处理的输入、变更接口与文件、各闸门实际结果、warnings / 未决项和 PR 链接（如已创建）。未运行项写「未运行」及原因；本地 replay 通过不代表线上接口可用。

两次 render 的哈希相等验证确定性；CI 在提交后执行的 `git diff --exit-code dist/` 验证提交的产物与 canonical 同步。当前工作区存在预期的新生成物时，不能把相对 HEAD 的 diff 当作确定性失败，也不能遗漏 untracked 产物。
