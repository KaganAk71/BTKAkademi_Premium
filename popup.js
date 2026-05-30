// BTK Akademi Premium – Popup Script

const DEFAULT_SHORTCUTS = { speedUp:"]", speedDown:"[", resetSpeed:"\\", complete:"p", screenshot:"s" };
const SC_LABELS = { speedUp:"Hızı Artır", speedDown:"Hızı Azalt", resetSpeed:"Sıfırla", complete:"Hızlı Bitir", screenshot:"SS Al" };

document.addEventListener("DOMContentLoaded", () => {
  const speedSlider = document.getElementById("speed-slider");
  const speedText   = document.getElementById("speed-text");
  const presetBtns  = document.querySelectorAll(".preset-btn");
  const badge       = document.getElementById("download-badge");
  const btnDl       = document.getElementById("btn-download-action");
  const scGrid      = document.getElementById("shortcuts-grid");

  // ── Screenshot: ask content script to do canvas capture ──────────
  function doScreenshot() {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (!tabs[0]) return;
      browser.tabs.sendMessage(tabs[0].id, { action: "captureVideoFrame" }).catch(() => {
        // Fallback: tab screenshot via background
        browser.runtime.sendMessage({ action: "captureScreenshot" });
      });
    });
    window.close();
  }

  // ── Quick complete: ask content script ─────────────────────────
  function doQuickComplete() {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (!tabs[0]) return;
      browser.tabs.sendMessage(tabs[0].id, { action: "quickComplete" });
    });
    window.close();
  }

  // ── Load settings ─────────────────────────────────────────────
  browser.storage.local.get({ videoSpeed: 1.0, shortcuts: DEFAULT_SHORTCUTS }).then(items => {
    const spd = parseFloat(items.videoSpeed) || 1.0;
    speedSlider.value = spd;
    speedText.innerText = `${spd.toFixed(2)}x`;
    updateActive(spd);

    const sc = Object.assign({}, DEFAULT_SHORTCUTS, items.shortcuts);
    renderShortcuts(sc);
  });

  // ── Speed slider ───────────────────────────────────────────────
  speedSlider.addEventListener("input", () => {
    const v = parseFloat(speedSlider.value);
    speedText.innerText = `${v.toFixed(2)}x`;
    browser.storage.local.set({ videoSpeed: v });
    updateActive(v);
  });

  // ── Speed icon buttons ─────────────────────────────────────────
  document.getElementById("btn-speed-up").addEventListener("click", () => changeSpeed(0.25));
  document.getElementById("btn-speed-down").addEventListener("click", () => changeSpeed(-0.25));
  document.getElementById("btn-speed-reset").addEventListener("click", () => {
    speedSlider.value = 1;
    speedText.innerText = "1.00x";
    browser.storage.local.set({ videoSpeed: 1.0 });
    updateActive(1.0);
  });

  function changeSpeed(delta) {
    let v = Math.round((parseFloat(speedSlider.value) + delta) * 100) / 100;
    v = Math.max(0.25, Math.min(16, v));
    speedSlider.value = v;
    speedText.innerText = `${v.toFixed(2)}x`;
    browser.storage.local.set({ videoSpeed: v });
    updateActive(v);
  }

  // ── Preset buttons ─────────────────────────────────────────────
  presetBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const v = parseFloat(btn.dataset.speed);
      speedSlider.value = v;
      speedText.innerText = `${v.toFixed(2)}x`;
      browser.storage.local.set({ videoSpeed: v });
      updateActive(v);
    });
  });

  function updateActive(spd) {
    presetBtns.forEach(b => b.classList.toggle("active", parseFloat(b.dataset.speed) === spd));
  }

  // ── Action buttons ─────────────────────────────────────────────
  document.getElementById("btn-quick-complete").addEventListener("click", doQuickComplete);
  document.getElementById("btn-screenshot").addEventListener("click", doScreenshot);

  // ── Downloader status poll ─────────────────────────────────────
  function pollDownloader() {
    browser.runtime.sendMessage({ action: "getCapturedData" }).then(s => {
      if (s && s.url) {
        badge.className = "status-pill captured";
        badge.innerHTML = `<span style="font-size:12px">●</span> Video Yakalandı`;
        btnDl.disabled = false;
        btnDl.textContent = "Aç";
      } else {
        badge.className = "status-pill waiting";
        badge.innerHTML = `<span style="font-size:12px">●</span> Video Bekleniyor`;
        btnDl.disabled = true;
        btnDl.textContent = "İndiriciyi Aç";
      }
    }).catch(() => {});
  }

  pollDownloader();
  const iv = setInterval(pollDownloader, 1200);
  window.addEventListener("unload", () => clearInterval(iv));

  btnDl.addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "openDownloaderManually" });
  });

  // ── Shortcuts grid ─────────────────────────────────────────────
  function renderShortcuts(sc) {
    scGrid.innerHTML = "";
    Object.keys(SC_LABELS).forEach(k => {
      const item = document.createElement("div");
      item.className = "sc-item";
      item.innerHTML = `<kbd>${sc[k] || DEFAULT_SHORTCUTS[k]}</kbd><span>${SC_LABELS[k]}</span>`;
      scGrid.appendChild(item);
    });
  }
});
