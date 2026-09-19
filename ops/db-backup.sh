set -uo pipefail

DIR=/backups
AT="${BACKUP_AT}"
KEEP="${BACKUP_KEEP_DAYS}"

log() { echo "$(date '+%F %T') $*"; }

backup() {
  local stamp out tmp
  stamp=$(date +%Y%m%d-%H%M%S)
  out="$DIR/db-$stamp.sql.gz"
  tmp="$DIR/.db-$stamp.part"

  umask 077
  if ! pg_dump --no-owner --no-privileges | gzip -9 >"$tmp"; then
    rm -f "$tmp"
    log "ОШИБКА: pg_dump не отработал, бэкап не сохранён"
    return 1
  fi
  if ! gzip -dc "$tmp" | tail -n 10 | grep -q "PostgreSQL database dump complete"; then
    rm -f "$tmp"
    log "ОШИБКА: дамп оборван, бэкап не сохранён"
    return 1
  fi

  mv "$tmp" "$out"
  chown "$(stat -c %u:%g "$DIR")" "$out" 2>/dev/null || true
  log "готово: $(basename "$out"), $(du -h "$out" | cut -f1)"

  find "$DIR" -maxdepth 1 -name 'db-*.sql.gz' -mtime +"$KEEP" -print -delete |
    while read -r old; do log "удалён старый: $(basename "$old")"; done
}

mkdir -p "$DIR"

if [ "${1:-}" = "once" ]; then
  backup
  exit $?
fi

log "бэкапы включены: при старте и ежедневно в $AT, храним $KEEP дн."
backup || true
while true; do
  now=$(date +%s)
  next=$(date -d "today $AT" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow $AT" +%s)
  sleep $((next - now))
  backup || true
done
