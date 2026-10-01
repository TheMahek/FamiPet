# =========================================================
# MobileNetV2 / ImageNet model holder.
# ---------------------------------------------------------
# ONE model, loaded once, reused for every request:
#
#   tf.keras.applications.MobileNetV2(weights="imagenet")
#
# That is the whole model story: ~3.4 M parameters, ~14 MB
# of ImageNet weights (downloaded on first start and cached
# under ~/.keras), a 224x224 RGB input and 1000 ImageNet
# class logits. No fine-tuning, no custom checkpoint, no
# dataset — see ai/README.md.
#
# TensorFlow is imported lazily so that a machine without it
# (or one that fails to download the weights) still gets a
# clean, structured /health answer instead of an import
# crash at boot.
# =========================================================

from images import INPUT_SIZE, slugify_label

MODEL_NAME = "MobileNetV2"
WEIGHTS = "imagenet"
NUM_CLASSES = 1000

_keras = None
_model = None
_load_error = None


def _load():
    """Import Keras and build MobileNetV2 once.

    Returns the model. Raises on any failure so the caller
    can record a degraded state instead of crashing.
    """
    global _keras, _model

    if _model is not None:
        return _model

    from tensorflow import keras  # imported inside the lock

    # applications.mobilenet_v2.preprocess_input and
    # applications.imagenet_utils.decode_predictions are the
    # two functions the official MobileNetV2 recipe uses; both
    # live under keras.applications in TF 2.16+ (Keras 3) and in
    # tf.keras in earlier releases, so this import path works
    # for either.
    model = keras.applications.MobileNetV2(weights=WEIGHTS, include_top=True)
    _keras = keras
    _model = model
    return model


def load_model():
    """Load the model, recording (not raising) the failure.

    Returns True on success. On failure the reason is kept in
    `load_error()` and /health reports `degraded` while
    /predict answers 503 — the rest of FamiPet is unaffected
    because this service is optional.
    """
    global _load_error
    try:
        _load()
        _load_error = None
        return True
    except Exception as exc:  # noqa: BLE001 - any failure is "degraded"
        _load_error = "%s: %s" % (type(exc).__name__, exc)
        return False


def load_error():
    return _load_error


def is_ready():
    return _model is not None


def preprocess(image):
    """PIL image -> (1, 224, 224, 3) float32 batch, model-ready.

    Exactly the Keras MobileNetV2 recipe: resize to the
    network's input size, convert to an array, run
    `preprocess_input` (which scales each channel from
    [0, 255] to [-1, 1]), then add the batch dimension.
    """
    array = _keras.utils.img_to_array(image.resize(INPUT_SIZE))
    array = _keras.applications.mobilenet_v2.preprocess_input(array)
    # expand_dims adds the batch axis; keep float32 so the
    # graph gets the dtype it was traced with.
    return _keras.backend.expand_dims(array, axis=0)


def predict_top_k(image, top_k=5):
    """Top-`top_k` ImageNet predictions for one PIL image.

    Returns a list of
        {"label", "displayName", "confidence"}
    ordered by descending confidence. `confidence` is a
    float in [0, 1]. These are ImageNet's own class names —
    the backend maps them to FamiPet breeds (it must not
    assume every label is a breed).

    No class index is returned: `decode_predictions` hands
    back WordNet synsets ("n02085620") and Keras 3 dropped
    `get_imagenet_classindex`, so a numeric id would mean
    shipping a 1000-row lookup table for a value nothing
    reads. `label` is the contract, and it is what the
    backend's mapping table is keyed on.
    """
    model = _load()
    batch = preprocess(image)
    raw = model.predict(batch, verbose=0)

    decoded = _keras.applications.imagenet_utils.decode_predictions(
        raw, top=max(1, int(top_k))
    )[0]

    results = []
    for entry in decoded:
        name, score = entry[1], entry[2]
        results.append(
            {
                # Stable, index-independent key the backend's
                # mapping table is written against.
                "label": slugify_label(name),
                # Human-readable, still the raw ImageNet name.
                "displayName": name.replace("_", " ").strip(),
                "confidence": round(float(score), 6),
            }
        )
    return results
