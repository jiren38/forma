// Funzioni che cambiano comportamento quando Forma gira come app nativa iPhone (Capacitor)
// invece che nel browser. Sul web non fanno nulla di diverso da prima.
import { Capacitor } from '@capacitor/core';

/** true dentro l'app nativa (iOS), false nel browser e nella PWA. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** Indirizzo pubblico della versione web: i link delle email (conferma, reset password) aprono questa. */
export const PUBLIC_WEB_URL = 'https://jiren38.github.io/forma/';

/**
 * Dove Supabase deve rimandare dopo un link email o un login esterno.
 * Nel browser è la pagina corrente; nell'app nativa l'origine è "capacitor://localhost", che le email
 * non possono aprire, quindi si usa la versione web pubblica (poi si accede nell'app con email e password).
 */
export function authRedirectUrl(): string {
  return isNativeApp() ? PUBLIC_WEB_URL : window.location.origin + window.location.pathname;
}

/** Colore del testo della barra di stato (ora, batteria) in base al tema dell'app. */
export async function setNativeStatusBar(dark: boolean) {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch { /* plugin non disponibile */ }
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/**
 * Nell'app nativa i link di download non funzionano: si scrive il file nella cache dell'app
 * e si apre il foglio di condivisione di iOS (Salva su File, AirDrop, Mail…).
 */
export async function shareFileNative(name: string, content: string | Blob) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const path = name.replace(/[^\w.-]+/g, '_');
  const res = typeof content === 'string'
    ? await Filesystem.writeFile({ path, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
    : await Filesystem.writeFile({ path, data: await blobToBase64(content), directory: Directory.Cache });
  await Share.share({ title: name, files: [res.uri] });
}
