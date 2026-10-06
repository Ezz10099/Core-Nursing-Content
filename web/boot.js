(() => {
  'use strict';

  const WEB_ENGINE_VERSION = 2;
  const ROOT = '../';
  const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAfKs7X3Y39m6tuUCjV+3x9Bij8Mu
B+lNPviMihw5qGKQC7UDgZKxojo3upDXZ39yswoz7y0wcfDJhul7udNAdQ==
-----END PUBLIC KEY-----`;
  const encoder = new TextEncoder();

  async function prepareOfflineSupport() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise(resolve => setTimeout(resolve, 2500))
      ]);
    } catch (error) {
      console.warn('Offline support registration failed:', error);
    }
  }

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

  let publicKeyPromise;
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
    const signature = derEcdsaToRaw(base64Bytes(signatureText));
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      encoder.encode(text)
    );
  }

  async function sha256Hex(buffer) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    return [...digest].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  async function fetchText(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
    return response.text();
  }

  function mimeFor(path) {
    if (path.endsWith('.js')) return 'application/javascript';
    if (path.endsWith('.css')) return 'text/css';
    if (path.endsWith('.json')) return 'application/json';
    if (path.endsWith('.svg')) return 'image/svg+xml';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  function replaceResourceReference(html, path, url) {
    const candidates = [path, `./${path}`];
    for (const candidate of candidates) {
      html = html.split(`\"${candidate}\"`).join(`\"${url}\"`);
      html = html.split(`'${candidate}'`).join(`'${url}'`);
    }
    return html;
  }

  function showFatal(message) {
    const status = document.getElementById('bootStatus');
    if (status) status.textContent = message;
    const retry = document.getElementById('retryBoot');
    if (retry) retry.hidden = false;
  }

  async function loadRuntime() {
    if (!window.crypto || !crypto.subtle) throw new Error('Secure browser cryptography is unavailable.');

    const stamp = Date.now();
    const [manifestText, signatureText] = await Promise.all([
      fetchText(`${ROOT}runtime/runtime-manifest.json?web=${stamp}`),
      fetchText(`${ROOT}runtime/runtime-manifest.sig?web=${stamp}`)
    ]);

    if (!(await verifySignedText(manifestText, signatureText))) {
      throw new Error('Runtime signature verification failed.');
    }

    const manifest = JSON.parse(manifestText);
    if (manifest.schemaVersion !== 2 || !Number.isInteger(manifest.runtimeVersion)) {
      throw new Error('Unsupported runtime manifest.');
    }
    if ((Number(manifest.minEngineVersion) || 0) > WEB_ENGINE_VERSION) {
      throw new Error(`This web loader needs engine ${manifest.minEngineVersion} or newer.`);
    }
    if (!Array.isArray(manifest.files) || !manifest.files.length || !manifest.entryPoint) {
      throw new Error('Runtime manifest is incomplete.');
    }

    const loaded = new Map();
    for (const file of manifest.files) {
      if (!file || typeof file.path !== 'string' || typeof file.object !== 'string' || typeof file.sha256 !== 'string') {
        throw new Error('Runtime manifest contains an invalid file entry.');
      }
      const response = await fetch(`${ROOT}runtime/${file.object}?v=${manifest.runtimeVersion}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not fetch ${file.path}.`);
      const buffer = await response.arrayBuffer();
      if (Number.isFinite(file.size) && buffer.byteLength !== file.size) {
        throw new Error(`Size check failed for ${file.path}.`);
      }
      if ((await sha256Hex(buffer)) !== file.sha256.toLowerCase()) {
        throw new Error(`Hash check failed for ${file.path}.`);
      }
      loaded.set(file.path, buffer);
    }

    const entryBuffer = loaded.get(manifest.entryPoint);
    if (!entryBuffer) throw new Error('Runtime entry point is missing.');
    let html = new TextDecoder().decode(entryBuffer);

    const urls = [];
    for (const [path, buffer] of loaded) {
      if (path === manifest.entryPoint) continue;
      const url = URL.createObjectURL(new Blob([buffer], { type: mimeFor(path) }));
      urls.push(url);
      html = replaceResourceReference(html, path, url);
    }

    const pwaMarkup = '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Core Nursing">';
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, pwaMarkup + '</head>');
    const bridgeMarkup = `<script>window.CORE_NURSING_WEB_RUNTIME_VERSION=${manifest.runtimeVersion};window.CORE_NURSING_WEB_ENGINE_VERSION=${WEB_ENGINE_VERSION};<\/script><script src="browser-platform.js"><\/script>`;
    const firstScript = html.search(/<script\b/i);
    if (firstScript >= 0) html = html.slice(0, firstScript) + bridgeMarkup + html.slice(firstScript);
    else html = html.replace(/<\/body>/i, `${bridgeMarkup}</body>`);

    window.addEventListener('beforeunload', () => urls.forEach(url => URL.revokeObjectURL(url)), { once: true });
    document.open();
    document.write(html);
    document.close();
  }

  (async () => {
    await prepareOfflineSupport();
    await loadRuntime();
  })().catch(error => {
    console.error(error);
    showFatal(`Could not start Core Nursing: ${error.message}`);
  });
})();
