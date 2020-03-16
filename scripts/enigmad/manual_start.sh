#!/bin/bash
set -o errexit -o nounset -o pipefail
command -v shellcheck > /dev/null && shellcheck "$0"

## This is like start.sh but using local binaries, not docker images
SCRIPT_DIR="$(realpath "$(dirname "$0")")"

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/gaia.XXXXXXXXX")
chmod 777 "$TMP_DIR"
echo "Using temporary dir $TMP_DIR"
ENIGMAD_LOGFILE="$TMP_DIR/wasmd.log"
REST_SERVER_LOGFILE="$TMP_DIR/rest-server.log"

# move the template into our temporary home
cp -r "$SCRIPT_DIR"/template/.wasm* "$TMP_DIR"

enigmad start \
  --home "$TMP_DIR/.enigmad" \
  --trace \
  --rpc.laddr tcp://0.0.0.0:26657 \
  > "$ENIGMAD_LOGFILE" &

echo "enigmad running and logging into $ENIGMAD_LOGFILE"

sleep 10
cat "$ENIGMAD_LOGFILE"

enigmawasmcli rest-server \
  --home "$TMP_DIR/.enigmawasmcli" \
  --node tcp://localhost:26657 \
  --trust-node \
  --laddr tcp://0.0.0.0:1317 \
  > "$REST_SERVER_LOGFILE" &

echo "rest server running on http://localhost:1317 and logging into $REST_SERVER_LOGFILE"

# Debug rest server start
sleep 3
cat "$REST_SERVER_LOGFILE"

tail -f "$ENIGMAD_LOGFILE"
