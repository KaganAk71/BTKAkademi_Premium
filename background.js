// BTK Akademi Premium – Background Script

let capturedSession = null;
let downloaderOpen  = false;

// ── Capture master.m3u8 + clone headers ────────────────────────────
browser.webRequest.onBeforeSendHeaders.addListener(
  details => {
    // Capture session on first master.m3u8
    if (!capturedSession && details.url.includes("cinema8.com") && details.url.includes("master.m3u8")) {
      const headers = {};
      details.requestHeaders.forEach(h => { headers[h.name] = h.value; });
      capturedSession = { url: details.url, headers, tabId: details.tabId, timestamp: Date.now() };
      downloaderOpen = false;
      console.log("[BTK PRO] Session captured:", details.url);
    }

    // Clone headers for downloader requests
    if (details.originUrl && details.originUrl.includes("downloader.html") && capturedSession) {
      const keep = ["referer","origin","user-agent","sec-fetch-mode","sec-fetch-site","sec-fetch-dest","sec-fetch-user"];
      let newHeaders = details.requestHeaders.filter(h => !keep.includes(h.name.toLowerCase()));
      for (const [k, v] of Object.entries(capturedSession.headers)) {
        if (k.toLowerCase() !== "accept-encoding") newHeaders.push({ name: k, value: v });
      }
      newHeaders.push({ name: "Referer", value: "https://cinema8.com/" });
      newHeaders.push({ name: "Origin",  value: "https://cinema8.com" });
      return { requestHeaders: newHeaders };
    }
  },
  { urls: ["https://*.cinema8.com/*"] },
  ["blocking", "requestHeaders"]
);

// ── Message handler ────────────────────────────────────────────────
browser.runtime.onMessage.addListener((msg, sender, reply) => {
  switch (msg.action) {
    case "getCapturedData":
      reply(capturedSession);
      break;

    case "resetSession":
      capturedSession = null;
      downloaderOpen  = false;
      reply({ ok: true });
      break;

    case "openDownloaderManually":
      browser.tabs.create({ url: browser.extension.getURL("downloader.html") });
      reply({ ok: true });
      break;

    case "captureScreenshot":
      // Fallback tab screenshot (used when canvas is not accessible)
      browser.tabs.captureVisibleTab(null, { format: "png" }).then(dataUrl => {
        browser.downloads.download({ url: dataUrl, filename: `BTK_SS_${Date.now()}.png`, saveAs: true });
      }).catch(console.error);
      reply({ ok: true });
      break;

    default:
      break;
  }
  return true; // keep channel open for async
});
