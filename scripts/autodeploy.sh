#!/usr/bin/env bash
# Pull-based deploy for a server that runs OpenRadar from a git checkout.
#
# Run it from cron, for example every five minutes:
#   */5 * * * * root RADAR_DIR=/opt/radar /opt/radar/scripts/autodeploy.sh >> /var/log/radar-autodeploy.log 2>&1
#
# It deploys the newest release tag (vX.Y.Z) of the checkout's origin, or the tag written
# in $RADAR_DIR/.deploy-pin (a rollback), with deploy-server.sh from that tag. Nothing
# on GitHub needs a key to the server. A tag that failed is not retried until a newer
# tag appears or the script runs with --force.
#
# Files in $RADAR_DIR (untracked): .deployed-tag, .failed-tag, .deploy-pin.

# Everything is inside main(), so bash reads the whole script before running it:
# the deploy resets the checkout this file lives in.
main() {
  set -euo pipefail
  local dir="${RADAR_DIR:-/opt/radar}"
  local force="${1:-}"
  cd "$dir"

  exec 9>/tmp/radar-autodeploy.lock
  flock -n 9 || exit 0

  git fetch -q --tags --force origin

  local target
  if [ -s .deploy-pin ]; then
    target=$(tr -d ' \n' < .deploy-pin)
  else
    target=$(git tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)
  fi
  [ -n "$target" ] || exit 0
  if ! echo "$target" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "$(date -Is) refusing tag '$target'"
    exit 1
  fi

  local current failed
  current=$(cat .deployed-tag 2>/dev/null || true)
  failed=$(cat .failed-tag 2>/dev/null || true)
  if [ "$force" != "--force" ]; then
    [ "$target" = "$current" ] && exit 0
    [ "$target" = "$failed" ] && exit 0
  fi

  echo "$(date -Is) deploying $target (running: ${current:-none})"
  git show "$target:deploy-server.sh" > /tmp/radar-deploy.sh
  if RADAR_DIR="$dir" RADAR_REF="$target" bash /tmp/radar-deploy.sh </dev/null; then
    echo "$target" > .deployed-tag
    rm -f .failed-tag
    echo "$(date -Is) deployed $target"
  else
    echo "$target" > .failed-tag
    echo "$(date -Is) deploy of $target failed; still running ${current:-none}"
    exit 1
  fi
}

main "$@"
