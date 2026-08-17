"""The ONE place that knows which database engine is in use.

Everything else in the application (routes, services, data_access) talks to the
database through the engine-agnostic primitives exposed here:

    fetch_all(sql, params)   -> list[dict]
    fetch_one(sql, params)   -> dict | None
    execute(sql, params)     -> int   (last inserted row id)
    execute_many(sql, rows)  -> None
    run_script(sql_text)     -> None
    healthcheck()            -> bool

To migrate the prototype to MS SQL Server, Oracle or PostgreSQL later, change
ONLY this file: swap the connection factory and, if needed, translate the
``?`` (qmark) placeholders used by data_access.py to the target paramstyle.
No other module imports a database driver.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Iterable, Sequence

from config import settings


class UnsupportedEngineError(RuntimeError):
    """Raised when DB_ENGINE names an engine this build does not implement."""


# ---------------------------------------------------------------------------
# Connection factory -- the only engine-specific code.
# ---------------------------------------------------------------------------
def _connect() -> sqlite3.Connection:
    engine = settings.db_engine.lower()
    if engine == "sqlite":
        conn = sqlite3.connect(settings.sqlite_file)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn
    # Future engines plug in here, e.g.:
    #   if engine == "mssql":   return pyodbc.connect(...)
    #   if engine == "oracle":  return oracledb.connect(...)
    raise UnsupportedEngineError(
        f"DB_ENGINE='{settings.db_engine}' is not supported by this build. "
        "Implement its connection in database.py."
    )


@contextmanager
def _cursor(commit: bool = False):
    conn = _connect()
    try:
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Engine-agnostic primitives (used by data_access.py only).
# ---------------------------------------------------------------------------
def fetch_all(sql: str, params: Sequence[Any] = ()) -> list[dict]:
    with _cursor() as cur:
        cur.execute(sql, tuple(params))
        return [dict(row) for row in cur.fetchall()]


def fetch_one(sql: str, params: Sequence[Any] = ()) -> dict | None:
    with _cursor() as cur:
        cur.execute(sql, tuple(params))
        row = cur.fetchone()
        return dict(row) if row is not None else None


def execute(sql: str, params: Sequence[Any] = ()) -> int:
    with _cursor(commit=True) as cur:
        cur.execute(sql, tuple(params))
        return int(cur.lastrowid or 0)


def execute_many(sql: str, rows: Iterable[Sequence[Any]]) -> None:
    with _cursor(commit=True) as cur:
        cur.executemany(sql, [tuple(r) for r in rows])


def run_script(sql_text: str) -> None:
    with _cursor(commit=True) as cur:
        cur.executescript(sql_text)


def healthcheck() -> bool:
    try:
        row = fetch_one("SELECT 1 AS ok;")
        return bool(row and row.get("ok") == 1)
    except Exception:
        return False
