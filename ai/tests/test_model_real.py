"""Real MobileNetV2 inference.

Every other suite stubs the model, so nothing else proves the ML path actually
works. These checks load the real ImageNet weights once and assert the shape of
the answer: correct input size, float32 batch, 1000 classes, ImageNet's own
labels, and labels the Node mapping table can key on.

Skips (rather than fails) when TensorFlow is not installed, so `pytest` still
runs on a machine that only has the HTTP surface. Install it with:
    pip install -r ai/requirements.txt
"""

import io
import json
import os
import sys

import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _imagenet_labels():
    """Every real ImageNet-1k class slug.

    Read from the copy Keras caches under ~/.keras, so the check is
    self-contained and needs no fixture file in the repo. Returns None when
    the cache is absent, in which case the assertion is skipped rather than
    faked.
    """
    from images import slugify_label

    path = os.path.join(os.path.expanduser("~"), ".keras", "models", "imagenet_class_index.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as handle:
        raw = json.load(handle)
    # Keras stores [synset, name] per index.
    return {slugify_label(entry[1]) for entry in raw.values()}


IMAGENET_LABELS = _imagenet_labels()


def _require_tensorflow():
    try:
        import tensorflow  # noqa: F401
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip("TensorFlow is not installed: %s" % exc)


@pytest.fixture(scope="module")
def loaded():
    """The real model, loaded once for the whole module."""
    _require_tensorflow()
    import model

    if not model.load_model():
        pytest.skip("MobileNetV2 could not be loaded: %s" % model.load_error())
    return model


def _jpeg(size=(300, 300), color=(140, 110, 80)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


def test_model_loads_and_is_ready(loaded):
    assert loaded.is_ready() is True
    assert loaded.load_error() is None


def test_preprocess_produces_the_shape_mobilenetv2_expects(loaded):
    """224x224x3 float32, scaled to [-1, 1], with a batch axis.

    This is the one assertion that would catch a wrong input size or a missing
    preprocess_input: Keras raises on the first forward pass, but the shape and
    range are what the backend's confidence math depends on.
    """
    from images import decode_image

    image = decode_image(_jpeg())
    batch = loaded.preprocess(image)

    assert batch.shape == (1, 224, 224, 3)
    assert batch.dtype.name == "float32"
    # preprocess_input maps [0, 255] -> [-1, 1]. A raw 0..255 batch would pass a
    # shape check and silently produce nonsense confidences.
    assert float(batch.numpy().min()) >= -1.0001
    assert float(batch.numpy().max()) <= 1.0001


def test_predict_returns_imagenet_shape_labels(loaded):
    """The contract the Node mapping table is written against."""
    from images import decode_image

    results = loaded.predict_top_k(decode_image(_jpeg()), top_k=5)

    assert len(results) == 5
    for entry in results:
        assert set(entry) == {"label", "displayName", "confidence"}
        assert 0.0 <= entry["confidence"] <= 1.0
        # A stable lowercase underscore key, and never the raw ImageNet
        # spelling with its commas or spaces.
        assert entry["label"] == entry["label"].lower()
        assert " " not in entry["label"]
        assert "," not in entry["label"]

    # Strongest first.
    scores = [entry["confidence"] for entry in results]
    assert scores == sorted(scores, reverse=True)

    # ImageNet's own class names must come back, and the ones the Node
    # mapping table is keyed on must be reachable. A blank image predicts
    # *something*; what matters is that the labels are genuine ImageNet
    # names the table was generated from, not invented ones.
    labels = {entry["label"] for entry in results}
    assert labels
    if IMAGENET_LABELS:
        assert labels <= IMAGENET_LABELS


def test_top_k_is_honoured(loaded):
    from images import decode_image

    image = decode_image(_jpeg())
    assert len(loaded.predict_top_k(image, top_k=1)) == 1
    assert len(loaded.predict_top_k(image, top_k=3)) == 3


def test_every_allowed_format_reaches_the_model(loaded):
    """JPEG, PNG, WEBP, BMP and GIF all decode and predict, not just JPEG."""
    from images import decode_image

    for fmt in ("JPEG", "PNG", "WEBP", "BMP", "GIF"):
        buf = io.BytesIO()
        Image.new("RGB", (120, 120), (90, 90, 90)).save(buf, format=fmt)
        results = loaded.predict_top_k(decode_image(buf.getvalue()), top_k=1)
        assert len(results) == 1, fmt
        assert results[0]["confidence"] > 0.0, fmt


def test_predict_works_over_http_with_the_real_model(loaded):
    """End to end through the real app: the model is not stubbed here."""
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        res = client.post(
            "/predict",
            files={"image": ("pet.jpg", _jpeg(), "image/jpeg")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["predictions"] and isinstance(body["predictions"], list)
