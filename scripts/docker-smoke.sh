#!/usr/bin/env bash
# The container, proven end to end: build, boot, serve, healthcheck, then the
# migration path itself -- back up, wipe every volume, restore, and get the same
# rows and the same thumbnail back. The gate tests cannot see any of this: they
# never touch a database or the container's tools.
#
# Its own compose project, ports and volumes, so it is safe beside a real stack,
# and it tears all of it down on exit.
#
#   scripts/docker-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export COMPOSE_PROJECT_NAME=ctsmoke
export PORT=3097 DB_HOST_PORT=3397 MYSQL_ROOT_PASSWORD=smoke$RANDOM
unset COMPOSE_FILE
base="http://127.0.0.1:$PORT"
web=/tmp/ctsmoke-web.tar.gz
# The stack writes into the real ./backups; remove only what this run adds.
mkdir -p backups
before=$(ls backups)

pass=0
ok()   { pass=$((pass + 1)); printf '  ok    %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; docker compose logs --tail 30 app || true; exit 1; }
cleanup() {
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  for f in $(ls backups); do
    if ! printf '%s\n' "$before" | grep -qx "$f"; then rm -f "backups/$f"; fi
  done
  rm -f /tmp/ctsmoke.jpg /tmp/ctsmoke-bad.tar.gz "$web"
}
trap cleanup EXIT
cleanup

wait_up() {
  for _ in $(seq 1 60); do
    curl -sf "$base/api/items" >/dev/null && return 0
    sleep 2
  done
  return 1
}
app() { docker compose exec -T app "$@"; }

echo "building"
docker compose build --progress quiet >/dev/null
ok "image builds (Bun $(docker compose run --rm --no-deps -T --entrypoint bun app --version 2>/dev/null))"

echo "booting"
docker compose up -d >/dev/null 2>&1
wait_up && ok "app answers a database-backed request" || fail "app never answered"
curl -sf "$base/" | grep '<script' >/dev/null && ok "index.html is served with its bundle" || fail "no index.html"
for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)")" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)")" = healthy ] \
  && ok "healthcheck reports healthy" || fail "healthcheck never passed"

echo "data"
# A thumb written straight into the volume: the real ones come from alicdn,
# which a smoke test should not depend on. A "thumbs/" image is never downloaded.
head -c 4096 /dev/urandom > /tmp/ctsmoke.jpg
docker compose cp /tmp/ctsmoke.jpg app:/app/public/thumbs/smoke.jpg >/dev/null 2>&1
json=$(bun -e 'console.log(JSON.stringify({ json: JSON.stringify({
  url: "https://item.taobao.com/item.htm?id=424242", title: "烟雾测试 Smoke Wig",
  seller: "smoke shop", price: "88.00", images: ["thumbs/smoke.jpg"] }) }))')
curl -sf -X POST "$base/api/items" -H 'Content-Type: application/json' -d "$json" >/dev/null \
  && ok "an item is created" || fail "POST /api/items"
curl -sf "$base/thumbs/smoke.jpg" | cmp -s - /tmp/ctsmoke.jpg \
  && ok "a thumbnail is served back byte for byte" || fail "thumb not served"

echo "backup"
out=$(app bun run backup 2>&1) || { echo "$out"; fail "backup failed"; }
archive=$(printf '%s\n' "$out" | grep -o 'backups/cosplay-taobao-[0-9T-]*\.tar\.gz' | head -1)
[ -f "$archive" ] && ok "backup lands on the host: $archive" || fail "no archive on the host"
tar -tzf "$archive" | grep -x 'db.sql' >/dev/null && tar -tzf "$archive" | grep 'thumbs/smoke.jpg' >/dev/null \
  && ok "archive holds db.sql and the thumb" || fail "archive is missing something"
curl -sf -D - -o "$web" "$base/api/backup" | grep -i 'content-disposition: attachment; filename="cosplay-taobao-' >/dev/null \
  && ok "web UI: Download backup serves an attachment" || fail "GET /api/backup"
tar -tzf "$web" | grep 'thumbs/smoke.jpg' >/dev/null && ok "web UI: the download holds the thumb" \
  || fail "downloaded archive is missing the thumb"

echo "wipe"
docker compose down -v >/dev/null 2>&1
docker compose up -d >/dev/null 2>&1
wait_up || fail "app did not come back"
[ "$(curl -sf "$base/api/items")" = "[]" ] && ok "fresh volumes: no items" || fail "volumes were not wiped"
# A missing file falls back to index.html with a 200, so compare bytes, not status.
! curl -s "$base/thumbs/smoke.jpg" | cmp -s - /tmp/ctsmoke.jpg \
  && ok "fresh volumes: no thumb" || fail "thumb survived the wipe"

echo "restore"
echo garbage > /tmp/ctsmoke-bad.tar.gz
docker compose cp /tmp/ctsmoke-bad.tar.gz app:/tmp/bad.tar.gz >/dev/null 2>&1
if app bun run restore /tmp/bad.tar.gz >/dev/null 2>&1; then fail "CLI restored a garbage archive"; fi
ok "CLI: a garbage archive is refused"
[ "$(curl -s -o /dev/null -w '%{http_code}' -F file=@/tmp/ctsmoke-bad.tar.gz "$base/api/backup/restore")" = 400 ] \
  && ok "web UI: a garbage archive is refused with 400" || fail "web restore took garbage"
res=$(curl -sf -F "file=@$web" "$base/api/backup/restore") || fail "web restore failed"
printf '%s' "$res" | bun -e 'const r = await Bun.stdin.json(); process.exit(r.counts.items === 1 && r.thumbs === 1 ? 0 : 1)' \
  && ok "web UI: restore reports counts and thumbs" || { echo "$res"; fail "bad restore response"; }
curl -sf "$base/api/items" | grep '烟雾测试 Smoke Wig' >/dev/null \
  && ok "the item comes back, unicode intact" || fail "item not restored"
curl -sf "$base/thumbs/smoke.jpg" | cmp -s - /tmp/ctsmoke.jpg \
  && ok "the thumb comes back byte for byte" || fail "thumb not restored"
docker compose restart app >/dev/null 2>&1
wait_up && curl -sf "$base/thumbs/smoke.jpg" | cmp -s - /tmp/ctsmoke.jpg \
  && ok "restored data survives an app restart" || fail "lost on restart"
out=$(app bun run restore "$archive" 2>&1) || { echo "$out"; fail "CLI restore failed"; }
printf '%s\n' "$out" | grep -x "$(printf 'items\t1')" >/dev/null \
  && curl -sf "$base/thumbs/smoke.jpg" | cmp -s - /tmp/ctsmoke.jpg \
  && ok "CLI: restore of the server-side archive gives the same data" || { echo "$out"; fail "CLI restore"; }

echo "$pass checks passed"
