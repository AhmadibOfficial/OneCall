#!/usr/bin/env python3
"""Rasterize the code-native OneCall mark for platform launchers.

Requires Pillow only when regenerating the checked-in vector artwork.
The supplied brand reference image is kept unchanged.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MOBILE = ROOT / 'apps/mobile'
ASSETS = MOBILE / 'assets'
NAVY = '#031B46'


def arc(start, sweep):
    a, b = start, start + sweep
    x1, y1 = 50 + 40 * math.cos(a), 50 + 40 * math.sin(a)
    x2, y2 = 50 + 40 * math.cos(b), 50 + 40 * math.sin(b)
    return f'M {x1:.6f} {y1:.6f} A 40 40 0 {int(sweep > math.pi)} 1 {x2:.6f} {y2:.6f}'


def svg(background):
    fill = f'<rect width="128" height="128" fill="{NAVY}"/>' if background else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<defs><linearGradient id="blue" x1="100%" y1="0%" x2="0%" y2="100%"><stop stop-color="#0799FF"/><stop offset="1" stop-color="#0050C8"/></linearGradient></defs>
{fill}<g transform="translate(14 14)">
<path d="{arc(-.8, math.pi * 1.7)}" fill="none" stroke="#FFFFFF" stroke-width="13"/>
<path d="{arc(-.65, 1.35)}" fill="none" stroke="#0878FA" stroke-width="13"/>
<path d="M47 30H66L49 85L34 80L44 47H29Z" fill="url(#blue)"/>
</g></svg>
'''


def raster_image(size, background=True):
    # The geometry is the same as brand.dart and the SVG; no reference pixels
    # are read or edited. Draw at four times output size for antialiasing.
    scale = size * 4 / 128
    image = Image.new('RGBA', (size * 4, size * 4), NAVY if background else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    box = tuple(v * scale for v in (17.5, 17.5, 110.5, 110.5))
    draw.arc(box, math.degrees(-.8), math.degrees(-.8 + math.pi * 1.7),
             fill='#FFFFFF', width=round(13 * scale))
    draw.arc(box, math.degrees(-.65), math.degrees(.7),
             fill='#0878FA', width=round(13 * scale))
    one = [(x + 14, y + 14) for x, y in ((47, 30), (66, 30), (49, 85), (34, 80), (44, 47), (29, 47))]
    mask = Image.new('L', image.size, 0)
    ImageDraw.Draw(mask).polygon([(x * scale, y * scale) for x, y in one], fill=255)
    gradient = Image.new('RGBA', image.size, (0, 0, 0, 0))
    paint = ImageDraw.Draw(gradient)
    top, bottom = round(44 * scale), round(99 * scale)
    for y in range(top, bottom + 1):
        fraction = (y - top) / max(1, bottom - top)
        color = tuple(round(a + (b - a) * fraction) for a, b in zip((7, 153, 255), (0, 80, 200)))
        paint.line((round(43 * scale), y, round(80 * scale), y), fill=(*color, 255))
    image.paste(gradient, (0, 0), mask)
    image = image.resize((size, size), Image.Resampling.LANCZOS)
    return image.convert('RGB') if background else image


def raster(source, target, size):
    target.parent.mkdir(parents=True, exist_ok=True)
    raster_image(size, source.name != 'onecall-mark-light.svg').save(target)


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    icon, light = ASSETS / 'onecall-mark.svg', ASSETS / 'onecall-mark-light.svg'
    icon.write_text(svg(True))
    light.write_text(svg(False))
    for density, size in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        raster(icon, MOBILE / f'android/app/src/main/res/mipmap-{density}/ic_launcher.png', size)
    for size in (192, 512):
        for name in (f'Icon-{size}.png', f'Icon-maskable-{size}.png'):
            raster(icon, MOBILE / f'web/icons/{name}', size)
    raster(icon, MOBILE / 'web/favicon.png', 48)
    for folder in ('ios/Runner', 'macos/Runner'):
        target = MOBILE / folder / 'Assets.xcassets/AppIcon.appiconset'
        catalogue = json.loads((target / 'Contents.json').read_text())
        for item in catalogue['images']:
            if item.get('filename'):
                size = round(float(item['size'].split('x')[0]) * float(item['scale'][:-1]))
                raster(icon, target / item['filename'], size)
    launch = MOBILE / 'ios/Runner/Assets.xcassets/LaunchImage.imageset'
    for scale in (1, 2, 3):
        suffix = '' if scale == 1 else f'@{scale}x'
        raster(light, launch / f'LaunchImage{suffix}.png', 168 * scale)
    raster_image(256).save(MOBILE / 'windows/runner/resources/app_icon.ico',
                           sizes=[(v, v) for v in (16, 32, 48, 64, 128, 256)])
    print('Generated OneCall platform icons and launch images.')


if __name__ == '__main__':
    main()
