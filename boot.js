// Public on purpose: this file holds no secrets. app.enc and vault.json are AES-256-GCM encrypted,
// and only the password (through PBKDF2) opens them. The key stays on this device, unreadable to scripts.
(async () => {
  const $ = (id) => document.getElementById(id);
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const text = (b) => new TextDecoder().decode(b);
  const open_ = (box, key) => crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, key, fromB64(box.ct));

  const db = () => new Promise((res, rej) => {
    const r = indexedDB.open("theplan-gate", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const idb = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction("keys", mode), q = fn(t.objectStore("keys"));
      t.oncomplete = () => res(q.result);
      t.onerror = () => rej(t.error);
    });
  };
  const keyGet = () => idb("readonly", (s) => s.get("k"));
  const keyPut = (k) => idb("readwrite", (s) => s.put(k, "k"));
  const keyDel = () => idb("readwrite", (s) => s.delete("k"));

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  const say = (t) => { $("gate").hidden = false; $("msg").textContent = t; };
  const getJSON = async (u) => {
    const r = await fetch(u, { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  };

  let vault, bundle;
  try {
    [vault, bundle] = await Promise.all([getJSON("vault.json"), getJSON("app.enc")]);
  } catch (e) {
    $("f").querySelectorAll("input,button").forEach((x) => { x.disabled = true; });
    say("No password set yet, or no connection on the first open.");
    return;
  }

  function mount(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    document.title = "The Plan";
    [...doc.head.children].forEach((n) => { if (n.tagName !== "TITLE") document.head.appendChild(n); });
    const scripts = [...doc.body.querySelectorAll("script")];
    scripts.forEach((s) => s.remove());
    $("gate").remove();
    [...doc.body.childNodes].forEach((n) => document.body.insertBefore(n, document.body.lastElementChild));
    scripts.forEach((s) => { const x = document.createElement("script"); x.textContent = s.textContent; document.body.appendChild(x); });
  }
  async function start(key) {
    const html = text(await open_(bundle, key));
    const conn = JSON.parse(text(await open_(vault.conn, key)));
    window.__plan = { ...conn, lock: async () => { await keyDel().catch(() => {}); location.reload(); } };
    mount(html);
  }

  const saved = await keyGet().catch(() => null);
  if (saved) {
    try { await start(saved); return; } catch (e) { await keyDel().catch(() => {}); }
  }

  $("gate").hidden = false;
  $("pw").focus();
  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("go").disabled = true; $("msg").textContent = "";
    try {
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode($("pw").value), "PBKDF2", false, ["deriveKey"]);
      const kek = await crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: fromB64(vault.salt), iterations: vault.iter }, base,
        { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const raw = await open_(vault.wrapped, kek);
      const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
      await keyPut(key).catch(() => {});      // if this browser can't keep it, it just asks again next time
      await start(key);
    } catch (err) {
      $("go").disabled = false; $("pw").select();
      $("msg").textContent = "Wrong password.";
    }
  });
})();
