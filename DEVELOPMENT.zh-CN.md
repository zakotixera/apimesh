# 从零建立 apimesh-bilishow

这份指南带你建立一个 Bilishow API 录制与文档仓库：安装 apimesh、初始化集合、放入 HAR、整理接口，最后生成文档并回放验证。

`apimesh-bilishow` 保存业务数据；`vendor/apimesh` 保存固定版本的工具链。业务录制和接口定义都放在应用根目录，不放进 vendor。

下面的命令默认使用 **Bash**；GitHub Actions 使用 **Ubuntu**。准备好 Git、Node.js **20 或更新版本**及 npm；安装完成后，除非特别说明，所有命令都在 `apimesh-bilishow` 根目录运行。一条命令报错时，先解决错误再继续。

**版本前提：** 本文需要支持 `init`、`verify` 和 `--root` 的 apimesh 版本。submodule 只能引用已提交的版本，不能带入另一个工作区尚未提交的修改。先确认相关改动已提交并可从远程获取，再选择包含这些改动的提交。第 2 步会检查 CLI 命令。

## 1. 建立仓库，加入 submodule

如果已经有空的 `apimesh-bilishow` 仓库，直接进入它，跳过创建目录和 `git init`：

```bash
mkdir apimesh-bilishow
cd apimesh-bilishow
git init -b main
```

把 apimesh 加为子模块：

```bash
git submodule add https://github.com/ZakoTixera/apimesh.git vendor/apimesh
git submodule status
```

此时会出现 `.gitmodules` 和 `vendor/apimesh/`。父仓库记录的是子模块的一个提交号，后续普通拉取不会自动升级到上游最新代码。

如果 vendoring 改动还没进入默认分支，先获取上游提交，再切换到包含改动的版本。把下面变量的内容替换为实际提交号：

```bash
apimesh_revision='替换为包含 vendoring 改动的提交号'
git -C vendor/apimesh fetch origin
git -C vendor/apimesh checkout "$apimesh_revision"
```

如果 `.gitmodules` 已经记录了 apimesh，就不要再次执行 `submodule add`，使用：

```bash
git submodule update --init --recursive
```

## 2. 安装并构建工具链

```bash
npm --prefix vendor/apimesh/workflow/cli ci
npm --prefix vendor/apimesh/workflow/cli run build
node vendor/apimesh/workflow/cli/dist/cli.js --help
```

帮助中应包含 `--root <directory>`，以及 `init`、`verify`、`extract`、`validate`、`render`、`drift`、`test`、`serve`。如果缺少命令，检查子模块是否选中了正确版本，并重新构建。

安装和构建只需在首次使用或升级工具链后执行。之后修改业务数据时，直接调用编译好的 CLI 即可。

## 3. 初始化业务集合

从应用根目录运行初始化命令：

```bash
npm --prefix vendor/apimesh/workflow/cli run init -- --root . --name "Bilishow API collection"
```

这条 npm 命令先构建工具链，再恢复到你调用 npm 时的目录，因此 `--root .` 指向应用根目录。已构建时也可直接运行 `node vendor/apimesh/workflow/cli/dist/cli.js --root . init --name "Bilishow API collection"`。

初始化会创建缺失的 `collection.json`、`glossary.json`、`package.json`、`.gitignore`、`.gitattributes`、`.github/workflows/verify.yml`、`AGENTS.md`、`README.md` 和 `sources/`。重复运行不会覆盖或自动合并已有文件；输出中的 `preserve` 表示需要自行核对相应模板。加上 `--dry-run` 可预览应用文件变化（npm 入口仍会先构建工具链）。

通用逻辑直接使用 vendor 中的 CLI，不再为每个应用复制 `scripts/verify.cjs`。业务专属脱敏仍由应用维护。初始化不创建接口，也不生成声称已经完成导入的 `IMPORT.md`；导入报告应在实际执行后记录输入、未决项和检查结果。

将根目录的 `collection.json` 改成：

```json
{
  "name": "Bilishow API collection",
  "version": "0.1.0",
  "bases": {},
  "changelog": []
}
```

`bases` 是「简短标签 → API origin」的映射。先留空，第 4 步查看实际 HAR 后再填写。origin 包含协议、主机和必要的端口，不包含接口路径或查询参数。例如，**如果录制中确实出现了** `https://show.bilibili.com`，可以添加：

```json
"bases": {
  "show": "https://show.bilibili.com"
}
```

这只是 `collection.json` 中的一个字段示例，不是完整文件。多个实际 API origin 使用不同标签；不要仅凭项目名字猜测主机。

`glossary.json` 初始保持：

```json
{
  "domains": []
}
```

它保存响应的语义词汇，由后面的分类步骤根据证据补充。无需提前填好所有成功、失败类别。

初始化生成的 `.gitignore` 包含以下内容；已有文件会保留，请核对并合并需要的规则：

```gitignore
.raw/
.reports/
node_modules/
/sources/
vendor/apimesh/workflow/cli/dist/
```

**不要忽略根目录 `/dist/`**，它是需要提交的业务产物。vendor 内的 `workflow/cli/dist/` 才是可重新构建的工具代码。

检查初始化是否有效：

```bash
node vendor/apimesh/workflow/cli/dist/cli.js --root . validate
```

此时校验通过只代表元数据有效。还没有接口或录制样例，不要把它当成完成导入，也暂时不运行回放测试。

## 4. 录制并放入 HAR

在浏览器开发者工具的 Network 面板录制需要整理的操作，然后导出 HAR，尽量保留请求和响应内容。给不同操作、不同录制批次使用容易识别的文件名，例如：

```text
sources/
  bilishow-project-list-2026-10-02.har
  bilishow-project-detail-2026-10-02.har
```

这些名字仅用于示范，不代表已经有对应文件。后续命令要换成你的真实文件名。

HAR 可能带有 Cookie、令牌和个人数据。`sources/` 默认被忽略，可保存本地原始录制；只有明确审阅并决定共享时，才调整忽略规则。CLI 抽取会生成脱敏副本，**不会修改原始 HAR**。业务特有字段或嵌套字符串仍需审阅脱敏效果。

可以用下面的命令只查看这些 HAR 中出现的 origin，帮助填写 `bases`：

```bash
node <<'NODE'
const fs = require('node:fs');
const origins = new Set();
for (const entry of fs.readdirSync('sources', { withFileTypes: true })) {
  if (!entry.isFile() || !/\.har$/i.test(entry.name)) continue;
  const capture = JSON.parse(fs.readFileSync(`sources/${entry.name}`, 'utf8').replace(/^\uFEFF/, ''));
  for (const frame of capture.log.entries) origins.add(new URL(frame.request.url).origin);
}
console.log([...origins].sort().join('\n'));
NODE
```

录制可能还包含图片、统计和其他无关请求。根据实际业务范围选择需要维护的 API，不必把每个主机都当成目标接口。

如果已确认业务使用的鉴权 header 或 cookie，在 `collection.json` 添加 `auth` 声明。格式见[开发指南](DEVELOPMENT.md#initialize-collection-metadata)：注册键和 `name` 使用实际字段名，只写名称和说明，不写真实凭证。

## 5. 抽取 HAR，得到脱敏草稿

把本次需要处理的 HAR **一次性**传给 `extract`：

```bash
node vendor/apimesh/workflow/cli/dist/cli.js --root . extract "sources/bilishow-project-list-2026-10-02.har" "sources/bilishow-project-detail-2026-10-02.har" --account recording-a
```

`--account` 是方便识别录制背景的普通标签，不用于登录，也不要填密码或令牌。

执行后会得到：

| 位置 | 内容 |
|---|---|
| `.raw/` | 已脱敏、分组、去重的 YAML 草稿 |
| `.reports/` | 抽取数量、重复记录等诊断信息 |

检查命令输出与报告，确认有需要的记录。此时还没有完成接口语义分类，也不会自动生成正式的 `apis/`。

注意两个容易混淆的行为：

- CLI 不展开 `*.har`；上面的命令要列出实际路径。
- 多次抽取不会自动累计草稿。每次会替换自己 manifest 管理的结果集合，因此同一批文件要在一次调用中传入。

如果草稿已经被编辑，或工具提示输出文件不归它管理，保留原文件，换一个新目录：

```bash
node vendor/apimesh/workflow/cli/dist/cli.js --root . extract "sources/bilishow-project-list-2026-10-02.har" --account recording-a --out .raw/import-02
```

后面的分类步骤也要明确使用 `.raw/import-02/`。`--out` 和 HAR 路径都相对于当前工作目录；本文一直从应用根目录运行。

## 6. 让 Agent 整理为正式接口数据

如果本次范围是 `sources/` 下的全部直接 HAR 文件，也可用 `npm run extract` 完成上一节的抽取；它按文件名排序后作为一个批次处理，不递归子目录。选择部分文件时使用 `npm run extract -- "sources/实际文件.har"`，没有可用文件时会报错并保留已有草稿。

分类需要理解录制证据，由 Agent 按 skill 执行，也可以人工按相同规则维护。**没有 `apic classify` 命令。**

在 `apimesh-bilishow` 项目中打开你的 Agent，将下面这段话发给它。根据实际情况调整草稿目录和业务范围：

> 请阅读并遵循 vendor/apimesh/workflow/skills/classify/SKILL.md，将本次 .raw/ 中的草稿整理为 apimesh-bilishow 的规范接口数据。
>
> 应用根目录是当前目录，工具链位于 vendor/apimesh。使用根目录的 collection.json 和 glossary.json，接口写入根目录 apis/，业务数据不要写入 vendor。
>
> 按录制证据维护接口、响应变体、样例和词汇；保留脱敏占位符、bodyMeta、httpMeta 以及现有稳定标识。列出无关请求、缺失 body、含义不明确和端点冲突等未导入记录及原因，不要为了完成导入而编造数据。
>
> 完成后运行校验，报告变更文件、已导入范围、警告和未决项。仅保留本地修改，不提交或推送。

成功分类后，目录形态类似：

```text
apis/
  <实际主机>/
    <实际接口路径>/
      definition.json
      examples/
        <HTTP状态>.<业务码标记>.<语义变体>.json
      notes.md                     # 可选
```

不要手工照抄占位名称。具体主机、路径、状态、变体和文件名由真实录制决定。HTTP 200 或业务码 0 本身不足以证明操作成功。

如果希望 Agent 从抽取开始完成整个流程，可以直接使用下面的请求，替代第 5～7 步的手动操作：

> 请遵循 vendor/apimesh/workflow/skills/pipeline/SKILL.md，处理 sources/ 中的以下实际 HAR 文件：[在这里列出文件名]。应用根目录是当前目录，使用已构建的 vendored CLI。完成抽取、分类、校验、渲染、两次渲染稳定性检查和本地回放；报告未导入记录及原因。保留已有无关修改，仅交付本地结果，不提交或推送。

## 7. 校验、生成文档、回放

分类完成后，运行统一验证：

```bash
npm run verify
```

| 命令 | 检查或生成什么 |
|---|---|
| `validate` | schema、引用、命名和记录一致性；报告在 `.reports/validate.json` |
| `render --all` | 生成根目录 `dist/docs/`、`dist/agent/`、`dist/postman/` |
| `test` | 启动临时本地服务，用 Newman 检查生成请求与录制记录是否一致，结束后关闭服务 |

`verify` 按顺序执行严格校验、两次渲染、文件路径及字节比较、本地回放，任一步失败即停止，并将实际结果写入 `.reports/verify.json`。默认警告也会失败；仅在明确接受已审阅警告时使用 `npm run verify -- --no-strict`。上表的独立命令仍可用于排查问题。回放必须覆盖全部规范录制，不会验证线上接口是否仍然可用。尚无录制的空集合不能通过回放。

两次渲染比较包含未跟踪文件。生成的 CI 使用 `npm run verify -- --committed`，额外在渲染前后检查 `dist/` 与 HEAD 一致，包括已暂存、未跟踪和被忽略的文件。首次导入或本地修改时先运行普通 `verify`，审阅并提交产物后再使用 `--committed`。CI 不需要私有 HAR。

完成后，从这些入口查看结果：

| 需要做什么 | 打开什么 |
|---|---|
| 浏览接口文档 | `dist/docs/summary.md` |
| 查看使用与回放说明 | `dist/docs/usage.md` |
| 给 Agent 提供接口索引 | `dist/agent/index.json` |
| 导入 Postman | `dist/postman/endpoints.postman_collection.json` |
| 选择本地回放环境 | `dist/postman/replay.postman_environment.json` |

要在 Postman 里手动回放，先启动服务并保持终端运行：

```bash
node vendor/apimesh/workflow/cli/dist/cli.js --root . serve
```

导入 collection 和 replay environment，选择回放环境，再发送请求；结束时按 Ctrl+C。缺失 body 等不支持的记录应作为未决项报告，不要修改录制证据来强行通过测试。

## 8. 审阅并提交业务仓库

预期的应用目录如下：

```text
apimesh-bilishow/
  .gitmodules
  .gitignore
  .gitattributes
  .github/workflows/verify.yml
  package.json
  AGENTS.md
  README.md
  collection.json
  glossary.json
  sources/
  apis/
  dist/
  .raw/                          # 不提交
  .reports/                      # 不提交
  vendor/apimesh/                 # 父仓库记录子模块提交号
```

先检查改动和 vendor 状态：

```bash
git status --short
git -C vendor/apimesh status --short
git diff
```

正常处理业务数据不会修改 vendor 源码。子模块内若出现源码变更，应先查明原因，不要把业务配置混进工具链。

确认目标记录处理完整、检查通过后，明确暂存本次文件。原始 HAR 默认保持本地：

```bash
git add .gitmodules .gitignore .gitattributes .github/workflows/verify.yml package.json AGENTS.md README.md vendor/apimesh collection.json glossary.json apis/ dist/
git diff --cached --stat
git diff --cached
git diff --cached --check
git commit -m "feat: add initial bilishow API collection"
```

如果还有未导入记录，在交付说明中写清范围和原因；通过了已导入部分的测试，不等于整批 HAR 已处理完成。

## 9. 其他人克隆、你以后继续维护

其他人克隆已经建立好的业务仓库时，用下面的方式一起取出子模块。把 URL 替换为实际的业务仓库地址：

```bash
collection_repository='替换为 apimesh-bilishow 的 Git URL'
git clone --recurse-submodules "$collection_repository" apimesh-bilishow
cd apimesh-bilishow
npm --prefix vendor/apimesh/workflow/cli ci
npm --prefix vendor/apimesh/workflow/cli run build
```

已克隆但 vendor 为空时，执行 `git submodule update --init --recursive`，然后安装、构建。拉取父仓库变更后，也用这条命令让本地子模块与父仓库记录的版本一致。

新增录制时保留旧文件，为新批次使用新文件名，再重复抽取、分类和验证。只想先比较差异，可以运行：

```bash
node vendor/apimesh/workflow/cli/dist/cli.js --root . drift "sources/实际新增录制.har"
```

差异报告位于 `.reports/`；结合 drift skill 审阅后再更新规范数据。命令成功退出只说明比较已完成，不代表没有变化。

升级工具链时，在 `vendor/apimesh` 获取并检出你选择的新提交，重新 `npm ci` 和构建，再对业务数据完成校验、渲染稳定性检查和回放。最后由父仓库提交新的子模块指针及需要更新的生成产物。

目录约定和格式细节见 [ARCHITECTURE.md](ARCHITECTURE.md)，CLI 选项与限制见 [CLI 文档](workflow/cli/README.md)。
