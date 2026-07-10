"""Upload prospect review PDFs to R2 via the bloomwired-review Worker.

Importable from prospect-pdf's generate.py:

    from upload_pdf import slugify, upload_pdf

    slug = slugify("Renee Zaia")            # -> "renee-zaia"
    url = upload_pdf(slug, "/tmp/renee-zaia-review.pdf")
    # -> "https://gobloomwired.com/review/renee-zaia"
"""

import os
import re
import unicodedata

import requests

BASE_URL = os.environ.get("BLOOMWIRED_REVIEW_BASE", "https://gobloomwired.com")

# Mirrors SLUG_RE in the Worker.
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,127}$")


def slugify(name: str, domain: str | None = None) -> str:
    """"Renee Zaia" -> "renee-zaia".  "GMF Gym" -> "gmf-gym".

    Pass `domain` to disambiguate a collision between two prospects with the
    same name: slugify("Renee Zaia", "reneezaia.com") -> "renee-zaia-reneezaia-com"
    """
    parts = [name, domain] if domain else [name]
    raw = " ".join(p for p in parts if p)
    # Strip accents so "Sámaneh" doesn't become "s-maneh".
    raw = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-")
    if not _SLUG_RE.match(slug):
        raise ValueError(f"Cannot build a valid slug from {name!r}")
    return slug


def upload_pdf(slug: str, pdf_path: str) -> str:
    """Upload a PDF and return its public URL. Raises on failure."""
    if not _SLUG_RE.match(slug):
        raise ValueError(f"Invalid slug: {slug!r}")

    secret = os.environ.get("BLOOMWIRED_UPLOAD_SECRET")
    if not secret:
        raise RuntimeError("BLOOMWIRED_UPLOAD_SECRET is not set")

    url = f"{BASE_URL}/review/{slug}"
    with open(pdf_path, "rb") as f:
        resp = requests.put(
            url,
            data=f.read(),
            headers={
                "Authorization": f"Bearer {secret}",
                "Content-Type": "application/pdf",
            },
            timeout=60,
        )

    if not resp.ok:
        raise RuntimeError(f"Upload failed: {resp.status_code} {resp.text}")
    return url


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        sys.exit("Usage: python upload_pdf.py <slug> <pdf-path>")
    print(upload_pdf(sys.argv[1], sys.argv[2]))
