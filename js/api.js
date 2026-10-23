let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-FD': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Får ikke kontakt med serveren. Sjekk nettforbindelsen.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* tomt svar */
  }
  if (res.status === 401 && !['/logginn', '/me', '/registrer'].includes(path)) onUnauthorized();
  if (!res.ok) {
    const err = new Error(data?.error || `Serverfeil (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Bilder krympes i nettleseren før de sendes: et mobilbilde på 6–8 MB blir
// et par hundre kB, og kommer godt under grensen på 4 MB.
export async function krympBilde(file, maks = 2000) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const skala = Math.min(1, maks / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * skala);
    canvas.height = Math.round(bmp.height * skala);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.84));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

async function lastOpp(file, prosjektId) {
  const fil = await krympBilde(file);
  if (fil.size > 4 * 1024 * 1024) throw new Error('Filen er større enn 4 MB.');
  const navn = btoa(String.fromCharCode(...new TextEncoder().encode(file.name)));
  let res;
  try {
    res = await fetch('/api/vedlegg', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': fil.type || 'application/octet-stream', 'X-FD': '1', 'X-Filnavn': navn, 'X-Prosjekt': String(prosjektId) },
      body: fil,
    });
  } catch {
    throw new Error('Får ikke kontakt med serveren. Sjekk nettforbindelsen.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Opplastingen feilet (${res.status})`);
  return data;
}

export const api = {
  lastOpp,
  filUrl: (id) => `/api/vedlegg/${id}`,
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  del: (path, body = {}) => request('DELETE', path, body),
};
