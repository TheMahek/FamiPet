"""Image validation + MobileNetV2 preprocessing.

Pure Pillow/Python: no TensorFlow import, no model download.
"""

import io

import pytest
from PIL import Image

from images import INPUT_SIZE, InvalidImageError, decode_image, slugify_label
from conftest import make_image_bytes


def test_jpeg_decodes_to_rgb():
    img = decode_image(make_image_bytes("JPEG"), max_bytes=1024 * 1024)
    assert img.mode == "RGB"
    assert img.size == (320, 240)


def test_png_with_alpha_is_converted_to_rgb():
    # MobileNetV2 takes 3 channels; an RGBA upload must be
    # converted, not passed through.
    img = decode_image(make_image_bytes("PNG", mode="RGBA"), max_bytes=1024 * 1024)
    assert img.mode == "RGB"


def test_palette_png_is_converted_to_rgb():
    buf = io.BytesIO()
    Image.new("P", (64, 64)).save(buf, format="PNG")
    img = decode_image(buf.getvalue(), max_bytes=1024 * 1024)
    assert img.mode == "RGB"


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP", "BMP", "GIF"])
def test_every_allowed_format_is_accepted(fmt):
    assert decode_image(make_image_bytes(fmt), max_bytes=1024 * 1024).mode == "RGB"


def test_empty_upload_is_rejected():
    with pytest.raises(InvalidImageError, match="empty"):
        decode_image(b"", max_bytes=1024 * 1024)


def test_non_image_bytes_are_rejected():
    # A renamed executable / script is not an image. Pillow's own
    # identification is the gate, so there is no MIME trust here.
    with pytest.raises(InvalidImageError):
        decode_image(b"<?php system($_GET['c']); ?>", max_bytes=1024 * 1024)


def test_truncated_image_is_rejected():
    good = make_image_bytes("JPEG")
    with pytest.raises(InvalidImageError):
        decode_image(good[: len(good) // 3], max_bytes=1024 * 1024)


def test_oversized_upload_is_rejected_before_decoding():
    good = make_image_bytes("JPEG")
    with pytest.raises(InvalidImageError, match="larger than"):
        decode_image(good, max_bytes=16)


def test_decompression_bomb_is_rejected_by_pixel_cap():
    # A tiny compressed image that declares enormous dimensions. The
    # pixel cap must stop it before the pixels are materialised.
    buf = io.BytesIO()
    img = Image.new("RGB", (4, 4))
    img.putpixel((0, 0), (1, 2, 3))
    img.save(buf, format="PNG")
    with pytest.raises(InvalidImageError, match="too large"):
        decode_image(buf.getvalue(), max_pixels=4)


def test_input_size_is_the_mobilenetv2_shape():
    assert INPUT_SIZE == (224, 224)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("golden_retriever", "golden_retriever"),
        ("Shih-Tzu", "shih_tzu"),
        ("  red-breasted  mergeanser ", "red_breasted_mergeanser"),
        ("Egyptian_cat", "egyptian_cat"),
    ],
)
def test_label_slugging_is_stable(raw, expected):
    # The backend's mapping table is keyed on this exact shape, so the
    # normalisation must be deterministic and punctuation-insensitive.
    assert slugify_label(raw) == expected
