#!/usr/bin/env sh
set -eu

ALPINE_VERSION="${ALPINE_VERSION:-3.23.0}"
ALPINE_ARCH="${ALPINE_ARCH:-x86}"
ALPINE_BASE_URL="${ALPINE_BASE_URL:-https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/${ALPINE_ARCH}}"
ALPINE_TARBALL="alpine-minirootfs-${ALPINE_VERSION}-${ALPINE_ARCH}.tar.gz"
ALPINE_URL="${ALPINE_URL:-${ALPINE_BASE_URL}/${ALPINE_TARBALL}}"
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
OUT_DIR="${OUT_DIR:-${REPO_ROOT}/public/v86}"
OUT_FILE="${OUT_FILE:-${OUT_DIR}/alpine-initramfs.cpio.gz}"
CHECKSUM_FILE="${CHECKSUM_FILE:-${OUT_FILE}.sha256}"
WORK_DIR="${WORK_DIR:-}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if ! command -v cpio >/dev/null 2>&1; then
  echo "cpio is required" >&2
  exit 1
fi

if ! command -v gzip >/dev/null 2>&1; then
  echo "gzip is required" >&2
  exit 1
fi

if [ -z "$WORK_DIR" ]; then
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vortex-alpine.XXXXXX")"
  CLEAN_WORK_DIR=1
else
  CLEAN_WORK_DIR=0
  mkdir -p "$WORK_DIR"
fi

cleanup() {
  if [ "${CLEAN_WORK_DIR:-0}" = "1" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT INT TERM

ROOTFS_DIR="${WORK_DIR}/rootfs"
TARBALL_PATH="${WORK_DIR}/${ALPINE_TARBALL}"

mkdir -p "$OUT_DIR" "$ROOTFS_DIR"

echo "Downloading ${ALPINE_URL}"
curl -fL "$ALPINE_URL" -o "$TARBALL_PATH"

echo "Extracting ${ALPINE_TARBALL}"
tar -xzf "$TARBALL_PATH" -C "$ROOTFS_DIR"

mkdir -p "$ROOTFS_DIR/dev" "$ROOTFS_DIR/proc" "$ROOTFS_DIR/sys" "$ROOTFS_DIR/run" "$ROOTFS_DIR/tmp" "$ROOTFS_DIR/root"
chmod 1777 "$ROOTFS_DIR/tmp"

printf '%s\n' \
  '#!/bin/sh' \
  'mount -t proc proc /proc 2>/dev/null || true' \
  'mount -t sysfs sysfs /sys 2>/dev/null || true' \
  'mount -t devtmpfs devtmpfs /dev 2>/dev/null || true' \
  'mkdir -p /dev/pts /run /tmp /root' \
  'mount -t devpts devpts /dev/pts 2>/dev/null || true' \
  'chmod 1777 /tmp 2>/dev/null || true' \
  'ip link set lo up 2>/dev/null || true' \
  'ip link set eth0 up 2>/dev/null || true' \
  'ifconfig lo up 2>/dev/null || true' \
  'ifconfig eth0 up 2>/dev/null || true' \
  'export HOME=/root' \
  'export PATH=/sbin:/bin:/usr/sbin:/usr/bin' \
  'echo "[Vortex OS] Alpine Linux initramfs ready."' \
  'echo "[Vortex OS] Shell: /bin/sh (BusyBox ash). Package manager: apk."' \
  'echo "[Vortex OS] Network: run udhcpc -i eth0, then apk update."' \
  'if [ -c /dev/ttyS0 ]; then' \
  '  exec /bin/sh -i </dev/ttyS0 >/dev/ttyS0 2>&1' \
  'fi' \
  'exec /bin/sh -i' \
  > "$ROOTFS_DIR/init"
chmod +x "$ROOTFS_DIR/init"
find "$ROOTFS_DIR" -exec touch -t 202601010000 {} + 2>/dev/null || true

echo "Writing ${OUT_FILE}"
(
  cd "$ROOTFS_DIR"
  find . -print | LC_ALL=C sort | cpio -o -H newc 2>/dev/null | gzip -9n
) > "$OUT_FILE"

if command -v shasum >/dev/null 2>&1; then
  printf '%s  %s\n' "$(shasum -a 256 "$OUT_FILE" | awk '{print $1}')" "$(basename "$OUT_FILE")" > "$CHECKSUM_FILE"
elif command -v sha256sum >/dev/null 2>&1; then
  printf '%s  %s\n' "$(sha256sum "$OUT_FILE" | awk '{print $1}')" "$(basename "$OUT_FILE")" > "$CHECKSUM_FILE"
else
  echo "No SHA-256 utility found; skipping ${CHECKSUM_FILE}" >&2
fi

echo "Built ${OUT_FILE}"
if [ -f "$CHECKSUM_FILE" ]; then
  echo "Checksum: $(awk '{print $1}' "$CHECKSUM_FILE")"
fi
