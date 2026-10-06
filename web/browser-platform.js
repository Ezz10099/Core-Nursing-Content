(() => {
  'use strict';

  if (window.CoreNursingAndroid) return;

  const ROOT = '../';
  const CURRENT_RUNTIME = Number(window.CORE_NURSING_WEB_RUNTIME_VERSION) || 0;
  const WEB_ENGINE_VERSION = Number(window.CORE_NURSING_WEB_ENGINE_VERSION) || 2;
  const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAfKs7X3Y39m6tuUCjV+3x9Bij8Mu
B+lNPviMihw5qGKQC7UDgZKxojo3upDXZ39yswoz7y0wcfDJhul7udNAdQ==
-----END PUBLIC KEY-----`;
  const encoder = new TextEncoder();
  let checking = false;
  let publicKeyPromise;

  function pemBytes(pem) {
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const raw = atob(b64);
    return Uint8Array.from(raw, ch => ch.charCodeAt(0));
  }

  function base64Bytes(value) {
    const raw = atob(String(value).trim());
    return Uint8Array.from(raw, ch => ch.charCodeAt(0));
  }

  function readDerLength(bytes, offset) {
    let len = bytes[offset++];
    if ((len & 0x80) === 0) return { length: len, offset };
    const count = len & 0x7f;
    if (!count || count > 2) throw new Error('Unsupported DER length');
    len = 0;
    for (let i = 0; i < count; i++) len = (len << 8) | bytes[offset++];
    return { length: len, offset };
  }

  function derEcdsaToRaw(signature) {
    let offset = 0;
    if (signature[offset++] !== 0x30) throw new Error('Invalid ECDSA signature');
    const seq = readDerLength(signature, offset);
    offset = seq.offset;
    if (signature[offset++] !== 0x02) throw new Error('Invalid ECDSA r value');
    const rLen = readDerLength(signature, offset);
    offset = rLen.offset;
    let r = signature.slice(offset, offset + rLen.length);
    offset += rLen.length;
    if (signature[offset++] !== 0x02) throw new Error('Invalid ECDSA s value');
    const sLen = readDerLength(signature, offset);
    offset = sLen.offset;
    let s = signature.slice(offset, offset + sLen.length);
    while (r.length > 32 && r[0] === 0) r = r.slice(1);
    while (s.length > 32 && s[0] === 0) s = s.slice(1);
    if (r.length > 32 || s.length > 32) throw new Error('ECDSA value is too large');
    const raw = new Uint8Array(64);
    raw.set(r, 32 - r.length);
    raw.set(s, 64 - s.length);
    return raw;
  }

  function publicKey() {
    if (!publicKeyPromise) {
      publicKeyPromise = crypto.subtle.importKey(
        'spki',
        pemBytes(PUBLIC_KEY_PEM),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
    }
    return publicKeyPromise;
  }

  async function verifySignedText(text, signatureText) {
    const key = await publicKey();
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      derEcdsaToRaw(base64Bytes(signatureText)),
      encoder.encode(text)
    );
  }

  async function fetchText(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error((`HTTP ${response.status`));
    return response.text();
  }

  async function fetchVerified(path, signaturePath) {
    const stamp = Date.now();
    const separator = path.includes('?') ? '&' : '?';
    const sigSeparator = signaturePath.includes('?') ? '&' : '?';
    const [text, signature] = await Promise.all([
      fetchText(`${path}${separator}web=${stamp}`),
      fetchText(`${signaturePath}${sigSeparator}web=${stamp}`)
    ]);
    if (!(await verifySignedText(text, signature))) throw new Error('signature verification failed');
    return text;
  }

  function reloadForRuntime(version) {
    const url = new URL(window.location.href);
    url.searchParams.set('runtime', String(version));
    window.location.replace(url.toString());
  }

  async function checkForContentUpdates() {
    if (checking) return;
    checking = true;
    let stage = 'runtime';
    try {
      if (window.CoreNursingUpdate && typeof window.CoreNursingUpdate.checking === 'function') {
        window.CoreNursingUpdate.checking();
      }

      const manifestText = await fetchVerified(`${ROOT}runtime/runtime-manifest.json`, `${ROOT}runtime/runtime-manifest.sig`);
      const manifest = JSON.parse(manifestText);
      const minEngine = Number(manifest.minEngineVersion) || 0;
      const remoteRuntime = Number(manifest.runtimeVersion) || 0;

      if (minEngine > WEB_ENGINE_VERSION) {
        if (window.CoreNursingUpdate && typeof window.CoreNursingUpdate.engineRequired === 'function') {
          window.CoreNursingUpdate.engineRequired(minEngine);
        }
        return;
      }

      if (remoteRuntime > CURRENT_RUNTIME) {
        if (window.CoreNursingUpdate && typeof window.CoreNursingUpdate.runtimeInstalling === 'function') {
          window.CoreNursingUpdate.runtimeInstalling(remoteRuntime);
        }
        reloadForRuntime(remoteRuntime);
        return;
      }

      stage = 'content';
      const contentText = await fetchVerified(`${ROOT}content.json`, `${ROOT}content.sig`);
      if (!window.CoreNursingSync || typeof window.CoreNursingSync.receive !== 'function') {
        throw new Error('content receiver is unavailable');
      }
      window.CoreNursingSync.receive(contentText);
    } catch (error) {
      console.error(error);
      if (stage === 'content' && window.CoreNursingSync && typeof window.CoreNursingSync.failed === 'function') {
        window.CoreNursingSync.failed('Browser content update failed verification or could not be downloaded.');
      } else if (window.CoreNursingUpdate && typeof window.CoreNursingUpdate.failed === 'function') {
        window.CoreNursingUpdate.failed('Browser runtime update failed verification or could not be downloaded.');
      }
    } finally {
      checking = false;
    }
  }

  window.CoreNursingAndroid = {
    checkForContentUpdates,
    getActiveRuntimeVersion: () => CURRENT_RUNTIME,
    confirmRuntimeHealthy: () => {},
    hasCapability: name => name === 'contact-email' || name === 'web-browser',
    contactCreator: () => { window.location.href = 'mailto:siammostafa415@gmail.com'; },
    openHttpsUrl: url => {
      if (typeof url === 'string' && /^https:\/\//i.test(url)) window.location.href = url;
    },
    copyText: (_label, text) => {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(String(text)).catch(() => {});
      }
    }
  };
})();
