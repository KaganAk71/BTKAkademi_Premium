// BTK Akademi Premium Helper - Downloader Script

const logConsole = document.getElementById('log-console');
const progressBar = document.getElementById('progress-bar');
const progressPercentage = document.getElementById('progress-percentage');
const statusLabel = document.getElementById('status-label');
const videoSource = document.getElementById('video-source');
const qualitySelect = document.getElementById('quality-select');
const formatSelect = document.getElementById('format-select');
const btnStart = document.getElementById('btn-start');

let capturedSession = null;
let parsedPlaylistItems = [];

// Süslü terminal loglama fonksiyonu
function log(msg, type = "info") {
  const timeStr = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${timeStr}]</span><span class="log-text log-${type}">${msg}</span>`;
  logConsole.appendChild(line);
  logConsole.scrollTop = logConsole.scrollHeight;
}

// AES-128 Şifre Çözme Motoru (WebCrypto API)
async function decryptSegment(encryptedData, keyBuffer, seqNum) {
  let iv = new Uint8Array(16);
  let view = new DataView(iv.buffer);
  view.setUint32(12, seqNum, false); // Big endian

  const key = await crypto.subtle.importKey(
    "raw", 
    keyBuffer, 
    { name: "AES-CBC" }, 
    false, 
    ["decrypt"]
  );
  
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: iv }, 
      key, 
      encryptedData
    );
    return new Uint8Array(decrypted);
  } catch (e) {
    throw new Error("Şifre kırılamadı! AES bloğu bozuk veya anahtar eşleşmiyor olabilir.");
  }
}

// 1. AŞAMA: Oturumu Başlat ve Master M3U8 Analiz Et
async function initializeDashboard() {
  log("[*] Sistem başlatılıyor... Oturum verileri bekleniyor...", "info");
  
  try {
    const data = await browser.runtime.sendMessage({ action: "getCapturedData" });
    if (!data || !data.url) {
      log("[-] HATA: Yakalanan video oturumu bulunamadı. Lütfen BTK Akademi'de ders videosunu başlatın.", "error");
      statusLabel.innerText = "Bağlantı Bekleniyor...";
      return;
    }

    capturedSession = data;
    videoSource.innerText = data.url;
    videoSource.title = data.url;
    log(`[+] Oturum Yakalandı: ${data.url}`, "success");
    log("[*] Master M3U8 indiriliyor ve çözümleniyor...", "info");

    const baseUrl = data.url.substring(0, data.url.lastIndexOf('/') + 1);

    // Master M3U8'i Fetch Et
    const res = await fetch(data.url);
    if (!res.ok) throw new Error("Master M3U8 dosyası indirilemedi.");
    
    const text = await res.text();
    const lines = text.split('\n');
    
    // M3U8 Ayrıştır ve Kaliteleri Bul
    let currentResolution = "";
    let currentBandwidth  = 0;
    const bestByRes = {}; // resolution -> {url,bandwidth,label}

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
        currentResolution = resMatch ? resMatch[1] : "";
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        currentBandwidth  = bwMatch ? parseInt(bwMatch[1]) : 0;
      } else if (line && !line.startsWith('#')) {
        const streamUrl = line.startsWith('http') ? line : baseUrl + line;
        const key = currentResolution || 'default';
        // Keep only the stream with highest bandwidth for each resolution
        if (!bestByRes[key] || currentBandwidth > bestByRes[key].bandwidth) {
          const height = currentResolution ? currentResolution.split('x')[1] : '';
          let qName = height ? `${height}p` : 'Orijinal';
          if (height === '1080') qName += ' (FHD)';
          else if (height === '720' || height === '725') qName += ' (HD)';
          else if (height === '576' || height === '480') qName += ' (SD)';
          const kbps = currentBandwidth ? Math.round(currentBandwidth / 1024) + ' Kbps' : '';
          bestByRes[key] = {
            url: streamUrl,
            bandwidth: currentBandwidth,
            label: kbps ? `${qName} — ${kbps}` : qName
          };
        }
        currentResolution = ""; currentBandwidth = 0;
      }
    }

    // Sort descending by bandwidth
    parsedPlaylistItems = Object.values(bestByRes).sort((a, b) => b.bandwidth - a.bandwidth);

    if (parsedPlaylistItems.length === 0) {
      parsedPlaylistItems.push({ url: data.url, bandwidth: 0, label: 'Orijinal / Varsayılan' });
    }

    // Dropdown'ı doldur
    qualitySelect.innerHTML = "";
    parsedPlaylistItems.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.url;
      opt.innerText = item.label;
      qualitySelect.appendChild(opt);
    });

    qualitySelect.disabled = false;
    btnStart.disabled = false;
    log(`[+] Toplam ${parsedPlaylistItems.length} çözünürlük seçeneği bulundu. İndirmeye hazır.`, "success");

  } catch (err) {
    log(`[-] HATA: ${err.message}`, "error");
    statusLabel.innerText = "Hata Oluştu";
  }
}

// 2. AŞAMA: İndirmeyi ve Şifre Çözmeyi Başlat
btnStart.addEventListener("click", async () => {
  // UI Kontrollerini Kilitle
  qualitySelect.disabled = true;
  formatSelect.disabled = true;
  btnStart.disabled = true;

  document.getElementById("progress-section").style.display = "block";
  logConsole.innerHTML = ""; // Konsolu temizle

  const selectedSubUrl = qualitySelect.value;
  const targetFormat = formatSelect.value;

  log(`[*] İşlem başladı! Format: ${targetFormat.toUpperCase()}`, "info");
  log(`[*] Yayın Alt M3U8 listesi çekiliyor...`, "info");

  try {
    const res = await fetch(selectedSubUrl);
    if (!res.ok) throw new Error("Seçilen çözünürlüğün M3U8 listesi çekilemedi.");

    const text = await res.text();
    const lines = text.split('\n');
    const subBaseUrl = selectedSubUrl.substring(0, selectedSubUrl.lastIndexOf('/') + 1);

    let segments = [];
    let keyUrl = null;
    let startSeq = 0;

    // Alt M3U8'i Ayrıştır
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        startSeq = parseInt(line.split(':')[1]);
      }
      else if (line.startsWith('#EXT-X-KEY:METHOD=AES-128')) {
        let uriMatch = line.match(/URI=["']([^"']+)["']/);
        if (uriMatch) {
          keyUrl = uriMatch[1].startsWith('http') ? uriMatch[1] : subBaseUrl + uriMatch[1];
        }
      }
      else if (line && !line.startsWith('#') && (line.endsWith('.ts') || line.includes('index-') || line.includes('seg-'))) {
        segments.push(line.startsWith('http') ? line : subBaseUrl + line);
      }
    }

    if (segments.length === 0) throw new Error("M3U8 dosyasında video segmenti bulunamadı!");
    
    log(`[+] Toplam ${segments.length} video parçası tespit edildi.`, "success");
    log(`[*] Şifreleme kontrol ediliyor...`, "info");

    let keyBuffer = null;
    if (keyUrl) {
      log(`[!] AES-128 Şifreleme Tespit Edildi! Güvenli anahtar çalınıyor...`, "warning");
      const keyRes = await fetch(keyUrl);
      if (!keyRes.ok) throw new Error("Şifre çözme anahtarı Cinema8 sunucularından çekilemedi.");
      keyBuffer = await keyRes.arrayBuffer();
      log(`[✓] Şifre çözme anahtarı başarıyla yakalandı! (16 Bytes)`, "success");
    } else {
      log("[i] Video şifresiz, doğrudan birleştirme yapılacak.", "info");
    }

    log("\n------------------ İNDİRME VE ÇÖZÜMLEME BAŞLADI ------------------", "info");

    let finalBuffers = [];
    let mp4Chunks = [];
    let transmuxer = null;

    // Eğer MP4 formatı istenirse mux.js transmuxer'ı ayağa kaldır
    if (targetFormat === "mp4" && typeof muxjs !== 'undefined') {
      log("[*] Mux.js MP4 Dönüştürücü başlatıldı.", "info");
      transmuxer = new muxjs.mp4.Transmuxer();
      
      let initSegmentCaptured = false;
      transmuxer.on('data', (event) => {
        if (event.initSegment && !initSegmentCaptured) {
          log("[*] Video başlangıç başlığı (Init Segment) eklendi.", "info");
          mp4Chunks.push(event.initSegment);
          initSegmentCaptured = true;
        }
        if (event.data) {
          mp4Chunks.push(event.data);
        } else if (event instanceof Uint8Array) {
          mp4Chunks.push(event);
        }
      });
    }

    let downloadedCount = 0;

    // Segment İndirme Döngüsü
    for (let i = 0; i < segments.length; i++) {
      statusLabel.innerText = `İndiriliyor: ${i + 1} / ${segments.length}`;
      
      let attempt = 0;
      let segRes = null;
      
      // Hata durumunda 3 kez yeniden dene
      while (attempt < 3) {
        try {
          segRes = await fetch(segments[i]);
          if (segRes.ok) break;
        } catch (e) {
          attempt++;
          if (attempt >= 3) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const encryptedData = await segRes.arrayBuffer();
      let decryptedData = encryptedData;

      // AES-128 Korumasını Çöz
      if (keyBuffer) {
        decryptedData = await decryptSegment(encryptedData, keyBuffer, startSeq + i);
      }

      // MP4 Muxing veya TS Biriktirme
      if (targetFormat === "mp4" && transmuxer) {
        transmuxer.push(new Uint8Array(decryptedData));
        transmuxer.flush();
      } else {
        finalBuffers.push(new Uint8Array(decryptedData));
      }

      downloadedCount++;
      
      // İlerleme yüzdesini ve barını güncelle
      const percent = Math.round((downloadedCount / segments.length) * 100);
      progressBar.style.width = percent + "%";
      progressPercentage.innerText = percent + "%";

      if (percent % 10 === 0 || segments.length < 20) {
        log(`[*] Parça ${downloadedCount}/${segments.length} çözüldü.`, "info");
      }
    }

    log("\n------------------ TÜM PARÇALAR BAŞARIYLA İŞLENDİ ------------------", "success");
    statusLabel.innerText = "Dosya Paketleniyor...";
    log("[*] Video verileri paketleniyor, lütfen bekleyin...", "info");

    let finalBlob = null;
    let fileExtension = "ts";

    if (targetFormat === "mp4") {
      fileExtension = "mp4";
      finalBlob = new Blob(mp4Chunks, { type: 'video/mp4' });
    } else if (targetFormat === "audio-mp3" || targetFormat === "audio-wav") {
      // Audio-only: extract audio from TS segments via AudioContext
      fileExtension = targetFormat === "audio-mp3" ? "mp3" : "wav";
      log("[*] Ses verisi çıkartılıyor...", "info");
      const rawBlob = new Blob(finalBuffers, { type: 'video/mp2t' });
      const arrayBuf = await rawBlob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      let decoded;
      try {
        decoded = await audioCtx.decodeAudioData(arrayBuf);
      } catch(e) {
        // Fallback: just save as ts and warn
        log("[!] Ses çözümlenemedi, TS olarak kaydediliyor.", "warning");
        fileExtension = "ts";
        finalBlob = new Blob(finalBuffers, { type: 'video/mp2t' });
        decoded = null;
      }
      if (decoded) {
        const wavBuf = audioBufferToWav(decoded);
        finalBlob = new Blob([wavBuf], { type: 'audio/wav' });
        fileExtension = "wav";
        log("[✓] Ses WAV formatında hazır.", "success");
      }
    } else {
      fileExtension = "ts";
      finalBlob = new Blob(finalBuffers, { type: 'video/mp2t' });
    }

    const blobUrl = URL.createObjectURL(finalBlob);
    
    // Otomatik dosya adı üretme
    let fileName = "BTK_Video";
    const nameMatch = selectedSubUrl.match(/,([a-zA-Z0-9_-]+),/);
    if (nameMatch) {
      fileName = `BTK_${nameMatch[1]}`;
    }

    log(`[🎉] TEBRİKLER! Video hazırlandı, indirme başlatılıyor...`, "success");
    statusLabel.innerText = "İndirme Başlatıldı!";

    // İndirmeyi Tetikle
    await browser.downloads.download({
      url: blobUrl,
      filename: `${fileName}.${fileExtension}`,
      saveAs: true
    });

    log(`[✓] Dosya bilgisayarınıza kaydedildi! (${fileName}.${fileExtension})`, "success");
    log("[*] Sistem yeni videolar yakalamak için hazır.", "info");
    statusLabel.innerText = "İşlem Tamamlandı!";

    // Oturumu sıfırla
    await browser.runtime.sendMessage({ action: "resetSession" });

  } catch (err) {
    log(`[-] HATA: ${err.message}`, "error");
    statusLabel.innerText = "Hata Oluştu!";
    
    // UI kilitlerini kaldır ki tekrar deneyebilsinler
    qualitySelect.disabled = false;
    formatSelect.disabled = false;
    btnStart.disabled = false;
  }
});

// Başlangıçta sayfayı kur
document.addEventListener("DOMContentLoaded", initializeDashboard);

// ── AudioBuffer → WAV helper ─────────────────────────────────────
function audioBufferToWav(buffer) {
  const numCh   = buffer.numberOfChannels;
  const rate    = buffer.sampleRate;
  const samples = buffer.length;
  const byteLen = 44 + samples * numCh * 2;
  const out     = new DataView(new ArrayBuffer(byteLen));
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };

  writeStr(0,  'RIFF');
  out.setUint32(4,  byteLen - 8, true);
  writeStr(8,  'WAVE');
  writeStr(12, 'fmt ');
  out.setUint32(16, 16,          true);
  out.setUint16(20, 1,           true); // PCM
  out.setUint16(22, numCh,       true);
  out.setUint32(24, rate,        true);
  out.setUint32(28, rate * numCh * 2, true);
  out.setUint16(32, numCh * 2,   true);
  out.setUint16(34, 16,          true);
  writeStr(36, 'data');
  out.setUint32(40, samples * numCh * 2, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      out.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return out.buffer;
}
