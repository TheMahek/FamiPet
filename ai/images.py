# =========================================================
# AI Breed Intelligence — image validation + MobileNetV2
# preprocessing.
# ---------------------------------------------------------
# This module is the ONLY place that decodes an uploaded
# image. It does ML plumbing and nothing else:
#
#   * reject anything that is not a real raster image
#     (magic bytes are checked by Pillow, so a renamed
#     .exe or a .php shell is rejected as an image)
#   * bound the work: byte cap, pixel cap, no
#     decompression bombs
#   * preprocess exactly as the Keras MobileNetV2 recipe
#     requires: RGB, 224x224, preprocess_input, batch dim
#   * hold no state and write nothing to disk
#
# It knows nothing about breeds, FamiPet or MongoDB. Mapping
# an ImageNet label to a FamiPet breed is the Node
# backend's job (backend/ai/breed/).
# =========================================================

import io

from PIL import Image, UnidentifiedImageError

# Input size required by MobileNetV2 (weights=imagenet,
# include_top=True -> Dense(1000) over a 224x224 input).
INPUT_SIZE = (224, 224)

# Raster formats we accept. Anything else (PDF, SVG, HEIC,
# TIFF, ...) is rejected rather than half-decoded.
ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "BMP", "GIF"})

# Hard ceiling on decoded pixels. Pillow's own default
# bomb limit (~89 MP) is generous for a pet photo; 40 MP
# is still ~6000x6600 and rejects absurd inputs before
# they reach resizing.
MAX_PIXELS = 40_000_000

# ImageNet class names are lowercase ASCII words joined by
# underscores ("golden_retriever"). decode_predictions
# already returns that, but normalising here means the
# backend's mapping table can rely on one exact shape.
import re

_SLUG_RE = re.compile(r"[^a-z0-9]+")


class InvalidImageError(ValueError):
    """The upload is not a usable raster image.

    The message is safe to return to the backend (it describes
    the file, never the process) and never echoes the uploaded
    filename or any path.
    """


def slugify_label(text):
    """ImageNet class name -> stable lowercase slug."""
    return _SLUG_RE.sub("_", str(text or "").strip().lower()).strip("_")


def decode_image(raw, max_bytes=None, max_pixels=MAX_PIXELS):
    """Validate `raw` bytes and return a fully-loaded PIL image.

    Two passes are deliberate: `verify()` walks the file
    structure and rejects a truncated/corrupt image cheaply,
    and only then is the pixel data actually decoded. That
    keeps a malformed upload from costing a full decode.

    The returned image owns no file handle — the caller works
    on an in-memory copy, so nothing survives the request.
    """
    if not raw:
        raise InvalidImageError("The uploaded file is empty.")
    if max_bytes is not None and len(raw) > max_bytes:
        raise InvalidImageError(
            "The uploaded file is larger than the %d MB limit."
            % (max_bytes // (1024 * 1024))
        )

    try:
        probe = Image.open(io.BytesIO(raw))
        image_format = probe.format
        probe.verify()
    except UnidentifiedImageError:
        raise InvalidImageError(
            "The upload is not a readable image. Use JPEG, PNG, WEBP, BMP or GIF."
        ) from None
    except Image.DecompressionBombError:
        raise InvalidImageError("The uploaded image is too large to process.") from None
    except Exception:
        # Pillow raises a wide family of errors (OSError,
        # SyntaxError, ValueError) for truncated/garbage
        # payloads. They are all "this is not a usable image"
        # as far as an API caller is concerned.
        raise InvalidImageError("The uploaded image could not be decoded.") from None

    if image_format not in ALLOWED_FORMATS:
        raise InvalidImageError(
            "Unsupported image format. Use JPEG, PNG, WEBP, BMP or GIF."
        )

    # verify() leaves the file object unusable, so decode from a
    # fresh buffer.
    source = Image.open(io.BytesIO(raw))
    try:
        if source.width * source.height > max_pixels:
            raise InvalidImageError("The uploaded image is too large to process.")
        source.load()
        # MobileNetV2 was trained on RGB. Palette/transparency modes
        # (PNG, GIF) have no RGB equivalent until they are converted,
        # so this is a real conversion, not a no-op.
        # copy()/convert() returns an image that owns its own pixel
        # buffer and holds no reference to the upload, so closing the
        # source here releases the file handle without invalidating the
        # result.
        return source.convert("RGB")
    except Image.DecompressionBombError:
        raise InvalidImageError("The uploaded image is too large to process.") from None
    finally:
        source.close()
