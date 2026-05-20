#!/usr/bin/env sh
set -eu

ALPINE_VERSION="${ALPINE_VERSION:-3.23.0}"
ALPINE_ARCH="${ALPINE_ARCH:-x86}"
ALPINE_BASE_URL="${ALPINE_BASE_URL:-https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/${ALPINE_ARCH}}"
ALPINE_REPOSITORY_URL="${ALPINE_REPOSITORY_URL:-https://dl-cdn.alpinelinux.org/alpine/latest-stable/main/${ALPINE_ARCH}}"
ALPINE_TARBALL="alpine-minirootfs-${ALPINE_VERSION}-${ALPINE_ARCH}.tar.gz"
ALPINE_URL="${ALPINE_URL:-${ALPINE_BASE_URL}/${ALPINE_TARBALL}}"
PREINSTALL_PACKAGES="${PREINSTALL_PACKAGES:-bash curl ca-certificates}"
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

if [ -n "$PREINSTALL_PACKAGES" ] && ! command -v node >/dev/null 2>&1; then
  echo "node is required when PREINSTALL_PACKAGES is set" >&2
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

if [ -n "$PREINSTALL_PACKAGES" ]; then
  APK_INDEX_TARBALL="${WORK_DIR}/APKINDEX.tar.gz"
  APK_INDEX="${WORK_DIR}/APKINDEX"
  APK_DIR="${WORK_DIR}/apks"
  APK_LIST="${WORK_DIR}/apk-list.tsv"
  mkdir -p "$APK_DIR"

  echo "Resolving Alpine packages: ${PREINSTALL_PACKAGES}"
  curl -fL "${ALPINE_REPOSITORY_URL}/APKINDEX.tar.gz" -o "$APK_INDEX_TARBALL"
  tar -xzf "$APK_INDEX_TARBALL" -C "$WORK_DIR" APKINDEX
  # shellcheck disable=SC2086
  node "$REPO_ROOT/scripts/resolve-alpine-apks.mjs" "$APK_INDEX" $PREINSTALL_PACKAGES > "$APK_LIST"

  while IFS="$(printf '\t')" read -r package_name package_version apk_file package_size; do
    [ -n "$package_name" ] || continue
    echo "Installing ${package_name}-${package_version} (${package_size} bytes)"
    curl -fL "${ALPINE_REPOSITORY_URL}/${apk_file}" -o "${APK_DIR}/${apk_file}"
    tar -xzf "${APK_DIR}/${apk_file}" -C "$ROOTFS_DIR" \
      --exclude='.SIGN*' \
      --exclude='.PKGINFO' \
      --exclude='.post-*' \
      --exclude='.pre-*'
  done < "$APK_LIST"
fi

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
  'if [ -c /dev/ttyS0 ]; then' \
  '  exec </dev/ttyS0 >/dev/ttyS0 2>&1' \
  'fi' \
  'echo "[Vortex OS] Alpine Linux initramfs ready."' \
  'if command -v bash >/dev/null 2>&1; then echo "[Vortex OS] Shells: /bin/sh and /bin/bash."; else echo "[Vortex OS] Shell: /bin/sh (BusyBox ash)."; fi' \
  'if command -v curl >/dev/null 2>&1; then echo "[Vortex OS] curl is preinstalled."; fi' \
  'echo "[Vortex OS] Package manager: apk. Network relay: DHCP/DNS/HTTP via v86 fetch."' \
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
