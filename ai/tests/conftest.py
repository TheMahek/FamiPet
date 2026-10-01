"""Shared fixtures: real image bytes built with Pillow, and a fake model.

No test here needs TensorFlow. The HTTP contract (schema, validation, limits,
health) is exercised with `model.predict_top_k` stubbed, which is what actually
needs testing. The ML itself is covered by tests/test_model_real.py, which skips
when TensorFlow is unavailable.
"""

import io
import os
import sys

import pytest
from PIL import Image

# The service modules import each other flat (`import model`), so `ai/` itself
# must be importable; pytest only inserts this test file's own directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def make_image_bytes(fmt="JPEG", size=(320, 240), color=(120, 90, 60), mode="RGB"):
    """A real, decodable raster image as bytes."""
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def jpeg_bytes():
    return make_image_bytes("JPEG")


@pytest.fixture
def png_bytes():
    # RGBA exercises the RGB conversion: MobileNetV2 takes 3 channels.
    return make_image_bytes("PNG", mode="RGBA")


@pytest.fixture
def client(monkeypatch):
    """TestClient over the real app with the model layer stubbed out."""
    from fastapi.testclient import TestClient

    import main
    import model

    state = {"ready": True, "error": None, "calls": [], "result": None}

    monkeypatch.setattr(model, "is_ready", lambda: state["ready"])
    monkeypatch.setattr(model, "load_error", lambda: state["error"])

    def fake_predict(image, top_k=5):
        state["calls"].append({"size": image.size, "mode": image.mode, "top_k": top_k})
        if state["result"] is not None:
            return state["result"]
        return [
            {
                "label": "golden_retriever",
                "displayName": "golden retriever",
                "confidence": 0.91234,
            },
            {
                "label": "labrador_retriever",
                "displayName": "labrador retriever",
                "confidence": 0.041,
            },
        ]

    monkeypatch.setattr(model, "predict_top_k", fake_predict)

    with TestClient(main.app) as c:
        c.fake = state
        yield c
