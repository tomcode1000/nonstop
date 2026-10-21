"""Compatibility shim: the Qloo client now lives in backend/nonstop/qloo.py."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from nonstop import qloo as _qloo  # noqa: E402
from nonstop.qloo import US, entities, get, km  # noqa: E402,F401


def __getattr__(name):          # keeps `qloo_client.calls` live for the old scripts
    return getattr(_qloo, name)
