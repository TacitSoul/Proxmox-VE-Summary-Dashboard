package PVE::SummaryOverview;

# Hardware data for the node Summary overview.
# Source: /opt/pve-summary-overview/SummaryOverview.pm (installed by apply.sh).
# Called from PVE::API2::Nodes status (runs as root inside pvedaemon).

use strict;
use warnings;

use JSON ();
use Scalar::Util ();
use Time::HiRes ();
use PVE::Tools ();

my $SMART_TTL = 60; # seconds; SMART counters change slowly
my $SMART_RETRY = 10; # seconds; retry interval after a failed read
my $RAPL_STATE = '/run/pve-summary-overview.rapl';
my $smart_cache = {};

sub _line {
    my ($file) = @_;
    open(my $fh, '<', $file) or return undef;
    my $line = <$fh>;
    close($fh);
    return undef if !defined($line);
    $line =~ s/^\s+|\s+$//g;
    return $line;
}

sub _int {
    my $v = _line(@_);
    return defined($v) && $v =~ /^(-?\d+)$/ ? $1 + 0 : undef;
}

sub _celsius {
    my ($file, $max) = @_;
    my $v = _int($file);
    return undef if !defined($v);
    $v /= 1000;
    return undef if $v < -50 || $v > ($max // 150); # drop placeholder limits such as 65261 C
    return $v;
}

sub _cpulist {
    my ($list) = @_;
    my @cpus;
    for my $part (split(/,/, $list // '')) {
        if ($part =~ /^(\d+)-(\d+)$/) {
            push @cpus, $1 .. $2;
        } elsif ($part =~ /^(\d+)$/) {
            push @cpus, $1 + 0;
        }
    }
    return @cpus;
}

sub _hwmon {
    my $res = { package => undef, cores => {}, nvme => {} };
    for my $h (glob('/sys/class/hwmon/hwmon*')) {
        my $name = _line("$h/name") // next;
        if ($name eq 'coretemp') {
            for my $label_file (glob("$h/temp*_label")) {
                my $label = _line($label_file) // next;
                (my $base = $label_file) =~ s/_label$//;
                my $entry = {
                    temp => _celsius("${base}_input"),
                    high => _celsius("${base}_max"),
                    crit => _celsius("${base}_crit"),
                };
                if ($label =~ /^Package id 0$/) {
                    $res->{package} = $entry;
                } elsif ($label =~ /^Core (\d+)$/) {
                    $res->{cores}->{ $1 + 0 } = $entry;
                }
            }
        } elsif ($name eq 'nvme') {
            my $dev = readlink("$h/device") // next;
            next if $dev !~ m{(nvme\d+)$};
            $res->{nvme}->{$1} = {
                temp => _celsius("$h/temp1_input"),
                temp_high => _celsius("$h/temp1_max"),
                temp_crit => _celsius("$h/temp1_crit"),
            };
        }
    }
    return $res;
}

sub _cores {
    my ($temps) = @_;

    my %type;
    $type{$_} = 'P' for _cpulist(_line('/sys/devices/cpu_core/cpus'));
    $type{$_} = 'E' for _cpulist(_line('/sys/devices/cpu_atom/cpus'));

    my %cores;
    my @cpus = sort { $a <=> $b } map { m{/cpu(\d+)$} ? $1 + 0 : () } glob('/sys/devices/system/cpu/cpu[0-9]*');
    for my $n (@cpus) {
        my $dir = "/sys/devices/system/cpu/cpu$n";
        my $core_id = _int("$dir/topology/core_id") // next; # offline CPUs have no topology
        my $core = $cores{$core_id} //= { id => $core_id, type => $type{$n}, threads => [], mhz => [] };
        my $khz = _int("$dir/cpufreq/scaling_cur_freq");
        push @{ $core->{threads} }, $n;
        push @{ $core->{mhz} }, defined($khz) ? $khz / 1000 : undef;
    }
    for my $core (values %cores) {
        my $t = $temps->{ $core->{id} } // {};
        $core->{temp} = $t->{temp};
    }
    return [map { $cores{$_} } sort { $a <=> $b } keys %cores];
}

sub _rapl_energy {
    my ($uj, $range) = (0, 0);
    my $found;
    for my $zone (glob('/sys/class/powercap/intel-rapl:[0-9]*')) {
        next if $zone !~ m{/intel-rapl:\d+$}; # packages only, no sub-zones
        next if (_line("$zone/name") // '') !~ /^package/;
        my $e = _int("$zone/energy_uj") // next;
        $uj += $e;
        $range += _int("$zone/max_energy_range_uj") // 0;
        $found = 1;
    }
    return $found ? ($uj, $range) : ();
}

sub _watts {
    my ($from, $to, $range, $dt) = @_;
    my $delta = $to - $from;
    $delta += $range if $delta < 0 && $range > 0; # counter wrapped
    return undef if $delta < 0 || $dt <= 0;
    return $delta / 1e6 / $dt;
}

# Package power from the RAPL energy counter. The previous sample is shared between the
# pvedaemon workers through a small state file, so normal polling never has to sleep.
sub _power {
    my ($uj, $range) = _rapl_energy();
    return undef if !defined($uj);
    my $now = Time::HiRes::time();

    my ($pt, $puj, $pw);
    if ((_line($RAPL_STATE) // '') =~ /^(\d+(?:\.\d+)?) (\d+) (\d+(?:\.\d+)?)$/) {
        ($pt, $puj, $pw) = ($1 + 0, $2 + 0, $3 + 0);
    }

    my $watts;
    if (defined($pt) && $now - $pt >= 0 && $now - $pt < 0.5) {
        return $pw; # several clients polling at once: reuse the last value
    } elsif (defined($pt) && $now - $pt <= 30) {
        $watts = _watts($puj, $uj, $range, $now - $pt);
    }
    if (!defined($watts)) { # no usable previous sample: take one short sample
        Time::HiRes::usleep(100_000);
        my ($uj2) = _rapl_energy();
        my $now2 = Time::HiRes::time();
        $watts = _watts($uj, $uj2, $range, $now2 - $now) if defined($uj2);
        ($uj, $now) = ($uj2, $now2) if defined($uj2);
    }
    return undef if !defined($watts);

    eval { PVE::Tools::file_set_contents($RAPL_STATE, sprintf("%.3f %d %.3f\n", $now, $uj, $watts)); };
    return $watts;
}

sub _smart {
    my ($name) = @_; # already validated as nvme\d+

    my $now = time();
    my $cached = $smart_cache->{$name};
    return $cached->{data} if $cached && $now < $cached->{expires};

    my $out = '';
    eval {
        PVE::Tools::run_command(
            ['/usr/sbin/smartctl', '-a', '-j', "/dev/$name"],
            outfunc => sub { $out .= $_[0] . "\n" },
            errfunc => sub { },
            noerr => 1,
            timeout => 5,
        );
    };
    my $json = eval { JSON::decode_json($out) };
    my $data = {};
    if (ref($json) eq 'HASH' && ref($json->{nvme_smart_health_information_log}) eq 'HASH') {
        my $log = $json->{nvme_smart_health_information_log};
        my $passed = $json->{smart_status}->{passed};
        my $units = sub { defined($_[0]) ? $_[0] * 512000 : undef }; # NVMe data unit = 1000 * 512 bytes
        $data = {
            model => $json->{model_name},
            firmware => $json->{firmware_version},
            capacity => $json->{user_capacity}->{bytes} // $json->{nvme_total_capacity},
            passed => defined($passed) ? ($passed ? 1 : 0) : undef,
            critical_warning => $log->{critical_warning},
            percentage_used => $log->{percentage_used},
            available_spare => $log->{available_spare},
            spare_threshold => $log->{available_spare_threshold},
            read_bytes => $units->($log->{data_units_read}),
            written_bytes => $units->($log->{data_units_written}),
            power_on_hours => $json->{power_on_time}->{hours},
            power_cycles => $json->{power_cycle_count},
            unsafe_shutdowns => $log->{unsafe_shutdowns},
            media_errors => $log->{media_errors},
            checked => $now,
        };
    }
    $smart_cache->{$name} = { data => $data, expires => $now + (%$data ? $SMART_TTL : $SMART_RETRY) };
    return $data;
}

# Partition layout of every NVMe namespace: what is on the disk and how full it is.
# One lsblk call (~5 ms); the result is cached together with SMART.
my $layout_cache = { expires => 0, data => {} };

sub _layout {
    my $now = time();
    return $layout_cache->{data} if $now < $layout_cache->{expires};

    my $out = '';
    eval {
        PVE::Tools::run_command(
            ['/usr/bin/lsblk', '-J', '-b', '-o', 'NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS,FSUSED,FSSIZE,PARTTYPENAME'],
            outfunc => sub { $out .= $_[0] . "\n" },
            errfunc => sub { },
            noerr => 1,
            timeout => 5,
        );
    };
    my $json = eval { JSON::decode_json($out) };
    my $res = {};
    for my $disk (@{ ref($json) eq 'HASH' ? $json->{blockdevices} // [] : [] }) {
        next if ($disk->{name} // '') !~ /^(nvme\d+)n\d+$/;
        my $ctrl = $1;
        my $parts = [];
        my $walk;
        $walk = sub {
            my ($node, $depth) = @_;
            for my $c (@{ $node->{children} // [] }) {
                my @mp = grep { defined && $_ ne '' } @{ $c->{mountpoints} // [] };
                push @$parts, {
                    name => $c->{name},
                    type => $c->{type},
                    depth => $depth,
                    size => $c->{size},
                    fstype => $c->{fstype},
                    label => $c->{parttypename},
                    mount => join(' ', @mp),
                    used => $c->{fsused},
                    fssize => $c->{fssize},
                };
                $walk->($c, $depth + 1);
            }
        };
        $walk->($disk, 0);
        my @mounts = map { $_->{mount} ? split(/ /, $_->{mount}) : () } @$parts;
        my $role = (grep { $_ eq '/' } @mounts) ? 'system'
            : (grep { $_ eq '[SWAP]' || m{^/} } @mounts) ? 'mounted'
            : @$parts ? 'unmounted'
            : 'empty';
        $res->{$ctrl} = { role => $role, size => $disk->{size}, parts => $parts };
    }
    $layout_cache = { expires => $now + $SMART_TTL, data => $res };
    return $res;
}

sub _nvme {
    my ($temps) = @_;

    my @names;
    if (opendir(my $dh, '/sys/class/nvme')) {
        @names = sort { $a->[1] <=> $b->[1] } map { /^(nvme(\d+))$/ ? [$1, $2] : () } readdir($dh);
        closedir($dh);
    }

    my $layout = _layout();
    my %rank = (system => 0, mounted => 1, unmounted => 2, empty => 3);
    my $list = [];
    for my $entry (@names) {
        my $name = $entry->[0]; # untainted by the capture above
        my $disk = { %{ _smart($name) }, %{ $temps->{$name} // {} }, name => $name };
        $disk->{model} //= _line("/sys/class/nvme/$name/model");
        my $l = $layout->{$name} // {};
        $disk->{role} = $l->{role} // 'unknown';
        $disk->{parts} = $l->{parts} // [];
        push @$list, $disk;
    }
    # the disk holding the root filesystem first, then by controller number
    return [sort { ($rank{ $a->{role} } // 9) <=> ($rank{ $b->{role} } // 9) } @$list];
}

# Today's traffic for the node and for the guests that belong to this node, read from the PVE RRD
# files at their native 1-minute resolution and summed here, so the browser only receives a compact
# result (node: totals + 5-minute series; guests: totals).
#
# RRD semantics (pve-node-9.0 / pve-vm-9.0): netin/netout are DERIVE data sources in bytes per
# second (min 0, step 60). The row RRDs::fetch returns for time stamp t is the average rate over the
# interval (t-step, t]. "Today" is the window (local midnight, end], end being the last minute
# boundary pvestatd has certainly written (one minute of margin). Only rows whose whole interval
# lies inside the window count, each adding rate * step bytes. Unknown rows (no sample, counter
# reset) add neither bytes nor covered seconds, and every direction is summed and covered on its
# own. Nothing is extrapolated or filled with zero: a direction without any coverage is null, and
# partial coverage is visible as in_secs / out_secs < end - start.
#
# Authorization: the per-worker cache below only holds the raw, requester-independent data of this
# node. Every response is a new copy filtered for the identity of the API request being served,
# using the native permission check of the RPC environment: Sys.Audit on /nodes/<node> for the node
# and VM.Audit on /vms/<vmid> for each guest (for API tokens the environment applies the token's
# privilege separation, i.e. token privileges intersected with the owner's). Guests are limited to
# those the cluster guest list places on this node, so RRD files of migrated or deleted guests are
# never read. Without a request identity or without the guest list no (guest) data is returned.
our $RRD_DIR = '/var/lib/rrdcached/db';
our $RRD_SOCKET = '/var/run/rrdcached.sock';
my $TRAFFIC_STEP = 60; # native RRA resolution, seconds
my $TRAFFIC_BUCKET = 300; # node series: 5-minute buckets
my $TRAFFIC_TTL = 60; # monotonic upper bound; a new minute, day or guest set changes the key anyway
my $traffic_cache = { key => '', mono => undef, data => undef };

sub _mono {
    return eval { Time::HiRes::clock_gettime(Time::HiRes::CLOCK_MONOTONIC()) };
}

sub _rrd_fetch {
    my ($file, $start, $end) = @_;
    return undef if !-f $file;
    my @args = ('-s' => $start, '-e' => $end, '-r' => $TRAFFIC_STEP);
    push @args, '--daemon' => "unix:$RRD_SOCKET" if -S $RRD_SOCKET;
    my ($first, $step, $names, $data) = RRDs::fetch($file, 'AVERAGE', @args);
    return undef if RRDs::error() || ref($names) ne 'ARRAY' || ref($data) ne 'ARRAY';
    return undef if !defined($first) || !defined($step) || $step !~ /^\d+$/ || $step <= 0;
    my %col;
    @col{@$names} = (0 .. $#$names);
    return undef if !defined($col{netin}) || !defined($col{netout});
    my @rows;
    my $t = $first; # time stamp of the first row = end of its interval
    for my $line (@$data) {
        push @rows, [$t, $line->[$col{netin}], $line->[$col{netout}]];
        $t += $step;
    }
    return { step => $step + 0, rows => \@rows };
}

# a usable rate in bytes per second, or undef for unknown / invalid values
sub _rate {
    my ($v) = @_;
    return undef if !defined($v) || ref($v) || !Scalar::Util::looks_like_number($v);
    return undef if !($v >= 0) || $v == 9**9**9; # NaN, negative, infinite
    return $v + 0;
}

# Sum one RRD series over the window (start, end], every direction on its own.
sub _sum_traffic {
    my ($r, $start, $end, $with_series) = @_;
    my $step = $r->{step};
    my $res = { in => 0, out => 0, in_secs => 0, out_secs => 0 };
    my %b;
    for my $row (@{ $r->{rows} }) {
        my ($t, @v) = @$row;
        next if !defined($t) || $t - $step < $start || $t > $end; # (t-step, t] not inside the window
        my $k = int(($t - $step - $start) / $TRAFFIC_BUCKET);
        for my $i (0, 1) {
            my $rate = _rate($v[$i]) // next;
            my $dir = $i ? 'out' : 'in';
            $res->{$dir} += $rate * $step;
            $res->{"${dir}_secs"} += $step;
            my $e = $b{$k} //= [0, 0, 0, 0]; # in bytes, in seconds, out bytes, out seconds
            $e->[2 * $i] += $rate * $step;
            $e->[2 * $i + 1] += $step;
        }
    }
    for my $dir (qw(in out)) {
        $res->{$dir} = undef if !$res->{"${dir}_secs"}; # unknown, not zero
    }
    if ($with_series) {
        # one point per 5-minute bucket (bucket end time, average B/s of the known minutes); buckets
        # without any known minute stay in the list as null so gaps remain visible
        my $n = $end > $start ? int(($end - $start + $TRAFFIC_BUCKET - 1) / $TRAFFIC_BUCKET) : 0;
        $res->{series} = [map {
            my $e = $b{$_} // [0, 0, 0, 0];
            my $t = $start + ($_ + 1) * $TRAFFIC_BUCKET;
            [$t < $end ? $t : $end, $e->[1] ? $e->[0] / $e->[1] : undef, $e->[3] ? $e->[2] / $e->[3] : undef]
        } 0 .. $n - 1];
    }
    return $res;
}

# Guests that the cluster guest list (pmxcfs, refreshed for every API request) places on this node.
sub _local_guests {
    my ($node) = @_;
    my $vmlist = eval { require PVE::Cluster; PVE::Cluster::get_vmlist() };
    my $ids = ref($vmlist) eq 'HASH' ? $vmlist->{ids} : undef;
    return undef if ref($ids) ne 'HASH';
    my $res = {};
    for my $key (keys %$ids) {
        my ($vmid) = $key =~ /^([1-9][0-9]{2,8})$/ or next;
        my $d = $ids->{$key};
        next if ref($d) ne 'HASH' || !defined($d->{node}) || $d->{node} ne $node;
        my ($type) = ($d->{type} // '') =~ /^(qemu|lxc)$/ or next;
        $res->{$vmid} = $type;
    }
    return $res;
}

# Raw (unfiltered) data of this node; cached per worker, never handed out without filtering.
sub _traffic_raw {
    my ($node, $guests) = @_;
    require RRDs;
    require POSIX;

    my $now = time();
    my @lt = localtime($now);
    my $start = POSIX::mktime(0, 0, 0, $lt[3], $lt[4], $lt[5]); # local midnight
    my $end = $TRAFFIC_STEP * int($now / $TRAFFIC_STEP) - $TRAFFIC_STEP;
    $end = $start if $end < $start; # first minutes after midnight: nothing complete yet
    # Stringify temporary numbers, not the window scalars also used by JSON and series timestamps.
    my $key = join(':', $start + 0, $end + 0, $node, map { "$_=$guests->{$_}" } sort { $a <=> $b } keys %$guests);
    my $mono = _mono();
    my $c = $traffic_cache;
    return $c->{data} if $c->{data} && $c->{key} eq $key && defined($mono) && defined($c->{mono})
        && $mono >= $c->{mono} && $mono - $c->{mono} < $TRAFFIC_TTL;

    my $read = sub {
        my ($file, $with_series) = @_;
        return undef if !-f $file;
        my $r = $end > $start ? _rrd_fetch($file, $start, $end) : { step => $TRAFFIC_STEP, rows => [] };
        return $r ? _sum_traffic($r, $start, $end, $with_series) : undef;
    };
    my $res = { start => $start, end => $end, now => $now, node => undef, guests => {} };
    $res->{node} = $read->("$RRD_DIR/pve-node-9.0/$node", 1);
    for my $vmid (sort { $a <=> $b } keys %$guests) {
        my $g = $read->("$RRD_DIR/pve-vm-9.0/$vmid", 0) or next;
        $res->{guests}->{$vmid} = $g;
    }
    $traffic_cache = { key => $key, mono => $mono, data => $res };
    return $res;
}

sub _allowed {
    my ($rpcenv, $user, $path, $priv) = @_;
    my $ok = eval { $rpcenv->check($user, $path, [$priv], 1) };
    return $ok && !$@ ? 1 : 0; # errors deny
}

sub _copy_entry {
    my ($e) = @_;
    # Keep response copies numeric even after cache values have been used in string context; unknown stays null.
    my $c = { map { $_ => defined($e->{$_}) ? $e->{$_} + 0 : undef } qw(in out in_secs out_secs) };
    $c->{series} = [map { [@$_] } @{ $e->{series} }] if ref($e->{series}) eq 'ARRAY';
    return $c;
}

# Traffic as visible to the identity of the current API request (fresh structure every call).
sub traffic {
    my $rpcenv = eval { require PVE::RPCEnvironment; PVE::RPCEnvironment::get() };
    my $user = $rpcenv ? eval { $rpcenv->get_user(1) } : undef;
    return undef if !defined($user) || ref($user) || $user eq ''; # no request identity: nothing

    require PVE::INotify;
    my ($node) = (PVE::INotify::nodename() // '') =~ /^([A-Za-z0-9][A-Za-z0-9\-\.]*)$/;
    return undef if !defined($node);

    my $node_ok = _allowed($rpcenv, $user, "/nodes/$node", 'Sys.Audit');
    my $guests = _local_guests($node) // {};
    my @visible = grep { _allowed($rpcenv, $user, "/vms/$_", 'VM.Audit') } sort { $a <=> $b } keys %$guests;
    return undef if !$node_ok && !@visible;

    my $raw = _traffic_raw($node, $guests);
    my $res = { start => $raw->{start} + 0, end => $raw->{end} + 0, now => $raw->{now} + 0, node => undef, guests => {} };
    $res->{node} = _copy_entry($raw->{node}) if $node_ok && $raw->{node};
    for my $vmid (@visible) {
        my $g = $raw->{guests}->{$vmid} or next;
        $res->{guests}->{$vmid} = _copy_entry($g);
    }
    return $res;
}

sub collect {
    my $hwmon = _hwmon();
    my $policy = '/sys/devices/system/cpu/cpufreq/policy0';
    my $traffic = eval { traffic() }; # scalar; a failure only drops the traffic part

    return {
        cpu => {
            package => $hwmon->{package},
            cores => _cores($hwmon->{cores}),
            governor => _line("$policy/scaling_governor"),
            driver => _line("$policy/scaling_driver"),
            power_w => _power(),
        },
        nvme => _nvme($hwmon->{nvme}),
        traffic => $traffic,
    };
}

1;
