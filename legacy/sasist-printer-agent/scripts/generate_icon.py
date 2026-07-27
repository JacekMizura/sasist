"""Generate Sasist Printer Agent icon assets (orange brand)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PRIMARY = (249, 115, 22, 255)
DARK = (15, 23, 42, 255)


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = max(2, size // 8)
    # Rounded dark background for tray contrast
    radius = size // 5
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=DARK)

    cx, cy = size // 2, size // 2
    s = size // 3
    # Isometric cube (Sasist mark)
    top = [(cx, cy - s), (cx + s, cy - s // 2), (cx, cy), (cx - s, cy - s // 2)]
    left = [(cx - s, cy - s // 2), (cx, cy), (cx, cy + s), (cx - s, cy + s // 2)]
    right = [(cx, cy), (cx + s, cy - s // 2), (cx + s, cy + s // 2), (cx, cy + s)]
    draw.polygon(top, outline=PRIMARY, fill=None, width=max(1, size // 16))
    draw.polygon(left, outline=PRIMARY, fill=None, width=max(1, size // 16))
    draw.polygon(right, outline=PRIMARY, fill=(*PRIMARY[:3], 80), width=max(1, size // 16))

    # Connector dot
    dot_r = max(1, size // 16)
    draw.ellipse(
        (margin, size - margin - dot_r * 2, margin + dot_r * 2, size - margin),
        fill=PRIMARY,
    )
    return img


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    assets = root / "assets"
    assets.mkdir(parents=True, exist_ok=True)

    sizes = [16, 32, 64, 128]
    images = {size: draw_icon(size) for size in sizes}
    for size, image in images.items():
        image.save(assets / f"icon-{size}.png")

    ico_path = assets / "icon.ico"
    base = images[128].copy()
    base.save(ico_path, format="ICO", sizes=[(size, size) for size in sizes])

    logo = Image.new("RGBA", (220, 40), (255, 255, 255, 0))
    mark = images[32].resize((32, 32), Image.Resampling.LANCZOS)
    logo.paste(mark, (0, 4), mark)
    draw = ImageDraw.Draw(logo)
    try:
        font = ImageFont.truetype("segoeui.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    draw.text((40, 8), "Sasist", fill=DARK, font=font)
    logo.save(assets / "sasist-logo.png")
    print(f"Wrote {ico_path} ({ico_path.stat().st_size} bytes) and PNG sizes to {assets}")


if __name__ == "__main__":
    main()
