"""HTTP API contract: health + /predict.

No TensorFlow here; the model layer is stubbed. Covers schema, validation,
limits, inference timeout mapping and the "model unavailable" branch.
"""

import io

import pytest
from PIL import Image


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model"] == "MobileNetV2"
    assert body["weights"] == "imagenet"
    assert body["inputSize"] == [224, 224]
    assert body["numClasses"] == 1000
    assert body["error"] is None


def test_health_degraded_when_model_not_ready(client, monkeypatch):
    import model

    monkeypatch.setattr(model, "is_ready", lambda: False)
    monkeypatch.setattr(model, "load_error", lambda: "ImportError: TensorFlow not found")

    r = client.get("/health")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "degraded"
    assert body["error"] == "ImportError: TensorFlow not found"


def test_predict_returns_topk_candidates_and_schema(client, jpeg_bytes):
    r = client.post("/predict", files={"image": ("cat.jpg", jpeg_bytes, "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "MobileNetV2"
    assert body["weights"] == "imagenet"
    assert body["topK"] == 5
    assert isinstance(body["predictions"], list)
    assert len(body["predictions"]) >= 2

    for p in body["predictions"]:
        assert "label" in p
        assert "displayName" in p
        assert "confidence" in p
        assert isinstance(p["label"], str) and p["label"]
        assert isinstance(p["displayName"], str) and p["displayName"]
        assert isinstance(p["confidence"], (int, float))
        assert 0.0 <= p["confidence"] <= 1.0


def test_predict_hands_the_model_an_rgb_image_and_top_k(client, png_bytes):
    # The 224x224 resize + preprocess_input live inside model.predict_top_k
    # (covered, with the real model, by test_model_real.py). What the HTTP
    # layer owes the model is a decoded RGB image and the configured top-k.
    r = client.post("/predict", files={"image": ("dog.png", png_bytes, "image/png")})
    assert r.status_code == 200
    assert client.fake["calls"]
    call = client.fake["calls"][0]
    assert call["mode"] == "RGB"
    assert call["top_k"] == 5


def test_predict_rejects_non_image(client):
    r = client.post("/predict", files={"image": ("bad.txt", b"hello", "text/plain")})
    assert r.status_code == 400
    assert "image" in r.json()["detail"].lower()


def test_predict_rejects_oversized_upload(client):
    big = b"0" * (8 * 1024 * 1024 + 1)
    r = client.post("/predict", files={"image": ("huge.jpg", big, "image/jpeg")})
    assert r.status_code == 413


def test_predict_rejects_truncated_image(client, jpeg_bytes):
    r = client.post("/predict", files={"image": ("cut.jpg", jpeg_bytes[:10], "image/jpeg")})
    assert r.status_code == 400


def test_predict_returns_503_when_model_not_ready(client, monkeypatch, jpeg_bytes):
    import model

    monkeypatch.setattr(model, "is_ready", lambda: False)
    r = client.post("/predict", files={"image": ("x.jpg", jpeg_bytes, "image/jpeg")})
    assert r.status_code == 503
    assert "model" in r.json()["detail"].lower()


def test_predict_times_out(client, monkeypatch, jpeg_bytes):
    import threading

    import main
    import model

    # predict_top_k is a SYNC CPU call that main.py wraps in
    # asyncio.to_thread, so the stub parks a worker thread exactly the way
    # real inference does. It waits on an Event so the test releases it at
    # once instead of leaving a thread sleeping.
    release = threading.Event()

    def slow(image, top_k=5):
        release.wait(10)
        return []

    monkeypatch.setattr(model, "predict_top_k", slow)
    monkeypatch.setattr(main, "INFERENCE_TIMEOUT_S", 0.25)

    try:
        r = client.post("/predict", files={"image": ("x.jpg", jpeg_bytes, "image/jpeg")})
    finally:
        release.set()

    assert r.status_code == 504
    assert "timed out" in r.json()["detail"].lower()


def test_predict_allows_png_and_webp(client, png_bytes, jpeg_bytes):
    r = client.post("/predict", files={"image": ("a.png", png_bytes, "image/png")})
    assert r.status_code == 200

    buf = io.BytesIO()
    Image.new("RGB", (160, 120)).save(buf, format="WEBP")
    r = client.post("/predict", files={"image": ("a.webp", buf.getvalue(), "image/webp")})
    assert r.status_code == 200
