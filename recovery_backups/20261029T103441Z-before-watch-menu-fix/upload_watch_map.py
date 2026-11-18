#!/usr/bin/env python3
"""
Upload a generated BFWatch map package over the watch's USB serial port.

This script uses only the Python standard library. Wake the watch, leave the
normal BFWatch firmware running, then run:

    python3 upload_watch_map.py

Use --port when more than one serial device is connected.
"""

from __future__ import annotations

import argparse
import glob
import os
import select
import sys
import termios
import time
import zlib
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PACKAGE = SCRIPT_DIR / "watch_map"
DEFAULT_LOGO_PACKAGE = SCRIPT_DIR / "watch_logos"
DEFAULT_MENUS_PACKAGE = SCRIPT_DIR / "watch_menus"
PORT_PATTERNS = (
    "/dev/cu.usbmodem*",
    "/dev/cu.usbserial*",
    "/dev/ttyACM*",
    "/dev/ttyUSB*",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload a generated packed BFWatch map to FFat."
    )
    parser.add_argument(
        "--package",
        type=Path,
        default=DEFAULT_PACKAGE,
        help="generated map package directory",
    )
    parser.add_argument(
        "--logos-package",
        type=Path,
        default=DEFAULT_LOGO_PACKAGE,
        help="generated logo package directory",
    )
    parser.add_argument(
        "--menus-package",
        type=Path,
        default=DEFAULT_MENUS_PACKAGE,
        help="generated menu package directory",
    )
    parser.add_argument(
        "--port",
        help="serial device; automatically detected when omitted",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="response timeout in seconds",
    )
    parser.add_argument(
        "--chunk-delay-ms",
        type=float,
        default=2.0,
        help="optional pause after each acknowledged USB block",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=5,
        help="number of automatic retries for an interrupted file",
    )
    parser.add_argument(
        "--resume-from",
        type=int,
        metavar="FILE_NUMBER",
        help=(
            "continue an interrupted upload at this 1-based file number "
            "without clearing the existing package"
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate and list files without opening the watch",
    )
    parser.add_argument(
        "--logos-only",
        action="store_true",
        help="replace only logos.bin and logos.idx; preserve the installed map",
    )
    parser.add_argument(
        "--menus-only",
        action="store_true",
        help="replace only menus.bin; preserve the installed map and logos",
    )
    return parser.parse_args()


def discover_port(explicit: str | None) -> str:
    if explicit:
        if not Path(explicit).exists():
            raise FileNotFoundError(f"serial port does not exist: {explicit}")
        return explicit
    candidates: list[str] = []
    for pattern in PORT_PATTERNS:
        candidates.extend(glob.glob(pattern))
    candidates = sorted(set(candidates))
    if not candidates:
        raise FileNotFoundError(
            "no watch serial port found; wake/connect the watch or pass --port"
        )
    if len(candidates) > 1:
        formatted = "\n  ".join(candidates)
        raise RuntimeError(
            f"more than one serial port found; choose one with --port:\n  {formatted}"
        )
    return candidates[0]


def package_files(
    package: Path,
    logos_package: Path,
    menus_package: Path,
    logos_only: bool = False,
    menus_only: bool = False,
) -> list[tuple[str, Path]]:
    if logos_only and menus_only:
        raise ValueError("--logos-only and --menus-only cannot be combined")
    package = package.resolve()
    logos_package = logos_package.resolve()
    menus_package = menus_package.resolve()
    logo_data = logos_package / "logos.bin"
    logo_index = logos_package / "logos.idx"
    menus_data = menus_package / "menus.bin"
    if not menus_data.is_file():
        raise FileNotFoundError(
            f"{menus_package} is not a generated BFWatch menu package"
        )
    if menus_only:
        return [(menus_data.name, menus_data)]
    if not logo_data.is_file() or not logo_index.is_file():
        raise FileNotFoundError(
            f"{logos_package} is not a generated BFWatch logo package"
        )
    if logos_only:
        return [
            (logo_data.name, logo_data),
            (logo_index.name, logo_index),
        ]

    packed_index = package / "map.idx"
    pack_files = sorted(package.glob("map[0-9][0-9].bin"))
    if packed_index.is_file() and pack_files:
        # Install indexes last so a partial transfer can never appear ready.
        return [
            *((path.name, path) for path in pack_files),
            (menus_data.name, menus_data),
            (logo_data.name, logo_data),
            (logo_index.name, logo_index),
            (packed_index.name, packed_index),
        ]

    index = package / "map_index.json"
    map_directory = package / "map"
    if not index.is_file() or not map_directory.is_dir():
        raise FileNotFoundError(
            f"{package} is not a generated BFWatch map package"
        )
    files: list[tuple[str, Path]] = [("map_index.json", index)]
    files.extend(
        (path.relative_to(package).as_posix(), path)
        for path in sorted(map_directory.rglob("*.jpg"))
    )
    if len(files) <= 1:
        raise ValueError("the package contains no JPEG map tiles")
    return files


class SerialPort:
    def __init__(self, path: str):
        self.path = path
        self.fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        self.buffer = bytearray()
        attributes = termios.tcgetattr(self.fd)
        attributes[0] = 0
        attributes[1] = 0
        attributes[2] = termios.CLOCAL | termios.CREAD | termios.CS8
        attributes[3] = 0
        attributes[4] = termios.B115200
        attributes[5] = termios.B115200
        attributes[6][termios.VMIN] = 0
        attributes[6][termios.VTIME] = 0
        termios.tcsetattr(self.fd, termios.TCSANOW, attributes)
        termios.tcflush(self.fd, termios.TCIOFLUSH)

    def close(self) -> None:
        if self.fd >= 0:
            os.close(self.fd)
            self.fd = -1

    def __enter__(self) -> "SerialPort":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def write_all(self, data: bytes, timeout: float) -> None:
        offset = 0
        deadline = time.monotonic() + timeout
        while offset < len(data):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("timed out writing to the watch")
            _, writable, _ = select.select([], [self.fd], [], min(remaining, 1.0))
            if not writable:
                continue
            try:
                written = os.write(self.fd, data[offset:])
            except BlockingIOError:
                continue
            if written <= 0:
                raise OSError("serial connection closed while writing")
            offset += written

    def send_line(self, text: str, timeout: float) -> None:
        self.write_all((text + "\n").encode("ascii"), timeout)

    def drain(self) -> None:
        termios.tcdrain(self.fd)

    def read_line(self, timeout: float) -> str:
        deadline = time.monotonic() + timeout
        while True:
            newline = self.buffer.find(b"\n")
            if newline >= 0:
                raw = bytes(self.buffer[:newline])
                del self.buffer[: newline + 1]
                return raw.rstrip(b"\r").decode("utf-8", errors="replace")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("timed out waiting for the watch")
            readable, _, _ = select.select([self.fd], [], [], min(remaining, 1.0))
            if not readable:
                continue
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                continue
            self.buffer.extend(chunk)

    def wait_for(self, prefix: str, timeout: float) -> str:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"timed out waiting for {prefix}")
            line = self.read_line(remaining)
            if line.startswith("BFMAP_ERROR"):
                raise RuntimeError(f"watch reported: {line}")
            if line.startswith(prefix):
                return line


def connect_watch(serial: SerialPort, timeout: float) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        serial.send_line("BFMAP_HELLO", 2.0)
        try:
            return serial.wait_for(
                "BFMAP_READY", min(1.5, deadline - time.monotonic())
            )
        except TimeoutError:
            continue
    raise TimeoutError(
        "the watch did not answer; wake its display and check the selected port"
    )


def send_file(
    serial: SerialPort,
    relative: str,
    data: bytes,
    crc: int,
    args: argparse.Namespace,
) -> None:
    serial.send_line(
        f"BFMAP_PUT {relative} {len(data)} {crc:08X}",
        args.timeout,
    )
    go_line = serial.wait_for("BFMAP_GO ", args.timeout)
    try:
        block_size = int(go_line.split()[1])
    except (IndexError, ValueError) as exc:
        raise RuntimeError(
            f"watch reported an invalid block size: {go_line}"
        ) from exc
    if not 16 <= block_size <= 1024:
        raise RuntimeError(
            f"watch requested an unsafe block size: {block_size}"
        )
    for offset in range(0, len(data), block_size):
        end = min(offset + block_size, len(data))
        serial.write_all(data[offset:end], args.timeout)
        serial.drain()
        if end < len(data):
            serial.wait_for(f"BFMAP_MORE {end}", args.timeout)
        if args.chunk_delay_ms > 0:
            time.sleep(args.chunk_delay_ms / 1000.0)
    serial.wait_for(f"BFMAP_OK {relative} ", args.timeout)


def recover_after_file_error(
    serial: SerialPort,
    timeout: float,
) -> str:
    # A receive_timeout response means the watch has already left binary receive
    # mode. Give its serial command loop a moment, then perform a fresh handshake.
    time.sleep(0.25)
    serial.buffer.clear()
    return connect_watch(serial, max(timeout, 15.0))


def upload(args: argparse.Namespace) -> int:
    if not 0.0 <= args.chunk_delay_ms <= 1000.0:
        raise ValueError("--chunk-delay-ms must be between 0 and 1000")
    if args.retries < 0:
        raise ValueError("--retries must be zero or greater")
    files = package_files(
        args.package,
        args.logos_package,
        args.menus_package,
        args.logos_only,
        args.menus_only,
    )
    resume_from = args.resume_from or 1
    if not 1 <= resume_from <= len(files):
        raise ValueError(
            f"--resume-from must be between 1 and {len(files)}"
        )
    total_bytes = sum(path.stat().st_size for _, path in files)
    displayed_package = (
        args.menus_package.resolve()
        if args.menus_only
        else (
            args.logos_package.resolve()
            if args.logos_only
            else args.package.resolve()
        )
    )
    print(f"Package: {displayed_package}")
    print(f"Files: {len(files)}")
    print(f"Payload: {total_bytes / (1024 * 1024):.2f} MiB")
    if args.dry_run:
        for relative, path in files:
            print(f"  {relative}: {path.stat().st_size:,} bytes")
        print("Dry run complete; nothing was uploaded.")
        return 0

    port_path = discover_port(args.port)
    print(f"Port: {port_path}")
    print("Connecting to BFWatch...")

    started = time.monotonic()
    sent_bytes = 0
    with SerialPort(port_path) as serial:
        ready = connect_watch(serial, args.timeout)
        print(f"Connected: {ready}")
        serial.send_line("BFMAP_BEGIN", args.timeout)
        serial.wait_for("BFMAP_BEGIN_OK", args.timeout)
        if resume_from == 1 and not args.logos_only and not args.menus_only:
            print("Removing the previous map package...")
            serial.send_line("BFMAP_CLEAR", args.timeout)
            serial.wait_for("BFMAP_CLEAR_OK", max(args.timeout, 60.0))
            serial.send_line("BFMAP_HELLO", args.timeout)
            cleared_ready = serial.wait_for("BFMAP_READY", args.timeout)
            try:
                free_bytes = int(cleared_ready.split()[2])
            except (IndexError, ValueError) as exc:
                raise RuntimeError(
                    f"watch reported invalid storage figures: {cleared_ready}"
                ) from exc
            required_bytes = total_bytes + 512 * 1024
            if free_bytes < required_bytes:
                raise RuntimeError(
                    "map storage was not cleared: "
                    f"{free_bytes:,} bytes free, "
                    f"at least {required_bytes:,} required"
                )
            print(f"Cleared: {free_bytes:,} bytes free")
        elif resume_from > 1:
            print(
                f"Resuming at file {resume_from}; preserving "
                f"files 1-{resume_from - 1}."
            )
            sent_bytes = sum(
                path.stat().st_size for _, path in files[: resume_from - 1]
            )
        elif args.logos_only:
            print("Replacing logos only; preserving the installed map.")
        else:
            print("Replacing menus only; preserving the installed map and logos.")

        for number, (relative, path) in enumerate(
            files[resume_from - 1 :],
            start=resume_from,
        ):
            data = path.read_bytes()
            crc = zlib.crc32(data) & 0xFFFFFFFF
            for attempt in range(args.retries + 1):
                try:
                    send_file(serial, relative, data, crc, args)
                    break
                except (RuntimeError, TimeoutError) as exc:
                    if attempt >= args.retries:
                        raise
                    print(
                        f"\nRetrying file {number} "
                        f"({attempt + 1}/{args.retries}) after: {exc}"
                    )
                    ready = recover_after_file_error(serial, args.timeout)
                    print(f"Reconnected: {ready}")
            sent_bytes += len(data)
            percent = sent_bytes * 100.0 / total_bytes
            print(
                f"\r[{number:3d}/{len(files)}] {percent:5.1f}%  {relative:<32}",
                end="",
                flush=True,
            )

        serial.send_line("BFMAP_DONE", args.timeout)
        done = serial.wait_for("BFMAP_DONE_OK", args.timeout)
        print(f"\nFinished: {done}")

    elapsed = max(0.001, time.monotonic() - started)
    print(
        f"Uploaded {sent_bytes:,} bytes in {elapsed:.1f}s "
        f"({sent_bytes / elapsed / 1024:.1f} KiB/s)."
    )
    print("Open Map on the watch. A reboot is not required.")
    return 0


def main() -> int:
    args = parse_args()
    try:
        return upload(args)
    except (FileNotFoundError, RuntimeError, TimeoutError, ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
