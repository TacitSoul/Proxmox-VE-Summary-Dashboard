# 安装与维护

## 适用范围

本扩展面向 Proxmox VE 9.2.x，已记录的单机部署版本为 `pve-manager 9.2.21`。前端依赖 PVE 提供的 ExtJS 与 Proxmox UI 环境，不能作为独立网页运行。

安装器修改节点本地的 UI/API 文件。PVE 升级、文件布局变化或其他扩展可能影响兼容性。安装与移除前应准备主机备份，并保留独立的 SSH 或宿主机控制台连接。

## 环境与依赖

实际安装需要目标 PVE 主机的 root 权限，以及：

- Bash、GNU coreutils（包括 `stat`、`mktemp`、`sha256sum`、`sync`）、`flock` 和 `systemctl`。
- PVE 自身的 Perl 模块、`JSON`、`RRDs`，以及 `Time::HiRes`、`Digest::MD5` 等标准模块。
- 硬件采集使用 `/usr/sbin/smartctl` 和 `/usr/bin/lsblk`，各命令设置 5 秒超时。工具缺失、输出无法解析或硬件不支持时，相关数据可能不可用。
- RRD 流量统计依赖 PVE 的 RRD 数据与模块，并使用可用的 rrdcached socket。

Node.js 为可选依赖：安装器检测到 `node` 时执行 JavaScript 语法检查，未安装时给出提示并跳过该项。

仅运行仓库离线检查需要 Python 3.8+。检查脚本不会自动安装依赖。

## 源码目录与文件权限

建议使用 root 拥有的 `/opt/pve-summary-overview` 目录。目录及 `apply.sh` 可设为 `0755`，普通文件设为 `0644`。

- `apply.sh`、`SummaryOverview.pm` 和 `overview.js` 必须来自同一版本，并位于同一目录。
- 安装器检查目标文件、产品文件及相关父目录的 root 所有权，拒绝组或其他用户可写的代码路径及文件符号链接。
- 源码目录及其各级父目录均需满足权限要求。不能仅通过修改不可信目录的所有权使其中代码变得可信。
- `SHA256SUMS` 仅覆盖上述三个产品文件，不覆盖文档、测试及校验清单自身，也不构成数字签名。

从 [Release](https://github.com/TacitSoul/Proxmox-VE-Summary-Dashboard/releases) 获取并核对版本后执行：

```bash
cd /opt/pve-summary-overview
sha256sum -c SHA256SUMS
bash -p ./apply.sh apply
```

不要通过 `curl | bash` 执行未经检查的远程脚本，也不要在当前 shell 中 `source` 安装器。省略参数等同于 `apply`，有效参数仅为 `apply` 和 `remove`。

## 服务与连接影响

安装或移除实际改变 UI/API 文件时，会重启 `pvedaemon` 和 `pveproxy`，管理页面与 API 连接可能短暂中断。无变化的重复操作通常无需重启。

应通过独立 SSH 或宿主机控制台执行，不要在由 `pvedaemon` 或 `pveproxy` 提供的 PVE Web Shell 中运行。脚本会尝试识别并拒绝该环境。

脚本不主动停止 VM/CT，但仍应按主机变更流程评估影响，不能将此行为视为运行中工作负载的连续性保证。

## 文件修改位置

| 路径 | 操作 |
| --- | --- |
| `/usr/share/pve-manager/js/pvemanagerlib.js` | 追加带标记的总览代码 |
| `/usr/share/pve-manager/index.html.tpl` | 更新相关脚本的 UI 缓存参数 |
| `/usr/share/perl5/PVE/API2/Nodes.pm` | 加入节点 status 钩子及 `protected` 行，保留原生权限检查 |
| `/usr/share/perl5/PVE/SummaryOverview.pm` | 安装本项目的 Perl 模块 |

安装器读取 `/usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js` 计算缓存标识，不将其发行代码复制进本仓库。RAPL 采样状态可写入 `/run/pve-summary-overview.rapl`。

上游标记、锚点或文件布局无法识别时，安装器会拒绝操作。应核查兼容性，不要绕过检查。

## 备份与失败处理

状态目录为 `/var/lib/pve-summary-overview/`。有文件改动时，备份保存至 `backup/<run>/`：

- `MANIFEST`：原始与计划文件的 SHA-256。
- `RESULT`：本次操作结果。
- `last-run`：最近运行摘要，记录模式、结果及备份位置。

返回码如下：

| 返回码 | 含义 |
| --- | --- |
| `0` | 完成或无需变更 |
| `1` | 拒绝执行或操作失败，需查看具体输出 |
| `2` | 参数或调用方式错误 |
| `3` | 文件恢复或服务恢复不完整，需要人工处理 |

脚本在提交变更前生成、检查并备份相关文件。提交失败或中断时尝试恢复已修改的文件；已尝试重启服务时，也会尝试恢复服务。断电、外部并发修改或恢复失败仍可能留下不完整状态。

发生错误时应保留命令输出、备份及 `last-run`，按具体错误检查文件与服务状态，避免盲目重复执行。脚本备份不能替代完整主机备份。

## 移除与升级

在符合相同权限要求的源码目录中执行：

```bash
bash -p ./apply.sh remove
```

移除操作清理扩展的 UI/API 标记，在处理钩子与管理服务后删除扩展模块，仍受布局识别和失败恢复条件约束，不是完整主机回滚。

升级 `pve-manager` 后，应核对版本、文件布局及扩展状态，确认适用后再重新应用。更新本扩展时，三个产品文件必须保持版本一致，并重新核对校验值。不要为保留扩展而覆盖新版上游文件。

## 数据口径与权限

- CPU 温度主要来自 `coretemp` 与 NVMe 的 sysfs 传感器。P/E 核信息取决于硬件与内核是否提供相应数据。
- 功耗来自可用的 Intel RAPL 能量计数器，表示封装功耗，不是整机插座功率。
- 存储监控以 NVMe 为主，不覆盖所有 SATA、SAS、RAID 或其他存储后端。传感器或 SMART 数据不可用时，不应据此判断设备健康。
- 今日流量按节点本地午夜起的完整 RRD 分钟区间积分，结束点保留一分钟余量；节点曲线按 5 分钟聚合。缺测不外推，未知值不填零，部分覆盖的总量以 `≥` 标识。
- 节点流量包含虚拟桥接流量，不等于外网计费流量。guest 实时速率按 uptime 与计数器差值计算，重复、过期或重置样本不作为新数据。
- 前端 guest 列表来自原生资源 store，并按当前节点过滤；后端按请求身份检查节点 `Sys.Audit` 与 guest `VM.Audit`，归属以当前集群列表为准。原始缓存不作为授权结果缓存，每次响应重新过滤。

以上为源码行为说明。真实低权限 HTTP/ACL 链路，包括组、池、继承、NoAccess 与 token 权限组合，尚未完成端到端验证。

## 验证范围与限制

目前已进行静态、离线检查及单机部署冒烟，尚未完成以下验证：

- 登录后完整 UI、不同分辨率与深浅主题，以及 ExtJS / ResourceStore 生命周期。窄栏可能隐藏 guest 标签。
- 实际移除与回滚、服务恢复、并发操作及 PVE 跨版本兼容。
- 大量设备或 guest 场景下的最坏冷采集时延。SMART 与布局命令串行执行，单次命令超时不等于完整采集超时；RRD fetch 尚无统一总时限验证。

扩展在节点 status 响应中加入 `hwinfo`，该结构不是稳定的第三方公共 API。

## 离线检查

```bash
PYTHONDONTWRITEBYTECODE=1 python3 tests/check.py
```

检查内容包括：

1. `VERSION` 为 `V1.0.0`，三个产品文件的 SHA-256 与固定值及 `SHA256SUMS` 一致。
2. 使用可用的 Bash 与 Node.js 执行语法检查。
3. 经标准输入编译 Perl 源码，注入仅用于编译的 `PVE::Tools` stub，不加载真实 PVE 模块。

检查不执行安装器、不调用采集函数、不操作服务、不联网，也不写生产路径。解释器或 Perl `JSON` 缺失时会标记 `skip`；语法失败或超时返回非零。命令返回成功不代表所有检查项均已执行，也不代表完成实际权限、恢复或性能验收。

## 许可

本项目未指定许可证。Proxmox VE、ExtJS 等第三方组件沿用各自许可；使用与再分发前须确认项目授权及第三方要求。
