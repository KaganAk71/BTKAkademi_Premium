// BTK Akademi Premium Helper - Content Script
(function () {
  if (!window.location.hostname.includes("cinema8.com")) return;

  let currentSpeed = 1.0;
  let videoEl = null;
  let floatingPanel = null;
  let originalSpeedSetting = 1.0;

  // Default shortcuts
  const DEFAULT_SHORTCUTS = {
    speedUp:    "]",
    speedDown:  "[",
    resetSpeed: "\\",
    complete:   "p",
    screenshot: "s"
  };
  let shortcuts = { ...DEFAULT_SHORTCUTS };

  // ── Storage helpers ─────────────────────────────────────────────
  function loadSettings(cb) {
    browser.storage.local.get({ videoSpeed: 1.0, shortcuts: DEFAULT_SHORTCUTS })
      .then(items => {
        currentSpeed = parseFloat(items.videoSpeed) || 1.0;
        originalSpeedSetting = currentSpeed;
        shortcuts = Object.assign({}, DEFAULT_SHORTCUTS, items.shortcuts);
        if (cb) cb();
      })
      .catch(() => { if (cb) cb(); });
  }

  function saveSpeed(val) {
    browser.storage.local.set({ videoSpeed: val }).catch(() => {});
  }

  // ── Init ────────────────────────────────────────────────────────
  loadSettings(() => applySpeedToVideo());

  browser.storage.onChanged.addListener((changes, ns) => {
    if (ns !== "local") return;
    if (changes.videoSpeed) {
      currentSpeed = parseFloat(changes.videoSpeed.newValue);
      applySpeedToVideo();
      updateFloatingUI();
    }
    if (changes.shortcuts) {
      shortcuts = Object.assign({}, DEFAULT_SHORTCUTS, changes.shortcuts.newValue);
    }
  });

  setInterval(() => {
    const vid = document.querySelector("video");
    if (vid && vid !== videoEl) {
      videoEl = vid;
      videoEl.addEventListener("ratechange", () => {
        if (videoEl.playbackRate !== currentSpeed) videoEl.playbackRate = currentSpeed;
      });
      videoEl.addEventListener("play", () => applySpeedToVideo());
      applySpeedToVideo();
      injectFloatingControls();
    }
  }, 1000);

  // ── Core functions ───────────────────────────────────────────────
  function applySpeedToVideo() {
    if (!videoEl) return;
    const s = Math.max(0.25, Math.min(16.0, currentSpeed));
    videoEl.playbackRate = s;
  }

  function adjustSpeed(delta) {
    currentSpeed = Math.round(Math.max(0.25, Math.min(16.0, currentSpeed + delta)) * 100) / 100;
    saveSpeed(currentSpeed);
  }

  function toggleNormalSpeed() {
    if (currentSpeed !== 1.0) { originalSpeedSetting = currentSpeed; currentSpeed = 1.0; }
    else { currentSpeed = originalSpeedSetting || 1.5; }
    saveSpeed(currentSpeed);
  }

  function quickCompleteVideo() {
    if (!videoEl || isNaN(videoEl.duration)) { toast("Video yüklenmedi!", "error"); return; }
    toast("Videonun sonuna atlanıyor ✓", "success");
    videoEl.currentTime = videoEl.duration - 0.5;
    videoEl.playbackRate = 1.0;
    videoEl.play().catch(() => {});
    setTimeout(() => videoEl.dispatchEvent(new Event("ended")), 300);
  }

  // ── Screenshot — canvas capture of the video frame ───────────────
  function captureVideoFrame() {
    if (!videoEl || isNaN(videoEl.videoWidth)) { toast("Video bulunamadı!", "error"); return; }
    try {
      const canvas = document.createElement("canvas");
      canvas.width  = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      canvas.getContext("2d").drawImage(videoEl, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) { toast("SS alınamadı!", "error"); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `BTK_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
        toast("Ekran görüntüsü kaydedildi ✓", "success");
      }, "image/png");
    } catch (e) {
      toast("SS alınamadı: " + e.message, "error");
    }
  }

  // ── Keyboard listener ────────────────────────────────────────────
  window.addEventListener("keydown", e => {
    const tag = document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement.id === "btk-speed-input") return;
    const k = e.key.toLowerCase();
    if (k === shortcuts.speedUp.toLowerCase())    adjustSpeed(0.25);
    else if (k === shortcuts.speedDown.toLowerCase())  adjustSpeed(-0.25);
    else if (k === shortcuts.resetSpeed.toLowerCase()) toggleNormalSpeed();
    else if (k === shortcuts.complete.toLowerCase())   quickCompleteVideo();
    else if (k === shortcuts.screenshot.toLowerCase()) captureVideoFrame();
  });

  // ── Toast notification ────────────────────────────────────────────
  function toast(msg, type = "success") {
    let el = document.getElementById("btk-toast");
    if (el) el.remove();
    el = document.createElement("div");
    el.id = "btk-toast";
    const color = type === "success" ? "rgba(16,185,129,0.92)" : "rgba(239,68,68,0.92)";
    el.style.cssText = `
      position:fixed; top:18px; left:50%; transform:translateX(-50%);
      background:${color}; color:#fff; padding:9px 20px; border-radius:9px;
      font-family:system-ui,sans-serif; font-size:13px; font-weight:600;
      z-index:2147483647; box-shadow:0 4px 16px rgba(0,0,0,0.35);
      transition:opacity .3s; pointer-events:none; white-space:nowrap;
    `;
    el.innerText = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 320); }, 2000);
  }

  // ── SVG icons ─────────────────────────────────────────────────────
  function svgIcon(path, vb = "0 0 24 24") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }
  const SVG = {
    minus:    svgIcon('<line x1="5" y1="12" x2="19" y2="12"/>'),
    plus:     svgIcon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    bolt:     svgIcon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
    camera:   svgIcon('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
    drag:     svgIcon('<circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>'),
    settings: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')
  };

  // ── Floating bar builder ──────────────────────────────────────────
  function injectFloatingControls() {
    if (document.getElementById("btk-floating-bar")) return;

    floatingPanel = document.createElement("div");
    floatingPanel.id = "btk-floating-bar";
    floatingPanel.style.cssText = `
      position:fixed; bottom:20px; right:20px;
      background:rgba(10,14,28,0.88);
      backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
      border:1px solid rgba(255,255,255,0.09);
      border-radius:14px; padding:6px 10px 6px 4px;
      z-index:2147483647; font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 12px 30px rgba(0,0,0,0.45), 0 0 18px rgba(139,92,246,0.18);
      display:flex; align-items:center; gap:6px;
      user-select:none;
      transition:opacity .25s,border-color .25s,box-shadow .25s;
      opacity:0.75;
    `;

    floatingPanel.addEventListener("mouseenter", () => {
      floatingPanel.style.opacity = "1";
      floatingPanel.style.borderColor = "rgba(139,92,246,0.4)";
      floatingPanel.style.boxShadow = "0 12px 30px rgba(0,0,0,0.55),0 0 22px rgba(139,92,246,0.35)";
    });
    floatingPanel.addEventListener("mouseleave", () => {
      floatingPanel.style.opacity = "0.75";
      floatingPanel.style.borderColor = "rgba(255,255,255,0.09)";
      floatingPanel.style.boxShadow = "0 12px 30px rgba(0,0,0,0.45),0 0 18px rgba(139,92,246,0.18)";
    });

    // ─ Drag handle ─
    const dragHandle = document.createElement("div");
    dragHandle.style.cssText = `
      color:rgba(255,255,255,0.25); padding:0 5px; cursor:move; display:flex; align-items:center;
      transition:color .2s;
    `;
    dragHandle.innerHTML = SVG.drag;
    dragHandle.title = "Taşı";
    dragHandle.addEventListener("mouseenter", () => dragHandle.style.color = "rgba(255,255,255,0.6)");
    dragHandle.addEventListener("mouseleave", () => dragHandle.style.color = "rgba(255,255,255,0.25)");
    floatingPanel.appendChild(dragHandle);

    // ─ Separator ─
    const sep = () => {
      const d = document.createElement("div");
      d.style.cssText = "width:1px;height:16px;background:rgba(255,255,255,0.12);margin:0 1px;";
      return d;
    };

    // ─ Speed: minus, value, plus ─
    const btnMinus = mkBtn(SVG.minus, () => adjustSpeed(-0.25), null, "Hızı azalt ([ tuşu)");
    floatingPanel.appendChild(btnMinus);

    const speedVal = document.createElement("span");
    speedVal.id = "btk-speed-indicator";
    speedVal.title = "Tıkla → özel hız gir";
    speedVal.style.cssText = `
      color:#f1f5f9; font-size:12px; font-weight:700;
      min-width:40px; text-align:center; cursor:pointer; padding:2px 0;
      transition:color .15s;
    `;
    speedVal.addEventListener("mouseenter", () => speedVal.style.color = "#a78bfa");
    speedVal.addEventListener("mouseleave", () => speedVal.style.color = "#f1f5f9");
    speedVal.addEventListener("click", () => openSpeedInput(speedVal));
    floatingPanel.appendChild(speedVal);

    const btnPlus = mkBtn(SVG.plus, () => adjustSpeed(0.25), null, "Hızı artır (] tuşu)");
    floatingPanel.appendChild(btnPlus);

    floatingPanel.appendChild(sep());

    // ─ Quick complete ─
    const btnComplete = mkBtn(SVG.bolt, quickCompleteVideo, "#10b981", "Hızlı bitir (P tuşu)");
    floatingPanel.appendChild(btnComplete);

    // ─ Screenshot ─
    const btnShot = mkBtn(SVG.camera, captureVideoFrame, "#8b5cf6", "Ekran görüntüsü (S tuşu)");
    floatingPanel.appendChild(btnShot);

    floatingPanel.appendChild(sep());

    // ─ Shortcuts settings ─
    const btnCfg = mkBtn(SVG.settings, openShortcutsPanel, null, "Kısayolları özelleştir");
    floatingPanel.appendChild(btnCfg);

    // ─ Drag logic (handle only) ─
    let isDrag = false, dsx, dsy, il, it;
    dragHandle.addEventListener("mousedown", e => {
      isDrag = true;
      dsx = e.clientX; dsy = e.clientY;
      const r = floatingPanel.getBoundingClientRect();
      il = r.left; it = r.top;
      floatingPanel.style.bottom = "auto";
      floatingPanel.style.right  = "auto";
      floatingPanel.style.left   = il + "px";
      floatingPanel.style.top    = it + "px";
      e.preventDefault();
    });
    window.addEventListener("mousemove", e => {
      if (!isDrag) return;
      floatingPanel.style.left = (il + e.clientX - dsx) + "px";
      floatingPanel.style.top  = (it + e.clientY - dsy) + "px";
    });
    window.addEventListener("mouseup", () => { isDrag = false; });

    // ─ Fullscreen keep-alive ─
    const moveToFS = () => {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs) fs.appendChild(floatingPanel);
      else document.body.appendChild(floatingPanel);
    };
    document.addEventListener("fullscreenchange", moveToFS);
    document.addEventListener("webkitfullscreenchange", moveToFS);

    document.body.appendChild(floatingPanel);
    updateFloatingUI();
  }

  // ── Speed input inline ────────────────────────────────────────────
  function openSpeedInput(speedVal) {
    if (document.getElementById("btk-speed-input")) return;
    const input = document.createElement("input");
    input.id = "btk-speed-input";
    input.type = "number";
    input.value = currentSpeed;
    input.step = "0.25"; input.min = "0.25"; input.max = "16.0";
    input.style.cssText = `
      width:44px; background:rgba(0,0,0,0.9); border:1px solid #8b5cf6;
      color:#fff; border-radius:5px; font-size:12px; font-weight:700;
      text-align:center; outline:none; padding:2px 0;
    `;
    speedVal.replaceWith(input);
    input.focus(); input.select();
    const commit = () => {
      let v = parseFloat(input.value);
      if (!isNaN(v)) { v = Math.max(0.25, Math.min(16.0, v)); currentSpeed = v; saveSpeed(v); applySpeedToVideo(); }
      input.replaceWith(speedVal);
      updateFloatingUI();
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") commit(); else if (e.key === "Escape") { input.replaceWith(speedVal); updateFloatingUI(); } });
    input.addEventListener("blur", commit);
  }

  // ── Shortcuts panel (modal overlay) ──────────────────────────────
  function openShortcutsPanel() {
    if (document.getElementById("btk-shortcuts-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "btk-shortcuts-modal";
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2147483646;
      display:flex; align-items:center; justify-content:center;
      font-family:system-ui,sans-serif;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
      background:#0d1120; border:1px solid rgba(139,92,246,0.35); border-radius:16px;
      padding:24px; width:320px; color:#f1f5f9;
      box-shadow:0 20px 50px rgba(0,0,0,0.7);
    `;

    const title = document.createElement("h3");
    title.innerText = "⌨️ Kısayol Tuşları";
    title.style.cssText = "margin:0 0 16px;font-size:15px;font-weight:700;color:#a78bfa;";
    box.appendChild(title);

    const fields = [
      { key: "speedUp",    label: "Hızı Artır" },
      { key: "speedDown",  label: "Hızı Azalt" },
      { key: "resetSpeed", label: "Hızı Sıfırla" },
      { key: "complete",   label: "Hızlı Bitir" },
      { key: "screenshot", label: "Ekran Görüntüsü" }
    ];

    const inputs = {};
    fields.forEach(f => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;";
      const lbl = document.createElement("span");
      lbl.innerText = f.label;
      lbl.style.cssText = "font-size:13px;color:#94a3b8;";
      const inp = document.createElement("input");
      inp.type = "text"; inp.maxLength = 1;
      inp.value = shortcuts[f.key];
      inp.style.cssText = `
        width:40px; text-align:center; background:rgba(255,255,255,0.08);
        border:1px solid rgba(255,255,255,0.15); border-radius:6px;
        color:#fff; font-size:13px; font-weight:700; padding:4px; outline:none;
      `;
      inp.addEventListener("focus", () => inp.style.borderColor = "#8b5cf6");
      inp.addEventListener("blur",  () => inp.style.borderColor = "rgba(255,255,255,0.15)");
      inputs[f.key] = inp;
      row.appendChild(lbl);
      row.appendChild(inp);
      box.appendChild(row);
    });

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;margin-top:16px;";

    const btnSave = document.createElement("button");
    btnSave.innerText = "Kaydet";
    btnSave.style.cssText = `
      flex:1; background:#7c3aed; border:none; color:#fff; border-radius:8px;
      padding:9px; font-size:13px; font-weight:700; cursor:pointer; transition:background .2s;
    `;
    btnSave.addEventListener("mouseenter", () => btnSave.style.background = "#6d28d9");
    btnSave.addEventListener("mouseleave", () => btnSave.style.background = "#7c3aed");
    btnSave.addEventListener("click", () => {
      const newSC = {};
      fields.forEach(f => { newSC[f.key] = inputs[f.key].value || DEFAULT_SHORTCUTS[f.key]; });
      shortcuts = newSC;
      browser.storage.local.set({ shortcuts: newSC }).catch(() => {});
      overlay.remove();
      toast("Kısayollar kaydedildi ✓", "success");
    });

    const btnReset = document.createElement("button");
    btnReset.innerText = "Sıfırla";
    btnReset.style.cssText = `
      background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.12);
      color:#94a3b8; border-radius:8px; padding:9px 14px; font-size:13px;
      font-weight:600; cursor:pointer; transition:background .2s;
    `;
    btnReset.addEventListener("click", () => { fields.forEach(f => { inputs[f.key].value = DEFAULT_SHORTCUTS[f.key]; }); });

    const btnClose = document.createElement("button");
    btnClose.innerText = "✕";
    btnClose.style.cssText = `
      background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.12);
      color:#94a3b8; border-radius:8px; padding:9px 12px; font-size:13px;
      cursor:pointer; transition:background .2s;
    `;
    btnClose.addEventListener("click", () => overlay.remove());

    btnRow.appendChild(btnSave);
    btnRow.appendChild(btnReset);
    btnRow.appendChild(btnClose);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ── Button factory ────────────────────────────────────────────────
  function mkBtn(svgHtml, onClick, accentColor, title = "") {
    const btn = document.createElement("button");
    const bg  = accentColor ? accentColor + "22" : "rgba(255,255,255,0.06)";
    const bgH = accentColor ? accentColor + "44" : "rgba(255,255,255,0.14)";
    btn.style.cssText = `
      background:${bg}; border:1px solid rgba(255,255,255,0.06);
      color:${accentColor || "#cbd5e1"};
      border-radius:8px; width:30px; height:28px; padding:0;
      cursor:pointer; transition:all .15s; outline:none;
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
    `;
    btn.innerHTML = svgHtml;
    btn.title = title;
    btn.addEventListener("mouseenter", () => { btn.style.background = bgH; btn.style.transform = "scale(1.08)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = bg;  btn.style.transform = "scale(1)"; });
    btn.addEventListener("click", onClick);
    return btn;
  }

  // ── Update speed display ──────────────────────────────────────────
  function updateFloatingUI() {
    const el = document.getElementById("btk-speed-indicator");
    if (el) el.innerText = `${currentSpeed.toFixed(2)}x`;
  }

  // ── Messages from popup ─────────────────────────────────────────
  browser.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.action === "captureVideoFrame") { captureVideoFrame(); reply({ ok: true }); }
    if (msg.action === "quickComplete")    { quickCompleteVideo(); reply({ ok: true }); }
    return true;
  });
})();
