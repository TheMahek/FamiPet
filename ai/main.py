# =========================================================
# AI Breed Intelligence — FastAPI app.
# ---------------------------------------------------------
# Deliberately the smallest useful surface:
#
#   GET  /health   is the model loaded?
#   POST /predict  multipart image -> top-k ImageNet candidates
#
# Boundaries this service holds to:
#
#   * ML ONLY. It has no database driver, no ORM and no
#     knowledge of FamiPet breeds. An ImageNet label is a
#     CANDIDATE; deciding whether it is a FamiPet breed, and
#     whether to persist one, happens in the Node backend.
#   * Nothing is stored. The upload is read into memory,
#     decoded, discarded. There is no uploads directory.
#   * Not public. It binds to one port on the private
#     Compose network and only the backend talks to it
#     (ai/ has no published port in docker-compose.yml).
#   * Optional. A missing TensorFlow install or a failed
#     weight download leaves /health reporting `degraded`
#     and /predict answering 503; the backend maps that to
#     "ML service unavailable" and FamiPet keeps working.
# =========================================================

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import model
from images import INPUT_SIZE, InvalidImageError, decode_image

# Upload ceiling. 8 MB is comfortably above a phone photo and
# well below anything a 224x224 model needs; the Node side
# enforces the same number so the backend rejects an oversized
# upload without spending a round trip.
MAX_UPLOAD_BYTES = int(os.environ.get("AI_MAX_UPLOAD_BYTES", 8 * 1024 * 1024))

# Candidates returned per image. More than 5 is noise for a
# softmax over 1000 classes; fewer hides a useful runner-up.
TOP_K = int(os.environ.get("AI_TOP_K", 5))

# Inference is a CPU-bound sync call; bound it so one slow
# request cannot hold a worker forever.
INFERENCE_TIMEOUT_S = float(os.environ.get("AI_INFERENCE_TIMEOUT_S", 20))

@asynccontextmanager
async def lifespan(_app):
    # Failure is recorded, not raised: the process stays up so
    # /health can explain the problem and Docker's healthcheck has
    # something to talk to.
    model.load_model()
    yield


app = FastAPI(
    title="FamiPet AI Breed Intelligence",
    version="1.0.0",
    description="MobileNetV2/ImageNet inference service. Returns candidates, not breed truth.",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health")
def health():
    ready = model.is_ready()
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ok" if ready else "degraded",
            "model": model.MODEL_NAME,
            "weights": model.WEIGHTS,
            "inputSize": list(INPUT_SIZE),
            "numClasses": model.NUM_CLASSES,
            "error": None if ready else model.load_error(),
        },
    )


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    if not model.is_ready():
        # 503, not 500: the request was fine, this service is not.
        raise HTTPException(status_code=503, detail="Model is not available.")

    # --- size gate, before anything decodes the bytes ----------
    # Read one byte past the cap so an oversized body is detected
    # here instead of being fully buffered.
    raw = await image.read(MAX_UPLOAD_BYTES + 1)
    await image.close()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image is larger than the %d MB limit."
            % (MAX_UPLOAD_BYTES // (1024 * 1024)),
        )

    # --- decode + validate (raises InvalidImageError -> 400) --
    try:
        decoded = decode_image(raw, max_bytes=MAX_UPLOAD_BYTES)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    finally:
        # Drop the upload bytes as soon as the image object owns
        # its own buffer. Nothing persists past the request.
        del raw

    # --- inference, bounded ------------------------------------
    # Sync CPU work goes to a worker thread; wait_for bounds it
    # so a pathological upload cannot pin the event loop.
    try:
        predictions = await asyncio.wait_for(
            asyncio.to_thread(model.predict_top_k, decoded, TOP_K),
            timeout=INFERENCE_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Inference timed out.") from None

    return {
        "predictions": predictions,
        "model": model.MODEL_NAME,
        "weights": model.WEIGHTS,
        "topK": TOP_K,
    }
