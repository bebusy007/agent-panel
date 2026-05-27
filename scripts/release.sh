#!/bin/bash
# Release automation script
# Usage: ./scripts/release.sh 0.0.2
# Called by .github/workflows/release.yml on tag push.

set -e

NEW_VERSION="${1#v}"  # strip leading v if present
if [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <version>  (e.g. $0 0.0.2)"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TODAY=$(date +%Y-%m-%d)

# ── 1. Find previous tag ──
PREV_TAG=$(git describe --tags --abbrev=0 --match 'v*' HEAD^ 2>/dev/null || true)
if [ -z "$PREV_TAG" ]; then
  # First release: use initial commit
  PREV_TAG=$(git rev-list --max-parents=0 HEAD)
fi

echo "=== Release $NEW_VERSION ==="
echo "Previous tag: $PREV_TAG"
echo ""

# ── 2. Collect PR numbers from merge commits between tags ──
PR_LIST=$(git log "$PREV_TAG..HEAD" --merges --pretty=format:'%s' 2>/dev/null | \
  grep -oE '#[0-9]+' | sed 's/#//' | sort -n | uniq)

if [ -z "$PR_LIST" ]; then
  echo "No merged PRs found between $PREV_TAG and HEAD."
  RELEASE_NOTES="(no changes recorded)"
else
  echo "Found PRs: $(echo $PR_LIST | tr '\n' ' ')"
  echo ""

  # ── 3. Extract changelog from each PR body ──
  RELEASE_NOTES=""
  for pr in $PR_LIST; do
    echo "  Extracting changelog from PR #$pr..."

    # Get PR body, extract lines between "## Changelog" and the next "## " heading
    CHANGELOG=$(gh pr view "$pr" --json body --jq '.body' 2>/dev/null | \
      awk '/^## Changelog/{flag=1; next} /^## /{flag=0} flag' | \
      sed 's/^[[:space:]]*//' | grep -v '^<!--' | grep -v '^$' || true)

    if [ -n "$CHANGELOG" ]; then
      RELEASE_NOTES+="$CHANGELOG"$'\n'
    else
      # Fallback: use PR title
      TITLE=$(gh pr view "$pr" --json title --jq '.title' 2>/dev/null)
      RELEASE_NOTES+="- Changed: $TITLE"$'\n'
    fi
  done
fi

echo ""
echo "=== Generated Release Notes ==="
echo "$RELEASE_NOTES"
echo "================================"
echo ""

# ── 4. Update CHANGELOG.md ──
CHANGELOG_FILE="$REPO_ROOT/CHANGELOG.md"
CHANGELOG_ENTRY=$(cat <<EOF
## [$NEW_VERSION] - $TODAY

$RELEASE_NOTES
EOF
)

# Insert new entry after the first line (title line)
{
  head -1 "$CHANGELOG_FILE"
  echo ""
  echo "$CHANGELOG_ENTRY"
  tail -n +2 "$CHANGELOG_FILE" | sed '1{/^$/d;}'
} > "$CHANGELOG_FILE.tmp"
mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"

# ── 5. Commit and push CHANGELOG update ──
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add "$CHANGELOG_FILE"
git commit -m "docs: update CHANGELOG for v$NEW_VERSION" || true
git push origin HEAD:master || echo "Warning: could not push to master (may need PAT with write access)"

# ── 6. Output release notes for workflow ──
echo "$RELEASE_NOTES"
