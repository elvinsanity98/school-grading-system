import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** True inside the Android app, false in a browser. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

/**
 * Hands a downloaded file to the user.
 *  - Android app: writes it to the cache and opens the share sheet (save, print, open in another app).
 *  - PDF in a browser: opens it in a new tab so it can be printed.
 *  - anything else in a browser: normal file download.
 *
 * `preOpened` is a window opened synchronously from the click, because browsers block
 * pop-ups that are opened after an await.
 */
export async function deliverFile(blob: Blob, filename: string, preOpened?: Window | null): Promise<void> {
  if (isNative()) {
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    await Share.share({ title: filename, url: written.uri, dialogTitle: 'Open or save' });
    return;
  }
  const url = URL.createObjectURL(blob);
  if (blob.type === 'application/pdf') {
    if (preOpened && !preOpened.closed) preOpened.location.href = url;
    else window.open(url, '_blank');
  } else {
    preOpened?.close();
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}
