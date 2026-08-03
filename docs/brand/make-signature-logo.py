"""Build an email-signature logo from the transparent VTS wordmark.

Composites the wordmark over the brand navy gradient, crops to the artwork's
own bounds with deliberate padding, then area-averages down to the size the
signature actually renders it at. Pure stdlib — no PIL in this container.
"""
import struct, zlib, sys

SRC = 'apps/web/public/brand/vitalis-wordmark.png'

# Brand navy, top -> bottom (matches public/icon.svg)
NAVY_TOP = (0x0D, 0x2F, 0x79)
NAVY_BOT = (0x14, 0x3C, 0x98)


def decode(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    idat = b''
    i = 8
    while i < len(d):
        ln = struct.unpack('>I', d[i:i + 4])[0]
        typ = d[i + 4:i + 8]
        body = d[i + 8:i + 8 + ln]
        if typ == b'IHDR':
            w, h, bd, ct, _, _, il = struct.unpack('>IIBBBBB', body)
            assert (bd, ct, il) == (8, 6, 0), 'expected 8-bit RGBA, non-interlaced'
        elif typ == b'IDAT':
            idat += body
        elif typ == b'IEND':
            break
        i += 12 + ln

    raw = zlib.decompress(idat)
    bpp, stride = 4, w * 4
    out = bytearray(w * h * 4)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 0xFF
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif f == 3:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 0xFF
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 0xFF
        elif f != 0:
            raise ValueError('bad filter %d' % f)
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, out


def alpha_bbox(w, h, px, thresh=8):
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            if px[row + x * 4 + 3] >= thresh:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    return x0, y0, x1, y1


def encode(w, h, rgb):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgb[y * w * 3:(y + 1) * w * 3]
    def chunk(t, b):
        c = struct.pack('>I', len(b)) + t + b
        return c + struct.pack('>I', zlib.crc32(t + b) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))


def build(target_w, target_h, out_path, ss=3):
    """Render at target*ss then area-average down, so edges stay smooth."""
    w, h, px = decode(SRC)
    x0, y0, x1, y1 = alpha_bbox(w, h, px)
    cw, ch = x1 - x0 + 1, y1 - y0 + 1

    # Padding around the artwork, as a fraction of its own size.
    pad_x = cw * 0.075
    pad_y = ch * 0.34

    bx0, by0 = x0 - pad_x, y0 - pad_y
    bw, bh = cw + 2 * pad_x, ch + 2 * pad_y

    # Grow the short axis so the crop matches the output aspect exactly.
    want = target_w / target_h
    if bw / bh < want:
        need = bh * want
        bx0 -= (need - bw) / 2
        bw = need
    else:
        need = bw / want
        by0 -= (need - bh) / 2
        bh = need

    W, H = target_w * ss, target_h * ss
    acc = [[0, 0, 0] for _ in range(W * H)]
    for oy in range(H):
        t = oy / (H - 1) if H > 1 else 0
        bg = tuple(round(NAVY_TOP[k] + (NAVY_BOT[k] - NAVY_TOP[k]) * t) for k in range(3))
        sy = int(by0 + (oy + 0.5) * bh / H)
        for ox in range(W):
            sx = int(bx0 + (ox + 0.5) * bw / W)
            r, g, b = bg
            if 0 <= sx < w and 0 <= sy < h:
                o = (sy * w + sx) * 4
                a = px[o + 3]
                if a:
                    r = (px[o] * a + r * (255 - a)) // 255
                    g = (px[o + 1] * a + g * (255 - a)) // 255
                    b = (px[o + 2] * a + b * (255 - a)) // 255
            acc[oy * W + ox] = [r, g, b]

    # Box-average ss x ss back down to the target size.
    rgb = bytearray(target_w * target_h * 3)
    n = ss * ss
    for y in range(target_h):
        for x in range(target_w):
            tr = tg = tb = 0
            for dy in range(ss):
                base = (y * ss + dy) * W + x * ss
                for dx in range(ss):
                    p = acc[base + dx]
                    tr += p[0]; tg += p[1]; tb += p[2]
            i = (y * target_w + x) * 3
            rgb[i] = tr // n; rgb[i + 1] = tg // n; rgb[i + 2] = tb // n

    open(out_path, 'wb').write(encode(target_w, target_h, rgb))
    print(f'{out_path}  {target_w}x{target_h}  content={cw}x{ch} at ({x0},{y0})')


if __name__ == '__main__':
    build(220, 66, sys.argv[1] if len(sys.argv) > 1 else 'vts-signature-logo.png')
