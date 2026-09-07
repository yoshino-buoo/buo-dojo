"""Remove only edge-connected near-white background from the original logo.
Maintenance tool: python3 -m pip install pillow numpy scipy
The website and its build do not require Python.
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import binary_propagation, binary_dilation

root = Path(__file__).resolve().parent.parent
source = root / 'assets' / 'title logo.PNG'
target = root / 'assets' / 'title-logo-transparent.png'
rgb = np.asarray(Image.open(source).convert('RGB'))
channels = rgb.astype(np.int16)
near_white = (channels.min(axis=2) >= 248) & (np.ptp(channels, axis=2) <= 12)
seeds = np.zeros(near_white.shape, dtype=bool)
seeds[0, :] = seeds[-1, :] = True
seeds[:, 0] = seeds[:, -1] = True
background = binary_propagation(seeds & near_white, mask=near_white)
alpha = np.where(background, 0., 1.)
# Fade the one-pixel, near-white antialias fringe and remove its white matte.
edge = (~background) & binary_dilation(background) & (channels.min(axis=2) > 235)
alpha[edge] = np.clip((254. - channels.min(axis=2)[edge]) / 20., 0., 1.)
output_rgb = rgb.copy()
nonzero_edge = edge & (alpha > 0)
matte = alpha[nonzero_edge, None]
output_rgb[nonzero_edge] = np.clip((rgb[nonzero_edge].astype(float) - 254 * (1 - matte)) / matte, 0, 255).astype(np.uint8)
rgba = np.dstack((output_rgb, np.rint(alpha * 255).astype(np.uint8)))
Image.fromarray(rgba).save(target, optimize=True)
print(f'{target.name}: {rgb.shape[1]} x {rgb.shape[0]}, RGBA, {background.mean():.1%} transparent background')
