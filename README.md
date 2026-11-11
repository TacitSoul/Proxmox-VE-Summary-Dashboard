# PVE Summary Overview · v1

An unofficial local overview extension for the Proxmox VE node Summary page.

面向 **Proxmox VE 9.2.x** 的非官方本地扩展：为节点「概要」增加总览面板，原生 RRD 图表保留在「趋势图」页。已观察的单机部署版本为 **pve-manager 9.2.21**；不宣称其它版本或所有硬件均兼容。

**它不是官方插件。** 安装器会修改 PVE 自带的 UI/API 文件，PVE 升级可能覆盖扩展或改变文件布局。已做静态/离线检查和单机部署冒烟；**完整生产验收未完成**。下方离线测试只检查本仓库打包一致性及语法，不等于真实权限、界面、恢复或性能验收。

## 功能与数据口径

- **处理器与内存**：CPU 使用率、历史趋势、核心频率/温度、可用时的 P/E 核信息，以及内存、交换区和 KSM 状态。硬件温度主要读取 `coretemp`/NVMe 的 sysfs 传感器；封装功耗来自可用的 Intel RAPL 能量计数器，不是整机插座功率。
- **NVMe 存储**：设备型号、分区/挂载布局、容量和使用情况，以及可读到的 SMART 健康、温度、寿命估算和累计读写等信息。这里不是覆盖所有 SATA/SAS/RAID 或所有存储后端的通用硬件监控。
- **网络**：节点的 1 小时/今日流量与速率图；今日数据按节点本地午夜起的完整 RRD 分钟区间积分，结束点留有一分钟余量，节点图按 5 分钟聚合。统计仅涵盖实际可用区间，不外推；未知值不填成 0，缺测曲线断开，部分覆盖的总量用 `≥` 提示。节点口径包含虚拟桥接流量，不等同于外网计费流量。
- **VM/CT 概览**：本节点非模板 guest 的运行筛选、资源分配、实时速率和今日流量，以及跳转原生页面/创建向导的入口。实时速率按 guest 采样 uptime 与计数器差值计算，重复、过期或重置样本不冒充新数据。
- **界面**：随 PVE 深浅主题变量适配，提供 CPU/NVMe 详情；总览显示时折叠底部任务日志，离开时恢复原状态。窄栏会隐藏 guest 标签，不能据此承诺所有分辨率均完整显示。

权限沿用 PVE 原生模型：前端 guest 列表来自原生资源 store，并按当前节点过滤；后端今日流量按当前请求身份检查节点 `Sys.Audit` 和各 guest 的 `VM.Audit`，guest 归属取当前集群列表，不把已迁走/删除的遗留 RRD 当成本节点 guest 返回。原始缓存不是授权结果缓存，每次响应重新过滤。**这些是源码行为说明，不表示已完成真实低权限 HTTP/ACL 审计。**

## 仓库文件

| 文件 | 职责 |
| --- | --- |
| `SummaryOverview.pm` | 节点硬件与今日流量数据，安装到 PVE Perl 模块目录 |
| `overview.js` | 总览布局、图表、样式与原生 ExtJS 页面集成 |
| `apply.sh` | 本地安装/移除、布局检查、备份与失败恢复尝试 |
| `VERSION` | 本次首发版本，字面 `v1` |
| `SHA256SUMS` | **仅绑定上述三个产品文件**；不绑定自身或文档/测试，不构成数字签名 |
| `tests/check.py` | Python 标准库离线打包/语法检查 |

本仓库不捆绑完整的 `pvemanagerlib.js`、`Nodes.pm`、Proxmox 发行文件或其它第三方组件。

## 环境与依赖

实际安装需要目标 PVE 主机上的 **root** 权限、Bash、GNU coreutils（含 `stat`、`mktemp`、`sha256sum`、`sync` 等）、`flock`、`systemctl`，以及 PVE 自身的 Perl 模块、`JSON`、`RRDs` 和标准 Perl 模块（如 `Time::HiRes`、`Digest::MD5`）。前端依赖 PVE 已提供的 ExtJS/Proxmox UI 环境，不是独立网页。

- **Node.js 可选**：安装器找到 `node` 时用 `node --check` 检查生成的 JavaScript；找不到时会警告并略过该检查，不会仅因此拒绝安装。
- 硬件采集调用固定路径 `/usr/sbin/smartctl` 和 `/usr/bin/lsblk`，各调用设有 5 秒超时。工具缺失、输出不可解析或硬件不支持时，相关 SMART/分区信息可能不可用；部分型号/温度可由 sysfs 提供，**不保证完整降级，也不把不可用视为健康或零值**。
- RRD 流量依赖 PVE 的 RRD 数据与模块，使用可用的 rrdcached socket；无数据、权限不足或读取失败时可能没有相应流量信息。
- 仅运行仓库离线检查另需 **Python 3.8+**。Bash、Node、Perl 未安装时各自的语法检查明确 `skip`；缺少 Perl `JSON` 也会略过 Perl 编译。`skip` 不代表该项已验证。测试不会安装任何依赖。

## 安装

**请先阅读限制并准备主机备份和独立的 SSH/宿主机控制台连接。** 不要在属于 `pvedaemon`/`pveproxy` 的 PVE Web Shell 中执行：安装/移除会重启这些服务，可能中断执行连接。脚本会尝试识别并拒绝这种环境，仍应主动使用 SSH 或宿主机控制台。

`apply` 和 `remove` 在有实际 UI/API 文件改动时会重启 **`pvedaemon`、`pveproxy`**，管理页面/API 可能短暂断开。脚本不主动停止 VM/CT，**这不构成虚拟机/容器绝不受影响的保证**。无变化的重复操作通常无需重启。

推荐在 root shell 中，将已核对的首发版本放到 **root 拥有的 `/opt/pve-summary-overview`**。例如，在该目录尚不存在时：

```bash
umask 022
git clone --branch v1 --depth 1 https://github.com/TacitSoul/pve-summary-overview.git /opt/pve-summary-overview
cd /opt/pve-summary-overview
sha256sum -c SHA256SUMS
bash -p ./apply.sh apply
```

没有 Git 时，也可先下载并检查 v1 源码，再由 root 将同一版本的三个产品文件放在该目录；不要混用不同版本文件。不要使用 `curl | bash` 或直接执行未检查的远程脚本。

- `SummaryOverview.pm`、`overview.js` 必须与 `apply.sh` 位于同一目录。
- 安装器会检查目标文件、payload 文件及相应父目录的 root 所有权，拒绝组/其它用户可写的代码路径与文件 symlink；源码目录及其每级父目录也必须符合要求。推荐普通文件 `0644`、`apply.sh` 和目录 `0755`。不要把不可信目录简单改成 root 所有后就执行。
- 推荐显式使用 `bash -p ./apply.sh apply`，不从当前 shell `source` 安装器。省略参数也表示 `apply`；只有 `apply`/`remove` 被接受。
- 上游标记、锚点或布局无法识别时脚本会拒绝，不应强行绕过。完成后重新加载浏览器页面；遇到旧缓存可强制刷新。

### 实际修改位置

安装器在节点本地处理以下文件：

- `/usr/share/pve-manager/js/pvemanagerlib.js`：追加带标记的总览代码。
- `/usr/share/pve-manager/index.html.tpl`：为相关脚本更新 UI 缓存参数。
- `/usr/share/perl5/PVE/API2/Nodes.pm`：加入带标记的节点 status 钩子及 `protected` 行，保留原生权限检查。
- `/usr/share/perl5/PVE/SummaryOverview.pm`：安装本仓库的 Perl 模块。

安装器还会读取系统提供的 `/usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js` 来计算缓存标识，不把其发行代码复制进本仓库。采集过程中可在 `/run/pve-summary-overview.rapl` 保存 RAPL 上次采样状态。

### 备份、结果与失败处理

- 状态目录：`/var/lib/pve-summary-overview/`；每次有改动时的备份位于 `backup/<run>/`，其中 `MANIFEST` 记录原始与计划 SHA256，`RESULT` 记录结果。
- 最近运行摘要：`/var/lib/pve-summary-overview/last-run`，包含模式、结果和备份位置。
- 返回码：`0` 完成/无变化；`1` 拒绝或失败（须看具体消息）；`2` 参数/调用方式错误；**`3` 失败且文件恢复或服务恢复不完整，需要人工处理**。
- 脚本在提交前先检查/生成/编译文件并备份，提交失败或被中断时尝试恢复已改文件；服务已尝试重启时也尝试恢复服务。**自动恢复并非万无一失**，断电、外部并发修改或恢复本身失败均可能留下不完整状态。请保留输出、备份和 `last-run`，根据明确失败信息检查；不要将本脚本的备份视为完整主机备份，也不要盲目反复执行。

## 移除与 PVE 升级

在同样的 root 所有源码目录、通过 SSH/宿主机控制台运行：

```bash
cd /opt/pve-summary-overview
bash -p ./apply.sh remove
```

移除会去掉本扩展的 UI/API 标记改动，在需要时重启上述服务，并在钩子移除和服务处理后删除扩展模块，回到原生 UI；仍受布局识别及失败恢复限制，并非执行任意旧备份的全机回滚。

升级 `pve-manager` 后，先重新核对版本、文件布局与扩展状态；如需继续使用，确认该版本适用后再从同一份已检查源码重新应用。**不承诺跨版本兼容，也不应为保留扩展而覆盖新版本上游文件或绕过拒绝检查。** 更新本扩展时同样保持三个产品文件来自同一版本，并重新检查校验值和说明。

## 离线检查（无需 root）

从仓库根目录运行这一条命令：

```bash
PYTHONDONTWRITEBYTECODE=1 python3 tests/check.py
```

检查内容：

1. `VERSION` 精确为 `v1`，三个产品 SHA256 与测试固定值及 `SHA256SUMS` 一致。此预检失败会在调用其它解释器之前退出，返回非零。
2. `bash -n -- apply.sh` 只检查 Shell 语法；`node --check overview.js` 只检查 JavaScript 语法。
3. `perl -c -` 通过标准输入编译 Perl 源码，注入最小、仅供编译的 `PVE::Tools` stub，不加载真实 PVE 模块。Perl `JSON` 使用已安装模块，不联网补齐依赖。

测试不执行安装器，不调用 `collect`/`traffic`，不采集主机数据，不操作服务，不联网，不写生产路径；不需要临时文件，也不在仓库产生缓存。语法检查失败或超时返回非零；解释器/`JSON` 缺失时会明确列出 `skip`，即使整体命令返回 `0`，也应检查是否有跳过项。它不验证文档/测试自身的发布来源，不是完整产品测试或真实 ACL 审计。

## 已知限制与尚未完成的验证

- **真实低权限 HTTP/ACL 链路尚未完整验证**，包括受保护请求代理后的真实身份、组/池/继承/NoAccess 与 token 权限组合。静态检查或离线模拟不能替代端到端权限验收。
- **全部分辨率、深浅主题的登录后完整 UI 尚未验证**，包括真实 ExtJS/ResourceStore 生命周期；窄栏隐藏 guest 标签。不能承诺所有窗口尺寸均一屏、无截断/遮挡。
- **真实移除/回滚、服务恢复、并发、PVE 跨版本，以及最坏冷采集总时延尚未完整验证**；单机冒烟不等于这些项目通过。
- SMART/布局等命令为串行调用，单个命令超时不是整个采集的总超时；**RRD fetch 没有已证明的统一总 deadline**。大量设备/guest 或慢 RRD I/O 的最坏时延没有可靠总上界保证。
- 传感器与 SMART 内容取决于内核、设备及命令输出；硬件显示不是面向所有厂商/架构的健康诊断。今日流量从节点本地日期与已有 RRD 计算，缺测不补齐，不宜作为计费依据。
- 扩展在原生节点 status 响应中加入 `hwinfo`；该扩展数据结构不是稳定的第三方公共 API，不保证额外消费者兼容。

## 许可证与第三方组件

**尚未指定项目许可证。** 公开源码不等于已经授予 MIT、AGPL 或其它项目许可；本仓库没有自行添加 `LICENSE` 或版权人声明，也不将上游组件的许可证自动套用到本项目。

Proxmox VE、ExtJS 及其它第三方组件仍遵从其各自原许可；本仓库不替代、移除或重新授权这些组件已有的声明。产品源文件中的既有注释/声明保留原样。这里不构成对所有第三方来源或再分发义务已经完成核实的结论；若要再分发或作其它授权用途，应先确认项目授权以及相关第三方要求。
