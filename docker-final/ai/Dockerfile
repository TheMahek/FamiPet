# =========================================================
# FAMIPET - AI BREED IDENTIFICATION DOCKERFILE
# (docker-final: production Dockerization - ai service)
#
# FastAPI + MobileNetV2/ImageNet inference service (see ai/).
# Build context = ../ai; only the three serving modules and the
# dependency manifest are copied - ai/tests/ stays out of the image.
#
# Single stage on purpose: TensorFlow ships as a prebuilt wheel, so
# there is nothing to compile and no separate build image to keep in
# step with the runtime one.
# =========================================================

FROM python:3.12-slim

WORKDIR /app

# 1) Dependency layer first so it stays cached until the manifest changes.
#    Test-only packages (pytest, httpx) ride along rather than splitting
#    the manifest in two: two extra packages is cheaper than two files to
#    keep in step, and nothing imports them at runtime.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 2) Serving code only - no tests, no bytecode, no local files.
COPY main.py model.py images.py ./

# 3) Non-root user. The only write at runtime is the ImageNet weight
#    download into ~/.keras; the app directory itself stays read-only
#    as far as this user is concerned.
RUN useradd --create-home appuser
USER appuser

# Inference port on the private Compose network (never published).
EXPOSE 8000

# /health answers 503 until the model is loaded, and urlopen raises on
# 503, so the check fails exactly while the service cannot predict.
# start_period covers the TensorFlow import + first-start weight
# download, which can take a minute or two on a cold cache.
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

# 4) Existing service entry point: the FastAPI app in ai/main.py.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
