/* ===================================================================
   colormaps.js — perceptual color maps for the spectrogram.
   Each map is defined by a handful of control stops; we precompute a
   256-entry lookup table (Uint8 rgb) once for fast per-pixel use.
   =================================================================== */

const STOPS = {
  magma: [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129],
    [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ],
  inferno: [
    [0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106],
    [186, 54, 85], [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164],
  ],
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89], [253, 231, 37],
  ],
  plasma: [
    [13, 8, 135], [84, 2, 163], [139, 10, 165], [185, 50, 137],
    [219, 92, 104], [244, 136, 73], [254, 188, 43], [240, 249, 33], [255, 255, 200],
  ],
  grayscale: [
    [0, 0, 0], [255, 255, 255],
  ],
  ice: [
    [4, 6, 20], [10, 30, 70], [16, 64, 120], [22, 110, 168],
    [56, 160, 200], [120, 200, 224], [196, 232, 244], [255, 255, 255],
  ],
  classic: [ // green→yellow→red, the "vintage analyzer" look
    [3, 8, 14], [10, 40, 30], [16, 110, 50], [120, 190, 40],
    [230, 210, 30], [240, 130, 20], [220, 40, 30], [255, 240, 230],
  ],
};

export const COLORMAP_NAMES = Object.keys(STOPS);

const cache = {};

/** Build (and cache) a Uint8 LUT of length 256*3 for the named colormap. */
export function getColormapLUT(name) {
  if (cache[name]) return cache[name];
  const stops = STOPS[name] || STOPS.magma;
  const lut = new Uint8ClampedArray(256 * 3);
  const seg = stops.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * seg;
    const idx = Math.min(seg - 1, Math.floor(t));
    const f = t - idx;
    const a = stops[idx];
    const b = stops[idx + 1];
    lut[i * 3] = a[0] + (b[0] - a[0]) * f;
    lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * f;
  }
  cache[name] = lut;
  return lut;
}
