/* ==========================================
   APNA DG STORE - OFFLINE QUEUE & SYNC ENGINE
   ========================================== */

let pendingSyncQueue = JSON.parse(localStorage.getItem("pendingSyncQueue")) || [];
let isSyncProcessing = false;

function savePendingQueue() {
  localStorage.setItem("pendingSyncQueue", JSON.stringify(pendingSyncQueue));
  updateQueueBadgeUI();
}

function updateQueueBadgeUI() {
  const badgeHeader = document.getElementById("pendingSyncBadgeHeader");
  const count = pendingSyncQueue.length;
  if (badgeHeader) {
    if (count > 0) {
      badgeHeader.style.display = "inline-flex";
      badgeHeader.textContent = `🔄 Sync Queue (${count})`;
    } else {
      badgeHeader.style.display = "none";
    }
  }
}

async function syncOrderToGoogleSheet(payload) {
  const baseUrl = googleSheetScriptUrl || localStorage.getItem("googleSheetScriptUrl") || DEFAULT_SHEET_URL;
  if (!baseUrl) {
    console.log("Google Sheet Web App URL missing. Queueing payload.");
    enqueuePayload(payload);
    return false;
  }

  if (!navigator.onLine) {
    console.warn("Offline detected. Queueing Google Sheet payload.");
    enqueuePayload(payload);
    return false;
  }

  try {
    const payloadStr = JSON.stringify(payload);
    const targetUrl = baseUrl.includes("?")
      ? `${baseUrl}&payload=${encodeURIComponent(payloadStr)}`
      : `${baseUrl}?payload=${encodeURIComponent(payloadStr)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout

    await fetch(targetUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payloadStr,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log("✅ Google Sheet sync successful:", payload);
    return true;
  } catch (err) {
    console.error("⚠️ Google Sheet Sync failed (Queueing for auto-retry):", err);
    enqueuePayload(payload);
    return false;
  }
}

function enqueuePayload(payload) {
  // Avoid duplicate queueing for the same order & action
  const exists = pendingSyncQueue.some(item => 
    String(item.orderId || item.poNumber) === String(payload.orderId || payload.poNumber) &&
    String(item.action || 'sync') === String(payload.action || 'sync')
  );

  if (!exists) {
    pendingSyncQueue.push({
      ...payload,
      queuedAt: new Date().toISOString()
    });
    savePendingQueue();
  }
}

async function processPendingSyncQueue() {
  if (isSyncProcessing || !pendingSyncQueue.length || !navigator.onLine) return;
  isSyncProcessing = true;
  console.log(`🔄 Processing ${pendingSyncQueue.length} pending Google Sheet sync items...`);

  const queueCopy = [...pendingSyncQueue];
  for (let i = 0; i < queueCopy.length; i++) {
    const item = queueCopy[i];
    const success = await syncOrderToGoogleSheet(item);
    if (success) {
      // Remove item from queue
      pendingSyncQueue = pendingSyncQueue.filter(q => q.queuedAt !== item.queuedAt);
      savePendingQueue();
    }
  }

  isSyncProcessing = false;
}

// Automatic Network Listeners & Periodic Retry Timer (Every 15s)
window.addEventListener("online", () => {
  console.log("🌐 Internet reconnected! Processing pending sync queue...");
  processPendingSyncQueue();
});

setInterval(() => {
  if (navigator.onLine && pendingSyncQueue.length > 0) {
    processPendingSyncQueue();
  }
}, 15000);
