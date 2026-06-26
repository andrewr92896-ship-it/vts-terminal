// Helpers for grabbing a screenshot off the clipboard, shared by the screenshot
// uploaders (Account Metrics balance, Funded trade import).

// Read the first image on the clipboard as a File via the async Clipboard API
// (for a "Paste" button). Returns null when the clipboard has no image or access
// is unavailable/denied (older browsers, no permission, insecure context).
export async function readClipboardImage(): Promise<File | null> {
  try {
    if (!navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        return new File([blob], 'pasted-screenshot', { type });
      }
    }
  } catch {
    /* not allowed / unsupported — caller falls back to file picker */
  }
  return null;
}

// Pull an image File out of a paste (Ctrl/Cmd+V) ClipboardEvent, or null when the
// paste carried no image (e.g. plain text). Safe to call on every paste.
export function imageFromPasteEvent(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
