'use client';

import { getClientRuntime } from '@/lib/client-runtime';

export function csvValue(value: string | number) {
  const text = String(value);
  const safeText =
    typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(text)
      ? `'${text}`
      : text;
  return /[",\n]/.test(safeText)
    ? `"${safeText.replaceAll('"', '""')}"`
    : safeText;
}

export async function downloadTextFile(
  filename: string,
  contents: string,
  type: string,
) {
  const nativeSave = getClientRuntime()?.saveFile;
  if (nativeSave) return nativeSave(filename, contents, type);
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
