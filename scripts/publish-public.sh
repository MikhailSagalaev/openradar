#!/usr/bin/env bash
# Publish private main to the public openradar repo.
#
# Day to day, commit and push only to origin (github.com/MikhailSagalaev/radar-oss).
# This script fast-forwards public main (github.com/MikhailSagalaev/openradar) to the
# same commit. With --tag it also creates v<version> at HEAD and pushes that tag
# only to public. The server at /opt/radar-test deploys public tags, not private main.
#
# Refuses a non-fast-forward. Does not push tags to the private repo.

set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

die() {
  echo "publish-public: $*" >&2
  exit 1
}

branch=$(git symbolic-ref --short HEAD)
[ "$branch" = "main" ] || die "switch to main first (now on $branch)"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  die "commit or stash tracked changes first"
fi

origin_url=$(git remote get-url origin)
public_url=$(git remote get-url public 2>/dev/null || true)
case "$origin_url" in
  *MikhailSagalaev/radar-oss*) ;;
  *) die "origin must be MikhailSagalaev/radar-oss (got $origin_url). Run this from C:/projects/radar-oss." ;;
esac
case "$public_url" in
  *MikhailSagalaev/openradar*) ;;
  *) die "remote public must be MikhailSagalaev/openradar (got ${public_url:-missing})" ;;
esac

git fetch --prune origin main
git fetch --prune public main
git fetch --tags public

git merge-base --is-ancestor origin/main HEAD || die "origin/main is not contained in HEAD. Pull private main first."
git merge-base --is-ancestor public/main HEAD || die "public/main has commits that are not in this checkout. Refusing to overwrite public history."

node scripts/check-version.js
version=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")
tag="v${version}"
grep -q "^## ${version}$" CHANGELOG.md || die "CHANGELOG.md has no section '## ${version}'"

echo "push main -> origin (${origin_url})"
git push origin main
echo "push main -> public (${public_url})"
git push public main

if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  tagged=$(git rev-parse "${tag}^{commit}")
  head=$(git rev-parse HEAD)
  [ "$tagged" = "$head" ] || die "local tag ${tag} points at ${tagged}, not HEAD ${head}"
else
  if [ "${1:-}" != "--tag" ]; then
    echo "main is on both remotes. Tag ${tag} is not at HEAD."
    echo "When this commit is the release: bash scripts/publish-public.sh --tag"
    exit 0
  fi
  git tag -a "$tag" -m "$tag"
  echo "created annotated tag ${tag}"
fi

echo "push ${tag} -> public only"
git push public "refs/tags/${tag}"
echo "public ${tag} is $(git rev-parse --short HEAD). The server deploys it within 5 minutes."
