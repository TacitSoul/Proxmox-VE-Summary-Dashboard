/* BEGIN pve-summary-overview */
// Node Summary overview. Source: /opt/pve-summary-overview/overview.js
// (appended to pvemanagerlib.js by apply.sh; edit the source and run apply.sh again).
//
// Design: a calm bento-grid instrument panel. One neutral canvas, hairline tiles, large tabular
// numerals with small units, one accent colour per subject, real charts instead of decoration.
PVE.node.SummaryOverview = (() => {
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const fixed = (v, digits) => (num(v) === null ? '—' : v.toFixed(digits));
    const count = (v) => (num(v) === null ? '—' : Math.round(v).toLocaleString('en-US'));
    const ratio = (used, total) => (num(used) !== null && num(total) > 0 ? (used / total) * 100 : null);
    const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, num(v) ?? lo));
    const level = (v, warn, danger) => (num(v) === null ? '' : v >= danger ? 'danger' : v >= warn ? 'warn' : '');
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const scale = (v, base, units) => {
        if (num(v) === null) {
            return ['—', ''];
        }
        let i = 0;
        while (Math.abs(v) >= base && i < units.length - 1) {
            v /= base;
            i++;
        }
        return [v.toFixed(i === 0 ? 0 : v < 10 ? 2 : v < 100 ? 1 : 0), units[i]];
    };
    const bytes = (v, base = 1024) => scale(v, base, base === 1000 ? ['B', 'kB', 'MB', 'GB', 'TB', 'PB'] : ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']).join(' ');
    const bits = (bytesPerSec) => scale(num(bytesPerSec) === null ? null : bytesPerSec * 8, 1000, ['bps', 'Kbps', 'Mbps', 'Gbps']);
    const duration = (s) => {
        if (num(s) === null) {
            return '—';
        }
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        return d ? `${d} 天 ${h} 小时` : h ? `${h} 小时 ${m} 分` : `${m} 分钟`;
    };
    const clock = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    // 30 °C cool blue, 60 °C amber, 95 °C red
    const heat = (t) => (num(t) === null ? 'hsl(215 15% 60%)' : `hsl(${Math.round(205 - clamp((t - 30) / 65, 0, 1) * 205)} 85% 52%)`);

    // ---------------------------------------------------------------- markup helpers
    const k = (key, cls) => `<span data-k="${key}"${cls ? ` class="${cls}"` : ''}>—</span>`;
    const fa = (name) => `<i class="fa fa-${name}" aria-hidden="true"></i>`;
    const fact = (label, key) => `<div><dt>${label}</dt><dd>${k(key)}</dd></div>`;
    const head = (title, meta, extra = '') => `<header class="pvx-th"><h3><i class="pvx-dot"></i>${title}</h3><span class="pvx-meta">${meta}</span>${extra}</header>`;
    const more = (action) => `<button type="button" class="pvx-more" data-action="${action}" title="详情">${fa('ellipsis-h')}</button>`;
    const seg = (key) => `<div class="pvx-seg" data-b="${key}"></div>`;
    const chart = (key, h) =>
        `<div class="pvx-chart" data-chart="${key}" style="--h:${h}px"><svg viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true" data-svg="${key}"></svg>` +
        `<span class="pvx-ymax" data-k="${key}-ymax"></span><i class="pvx-cross"></i><div class="pvx-tip"></div></div>`;
    const axis = (key) => `<div class="pvx-axis"><span data-k="${key}-t0">—</span><span data-k="${key}-t1">—</span><span>现在</span></div>`;
    const range = (n) => Array.from({ length: n }, (_, i) => i);
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    // guest glyphs: picked from tags / OS type so the icon says what the guest is
    const GLYPH = {
        router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M10.5 16.5h.01M15 16.5h3M7.5 13 6 6.5M16.5 13 18 6.5"/><path d="M9.5 8.2a4 4 0 0 1 5 0M7.6 5.6a7 7 0 0 1 8.8 0" opacity=".55"/>',
        server: '<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7.5 7.5h.01M7.5 16.5h.01M11 7.5h6M11 16.5h6"/>',
        windows: '<path d="M4 6.2 10.5 5v6.3H4zM13 4.6l7-1.1v7.8h-7zM4 13.2h6.5v6.3L4 18.3zM13 13.2h7v7.8l-7-1.1z"/>',
        cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
        db: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
        storage: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 13h17M7 16h.01M10 16h.01"/>',
    };
    const glyphFor = (g) => {
        const t = `${g.tags || ''} ${g.name || ''}`.toLowerCase();
        if (/router|gateway|firewall|openwrt|ikuai|\broutero?s\b|\bros\b|pfsense|opnsense|softrouter|bypass|旁路|路由/.test(t)) {
            return 'router';
        }
        if (/nas|truenas|unraid|omv|synology|dsm|storage|backup|pbs/.test(t)) {
            return 'storage';
        }
        if (/db|mysql|postgres|redis|mariadb|mongo/.test(t)) {
            return 'db';
        }
        if (g.type === 'lxc') {
            return 'cube';
        }
        return /^win|^w2k/.test(String(g.ostype || '')) || /windows|win1[01]/.test(t) ? 'windows' : 'server';
    };
    // curated, evenly spaced hues (lightness tuned per hue so none looks muddy)
    const HUES = [234, 172, 262, 28, 199, 340, 152, 48];
    const ROLE = { system: '系统盘', mounted: '数据盘', unmounted: '未挂载', empty: '空盘', unknown: '磁盘' };

    function skeleton(shape) {
        const cores = shape.cores.map((type, i) =>
            `<div class="pvx-core${type ? ' pvx-core-' + type : ''}" data-h="c${i}"><b>${k(`c${i}-temp`)}°</b>` +
            `<div class="pvx-core-bar" data-b="c${i}"><i></i></div><span>${k(`c${i}-name`)}</span></div>`).join('');

        // disk card: role, model, partition map (width = size, fill = used), key SMART facts
        const disk = (d, i) => {
            const total = d.map.reduce((a, p) => a + p.size, 0) || 1;
            const segs = d.map.map((p, j) =>
                `<i class="pvx-pseg" data-kind="${p.kind}" style="flex-grow:${p.size / total}" data-b="d${i}-p${j}" title="${esc(p.label)}"><em></em></i>`).join('');
            const legend = d.map.map((p, j) => (p.size / total < 0.01 && p.kind !== 'root' ? '' :
                `<span data-kind="${p.kind}"><i></i>${esc(p.label)}<b>${k(`d${i}-p${j}`)}</b></span>`)).join('');
            return `<button type="button" class="pvx-disk2" data-action="disk:${i}" data-role="${d.role}">` +
                `<div class="pvx-dhero" data-b="d${i}-fill"><span class="pvx-role" data-role="${d.role}">${ROLE[d.role] || '磁盘'}</span>` +
                `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="t" cx="60" cy="60" r="50" pathLength="100"/><circle class="v" cx="60" cy="60" r="50" pathLength="100"/></svg>` +
                `<div class="pvx-dial"><strong>${esc(d.cap)}</strong><small>${k(`d${i}-fill`)}</small></div></div>` +
                `<div class="pvx-dmain"><header><span class="pvx-role pvx-role-inline" data-role="${d.role}">${ROLE[d.role] || '磁盘'} · ${esc(d.cap)}</span><b>${k(`d${i}-model`)}</b><span class="pvx-pill" data-k="d${i}-smart">—</span></header>` +
                `<small class="pvx-dsub">${k(`d${i}-sub`)}</small>` +
                `<div class="pvx-pmap">${segs || '<i class="pvx-pseg" data-kind="free" style="flex-grow:1"><em></em></i>'}</div>` +
                `<div class="pvx-plegend">${legend}</div>` +
                `<dl class="pvx-dstats"><div data-h="dh${i}"><dt>温度</dt><dd>${k(`d${i}-temp`)}</dd><i></i></div>` +
                `<div data-b="d${i}-wear"><dt>寿命已用</dt><dd>${k(`d${i}-used`)}</dd><i><em></em></i></div>` +
                `<div><dt>累计写入</dt><dd>${k(`d${i}-written`)}</dd></div><div><dt>通电时间</dt><dd>${k(`d${i}-hours`)}</dd></div></dl></div></button>`;
        };

        const gmeter = (key, label) =>
            `<span class="pvx-gm" data-b="${key}"><small>${label}</small><i><s></s></i><b>${k(key)}</b></span>`;
        const guest = (i) =>
            `<button type="button" class="pvx-guest" data-nav-k="g${i}-nav" data-k-state="g${i}-state" data-kind-k="g${i}-kind" data-title-k="g${i}-title">` +
            `<span class="pvx-gicon" data-k-hue="g${i}-hue"><span class="pvx-gglyph" data-html-k="g${i}-glyph"></span><i class="pvx-led"></i></span>` +
            `<span class="pvx-ghead"><i class="pvx-gid" data-k="g${i}-kindtag">—</i><b class="pvx-gname" data-k="g${i}-name">—</b><span class="pvx-gtags" data-html-k="g${i}-chips"></span></span>` +
            `<span class="pvx-gmeters">${gmeter(`g${i}-cpu`, 'CPU')}${gmeter(`g${i}-mem`, '内存')}</span>` +
            `<span class="pvx-gnet"><small>实时</small><span><i class="u">↑</i>${k(`g${i}-tx`)}</span><span><i class="d">↓</i>${k(`g${i}-rx`)}</span>` +
            `<small>今日</small><span><i class="u">↑</i>${k(`g${i}-txd`)}</span><span><i class="d">↓</i>${k(`g${i}-rxd`)}</span></span></button>`;
        const alloc = (key, label) =>
            `<div class="pvx-alloc-item" data-b="${key}"><div><span>${label}</span><b>${k(key)}</b></div><i><em></em></i><small>${k(key + '-note')}</small></div>`;
        const filter = (f, label) => `<button type="button" data-filter="${f}" aria-pressed="${f === 'all'}">${label}<em>${k('f-' + f)}</em></button>`;

        return `<div class="pvx-wrap">
<div class="pvx-alert" data-k-state="health-state" role="status"><i class="fa fa-exclamation-triangle"></i><b>${k('health')}</b><span>${k('health-note')}</span></div>
<div class="pvx-bento">
  <section class="pvx-tile pvx-cpu">${head('处理器', k('cpu-model'), more('cpu'))}
    <div class="pvx-row">
      <div class="pvx-big"><b>${k('cpu')}</b><span>%</span><small>${k('cpu-threads')}</small></div>
      <dl class="pvx-stats">${fact('封装温度', 'cpu-temp')}${fact('1 小时均值', 'cpu-avg')}${fact('1 小时峰值', 'cpu-peak')}${fact('I/O 等待', 'io')}</dl>
    </div>
    ${chart('cpu', 132)}${axis('cpu')}
    <div class="pvx-cores-head"><span>核心 · 柱高为当前频率，颜色为温度</span><span>${k('cpu-topology')}</span></div>
    <div class="pvx-cores">${cores || '<p class="pvx-empty">暂无核心传感器数据</p>'}</div>
  </section>
  <section class="pvx-tile pvx-power">${head('功耗与频率', '实时 · 近 3 分钟')}
    <div class="pvx-big"><b>${k('power')}</b><span>W</span><small>${k('power-note')}</small></div>
    ${chart('power', 70)}
    <dl class="pvx-grid3">${fact('平均频率', 'freq')}${fact('最高频率', 'freq-max')}${fact('调速器', 'governor')}</dl>
  </section>
  <section class="pvx-tile pvx-net">${head('网络', k('net-meta'), '<span class="pvx-seg2" role="group" aria-label="时间范围"><button type="button" data-net-range="hour">1 小时</button><button type="button" data-net-range="day">今日</button></span>')}
    <div class="pvx-row pvx-net-now">
      <div class="pvx-big pvx-in"><i>${fa('arrow-down')}</i><b>${k('net-in')}</b><span>${k('net-in-u')}</span></div>
      <div class="pvx-big pvx-out"><i>${fa('arrow-up')}</i><b>${k('net-out')}</b><span>${k('net-out-u')}</span></div>
      <dl class="pvx-stats">${fact(k('net-in-label'), 'net-in-total')}${fact(k('net-out-label'), 'net-out-total')}</dl>
    </div>
    ${chart('net', 112)}${axis('net')}<div class="pvx-legend"><span><i class="c-in"></i>接收</span><span><i class="c-out"></i>发送</span><span class="pvx-legend-r">${k('net-link')}</span></div>
  </section>
  <section class="pvx-tile pvx-sys">
    <div class="pvx-sys-col pvx-mem">${head('内存', k('mem-total'))}
      <div class="pvx-big"><b>${k('mem-used')}</b><span>GiB</span><small>${k('mem-pct')}</small></div>
      ${seg('mem')}
      ${chart('mem', 60)}
      <dl class="pvx-grid3">${fact('可用', 'mem-avail')}${fact('交换区', 'swap')}${fact('KSM 共享', 'ksm')}</dl>
    </div>
    <div class="pvx-sys-col pvx-store">${head('存储', k('store-meta'))}
      <div class="pvx-disks">${shape.disks.map(disk).join('') || '<p class="pvx-empty">未检测到 NVMe 硬盘</p>'}</div>
    </div>
  </section>
  <section class="pvx-tile pvx-guests" data-filter="all">${head('虚拟机与容器', '',
        '<span class="pvx-create" data-k-state="can-create"><button type="button" data-create="qemu" title="新建虚拟机">' + fa('plus') + ' VM</button><button type="button" data-create="lxc" title="新建容器">' + fa('plus') + ' CT</button></span>')}
    <div class="pvx-alloc">${alloc('alloc-cpu', 'vCPU 分配')}${alloc('alloc-mem', '内存分配')}</div>
    <div class="pvx-gfilter" role="group" aria-label="筛选">${filter('all', '全部')}${filter('running', '运行中')}${filter('stopped', '未运行')}</div>
    <div class="pvx-guestlist">${range(shape.guests).map(guest).join('')}${shape.guests ? `<div class="pvx-gadd" data-k-state="can-create"><button type="button" data-create="qemu">${fa('plus')} 新建虚拟机</button><button type="button" data-create="lxc">${fa('plus')} 新建容器</button></div>` : ''}${shape.guests ? '' : '<p class="pvx-empty">本节点暂无虚拟机或容器<br>点右上角 + VM / + CT 创建</p>'}</div>
  </section>
</div>
<footer class="pvx-foot"><span>${fa('server')} ${k('node')}</span><span>${fa('clock-o')} 已运行 ${k('uptime')}</span><span>${fa('tasks')} 负载 ${k('load')}</span><span>${fa('linux')} ${k('kernel')}</span><span>${fa('cube')} Proxmox VE ${k('version')}</span><span>${fa('power-off')} ${k('boot')}</span><span class="pvx-foot-r">更新于 ${k('updated')}</span></footer>
</div>`;
    }

    // ---------------------------------------------------------------- detail dialogs
    function detail(action, shape) {
        const pair = (label, key) => `<div><dt>${label}</dt><dd>${k(key)}</dd></div>`;
        let body;
        if (action === 'cpu') {
            const rows = shape.cores
                .map((_, i) => `<tr><td>${k(`c${i}-name`)}</td><td>${k(`c${i}-kind`)}</td><td>${k(`c${i}-threads`)}</td><td>${k(`c${i}-temp`)}°C</td><td>${k(`c${i}-freqs`)}</td></tr>`)
                .join('');
            body = `<dl class="pvx-dl">${pair('型号', 'cpu-model-full')}${pair('拓扑', 'cpu-topology')}${pair('封装温度', 't-pkg-t')}${pair('临界温度', 'cpu-crit')}` +
                `${pair('封装功耗', 'power')}${pair('调速器 / 驱动', 'cpu-driver')}</dl>` +
                `<table><thead><tr><th>核心</th><th>类型</th><th>线程</th><th>温度</th><th>各线程频率 GHz</th></tr></thead><tbody>${rows}</tbody></table>`;
        } else {
            const d = 'd' + action.split(':')[1];
            body = `<dl class="pvx-dl">${pair('型号', `${d}-model`)}${pair('设备', `${d}-dev`)}${pair('固件', `${d}-firmware`)}${pair('容量', `${d}-capacity`)}` +
                `${pair('SMART 状态', `${d}-smart`)}${pair('温度', `${d}-temp`)}${pair('告警 / 临界温度', `${d}-limits`)}${pair('已用寿命（估算）', `${d}-used`)}` +
                `${pair('可用备用空间', `${d}-spare`)}${pair('累计写入', `${d}-written`)}${pair('累计读取', `${d}-read`)}${pair('通电时间', `${d}-hours`)}` +
                `${pair('通电次数', `${d}-cycles`)}${pair('异常断电', `${d}-unsafe`)}${pair('介质错误', `${d}-media`)}${pair('SMART 读取时间', `${d}-checked`)}</dl>` +
                `<p class="pvx-note">寿命为厂商估算值；异常断电是累计计数，不代表当前故障。读写量按十进制单位计算，SMART 数据每分钟更新一次。</p>`;
        }
        return `<div class="pvx pvx-dialog">${body}</div>`;
    }

    // ---------------------------------------------------------------- charts
    // Smooth path through points (Catmull-Rom as cubic Bézier), y clamped to the plot.
    function smooth(pts) {
        if (pts.length < 2) {
            return '';
        }
        let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2] || p2;
            const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
            const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
            d += ` C${c1[0].toFixed(1)} ${clamp(c1[1], 0, 100).toFixed(1)} ${c2[0].toFixed(1)} ${clamp(c2[1], 0, 100).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
        }
        return d;
    }
    const niceMax = (v, floor) => {
        const m = Math.max(floor, v * 1.15);
        const p = 10 ** Math.floor(Math.log10(m));
        return [1, 2, 2.5, 5, 10].map((f) => f * p).find((n) => n >= m);
    };
    // series: [{ values, cls, dir }], dir 1 draws upwards from the baseline, -1 downwards (mirrored chart)
    function chartSvg(id, series, max, mirrored) {
        const base = mirrored ? 50 : 100;
        const span = mirrored ? 47 : 96;
        let out = `<defs>${series.map((s, i) => `<linearGradient id="pvx-g-${id}-${i}" x1="0" x2="0" y1="${s.dir < 0 ? 1 : 0}" y2="${s.dir < 0 ? 0 : 1}">` +
            `<stop offset="0" class="${s.cls}" stop-opacity=".32"/><stop offset="1" class="${s.cls}" stop-opacity="0"/></linearGradient>`).join('')}</defs>`;
        out += `<g class="pvx-grid">${(mirrored ? [50] : [25, 50, 75]).map((y) => `<line x1="0" x2="300" y1="${y}" y2="${y}"/>`).join('')}</g>`;
        series.forEach((s, i) => {
            const n = s.values.length;
            // unknown points (null) break the line instead of being drawn as zero
            const runs = [];
            let run = null;
            s.values.forEach((v, j) => {
                if (num(v) === null) {
                    run = null;
                    return;
                }
                if (!run) {
                    run = [];
                    runs.push(run);
                }
                run.push([n > 1 ? (j / (n - 1)) * 300 : 0, base - (s.dir || 1) * (clamp(v, 0, max) / max) * span]);
            });
            runs.forEach((pts) => {
                const line = pts.length > 1 ? smooth(pts) : n > 1 ? `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}h.1` : '';
                if (line) {
                    const x0 = pts[0][0].toFixed(1);
                    const x1 = pts[pts.length - 1][0].toFixed(1);
                    out += `<path class="area" fill="url(#pvx-g-${id}-${i})" d="${line} L${x1} ${base} L${x0} ${base} Z"/>`;
                    out += `<path class="line ${s.cls}" d="${line}"/>`;
                }
            });
        });
        return out;
    }

    // ---------------------------------------------------------------- partitions
    // Flatten lsblk output into the segments shown on the bar: top-level partitions, with LVM / crypt
    // children replacing their parent so the bar shows root and swap rather than "LVM2_member".
    function partitionMap(d) {
        const parts = Array.isArray(d.parts) ? d.parts : [];
        const out = [];
        parts.forEach((p, idx) => {
            if (p.depth !== 0) {
                return;
            }
            const kids = [];
            for (let j = idx + 1; j < parts.length && parts[j].depth > 0; j++) {
                if (parts[j].depth === 1) {
                    kids.push(parts[j]);
                }
            }
            (kids.length ? kids : [p]).forEach((x) => {
                const mounts = String(x.mount || '').split(' ').filter(Boolean);
                let kind = 'free';
                let label = `${String(x.fstype || '未格式化').toUpperCase()} · 未挂载`;
                if (mounts.includes('/')) {
                    [kind, label] = ['root', '根分区'];
                } else if (mounts.includes('[SWAP]')) {
                    [kind, label] = ['swap', 'Swap'];
                } else if (mounts.some((m) => m.startsWith('/boot')) || /EFI/i.test(x.label || '')) {
                    [kind, label] = ['efi', 'EFI'];
                } else if (/BIOS boot/i.test(x.label || '')) {
                    [kind, label] = ['bios', 'BIOS boot'];
                } else if (mounts.length) {
                    [kind, label] = ['data', mounts[0]];
                }
                out.push({ kind, label, size: num(x.size) || 0, used: x.used, fssize: x.fssize });
            });
        });
        return out;
    }

    // ---------------------------------------------------------------- model
    function build(data, resources, nodeName, ctx = {}) {
        const values = {};
        const put = (key, text, tone = '', pct) => {
            values[key] = { text: String(text ?? '—'), tone, pct };
        };
        const issues = [];

        const cpuinfo = data.cpuinfo || {};
        const memory = data.memory || {};
        const rootfs = data.rootfs || {};
        const hw = data.hwinfo || {};
        const cpu = hw.cpu || {};
        const pkg = cpu.package || {};
        const cores = Array.isArray(cpu.cores) ? cpu.cores : [];
        const disks = Array.isArray(hw.nvme) ? hw.nvme : [];
        const rows = (Array.isArray(ctx.trend) ? ctx.trend : []).filter((r) => num(r.time) !== null).sort((a, b) => a.time - b.time);
        const live = Array.isArray(ctx.live) ? ctx.live : [];
        const pick = (fn) => rows.map((r) => { const v = fn(r); return num(v); }).filter((v) => v !== null);

        // identity
        const model = String(cpuinfo.model || '').replace(/\((R|TM)\)/g, '').replace(/^\d+\w* Gen /, '').replace(/\s+/g, ' ').trim();
        const boot = data['boot-info'] || {};
        const bootText = boot.mode === 'efi' ? `UEFI${boot.secureboot ? ' · 安全启动' : ''}` : boot.mode === 'legacy-bios' ? 'Legacy BIOS' : '—';
        const version = (String(data.pveversion || '').match(/pve-manager\/([\d.]+)/) || [])[1] || data.pveversion || '—';
        put('node', nodeName || '—');
        put('sub', [model, num(memory.total) !== null ? `${bytes(memory.total)} 内存` : null, disks.length ? `${disks.length} 块 NVMe` : null].filter(Boolean).join(' · '));
        put('uptime', duration(data.uptime));
        const load = Array.isArray(data.loadavg) ? data.loadavg.map(Number).filter(Number.isFinite) : [];
        put('load', load.length ? load.map((v) => v.toFixed(2)).join(' · ') : '—', level(load[0] / (cpuinfo.cpus || 1), 0.8, 1.2));
        put('kernel', data['current-kernel']?.release || data.kversion || '—');
        put('version', version);
        put('boot', bootText);
        put('updated', new Date().toLocaleTimeString('zh-CN', { hour12: false }));

        // CPU
        const cpuPct = num(data.cpu) === null ? null : data.cpu * 100;
        const cpuHist = pick((r) => r.cpu * 100);
        const nP = cores.filter((c) => c.type === 'P').length;
        const nE = cores.filter((c) => c.type === 'E').length;
        put('cpu', fixed(cpuPct, 1), level(cpuPct, 80, 95));
        put('cpu-threads', `${count(cpuinfo.cpus)} 线程`);
        put('cpu-model', model || '—');
        put('cpu-model-full', cpuinfo.model || '—');
        put('cpu-topology', nP && nE ? `${nP} 性能核 + ${nE} 能效核` : `${count(cpuinfo.cores)} 核`);
        put('cpu-avg', cpuHist.length ? `${avg(cpuHist).toFixed(1)}%` : '—');
        put('cpu-peak', cpuHist.length ? `${Math.max(...cpuHist).toFixed(1)}%` : '—');
        const ioPct = num(data.wait) === null ? null : data.wait * 100;
        put('io', `${fixed(ioPct, 2)}%`, level(ioPct, 10, 30));
        if (level(cpuPct, 80, 95)) {
            issues.push('CPU 负载高');
        }
        const cpuSeries = cpuHist.concat(cpuPct === null ? [] : [cpuPct]);
        const cpuMax = niceMax(Math.max(0, ...cpuSeries), 10);
        values['svg:cpu'] = chartSvg('cpu', [{ values: cpuSeries, cls: 'c-cpu' }], cpuMax);
        put('cpu-ymax', `${cpuMax}%`);
        const times = rows.map((r) => r.time * 1000);
        put('cpu-t0', times.length ? clock(times[0]) : '—');
        put('cpu-t1', times.length ? clock(times[Math.floor(times.length / 2)]) : '—');
        values['tip:cpu'] = { times: times.concat(cpuPct === null ? [] : [Date.now()]), rows: [['CPU', cpuSeries.map((v) => `${v.toFixed(1)}%`), 'c-cpu']] };

        // cores: bar height = current frequency against the highest frequency seen, colour = temperature
        const fmax = Math.max(ctx.fmax || 0, ...cores.flatMap((c) => c.mhz || []).filter((v) => num(v) !== null));
        const seen = {};
        cores.forEach((c, i) => {
            const type = c.type === 'P' || c.type === 'E' ? c.type : '';
            const mhz = (c.mhz || []).filter((v) => num(v) !== null);
            seen[type] = (seen[type] || 0) + 1;
            put(`c${i}-name`, (type || '#') + seen[type]);
            put(`c${i}-kind`, { P: '性能核', E: '能效核' }[type] || '—');
            put(`c${i}-threads`, (c.threads || []).join(', '));
            put(`c${i}-temp`, fixed(c.temp, 0));
            put(`c${i}-freqs`, mhz.map((v) => (v / 1000).toFixed(2)).join(' · ') || '—');
            values[`c${i}`] = { pct: fmax > 0 && mhz.length ? clamp((Math.max(...mhz) / fmax) * 100, 4) : 4, heat: heat(c.temp) };
        });

        // memory
        const memPct = ratio(memory.used, memory.total);
        put('mem-used', num(memory.used) === null ? '—' : (memory.used / 2 ** 30).toFixed(1));
        put('mem-total', `共 ${bytes(memory.total)}`);
        put('mem-pct', `${fixed(memPct, 1)}%`, level(memPct, 85, 95));
        put('mem', '', level(memPct, 85, 95), memPct);
        put('mem-avail', bytes(memory.available ?? memory.free));
        const memHist = pick((r) => (r.memused / r.memtotal) * 100).concat(memPct === null ? [] : [memPct]);
        const memMax = niceMax(Math.max(0, ...memHist), 10);
        values['svg:mem'] = chartSvg('mem', [{ values: memHist, cls: 'c-mem' }], memMax);
        put('mem-ymax', `${memMax}%`);
        values['tip:mem'] = { times: rows.map((r) => r.time * 1000).concat(memPct === null ? [] : [Date.now()]), rows: [['内存', memHist.map((v) => `${v.toFixed(1)}%`), 'c-mem']] };
        put('swap', `${bytes(data.swap?.used)} / ${bytes(data.swap?.total)}`);
        put('ksm', bytes(data.ksm?.shared));
        const rootPct = ratio(rootfs.used, rootfs.total);
        put('root', `${fixed(rootPct, 1)}%`, level(rootPct, 80, 90));
        put('root-detail', `${bytes(rootfs.used)} / ${bytes(rootfs.total)} · ${fixed(rootPct, 1)}%`);
        values['root-bar'] = { text: '', tone: level(rootPct, 80, 90), pct: rootPct };
        if (level(rootPct, 80, 90) && !disks.some((d) => d.role === 'system')) {
            issues.push('系统分区空间不足'); // root is not on an NVMe disk shown below
        }
        if (level(memPct, 85, 95)) {
            issues.push('内存紧张');
        }

        // power & frequency (live buffer collected by the view, ~1 sample per second)
        const watts = live.map((s) => s.w).filter((v) => num(v) !== null);
        put('power', fixed(cpu.power_w, 1));
        put('power-note', watts.length > 5 ? `均值 ${avg(watts).toFixed(1)} W · 峰值 ${Math.max(...watts).toFixed(1)} W` : '采集中…');
        const pMax = niceMax(Math.max(0, ...watts), 5);
        values['svg:power'] = chartSvg('power', [{ values: watts, cls: 'c-power' }], pMax);
        put('power-ymax', `${pMax} W`);
        values['tip:power'] = { times: live.filter((s) => num(s.w) !== null).map((s) => s.t), rows: [['功耗', watts.map((v) => `${v.toFixed(1)} W`), 'c-power']] };
        const allMhz = cores.flatMap((c) => c.mhz || []).filter((v) => num(v) !== null);
        put('freq', allMhz.length ? `${(avg(allMhz) / 1000).toFixed(2)} GHz` : '—');
        put('freq-max', allMhz.length ? `${(Math.max(...allMhz) / 1000).toFixed(2)} GHz` : '—');
        put('governor', cpu.governor || '—');
        put('cpu-driver', [cpu.governor, cpu.driver].filter(Boolean).join(' / ') || '—');

        // network (node rrd, 1-minute averages)
        const last = rows.length ? rows[rows.length - 1] : {};
        const [inV, inU] = bits(last.netin);
        const [outV, outU] = bits(last.netout);
        put('net-in', inV);
        put('net-in-u', inU);
        put('net-out', outV);
        put('net-out-u', outU);
        // range "hour": node rrd (1-minute points); range "day": local midnight to the last complete minute,
        // summed server-side (5-minute points). The selected range is always kept: without today's data the
        // tile says so instead of showing the hour. Unknown minutes stay unknown (null) and are never drawn or
        // counted as zero; a total that misses minutes is a lower bound and is marked with "≥".
        const day = ctx.netRange === 'day';
        const tr = hw.traffic && typeof hw.traffic === 'object' ? hw.traffic : null;
        const span = num(tr?.end) !== null && num(tr?.start) !== null ? tr.end - tr.start : null;
        const covered = (v, secs) => num(v) !== null && span !== null && num(secs) !== null && secs >= span;
        const dnode = day && tr?.node && typeof tr.node === 'object' ? tr.node : null;
        let ser;
        let tot;
        if (day) {
            ser = (Array.isArray(dnode?.series) ? dnode.series : []).filter((r) => Array.isArray(r) && num(r[0]) !== null).map((r) => [r[0], num(r[1]), num(r[2])]);
            tot = [[dnode?.in, dnode?.in_secs], [dnode?.out, dnode?.out_secs]].map(([v, secs]) => ({ v: num(v), partial: num(v) !== null && !covered(v, secs) }));
        } else {
            ser = rows.map((r) => [r.time, num(r.netin), num(r.netout)]);
            tot = [1, 2].map((i) => {
                const known = ser.filter((r) => r[i] !== null);
                return { v: known.length ? known.reduce((a, r) => a + r[i], 0) * 60 : null, partial: known.length > 0 && known.length < ser.length };
            });
        }
        const inH = ser.map((r) => r[1]);
        const outH = ser.map((r) => r[2]);
        const nTimes = ser.map((r) => r[0] * 1000);
        const total = (d) => (d.v === null ? '—' : `${d.partial ? '≥ ' : ''}${bytes(d.v, 1000)}`);
        put('net-meta', !day ? '节点合计' : !dnode ? '今日数据不可用' : tot[0].v === null && tot[1].v === null ? '今日暂无数据' : tot.some((d) => d.partial) ? '0 点起 · 部分缺测' : '节点合计 · 0 点起');
        put('net-in-label', day ? '今日接收' : '1 小时接收');
        put('net-out-label', day ? '今日发送' : '1 小时发送');
        put('net-in-total', total(tot[0]));
        put('net-out-total', total(tot[1]));
        const known = inH.concat(outH).filter((v) => v !== null);
        const netMax = niceMax(Math.max(1, ...known), 1000);
        values['svg:net'] = chartSvg('net', [{ values: outH, cls: 'c-out' }, { values: inH, cls: 'c-in' }], netMax);
        put('net-ymax', bits(netMax).join(' '));
        put('net-link', day ? '每点为 5 分钟平均，含虚拟机桥接流量' : '每点为 1 分钟平均，含虚拟机桥接流量');
        put('net-t0', nTimes.length ? clock(nTimes[0]) : '—');
        put('net-t1', nTimes.length ? clock(nTimes[Math.floor(nTimes.length / 2)]) : '—');
        const rateText = (v) => (v === null ? '—' : bits(v).join(' '));
        values['tip:net'] = { times: nTimes, rows: [['接收', inH.map(rateText), 'c-in'], ['发送', outH.map(rateText), 'c-out']] };

        // temperatures: track runs from 20 °C to the critical limit, the tick marks the warning limit
        const crit = num(pkg.crit) ?? 100;
        const therm = (key, t, hi, cr, sub) => {
            const lo = 20;
            const top = num(cr) ?? 100;
            const tone = level(t, num(hi) ?? top - 15, top - 3);
            put(`${key}-t`, fixed(t, 0), tone);
            put(`${key}-sub`, sub);
            values[key] = { text: '', tone, pct: num(t) === null ? 0 : clamp(((t - lo) / (top - lo)) * 100), hi: num(hi) === null ? null : clamp(((hi - lo) / (top - lo)) * 100), heat: heat(t) };
            if (tone) {
                issues.push(`${sub || key} 温度偏高`);
            }
        };
        const coreTemps = cores.map((c) => c.temp).filter((v) => num(v) !== null);
        therm('t-pkg', pkg.temp, crit - 20, crit, `临界 ${fixed(crit, 0)}°C`);
        therm('t-core', coreTemps.length ? Math.max(...coreTemps) : null, crit - 20, crit, coreTemps.length ? `均值 ${avg(coreTemps).toFixed(0)}°C` : '—');
        put('cpu-crit', `${fixed(crit, 0)}°C`);
        put('cpu-temp', num(pkg.temp) === null ? '—' : `${pkg.temp.toFixed(0)}°C`, values['t-pkg']?.tone || '');

        // disks
        put('store-meta', `${disks.length} 块 NVMe · 共 ${bytes(disks.reduce((a, d) => a + (num(d.capacity) || 0), 0), 1000)}`);
        disks.forEach((d, i) => {
            const id = `d${i}`;
            let smart = ['状态未知', 'muted'];
            if (d.passed === 0) {
                smart = ['SMART 异常', 'danger'];
            } else if (num(d.critical_warning) > 0) {
                smart = ['设备告警', 'warn'];
            } else if (num(d.media_errors) > 0) {
                smart = ['有介质错误', 'warn'];
            } else if (d.passed === 1) {
                smart = ['健康', 'good'];
            }
            if (smart[1] === 'danger' || smart[1] === 'warn') {
                issues.push(`${d.name} ${smart[0]}`);
            }
            const modelName = String(d.model || '未知型号').trim();
            therm(`t-${id}`, d.temp, d.temp_high, d.temp_crit, modelName);
            {
                const fs = partitionMap(d).filter((x) => (x.kind === 'root' || x.kind === 'data') && num(x.fssize) > 0);
                const used = fs.reduce((a, x) => a + (num(x.used) || 0), 0);
                const size = fs.reduce((a, x) => a + x.fssize, 0);
                const pct = size ? (used / size) * 100 : null;
                put(`${id}-fill`, pct === null ? '未使用' : `已用 ${pct.toFixed(0)}%`, level(pct, 80, 90), pct === null ? 0 : Math.max(pct, 1.5));
                values[`${id}-fill`].empty = pct === null;
            }
            partitionMap(d).forEach((part, j) => {
                const pct = part.kind === 'swap' ? ratio(data.swap?.used, data.swap?.total)
                    : part.kind === 'bios' ? 100
                    : num(part.used) !== null && num(part.fssize) > 0 ? (part.used / part.fssize) * 100 : 0;
                const txt = part.kind === 'swap' ? `${bytes(data.swap?.used)} / ${bytes(part.size)}`
                    : num(part.used) !== null && num(part.fssize) > 0 ? `${bytes(part.used)} / ${bytes(part.fssize)}`
                    : bytes(part.size);
                const tone = part.kind === 'root' || part.kind === 'data' ? level(pct, 80, 90) : '';
                if (tone && part.kind === 'root') {
                    issues.push('系统分区空间不足');
                }
                put(`${id}-p${j}`, txt, tone, pct);
            });
            const used = num(d.percentage_used);
            put(`${id}-model`, modelName);
            put(`${id}-sub`, `/dev/${d.name} · ${bytes(d.capacity, 1000)}${d.role === 'system' ? ' · PVE 安装盘' : d.role === 'unmounted' ? ' · 未被 PVE 使用' : ''}`);
            put(`${id}-dev`, `/dev/${d.name}`);
            put(`${id}-firmware`, d.firmware || '—');
            put(`${id}-capacity`, bytes(d.capacity, 1000));
            put(`${id}-smart`, ...smart);
            values[`dh${i}`] = { heat: heat(d.temp) };
            put(`${id}-temp`, num(d.temp) === null ? '—' : `${d.temp.toFixed(0)}°C`, level(d.temp, (num(d.temp_high) ?? 75) - 10, num(d.temp_high) ?? 75));
            put(`${id}-limits`, `${fixed(d.temp_high, 0)}°C / ${fixed(d.temp_crit, 0)}°C`);
            put(`${id}-used`, used === null ? '—' : `${used}%`, level(used, 80, 100));
            values[`${id}-wear`] = { text: '', tone: level(used, 80, 100), pct: used === null ? 0 : Math.max(clamp(used), 2) };
            put(`${id}-spare`, num(d.available_spare) === null ? '—' : `${d.available_spare}%`);
            put(`${id}-written`, bytes(d.written_bytes, 1000));
            put(`${id}-read`, bytes(d.read_bytes, 1000));
            put(`${id}-hours`, num(d.power_on_hours) === null ? '—' : `${count(d.power_on_hours)} h`);
            put(`${id}-cycles`, `${count(d.power_cycles)} 次`);
            put(`${id}-unsafe`, `${count(d.unsafe_shutdowns)} 次`);
            put(`${id}-media`, count(d.media_errors), num(d.media_errors) > 0 ? 'warn' : '');
            put(`${id}-checked`, num(d.checked) === null ? '—' : new Date(d.checked * 1000).toLocaleTimeString('zh-CN', { hour12: false }));
        });

        // guests on this node
        const guests = (resources || [])
            .filter((r) => (r.type === 'qemu' || r.type === 'lxc') && r.node === nodeName && !r.template)
            .sort((a, b) => a.vmid - b.vmid);
        const running = guests.filter((g) => g.status === 'running').length;
        put('guest-meta', guests.length ? `${running} 运行 / 共 ${guests.length}` : '暂无');
        put('f-all', guests.length);
        put('f-running', running);
        put('f-stopped', guests.length - running);
        const on = guests.filter((g) => g.status === 'running');
        const vcpu = on.reduce((a, g) => a + (num(g.maxcpu) || 0), 0);
        const vmem = on.reduce((a, g) => a + (num(g.maxmem) || 0), 0);
        const threads = num(cpuinfo.cpus);
        const cpuRatio = threads ? (vcpu / threads) * 100 : null;
        const memRatio = ratio(vmem, memory.total);
        put('alloc-cpu', `${vcpu} / ${count(threads)}`, cpuRatio > 100 ? 'warn' : '', cpuRatio);
        put('alloc-cpu-note', cpuRatio === null ? '—' : cpuRatio > 100 ? `超分 ${(vcpu / threads).toFixed(1)}×` : `占线程 ${cpuRatio.toFixed(0)}%`);
        put('alloc-mem', `${bytes(vmem)} / ${bytes(memory.total).replace(/\.\d+ /, ' ')}`, level(memRatio, 90, 100), memRatio);
        put('alloc-mem-note', memRatio === null ? '—' : `${memRatio.toFixed(0)}% · 剩余 ${bytes(Math.max(0, (memory.total || 0) - vmem))}`);
        guests.forEach((g, i) => {
            const id = `g${i}`;
            const on = g.status === 'running';
            const gCpu = on && num(g.cpu) !== null ? g.cpu * 100 : null;
            const gMem = on ? ratio(g.mem, g.maxmem) : null;
            const tags = String(g.tags || '').split(/[;, ]+/).filter(Boolean).slice(0, 3);
            put(`${id}-nav`, `${g.type}/${g.vmid}`);
            put(`${id}-kind`, g.type);
            put(`${id}-state`, '', on ? 'good' : g.status === 'paused' ? 'warn' : 'muted');
            put(`${id}-name`, g.name || `${g.type} ${g.vmid}`);
            put(`${id}-cpu`, gCpu === null ? '—' : `${gCpu.toFixed(1)}%`, level(gCpu, 80, 95), gCpu);
            put(`${id}-mem`, gMem === null ? '—' : `${gMem.toFixed(0)}%`, level(gMem, 85, 95), gMem);
            put(`${id}-up`, on ? duration(g.uptime) : { stopped: '已停止', paused: '已暂停' }[g.status] || '未运行');
            put(`${id}-cpu-cap`, `${count(g.maxcpu)} 核`);
            put(`${id}-mem-cap`, bytes(g.maxmem));
            put(`${id}-status`, { running: '运行中', stopped: '已停止', paused: '已暂停' }[g.status] || g.status || '未知', on ? 'good' : g.status === 'paused' ? 'warn' : 'muted');
            const nm = String(g.name || `${g.vmid}`);
            values[`${id}-glyph`] = { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[glyphFor(g)]}</svg>` };
            put(`${id}-hue`, String(HUES[(num(g.vmid) || nm.length) % HUES.length]));
            put(`${id}-kindtag`, `${g.type === 'lxc' ? 'CT' : 'VM'} ${g.vmid}`);
            values[`${id}-chips`] = {
                html: tags.filter((t) => t.toLowerCase() !== String(g.name || '').toLowerCase()).slice(0, 2).map((t) => `<i>${esc(t)}</i>`).join(''),
            };
            const rate = ctx.rates?.[`${g.type}/${g.vmid}`] || {};
            const bps = (v) => (num(v) === null ? '—' : bits(v).join(' '));
            put(`${id}-rx`, on ? bps(rate.netin) : '—');
            put(`${id}-tx`, on ? bps(rate.netout) : '—');
            // today's totals: null = unknown ("—"), "≥" = some minutes of today are missing (lower bound)
            const tg = tr?.guests && typeof tr.guests === 'object' ? tr.guests[g.vmid] : null;
            const gday = [[tg?.in, tg?.in_secs], [tg?.out, tg?.out_secs]].map(([v, secs]) => ({ v: num(v), partial: num(v) !== null && !covered(v, secs) }));
            const gtotal = (d) => (d.v === null ? '—' : `${d.partial ? '≥' : ''}${bytes(d.v, 1000)}`);
            put(`${id}-rxd`, gtotal(gday[0]));
            put(`${id}-txd`, gtotal(gday[1]));
            put(`${id}-title`, `${g.name || g.vmid} · ${on ? '已运行 ' + duration(g.uptime) : '未运行'} · 磁盘 ${on && num(rate.io) !== null ? bytes(rate.io, 1000) + '/s' : bytes(g.maxdisk)}${gday.some((d) => d.partial) ? ' · 今日流量部分缺测' : ''} · 点击打开`);
            put(`${id}-disk`, on ? (num(rate.io) === null ? 'I/O —' : `I/O ${bytes(rate.io, 1000)}/s`) : `磁盘 ${bytes(g.maxdisk)}`);
        });

        // overall health line
        if (issues.length) {
            put('health', `${issues.length} 项需要关注`);
            put('health-note', issues.slice(0, 2).join('，') + (issues.length > 2 ? ' …' : ''));
        } else {
            put('health', '一切正常');
            put('health-note', `温度、SMART、资源均在正常范围 · ${running}/${guests.length} 台运行`);
        }
        values['health-state'] = { text: '', tone: issues.length ? 'warn' : 'good' };

        const caps = Ext.state.Manager.get('GuiCap') || {};
        values['can-create'] = { text: caps.vms?.['VM.Allocate'] ? '1' : '' };
        const shape = {
            cores: cores.map((c) => (c.type === 'P' || c.type === 'E' ? c.type : '')),
            disks: disks.map((d) => ({ role: d.role || 'unknown', cap: bytes(d.capacity, 1000).replace(/\.\d+ /, ' '), map: partitionMap(d).map((x) => ({ kind: x.kind, label: x.label, size: x.size })) })),
            guests: guests.length,
        };
        return { values, shape, shapeKey: JSON.stringify(shape), fmax };
    }

    // ---------------------------------------------------------------- DOM update (values only; markup is rebuilt only when the shape changes)
    const tips = new WeakMap();
    function patch(root, values) {
        root.querySelectorAll('[data-k]').forEach((el) => {
            const v = values[el.dataset.k];
            if (!v) {
                return;
            }
            if (el.textContent !== v.text) {
                el.textContent = v.text;
            }
            if (el.dataset.tone !== v.tone) {
                el.dataset.tone = v.tone;
            }
        });
        root.querySelectorAll('[data-k-state]').forEach((el) => {
            const v = values[el.dataset.kState];
            el.dataset.state = v?.tone || v?.text || '';
        });
        root.querySelectorAll('[data-html-k]').forEach((el) => {
            const html = values[el.dataset.htmlK]?.html ?? '';
            if (el.dataset.html !== html) {
                el.innerHTML = html;
                el.dataset.html = html;
            }
        });
        root.querySelectorAll('[data-title-k]').forEach((el) => {
            el.title = values[el.dataset.titleK]?.text || '';
        });
        root.querySelectorAll('[data-k-hue]').forEach((el) => {
            el.style.setProperty('--hue', values[el.dataset.kHue]?.text || '220');
        });
        root.querySelectorAll('[data-kind-k]').forEach((el) => {
            el.dataset.kind = values[el.dataset.kindK]?.text || '';
        });
        root.querySelectorAll('[data-nav-k]').forEach((el) => {
            el.dataset.nav = values[el.dataset.navK]?.text || '';
        });
        root.querySelectorAll('[data-b]').forEach((el) => {
            const v = values[el.dataset.b];
            if (!v) {
                return;
            }
            el.dataset.tone = v.tone || '';
            el.style.setProperty('--pct', String(clamp(v.pct)));
            el.toggleAttribute('data-empty', !!v.empty);
            if (v.hi !== undefined && v.hi !== null) {
                el.style.setProperty('--hi', String(v.hi));
            }
        });
        root.querySelectorAll('[data-h]').forEach((el) => {
            const v = values[el.dataset.h];
            if (v?.heat) {
                el.style.setProperty('--heat', v.heat);
            }
        });
        root.querySelectorAll('[data-svg]').forEach((el) => {
            const svg = values['svg:' + el.dataset.svg];
            if (svg !== undefined && el.dataset.drawn !== svg.length + ':' + svg.slice(-80)) {
                el.innerHTML = svg;
                el.dataset.drawn = svg.length + ':' + svg.slice(-80);
            }
            const tip = values['tip:' + el.dataset.svg];
            if (tip) {
                tips.set(el.parentNode, tip);
            }
        });
    }

    // hover read-out for charts
    function hover(event) {
        const box = event.target.closest?.('.pvx-chart');
        const root = event.currentTarget;
        root.querySelectorAll('.pvx-chart.is-hover').forEach((c) => c !== box && c.classList.remove('is-hover'));
        const tip = box && tips.get(box);
        if (!tip || !tip.times.length) {
            return;
        }
        const rect = box.getBoundingClientRect();
        const n = tip.times.length;
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const i = Math.round(x * (n - 1));
        const left = n > 1 ? (i / (n - 1)) * 100 : 0;
        box.classList.add('is-hover');
        box.style.setProperty('--x', left + '%');
        const el = box.querySelector('.pvx-tip');
        el.innerHTML = `<b>${clock(tip.times[i])}</b>` + tip.rows.map(([label, vals, cls]) => `<span><i class="${cls}"></i>${label}<em>${vals[i] ?? '—'}</em></span>`).join('');
        el.dataset.side = left > 60 ? 'left' : 'right';
    }
    function leave(event) {
        event.currentTarget.querySelectorAll('.pvx-chart.is-hover').forEach((c) => c.classList.remove('is-hover'));
    }

    // ---------------------------------------------------------------- styles (follow the Proxmox light / dark theme variables)
    const css = `
.pvx{--bg:var(--pwt-panel-background,#fff);--ink:var(--pwt-text-color,#0f172a);--canvas:color-mix(in srgb,var(--ink) 3.5%,var(--bg));--tile:var(--bg);--sunk:color-mix(in srgb,var(--ink) 4%,var(--bg));--line:color-mix(in srgb,var(--ink) 9%,var(--bg));--faint:color-mix(in srgb,var(--ink) 6%,transparent);--muted:color-mix(in srgb,var(--ink) 55%,var(--bg));--soft:color-mix(in srgb,var(--ink) 72%,var(--bg));
--cpu:#7c5cff;--mem:#10b981;--in:#0ea5e9;--out:#f43f5e;--power:#f59e0b;--store:#6366f1;--good:#22c55e;--warn:#f59e0b;--danger:#ef4444;
overflow:hidden auto;container-type:inline-size;container-name:pvx;background:var(--canvas);color:var(--ink);font:13px/1.45 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-variant-numeric:tabular-nums;font-feature-settings:"tnum","cv11";-webkit-font-smoothing:antialiased}
.pvx *{box-sizing:border-box}.pvx h1,.pvx h3,.pvx p,.pvx dl,.pvx dt,.pvx dd{margin:0;padding:0;font:inherit;color:inherit}
.pvx button{font:inherit;color:inherit;text-align:inherit;background:none;border:0;padding:0;cursor:pointer}
.pvx [data-tone=warn]{--tone:var(--warn)}.pvx [data-tone=danger]{--tone:var(--danger)}.pvx [data-tone=good]{--tone:var(--good)}.pvx [data-tone=muted]{--tone:var(--muted)}
.pvx [data-k][data-tone=warn],.pvx [data-k][data-tone=danger]{color:var(--tone);font-weight:600}
.pvx-wrap{max-width:1680px;margin:0 auto;padding:22px 24px 16px;display:flex;flex-direction:column;gap:18px}

/* header */
.pvx-led{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
@keyframes pvx-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--good) 55%,transparent)}70%,100%{box-shadow:0 0 0 7px transparent}}
.pvx-stats dt,.pvx-grid2 dt,.pvx-grid3 dt{font-size:12px;color:var(--muted)}

/* bento grid */
.pvx-bento{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;grid-template-areas:"cpu cpu" "net pow" "sys sys" "gst gst"}
.pvx-cpu{grid-area:cpu}.pvx-power{grid-area:pow}.pvx-net{grid-area:net}.pvx-sys{grid-area:sys}.pvx-guests{grid-area:gst}
.pvx-tile{min-width:0;display:flex;flex-direction:column;gap:14px;padding:18px 20px;background:var(--tile);border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgb(0 0 0/.04)}
.pvx-th{display:flex;align-items:center;gap:10px;min-height:22px}
.pvx-th h3{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;white-space:nowrap}
.pvx-dot{width:8px;height:8px;border-radius:3px;background:var(--c)}
.pvx-meta{flex:1;min-width:0;text-align:right;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pvx-more{display:grid;place-items:center;flex:none;width:26px;height:22px;border-radius:7px;color:var(--muted)!important;transition:background .15s,color .15s}
.pvx-more:hover{background:var(--sunk);color:var(--ink)!important}
.pvx-cpu{--c:var(--cpu)}.pvx-mem{--c:var(--mem)}.pvx-power{--c:var(--power)}.pvx-net{--c:var(--in)}.pvx-store{--c:var(--store)}.pvx-guests{--c:#14b8a6}
.pvx-row{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
.pvx-big{display:flex;align-items:baseline;gap:4px;min-width:0;line-height:1}
.pvx-big b{font-size:44px;font-weight:650;letter-spacing:-.035em}
.pvx-big>span{font-size:16px;font-weight:550;color:var(--muted)}
.pvx-big small{margin-left:10px;font-size:12px;color:var(--muted);white-space:nowrap}
.pvx-stats{display:flex;gap:26px}
.pvx-stats dd{font-size:15px;font-weight:600;white-space:nowrap}

/* charts */
.pvx-chart{position:relative;height:var(--h);margin:0 -4px}
.pvx-chart svg{display:block;width:100%;height:100%;overflow:visible}
.pvx-chart .pvx-grid line{stroke:var(--faint);stroke-width:1;vector-effect:non-scaling-stroke;stroke-dasharray:3 4}
.pvx-chart .line{fill:none;stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.pvx .c-cpu{stroke:var(--cpu);stop-color:var(--cpu);background:var(--cpu)}.pvx .c-power{stroke:var(--power);stop-color:var(--power);background:var(--power)}
.pvx .c-mem{stroke:var(--mem);stop-color:var(--mem);background:var(--mem)}.pvx .c-in{stroke:var(--in);stop-color:var(--in);background:var(--in)}.pvx .c-out{stroke:var(--out);stop-color:var(--out);background:var(--out)}
.pvx-ymax{position:absolute;top:-2px;right:4px;font-size:11px;color:var(--muted);pointer-events:none}
.pvx-cross{position:absolute;top:0;bottom:0;left:var(--x,0);width:1px;background:color-mix(in srgb,var(--ink) 30%,transparent);opacity:0;pointer-events:none}
.pvx-tip{position:absolute;top:8px;left:var(--x,0);z-index:2;min-width:120px;padding:8px 10px;border-radius:10px;font-size:12px;background:color-mix(in srgb,var(--bg) 92%,transparent);border:1px solid var(--line);box-shadow:0 10px 30px -12px rgb(0 0 0/.35);backdrop-filter:blur(8px);opacity:0;pointer-events:none;transform:translateX(10px);transition:opacity .12s}
.pvx-tip[data-side=left]{transform:translateX(calc(-100% - 10px))}
.pvx-tip b{display:block;margin-bottom:4px;font-weight:600}
.pvx-tip span{display:flex;align-items:center;gap:6px;color:var(--muted);white-space:nowrap}
.pvx-tip span i{width:8px;height:8px;border-radius:2px}
.pvx-tip em{margin-left:auto;padding-left:12px;font-style:normal;font-weight:600;color:var(--ink)}
.pvx-chart.is-hover .pvx-cross,.pvx-chart.is-hover .pvx-tip{opacity:1}
.pvx-legend{display:flex;gap:16px;font-size:12px;color:var(--muted)}.pvx-legend span{display:flex;align-items:center;gap:6px}.pvx-legend i{width:10px;height:3px;border-radius:2px}.pvx-legend-r{margin-left:auto}
.pvx-axis{display:flex;justify-content:space-between;margin-top:-8px;font-size:11px;color:var(--muted)}

/* cores */
.pvx-cores-head{display:flex;justify-content:space-between;gap:12px;margin-top:4px;font-size:12px;color:var(--muted)}
.pvx-cores{display:flex;align-items:flex-end;gap:6px;height:118px;padding-top:2px}
.pvx-core{--heat:hsl(205 85% 52%);flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%}
.pvx-core-P{flex-grow:1.45}
.pvx-core b{font-size:12px;font-weight:600}
.pvx-core-bar{position:relative;flex:1;width:100%;border-radius:7px;background:repeating-linear-gradient(0deg,var(--sunk) 0 3px,transparent 3px 6px);overflow:hidden}
.pvx-core-bar i{position:absolute;left:0;right:0;bottom:0;height:calc(var(--pct,4) * 1%);border-radius:7px;background:linear-gradient(180deg,var(--heat),color-mix(in srgb,var(--heat) 55%,var(--bg)));transition:height .6s cubic-bezier(.2,.8,.2,1),background .6s}
.pvx-core>span{font-size:11px;color:var(--muted);font-weight:550}
.pvx-core-P>span{color:var(--cpu)}

/* memory / segmented meters */
.pvx-seg{height:22px;border-radius:6px;background:linear-gradient(90deg,var(--tone,var(--c)) calc(var(--pct,0) * 1%),var(--sunk) 0);-webkit-mask:repeating-linear-gradient(90deg,#000 0 7px,transparent 7px 10px);mask:repeating-linear-gradient(90deg,#000 0 7px,transparent 7px 10px);transition:background .6s}
.pvx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px}
.pvx-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.pvx-grid2 dd,.pvx-grid3 dd{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pvx-power{justify-content:space-between}

/* network */
.pvx-net-now{align-items:center}
.pvx-in,.pvx-out{gap:6px}
.pvx-in b,.pvx-out b{font-size:32px}
.pvx-in>i,.pvx-out>i{align-self:center;display:grid;place-items:center;width:24px;height:24px;border-radius:7px;font-size:12px;font-style:normal}
.pvx-in>i{color:var(--in);background:color-mix(in srgb,var(--in) 14%,transparent)}.pvx-out>i{color:var(--out);background:color-mix(in srgb,var(--out) 14%,transparent)}
.pvx-net .pvx-stats{margin-left:auto}

/* temperatures */

/* storage */
.pvx-disks,.pvx-guestlist{display:flex;flex-direction:column;gap:2px}
.pvx-pill{flex:none;padding:1px 9px;border-radius:99px;font-size:12px;font-weight:600;color:var(--tone,var(--muted));background:color-mix(in srgb,var(--tone,var(--muted)) 13%,transparent)}

/* guests */
.pvx-guest:focus-visible,.pvx-disk2:focus-visible,.pvx-more:focus-visible{outline:2px solid var(--cpu);outline-offset:1px}

.pvx-alert{display:none;align-items:center;gap:10px;padding:9px 14px;border-radius:12px;font-size:13px;color:var(--warn);background:color-mix(in srgb,var(--warn) 11%,var(--tile));border:1px solid color-mix(in srgb,var(--warn) 35%,transparent)}
.pvx-alert[data-state=warn]{display:flex}.pvx-alert b{font-weight:650}.pvx-alert span span{color:var(--ink)}
.pvx-foot{display:flex;flex-wrap:wrap;gap:6px 22px;padding:0 4px;font-size:12px;color:var(--muted)}
.pvx-foot .fa{opacity:.7;margin-right:2px}.pvx-foot-r{margin-left:auto}
.pvx-empty{padding:16px;text-align:center;font-size:12px;color:var(--muted);border:1px dashed var(--line);border-radius:12px}

/* dialogs */
.pvx-dialog{height:100%;padding:18px 20px;background:var(--bg)}
.pvx-dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}
.pvx-dl>div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
.pvx-dl dt{color:var(--muted)}.pvx-dl dd{font-weight:600;text-align:right;overflow-wrap:anywhere}
.pvx-dialog table{width:100%;margin-top:16px;border-collapse:collapse;font-size:12px}
.pvx-dialog th,.pvx-dialog td{padding:8px;border-bottom:1px solid var(--line);text-align:left}
.pvx-dialog th{color:var(--muted);font-weight:600}
.pvx-note{margin-top:14px!important;font-size:12px;color:var(--muted)}


/* hardware strip: memory | storage | temperature share one tile */
.pvx-sys{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2.1fr);gap:0;padding:0}
.pvx-store .pvx-disks{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr));align-content:stretch}
.pvx-sys-col{display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;padding:18px 20px}
.pvx-sys-col+.pvx-sys-col{border-left:1px solid var(--line)}
.pvx-mem{container:mcol/inline-size}.pvx-sys .pvx-mem .pvx-grid3{margin-top:auto}.pvx-grid3 dt{white-space:nowrap}.pvx-sys .pvx-mem .pvx-chart{flex:1 1 0;min-height:36px;height:auto}

/* storage: one card per disk, system disk first */
.pvx-disks{gap:12px}
.pvx-disk2{--dc:var(--store);display:grid!important;grid-template-columns:minmax(118px,30%) minmax(0,1fr);gap:16px;align-items:stretch;width:100%;padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--tile);overflow:hidden;transition:border-color .15s,box-shadow .15s}
.pvx-disk2:not([data-role=system]){--dc:#64748b}
.pvx-disk2:hover{border-color:color-mix(in srgb,var(--dc) 45%,var(--line));box-shadow:0 10px 24px -16px color-mix(in srgb,var(--dc) 90%,transparent)}
.pvx-dhero{position:relative;display:grid;place-items:center;min-height:96px;padding:10px;border-radius:11px;background:radial-gradient(110% 90% at 50% 0%,color-mix(in srgb,var(--dc) 16%,var(--tile)),color-mix(in srgb,var(--dc) 4%,var(--tile)) 75%);border:1px solid color-mix(in srgb,var(--dc) 16%,var(--line))}
.pvx-dhero svg{width:min(100%,128px);aspect-ratio:1;transform:rotate(-90deg)}
.pvx-dhero circle{fill:none;stroke-width:9}.pvx-dhero .t{stroke:color-mix(in srgb,var(--dc) 14%,var(--sunk))}
.pvx-dhero[data-empty] .v{display:none}
.pvx-dhero .v{stroke:var(--tone,var(--dc));stroke-linecap:round;stroke-dasharray:calc(var(--pct,0) * 1) 100;transition:stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)}
.pvx-dial{position:absolute;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none}
.pvx-dial strong{font-size:22px;font-weight:750;letter-spacing:-.03em;line-height:1.1}
.pvx-dial small{font-size:11px;color:var(--muted)}
.pvx-dhero .pvx-role{position:absolute;left:8px;top:8px}
.pvx-dmain{display:flex;flex-direction:column;gap:8px;min-width:0}
.pvx-dmain header{display:flex;align-items:center;gap:8px;min-width:0}
.pvx-dmain header b{flex:1;min-width:0;font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pvx-role{flex:none;padding:1px 7px;border-radius:5px;font-size:11px;font-weight:650;color:var(--muted);background:color-mix(in srgb,var(--tile) 80%,transparent);backdrop-filter:blur(4px)}
.pvx-role[data-role=system]{color:#fff;background:var(--store)}
.pvx-role-inline{display:none}
.pvx-role[data-role=mounted]{color:#fff;background:var(--in)}
.pvx-dstats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:auto}
.pvx-dstats>div{position:relative;min-width:0;padding:7px 9px 8px;border-radius:9px;background:var(--sunk);overflow:hidden}
.pvx-dstats dt{font-size:10.5px;color:var(--muted);white-space:nowrap}
.pvx-dstats dd{margin-top:1px;font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pvx-dstats>div[data-h]>i{position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--heat,var(--muted))}
.pvx-dstats>div[data-b]>i{position:absolute;left:9px;right:9px;bottom:5px;height:3px;border-radius:2px;background:color-mix(in srgb,var(--ink) 9%,transparent);overflow:hidden}
.pvx-dstats>div[data-b]>i em{display:block;height:100%;width:calc(var(--pct,0) * 1%);background:var(--tone,var(--good))}
.pvx-dsub{margin-top:-6px;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pvx-pmap{display:flex;gap:3px;height:14px}
.pvx-pseg{--pc:var(--muted);position:relative;flex:1 1 0;min-width:4px;border-radius:4px;background:color-mix(in srgb,var(--pc) 20%,transparent);overflow:hidden}
.pvx-pseg em{position:absolute;inset:0 auto 0 0;width:calc(var(--pct,0) * 1%);border-radius:inherit;background:var(--tone,var(--pc));transition:width .6s}
.pvx [data-kind=root]{--pc:var(--store)}.pvx [data-kind=swap]{--pc:var(--power)}.pvx [data-kind=efi]{--pc:#14b8a6}.pvx [data-kind=bios]{--pc:color-mix(in srgb,var(--ink) 40%,var(--bg))}.pvx [data-kind=data]{--pc:var(--in)}
.pvx-pseg[data-kind=free]{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--ink) 9%,transparent) 0 5px,transparent 5px 10px);box-shadow:inset 0 0 0 1px var(--line)}
.pvx-plegend{display:flex;flex-wrap:wrap;gap:3px 14px;font-size:11.5px;color:var(--muted)}
.pvx-plegend span{display:flex;align-items:center;gap:5px;white-space:nowrap}
.pvx-plegend i{width:8px;height:8px;border-radius:2px;background:var(--pc)}
.pvx-plegend span[data-kind=free] i{background:repeating-linear-gradient(135deg,var(--muted) 0 2px,transparent 2px 4px)}
.pvx-plegend b{font-weight:600;color:var(--ink)}

/* temperature: live traces */
.pvx .c-heat{stroke:var(--heat);stop-color:var(--heat);background:var(--heat)}

@container mcol (max-width:250px){.pvx-sys .pvx-mem .pvx-grid3{grid-template-columns:1fr;gap:1px}.pvx-sys .pvx-mem .pvx-grid3>div{display:flex;justify-content:space-between;gap:6px}.pvx-sys .pvx-mem .pvx-grid3 dd{font-size:12.5px}}
/* guests: a growing list with allocation summary, filter and create shortcuts */
.pvx-guests{gap:12px;container:gtile/inline-size}
.pvx-create{display:flex;gap:6px;flex:none}.pvx-create:not([data-state="1"]){display:none!important}
.pvx-create button{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:7px;font-size:11.5px;font-weight:600;color:var(--muted);border:1px solid var(--line);transition:all .15s}
.pvx-create button:hover{color:var(--ink);border-color:color-mix(in srgb,var(--ink) 25%,var(--bg));background:var(--sunk)}
.pvx-create .fa{font-size:10px}
.pvx-alloc{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.pvx-alloc-item{--c:var(--cpu);padding:10px 12px;border-radius:12px;background:var(--sunk)}
.pvx-alloc-item+.pvx-alloc-item{--c:var(--mem)}
.pvx-alloc-item>div{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;color:var(--muted)}
.pvx-alloc-item b{font-size:13px;font-weight:650;color:var(--ink);white-space:nowrap}
.pvx-alloc-item i{display:block;height:5px;margin:7px 0 6px;border-radius:99px;background:color-mix(in srgb,var(--ink) 9%,transparent);overflow:hidden}
.pvx-alloc-item em{display:block;height:100%;width:calc(var(--pct,0) * 1%);border-radius:inherit;background:var(--tone,var(--c));transition:width .6s}
.pvx-alloc-item small{display:block;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pvx-gfilter{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--sunk)}
.pvx-gfilter button{flex:1;display:flex;white-space:nowrap;justify-content:center;align-items:center;gap:6px;padding:4px 6px;border-radius:7px;font-size:12px;color:var(--muted);text-align:center;transition:background .15s,color .15s}
.pvx-gfilter button em{font-style:normal;font-size:11px;font-weight:650;padding:0 6px;border-radius:99px;background:color-mix(in srgb,var(--ink) 8%,transparent)}
.pvx-gfilter button[aria-pressed=true]{color:var(--ink);font-weight:600;background:var(--tile);box-shadow:0 1px 3px rgb(0 0 0/.12)}
.pvx-guests[data-filter=running] .pvx-guest:not([data-state=good]),.pvx-guests[data-filter=stopped] .pvx-guest[data-state=good]{display:none!important}



























.pvx-seg2{display:flex;gap:1px;padding:2px;border-radius:7px;background:var(--sunk);flex:none}
.pvx-seg2 button{padding:1px 8px;border-radius:5px;font-size:11px;color:var(--muted);transition:background .15s,color .15s}
.pvx-seg2 button[aria-pressed=true]{color:var(--ink);font-weight:600;background:var(--tile);box-shadow:0 1px 2px rgb(0 0 0/.12)}
.pvx-guestlist{gap:8px;container:gcol/inline-size}

@container gtile (max-width:420px){.pvx-alloc{grid-template-columns:1fr!important;gap:6px}.pvx-alloc-item{padding:7px 10px}.pvx-alloc-item i{margin:5px 0 0}}
@container gtile (max-width:330px){.pvx-gfilter button{white-space:nowrap;gap:3px;padding:3px 2px;font-size:11px}.pvx-gfilter button em{padding:0 4px}.pvx-create button{padding:2px 6px}}
.pvx .pvx-guest{--gc:var(--in);position:relative;display:grid!important;grid-template-columns:22px minmax(0,1fr);grid-template-areas:"icon head" "meter meter" "net net";align-items:center;gap:9px 8px;flex:none;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--tile);text-align:left;transition:border-color .15s,box-shadow .15s}
.pvx .pvx-guest:hover{border-color:color-mix(in srgb,var(--ink) 20%,var(--line));box-shadow:0 6px 18px -12px rgb(0 0 0/.3)}
.pvx-gicon{--gi:hsl(var(--hue,234) 72% 50%);grid-area:icon;position:relative;display:grid;place-items:center;width:22px;height:22px;border-radius:6px;color:color-mix(in srgb,var(--gi) 88%,var(--ink));background:color-mix(in srgb,var(--gi) 15%,var(--tile))}
.pvx-gglyph{display:grid;place-items:center;width:76%;height:76%}
.pvx-gglyph svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.pvx-gicon .pvx-led{position:absolute;right:-2px;bottom:-2px;width:7px;height:7px;color:var(--muted);box-shadow:0 0 0 2px var(--tile)}
.pvx-guest[data-state=good] .pvx-led{color:var(--good)}.pvx-guest[data-state=warn] .pvx-led{color:var(--warn)}
.pvx-ghead{grid-area:head;display:flex;align-items:center;gap:6px;min-width:0}
.pvx-gid{flex:none;padding:0 6px;border-radius:5px;font-size:11px;font-style:normal;font-weight:650;line-height:18px;white-space:nowrap;color:color-mix(in srgb,var(--gc) 78%,var(--ink));background:color-mix(in srgb,var(--gc) 12%,var(--tile));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gc) 24%,transparent)}
.pvx-gname{flex:0 1 auto;min-width:2.5em;font-size:14px;font-weight:700;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pvx-gtags{display:flex;flex-wrap:wrap;gap:4px;min-width:0;height:18px;align-items:center;flex:0 1000 auto;overflow:hidden}
.pvx-gtags i{padding:0 6px;border-radius:5px;font-size:11px;font-style:normal;font-weight:600;line-height:16px;white-space:nowrap;color:var(--soft);background:var(--sunk);border:1px solid var(--line)}
.pvx-gnet{grid-area:net;display:grid;grid-template-columns:auto 1fr 1fr;align-items:center;gap:3px 10px;padding-top:8px;border-top:1px dashed var(--line);font:500 11px/14px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--soft);white-space:nowrap}
.pvx-gnet small{font:400 10.5px/14px inherit;font-family:inherit;color:var(--muted)}
.pvx-gnet span{display:flex;justify-content:flex-end;gap:4px;min-width:0}
.pvx-gnet small+span+span+small,.pvx-gnet small+span+span+small~span{color:var(--muted)}
.pvx-gnet i{font-style:normal;font-weight:700}.pvx-gnet i.u{color:var(--out)}.pvx-gnet i.d{color:var(--in)}
.pvx-gmeters{grid-area:meter;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pvx-gm{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:7px;min-width:0}
.pvx-gm+.pvx-gm{--gmc:var(--mem)}
.pvx-gm small{font-size:11px;font-weight:600;color:var(--soft)}
.pvx-gm i{height:6px;border-radius:99px;background:var(--sunk);overflow:hidden}
.pvx-gm s{display:block;height:100%;width:calc(var(--pct,0) * 1%);min-width:3px;border-radius:inherit;background:var(--tone,var(--gmc,var(--cpu)));transition:width .6s}
.pvx-gm b{min-width:3ch;text-align:right;font-size:11.5px;font-weight:700;color:var(--tone,var(--ink));font-variant-numeric:tabular-nums}
.pvx-guest:not([data-state=good]) .pvx-gicon{filter:grayscale(1);opacity:.55}
.pvx-guest:not([data-state=good]) :is(.pvx-gnet,.pvx-gmeters,.pvx-gname){opacity:.5}
@container gtile (max-width:330px){.pvx .pvx-guest{padding:10px;gap:8px 6px}.pvx-gmeters{gap:12px}.pvx-gm{gap:5px}.pvx-gnet{gap:3px 6px}}
@container gtile (max-width:215px){.pvx-gname{font-size:13px}.pvx-gtags{display:none}.pvx-gnet{grid-template-columns:1fr 1fr;gap:2px 6px;font-size:10.5px;letter-spacing:-.03em}.pvx-gnet small{grid-column:1/-1;margin-top:2px}.pvx-gnet span{justify-content:flex-start;gap:2px}.pvx-ghead{gap:5px}.pvx-gid{padding:0 4px;font-size:10px}.pvx-gmeters{grid-template-columns:1fr;gap:5px}}
.pvx-gadd{display:flex;gap:8px;flex:none}.pvx-gadd:not([data-state="1"]){display:none!important}
.pvx .pvx-gadd button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 6px;border-radius:12px;border:1px dashed var(--line);font-size:12px;color:var(--muted);transition:all .15s}
.pvx .pvx-gadd button:hover{color:var(--ink);border-color:color-mix(in srgb,var(--ink) 30%,var(--line));background:var(--sunk)}
.pvx-gadd .fa{font-size:10px}
.pvx-guests .pvx-empty{margin:auto 0;line-height:1.8}

/* one-screen mode: when the panel is large enough the board fits the visible area without page scrolling;
   charts absorb the free height, the guest list scrolls inside its own column */
.pvx:not(.pvx-dialog){container-type:size;container-name:pvx}
.pvx-chart svg{position:absolute;inset:0}
@container pvx (min-width:1000px) and (min-height:580px){
.pvx-wrap{height:100%;max-width:none;padding:14px 18px 8px;gap:12px}
.pvx-bento{flex:1 1 0;min-height:0;gap:12px;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:minmax(0,1fr) minmax(0,1fr) minmax(0,1.75fr);
  grid-template-areas:"cpu cpu cpu cpu cpu net net net net gst gst gst" "cpu cpu cpu cpu cpu pow pow pow pow gst gst gst" "sys sys sys sys sys sys sys sys sys gst gst gst"}
.pvx-tile{min-height:0;overflow:hidden;padding:14px 16px;gap:10px}
.pvx-sys{padding:0}.pvx-sys-col{padding:14px 16px;gap:10px}
.pvx-big b{font-size:36px}.pvx-in b,.pvx-out b{font-size:26px}
.pvx-chart{flex:1 1 0;min-height:40px;height:auto!important}
.pvx-axis{margin-top:-4px}
.pvx-cores{flex:none;height:clamp(78px,10cqh,108px)}
.pvx-net-now{gap:6px 18px}
.pvx-power .pvx-grid3{margin-top:auto}
.pvx-disks,.pvx-guestlist{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;margin:0 -6px;padding:0 6px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.pvx-foot{flex:none}
.pvx-alloc{gap:8px}.pvx-alloc-item{padding:8px 10px}.pvx-alloc-item i{margin:5px 0 4px}
}
/* lower screens: same layout, secondary details folded away */
@container pvx (min-width:1000px) and (min-height:580px) and (max-height:820px){
.pvx-dhero{display:none}.pvx-role-inline{display:inline-block}.pvx-disk2{grid-template-columns:1fr;padding:7px 11px}.pvx-dmain{gap:5px}.pvx-dstats>div{padding:5px 8px 6px}
.pvx-bento{grid-template-rows:minmax(0,1fr) minmax(0,1fr) minmax(0,1.45fr)}
.pvx-wrap{padding-top:10px;gap:10px}.pvx-bento{gap:10px}.pvx-tile{padding:12px 14px;gap:8px}.pvx-sys-col{padding:12px 14px;gap:8px}
.pvx-big b{font-size:30px}.pvx-in b,.pvx-out b{font-size:22px}
.pvx-cores-head,.pvx-alloc-item small,.pvx-legend,.pvx-dsub,.pvx-dstats>div:nth-child(4){display:none}.pvx-dstats{grid-template-columns:repeat(3,minmax(0,1fr))}.pvx-dhero{min-height:80px}
.pvx-plegend{display:none}
.pvx-cores{height:64px}
.pvx-alloc-item{padding:8px 10px}.pvx-alloc-item i{margin:6px 0 0}

}
@container pvx (min-width:1000px) and (max-width:1279px) and (min-height:580px){
.pvx-net .pvx-stats,.pvx-power .pvx-big small,.pvx-cpu .pvx-stats>div:nth-child(3){display:none}

.pvx-alloc{grid-template-columns:1fr}.pvx-alloc-item small{display:none}
}
/* medium width (e.g. 1366 px screens with the resource tree open) */
@container pvx (min-width:780px) and (max-width:999px) and (min-height:540px){
.pvx-seg2{display:none}
.pvx-sys .pvx-mem .pvx-chart,.pvx-axis,.pvx-legend,.pvx-stats,.pvx-big small,.pvx-cores-head,.pvx-dsub,.pvx-plegend,.pvx-dstats>div:nth-child(n+3),.pvx-dhero,.pvx-power .pvx-grid3,.pvx-alloc,.pvx-create{display:none}
.pvx-gadd{display:none!important}
.pvx-role-inline{display:inline-block;font-size:10px;padding:0 5px}
.pvx-disk2{grid-template-columns:1fr;gap:4px;padding:7px 9px;border-radius:10px}.pvx-dmain{gap:4px}.pvx-dstats{grid-template-columns:1fr 1fr;gap:4px}.pvx-dstats>div{padding:3px 7px}.pvx-dstats dd{font-size:12px}.pvx-dmain header b{font-size:12.5px}.pvx-disks{gap:6px}
.pvx-cpu .pvx-row{flex-wrap:nowrap}.pvx-cpu .pvx-stats{display:flex!important}.pvx-cpu .pvx-stats>div:not(:first-child){display:none}
.pvx-wrap{height:100%;padding:10px 12px 6px;gap:8px}
.pvx-foot{display:none}
.pvx-bento{flex:1 1 0;min-height:0;gap:8px;grid-template-columns:repeat(8,minmax(0,1fr));grid-template-rows:minmax(0,1fr) minmax(0,1fr) minmax(0,1.25fr);
  grid-template-areas:"cpu cpu cpu net net net gst gst" "cpu cpu cpu pow pow pow gst gst" "sys sys sys sys sys sys gst gst"}
.pvx-tile{min-height:0;overflow:hidden;padding:10px 12px;gap:6px;border-radius:12px}
.pvx-sys{padding:0}.pvx-sys-col{padding:10px 12px;gap:6px}
.pvx-th h3{font-size:12px}.pvx-meta{display:none}
.pvx-big b{font-size:26px}.pvx-big>span{font-size:13px}.pvx-in b,.pvx-out b{font-size:18px}
.pvx-chart{flex:1 1 0;min-height:28px;height:auto!important}

.pvx-cores{flex:none;height:58px;gap:3px}
.pvx-sys .pvx-mem .pvx-seg{height:14px}.pvx-sys .pvx-mem .pvx-grid3{grid-template-columns:1fr;gap:2px}.pvx-sys .pvx-mem .pvx-grid3>div{display:flex;justify-content:space-between;gap:6px}.pvx-sys .pvx-mem .pvx-grid3 dd{font-size:12px}
.pvx-disks,.pvx-guestlist{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.pvx-pill{font-size:10.5px;padding:0 7px}
.pvx-gfilter button{padding:3px 2px;font-size:11px;gap:3px}.pvx-gfilter button em{padding:0 4px}


}
/* flowing layouts (narrow or very low panels): the page scrolls */
@container pvx (max-width:779px){
.pvx-dmain header b{white-space:normal;word-break:break-word}.pvx-net .pvx-meta{display:none}
.pvx-disk2{grid-template-columns:1fr}.pvx-dhero{min-height:110px}.pvx-dstats{grid-template-columns:1fr 1fr}
.pvx-wrap{padding:14px 12px;gap:12px}.pvx-bento{grid-template-columns:1fr;grid-template-areas:"cpu" "net" "pow" "sys" "gst";gap:12px}
.pvx-big b{font-size:34px}.pvx-stats{gap:16px}
.pvx-sys{grid-template-columns:1fr}.pvx-sys-col+.pvx-sys-col{border-left:0;border-top:1px solid var(--line)}
.pvx-dl{grid-template-columns:1fr}.pvx-cores{gap:3px}.pvx-alloc{grid-template-columns:1fr}
}
@container pvx (max-width:420px){.pvx-grid3{grid-template-columns:1fr 1fr}.pvx-big small{display:block;margin:6px 0 0}.pvx-big{flex-wrap:wrap}.pvx-create{display:none}}
`;

    function installStyle() {
        let style = document.getElementById('pvx-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'pvx-style';
            document.head.appendChild(style);
        }
        if (style.textContent !== css) {
            style.textContent = css;
        }
    }

    return { build, skeleton, detail, patch, hover, leave, installStyle };
})();

Ext.define('PVE.node.SummaryOverviewStatus', {
    override: 'PVE.node.StatusView',

    header: false,
    border: false,
    bodyPadding: 0,
    height: undefined,
    defaults: {},
    layout: { type: 'vbox', align: 'stretch' },

    updateValues: function (store, records, success) {
        const me = this;
        me.callParent(arguments);
        if (!success) {
            return;
        }
        // live buffer for the power chart: about one sample per second while the summary is open
        const data = me.getStore().getRecord()?.data || {};
        me.liveSamples = (me.liveSamples || []).concat([{ t: Date.now(), w: data.hwinfo?.cpu?.power_w }]).slice(-180);
        me.refreshOverview();
    },

    // one-hour node history for the CPU and network charts; refreshed once a minute while visible
    loadTrend: function () {
        const me = this;
        if (me.trendLoading || (me.trendAt && Date.now() - me.trendAt < 60000)) {
            return;
        }
        me.trendLoading = true;
        Proxmox.Utils.API2Request({
            url: `/nodes/${me.pveSelNode.data.node}/rrddata`,
            params: { timeframe: 'hour', cf: 'AVERAGE' },
            method: 'GET',
            success: (response) => {
                me.trendData = response.result?.data || [];
            },
            failure: () => {}, // keep the previous trend, no error popup
            callback: () => {
                me.trendLoading = false;
                me.trendAt = Date.now();
                if (!me.destroyed) {
                    me.refreshOverview();
                }
            },
        });
    },

    refreshOverview: function () {
        const me = this;
        const view = me.down('#overview');
        if (!view?.rendered) {
            return;
        }
        if (view.isVisible(true)) {
            me.loadTrend();
        }
        const overview = PVE.node.SummaryOverview;
        const resources = PVE.data.ResourceStore.getRange().map((record) => record.data);
        const model = overview.build(me.getStore().getRecord()?.data || {}, resources, me.pveSelNode.data.node, {
            trend: me.trendData,
            live: me.liveSamples,
            rates: me.guestRates(resources),
            netRange: me.netRange || 'hour',
            fmax: me.fmaxSeen,
        });
        me.fmaxSeen = model.fmax;
        if (me.overviewShape !== model.shapeKey) {
            // hardware or guest list changed: rebuild the markup, otherwise only values are patched
            view.update(overview.skeleton(model.shape));
            me.overviewShape = model.shapeKey;
            me.overviewDialog?.close();
            me.applyGuestFilter();
        }
        me.overviewModel = model;
        overview.patch(view.getEl().dom, model.values);
        const dialogBody = me.overviewDialog?.down('#detail');
        if (dialogBody?.rendered) {
            overview.patch(dialogBody.getEl().dom, model.values);
        }
    },

    // Network / disk throughput per guest from the counters in the resource store. pvestatd samples them on
    // the guest's node (about every 10 s) and the store re-reads the same sample in between, so the guest
    // uptime reported with every sample is the sample clock: same uptime = same sample (nothing new),
    // larger uptime = new sample taken that many seconds later, smaller uptime = restart or older data.
    // Every counter is differenced on its own (an idle direction gives 0, a counter that went backwards
    // gives no value for that interval). Rates expire when no new sample arrives for STALE ms, and the
    // state of stopped or vanished guests is dropped. The render interval is never used as sample time.
    guestRates: function (resources) {
        const me = this;
        const now = Date.now();
        const STALE = 30000; // ms without a new pvestatd sample before the live rate is shown as unknown
        const MAX_GAP = 60; // s; a longer gap between two samples only restarts the baseline
        const prev = me.guestSamples || {};
        const state = {};
        const rates = {};
        const counter = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
        const delta = (a, b, dt) => (a === null || b === null || b < a ? null : (b - a) / dt);
        (Array.isArray(resources) ? resources : []).forEach((r) => {
            if (!r || (r.type !== 'qemu' && r.type !== 'lxc') || r.status !== 'running') {
                return;
            }
            const up = counter(r.uptime);
            if (!up) {
                return;
            }
            const key = `${r.type}/${r.vmid}`;
            const rd = counter(r.diskread);
            const wr = counter(r.diskwrite);
            const cur = { up, netin: counter(r.netin), netout: counter(r.netout), io: rd === null || wr === null ? null : rd + wr };
            const old = prev[key];
            let s;
            if (old && up === old.base.up) {
                s = old; // the same pvestatd sample read again
            } else if (old && up > old.base.up && up - old.base.up <= MAX_GAP) {
                const dt = up - old.base.up;
                const b = old.base;
                s = { base: cur, seen: now, rate: { netin: delta(b.netin, cur.netin, dt), netout: delta(b.netout, cur.netout, dt), io: delta(b.io, cur.io, dt) } };
            } else {
                s = { base: cur, seen: now, rate: null }; // first sample, restart, older data or long gap
            }
            state[key] = s;
            if (s.rate && now - s.seen <= STALE) {
                rates[key] = s.rate;
            }
        });
        me.guestSamples = state;
        return rates;
    },

    applyGuestFilter: function () {
        const dom = this.down('#overview')?.getEl()?.dom;
        const tile = dom?.querySelector('.pvx-guests');
        if (!tile) {
            return;
        }
        const f = this.guestFilter || 'all';
        tile.dataset.filter = f;
        tile.querySelectorAll('button[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
        if (!this.netRange) {
            try {
                this.netRange = window.localStorage.getItem('pvx-net-range') === 'day' ? 'day' : 'hour';
            } catch (e) {
                this.netRange = 'hour';
            }
        }
        dom.querySelectorAll('button[data-net-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.netRange === this.netRange)));
    },

    showOverviewDetail: function (action) {
        const me = this;
        const model = me.overviewModel;
        if (!model || !/^(cpu|disk:\d+)$/.test(action)) {
            return;
        }
        me.overviewDialog?.close();
        const viewport = Ext.getBody().getViewSize();
        const win = Ext.create('Ext.window.Window', {
            title: action === 'cpu' ? 'CPU 核心与频率' : 'NVMe 详情',
            modal: true,
            layout: 'fit',
            width: Math.min(720, viewport.width - 40),
            height: Math.min(action === 'cpu' ? 620 : 540, viewport.height - 60),
            items: [{
                xtype: 'component',
                itemId: 'detail',
                scrollable: true,
                html: PVE.node.SummaryOverview.detail(action, model.shape),
            }],
            buttons: [{ text: gettext('Close'), handler: () => win.close() }],
            listeners: {
                destroy: () => {
                    if (me.overviewDialog === win) {
                        me.overviewDialog = null;
                    }
                },
            },
        });
        me.overviewDialog = win;
        win.show();
        PVE.node.SummaryOverview.patch(win.down('#detail').getEl().dom, model.values);
    },

    initComponent: function () {
        const me = this;
        PVE.node.SummaryOverview.installStyle();

        const repoLink = Ext.state.Manager.getProvider().encodeHToken({
            view: 'server',
            rid: `node/${me.pveSelNode.data.node}`,
            ltab: 'tasks',
            nodetab: 'aptrepositories',
        });
        me.items = [
            {
                xtype: 'component',
                itemId: 'overview',
                cls: 'pvx',
                flex: 1,
                minHeight: 0,
                listeners: {
                    afterrender: (view) => {
                        const dom = view.getEl().dom;
                        dom.addEventListener('click', (event) => {
                            const action = event.target.closest('[data-action]');
                            if (action) {
                                me.showOverviewDetail(action.dataset.action);
                                return;
                            }
                            const range = event.target.closest('button[data-net-range]');
                            if (range) {
                                me.netRange = range.dataset.netRange;
                                try {
                                    window.localStorage.setItem('pvx-net-range', me.netRange);
                                } catch (e) { /* private mode */ }
                                me.applyGuestFilter();
                                me.refreshOverview();
                                return;
                            }
                            const filter = event.target.closest('button[data-filter]');
                            if (filter) {
                                me.guestFilter = filter.dataset.filter;
                                me.applyGuestFilter();
                                return;
                            }
                            const create = event.target.closest('[data-create]');
                            if (create) {
                                Ext.create(create.dataset.create === 'lxc' ? 'PVE.lxc.CreateWizard' : 'PVE.qemu.CreateWizard', {
                                    nodename: me.pveSelNode.data.node,
                                    autoShow: true,
                                });
                                return;
                            }
                            const nav = event.target.closest('[data-nav]');
                            if (nav?.dataset.nav) {
                                Ext.ComponentQuery.query('pveResourceTree')[0]?.selectById(nav.dataset.nav);
                            }
                        });
                        dom.addEventListener('mousemove', PVE.node.SummaryOverview.hover);
                        dom.addEventListener('mouseleave', PVE.node.SummaryOverview.leave);
                        me.refreshOverview();
                    },
                },
            },
            {
                xtype: 'pmxNodeInfoRepoStatus',
                itemId: 'repositoryStatus',
                product: 'Proxmox VE',
                repoLink: `#${repoLink}`,
                padding: '4 24',
            },
        ];

        me.callSuper(); // skip the stock item list, keep the status store wiring
        me.on('destroy', () => me.overviewDialog?.close());
    },
});

// Summary tab: overview first, the stock RRD charts move to a second page.
Ext.define('PVE.node.SummaryOverviewPage', {
    override: 'PVE.node.Summary',

    showSummaryPage: function (page) {
        const me = this;
        const trends = page === 'trends';
        me.summaryPage = trends ? 'trends' : 'overview';
        me.getLayout().setActiveItem(trends ? me.trendPage : me.nodeStatus);
        me.down('#overviewPageButton').toggle(!trends, true);
        me.down('#trendPageButton').toggle(trends, true);
        me.down('proxmoxRRDTypeSelector')?.setVisible(trends);
        if (trends) {
            me.restoreLogPanel();
            me.trendStore?.startUpdate();
            Proxmox.Utils.updateColumns(me.trendPage);
        } else {
            me.trendStore?.stopUpdate();
            me.collapseLogPanel();
        }
    },

    // The overview uses the full height: fold the bottom task log while it is visible.
    collapseLogPanel: function () {
        const me = this;
        const panel = Ext.ComponentQuery.query('pveStatusPanel')[0];
        if (me.logPanelState || !panel) {
            return;
        }
        me.logPanelState = { panel, wasCollapsed: !!panel.collapsed };
        if (!panel.collapsed) {
            panel.collapse(undefined, false);
        }
    },

    restoreLogPanel: function () {
        const me = this;
        const state = me.logPanelState;
        me.logPanelState = null;
        if (state && !state.panel.destroyed && !state.wasCollapsed && state.panel.collapsed) {
            state.panel.expand(false);
        }
    },

    initComponent: function () {
        const me = this;
        me.layout = 'card';
        me.scrollable = false;
        me.bodyPadding = 0;

        me.callParent();

        const status = me.nodeStatus;
        const trends = me.getComponent('itemcontainer');
        const toolbar = me.down('toolbar[dock=top]');
        if (!status || !trends || !toolbar) {
            return;
        }
        trends.remove(status, false);
        Ext.apply(status, { width: undefined, minHeight: undefined, padding: 0, columnWidth: undefined });
        trends.setScrollable(true);
        me.insert(0, status);
        me.trendPage = trends;
        me.trendStore = trends.down('proxmoxRRDChart')?.getStore();

        const group = me.id + '-summary-page';
        toolbar.insert(0, [
            { text: '总览', iconCls: 'fa fa-th-large', itemId: 'overviewPageButton', enableToggle: true, allowDepress: false, toggleGroup: group, pressed: true, handler: () => me.showSummaryPage('overview') },
            { text: '趋势图', iconCls: 'fa fa-area-chart', itemId: 'trendPageButton', enableToggle: true, allowDepress: false, toggleGroup: group, handler: () => me.showSummaryPage('trends') },
            '-',
        ]);

        me.on({
            afterrender: () => me.showSummaryPage('overview'),
            activate: () => me.showSummaryPage(me.summaryPage || 'overview'),
            deactivate: () => {
                me.trendStore?.stopUpdate();
                me.restoreLogPanel();
            },
            destroy: () => me.restoreLogPanel(),
        });
    },
});
/* END pve-summary-overview */
