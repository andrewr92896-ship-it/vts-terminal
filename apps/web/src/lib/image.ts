// Load an image (from a File or a data/blob URL), downscale it to fit within
// `maxDim` on its longest side while preserving aspect ratio, and return a
// compact JPEG data URL. Used to keep screenshots embedded in a study guide
// small enough to store and ship inline. Images already within `maxDim` are
// re-encoded (which also normalizes odd formats to JPEG).
export function fileToScaledDataUrl(source: File | string, maxDim = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
    const src = objectUrl ?? (source as string);
    const img = new Image();
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not process image'));
      }
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read that image'));
    };
    img.src = src;
  });
}
