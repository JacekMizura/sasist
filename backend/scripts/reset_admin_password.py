"""Reset an app_users password using the same bcrypt hashing as application auth.

Usage (from repository root):

    python -m backend.scripts.reset_admin_password --login admin --password NewPassword123

    python -m backend.scripts.reset_admin_password --email admin@example.com --password NewPassword123

Requires DATABASE_URL (PostgreSQL on Railway or local).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.auth.passwords import hash_password, verify_password  # noqa: E402
from backend.database import SessionLocal, engine  # noqa: E402
from backend.models.app_user import AppUser  # noqa: E402


def _find_user(db: Session, *, login: str | None, email: str | None) -> AppUser | None:
    if email:
        return db.query(AppUser).filter(AppUser.email == email.strip()).first()
    if login:
        return db.query(AppUser).filter(AppUser.login == login.strip()).first()
    return None


def reset_password(*, login: str | None, email: str | None, password: str) -> int:
    lookup = f"email={email!r}" if email else f"login={login!r}"
    print(f"Looking up user by {lookup} ...")

    with SessionLocal() as db:
        user = _find_user(db, login=login, email=email)
        if user is None:
            print("FAILURE: user not found")
            return 1

        print(f"User found: id={user.id}, login={user.login!r}, email={user.email!r}")

        user.password_hash = hash_password(password)
        db.commit()

        db.refresh(user)
        if not verify_password(password, user.password_hash):
            print("FAILURE: password hash verification failed after commit")
            return 1

    print("SUCCESS: password updated (password_hash only)")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reset app_users.password_hash (bcrypt, same as auth API)."
    )
    parser.add_argument(
        "--login",
        default="admin",
        help="User login to reset (default: admin; ignored when --email is set)",
    )
    parser.add_argument(
        "--email",
        help="User email to reset (takes precedence over --login)",
    )
    parser.add_argument(
        "--password",
        required=True,
        help="New plain-text password",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    url = str(engine.url)
    if not url.startswith("postgresql"):
        print("FAILURE: DATABASE_URL must be PostgreSQL (postgresql://...)", file=sys.stderr)
        print(f"  Current: {url}", file=sys.stderr)
        raise SystemExit(1)

    host = url.split("@")[-1] if "@" in url else url
    print(f"Database: {host}")

    if args.email:
        login = None
        email = args.email
    else:
        login = args.login
        email = None

    raise SystemExit(reset_password(login=login, email=email, password=args.password))


if __name__ == "__main__":
    main()
