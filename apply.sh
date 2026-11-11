#!/bin/bash -p
# Node Summary overview for the Proxmox VE web UI.
#
#   apply.sh [apply]   install / re-install (run again after pve-manager is upgraded)
#   apply.sh remove    take the overview out again, leaving the packaged files as shipped
#
# What it changes: pvemanagerlib.js (overview appended between "pve-summary-overview" markers),
# index.html.tpl (&ui= cache-busters), API2/Nodes.pm (one marked hook block plus one marked
# "protected" line in the node status method) and PVE/SummaryOverview.pm (installed / deleted).
#
# Safety rules
#  - Only "apply" or "remove" (no argument = apply) is accepted; anything else changes nothing.
#  - Before the first write every target, marker and anchor is checked and all new files are built
#    and compiled / parsed. A layout it does not recognise (missing, duplicated or unpaired
#    markers or anchors) stops the run with nothing changed.
#  - Files about to change are backed up first (directory STATE below, backup/<run>/ with a
#    MANIFEST of sha256 sums) and replaced one at a time (temp file + rename). If a write, the
#    service restart or the service check fails, or the run is interrupted, every replaced file is
#    put back from that backup and, if a restart was already attempted, the services are restarted
#    again.
#  - remove deletes SummaryOverview.pm only after the hook is gone and the services were restarted.
#
# Exit status: 0 done, or nothing to change
#              1 refused or failed; the message says what was left (after a failed write or
#                restart all files were restored)
#              2 usage error (nothing was looked at or changed)
#              3 failed AND the automatic restore was incomplete: restore by hand from the backup
#                named in the message
set -euo pipefail
set +C +f +a
umask 077
IFS=$' \t\n'
shopt -u nullglob failglob nocaseglob nocasematch dotglob globstar
if [ -n "$(compgen -A function)" ]; then
    echo "pve-summary-overview: shell functions were inherited from the environment; run it as ./apply.sh or bash -p apply.sh" >&2
    exit 2
fi

usage() {
    echo "usage: apply.sh [apply|remove]   (no argument = apply)" >&2
    exit 2
}
case $# in
0) MODE=apply ;;
1)
    case $1 in
    apply | remove) MODE=$1 ;;
    *) usage ;;
    esac
    ;;
*) usage ;;
esac
readonly MODE

# Fixed locations and search path. Nothing from the caller's environment can change them.
readonly JS=/usr/share/pve-manager/js/pvemanagerlib.js
readonly TPL=/usr/share/pve-manager/index.html.tpl
readonly NODES=/usr/share/perl5/PVE/API2/Nodes.pm
readonly WTLIB=/usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js
readonly MODULE=/usr/share/perl5/PVE/SummaryOverview.pm
readonly LIBDIR=/usr/share/perl5
readonly STATE=/var/lib/pve-summary-overview
readonly CGROUP_FILE=/proc/self/cgroup
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
export LC_ALL=C
for var in $(compgen -e); do
    case $var in PERL* | NODE_* | LD_*) unset -v "$var" ;; esac
done
unset -v var TMPDIR CDPATH GLOBIGNORE BASH_ENV ENV
readonly -a SERVICES=(pvedaemon pveproxy)

PHASE=check # check -> commit -> done
work=''
BACKUP=''
RESTARTED=0
TOUCHED=()
TMPS=()
CHANGE=()

say() { echo "pve-summary-overview: $*" >&2; }
die() {
    say "$*"
    exit 1
}

target_of() {
    case $1 in
    MODULE) echo "$MODULE" ;;
    NODES) echo "$NODES" ;;
    JS) echo "$JS" ;;
    TPL) echo "$TPL" ;;
    esac
}
plan_of() {
    case $1 in
    MODULE) echo "$work/src/SummaryOverview.pm" ;;
    NODES) echo "$work/new/Nodes.pm" ;;
    JS) echo "$work/new/pvemanagerlib.js" ;;
    TPL) echo "$work/new/index.html.tpl" ;;
    esac
}
in_change() {
    local x
    for x in "${CHANGE[@]}"; do
        [ "$x" != "$1" ] || return 0
    done
    return 1
}

# Everything code is read from or written to must belong to root alone.
check_mode() { # PATH UID OCTAL-MODE
    [ "$2" = 0 ] || die "$1 is not owned by root; refusing"
    (((8#$3 & 8#022) == 0)) || die "$1 is writable by group or others; refusing"
}
check_dir() { # the directory and every directory above it
    local d=$1 st
    case $d in /*) ;; *) die "not an absolute path: $d" ;; esac
    while :; do
        st=$(stat -L -c '%u %a' -- "$d") || die "cannot stat $d"
        # shellcheck disable=SC2086 # two fields on purpose
        check_mode "$d" $st
        [ "$d" != / ] || break
        d=$(dirname -- "$d")
    done
}
check_file() {
    local st
    [ -f "$1" ] && [ ! -L "$1" ] || die "$1 is missing, not a regular file, or a symlink; refusing"
    st=$(stat -c '%u %a' -- "$1") || die "cannot stat $1"
    # shellcheck disable=SC2086 # two fields on purpose
    check_mode "$1" $st
    check_dir "$(dirname -- "$1")"
}

# put_file SRC DST MODE: replace DST by the bytes of SRC (temp file in DST's directory + rename)
put_file() {
    local tmp
    tmp=$(mktemp -- "$(dirname -- "$2")/.pve-summary-overview.XXXXXX") || return 1
    TMPS+=("$tmp")
    cp -- "$1" "$tmp" && chmod -- "$3" "$tmp" && chown 0:0 -- "$tmp" && sync -- "$tmp" &&
        cmp -s -- "$1" "$tmp" && mv -fT -- "$tmp" "$2" && cmp -s -- "$1" "$2"
}

restart_services() {
    local s
    systemctl restart "${SERVICES[@]}" || return 1
    for s in "${SERVICES[@]}"; do
        systemctl is-active --quiet "$s" || return 1
    done
}

record() {
    if [ -n "$BACKUP" ]; then printf '%s\n' "$1" >"$BACKUP/RESULT" 2>/dev/null || true; fi
    printf '%s %s %s %s\n' "$(date '+%F %T %z')" "$MODE" "$1" "${BACKUP:--}" >"$STATE/last-run" 2>/dev/null || true
}

rollback() {
    local files_ok=1 svc_ok=1 i n dst bak later=''
    say "$MODE failed; putting back the previous files from $BACKUP"
    for ((i = ${#TOUCHED[@]} - 1; i >= 0; i--)); do
        n=${TOUCHED[i]}
        dst=$(target_of "$n")
        bak=$BACKUP/${dst##*/}
        if [ -f "$bak" ]; then
            if cmp -s -- "$bak" "$dst"; then
                : # still the previous content (the write did not happen)
            elif ! put_file "$bak" "$dst" "$(stat -c '%a' -- "$bak")"; then
                files_ok=0
                say "  could not restore $dst"
            fi
        elif [ -e "$bak.ABSENT" ]; then
            later=$dst # did not exist before: delete it last, once nothing can load it
        else
            files_ok=0
            say "  no backup found for $dst"
        fi
    done
    if [ "$RESTARTED" = 1 ]; then
        if restart_services; then
            say "  services restarted with the previous files"
        else
            svc_ok=0
            say "  services did not come back cleanly - check: systemctl status ${SERVICES[*]}"
        fi
    fi
    if [ -n "$later" ]; then
        if [ "$files_ok" = 1 ] && [ "$svc_ok" = 1 ]; then
            rm -f -- "$later" || true
            if [ -e "$later" ]; then
                files_ok=0
                say "  could not delete $later (it did not exist before)"
            fi
        else
            files_ok=0
            say "  $later did not exist before; left in place because the hook may still use it"
        fi
    fi
    if [ "$files_ok" = 1 ] && [ "$svc_ok" = 1 ]; then
        record rolled-back
        say "previous files restored (backup kept in $BACKUP)"
        return 1
    fi
    if [ "$files_ok" = 1 ]; then
        record restored-services-not-active
        say "previous files restored, but the services are not running cleanly (backup in $BACKUP)"
        return 3
    fi
    record ROLLBACK-INCOMPLETE
    say "ROLLBACK INCOMPLETE - restore by hand from $BACKUP (its MANIFEST lists each file with its original sha256)"
    return 3
}

on_exit() {
    local rc=$? t
    trap '' INT TERM HUP
    trap - EXIT
    set +e
    if [ "$PHASE" = commit ]; then
        rollback
        rc=$?
    fi
    for t in "${TMPS[@]}"; do rm -f -- "$t"; done
    [ -z "$work" ] || rm -rf -- "$work"
    exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# ---------------------------------------------------------------- 1. checks (nothing is written)
[ "$(id -u)" = 0 ] || die "must run as root"
if [ -r "$CGROUP_FILE" ] && grep -Eq '/(pvedaemon|pveproxy)\.service(/|$)' "$CGROUP_FILE"; then
    die "this shell runs inside pvedaemon/pveproxy (the web UI shell?); restarting them would kill the run - use SSH or the host console"
fi

check_file "$JS"
check_file "$TPL"
check_file "$NODES"
if [ -e "$MODULE" ] || [ -L "$MODULE" ]; then
    check_file "$MODULE"
else
    check_dir "$(dirname -- "$MODULE")"
fi
SRC=''
if [ "$MODE" = apply ]; then
    check_file "$WTLIB"
    SRC=$(cd -P -- "$(dirname -- "$0")" && pwd -P) || die "cannot find the directory of this script"
    check_dir "$SRC"
    check_file "$SRC/overview.js"
    check_file "$SRC/SummaryOverview.pm"
fi

if [ ! -e "$STATE" ]; then mkdir -m 0700 -- "$STATE" || die "cannot create $STATE"; fi
[ -d "$STATE" ] && [ ! -L "$STATE" ] || die "$STATE is not a directory; refusing"
check_dir "$STATE"
exec 9>>"$STATE/lock"
flock -n 9 || die "another run holds $STATE/lock; nothing was changed"
work=$(mktemp -d -- "$STATE/work.XXXXXX") || die "cannot create a work directory in $STATE"
TMPDIR=$work # temporary files of bash here-documents and of the checks stay in here
export TMPDIR
mkdir -- "$work/src" "$work/new" || die "cannot prepare $work"
if [ "$MODE" = apply ]; then
    cp -- "$SRC/overview.js" "$SRC/SummaryOverview.pm" "$work/src/" || die "cannot read the source files"
fi

cat >"$work/analyze.pl" <<'PERL'
# Layout checks and file generation for apply.sh (pve-summary-overview).
use strict;
use warnings;
use Digest::MD5 ();

my $TAG = 'pve-summary-overview';
my $HOOK = "        # BEGIN pve-summary-overview\n"
    . "        eval {\n"
    . "            require PVE::SummaryOverview;\n"
    . "            \$res->{hwinfo} = PVE::SummaryOverview::collect();\n"
    . "        };\n"
    . "        warn \"pve-summary-overview: \$@\" if \$@;\n"
    . "        # END pve-summary-overview\n\n";
my $PROT = "    protected => 1, # pve-summary-overview\n";
my $HEAD = qr/^    name => 'status',\n    path => 'status',\n    method => 'GET',\n/m;
my $ANCHOR = qr/^        my \$dinfo = df\('\/', 1\);/m;
my $JS_BEGIN = "/* BEGIN pve-summary-overview */\n";
my $JS_END = "/* END pve-summary-overview */\n";
my $JS_ANY = qr/\b(?:BEGIN|END) pve-summary-overview\b/;
my $WT_TAG = '/proxmoxlib.js?ver=[% wtversion %]';
my $PM_TAG = '/pve2/js/pvemanagerlib.js?ver=[% version %]';

sub fail { die "pve-summary-overview: $_[0]\n" }
sub slurp {
    my ($f) = @_;
    open(my $fh, '<:raw', $f) or fail("cannot read $f: $!");
    local $/;
    my $d = <$fh>;
    close($fh);
    return $d // '';
}
sub spew {
    my ($f, $d) = @_;
    open(my $fh, '>:raw', $f) or fail("cannot write $f: $!");
    print {$fh} $d or fail("cannot write $f: $!");
    close($fh) or fail("cannot write $f: $!");
}
sub count { my ($s, $re) = @_; my $n = 0; $n++ while $s =~ /$re/g; return $n }
sub lit { my ($s, $l) = @_; return count($s, qr/\Q$l\E/) }
sub id16 { return substr(Digest::MD5::md5_hex($_[0]), 0, 16) }

sub nodes_split {
    my ($t) = @_;
    my $tags = lit($t, $TAG);
    my ($state, $clean);
    if ($tags == 0) {
        ($state, $clean) = ('clean', $t);
    } elsif ($tags == 4 && lit($t, $HOOK) == 1 && lit($t, $PROT) == 1
        && count($t, qr/\Q$HOOK\E(?=$ANCHOR)/) == 1 && count($t, qr/$HEAD\Q$PROT\E/) == 1) {
        $clean = $t;
        $clean =~ s/\Q$HOOK\E//;
        $clean =~ s/\Q$PROT\E//;
        $state = 'installed';
    } else {
        fail("Nodes.pm: $tags pve-summary-overview marker lines, but not exactly one intact hook block"
            . " (right before the rootfs anchor) plus one protected line (right after the status"
            . " header); refusing to guess");
    }
    my $h = count($clean, $HEAD);
    my $a = count($clean, $ANCHOR);
    fail("Nodes.pm: unexpected layout (status method $h, rootfs anchor $a; need exactly 1 each)")
        if $h != 1 || $a != 1;
    $clean =~ $HEAD or fail('Nodes.pm: internal error');
    my $hend = $+[0];
    $clean =~ $ANCHOR or fail('Nodes.pm: internal error');
    my $astart = $-[0];
    my $body = $astart > $hend ? substr($clean, $hend, $astart - $hend) : undef;
    fail('Nodes.pm: rootfs anchor is not inside the status method')
        if !defined($body) || $body =~ /^__PACKAGE__->register_method/m;
    fail("Nodes.pm: the status method already declares 'protected' (upstream change); refusing to guess")
        if $body =~ /^    protected\b/m;
    return ($state, $clean);
}

sub nodes_install {
    my ($n) = @_;
    $n =~ s/($HEAD)/$1$PROT/ or fail('Nodes.pm: internal error');
    $n =~ s/($ANCHOR)/$HOOK$1/ or fail('Nodes.pm: internal error');
    return $n;
}

sub js_split {
    my ($t) = @_;
    my $any = count($t, $JS_ANY);
    my $b = count($t, qr/^\Q$JS_BEGIN\E/m);
    my $e = count($t, qr/^\Q$JS_END\E/m);
    my ($state, $clean);
    if ($any == 0) {
        ($state, $clean) = ('clean', $t);
    } elsif ($any == 2 && $b == 1 && $e == 1 && $t =~ /\A(.*?)^\Q$JS_BEGIN\E.*^\Q$JS_END\E\z/sm) {
        ($state, $clean) = ('installed', $1);
    } else {
        fail("pvemanagerlib.js: $b BEGIN / $e END marker lines ($any marker mentions); expected none,"
            . " or exactly one block appended at the very end; refusing to guess");
    }
    fail('pvemanagerlib.js: does not end with a newline') if $clean !~ /\n\z/;
    my $sv = lit($clean, "Ext.define('PVE.node.StatusView'");
    my $su = lit($clean, "Ext.define('PVE.node.Summary'");
    fail("pvemanagerlib.js: Summary classes not found exactly once (StatusView $sv, Summary $su)")
        if $sv != 1 || $su != 1;
    return ($state, $clean);
}

sub check_overview {
    my ($ov) = @_;
    fail("overview.js must start with the line '/* BEGIN pve-summary-overview */', end with the line"
        . " '/* END pve-summary-overview */' and contain no other marker")
        unless count($ov, $JS_ANY) == 2 && $ov =~ /\A\Q$JS_BEGIN\E.*^\Q$JS_END\E\z/sm;
}

sub check_module {
    my ($m) = @_;
    fail("SummaryOverview.pm: expected exactly one 'package PVE::SummaryOverview;' and a 'sub collect'")
        unless count($m, qr/^package PVE::SummaryOverview;/m) == 1 && $m =~ /^sub collect\b/m;
}

sub tpl_split {
    my ($t) = @_;
    my $w = lit($t, $WT_TAG);
    my $p = lit($t, $PM_TAG);
    fail("index.html.tpl: script tags not found exactly once (proxmoxlib $w, pvemanagerlib $p)")
        if $w != 1 || $p != 1;
    my $uw = count($t, qr/\Q$WT_TAG\E&ui=[0-9a-f]{16}"/);
    my $up = count($t, qr/\Q$PM_TAG\E&ui=[0-9a-f]{16}"/);
    my $bw = count($t, qr/\Q$WT_TAG\E"/);
    my $bp = count($t, qr/\Q$PM_TAG\E"/);
    my $ui = lit($t, '&ui=');
    my $state;
    if ($ui == 0 && $bw == 1 && $bp == 1) {
        $state = 'clean';
    } elsif ($ui == 2 && $uw == 1 && $up == 1) {
        $state = 'installed';
    } else {
        fail("index.html.tpl: &ui= parameters not in a recognised state (proxmoxlib $uw,"
            . " pvemanagerlib $up, all &ui= $ui); refusing to guess");
    }
    (my $clean = $t) =~ s/(\Q$WT_TAG\E|\Q$PM_TAG\E)&ui=[0-9a-f]{16}"/$1"/g;
    return ($state, $clean);
}

sub tpl_install {
    my ($t, $js_id, $wt_id) = @_;
    $t =~ s/(\Q$WT_TAG\E)"/$1&ui=$wt_id"/ or fail('index.html.tpl: internal error');
    $t =~ s/(\Q$PM_TAG\E)"/$1&ui=$js_id"/ or fail('index.html.tpl: internal error');
    return $t;
}

my $cmd = shift(@ARGV) // '';
if ($cmd eq 'plan') {
    my ($mode, $js_f, $tpl_f, $nodes_f, $wt_f, $ov_f, $mod_f, $out) = @ARGV;
    my ($js_s, $js) = js_split(slurp($js_f));
    my ($tpl_s, $tpl) = tpl_split(slurp($tpl_f));
    my ($nodes_s, $nodes) = nodes_split(slurp($nodes_f));
    if ($mode eq 'apply') {
        my $ov = slurp($ov_f);
        check_overview($ov);
        check_module(slurp($mod_f));
        $js .= $ov;
        $nodes = nodes_install($nodes);
        $tpl = tpl_install($tpl, id16($js), id16(slurp($wt_f)));
    } elsif ($mode ne 'remove') {
        fail("internal error: mode $mode");
    }
    spew("$out/pvemanagerlib.js", $js);
    spew("$out/index.html.tpl", $tpl);
    spew("$out/Nodes.pm", $nodes);
    print "nodes=$nodes_s js=$js_s tpl=$tpl_s\n";
} elsif ($cmd eq 'verify') {
    my ($want, $js_f, $tpl_f, $nodes_f, $wt_f, $ov_f) = @ARGV;
    my $js = slurp($js_f);
    my $tpl = slurp($tpl_f);
    my ($js_s) = js_split($js);
    my ($tpl_s) = tpl_split($tpl);
    my ($nodes_s) = nodes_split(slurp($nodes_f));
    fail("self-check: expected all files $want, got nodes=$nodes_s js=$js_s tpl=$tpl_s")
        if grep { $_ ne $want } ($nodes_s, $js_s, $tpl_s);
    if ($want eq 'installed') {
        my $ov = slurp($ov_f);
        fail('self-check: pvemanagerlib.js does not end with overview.js')
            if length($js) < length($ov) || substr($js, -length($ov)) ne $ov;
        my ($wt, $pm) = (id16(slurp($wt_f)), id16($js));
        fail('self-check: &ui= values do not match the files')
            if index($tpl, "$WT_TAG&ui=$wt\"") < 0 || index($tpl, "$PM_TAG&ui=$pm\"") < 0;
    }
    print "ok\n";
} else {
    fail("internal error: unknown command '$cmd'");
}
PERL

found=$(perl -- "$work/analyze.pl" plan "$MODE" "$JS" "$TPL" "$NODES" "$WTLIB" \
    "$work/src/overview.js" "$work/src/SummaryOverview.pm" "$work/new") || die "nothing was changed"
module_state=absent
[ ! -e "$MODULE" ] || module_state=present
say "found $found module=$module_state"
case "$found module=$module_state" in
*installed*clean* | *clean*installed* | *clean*present | *installed*absent)
    say "note: the files are in a mixed state (an earlier run did not finish?); $MODE makes them consistent"
    ;;
esac

compile() { # compile FILE WHAT
    if perl -I"$LIBDIR" -c -- "$1" >"$work/compile.log" 2>&1 && grep -q 'syntax OK' "$work/compile.log"; then
        return 0
    fi
    sed -n '1,20p' "$work/compile.log" >&2
    die "$2 does not compile; nothing was changed"
}
if [ "$MODE" = apply ]; then compile "$work/src/SummaryOverview.pm" "SummaryOverview.pm"; fi
compile "$work/new/Nodes.pm" "the new Nodes.pm"
if command -v node >/dev/null 2>&1; then
    if ! node --check "$work/new/pvemanagerlib.js" >"$work/node.log" 2>&1; then
        sed -n '1,20p' "$work/node.log" >&2
        die "the new pvemanagerlib.js does not parse; nothing was changed"
    fi
else
    say "warning: node not found - the new pvemanagerlib.js was not syntax-checked"
fi
want=installed
[ "$MODE" = apply ] || want=clean
perl -- "$work/analyze.pl" verify "$want" "$work/new/pvemanagerlib.js" "$work/new/index.html.tpl" \
    "$work/new/Nodes.pm" "$WTLIB" "$work/src/overview.js" >/dev/null || die "nothing was changed"

for n in MODULE NODES JS TPL; do
    dst=$(target_of "$n")
    if [ "$n" = MODULE ] && [ "$MODE" = remove ]; then
        [ ! -e "$dst" ] || CHANGE+=("$n")
    elif [ ! -e "$dst" ] || ! cmp -s -- "$(plan_of "$n")" "$dst"; then
        CHANGE+=("$n")
    fi
done
if [ ${#CHANGE[@]} -eq 0 ]; then
    echo "pve-summary-overview: $MODE: nothing to change"
    exit 0
fi
say "$MODE: will change ${CHANGE[*]}"

# ---------------------------------------------------------------- 2. backup (targets untouched)
BACKUP=$STATE/backup/$(date +%Y%m%d-%H%M%S)-$$
mkdir -p -- "$STATE/backup" && mkdir -- "$BACKUP" || die "cannot create $BACKUP; nothing was changed"
printf '# pve-summary-overview %s backup %s\n# file original-sha256 planned-sha256 path\n' \
    "$MODE" "$(date '+%F %T %z')" >"$BACKUP/MANIFEST" || die "cannot write $BACKUP/MANIFEST; nothing was changed"
for n in MODULE NODES JS TPL; do
    dst=$(target_of "$n")
    bak=$BACKUP/${dst##*/}
    if [ -e "$dst" ]; then
        cp -p -- "$dst" "$bak" && cmp -s -- "$dst" "$bak" || die "cannot back up $dst; nothing was changed"
        orig=$(sha256sum <"$bak") || die "cannot hash $bak; nothing was changed"
        orig=${orig%% *}
    else
        : >"$bak.ABSENT" || die "cannot write $bak.ABSENT; nothing was changed"
        orig=ABSENT
    fi
    if [ "$n" = MODULE ] && [ "$MODE" = remove ]; then
        planned=ABSENT
    else
        planned=$(sha256sum <"$(plan_of "$n")") || die "cannot hash the new ${dst##*/}; nothing was changed"
        planned=${planned%% *}
    fi
    echo "${dst##*/} $orig $planned $dst" >>"$BACKUP/MANIFEST" || die "cannot write $BACKUP/MANIFEST; nothing was changed"
done
sync -- "$BACKUP"/* "$BACKUP" || die "cannot flush $BACKUP; nothing was changed"

# ---------------------------------------------------------------- 3. commit (rollback on failure)
PHASE=commit
if [ "$MODE" = apply ]; then order=(MODULE NODES JS TPL); else order=(TPL JS NODES); fi
for n in "${order[@]}"; do
    in_change "$n" || continue
    dst=$(target_of "$n")
    fmode=644
    [ ! -e "$dst" ] || fmode=$(stat -c '%a' -- "$dst")
    TOUCHED+=("$n")
    put_file "$(plan_of "$n")" "$dst" "$fmode" || die "writing $dst failed"
done
for n in "${TOUCHED[@]}"; do
    cmp -s -- "$(plan_of "$n")" "$(target_of "$n")" || die "$(target_of "$n") does not hold the new content"
done
if [ ${#TOUCHED[@]} -gt 0 ]; then # (remove of a left-over module alone needs no restart)
    RESTARTED=1
    restart_services || die "restarting ${SERVICES[*]} failed or a service is not active"
fi
PHASE=done

if [ "$MODE" = remove ] && in_change MODULE; then
    if ! rm -f -- "$MODULE" || [ -e "$MODULE" ]; then
        record module-left
        die "hook removed and services restarted, but $MODULE could not be deleted; run 'apply.sh remove' again"
    fi
fi
record ok
echo "pve-summary-overview: $MODE done (previous files saved in $BACKUP); reload the browser tab."
