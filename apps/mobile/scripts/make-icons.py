import json, math, sys
from PIL import Image, ImageDraw

out, brand_path = sys.argv[1], sys.argv[2]
brand = json.load(open(brand_path))
primary = brand["colors"]["primary"]

def atom(size, color, stroke_ratio=1.6/24):
    s = 4  # supersample
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    cx = cy = W / 2
    rx, ry = W * 10 / 24, W * 4 / 24
    width = max(1, int(W * stroke_ratio))
    for angle in (0, 60, 120):
        layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=color, width=width)
        img = Image.alpha_composite(img, layer.rotate(-angle, resample=Image.BICUBIC, center=(cx, cy)))
    d = ImageDraw.Draw(img)
    r = W * 1.8 / 24
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    return img.resize((size, size), Image.LANCZOS)

def on_bg(size, art_ratio, bg):
    img = Image.new("RGBA", (size, size), bg)
    art = atom(int(size * art_ratio), "#FFFFFF")
    off = (size - art.width) // 2
    img.alpha_composite(art, (off, off))
    return img

atom(136, "#FFFFFF").save(f"{out}/logo-mark.png")                    # 34pt @4x
on_bg(1024, 0.62, primary).save(f"{out}/icon.png")
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)); a = atom(440, "#FFFFFF"); fg.alpha_composite(a, ((1024-440)//2,)*2)
fg.save(f"{out}/adaptive-icon.png")
atom(400, "#FFFFFF").save(f"{out}/splash-icon.png")
print("ok")
