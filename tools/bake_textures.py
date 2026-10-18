"""Bakes the tileable ground and rock textures in public/textures/.

Everything is generated from seeded noise, so the textures are our own work
and can be rebuilt at any time:

    python3 tools/bake_textures.py

Needs numpy and Pillow. Each ground theme gets a colour map, a normal map and
a roughness map (plus a glow map where cracks glow); the rocks share one
grey detail texture and normal map that the game tints per theme.
"""

import os

import numpy as np
from PIL import Image

N = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures')

# Pixel coordinates in 0..1, used by the stamps below.
_Y, _X = np.mgrid[0:N, 0:N] / N


def spectral(rng, beta, lo=1.0, hi=None, aniso=(1.0, 1.0)):
    """Tileable fractal noise: white noise shaped to a 1/f^beta spectrum.

    Built in the frequency domain, so it wraps seamlessly at the edges.
    `lo`/`hi` keep only that band of frequencies (cycles per tile), and
    `aniso` stretches it, for wind-blown ridges.
    """
    f = np.fft.fftfreq(N) * N
    fy, fx = np.meshgrid(f, f, indexing='ij')
    r = np.sqrt((fx * aniso[0]) ** 2 + (fy * aniso[1]) ** 2)
    amp = np.zeros_like(r)
    keep = (r >= lo) & ((r <= hi) if hi else True)
    amp[keep] = r[keep] ** -beta
    spec = np.fft.fft2(rng.normal(size=(N, N))) * amp
    out = np.real(np.fft.ifft2(spec))
    return (out - out.mean()) / (out.std() + 1e-9)


def wrapped(cx, cy):
    """Per-pixel offset to (cx, cy) the short way round the tile."""
    dx = (_X - cx + 0.5) % 1.0 - 0.5
    dy = (_Y - cy + 0.5) % 1.0 - 0.5
    return dx, dy


def craters(rng, count, rmin, rmax, depth=1.0):
    """Bowls with raised rims, and a mask of fresh ejecta around the young ones."""
    h = np.zeros((N, N))
    ejecta = np.zeros((N, N))
    # Big ones are rarer than small ones.
    radii = rmin * (rmax / rmin) ** (rng.random(count) ** 2.2)
    for r in radii:
        cx, cy = rng.random(2)
        dx, dy = wrapped(cx, cy)
        d = np.sqrt(dx * dx + dy * dy) / r
        near = d < 3
        bowl = np.where(d < 1, -(1 - d * d) * 0.7, 0)
        rim = 0.35 * np.exp(-((d - 1) / 0.28) ** 2)
        age = rng.random()
        h[near] += ((bowl + rim)[near]) * depth * r * 40 * (0.4 + 0.6 * age)
        if age > 0.7:
            # A bright apron of thrown-out dust, streaked into rays.
            ang = np.arctan2(dy, dx)
            rays = 0.5 + 0.5 * np.sin(ang * rng.integers(7, 15) + rng.random() * 6)
            ejecta[near] += (np.exp(-np.maximum(d - 1, 0) * 1.6) * (0.4 + 0.6 * rays) * (d > 0.85))[near]
    return h, np.clip(ejecta, 0, 1)


def cells(rng, n):
    """Tileable Voronoi on a jittered n x n grid: distance to the nearest and
    second-nearest seed (in cell units), and a random value per nearest cell."""
    pts = rng.random((n, n, 2))
    vals = rng.random((n, n))
    gx = _X * n
    gy = _Y * n
    ix = np.floor(gx).astype(int)
    iy = np.floor(gy).astype(int)
    f1 = np.full((N, N), 9.0)
    f2 = np.full((N, N), 9.0)
    v1 = np.zeros((N, N))
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            cx = ix + ox
            cy = iy + oy
            p = pts[cy % n, cx % n]
            d = np.hypot(cx + p[..., 0] - gx, cy + p[..., 1] - gy)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            v1 = np.where(closer, vals[cy % n, cx % n], v1)
            f1 = np.where(closer, d, f1)
    return f1, f2, v1


def blur(a, radius):
    """Gaussian blur that wraps round the tile edges (via the FFT)."""
    f = np.fft.fftfreq(N)
    fy, fx = np.meshgrid(f, f, indexing='ij')
    k = np.exp(-2 * (np.pi * radius) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * k))


def pebbles(rng, count, size):
    """Small rounded stones scattered over the ground: height bumps."""
    h = np.zeros((N, N))
    idx = rng.integers(0, N, (count, 2))
    h[idx[:, 0], idx[:, 1]] = rng.random(count) * 0.8 + 0.2
    return blur(h, size) * size * size * 6


def normal_map(height, strength):
    """Tangent-space normal map from a height field (wrapping at the edges)."""
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * strength
    # Image rows run down while texture v runs up, so y flips.
    n = np.dstack([-dx, dy, np.ones_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def cavity(height, radius):
    """How far each pixel sits below its surroundings: dark in hollows and cracks."""
    return np.clip((blur(height, radius) - height), 0, None)


def lerp(a, b, t):
    t = np.clip(t, 0, 1)[..., None] if np.ndim(t) == 2 else t
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def rgb(hexstr):
    return np.array([int(hexstr[i : i + 2], 16) / 255 for i in (1, 3, 5)])


def save(name, theme, img, srgb=True):
    folder = os.path.join(OUT, theme)
    os.makedirs(folder, exist_ok=True)
    a = np.clip(img, 0, 1)
    if a.ndim == 2:
        a = np.repeat(a[..., None], 3, axis=2)
    Image.fromarray((a * 255 + 0.5).astype(np.uint8)).save(os.path.join(folder, name), quality=88, optimize=True)


def norm01(a):
    lo, hi = np.percentile(a, [1, 99])
    return np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)


def write_ground(theme, height, albedo, rough, normal_strength, glow=None):
    save('color.jpg', theme, albedo)
    save('normal.jpg', theme, normal_map(height, normal_strength))
    save('rough.jpg', theme, rough)
    if glow is not None:
        save('glow.jpg', theme, glow)


# A grey moon at dusk: dusty regolith, pocked with craters of every size,
# young ones ringed with bright ejecta.
def regolith():
    rng = np.random.default_rng(1)
    big, ejecta = craters(rng, 70, 0.006, 0.09)
    small, _ = craters(rng, 260, 0.002, 0.012, 0.6)
    h = spectral(rng, 1.6, 2) * 0.35 + spectral(rng, 1.0, 40) * 0.08 + big + small + pebbles(rng, 2600, 1.6)
    tone = norm01(spectral(rng, 1.4, 1, 24))
    fine = spectral(rng, 0.6, 60)
    base = lerp(rgb('#4a4a4e'), rgb('#6d6a68'), tone)
    base = base * (1 + fine[..., None] * 0.05)
    base = lerp(base, rgb('#8e8b88'), ejecta * 0.7)
    base *= 1 - np.clip(cavity(h, 6) * 0.9, 0, 0.45)[..., None]
    rough = 0.88 + 0.06 * fine.clip(-1, 1)
    write_ground('dusk', h, base, rough, 9)


# Frozen ground: wind-packed snow carved into ridges, with windows of clear
# blue ice where the snow has blown away.
def frost():
    rng = np.random.default_rng(2)
    ridges = spectral(rng, 1.8, 2, aniso=(0.45, 1.0))
    fine = spectral(rng, 0.9, 30, aniso=(0.7, 1.0))
    bare = norm01(spectral(rng, 2.0, 3, 20))
    ice = np.clip((bare - 0.7) * 6, 0, 1)
    f1, f2, _ = cells(rng, 22)
    cracks = np.exp(-((f2 - f1) / 0.04) ** 2) * ice
    h = ridges * 0.6 + fine * 0.12 - ice * 0.5 - cracks * 0.25 + pebbles(rng, 900, 1.2) * (1 - ice)
    snow = lerp(rgb('#c4d2df'), rgb('#e9f0f7'), norm01(ridges + fine * 0.3))
    clear = lerp(rgb('#3d6f93'), rgb('#7fb0cf'), norm01(spectral(rng, 1.2, 4)))
    base = lerp(snow, clear, ice)
    base = lerp(base, rgb('#e8f6ff'), cracks * 0.8)
    base *= 1 - np.clip(cavity(h, 5) * 0.6, 0, 0.3)[..., None]
    rough = 0.75 - ice * 0.6 + fine.clip(-1, 1) * 0.04
    write_ground('ice', h, base, rough, 7)


# Black basalt broken into cooling plates, with molten rock glowing through
# some of the cracks.
def basalt():
    rng = np.random.default_rng(3)
    f1, f2, v = cells(rng, 14)
    edge = f2 - f1
    cracks = np.exp(-(edge / 0.035) ** 2)
    plates = np.clip(edge * 4, 0, 1) ** 0.5
    rough_n = spectral(rng, 1.1, 8)
    h = plates * 0.9 + v * 0.25 + rough_n * 0.12 + spectral(rng, 0.8, 60) * 0.05 + pebbles(rng, 1200, 1.4)
    hot = np.clip((norm01(spectral(rng, 2.0, 1, 8)) - 0.62) * 4, 0, 1)
    tone = norm01(spectral(rng, 1.5, 1, 20))
    base = lerp(rgb('#1b1716'), rgb('#3a302c'), tone * 0.7 + v * 0.3)
    ash = np.clip(cavity(h, 10) * 3, 0, 1)
    base = lerp(base, rgb('#5a504b'), ash * 0.35)
    base *= 1 - cracks[..., None] * 0.7
    glass = np.clip((norm01(rough_n) - 0.7) * 4, 0, 1)
    rough = 0.9 - glass * 0.45
    glow = cracks * hot
    glow = np.clip(glow + blur(glow, 6) * 1.5, 0, 1)
    write_ground('ember', h, base, rough, 10, glow)


# A field of broken rubble: stones of every size half sunk in brown dust.
def rubble():
    rng = np.random.default_rng(4)
    h = spectral(rng, 1.5, 2) * 0.3
    stone = np.zeros((N, N))
    for n, k in ((10, 1.0), (24, 0.55), (60, 0.3)):
        f1, f2, v = cells(rng, n)
        rock = np.clip(1 - f1 / (0.42 + v * 0.18), 0, 1) ** 0.6 * (v > 0.35)
        stone = np.maximum(stone, rock * k)
    h += stone * 0.8 + pebbles(rng, 3000, 1.3) + spectral(rng, 0.8, 60) * 0.04
    dust = lerp(rgb('#4a4036'), rgb('#6a5c4c'), norm01(spectral(rng, 1.3, 2, 30)))
    rockc = lerp(rgb('#5d5650'), rgb('#857c72'), norm01(spectral(rng, 1.0, 10)))
    base = lerp(dust, rockc, np.clip(stone * 2, 0, 1))
    base *= 1 - np.clip(cavity(h, 4) * 1.4, 0, 0.5)[..., None]
    rough = 0.92 - np.clip(stone, 0, 1) * 0.15
    write_ground('belt', h, base, rough, 9)


# Volcanic glass and dark ash around the collapsing stars, cut with faint
# violet seams.
def obsidian():
    rng = np.random.default_rng(5)
    f1, f2, v = cells(rng, 9)
    edge = f2 - f1
    shards = np.clip(edge * 3, 0, 1) ** 0.7 * (v > 0.5)
    ashn = spectral(rng, 1.6, 2)
    h = ashn * 0.35 + shards * 0.5 + spectral(rng, 0.9, 40) * 0.06 + pebbles(rng, 1500, 1.3)
    ash = lerp(rgb('#24202c'), rgb('#3d3746'), norm01(ashn))
    glass = lerp(rgb('#0d0b12'), rgb('#231c33'), v)
    base = lerp(ash, glass, np.clip(shards * 3, 0, 1) * 0.6)
    base *= 1 - np.clip(cavity(h, 6) * 1.0, 0, 0.4)[..., None]
    rough = 0.85 - np.clip(shards * 3, 0, 1) * 0.65
    seams = np.exp(-(edge / 0.03) ** 2) * np.clip((norm01(spectral(rng, 2, 1, 6)) - 0.68) * 4, 0, 1)
    write_ground('void', h, base, rough, 9, np.clip(seams + blur(seams, 5), 0, 1))


# Shared boulder detail: layered, fractured stone in greys, tinted per theme
# by the game.
def stone():
    rng = np.random.default_rng(6)
    f1, f2, v = cells(rng, 8)
    cracks = np.exp(-((f2 - f1) / 0.025) ** 2) * norm01(spectral(rng, 1.5, 2))
    strata = np.sin(_Y * np.pi * 2 * 9 + spectral(rng, 2.0, 1, 6) * 1.5) * 0.5 + 0.5
    grain = spectral(rng, 0.7, 40)
    h = spectral(rng, 1.7, 2) * 0.5 + strata * 0.2 + grain * 0.08 - cracks * 0.35 + v * 0.1
    tone = norm01(spectral(rng, 1.3, 2) + strata * 0.6)
    base = 0.55 + tone * 0.4 + grain * 0.04
    base *= 1 - np.clip(cavity(h, 5) * 1.2 + cracks * 0.25, 0, 0.5)
    save('color.jpg', 'rock', base)
    save('normal.jpg', 'rock', normal_map(h, 10))


if __name__ == '__main__':
    for bake in (regolith, frost, basalt, rubble, obsidian, stone):
        bake()
        print('baked', bake.__name__)
