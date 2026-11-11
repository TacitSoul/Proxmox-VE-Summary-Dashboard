#!/usr/bin/env python3
"""Offline v1 packaging checks. No installer, collector or service is executed."""

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
PAYLOAD_SHA256 = {
    "SummaryOverview.pm": "1f0ff8e62e95fa8a2844519271644ee9cd7b5e6452eb934101d01e72988d44bd",
    "overview.js": "40b72e39a5ce7a7f2726c568a34b7fdadc7f6e2e30eb6b3a74f4b0ac42187052",
    "apply.sh": "2a37f23146b0f6bf6181b1bfe8bf96659950eb42f4a6d1d1622254d4e7a00867",
}


def checked_bytes(name):
    path = ROOT / name
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"{name}: expected a regular file, not a symlink")
    return path.read_bytes()


def verify_payloads():
    """Fail before invoking any interpreter if the frozen payload/version differs."""
    if checked_bytes("VERSION") != b"v1\n":
        raise ValueError("VERSION must contain exactly v1 followed by a newline")
    for name, expected in PAYLOAD_SHA256.items():
        actual = hashlib.sha256(checked_bytes(name)).hexdigest()
        if actual != expected:
            raise ValueError(f"{name}: SHA256 differs from the v1 payload")
    lines = checked_bytes("SHA256SUMS").decode("ascii").splitlines()
    expected_lines = [f"{sha}  {name}" for name, sha in PAYLOAD_SHA256.items()]
    if sorted(lines) != sorted(expected_lines):
        raise ValueError("SHA256SUMS must bind exactly the three v1 payloads")


def safe_environment():
    # Do not let interpreter startup options load code supplied through the environment.
    env = dict(os.environ)
    for key in list(env):
        if key.startswith(("PERL", "NODE_", "LD_", "DYLD_")) or key in {
            "BASH_ENV", "ENV", "BASHOPTS", "SHELLOPTS", "CDPATH", "GLOBIGNORE",
        } or key.startswith("BASH_FUNC_"):
            env.pop(key, None)
    env["LC_ALL"] = "C"
    return env


class OfflineChecks(unittest.TestCase):
    def executable(self, name):
        path = shutil.which(name)
        if path is None:
            self.skipTest(f"{name} not installed; its syntax check was NOT performed")
        return path

    def run_check(self, argv, input_bytes=None):
        verify_payloads()
        print("CHECK: " + " ".join(argv), flush=True)
        return subprocess.run(
            argv,
            cwd=ROOT,
            env=safe_environment(),
            input=input_bytes if input_bytes is not None else b"",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
            check=False,
        )

    def assert_success(self, result):
        output = (result.stdout + result.stderr).decode("utf-8", errors="replace")
        if output:
            print(output.rstrip(), flush=True)
        self.assertEqual(result.returncode, 0, output)
        return output

    def test_01_v1_payloads_and_version(self):
        verify_payloads()

    def test_02_bash_syntax_only(self):
        bash = self.executable("bash")
        self.assert_success(self.run_check([bash, "-n", "--", "apply.sh"]))

    def test_03_node_syntax_only(self):
        node = self.executable("node")
        self.assert_success(self.run_check([node, "--check", "overview.js"]))

    def test_04_perl_compile_only(self):
        perl = self.executable("perl")
        # Stub the only compile-time PVE import; never load real PVE::Tools.
        # JSON and standard Perl modules still load from installed libraries.
        # perl -c parses subroutine bodies but does not call collect() or traffic().
        # Inject the tiny stub through stdin: no temporary files/directories are needed.
        stub = (
            b"BEGIN { package PVE::Tools; $INC{'PVE/Tools.pm'} = 1; }\n"
            b'#line 1 "SummaryOverview.pm"\n'
        )
        result = self.run_check(
            [perl, "-c", "-"], stub + checked_bytes("SummaryOverview.pm")
        )
        output = (result.stdout + result.stderr).decode("utf-8", errors="replace")
        if result.returncode != 0 and "Can't locate JSON.pm in @INC" in output:
            self.skipTest("Perl JSON module not installed; Perl compile check was NOT performed")
        self.assertIn("syntax OK", self.assert_success(result))


if __name__ == "__main__":
    try:
        verify_payloads()
    except (OSError, ValueError, UnicodeError) as exc:
        print(f"FAIL: integrity preflight: {exc}", file=sys.stderr)
        sys.exit(1)
    unittest.main(verbosity=2)
