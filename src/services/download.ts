// File delivery. In a claude.ai artifact, files go through the `downloads`
// capability (the viewer confirms each save). Standalone, a normal browser download is used.

type DownloadsNs = { save(r: { filename: string; data: Blob | string }): Promise<{ status: string }> };

let nsPromise: Promise<DownloadsNs | null> | null = null;
function getNs(): Promise<DownloadsNs | null> {
  const w = window as unknown as { claude?: { use(n: string): Promise<unknown> } };
  if (!w.claude?.use) return Promise.resolve(null);
  if (!nsPromise) nsPromise = w.claude.use('downloads') as Promise<DownloadsNs | null>;
  return nsPromise;
}

export function isFramed(): boolean {
  return !!(window as unknown as { claude?: unknown }).claude;
}

export async function saveFile(filename: string, data: Blob | string): Promise<{ ok: boolean; message: string }> {
  const ns = await getNs();
  if (ns) {
    try {
      const r = await ns.save({ filename, data });
      return { ok: true, message: r.status === 'delivered' ? `Sent ${filename}` : `Saved ${filename}` };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return { ok: false, message: 'Download cancelled.' };
      if (code === 'rate_limited') return { ok: false, message: 'Another download is waiting for confirmation. Try again in a moment.' };
      return { ok: false, message: `Download unavailable here (${code ?? 'unknown error'}).` };
    }
  }
  if (isFramed()) return { ok: false, message: 'Downloads are not available in this view.' };
  const blob = typeof data === 'string' ? new Blob([data], { type: 'application/octet-stream' }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { ok: true, message: `Downloaded ${filename}` };
}
