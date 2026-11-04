/**
 * Save `blob` as `filename` in the browser: a temporary link, in the document (Firefox ignores clicks on detached
 * links), clicked, removed; the object URL is revoked once the download has had time to start (revoking it at once
 * can cancel the download in Safari).
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
