// Turn a picked image file into a compact, square data URL.
//
// A local copy rather than an import from the main terminal's AccountSettings —
// the employee bundle stays independent of the main terminal's component tree, and
// this is thirty lines. The size differs too: the design asks for headshots at
// 400px so they hold up in the directory's 84px roster tiles on a retina screen,
// where the main terminal's 256px avatar would soften.
//
// Doing the crop and downscale here, before upload, is what keeps the stored
// data URL small enough to sit inline in the users table. The server still
// enforces its own cap and format check — this is a convenience, not the guard.
export function fileToSquareDataUrl(file: File, size = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        // Cover, then centre — so a portrait or landscape photo crops to the
        // middle rather than squashing.
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not process that image'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

// The design asks for at least 400×400. Anything smaller upscales into a blur in
// the roster tiles, so it is refused with a reason rather than quietly accepted.
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}
