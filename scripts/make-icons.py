"""Generate the launcher icons for both apps.

    python scripts/make-icons.py

ParkPay (driver)        -> apps/mobile/assets/            brand green, white P
ParkPay Enforce (staff) -> apps/mobile/assets/enforce/    dark navy, white P, amber shield badge
ParkPay Admin (admins)  -> apps/mobile/assets/admin/      violet, white P, mint area-outline badge

Outputs per app: icon.png (1024, full bleed, for iOS / store), android-icon-foreground.png,
android-icon-background.png, android-icon-monochrome.png (adaptive icon layers, 1024),
splash-icon.png (1024, transparent) and favicon.png (48).
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'apps', 'mobile', 'assets')
FONT = r'C:\Windows\Fonts\segoeuib.ttf'
if not os.path.exists(FONT):
    FONT = r'C:\Windows\Fonts\arialbd.ttf'
S = 1024
SS = 4  # supersampling for smooth edges

APPS = {
    'driver': {'dir': ROOT, 'bg': (11, 143, 90), 'bg2': (8, 112, 70), 'badge': None},
    'enforce': {'dir': os.path.join(ROOT, 'enforce'), 'bg': (30, 58, 138), 'bg2': (19, 37, 92), 'badge': (245, 166, 35)},
    'admin': {'dir': os.path.join(ROOT, 'admin'), 'bg': (91, 33, 182), 'bg2': (59, 17, 125), 'badge': (52, 211, 153), 'kind': 'outline'},
}


def outline_badge(d, cx, cy, w, fill, outline=None, ow=0):
    """Round badge with a drawn area outline (corners as dots): the admin app draws parking areas."""
    r = w / 2
    if outline:
        d.ellipse([cx - r - ow, cy - r - ow, cx + r + ow, cy + r + ow], fill=outline)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    pts = [(cx - r * 0.50, cy - r * 0.30), (cx + r * 0.05, cy - r * 0.52), (cx + r * 0.52, cy - r * 0.08), (cx + r * 0.30, cy + r * 0.50), (cx - r * 0.40, cy + r * 0.40)]
    lw = int(w * 0.075)
    d.line(pts + [pts[0]], fill=(255, 255, 255, 255), width=lw, joint='curve')
    dot = w * 0.085
    for x, y in pts:
        d.ellipse([x - dot, y - dot, x + dot, y + dot], fill=(255, 255, 255, 255))


def gradient(size, top, bottom):
    im = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(im)
    for y in range(size):
        k = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3)) + (255,))
    return im


def shield(d, cx, cy, w, fill, outline=None, ow=0):
    """Rounded-top police-style shield centred on (cx, cy), width w."""
    h = w * 1.15
    x0, y0 = cx - w / 2, cy - h / 2
    pts = [(x0, y0 + h * 0.12), (cx, y0), (x0 + w, y0 + h * 0.12), (x0 + w, y0 + h * 0.42),
           (cx, y0 + h), (x0, y0 + h * 0.42)]
    # smooth the lower curve with intermediate points
    curve = []
    import math
    for i in range(0, 25):
        a = (i / 24) * math.pi / 2
        curve.append((cx + (w / 2) * math.cos(a), y0 + h * 0.42 + (h * 0.58) * math.sin(a)))
    curve2 = [(cx - (x - cx), y) for (x, y) in reversed(curve)]
    poly = [pts[0], pts[1], pts[2], pts[3]] + curve[1:] + curve2[1:] + [pts[5]]
    if outline:
        grow = ow
        big = [(cx + (x - cx) * (1 + grow / w * 2), cy + (y - cy) * (1 + grow / h * 2)) for x, y in poly]
        d.polygon(big, fill=outline)
    d.polygon(poly, fill=fill)
    # tick inside the shield
    lw = int(w * 0.11)
    a = (cx - w * 0.22, cy + h * 0.02)
    b = (cx - w * 0.04, cy + h * 0.18)
    c = (cx + w * 0.25, cy - h * 0.14)
    d.line([a, b, c], fill=(255, 255, 255, 255), width=lw, joint='curve')
    for p in (a, b, c):
        d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=(255, 255, 255, 255))


def glyph_layer(scale, color, cfg, with_badge=True, centre=(0.5, 0.5)):
    """Transparent layer with the P (and optional badge). scale = P cap height as a share of the canvas."""
    n = S * SS
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT, int(n * scale * 1.38))
    l, t, r, b = d.textbbox((0, 0), 'P', font=font)
    w, h = r - l, b - t
    cx, cy = n * centre[0], n * centre[1]
    if cfg['badge'] and with_badge:
        cx -= n * scale * 0.16
    d.text((cx - w / 2 - l, cy - h / 2 - t), 'P', font=font, fill=color)
    if cfg['badge'] and with_badge:
        bw = n * scale * 0.62
        bx = cx + w / 2 + bw * 0.22
        by = cy + h / 2 - bw * 0.55
        draw = outline_badge if cfg.get('kind') == 'outline' else shield
        draw(d, bx, by, bw, cfg['badge'] if color[3] == 255 and color[:3] == (255, 255, 255) else color,
             outline=cfg['bg2'] + (255,) if color[:3] == (255, 255, 255) else None, ow=n * 0.012)
    return im.resize((S, S), Image.LANCZOS)


def rounded_mask(size, radius):
    m = Image.new('L', (size * SS, size * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=radius * SS, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def build(name, cfg):
    out = cfg['dir']
    os.makedirs(out, exist_ok=True)
    white = (255, 255, 255, 255)
    bg = gradient(S, cfg['bg'], cfg['bg2'])

    # iOS / store icon: full bleed, no transparency (the OS rounds the corners)
    icon = bg.copy()
    icon.alpha_composite(glyph_layer(0.46, white, cfg))
    icon.convert('RGB').save(os.path.join(out, 'icon.png'))

    # Android adaptive icon: glyph inside the 66% safe zone on a separate background layer
    bg.convert('RGB').save(os.path.join(out, 'android-icon-background.png'))
    glyph_layer(0.30, white, cfg).save(os.path.join(out, 'android-icon-foreground.png'))
    glyph_layer(0.30, white, cfg).save(os.path.join(out, 'android-icon-monochrome.png'))

    # splash: rounded tile on transparent
    tile = icon.copy()
    tile.putalpha(rounded_mask(S, int(S * 0.22)))
    splash = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    t = tile.resize((int(S * 0.6), int(S * 0.6)), Image.LANCZOS)
    splash.alpha_composite(t, ((S - t.width) // 2, (S - t.height) // 2))
    splash.save(os.path.join(out, 'splash-icon.png'))

    fav = icon.copy()
    fav.putalpha(rounded_mask(S, int(S * 0.22)))
    fav.resize((48, 48), Image.LANCZOS).save(os.path.join(out, 'favicon.png'))
    print('wrote', name, '->', os.path.relpath(out))


for k, v in APPS.items():
    build(k, v)
