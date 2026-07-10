#!/bin/bash
# Upload a prospect review PDF to R2 via the bloomwired-review Worker.
#
#   export BLOOMWIRED_UPLOAD_SECRET=...
#   ./upload-pdf.sh renee-zaia /path/to/renee-zaia-review.pdf
#
# Prints the public URL on success.
set -euo pipefail

SLUG="${1:-}"
PDF_PATH="${2:-}"
BASE_URL="${BLOOMWIRED_REVIEW_BASE:-https://gobloomwired.com}"

if [ -z "$SLUG" ] || [ -z "$PDF_PATH" ]; then
  echo "Usage: ./upload-pdf.sh <slug> <pdf-path>" >&2
  exit 1
fi

if [ -z "${BLOOMWIRED_UPLOAD_SECRET:-}" ]; then
  echo "BLOOMWIRED_UPLOAD_SECRET is not set." >&2
  exit 1
fi

if [ ! -f "$PDF_PATH" ]; then
  echo "No such file: $PDF_PATH" >&2
  exit 1
fi

# Mirrors SLUG_RE in the Worker — fail here rather than eat a 400.
if ! printf '%s' "$SLUG" | grep -Eq '^[a-z0-9][a-z0-9-]{0,127}$'; then
  echo "Invalid slug '$SLUG' (lowercase letters, digits, hyphens only)." >&2
  exit 1
fi

# -f makes curl exit non-zero on 4xx/5xx so `set -e` catches upload failures.
curl -fsS -X PUT "${BASE_URL}/review/${SLUG}" \
  -H "Authorization: Bearer ${BLOOMWIRED_UPLOAD_SECRET}" \
  -H "Content-Type: application/pdf" \
  --data-binary "@${PDF_PATH}"

echo
