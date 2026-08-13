const SUPABASE_URL = "https://xbzvnhhyataeciiysbhh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_aevPjOJgExRRlhUA9-iAYg_tpIk03it";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let productsList = [], suppliersList = [], poCart = [], editPoCart = [], tickedProductsMap = {};
let editingProductIds = new Set(), lastEditExitTimestamp = 0;

/* GOOGLE SHEETS AUTOMATIC SYNC LOGIC */
const DEFAULT_SHEET_URL = "https://script.google.com/macros/s/AKfycbyPS3892GpqKPPoL3gkHLK2BnMtXrW2j9ALCBqblf82uLi9rslEVh2eaGOMwi9UT6-R7Q/exec";
let googleSheetScriptUrl = DEFAULT_SHEET_URL;
localStorage.setItem("googleSheetScriptUrl", DEFAULT_SHEET_URL);

let actionVisibilityConfig = JSON.parse(localStorage.getItem("actionVisibilityConfig")) || {
  contactPills: true,
  pdfReport: true,
  googleSync: true,
  changeSupplier: true,
  editItems: true,
  cancelOrder: true,
  changeDate: true,
  deleteOrder: true,
  deleteOnReceived: true
};

function openVisibilityModal() {
  const modal = document.getElementById("visibilityControlModal");
  if (!modal) return;
  Object.keys(actionVisibilityConfig).forEach(key => {
    const chk = document.getElementById(`vis_${key}`);
    if (chk) chk.checked = actionVisibilityConfig[key] !== false;
  });
  modal.style.display = "flex";
}

function closeVisibilityModal() {
  const modal = document.getElementById("visibilityControlModal");
  if (modal) modal.style.display = "none";
  loadPurchaseOrders();
}

function toggleVisConfig(key, isChecked) {
  actionVisibilityConfig[key] = isChecked;
  localStorage.setItem("actionVisibilityConfig", JSON.stringify(actionVisibilityConfig));
}

function resetVisibilityConfig() {
  actionVisibilityConfig = {
    contactPills: true,
    pdfReport: true,
    googleSync: true,
    changeSupplier: true,
    editItems: true,
    cancelOrder: true,
    changeDate: true,
    deleteOrder: true,
    deleteOnReceived: true
  };
  localStorage.setItem("actionVisibilityConfig", JSON.stringify(actionVisibilityConfig));
  openVisibilityModal();
}

function saveGoogleSheetUrl(url) {
  googleSheetScriptUrl = (url || "").trim();
  localStorage.setItem("googleSheetScriptUrl", googleSheetScriptUrl);
  const statusEl = document.getElementById("sheetSyncStatus");
  if (statusEl) {
    statusEl.textContent = googleSheetScriptUrl ? "✅ Sheet Sync Active" : "⚠️ Sheet URL Not Set";
    statusEl.style.color = googleSheetScriptUrl ? "var(--success)" : "var(--danger)";
  }
}

async function syncOrderToGoogleSheet(payload) {
  const baseUrl = googleSheetScriptUrl || localStorage.getItem("googleSheetScriptUrl") || DEFAULT_SHEET_URL;
  if (!baseUrl) {
    console.log("Google Sheet Web App URL missing. Skipping sheet sync.");
    return;
  }
  try {
    const payloadStr = JSON.stringify(payload);
    const targetUrl = baseUrl.includes("?")
      ? `${baseUrl}&payload=${encodeURIComponent(payloadStr)}`
      : `${baseUrl}?payload=${encodeURIComponent(payloadStr)}`;

    await fetch(targetUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payloadStr
    });
    console.log("Successfully sent payload to Google Sheet:", payload);
  } catch (err) {
    console.error("Google Sheet Sync Error:", err);
  }
}

function copyAppsScriptCode() {
  const code = [
    "function doPost(e) { return handleRequest(e); }",
    "function doGet(e) { return handleRequest(e); }",
    "",
    "function handleRequest(e) {",
    "  try {",
    "    var data = null;",
    "    if (e && e.postData && e.postData.contents) {",
    "      try { data = JSON.parse(e.postData.contents); } catch (err1) {}",
    "    }",
    "    if (!data && e && e.parameter && e.parameter.payload) {",
    "      try { data = JSON.parse(e.parameter.payload); } catch (err2) {}",
    "    }",
    "    if (!data && e && e.parameter) {",
    "      data = e.parameter;",
    "    }",
    "    if (!data) {",
    "      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No data received' })).setMimeType(ContentService.MimeType.JSON);",
    "    }",
    "",
    "    if (data.record && typeof data.record === 'object') {",
    "      data = data.record;",
    "    }",
    "",
    "    var ss = SpreadsheetApp.getActiveSpreadsheet();",
    "",
    "    var orderIdStr = String(data.orderId || data.order_id || '');",
    "    var partyStr = String(data.partyName || data.customer_name || '');",
    "    var addressStr = String(data.address || data.notes || '');",
    "    var typeStr = String(data.orderType || '');",
    "    var itemsStr = String(data.items || data.note || '');",
    "",
    "    var isCollection = data.isCollection || ",
    "                       data.targetSheet === 'Collection' ||",
    "                       typeStr === 'Counter Sale / Collection' || ",
    "                       orderIdStr.indexOf('ORD-CNT') !== -1 ||",
    "                       orderIdStr.indexOf('COLL') !== -1 ||",
    "                       partyStr.indexOf('Counter Cash Sale') !== -1 ||",
    "                       partyStr.indexOf('Counter Online Sale') !== -1 ||",
    "                       addressStr.indexOf('[MODE:') !== -1;",
    "",
    "    if (isCollection) {",
    "      var collSheet = ss.getSheetByName('Collection');",
    "      if (!collSheet) {",
    "        collSheet = ss.insertSheet('Collection');",
    "      }",
    "      ",
    "      if (collSheet.getLastRow() === 0) {",
    "        collSheet.appendRow([",
    "          'Timestamp', ",
    "          'Unique Id', ",
    "          'Mode (Cash/Online)', ",
    "          'Person / Party', ",
    "          'Item / Note', ",
    "          'Amount (₹)', ",
    "          'From Date', ",
    "          'To Date', ",
    "          'Status', ",
    "          'Notes'",
    "        ]);",
    "        var headerRange = collSheet.getRange(1, 1, 1, 10);",
    "        headerRange.setFontWeight('bold');",
    "        headerRange.setBackground('#0d9488');",
    "        headerRange.setFontColor('#ffffff');",
    "      }",
    "      ",
    "      var timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });",
    "      var collId = orderIdStr || ('COLL-' + Date.now());",
    "      ",
    "      var mode = data.mode || '';",
    "      if (!mode) {",
    "        if (partyStr.indexOf('Online') !== -1 || addressStr.indexOf('ONLINE') !== -1 || addressStr.indexOf('online') !== -1) {",
    "          mode = 'Online';",
    "        } else {",
    "          mode = 'Cash (Offline)';",
    "        }",
    "      }",
    "      ",
    "      var party = partyStr || (mode === 'Online' ? 'Counter Online Sale' : 'Counter Cash Sale');",
    "",
    "      var itemNote = itemsStr;",
    "      if (!itemNote && addressStr) {",
    "        var matchNote = addressStr.match(/\\[MODE:[^\\]]+\\]\\s*([^|\\(]+)/);",
    "        itemNote = matchNote ? matchNote[1].trim() : addressStr;",
    "      }",
    "      if (!itemNote) itemNote = 'Counter Collection';",
    "",
    "      var amount = Number(data.totalAmount || data.amount || 0);",
    "      if (amount === 0 && addressStr) {",
    "        var matchAmt = addressStr.match(/Amt:\\s*₹?\\s*([\\d.]+)/);",
    "        if (matchAmt) amount = Number(matchAmt[1]);",
    "      }",
    "",
    "      var fromDate = data.fromDate || '';",
    "      var toDate = data.toDate || '';",
    "      var status = data.status || 'completed';",
    "      var notes = addressStr || data.notes || '';",
    "",
    "      collSheet.appendRow([",
    "        timestamp,",
    "        collId,",
    "        mode,",
    "        party,",
    "        itemNote,",
    "        amount,",
    "        fromDate,",
    "        toDate,",
    "        status,",
    "        notes",
    "      ]);",
    "",
    "      return ContentService.createTextOutput(JSON.stringify({ status: 'success', target: 'Collection' }))",
    "        .setMimeType(ContentService.MimeType.JSON);",
    "    }",
    "",
    "    if (data.action === 'delete') {",
    "      var sheetsToClean = ['Admin Orders Indent', 'Admin Orders Log'];",
    "      for (var s = 0; s < sheetsToClean.length; s++) {",
    "        var sh = ss.getSheetByName(sheetsToClean[s]);",
    "        if (sh) {",
    "          var rows = sh.getDataRange().getValues();",
    "          for (var r = rows.length - 1; r >= 1; r--) {",
    "            if (String(rows[r][1]) === String(data.orderId)) {",
    "              sh.deleteRow(r + 1);",
    "            }",
    "          }",
    "        }",
    "      }",
    "      return ContentService.createTextOutput(JSON.stringify({ status: 'success', action: 'delete' }))",
    "        .setMimeType(ContentService.MimeType.JSON);",
    "    }",
    "",
    "    var isPO = !isCollection && (",
    "      data.isPO || ",
    "      data.targetSheet === 'Admin Orders Indent' ||",
    "      typeStr === 'Supplier Reorder' || ",
    "      typeStr === 'Supplier Stock Received' ||",
    "      orderIdStr.indexOf('PO-') === 0",
    "    );",
    "",
    "    if (isPO) {",
    "      var poSheet = ss.getSheetByName('Admin Orders Indent');",
    "      if (!poSheet) {",
    "        poSheet = ss.insertSheet('Admin Orders Indent');",
    "      }",
    "",
    "      if (poSheet.getLastRow() === 0) {",
    "        poSheet.appendRow([",
    "          'Timestamp',",
    "          'Unique Id',",
    "          'Indent Number',",
    "          'SKU Code',",
    "          'Item Name',",
    "          'Quantity',",
    "          'Cost/Pack',",
    "          'Supplier',",
    "          'Buyer(Perchase Person',",
    "          'Price (₹)',",
    "          'Total'",
    "        ]);",
    "        var poHeaderRange = poSheet.getRange(1, 1, 1, 11);",
    "        poHeaderRange.setFontWeight('bold');",
    "        poHeaderRange.setBackground('#006666');",
    "        poHeaderRange.setFontColor('#ffffff');",
    "      }",
    "",
    "      var timestampStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });",
    "",
    "      if (data.itemsArray && Array.isArray(data.itemsArray)) {",
    "        var totalItems = data.itemsArray.length;",
    "        for (var i = 0; i < totalItems; i++) {",
    "          var item = data.itemsArray[i];",
    "          var cleanSku = String(item.sku || '0').replace(/^SKU-/i, '').trim();",
    "          cleanSku = cleanSku.replace(/^([A-Z0-9]{2,4}-)\\1/gi, '$1');",
    "          var isLastItem = (i === totalItems - 1);",
    "          var billTotalVal = isLastItem ? (item.orderTotal || data.totalAmount || data.price || '') : '';",
    "          poSheet.appendRow([",
    "            timestampStr,",
    "            orderIdStr,",
    "            item.indentNo || (101 + i),",
    "            cleanSku,",
    "            item.name || '',",
    "            item.quantity || 1,",
    "            item.costPack || item.cost_pack || 0,",
    "            item.supplier || partyStr || 'N/A',",
    "            data.buyer || partyStr || item.person || 'Akash sharma',",
    "            item.price || item.totalPrice || 0,",
    "            billTotalVal",
    "          ]);",
    "        }",
    "      } else {",
    "        var cleanSkuSingle = String(data.sku || '0').replace(/^SKU-/i, '').trim();",
    "        cleanSkuSingle = cleanSkuSingle.replace(/^([A-Z0-9]{2,4}-)\\1/gi, '$1');",
    "        poSheet.appendRow([",
    "          timestampStr,",
    "          orderIdStr,",
    "          101,",
    "          cleanSkuSingle,",
    "          itemsStr || 'Purchase Order Item',",
    "          data.quantity || 1,",
    "          data.costPack || data.cost_pack || 0,",
    "          partyStr || 'N/A',",
    "          data.buyer || partyStr || 'Akash sharma',",
    "          data.totalAmount || data.price || 0,",
    "          data.totalAmount || data.price || 0",
    "        ]);",
    "      }",
    "",
    "      return ContentService.createTextOutput(JSON.stringify({ status: 'success', target: 'Admin Orders Indent' }))",
    "        .setMimeType(ContentService.MimeType.JSON);",
    "    }",
    "",
    "    var logSheet = ss.getSheetByName('Admin Orders Log');",
    "    if (!logSheet) {",
    "      logSheet = ss.insertSheet('Admin Orders Log');",
    "    }",
    "",
    "    if (logSheet.getLastRow() === 0) {",
    "      logSheet.appendRow([",
    "        'Timestamp',",
    "        'Order Code',",
    "        'Customer Name',",
    "        'Items',",
    "        'Quantity',",
    "        'Total Amount (₹)',",
    "        'Status',",
    "        'Notes / Contact'",
    "      ]);",
    "      var logHeader = logSheet.getRange(1, 1, 1, 8);",
    "      logHeader.setFontWeight('bold');",
    "      logHeader.setBackground('#1e293b');",
    "      logHeader.setFontColor('#ffffff');",
    "    }",
    "",
    "    var logTimestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });",
    "    logSheet.appendRow([",
    "      logTimestamp,",
    "      orderIdStr,",
    "      partyStr,",
    "      itemsStr,",
    "      data.quantity || 1,",
    "      data.totalAmount || 0,",
    "      data.status || 'pending',",
    "      addressStr || data.notes || ''",
    "    ]);",
    "",
    "    return ContentService.createTextOutput(JSON.stringify({ status: 'success', target: 'Admin Orders Log' }))",
    "      .setMimeType(ContentService.MimeType.JSON);",
    "",
    "  } catch (err) {",
    "    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))",
    "      .setMimeType(ContentService.MimeType.JSON);",
    "  }",
    "}"
  ].join("\n");

  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      alert("Google Apps Script code clipboard me copy ho gaya hai! Google Sheet me paste karke Naya Deployment karein.");
    }).catch(() => {
      prompt("Kripya niche se Google Apps Script code copy karein:", code);
    });
  } else {
    prompt("Kripya niche se Google Apps Script code copy karein:", code);
  }
}

/* SIDEBAR NAVIGATION & PERSIST ACTIVE VIEW */
const toggleSidebar = () => ["sidebarDrawer", "sidebarOverlay"].forEach(id => document.getElementById(id)?.classList.toggle("open"));
const closeSidebar = () => ["sidebarDrawer", "sidebarOverlay"].forEach(id => document.getElementById(id)?.classList.remove("open"));

function switchAdminView(viewId) {
  document.querySelectorAll(".admin-view").forEach(v => v.style.display = "none");
  document.querySelectorAll(".sidebar-btn, .bottom-nav-btn").forEach(b => b.classList.remove("active"));

  const targetView = document.getElementById("view-" + viewId);
  if (targetView) targetView.style.display = "block";

  document.querySelector(`.sidebar-btn[data-view="${viewId}"]`)?.classList.add("active");
  document.getElementById("nav-" + viewId)?.classList.add("active");

  closeSidebar();
  localStorage.setItem("activeAdminView", viewId);

  const viewActions = {
    customerOrders: loadCustomerOrders,
    supplierReorder: () => { loadSuppliers(); ensureProductsLoaded(); },
    supplierHistory: () => { loadSuppliers(); loadPurchaseOrders(); ensureProductsLoaded(); },
    productsAdmin: () => { loadAllProductsView(); loadSuppliers(); },
    salesReport: () => {
      const todayStr = new Date().toISOString().split('T')[0];
      ['manualCashFromDate', 'manualCashToDate'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = todayStr));
      if (!document.getElementById("reportFromDate")?.value) setDateFilter('week');
      calculateWeeklyReinvestmentComparison();
      loadCounterCollectionHistory();
    },
    supplierReport: () => {
      loadSuppliers();
      if (!document.getElementById("supplierReportFromDate")?.value) setSupplierReportDateFilter('week');
    }
  };
  viewActions[viewId]?.();
}

const initActiveTab = () => { switchAdminView(localStorage.getItem("activeAdminView") || "customerOrders"); updateLanguageUI(); };

/* 3-WAY LANGUAGE LOGIC */
let currentLang = localStorage.getItem("adminLang") || "hinglish";
const changeLanguage = langVal => { currentLang = langVal; localStorage.setItem("adminLang", currentLang); updateLanguageUI(); };

function updateLanguageUI() {
  document.getElementById("langSelect") && (document.getElementById("langSelect").value = currentLang);
  const translations = {
    lblNavCustOrders: { hinglish: "Customer Orders", english: "Customer Orders", hindi: "ग्राहक ऑर्डर्स" },
    lblNavSupplierReorder: { hinglish: "Naya Supplier Reorder", english: "Create Supplier Reorder", hindi: "नया सप्लायर रीऑर्डर" },
    lblNavSupplierHistory: { hinglish: "Supplier Reorders History", english: "Supplier Reorders History", hindi: "सप्लायर रीऑर्डर इतिहास" },
    lblNavProductsList: { hinglish: "Products List", english: "Products List", hindi: "उत्पाद सूची" },
    lblNavSalesReport: { hinglish: "Sales Report", english: "Sales Report", hindi: "बिक्री रिपोर्ट" },
    lblNavSupplierReport: { hinglish: "Supplier Purchase Report", english: "Supplier Purchase Report", hindi: "सप्लायर खरीदारी रिपोर्ट" },
    btnMasterAdd: { hinglish: "➕ Master Supplier Add Karein", english: "➕ Add Master Supplier", hindi: "➕ मास्टर सप्लायर जोड़ें" },
    btnMasterList: { hinglish: "👥 Master Suppliers List", english: "👥 Master Suppliers List", hindi: "👥 मास्टर सप्लायर सूची" },
    btnMasterAddProd: { hinglish: "➕ Master Supplier Add Karein", english: "➕ Add Master Supplier", hindi: "➕ मास्टर सप्लायर जोड़ें" },
    btnMasterListProd: { hinglish: "👥 Master Suppliers List", english: "👥 Master Suppliers List", hindi: "👥 मास्टर सप्लायर सूची" },
    btnAddNewProductToggle: { hinglish: "➕ Naya Product Add Karein", english: "➕ Add New Product", hindi: "➕ नया उत्पाद जोड़ें" },
    btnCounterCollection: { hinglish: "💵 ➕ Counter Collection Entry Karein", english: "💵 ➕ Enter Counter Collection", hindi: "💵 ➕ काउंटर कलेक्शन प्रविष्टि करें" },
    btnDateToday: { hinglish: "Today", english: "Today", hindi: "आज" },
    custDateBtnWeek: { hinglish: "📅 Last 7 Days (Default)", english: "📅 Last 7 Days (Default)", hindi: "📅 पिछले 7 दिन (डिफ़ॉल्ट)" },
    btnDateMonth: { hinglish: "This Month", english: "This Month", hindi: "इस महीने" },
    btnDateYear: { hinglish: "This Year", english: "This Year", hindi: "इस वर्ष" },
    btnFilterOrders: { hinglish: "🔍 Filter Orders", english: "🔍 Filter Orders", hindi: "🔍 ऑर्डर्स फ़िल्टर करें" },
    btnRefreshCust: { hinglish: "🔄 Refresh", english: "🔄 Refresh", hindi: "🔄 रीफ़्रेश" },
    btnRefreshHist: { hinglish: "🔄 Refresh", english: "🔄 Refresh", hindi: "🔄 रीफ़्रेश" },
    btnRefreshProd: { hinglish: "🔄 Refresh", english: "🔄 Refresh", hindi: "🔄 रीफ़्रेश" },
    calcTabPacketBtn: { hinglish: "📦 Packet / Box Calculator", english: "📦 Packet / Box Calculator", hindi: "📦 पैकेट / बॉक्स कैलकुलेटर" },
    calcTabBillBtn: { hinglish: "💵 Total Bill Calculator", english: "💵 Total Bill Calculator", hindi: "💵 कुल बिल कैलकुलेटर" },
    headingCustOrders: { hinglish: "🛍 Customer Orders", english: "🛍 Customer Orders", hindi: "🛍 ग्राहक ऑर्डर्स" },
    headingNewReorder: { hinglish: "➕ Naya Supplier Reorder Banayein", english: "➕ Create New Supplier Reorder", hindi: "➕ नया सप्लायर रीऑर्डर बनाएं" },
    headingReorderHistory: { hinglish: "📋 Supplier Reorders History", english: "📋 Supplier Reorders History", hindi: "📋 सप्लायर रीऑर्डर इतिहास" },
    headingProductsList: { hinglish: "📦 Products List", english: "📦 Products List", hindi: "📦 उत्पाद सूची" },
    headingAddProductForm: { hinglish: "➕ Add New Product to DB", english: "➕ Add New Product to DB", hindi: "➕ डेटाबेस में नया उत्पाद जोड़ें" },
    headingSalesReport: { hinglish: "📊 Sales Report", english: "📊 Sales Report", hindi: "📊 बिक्री रिपोर्ट" },
    headingSupplierReport: { hinglish: "🏬 Supplier-Wise Purchase Report", english: "🏬 Supplier Purchase Report", hindi: "🏬 सप्लायर खरीदारी रिपोर्ट" }
  };
  Object.entries(translations).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val[currentLang] || val.hinglish;
  });
}

/* CALCULATORS & HELPERS */
function switchCalcMode(mode, prefix = '') {
  const isPacket = mode === 'packet';
  document.getElementById(prefix + 'calcModePacket') && (document.getElementById(prefix + 'calcModePacket').style.display = isPacket ? 'block' : 'none');
  document.getElementById(prefix + 'calcModeBill') && (document.getElementById(prefix + 'calcModeBill').style.display = isPacket ? 'none' : 'block');
  document.getElementById(prefix + 'calcTabPacketBtn')?.classList.toggle('active-filter', isPacket);
  document.getElementById(prefix + 'calcTabBillBtn')?.classList.toggle('active-filter', !isPacket);
}

function calculatePacketRate(prefix = '') {
  const cost = parseFloat(document.getElementById(prefix + 'calcPacketCost')?.value || 0);
  const pouch = parseInt(document.getElementById(prefix + 'calcPouchCount')?.value || 0);
  const packQty = parseInt(document.getElementById(prefix + 'calcPacketQty')?.value || 1);
  const resEl = document.getElementById(prefix + 'calcPacketResultRate');
  const pKey = prefix ? prefix.toLowerCase() : '';

  if (cost > 0 && pouch > 0) {
    const rate = cost / pouch;
    if (resEl) resEl.value = `₹${rate.toFixed(2)} / pouch (${packQty * pouch} pouches)`;
    const poPrice = document.getElementById(pKey ? `${pKey}PoPrice` : 'poPrice');
    const poQty = document.getElementById(pKey ? `${pKey}PoQty` : 'poQty');
    if (poPrice) poPrice.value = rate.toFixed(2);
    if (poQty) poQty.value = packQty * pouch;
  } else if (resEl) resEl.value = '';
}

function calculateUnitRate(prefix = '') {
  const qty = parseInt(document.getElementById(prefix + 'calcTotalQty')?.value || 0);
  const bill = parseFloat(document.getElementById(prefix + 'calcTotalBill')?.value || 0);
  const resEl = document.getElementById(prefix + 'calcResultRate');
  const pKey = prefix ? prefix.toLowerCase() : '';

  if (qty > 0 && bill > 0) {
    const rate = bill / qty;
    if (resEl) resEl.value = `₹${rate.toFixed(2)} / item`;
    const poPrice = document.getElementById(pKey ? `${pKey}PoPrice` : 'poPrice');
    const poQty = document.getElementById(pKey ? `${pKey}PoQty` : 'poQty');
    if (poPrice) poPrice.value = rate.toFixed(2);
    if (poQty) poQty.value = qty;
  } else if (resEl) resEl.value = '';
}

function toggleCounterCollectionCard() {
  const card = document.getElementById("counterCollectionCard");
  if (!card) return;
  const isHidden = card.style.display === "none" || !card.style.display;
  card.style.display = isHidden ? "block" : "none";
  if (isHidden) document.getElementById("manualCashAmount")?.focus();
}

function toggleDropdown(btn) {
  const menu = btn.nextElementSibling;
  document.querySelectorAll('.dropdown-menu').forEach(m => m !== menu && m.classList.remove('show'));
  menu?.classList.toggle('show');
}

document.addEventListener('click', e => !e.target.closest('.dropdown-wrapper') && document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show')));

const formatTime = dtStr => dtStr ? new Date(dtStr).toLocaleString("hi-IN", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

/* REPORTS & ANALYTICS */
async function saveOfflineCashEntry() {
  const [fromDateVal, toDateVal, modeVal, amountVal, noteVal] = [
    document.getElementById("manualCashFromDate").value,
    document.getElementById("manualCashToDate").value,
    document.getElementById("manualCashMode").value,
    Number(document.getElementById("manualCashAmount").value),
    document.getElementById("manualCashNote").value || "Counter Sales"
  ];
  if (!fromDateVal || !toDateVal || amountVal <= 0) return alert("Sahi Dates aur Amount dalein.");

  const remarkText = `[MODE:${modeVal.toUpperCase()}] ${noteVal} (Amt: ₹${amountVal}) | Period: ${fromDateVal} to ${toDateVal}`;
  const { error: collErr } = await db.from("Collections").insert([{ collection_date: toDateVal, amount: amountVal, note: remarkText }]);

  if (collErr) alert("Error saving entry: " + collErr.message);
  else {
    syncOrderToGoogleSheet({
      targetSheet: "Collection",
      isCollection: true,
      orderId: "COLL-" + Date.now(),
      orderType: "Counter Sale / Collection",
      mode: modeVal === 'online' ? 'Online' : 'Cash (Offline)',
      partyName: modeVal === 'online' ? "Counter Online Sale" : "Counter Cash Sale",
      items: noteVal,
      quantity: 1,
      totalAmount: amountVal,
      amount: amountVal,
      fromDate: fromDateVal,
      toDate: toDateVal,
      status: "completed",
      notes: `Period: ${fromDateVal} to ${toDateVal}`
    });
    alert("Collection Entry Successfully Saved!");
    document.getElementById("manualCashAmount").value = "";
    document.getElementById("manualCashNote").value = "";
    loadCounterCollectionHistory();
    calculateReports();
  }
}

function toggleCounterCollectionCard() {
  const card = document.getElementById("counterCollectionCard");
  if (!card) return;
  const isHidden = card.style.display === "none" || !card.style.display;
  card.style.display = isHidden ? "block" : "none";
  if (isHidden) {
    document.getElementById("manualCashAmount")?.focus();
    loadCounterCollectionHistory();
  }
}

function toggleSalesReportSection() {
  const container = document.getElementById("salesReportFullContainer");
  if (!container) return;
  const isHidden = container.style.display === "none" || !container.style.display;
  container.style.display = isHidden ? "block" : "none";

  const btn = document.getElementById("btnToggleSalesReport");
  if (btn) {
    btn.textContent = isHidden ? "📊 Hide Sales Report" : "📊 Sales Report";
  }

  if (isHidden) {
    calculateReports();
    calculateWeeklyReinvestmentComparison();
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function loadCounterCollectionHistory() {
  const container = document.getElementById("counterCollectionHistoryContainer");
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:12px;">Collection History load ho rahi hai...</div>`;

  try {
    const { data, error } = await db
      .from("Collections")
      .select("*")
      .order("id", { ascending: false })
      .limit(30);

    if (error) {
      container.innerHTML = `<div style="text-align:center; color:var(--danger); padding:10px; font-size:12px;">Error loading history: ${error.message}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:12px;">Abhi tak koi Collection Entry save nahi hui hai.</div>`;
      return;
    }

    const rowsHTML = data.map(item => {
      const note = item.note || "";
      const isOnline = note.toLowerCase().includes("mode:online") || note.toLowerCase().includes("online");
      const cleanNote = note.replace(/\[MODE:[^\]]+\]\s*/i, "").replace(/\| Period:[^|]+/i, "").trim();
      const dateStr = item.collection_date || (item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '-');

      return `
        <tr>
          <td style="font-weight:600; white-space:nowrap;">${dateStr}</td>
          <td>
            <span class="badge ${isOnline ? 'badge-info' : 'badge-success'}" style="font-size:11px; padding:3px 8px; border-radius:6px; font-weight:700;">
              ${isOnline ? '💳 Online' : '💵 Cash (Offline)'}
            </span>
          </td>
          <td style="font-weight:700; color:var(--success);">₹${Number(item.amount || 0).toFixed(2)}</td>
          <td style="font-size:11px; color:var(--text-dark); max-width:200px; word-wrap:break-word;">${cleanNote || 'Counter Collection'}</td>
          <td style="text-align:center;">
            <button class="btn-danger" style="padding:3px 8px; font-size:11px; border-radius:6px; cursor:pointer;" onclick="deleteCollectionEntry('${item.id}')">🗑️ Delete</button>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div class="table-responsive" style="max-height:280px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
        <table class="custom-table" style="font-size:12px; margin:0;">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payment Mode</th>
              <th>Amount</th>
              <th>Note / Remark</th>
              <th style="text-align:center;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="text-align:center; color:var(--danger); padding:10px; font-size:12px;">Load error: ${e.message}</div>`;
  }
}

async function deleteCollectionEntry(id) {
  if (!id) return alert("Invalid ID");
  if (!confirm("Kya aap is Collection Entry ko delete karna chahte hain?")) return;

  const numId = Number(id);
  const searchId = !isNaN(numId) ? numId : id;

  let { error } = await db.from("Collections").delete().eq("id", searchId);

  if (error) {
    const { error: err2 } = await db.from("Collections").delete().eq("id", String(id));
    if (err2) {
      alert("Delete Error: " + (err2.message || error.message));
      return;
    }
  }

  alert("Collection Entry successfully delete ho gayi!");
  loadCounterCollectionHistory();
  calculateReports();
}

function getDateRange(type) {
  const today = new Date(), from = new Date(), to = new Date();
  if (type === 'today') from.setHours(0, 0, 0, 0);
  else if (type === 'week') from.setDate(today.getDate() - (today.getDay() || 7) + 1);
  else if (type === 'last_week') { from.setDate(today.getDate() - (today.getDay() || 7) - 6); to.setDate(today.getDate() - (today.getDay() || 7)); }
  else if (type === 'two_weeks' || type === 'last_2_weeks') from.setTime(today.getTime() - 14 * 86400000);
  else if (type === 'month') from.setDate(1);
  else if (type === 'year') { from.setMonth(0); from.setDate(1); }
  return { from, to };
}

function setDateFilter(type) {
  const { from, to } = getDateRange(type);
  document.getElementById("reportFromDate") && (document.getElementById("reportFromDate").value = from.toISOString().split('T')[0]);
  document.getElementById("reportToDate") && (document.getElementById("reportToDate").value = to.toISOString().split('T')[0]);
  calculateReports();
}

async function calculateReports() {
  const fromVal = document.getElementById("reportFromDate")?.value;
  const toVal = document.getElementById("reportToDate")?.value;
  if (!fromVal || !toVal) return alert("Sahi Dates Select Karein.");

  const fromDate = new Date(fromVal); fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(toVal); toDate.setHours(23, 59, 59, 999);

  const [{ data: sales }, { data: offlineData }] = await Promise.all([
    db.from("orders").select("*, order_items(*)").gte("created_at", fromDate.toISOString()).lte("created_at", toDate.toISOString()),
    db.from("Collections").select("*").gte("collection_date", fromVal).lte("collection_date", toVal)
  ]);

  let offlineTotal = 0, onlineTotal = 0, validOrderCount = 0;

  (sales || []).forEach(ord => {
    if (ord.status !== 'cancelled') {
      if (String(ord.order_id || '').startsWith("ORD-CNT-") && offlineData?.length) return;
      validOrderCount++;
      let itemsTotal = (ord.order_items || []).reduce((s, i) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
      if (itemsTotal === 0 && String(ord.address || '').includes("Amt: ₹")) itemsTotal = Number(ord.address.match(/Amt:\s*₹\s*([\d.]+)/)?.[1] || 0);
      const pMode = `${ord.customer_name || ''} ${ord.address || ''}`.toLowerCase();
      (pMode.includes('[mode:online]') || pMode.includes('online')) ? onlineTotal += itemsTotal : offlineTotal += itemsTotal;
    }
  });

  (offlineData || []).forEach(item => {
    validOrderCount++;
    const amt = Number(item.amount || 0);
    String(item.note || '').toLowerCase().includes('[mode:online]') ? onlineTotal += amt : offlineTotal += amt;
  });

  const grandTotal = offlineTotal + onlineTotal;
  document.getElementById("summaryOffline") && (document.getElementById("summaryOffline").textContent = "₹" + offlineTotal.toFixed(2));
  document.getElementById("summaryOnline") && (document.getElementById("summaryOnline").textContent = "₹" + onlineTotal.toFixed(2));
  document.getElementById("summaryTotalSales") && (document.getElementById("summaryTotalSales").textContent = "₹" + grandTotal.toFixed(2));

  const breakdownBody = document.getElementById("collectionBreakdownBody");
  if (breakdownBody) {
    breakdownBody.innerHTML = `
      <tr>
        <td><strong>${fromVal}</strong> to <strong>${toVal}</strong></td>
        <td style="color:var(--primary); font-weight:bold;">₹${offlineTotal.toFixed(2)}</td>
        <td style="color:var(--blue); font-weight:bold;">₹${onlineTotal.toFixed(2)}</td>
        <td style="color:var(--success); font-weight:bold;">₹${grandTotal.toFixed(2)}</td>
        <td style="font-weight:bold;">${validOrderCount} Entries/Orders</td>
      </tr>`;
  }
}

/* TOGGLES & STATUS */
const toggleMasterSupplierAddCard = (p = '') => { const c = document.getElementById(p + "masterSupplierAddCard"); if (c) { c.style.display = c.style.display === "none" || !c.style.display ? "block" : "none"; c.style.display === "block" && document.getElementById(p + "newSupplierInput")?.focus(); } };
const toggleMasterSupplierListCard = (p = '') => { const c = document.getElementById(p + "masterSupplierListCard"); if (c) c.style.display = c.style.display === "none" || !c.style.display ? "block" : "none"; };

async function toggleProductActiveStatus(prodId, newStatus) {
  const prod = productsList.find(p => String(p.id) === String(prodId));
  if (prod) prod.active = newStatus;
  renderProductsTable();
  const { error } = await db.from("products").update({ active: newStatus }).eq("id", prodId);
  if (error) { if (prod) prod.active = !newStatus; renderProductsTable(); alert("Status update fail: " + error.message); }
}

function setSupplierReportDateFilter(type) {
  const { from, to } = getDateRange(type);
  document.getElementById("supplierReportFromDate") && (document.getElementById("supplierReportFromDate").value = from.toISOString().split('T')[0]);
  document.getElementById("supplierReportToDate") && (document.getElementById("supplierReportToDate").value = to.toISOString().split('T')[0]);
  calculateSupplierPurchaseReport();
}

async function calculateSupplierPurchaseReport() {
  const [fromVal, toVal, supplierVal, statusVal] = [
    document.getElementById("supplierReportFromDate")?.value,
    document.getElementById("supplierReportToDate")?.value,
    document.getElementById("supplierReportSupplierSelect")?.value,
    document.getElementById("supplierReportStatusSelect")?.value
  ];
  if (!fromVal || !toVal) return alert("Sahi From aur To dates select karein.");

  const fromDate = new Date(fromVal); fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(toVal); toDate.setHours(23, 59, 59, 999);

  let query = db.from("purchase_orders").select("*").gte("created_at", fromDate.toISOString()).lte("created_at", toDate.toISOString()).order("created_at", { ascending: false });
  if (supplierVal) query = query.eq("supplier_name", supplierVal);
  if (statusVal) query = query.eq("status", statusVal);

  const { data: pos, error } = await query;
  if (error) return alert("Error fetching supplier report: " + error.message);

  const records = pos || [];
  const { data: allPoItems } = await db.from("purchase_order_items").select("*").in("po_id", records.map(p => p.id));
  const itemsMap = {};
  (allPoItems || []).forEach(it => { (itemsMap[String(it.po_id)] ||= []).push(it); });
  records.forEach(po => po.purchase_order_items = itemsMap[String(po.id)] || []);

  let grandTotal = 0, receivedAmount = 0, pendingAmount = 0;
  const supplierMap = {};

  records.forEach(po => {
    const amt = Number(po.total_amount || 0);
    grandTotal += amt;
    po.status === 'received' ? receivedAmount += amt : pendingAmount += amt;
    const s = supplierMap[po.supplier_name || 'Unknown'] ||= { ordersCount: 0, receivedBill: 0, pendingBill: 0, totalBill: 0 };
    s.ordersCount++; s.totalBill += amt;
    po.status === 'received' ? s.receivedBill += amt : s.pendingBill += amt;
  });

  document.getElementById("summarySupplierTotal") && (document.getElementById("summarySupplierTotal").textContent = "₹" + grandTotal.toFixed(2));
  document.getElementById("summarySupplierOrderCount") && (document.getElementById("summarySupplierOrderCount").textContent = records.length + " Orders");
  document.getElementById("summarySupplierReceived") && (document.getElementById("summarySupplierReceived").textContent = "₹" + receivedAmount.toFixed(2));
  document.getElementById("summarySupplierPending") && (document.getElementById("summarySupplierPending").textContent = "₹" + pendingAmount.toFixed(2));

  const tbody = document.getElementById("supplierSummaryTableBody");
  if (tbody) {
    tbody.innerHTML = Object.keys(supplierMap).length === 0 ? '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Selected dates me koi purchase order nahi mila.</td></tr>' :
      Object.entries(supplierMap).map(([s, d]) => `<tr><td><strong>${s}</strong></td><td>${d.ordersCount} Orders</td><td style="color:var(--success); font-weight:bold;">₹${d.receivedBill.toFixed(2)}</td><td style="color:var(--danger); font-weight:bold;">₹${d.pendingBill.toFixed(2)}</td><td style="color:var(--primary); font-weight:bold;">₹${d.totalBill.toFixed(2)}</td></tr>`).join('');
  }

  const detailDiv = document.getElementById("supplierDetailedOrdersList");
  if (detailDiv) {
    detailDiv.innerHTML = records.length === 0 ? '<div style="text-align:center; padding:15px; color:var(--text-muted);">Koi orders record nahi hai.</div>' :
      records.map(po => `
        <div class="order-card" style="margin-bottom:8px; padding:10px;">
          <div class="order-header" style="margin-bottom:4px; padding-bottom:4px;">
            <span><strong>${po.supplier_name}</strong> (${po.po_number || '#' + po.id})</span>
            <span class="badge ${po.status === 'received' ? 'badge-received' : 'badge-pending'}">${po.status}</span>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">📅 Date: ${formatTime(po.created_at)} ${po.received_at ? ` | Received: ${formatTime(po.received_at)}` : ''}</div>
          <div>${(po.purchase_order_items || []).map(it => `<div class="item-row" style="font-size:11px; padding:2px 0;"><span>• ${it.product_name} (Qty: ${it.quantity})</span><span>₹${Number(it.purchase_price).toFixed(2)}/unit = ₹${(Number(it.quantity) * Number(it.purchase_price)).toFixed(2)}</span></div>`).join('')}</div>
          <div style="text-align:right; margin-top:6px; font-weight:bold; font-size:12px; color:var(--text-dark);">Total Order Amount: ₹${Number(po.total_amount).toFixed(2)}</div>
        </div>`).join('');
  }
}

/* THEME */
function initTheme() {
  const savedTheme = localStorage.getItem("adminTheme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeButtonText(savedTheme);
}
function toggleTheme() {
  const next = (document.documentElement.getAttribute("data-theme") || "light") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("adminTheme", next);
  updateThemeButtonText(next);
}
const updateThemeButtonText = theme => { const b = document.getElementById("themeToggleBtn"); if (b) b.innerHTML = theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"; };

/* PRODUCTS LIST VIEW */
async function loadAllProductsView() {
  const tbody = document.getElementById("productsTableBody");
  if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">Products load ho rahe hain...</td></tr>';
  const { data, error } = await db.from("products").select("*").order("name");
  if (error && tbody) return tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--danger);">Error: ${error.message}</td></tr>`;

  productsList = data || [];
  if (document.getElementById("totalProductsCount")) document.getElementById("totalProductsCount").textContent = productsList.length;
  updateCategoryDropdown();
  renderProductsTable();
}

function updateCategoryDropdown() {
  const select = document.getElementById("bulkCategorySelect");
  if (!select) return;
  const categories = [...new Set(productsList.map(p => p.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="">-- All Categories --</option>' + categories.map(c => `<option value="${c}" ${c === select.value ? 'selected' : ''}>${c}</option>`).join('');
}

const enableRowEditing = prodId => { editingProductIds.add(String(prodId)); renderProductsTable(); };
const cancelRowEditing = prodId => { lastEditExitTimestamp = Date.now(); editingProductIds.delete(String(prodId)); renderProductsTable(); };

async function saveRowEditing(prodId) {
  const pIdStr = String(prodId);
  const getVal = id => document.getElementById(id)?.value.trim() || '';
  const [newName, newCategory, newUnit, newQty, newCost, newSelling] = [
    getVal(`edit_name_${pIdStr}`), getVal(`edit_cat_${pIdStr}`), getVal(`edit_unit_${pIdStr}`),
    Number(getVal(`edit_qty_${pIdStr}`)), Number(getVal(`edit_cost_${pIdStr}`)), Number(getVal(`edit_selling_${pIdStr}`))
  ];

  if (!newName) return alert("Item Name khali nahi ho sakta.");
  const updateData = { name: newName, category: newCategory, unit: newUnit, stock_qty: newQty, cost_price: newCost, selling_price: newSelling };
  const idCond = !isNaN(Number(prodId)) ? Number(prodId) : prodId;

  const { error } = await db.from("products").update(updateData).or(`id.eq.${idCond},id.eq.${String(prodId)}`);
  if (error) alert("Product update karne mein error aaya: " + error.message);
  else {
    const prod = productsList.find(p => String(p.id) === String(prodId));
    if (prod) Object.assign(prod, updateData);
    editingProductIds.delete(String(prodId));
    lastEditExitTimestamp = Date.now();
    updateCategoryDropdown(); renderProductsTable();
  }
}

function getPackCountFromUnit(unitStr) {
  if (!unitStr) return 1;
  const match = String(unitStr).trim().match(/(?:pack\s*of|pack|\/)\s*(\d+)/i) || String(unitStr).trim().match(/(\d+)\s*(?:pcs|pouch|pouches|pack|nos|items)/i) || String(unitStr).trim().match(/\((\d+)\)/);
  return match && match[1] && parseInt(match[1], 10) > 0 ? parseInt(match[1], 10) : 1;
}

function getProductSku(id, name) {
  const prod = productsList.find(p => String(p.id) === String(id));
  if (prod && prod.sku) return prod.sku;
  return name ? name.substring(0, 3).toUpperCase() + "-" + (String(id).slice(-3)) : "000";
}

function updateLiveUnitCost(prodId) {
  const pIdStr = String(prodId);
  const cost = Number(document.getElementById(`edit_cost_${pIdStr}`)?.value) || 0;
  const packCount = getPackCountFromUnit(document.getElementById(`edit_unit_${pIdStr}`)?.value);
  const liveSpan = document.getElementById(`edit_live_unit_cost_${pIdStr}`);
  if (liveSpan) liveSpan.textContent = `₹${(packCount > 0 ? cost / packCount : cost).toFixed(2)}`;
}

function renderProductsTable() {
  const tbody = document.getElementById("productsTableBody");
  if (!tbody) return;

  const searchVal = document.getElementById("adminProductSearchInput")?.value.toLowerCase().trim() || "";
  const selectedCategory = document.getElementById("bulkCategorySelect")?.value || "";

  const filtered = productsList.filter(p => {
    const matchesSearch = [p.id, p.name, p.category].some(f => String(f || '').toLowerCase().includes(searchVal));
    return matchesSearch && (!selectedCategory || p.category === selectedCategory);
  });

  if (!filtered.length) return tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">Koi product nahi mila.</td></tr>';

  tbody.innerHTML = filtered.map(p => {
    const isChecked = tickedProductsMap[p.id] ? 'checked' : '';
    const isEditing = editingProductIds.has(String(p.id));
    const qtyVal = p.stock_qty ?? 0;
    const isActive = p.active !== false;
    const statusBtn = isActive ?
      `<button class="btn-green" style="padding:4px 10px; font-size:11px; border-radius:12px; font-weight:700; cursor:pointer;" onclick="toggleProductActiveStatus('${p.id}', false)">👁️ Show</button>` :
      `<button class="btn-danger" style="padding:4px 10px; font-size:11px; border-radius:12px; font-weight:700; cursor:pointer;" onclick="toggleProductActiveStatus('${p.id}', true)">🙈 Hide</button>`;

    const packCount = getPackCountFromUnit(p.unit);
    const costPriceNum = Number(p.cost_price || 0);
    const unitCostNum = packCount > 0 ? (costPriceNum / packCount) : costPriceNum;
    const sellingPriceVal = Number(p.selling_price ?? p.price ?? 0).toFixed(2);
    const [escName, escCat, escUnit] = [p.name, p.category, p.unit].map(v => (v || '').replace(/"/g, '&quot;'));

    if (isEditing) {
      return `
        <tr style="background: rgba(79, 70, 229, 0.12); border-left: 4px solid var(--primary);">
          <td style="text-align:center;"><input type="checkbox" class="chk-box" ${isChecked} onchange="toggleProductSelection('${p.id}', this.checked)" /></td>
          <td><strong>${p.id}</strong></td>
          <td><input type="text" id="edit_name_${p.id}" class="name-edit-input" style="min-width:210px; width:100%; border-color:var(--primary); background:var(--surface); color:var(--text-dark);" value="${escName}" /></td>
          <td><input type="text" id="edit_cat_${p.id}" class="name-edit-input" style="min-width:120px; width:100%; border-color:var(--primary); background:var(--surface); color:var(--text-dark);" value="${escCat}" /></td>
          <td><input type="text" id="edit_unit_${p.id}" class="name-edit-input" style="min-width:90px; width:100%; text-align:center; border-color:var(--primary); background:var(--surface); color:var(--text-dark);" value="${escUnit}" oninput="updateLiveUnitCost('${p.id}')" /></td>
          <td><input type="text" inputmode="numeric" id="edit_qty_${p.id}" class="price-edit-input" style="width:60px; text-align:center; border-color:var(--primary); background:var(--surface); color:var(--text-dark);" value="${qtyVal}" onfocus="this.select()" /></td>
          <td><div style="display:flex; align-items:center; gap:2px;"><span style="font-size:11px; color:var(--text-muted);">₹</span><input type="text" inputmode="decimal" id="edit_cost_${p.id}" class="price-edit-input" style="width:70px; border-color:var(--primary); background:var(--surface); color:var(--blue);" value="${costPriceNum.toFixed(2)}" onfocus="this.select()" oninput="updateLiveUnitCost('${p.id}')" /></div></td>
          <td><span id="edit_live_unit_cost_${p.id}" style="color:#8b5cf6; font-weight:700; background:rgba(139,92,246,0.12); padding:4px 6px; border-radius:6px; font-size:11px;">₹${unitCostNum.toFixed(2)}</span></td>
          <td><div style="display:flex; align-items:center; gap:2px;"><span style="font-size:11px; color:var(--text-muted);">₹</span><input type="text" inputmode="decimal" id="edit_selling_${p.id}" class="price-edit-input" style="width:70px; border-color:var(--primary); background:var(--surface); color:var(--success);" value="${sellingPriceVal}" onfocus="this.select()" /></div></td>
          <td style="text-align:center;">${statusBtn}</td>
          <td style="text-align:center;"><div style="display:flex; gap:4px; justify-content:center;"><button class="btn-outline" style="padding:4px 8px; font-size:11px; border-radius:8px;" onclick="cancelRowEditing('${p.id}')">✕ Cancel</button><button class="btn-green" style="padding:4px 8px; font-size:8px; border-radius:8px;" onclick="saveRowEditing('${p.id}')">💾 Save</button></div></td>
        </tr>`;
    }

    return `
      <tr>
        <td style="text-align:center;"><input type="checkbox" class="chk-box" ${isChecked} onchange="toggleProductSelection('${p.id}', this.checked)" /></td>
        <td><strong>${p.id}</strong></td>
        <td><strong style="color:var(--text-dark); font-size:12px;">${escName || 'N/A'}</strong></td>
        <td><span style="color:var(--text-muted); font-weight:600;">${escCat || 'N/A'}</span></td>
        <td><span style="background:var(--bg); border:1px solid var(--border); padding:2px 8px; border-radius:10px; font-weight:600; font-size:11px;">${escUnit || '-'}</span></td>
        <td><strong style="color: ${qtyVal <= 5 ? 'var(--danger)' : 'var(--text-dark)'};">${qtyVal}</strong></td>
        <td><span style="color:var(--blue); font-weight:600;">₹${costPriceNum.toFixed(2)}</span></td>
        <td><span style="color:#8b5cf6; font-weight:700; background:rgba(139,92,246,0.12); padding:3px 8px; border-radius:8px; font-size:11px;">₹${unitCostNum.toFixed(2)}</span></td>
        <td><strong style="color:var(--success);">₹${sellingPriceVal}</strong></td>
        <td style="text-align:center;">${statusBtn}</td>
        <td style="text-align:center;"><div style="display:flex; gap:4px; justify-content:center;"><button class="btn-outline" style="padding:4px 8px; font-size:11px; border-radius:8px;" onclick="enableRowEditing('${p.id}')">✏️ Edit</button></div></td>
      </tr>`;
  }).join('');
}

async function deleteSingleProduct(prodId) {
  if (Date.now() - lastEditExitTimestamp < 500) return;
  const prod = productsList.find(p => String(p.id) === String(prodId));
  if (!confirm(`Kya aap Product '${prod ? prod.name : prodId}' ko Database se PERMANENT Delete karna chahte hain?`)) return;

  const idCond = !isNaN(Number(prodId)) ? Number(prodId) : prodId;
  const { error } = await db.from("products").delete().or(`id.eq.${idCond},id.eq.${String(prodId)}`);

  if (error) alert("Product delete karne mein error aaya: " + error.message);
  else {
    alert("Product Database se delete ho gaya!");
    productsList = productsList.filter(p => String(p.id) !== String(prodId));
    delete tickedProductsMap[prodId];
    renderTickedProductsList(); updateCategoryDropdown(); renderProductsTable();
    if (document.getElementById("totalProductsCount")) document.getElementById("totalProductsCount").textContent = productsList.length;
  }
}

async function deleteSelectedProducts() {
  const keys = Object.keys(tickedProductsMap);
  if (!keys.length) return alert("Kripya pehle kam se kam 1 product ko checkbox se tick karein.");
  if (!confirm(`⚠️ WARNING: Kya aap in ${keys.length} selected products ko PERMANENT Delete karna chahte hain?`)) return;

  const idsToDel = [];
  keys.forEach(k => { idsToDel.push(k); !isNaN(Number(k)) && idsToDel.push(Number(k)); idsToDel.push(String(k)); });

  const { error } = await db.from("products").delete().in("id", idsToDel);
  if (error) alert("Selected products delete karne mein error aaya: " + error.message);
  else {
    alert(`${keys.length} Products Database se successfully delete ho gaye!`);
    const delSet = new Set(keys.map(k => String(k)));
    productsList = productsList.filter(p => !delSet.has(String(p.id)));
    tickedProductsMap = {};
    renderTickedProductsList(); updateCategoryDropdown(); renderProductsTable();
    if (document.getElementById("totalProductsCount")) document.getElementById("totalProductsCount").textContent = productsList.length;
  }
}

function toggleProductSelection(prodId, isChecked) {
  const prod = productsList.find(p => String(p.id) === String(prodId));
  if (!prod) return;
  if (isChecked) {
    tickedProductsMap[prodId] = { product_id: prod.id, product_name: prod.name, quantity: 1, purchase_price: Number(prod.cost_price ?? prod.price ?? 0) };
  } else delete tickedProductsMap[prodId];
  renderTickedProductsList();
}

const openTickedCartModal = async () => {
  await loadSuppliers();
  const m = document.getElementById("tickedCartModal");
  if (m) m.style.display = "flex";
};
const closeTickedCartModal = () => { const m = document.getElementById("tickedCartModal"); if (m) m.style.display = "none"; };

function renderTickedProductsList() {
  const container = document.getElementById("selectedTickedList");
  const modalContainer = document.getElementById("modalTickedList");
  const floatingBar = document.getElementById("floatingTickedBar");
  const keys = Object.keys(tickedProductsMap);
  const count = keys.length;

  ['tickedCount', 'floatingTickedCount'].forEach(id => document.getElementById(id) && (document.getElementById(id).textContent = count));

  if (!count) {
    if (container) container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:8px; font-size:12px;">Niche list me se items par ☑️ Tick mark karein.</div>';
    if (modalContainer) modalContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:16px; font-size:12px;">No items ticked yet.</div>';
    ['tickedTotalBill', 'floatingTickedTotalBill', 'modalTickedTotalBill'].forEach(id => document.getElementById(id) && (document.getElementById(id).textContent = "0.00"));
    if (floatingBar) floatingBar.style.display = "none";
    closeTickedCartModal();
    return;
  }

  if (floatingBar) floatingBar.style.display = "flex";
  let total = 0;

  const htmlList = keys.map((k, idx) => {
    const item = tickedProductsMap[k];
    const prod = productsList.find(p => String(p.id) === String(k));
    const packCount = getPackCountFromUnit(prod?.unit);
    const packetCost = Number(item.purchase_price || prod?.cost_price || 0);
    const itemTotal = Number(item.quantity) * packetCost;
    total += itemTotal;

    return `
      <div class="item-row" style="flex-direction:column; align-items:stretch; gap:6px; padding:8px 10px; border-bottom:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="display:flex; gap:2px; align-items:center;">
              <button type="button" class="btn-outline" style="padding:1px 4px; font-size:10px; border-radius:4px; line-height:1;" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} onclick="moveTickedItem(${idx}, -1)" title="Move Up">⬆</button>
              <button type="button" class="btn-outline" style="padding:1px 4px; font-size:10px; border-radius:4px; line-height:1;" ${idx === Object.keys(tickedProductsMap).length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} onclick="moveTickedItem(${idx}, 1)" title="Move Down">⬇</button>
            </div>
            <div>
              <strong style="font-size:12px; color:var(--text-dark);">${item.product_name}</strong>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">📦 Packet Cost: <strong style="color:var(--blue);">₹<span id="ticked_packcost_${k}">${packetCost.toFixed(2)}</span></strong> ${prod?.unit ? `(${prod.unit})` : ''} ${packCount > 1 ? ` | <strong style="color:var(--success);">⚡ Each Pcs: ₹<span id="ticked_pcsrate_${k}">${(packetCost / packCount).toFixed(2)}</span> / pcs</strong>` : ''}</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;"><strong style="font-size:13px; color:var(--primary);" id="ticked_itemtotal_${k}">₹${itemTotal.toFixed(2)}</strong><button class="btn-danger" style="padding:3px 6px; border-radius:6px; font-size:11px;" onclick="toggleProductSelection('${k}', false); renderProductsTable();">✕</button></div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; background:var(--bg); padding:6px 10px; border-radius:8px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:4px;"><label style="font-size:10px; font-weight:700; color:var(--text-muted);">Qty:</label><input type="text" inputmode="numeric" id="ticked_qty_${k}" value="${item.quantity}" style="width:55px; padding:3px 6px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="updateTickedQtyAndTotal('${k}', 'qty', this.value)" /></div>
          <div style="display:flex; align-items:center; gap:4px;"><label style="font-size:10px; font-weight:700; color:var(--text-muted);">Rate (₹):</label><input type="text" inputmode="decimal" id="ticked_rate_${k}" value="${packetCost.toFixed(2)}" style="width:65px; padding:3px 6px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="updateTickedQtyAndTotal('${k}', 'rate', this.value)" /></div>
          <div style="display:flex; align-items:center; gap:4px;"><label style="font-size:10px; font-weight:700; color:var(--text-muted);">Total Price (₹):</label><input type="text" inputmode="decimal" id="ticked_total_${k}" value="${itemTotal.toFixed(2)}" style="width:85px; padding:3px 6px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="updateTickedQtyAndTotal('${k}', 'total', this.value)" /></div>
          <div style="font-size:10px; color:var(--text-muted);">⚡ Per Unit Rate: <strong style="color:var(--success);">₹<span id="ticked_unitrate_${k}">${packetCost.toFixed(2)}</span></strong></div>
        </div>
      </div>`;
  }).join('');

  if (container) container.innerHTML = htmlList;
  if (modalContainer) modalContainer.innerHTML = htmlList;
  ['tickedTotalBill', 'floatingTickedTotalBill', 'modalTickedTotalBill'].forEach(id => document.getElementById(id) && (document.getElementById(id).textContent = total.toFixed(2)));
}

function updateTickedQtyAndTotal(id, type, value) {
  if (!tickedProductsMap[id]) return;
  const prod = productsList.find(p => String(p.id) === String(id));
  const packCount = getPackCountFromUnit(prod?.unit);
  const numVal = parseFloat(value);
  const item = tickedProductsMap[id];

  if (type === 'qty') {
    const qty = (!isNaN(numVal) && numVal > 0) ? numVal : 1;
    item.quantity = qty;
    const rate = Number(item.purchase_price || 0);
    const total = qty * rate;

    document.querySelectorAll(`#ticked_total_${id}`).forEach(input => {
      if (document.activeElement !== input) input.value = total.toFixed(2);
    });
  } else if (type === 'rate') {
    const rate = (!isNaN(numVal) && numVal >= 0) ? numVal : 0;
    item.purchase_price = rate;
    const qty = Number(item.quantity || 1);
    const total = qty * rate;

    document.querySelectorAll(`#ticked_total_${id}`).forEach(input => {
      if (document.activeElement !== input) input.value = total.toFixed(2);
    });
  } else if (type === 'total') {
    const totalVal = (!isNaN(numVal) && numVal >= 0) ? numVal : 0;
    const qty = Number(item.quantity || 1);
    const rate = qty > 0 ? (totalVal / qty) : totalVal;
    item.purchase_price = rate;

    document.querySelectorAll(`#ticked_rate_${id}`).forEach(input => {
      if (document.activeElement !== input) input.value = rate.toFixed(2);
    });
  }

  const rate = Number(item.purchase_price || 0);
  const qty = Number(item.quantity || 1);
  const itemTotal = qty * rate;

  document.querySelectorAll(`#ticked_packcost_${id}`).forEach(el => el.textContent = rate.toFixed(2));
  document.querySelectorAll(`#ticked_unitrate_${id}`).forEach(el => el.textContent = rate.toFixed(2));
  document.querySelectorAll(`#ticked_itemtotal_${id}`).forEach(el => el.textContent = `₹${itemTotal.toFixed(2)}`);
  if (packCount > 1) {
    document.querySelectorAll(`#ticked_pcsrate_${id}`).forEach(el => el.textContent = (rate / packCount).toFixed(2));
  }

  let totalBill = 0;
  Object.keys(tickedProductsMap).forEach(k => {
    const it = tickedProductsMap[k];
    totalBill += (Number(it.quantity || 1) * Number(it.purchase_price || 0));
  });

  ['tickedTotalBill', 'floatingTickedTotalBill', 'modalTickedTotalBill'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = totalBill.toFixed(2);
  });
}

function togglePoRateCalc() { const box = document.getElementById("poRateCalcBox"); if (box) box.style.display = (box.style.display === "none" || !box.style.display) ? "block" : "none"; }
function updateTickedItem(id, field, value) { if (tickedProductsMap[id]) { tickedProductsMap[id][field] = Number(value) || 0; renderTickedProductsList(); } }
function clearAllSelection() { tickedProductsMap = {}; renderTickedProductsList(); renderProductsTable(); }

async function submitTickedReorder(sourceModal = false) {
  const supplierSelect = sourceModal ? document.getElementById("modalTickedSupplierSelect") : document.getElementById("tickedSupplierSelect");
  const supplier = supplierSelect ? supplierSelect.value : "";
  const buyerSelect = sourceModal ? document.getElementById("modalTickedBuyerSelect") : document.getElementById("poBuyerSelect");
  const buyerName = buyerSelect ? buyerSelect.value || "Akash sharma" : "Akash sharma";
  const keys = Object.keys(tickedProductsMap);

  if (!supplier) return alert("Supplier select karein.");
  if (keys.length === 0) return alert("Kam se kam 1 product par tick karein.");

  const poNumber = await generateNextPoNumber();
  const itemsList = keys.map(k => tickedProductsMap[k]);
  const totalAmount = itemsList.reduce((s, i) => s + (Number(i.quantity || 1) * Number(i.purchase_price || 0)), 0);

  const { data: po, error } = await db.from("purchase_orders").insert([{
    po_number: poNumber,
    supplier_name: supplier,
    total_amount: totalAmount,
    status: "pending"
  }]).select("id").single();

  if (error) return alert("Error: " + error.message);

  const dbItems = itemsList.map(i => ({
    po_id: po.id,
    product_id: (i.product_id && !isNaN(Number(i.product_id)) && Number(i.product_id) > 0) ? Number(i.product_id) : 0,
    product_name: i.product_name || 'Item',
    quantity: Math.round(Number(i.quantity) || 1),
    purchase_price: Number(i.purchase_price) || 0
  }));

  const { error: itemsErr } = await db.from("purchase_order_items").insert(dbItems);
  if (itemsErr) alert("Reorder Header saved, but items error: " + itemsErr.message);
  else {
    await ensureProductsLoaded();
    const sheetItems = dbItems.map((i, idx) => {
      const skuCode = getProductSku(i.product_id, i.product_name);
      const q = Number(i.quantity || 1);
      const cp = Number(i.purchase_price || 0);
      const isLast = (idx === dbItems.length - 1);
      return {
        indentNo: 101 + idx,
        sku: skuCode,
        name: i.product_name,
        quantity: q,
        costPack: cp > 0 ? cp.toFixed(2) : "0",
        cost_pack: cp > 0 ? cp.toFixed(2) : "0",
        supplier: supplier,
        location: supplier,
        person: buyerName,
        buyer: buyerName,
        price: (q * cp).toFixed(2),
        orderTotal: isLast ? totalAmount.toFixed(2) : ""
      };
    });

    syncOrderToGoogleSheet({
      targetSheet: "Admin Orders Indent",
      isPO: true,
      orderId: poNumber,
      orderType: "Supplier Reorder",
      partyName: supplier,
      buyer: buyerName,
      itemsArray: sheetItems,
      totalAmount: totalAmount,
      status: "pending",
      notes: "Ticked Reorder from Admin Dashboard"
    });
    alert(`Reorder ${poNumber} successfully save ho gaya! Bill: ₹${totalAmount.toFixed(2)}`);
  }

  clearAllSelection();
  ['tickedSupplierSelect', 'modalTickedSupplierSelect'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ""));
  closeTickedCartModal();
  loadPurchaseOrders();
}

const submitTickedReorderFromModal = () => submitTickedReorder(true);

/* SUPPLIERS MASTER */
async function loadSuppliers() {
  const { data } = await db.from("suppliers").select("*").order("name");
  suppliersList = data || [];

  const options = '<option value="">-- Select Supplier --</option>' + suppliersList.map(s => `<option value="${s.name}" data-phone="${s.phone || ''}">${s.name}${s.phone ? ` (${s.phone})` : ' (No No.)'}</option>`).join("");
  ['poSupplierSelect', 'editPoSupplierSelect', 'tickedSupplierSelect', 'modalTickedSupplierSelect'].forEach(id => document.getElementById(id) && (document.getElementById(id).innerHTML = options));

  if (document.getElementById("supplierReportSupplierSelect")) {
    document.getElementById("supplierReportSupplierSelect").innerHTML = '<option value="">-- All Suppliers --</option>' + suppliersList.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  }

  [document.getElementById("suppliersMasterList"), document.getElementById("prod_suppliersMasterList")].forEach(mc => {
    if (!mc) return;
    if (!suppliersList.length) return mc.innerHTML = "<div style='text-align:center; font-size:12px; color:var(--text-muted); padding:8px;'>Koi supplier added nahi hai.</div>";
    mc.innerHTML = suppliersList.map(s => {
      const cleanPhone = s.phone ? s.phone.replace(/[^0-9]/g, '') : '';
      return `
        <div class="item-row">
          <div><strong>${s.name}</strong>${s.phone ? `<br><small style="color:var(--text-muted);">📞 ${s.phone}</small>` : '<br><small style="color:var(--danger);">Phone Missing</small>'}</div>
          <div class="dropdown-wrapper">
            <button class="dropdown-btn" onclick="toggleDropdown(this)">⚡ Actions ▾</button>
            <div class="dropdown-menu">
              ${s.phone ? `
                <div class="dropdown-header">📞 Quick Contact</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:4px;">
                  <a href="tel:${s.phone}" class="dropdown-item" style="background:#eff6ff; color:#2563eb; justify-content:center; padding:6px 8px !important; border-radius:6px;">📞 Call</a>
                  <a href="https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(s.name)},%20price%20confirm%20karna%20tha." target="_blank" class="dropdown-item" style="background:#f0fdf4; color:#16a34a; justify-content:center; padding:6px 8px !important; border-radius:6px;">💬 WhatsApp</a>
                </div>
                <div class="dropdown-divider"></div>
              ` : ''}
              <div class="dropdown-header">⚡ Manage Supplier</div>
              <button class="dropdown-item" onclick="editSupplier(${s.id}, '${s.name}', '${s.phone || ''}')">✏️ Edit Supplier</button>
              <button class="dropdown-item" style="color:var(--danger);" onclick="deleteSupplier(${s.id})">🗑 Delete Supplier</button>
            </div>
          </div>
        </div>`;
    }).join("");
  });
}

function onSupplierChange() {
  const select = document.getElementById("poSupplierSelect");
  if (!select) return;
  const phone = select.options[select.selectedIndex]?.getAttribute("data-phone");
  const actionsDiv = document.getElementById("selectedSupplierActions");
  if (phone && actionsDiv) {
    actionsDiv.style.display = "flex"; actionsDiv.style.gap = "6px";
    actionsDiv.innerHTML = `<a href="tel:${phone}" class="dropdown-btn" style="text-decoration:none; color:white; background:var(--success);">📞 Call</a><a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(select.value)},%20items%20ka%20rate%20confirm%20karna%20tha." target="_blank" class="dropdown-btn" style="text-decoration:none; color:white; background:#25d366;">💬 WhatsApp Rate Query</a>`;
  } else if (actionsDiv) actionsDiv.style.display = "none";
}

async function addNewSupplierMaster(prefix = '') {
  const nameInput = document.getElementById(prefix + "newSupplierInput") || document.getElementById("newSupplierInput");
  const phoneInput = document.getElementById(prefix + "newSupplierPhone") || document.getElementById("newSupplierPhone");
  const name = nameInput?.value.trim();
  const phone = phoneInput?.value.trim();
  if (!name) return alert("Supplier ka naam likhein.");

  const { error } = await db.from("suppliers").insert([{ name, phone: phone || null }]);
  if (error) alert("Error: " + error.message);
  else {
    alert("Supplier Successfully Add Ho Gaya!");
    [nameInput, phoneInput, document.getElementById("newSupplierInput"), document.getElementById("newSupplierPhone")].forEach(inp => inp && (inp.value = ""));
    loadSuppliers();
  }
}

function toggleAddNewProductCard() {
  const card = document.getElementById("addNewProductCard");
  if (!card) return;
  card.style.display = card.style.display === "none" || !card.style.display ? "block" : "none";
  if (card.style.display === "block") {
    document.getElementById("existingCategoriesList").innerHTML = [...new Set(productsList.map(p => p.category).filter(Boolean))].map(c => `<option value="${c}">`).join('');
    document.getElementById("newProdName")?.focus();
  }
}

async function saveNewProductToDb() {
  const name = document.getElementById("newProdName")?.value.trim();
  const category = document.getElementById("newProdCategory")?.value.trim();
  if (!name || !category) return alert("Product Name aur Category likhna zaroori hai.");

  const customId = `${name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'PRD')}-${Math.floor(100 + Math.random() * 900)}`;
  const newProductObj = {
    id: customId, name, category,
    unit: document.getElementById("newProdUnit")?.value || "",
    cost_price: Number(document.getElementById("newProdCostPrice")?.value) || 0,
    selling_price: Number(document.getElementById("newProdSellingPrice")?.value) || 0,
    stock_qty: Number(document.getElementById("newProdStockQty")?.value) || 0,
    active: true
  };

  const img = document.getElementById("newProdImageUrl")?.value.trim();
  if (img) newProductObj.image_url = img;

  let { error } = await db.from("products").insert([newProductObj]);
  if (error?.message?.includes("image_url")) { delete newProductObj.image_url; ({ error } = await db.from("products").insert([newProductObj])); }

  if (error) alert("Product Save Error: " + error.message);
  else {
    alert(`Product '${name}' Database me successfully Add ho gaya!`);
    ['newProdName', 'newProdCategory', 'newProdCostPrice', 'newProdSellingPrice', 'newProdImageUrl'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ""));
    document.getElementById("newProdStockQty") && (document.getElementById("newProdStockQty").value = "10");
    toggleAddNewProductCard(); loadAllProductsView();
  }
}

async function editSupplier(id, oldName, oldPhone) {
  const newName = prompt("Supplier ka naya naam:", oldName); if (newName === null) return;
  const newPhone = prompt("Supplier ka naya phone number:", oldPhone); if (newPhone === null) return;
  if (!newName.trim()) return alert("Supplier ka naam khaali nahi ho sakta.");

  const { error } = await db.from("suppliers").update({ name: newName.trim(), phone: newPhone.trim() || null }).eq("id", id);
  if (error) alert("Update error: " + error.message); else { alert("Supplier Update ho gaya!"); loadSuppliers(); }
}

async function deleteSupplier(id) {
  if (!confirm("Kya aap sach mein is supplier ko delete karna chahte hain?")) return;
  const { error } = await db.from("suppliers").delete().eq("id", id);
  if (error) alert("Error: " + error.message); else { alert("Supplier Delete ho gaya!"); loadSuppliers(); }
}

function setReinvestmentDateFilter(type) {
  const { from, to } = getDateRange(type);
  document.getElementById("reinvestmentFromDate") && (document.getElementById("reinvestmentFromDate").value = from.toISOString().split('T')[0]);
  document.getElementById("reinvestmentToDate") && (document.getElementById("reinvestmentToDate").value = to.toISOString().split('T')[0]);
  calculateWeeklyReinvestmentComparison();
}

async function executeCategoryBulkAction(action) {
  if (!action) return;
  const category = document.getElementById("bulkCategorySelect")?.value;
  const actionSelect = document.getElementById("bulkCategoryActionSelect");
  if (!category) { alert("Kripya pehle Category select karein."); if (actionSelect) actionSelect.value = ""; return; }

  if (action === 'delete_category') {
    const catProds = productsList.filter(p => p.category === category);
    if (!confirm(`⚠️ WARNING: Kya aap Category '${category}' ke SABHI ${catProds.length} products ko PERMANENT Delete karna chahte hain?`)) { if (actionSelect) actionSelect.value = ""; return; }
    const { error } = await db.from("products").delete().eq("category", category);
    if (error) alert("Category delete error: " + error.message);
    else { alert(`Category '${category}' ke sabhi products delete ho gaye!`); loadAllProductsView(); }
  } else {
    const newStatus = action === 'show';
    if (!confirm(`Kya aap Category '${category}' ke SABHI products ko ${newStatus ? 'SHOW' : 'HIDE'} karna chahte hain?`)) { if (actionSelect) actionSelect.value = ""; return; }
    const { error } = await db.from("products").update({ active: newStatus }).eq("category", category);
    if (error) alert("Category update error: " + error.message);
    else { productsList.forEach(p => p.category === category && (p.active = newStatus)); renderProductsTable(); }
  }
  if (actionSelect) actionSelect.value = "";
}

/* REINVESTMENT COMPARISON */
async function calculateWeeklyReinvestmentComparison() {
  const container = document.getElementById("reinvestmentComparisonContainer");
  if (!container) return;
  container.innerHTML = "<div style='text-align:center; padding:15px; color:var(--text-muted);'>Calculating Comparison...</div>";

  try {
    let [fromVal, toVal] = [document.getElementById("reinvestmentFromDate")?.value, document.getElementById("reinvestmentToDate")?.value];
    if (!fromVal || !toVal) {
      const { from, to } = getDateRange('week');
      fromVal = from.toISOString().split('T')[0]; toVal = to.toISOString().split('T')[0];
      document.getElementById("reinvestmentFromDate") && (document.getElementById("reinvestmentFromDate").value = fromVal);
      document.getElementById("reinvestmentToDate") && (document.getElementById("reinvestmentToDate").value = toVal);
    }

    const fromDate = new Date(fromVal); fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(toVal); toDate.setHours(23, 59, 59, 999);

    const [{ data: sales }, { data: offlineData }, { data: purchases }] = await Promise.all([
      db.from("orders").select("*, order_items(*)").gte("created_at", fromDate.toISOString()).lte("created_at", toDate.toISOString()),
      db.from("Collections").select("*").gte("collection_date", fromVal).lte("collection_date", toVal),
      db.from("purchase_orders").select("*").gte("created_at", fromDate.toISOString()).lte("created_at", toDate.toISOString())
    ]);

    let totalCollection = (offlineData || []).reduce((s, i) => s + Number(i.amount || 0), 0);
    (sales || []).forEach(ord => {
      if (ord.status !== 'cancelled') {
        if (String(ord.order_id || '').startsWith("ORD-CNT-") && offlineData?.length) return;
        let amt = (ord.order_items || []).reduce((s, i) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
        if (amt === 0 && String(ord.address || '').includes("Amt: ₹")) amt = Number(ord.address.match(/Amt:\s*₹\s*([\d.]+)/)?.[1] || 0);
        totalCollection += amt;
      }
    });

    const totalPurchase = (purchases || []).reduce((s, po) => po.status !== 'cancelled' ? s + Number(po.total_amount || 0) : s, 0);
    const diff = totalCollection - totalPurchase;
    const maxVal = Math.max(100, totalCollection, totalPurchase);
    const collHeight = Math.min(100, Math.max(8, Math.round((totalCollection / maxVal) * 100)));
    const purHeight = Math.min(100, Math.max(8, Math.round((totalPurchase / maxVal) * 100)));

    let recHTML = diff > 0 ?
      `<div style="background:var(--calc-bg); border:1px solid var(--calc-border); padding:12px; border-radius:10px; margin-bottom:12px;"><div style="font-weight:bold; color:var(--success); font-size:13px; margin-bottom:4px;">🟢 Cash Surplus: ₹${diff.toFixed(2)}</div><div style="font-size:12px; color:var(--text-dark);">Collection ₹${totalCollection.toFixed(2)} | Reinvestment ₹${totalPurchase.toFixed(2)}.<br>💡 Next week में <strong>₹${diff.toFixed(2)} extra invest karna recommended hai!</strong></div></div>` :
      (diff < 0 ? `<div style="background:#fff1f2; border:1px solid #fecdd3; padding:12px; border-radius:10px; margin-bottom:12px;"><div style="font-weight:bold; color:var(--danger); font-size:13px; margin-bottom:4px;">⚠️ Over-Investment: ₹${Math.abs(diff).toFixed(2)}</div><div style="font-size:12px; color:#881337;">Reinvestment (₹${totalPurchase.toFixed(2)}) Collection (₹${totalCollection.toFixed(2)}) se ₹${Math.abs(diff).toFixed(2)} zyada hai.</div></div>` :
        `<div style="background:var(--calc-bg); border:1px solid var(--calc-border); padding:12px; border-radius:10px; margin-bottom:12px;"><div style="font-weight:bold; color:var(--blue); font-size:13px; margin-bottom:4px;">⚖️ Balanced Reinvestment</div><div style="font-size:12px; color:var(--text-dark);">Collection aur Reinvestment 100% matched hai.</div></div>`);

    container.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;" class="reinvest-grid">
        <div>${recHTML}<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;"><div style="background:var(--surface); border:1px solid var(--border); padding:10px; border-radius:8px;"><small style="color:var(--text-muted); font-size:10px; font-weight:700;">TOTAL COLLECTION</small><strong style="color:var(--success); font-size:16px; display:block;">₹${totalCollection.toFixed(2)}</strong></div><div style="background:var(--surface); border:1px solid var(--border); padding:10px; border-radius:8px;"><small style="color:var(--text-muted); font-size:10px; font-weight:700;">TOTAL REINVESTMENT</small><strong style="color:var(--blue); font-size:16px; display:block;">₹${totalPurchase.toFixed(2)}</strong></div></div></div>
        <div style="background:var(--surface); border:1px solid var(--border); padding:14px; border-radius:12px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"><h4 style="margin:0; font-size:12px; color:var(--text-dark);">📊 Comparison Chart</h4><div style="font-size:10px; display:flex; gap:8px;"><span style="color:var(--success); font-weight:bold;">🟢 Collection</span><span style="color:var(--blue); font-weight:bold;">🔵 Purchase</span></div></div><div style="display:flex; justify-content:space-around; align-items:flex-end; height:180px; padding:10px 0 0 0; border-bottom:2px solid var(--border); gap:16px;"><div style="display:flex; flex-direction:column; align-items:center; width:45%; height:100%; justify-content:flex-end;"><span style="font-size:10px; font-weight:bold; color:var(--success); margin-bottom:4px;">₹${totalCollection.toFixed(0)}</span><div style="width:100%; max-width:55px; background:var(--success); height:${collHeight}%; border-radius:6px 6px 0 0; min-height:8px;"></div></div><div style="display:flex; flex-direction:column; align-items:center; width:45%; height:100%; justify-content:flex-end;"><span style="font-size:10px; font-weight:bold; color:var(--blue); margin-bottom:4px;">₹${totalPurchase.toFixed(0)}</span><div style="width:100%; max-width:55px; background:var(--blue); height:${purHeight}%; border-radius:6px 6px 0 0; min-height:8px;"></div></div></div><div style="display:flex; justify-content:space-around; text-align:center; font-size:10px; font-weight:bold; color:var(--text-muted); margin-top:6px;"><span style="width:45%;">Collection</span><span style="width:45%;">Purchase</span></div></div>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div style='color:var(--danger); padding:10px;'>Error: ${err.message}</div>`;
  }
}

/* DRAG & DROP AND ITEM REORDERING HELPERS */
function reorderArrayItem(arr, fromIdx, toIdx) {
  if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length || fromIdx === toIdx) return;
  const item = arr.splice(fromIdx, 1)[0];
  arr.splice(toIdx, 0, item);
}

let draggedEditIdx = null;
function onEditCartDragStart(e, idx) {
  draggedEditIdx = idx;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", idx);
  e.currentTarget.classList.add("dragging");
}
function onEditCartDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
function onEditCartDrop(e, targetIdx) {
  e.preventDefault();
  if (draggedEditIdx !== null && draggedEditIdx !== targetIdx) {
    reorderArrayItem(editPoCart, draggedEditIdx, targetIdx);
    renderEditPoCart();
  }
}
function onEditCartDragEnd(e) {
  draggedEditIdx = null;
  document.querySelectorAll("#editPoCartItems .item-row").forEach(el => el.classList.remove("dragging"));
}
function moveEditCartItem(idx, dir) {
  const target = idx + dir;
  if (target >= 0 && target < editPoCart.length) {
    reorderArrayItem(editPoCart, idx, target);
    renderEditPoCart();
  }
}

let draggedPoIdx = null;
function onPoCartDragStart(e, idx) {
  draggedPoIdx = idx;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", idx);
  e.currentTarget.classList.add("dragging");
}
function onPoCartDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
function onPoCartDrop(e, targetIdx) {
  e.preventDefault();
  if (draggedPoIdx !== null && draggedPoIdx !== targetIdx) {
    reorderArrayItem(poCart, draggedPoIdx, targetIdx);
    renderPoCart();
  }
}
function onPoCartDragEnd(e) {
  draggedPoIdx = null;
  document.querySelectorAll("#poCartItems .item-row").forEach(el => el.classList.remove("dragging"));
}
function movePoCartItem(idx, dir) {
  const target = idx + dir;
  if (target >= 0 && target < poCart.length) {
    reorderArrayItem(poCart, idx, target);
    renderPoCart();
  }
}

function moveTickedItem(idx, dir) {
  const keys = Object.keys(tickedProductsMap);
  const target = idx + dir;
  if (target >= 0 && target < keys.length) {
    const entries = Object.entries(tickedProductsMap);
    const item = entries.splice(idx, 1)[0];
    entries.splice(target, 0, item);
    tickedProductsMap = Object.fromEntries(entries);
    renderTickedProductsList();
  }
}

/* REORDERS / PURCHASE ORDERS HANDLING */
async function loadProductsForReorder() {
  if (!productsList.length) {
    const { data } = await db.from("products").select("*").order("name");
    productsList = data || [];
  }
  setupProductSearch("poProductSearch", "poSearchResults", "selectedProductId", "poPrice");
  setupProductSearch("editPoProductSearch", "editPoSearchResults", "editSelectedProductId", "editPoPrice");
}

function getProductSku(productId, productName) {
  const pIdNum = Number(productId || 0);
  const pName = String(productName || '').trim();

  let prod = null;
  if (pIdNum > 0) {
    prod = productsList.find(p => String(p.id) === String(pIdNum));
  }
  if (!prod && pName) {
    const lowerName = pName.toLowerCase();
    prod = productsList.find(p => (p.name || '').toLowerCase() === lowerName) ||
      productsList.find(p => (p.name || '').toLowerCase().includes(lowerName)) ||
      productsList.find(p => lowerName.includes((p.name || '').toLowerCase()));
  }

  let clean = "";
  if (prod) {
    const rawSku = prod.sku || prod.sku_code || prod.skucode || prod.barcode || prod.code || prod.product_code || prod.sku_id;
    if (rawSku && String(rawSku).trim() !== "" && String(rawSku).trim() !== "0" && String(rawSku).trim() !== "null" && String(rawSku).trim() !== "undefined") {
      clean = String(rawSku).trim().replace(/^SKU-/i, '');
    }
  }

  if (!clean) {
    const targetName = prod?.name || pName || 'PROD';
    const targetId = prod?.id || pIdNum || 1;

    const prefix = targetName.substring(0, 3).toUpperCase();
    const numStr = String(targetId).padStart(5, '0');
    clean = `${prefix}-${numStr}`;
  }

  clean = clean.replace(/^([A-Z0-9]{2,4}-)\1/gi, '$1');
  return clean;
}

async function ensureProductsLoaded() {
  if (!productsList.length) {
    await loadProductsForReorder();
  }
}

function setupProductSearch(inputId, resultsId, hiddenId, priceInputId) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;

  const renderDropdown = async () => {
    await ensureProductsLoaded();
    const val = input.value.toLowerCase().trim();
    const matches = productsList.filter(p => !val || [p.name, p.category, p.id].some(f => String(f || '').toLowerCase().includes(val))).slice(0, 15);
    if (!matches.length) { results.style.display = "none"; return; }

    results.innerHTML = matches.map(p => `
      <div class="search-results-item" style="padding:8px 10px; cursor:pointer; border-bottom:1px solid var(--border);" onclick="selectSearchProduct('${p.id}', '${(p.name || '').replace(/'/g, "\\'")}', '${p.cost_price || p.price || 0}', '${inputId}', '${resultsId}', '${hiddenId}', '${priceInputId}')">
        <strong>${p.name}</strong> <small style="color:var(--text-muted);">(${p.category || 'Item'}) - Rate: ₹${Number(p.cost_price || p.price || 0).toFixed(2)}</small>
      </div>`).join('');
    results.style.display = "block";
  };

  input.addEventListener("input", renderDropdown);
  input.addEventListener("focus", renderDropdown);
}

function selectSearchProduct(id, name, price, inputId, resultsId, hiddenId, priceInputId) {
  document.getElementById(inputId) && (document.getElementById(inputId).value = name);
  document.getElementById(hiddenId) && (document.getElementById(hiddenId).value = id);
  document.getElementById(priceInputId) && (document.getElementById(priceInputId).value = Number(price).toFixed(2));
  document.getElementById(resultsId) && (document.getElementById(resultsId).style.display = "none");
}

function togglePoRateCalc(p = '') {
  const box = document.getElementById(p + "poRateCalcBox");
  if (box) box.style.display = box.style.display === "none" || !box.style.display ? "block" : "none";
}

function updatePoPacketRateCalc(p = '') {
  const qty = Number(document.getElementById(p + "poQty")?.value || 1);
  const price = Number(document.getElementById(p + "poPrice")?.value || 0);
  const badge = document.getElementById(p + "poPacketRateHelperBadge");
  if (!badge) return;

  if (qty > 0 && price > 0) {
    const eachPrice = (price / qty).toFixed(2);
    badge.innerHTML = `<span style="font-size:12px; font-weight:bold; color:var(--primary);">💡 1 Unit / Piece Rate: ₹${eachPrice}</span> <small style="color:var(--text-muted);">(Total Bill ₹${price} ÷ ${qty} Qty)</small>`;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }
}

function addPoItem() {
  let prodId = document.getElementById("selectedProductId")?.value;
  const searchInput = document.getElementById("poProductSearch");
  const typedText = searchInput?.value.trim() || "";
  const qty = Number(document.getElementById("poQty")?.value);
  const price = Number(document.getElementById("poPrice")?.value);
  let prodName = "";

  if (prodId) prodName = productsList.find(p => String(p.id) === String(prodId))?.name || typedText;
  else if (typedText) {
    const matched = productsList.find(p => (p.name || '').toLowerCase() === typedText.toLowerCase()) || productsList.find(p => (p.name || '').toLowerCase().includes(typedText.toLowerCase()));
    if (matched) { prodId = matched.id; prodName = matched.name; }
    else { prodId = 'custom_' + Date.now(); prodName = typedText; }
  }

  if (!prodName) return alert("Pehle Product select karein.");
  if (qty <= 0 || isNaN(qty)) return alert("Sahi Qty dalein.");
  if (isNaN(price) || price < 0) return alert("Sahi Rate dalein.");

  poCart.push({ product_id: prodId ? String(prodId) : null, product_name: prodName, quantity: qty, purchase_price: price });
  document.getElementById("poProductSearch") && (document.getElementById("poProductSearch").value = "");
  document.getElementById("selectedProductId") && (document.getElementById("selectedProductId").value = "");
  document.getElementById("poPrice") && (document.getElementById("poPrice").value = "");
  document.getElementById("poQty") && (document.getElementById("poQty").value = "1");
  document.getElementById("poPacketRateHelperBadge") && (document.getElementById("poPacketRateHelperBadge").style.display = "none");
  renderPoCart();
}

function addItemToPoCart() {
  addPoItem();
}

function updatePoCartTotal() {
  let total = 0;
  poCart.forEach((item, idx) => {
    const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
    total += itemTotal;
    const el = document.getElementById(`poItemTotal_${idx}`);
    if (el) el.textContent = `₹${itemTotal.toFixed(2)}`;
  });
  const totalEl = document.getElementById("poTotalBill");
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

function renderPoCart() {
  const container = document.getElementById("poCartItems");
  if (!container) return;
  let total = 0;

  if (!poCart.length) {
    container.innerHTML = '<div style="text-align:center; padding:8px; font-size:12px; color:var(--text-muted);">Koi item nahi hai. Niche se item add karein.</div>';
    document.getElementById("poTotalBill") && (document.getElementById("poTotalBill").textContent = "0.00");
    return;
  }

  container.innerHTML = poCart.map((item, idx) => {
    const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
    total += itemTotal;
    return `
      <div class="item-row" draggable="true" ondragstart="onPoCartDragStart(event, ${idx})" ondragover="onPoCartDragOver(event)" ondrop="onPoCartDrop(event, ${idx})" ondragend="onPoCartDragEnd(event)" style="padding:8px; border-bottom:1px solid var(--border); background:var(--surface); border-radius:8px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
          <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
            <span class="drag-handle" title="Drag to reorder" style="cursor:grab; font-size:14px; color:var(--text-muted); padding:2px 4px; user-select:none;">⠿</span>
            <div style="display:flex; gap:2px;">
              <button type="button" class="btn-outline" style="padding:1px 4px; font-size:10px; border-radius:4px; line-height:1;" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} onclick="movePoCartItem(${idx}, -1)" title="Move Top / Up">⬆</button>
              <button type="button" class="btn-outline" style="padding:1px 4px; font-size:10px; border-radius:4px; line-height:1;" ${idx === poCart.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} onclick="movePoCartItem(${idx}, 1)" title="Move Bottom / Down">⬇</button>
            </div>
          </div>
          <div style="flex:1;">
            <strong style="font-size:12px; color:var(--text-dark);">${item.product_name}</strong>
            <div style="display:flex; gap:6px; margin-top:4px; align-items:center;">
              <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Qty:</label><input type="text" inputmode="numeric" value="${item.quantity}" style="width:55px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="poCart[${idx}].quantity = Number(this.value)||1; updatePoCartTotal();" />
              <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Rate:</label><input type="text" inputmode="decimal" value="${item.purchase_price}" style="width:70px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="poCart[${idx}].purchase_price = Number(this.value)||0; updatePoCartTotal();" />
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong id="poItemTotal_${idx}" style="font-size:13px; color:var(--success);">₹${itemTotal.toFixed(2)}</strong>
          <button type="button" class="btn-danger" style="padding:3px 6px; border-radius:6px; font-size:11px;" onclick="poCart.splice(${idx}, 1); renderPoCart();" title="Delete item">✕</button>
        </div>
      </div>`;
  }).join("");

  document.getElementById("poTotalBill") && (document.getElementById("poTotalBill").textContent = total.toFixed(2));
}

async function submitPurchaseOrder() {
  const select = document.getElementById("poSupplierSelect");
  const supplier = select ? select.value : "";
  const buyerSelect = document.getElementById("poBuyerSelect");
  const buyerName = buyerSelect ? buyerSelect.value || "Akash sharma" : "Akash sharma";

  if (!supplier) return alert("Supplier select karein.");
  if (!poCart.length) return alert("Order me kam se kam 1 item add karein.");

  const totalAmount = poCart.reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.purchase_price) || 0)), 0);
  const poNumber = await generateNextPoNumber();

  const { data: po, error } = await db.from("purchase_orders").insert([{ po_number: poNumber, supplier_name: supplier, total_amount: totalAmount, status: "pending" }]).select("id").single();
  if (error) return alert("Order Header save error: " + error.message);

  const items = poCart.map(i => ({
    po_id: po.id,
    product_id: (i.product_id && !isNaN(Number(i.product_id)) && Number(i.product_id) > 0) ? Number(i.product_id) : 0,
    product_name: i.product_name,
    quantity: Math.round(Number(i.quantity) || 1),
    purchase_price: Number(i.purchase_price) || 0
  }));
  const { error: itemsErr } = await db.from("purchase_order_items").insert(items);
  if (itemsErr) alert("Reorder Header saved, but items error: " + itemsErr.message);
  else {
    await ensureProductsLoaded();
    const sheetItems = items.map((i, idx) => {
      const skuCode = getProductSku(i.product_id, i.product_name);
      const q = Number(i.quantity || 1);
      const cp = Number(i.purchase_price || 0);
      const isLast = (idx === items.length - 1);
      return {
        indentNo: 101 + idx,
        sku: skuCode,
        name: i.product_name,
        quantity: q,
        costPack: cp > 0 ? cp.toFixed(2) : "0",
        cost_pack: cp > 0 ? cp.toFixed(2) : "0",
        supplier: supplier,
        location: supplier,
        person: buyerName,
        buyer: buyerName,
        price: (q * cp).toFixed(2),
        orderTotal: isLast ? totalAmount.toFixed(2) : ""
      };
    });

    syncOrderToGoogleSheet({
      targetSheet: "Admin Orders Indent",
      isPO: true,
      orderId: poNumber,
      orderType: "Supplier Reorder",
      partyName: supplier,
      buyer: buyerName,
      itemsArray: sheetItems,
      totalAmount: totalAmount,
      status: "pending",
      notes: "Direct Reorder from Admin Dashboard"
    });
    alert(`Reorder ${poNumber} submit ho gaya! Bill: ₹${totalAmount.toFixed(2)}`);
  }

  poCart = [];
  if (select) select.value = "";
  ['poProductSearch', 'selectedProductId', 'poPrice'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ""));
  document.getElementById("selectedSupplierActions") && (document.getElementById("selectedSupplierActions").style.display = "none");
  renderPoCart(); loadPurchaseOrders();
}

async function cancelPurchaseOrder(poId) {
  if (!confirm("Kya aap is Supplier Reorder ko Cancel karna chahte hain?\nOrder Status 'CANCELLED' ho jayega.")) return;
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { error } = await db.from("purchase_orders").update({ status: "cancelled" }).or(`id.eq.${idCond},id.eq.${String(poId)},po_number.eq.${String(poId)}`);
  if (error) alert("Order cancel karne me error: " + error.message);
  else {
    alert("Reorder successfully Cancel ho gaya!");
    loadPurchaseOrders();
  }
}

async function generateNextPoNumber() {
  try {
    const { data: pos } = await db.from("purchase_orders").select("po_number, id").order("id", { ascending: false }).limit(100);
    let maxSeq = 1000;
    if (pos && pos.length) {
      pos.forEach(p => {
        if (p.po_number && p.po_number.startsWith("PO-")) {
          const numStr = p.po_number.replace(/^PO-/, "").trim();
          const num = parseInt(numStr, 10);
          if (!isNaN(num) && num < 1000000 && num > maxSeq) {
            maxSeq = num;
          }
        }
      });
    }
    return "PO-" + (maxSeq + 1);
  } catch (e) {
    return "PO-" + (1000 + Math.floor(Math.random() * 900));
  }
}

async function changePoSupplier(poId) {
  await loadSuppliers();
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("supplier_name").or(`id.eq.${idCond},id.eq.${String(poId)}`).single();
  if (!po) return alert("Order nahi mila.");

  const currentSupplier = po.supplier_name || '';
  const supplierNames = suppliersList.map(s => s.name);
  if (!supplierNames.length) return alert("Koi supplier available nahi hai.");

  const chosen = prompt(`Naya Supplier Name chunein:\n\nAvailable Suppliers:\n${supplierNames.join("\n")}`, currentSupplier);
  if (!chosen || chosen.trim() === "" || chosen.trim() === currentSupplier) return;

  const newSupplierName = chosen.trim();
  const { error } = await db.from("purchase_orders").update({ supplier_name: newSupplierName }).or(`id.eq.${idCond},id.eq.${String(poId)}`);
  if (error) alert("Supplier change error: " + error.message);
  else {
    alert(`Supplier Name badal kar "${newSupplierName}" kar diya gaya hai!`);
    loadPurchaseOrders();
  }
}

async function changePoNumber(poId) {
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("po_number").or(`id.eq.${idCond},id.eq.${String(poId)}`).single();
  if (!po) return alert("Order nahi mila.");

  const defaultNext = await generateNextPoNumber();
  const newPoNum = prompt(`PO Number change / update karein:`, po.po_number || defaultNext);
  if (!newPoNum || newPoNum.trim() === "" || newPoNum.trim() === po.po_number) return;

  const cleanNum = newPoNum.trim();
  const { error } = await db.from("purchase_orders").update({ po_number: cleanNum }).or(`id.eq.${idCond},id.eq.${String(poId)}`);
  if (error) alert("PO Number update error: " + error.message);
  else {
    alert(`PO Number badal kar "${cleanNum}" kar diya gaya hai!`);
    loadPurchaseOrders();
  }
}

async function deletePurchaseOrder(poId) {
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("po_number").or(`id.eq.${idCond},id.eq.${String(poId)}`).single();
  const poNum = po?.po_number || (typeof poId === 'string' && poId.startsWith('PO-') ? poId : `PO-${poId}`);

  await db.from("purchase_order_items").delete().or(`po_id.eq.${idCond},po_id.eq.${String(poId)}`);
  const { error } = await db.from("purchase_orders").delete().or(`id.eq.${idCond},id.eq.${String(poId)}`);
  if (error) alert("Delete error: " + error.message);
  else {
    syncOrderToGoogleSheet({
      action: "delete",
      targetSheet: "Admin Orders Indent",
      orderId: poNum
    });
    alert(`Order ${poNum} Database aur Google Sheet dono se remove ho gaya!`);
    loadPurchaseOrders();
  }
}

async function loadPurchaseOrders() {
  const container = document.getElementById("purchaseOrdersList");
  if (!container) return;

  const [{ data: pos, error }, { data: fetchedItems }] = await Promise.all([
    db.from("purchase_orders").select("*, purchase_order_items(*)").order("created_at", { ascending: false }),
    db.from("purchase_order_items").select("*")
  ]);

  if (error || !pos?.length) return container.innerHTML = "<div style='text-align:center; padding:15px; color:var(--text-muted);'>Koi supplier order nahi mila.</div>";

  container.innerHTML = pos.map(po => {
    let items = [];
    if (Array.isArray(po.purchase_order_items) && po.purchase_order_items.length > 0) {
      items = po.purchase_order_items;
    } else if (fetchedItems && fetchedItems.length > 0) {
      const poIdStr = String(po.id || '');
      const poNumStr = String(po.po_number || '');
      items = fetchedItems.filter(it => {
        const itPoId = String(it.po_id || '');
        const itPoNum = String(it.po_number || it.purchase_order_id || it.order_id || '');
        return (
          (poIdStr && itPoId === poIdStr) ||
          (poNumStr && itPoId === poNumStr) ||
          (poIdStr && itPoNum === poIdStr) ||
          (poNumStr && itPoNum === poNumStr)
        );
      });
    }
    const supObj = suppliersList.find(s => s.name === po.supplier_name);
    const phone = supObj ? supObj.phone : null;
    const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
    const statusLower = String(po.status || 'pending').toLowerCase();
    const badgeClass = statusLower === 'received' ? 'badge-received' : (statusLower === 'cancelled' ? 'badge-cancelled' : 'badge-pending');

    return `
      <div class="order-card">
        <div class="order-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div><strong style="font-size:13px;">Supplier: ${po.supplier_name} (${po.po_number || '#' + po.id})</strong></div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge ${badgeClass}">${po.status}</span>
            <div class="dropdown-wrapper">
              <button class="dropdown-btn" onclick="toggleDropdown(this)">⚡ Actions ▾</button>
              <div class="dropdown-menu">
                ${actionVisibilityConfig.contactPills !== false && phone ? `
                  <div class="dropdown-header">📞 Contact Supplier</div>
                  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:4px;">
                    <a href="tel:${phone}" class="dropdown-item" style="background:#eff6ff; color:#2563eb; justify-content:center; padding:6px 8px !important; border-radius:6px;">📞 Call</a>
                    <a href="https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(po.supplier_name)},%20Order%20${po.po_number}%20ke%20rate%20confirm%20karne%20hain." target="_blank" class="dropdown-item" style="background:#f0fdf4; color:#16a34a; justify-content:center; padding:6px 8px !important; border-radius:6px;">💬 WhatsApp</a>
                  </div>
                  <div class="dropdown-divider"></div>
                ` : ''}
                <div class="dropdown-header">📄 Document & Actions</div>
                ${actionVisibilityConfig.pdfReport !== false ? `<button class="dropdown-item" onclick="generateSupplierPoPdf('${po.id}')">📄 Send PDF Report</button>` : ''}
                ${actionVisibilityConfig.googleSync !== false ? `<button class="dropdown-item" onclick="syncPoToSheet('${po.id}')">📊 Sync to Google Sheet</button>` : ''}
                ${actionVisibilityConfig.changeSupplier !== false ? `<button class="dropdown-item" onclick="changePoSupplier('${po.id}')">🏷 Change Supplier Name</button>` : ''}
                ${actionVisibilityConfig.editItems !== false && statusLower === 'pending' ? `<button class="dropdown-item" onclick="openEditPoModal('${po.id}')">✏️ Edit Order Items</button>` : ''}
                <div class="dropdown-divider"></div>
                <div class="dropdown-header">⚡ Manage Status</div>
                ${actionVisibilityConfig.cancelOrder !== false && statusLower === 'pending' ? `<button class="dropdown-item" style="color:var(--danger);" onclick="cancelPurchaseOrder('${po.id}')">❌ Cancel Reorder</button>` : ''}
                ${actionVisibilityConfig.changeDate !== false && statusLower === 'received' ? `<button class="dropdown-item" onclick="changePoReceivedDate('${po.id}', '${po.received_at || po.created_at}')">📅 Change Received Date</button>` : ''}
                ${actionVisibilityConfig.deleteOrder !== false && (actionVisibilityConfig.deleteOnReceived !== false || statusLower !== 'received') ? `<button class="dropdown-item" style="color:var(--danger);" onclick="deletePurchaseOrder('${po.id}')">🗑 Delete Order from DB</button>` : ''}
                <div class="dropdown-divider"></div>
                <button class="dropdown-item" style="font-size:10px; color:var(--text-muted); justify-content:center;" onclick="openVisibilityModal()">⚙️ Menu Settings</button>
              </div>
            </div>
          </div>
        </div>
        <div style="margin-top:8px;">
          ${items.length > 0 ? `
            <div class="table-responsive" style="border-radius:10px; border:1px solid var(--border); overflow:auto; resize:vertical; min-height:auto !important; max-height:320px; height:auto !important; margin-bottom:8px;">
              <table style="width:100%; border-collapse:collapse; font-size:11px;">
                <thead><tr style="background:var(--bg); color:var(--text-muted); text-align:left;"><th style="padding:6px 10px;">Product Name</th><th style="padding:6px 10px; text-align:center;">Qty</th><th style="padding:6px 10px; text-align:right;">Purchase Price (₹)</th><th style="padding:6px 10px; text-align:right;">Total Amount (₹)</th></tr></thead>
                <tbody>${items.map(it => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px 10px; font-weight:700;">${it.product_name || 'Item'}</td><td style="padding:6px 10px; text-align:center;">${it.quantity}</td><td style="padding:6px 10px; text-align:right; color:var(--blue);">₹${Number(it.purchase_price || 0).toFixed(2)}</td><td style="padding:6px 10px; text-align:right; font-weight:700; color:var(--success);">₹${(Number(it.quantity) * Number(it.purchase_price || 0)).toFixed(2)}</td></tr>`).join("")}</tbody>
              </table>
            </div>` : `<div style="background:rgba(239,68,68,0.08); border:1px solid var(--danger); border-radius:10px; padding:10px; display:flex; justify-content:space-between; align-items:center;"><strong style="color:var(--danger); font-size:12px;">⚠️ Is Order ke Items Missing hain</strong><button class="btn-primary" style="padding:6px 12px; font-size:11px;" onclick="openEditPoModal('${po.id}')">✏️ Add / Edit Items</button></div>`}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; flex-wrap:wrap; gap:6px;">
          <strong>Bill: ₹${Number(po.total_amount || 0).toFixed(2)}</strong>
          ${statusLower === 'pending' ? `<div style="display:flex; gap:6px;"><button class="btn-danger" style="padding:5px 10px; font-size:11px;" onclick="cancelPurchaseOrder('${po.id}')">❌ Cancel</button><button class="btn-green" style="padding:5px 10px; font-size:11px;" onclick="receiveStock('${po.id}')">✅ Receive Stock</button></div>` :
        (statusLower === 'cancelled' ? `<small style="color:var(--danger); font-weight:bold;">Order Cancelled</small>` : `<small style="color:var(--success); font-weight:bold;">Stock Received (${formatTime(po.received_at)})</small>`)}
        </div>
      </div>`;
  }).join("");
}

async function openEditPoModal(poId) {
  await Promise.all([ensureProductsLoaded(), loadSuppliers()]);
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("*").or(`id.eq.${idCond},id.eq.${String(poId)},po_number.eq.${String(poId)}`).single();
  if (!po) return alert("Order load nahi ho paya.");

  const { data: allItems } = await db.from("purchase_order_items").select("*");
  const poItems = (allItems || []).filter(i => String(i.po_id) === String(po.id) || String(i.po_id) === String(po.po_number));

  document.getElementById("editPoId") && (document.getElementById("editPoId").value = po.id);
  document.getElementById("editPoNumberText") && (document.getElementById("editPoNumberText").textContent = po.po_number || '#' + po.id);
  document.getElementById("editPoSupplierSelect") && (document.getElementById("editPoSupplierSelect").value = po.supplier_name);

  editPoCart = (poItems || []).map(i => {
    let pId = (i.product_id && !isNaN(Number(i.product_id)) && Number(i.product_id) > 0) ? Number(i.product_id) : 0;
    if (pId === 0 && i.product_name) {
      const match = productsList.find(p => (p.name || '').toLowerCase() === String(i.product_name).toLowerCase());
      if (match) pId = Number(match.id);
    }
    return {
      product_id: pId,
      product_name: i.product_name || 'Product',
      quantity: Math.round(Number(i.quantity) || 1),
      purchase_price: Number(i.purchase_price) || 0
    };
  });
  renderEditPoCart();
  const modal = document.getElementById("editPoModal");
  if (modal) modal.style.display = "flex";
}

const closeEditPoModal = () => { const m = document.getElementById("editPoModal"); if (m) m.style.display = "none"; editPoCart = []; };

function addItemToEditPoCart() {
  let prodId = document.getElementById("editSelectedProductId")?.value;
  const typedText = document.getElementById("editPoProductSearch")?.value.trim() || "";
  const qty = Number(document.getElementById("editPoQty")?.value);
  const price = Number(document.getElementById("editPoPrice")?.value);
  let prodName = "";

  if (prodId) prodName = productsList.find(p => String(p.id) === String(prodId))?.name || typedText;
  else if (typedText) {
    const matched = productsList.find(p => (p.name || '').toLowerCase().includes(typedText.toLowerCase()));
    if (matched) { prodId = matched.id; prodName = matched.name; }
    else { prodId = 'custom_' + Date.now(); prodName = typedText; }
  }

  if (!prodName) return alert("Pehle Product select karein.");
  if (qty <= 0 || isNaN(qty)) return alert("Sahi Quantity dalein.");
  if (isNaN(price) || price < 0) return alert("Sahi Rate dalein.");

  let numericPId = (prodId && !isNaN(Number(prodId)) && Number(prodId) > 0) ? Number(prodId) : 0;
  if (numericPId === 0 && prodName) {
    const match = productsList.find(p => (p.name || '').toLowerCase() === String(prodName).toLowerCase());
    if (match) numericPId = Number(match.id);
  }

  editPoCart.push({ product_id: numericPId, product_name: prodName, quantity: qty, purchase_price: price });
  ['editPoProductSearch', 'editSelectedProductId', 'editPoPrice'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ""));
  document.getElementById("editPoQty") && (document.getElementById("editPoQty").value = "1");
  renderEditPoCart();
}

function updateEditPoTotal() {
  let total = 0;
  editPoCart.forEach((item, idx) => {
    const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
    total += itemTotal;
    document.getElementById(`editItemTotal_${idx}`) && (document.getElementById(`editItemTotal_${idx}`).textContent = `₹${itemTotal.toFixed(2)}`);
  });
  document.getElementById("editPoTotalBill") && (document.getElementById("editPoTotalBill").textContent = total.toFixed(2));
}

function renderEditPoCart() {
  const container = document.getElementById("editPoCartItems");
  if (!container) return;
  let total = 0;

  if (!editPoCart.length) {
    container.innerHTML = '<div style="text-align:center; padding:8px; font-size:12px; color:var(--text-muted);">Koi item nahi hai. Niche se item add karein.</div>';
    document.getElementById("editPoTotalBill") && (document.getElementById("editPoTotalBill").textContent = "0.00");
    return;
  }

  container.innerHTML = editPoCart.map((item, idx) => {
    const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
    total += itemTotal;
    return `
      <div class="item-row" draggable="true" ondragstart="onEditCartDragStart(event, ${idx})" ondragover="onEditCartDragOver(event)" ondrop="onEditCartDrop(event, ${idx})" ondragend="onEditCartDragEnd(event)" style="padding:8px; border-bottom:1px solid var(--border); background:var(--surface); border-radius:8px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
          <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
            <span class="drag-handle" title="Drag to reorder" style="cursor:grab; font-size:14px; color:var(--text-muted); padding:2px 4px; user-select:none;">⠿</span>
            <div style="display:flex; gap:2px;">
              <button type="button" class="btn-outline" style="padding:1px 4px; font-size:10px; border-radius:4px; line-height:1;" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} onclick="moveEditCartItem(${idx}, -1)" title="Move Top / Up">⬆</button>
              <button type="button" class="btn-outline" style="padding:1px 4px; font-size:10px; border-radius:4px; line-height:1;" ${idx === editPoCart.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} onclick="moveEditCartItem(${idx}, 1)" title="Move Bottom / Down">⬇</button>
            </div>
          </div>
          <div style="flex:1;">
            <strong style="font-size:12px; color:var(--text-dark);">${item.product_name}</strong>
            <div style="display:flex; gap:6px; margin-top:4px; align-items:center;">
              <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Qty:</label><input type="text" inputmode="numeric" value="${item.quantity}" style="width:55px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="editPoCart[${idx}].quantity = Number(this.value)||1; updateEditPoTotal();" />
              <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Rate:</label><input type="text" inputmode="decimal" value="${item.purchase_price}" style="width:70px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="editPoCart[${idx}].purchase_price = Number(this.value)||0; updateEditPoTotal();" />
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong id="editItemTotal_${idx}" style="font-size:13px; color:var(--success);">₹${itemTotal.toFixed(2)}</strong>
          <button type="button" class="btn-danger" style="padding:3px 6px; border-radius:6px; font-size:11px;" onclick="editPoCart.splice(${idx}, 1); renderEditPoCart();" title="Delete item">✕</button>
        </div>
      </div>`;
  }).join("");

  document.getElementById("editPoTotalBill") && (document.getElementById("editPoTotalBill").textContent = total.toFixed(2));
}

async function saveUpdatedPurchaseOrder() {
  const poId = document.getElementById("editPoId")?.value;
  const supplierName = document.getElementById("editPoSupplierSelect")?.value;
  if (!poId || !supplierName || !editPoCart.length) return alert("Sahi details dalein aur kam se kam 1 item add karein.");

  const totalAmount = editPoCart.reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.purchase_price) || 0)), 0);
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("*").or(`id.eq.${idCond},id.eq.${String(poId)},po_number.eq.${String(poId)}`).single();
  const targetPoId = po ? po.id : idCond;
  const targetPoNum = po ? po.po_number : String(poId);

  const { error: poErr } = await db.from("purchase_orders").update({ supplier_name: supplierName, total_amount: totalAmount }).or(`id.eq.${targetPoId},po_number.eq.${targetPoNum}`);
  if (poErr) return alert("Order update error: " + poErr.message);

  const itemsToInsert = editPoCart.map(i => {
    let pId = (i.product_id && !isNaN(Number(i.product_id)) && Number(i.product_id) > 0) ? Number(i.product_id) : 0;
    if (pId === 0 && i.product_name) {
      const match = productsList.find(p => (p.name || '').toLowerCase() === String(i.product_name).toLowerCase());
      if (match) pId = Number(match.id);
    }
    return {
      po_id: targetPoId,
      product_id: pId,
      product_name: i.product_name,
      quantity: Math.round(Number(i.quantity) || 1),
      purchase_price: Number(i.purchase_price) || 0
    };
  });

  await db.from("purchase_order_items").delete().or(`po_id.eq.${targetPoId},po_id.eq.${targetPoNum}`);
  const { error: insErr } = await db.from("purchase_order_items").insert(itemsToInsert);
  if (insErr) alert("Items save karne mein error aaya: " + insErr.message);
  else alert("Reorder successfully update ho gaya!");

  closeEditPoModal(); loadPurchaseOrders();
}

async function syncPoToSheet(poId) {
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("*").or(`id.eq.${idCond},id.eq.${String(poId)}`).single();
  const { data: items } = await db.from("purchase_order_items").select("*").or(`po_id.eq.${idCond},po_id.eq.${String(poId)}`);

  if (!po || !items?.length) return alert("Order details loading failed.");
  await ensureProductsLoaded();

  const totalBill = po.total_amount || items.reduce((s, i) => s + (Number(i.quantity || 1) * Number(i.purchase_price || 0)), 0);

  const sheetItems = items.map((i, idx) => {
    const skuCode = getProductSku(i.product_id, i.product_name);
    const q = Number(i.quantity || 1);
    const cp = Number(i.purchase_price || 0);
    const isLast = (idx === items.length - 1);
    return {
      indentNo: 101 + idx,
      sku: skuCode,
      name: i.product_name,
      quantity: q,
      costPack: cp > 0 ? cp.toFixed(2) : "0",
      cost_pack: cp > 0 ? cp.toFixed(2) : "0",
      supplier: po.supplier_name || 'N/A',
      location: po.supplier_name || 'N/A',
      person: po.supplier_name || 'Akash sharma',
      buyer: po.supplier_name || 'Akash sharma',
      price: (q * cp).toFixed(2),
      orderTotal: isLast ? Number(totalBill).toFixed(2) : ""
    };
  });

  await syncOrderToGoogleSheet({
    targetSheet: "Admin Orders Indent",
    isPO: true,
    orderId: po.po_number || ('#' + po.id),
    orderType: "Supplier Reorder",
    partyName: po.supplier_name || 'Akash Sharma',
    itemsArray: sheetItems,
    totalAmount: po.total_amount,
    status: po.status || "pending",
    notes: "Manual Sync from Admin Dashboard"
  });

  alert(`Order ${po.po_number || po.id} ka data Google Sheet me sync ho gaya!`);
}

async function changePoReceivedDate(poId, currentDateStr) {
  let defaultDate = new Date().toISOString().split('T')[0];
  if (currentDateStr) {
    try {
      const d = new Date(currentDateStr);
      if (!isNaN(d.getTime())) {
        defaultDate = d.toISOString().split('T')[0];
      }
    } catch (e) { }
  }

  const newDateInput = prompt("Stock Receive hone ki actual date dalein (YYYY-MM-DD format):\nJaise pichli entry ke liye: 2026-08-07", defaultDate);
  if (newDateInput === null) return;

  const cleanDate = newDateInput.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return alert("Galat date format! Kripya YYYY-MM-DD format me dalein (Jaise: 2026-08-07).");
  }

  const selectedIso = new Date(`${cleanDate}T12:00:00`).toISOString();
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { error } = await db.from("purchase_orders").update({ received_at: selectedIso }).or(`id.eq.${idCond},id.eq.${String(poId)}`);

  if (error) alert("Date update error: " + error.message);
  else {
    alert("Stock Received Date update ho gayi: " + cleanDate);
    loadPurchaseOrders();
  }
}

async function receiveStock(poId) {
  const todayStr = new Date().toISOString().split('T')[0];
  const inputDate = prompt("Stock Receive hone ki actual date dalein (YYYY-MM-DD format):\n(Aaj ki date ke liye OK karein ya pichli date jaise 2026-08-07 enter karein)", todayStr);
  if (inputDate === null) return;

  let cleanDate = inputDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    cleanDate = todayStr;
  }

  const receivedTimestamp = new Date(`${cleanDate}T12:00:00`).toISOString();

  if (!confirm(`Stock Receive confirm karein?\nReceived Date: ${cleanDate}\nIsse Stock Qty aur Cost Price update ho jayegi.`)) return;

  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("*").or(`id.eq.${idCond},id.eq.${String(poId)}`).single();
  const { data: allItems } = await db.from("purchase_order_items").select("*");
  const items = (allItems || []).filter(i => String(i.po_id) === String(po?.id) || String(i.po_id) === String(po?.po_number));

  if (items?.length) {
    for (let item of items) {
      if (!item.product_id) continue;
      const pIdCond = !isNaN(Number(item.product_id)) ? Number(item.product_id) : item.product_id;
      const { data: prod } = await db.from("products").select("stock_qty").or(`id.eq.${pIdCond},id.eq.${String(item.product_id)}`).single();
      const currentQty = Number(prod?.stock_qty || 0);
      await db.from("products").update({ cost_price: item.purchase_price, stock_qty: currentQty + Number(item.quantity || 0) }).or(`id.eq.${pIdCond},id.eq.${String(item.product_id)}`);
    }
  }

  await db.from("purchase_orders").update({ status: "received", received_at: receivedTimestamp }).or(`id.eq.${idCond},id.eq.${String(poId)}`);
  alert("Stock Receive ho gaya! Stock Qty update ho gayi.");
  loadPurchaseOrders(); loadProductsForReorder();
}

/* CUSTOMER ORDERS HANDLING */
function setCustOrdersDateFilter(type) {
  const fromEl = document.getElementById("custFromDate");
  const toEl = document.getElementById("custToDate");
  if (!fromEl || !toEl) return;

  const { from, to } = getDateRange(type);
  fromEl.value = from.toISOString().split("T")[0];
  toEl.value = to.toISOString().split("T")[0];
  loadCustomerOrders();
}

async function loadCustomerOrders() {
  const container = document.getElementById("customerOrdersContainer");
  if (!container) return;
  container.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'>Orders load ho rahe hain...</div>";

  const fromEl = document.getElementById("custFromDate");
  const toEl = document.getElementById("custToDate");
  if (fromEl && !fromEl.value) {
    const { from, to } = getDateRange('week');
    fromEl.value = from.toISOString().split("T")[0];
    toEl.value = to.toISOString().split("T")[0];
  }

  try {
    let query = db.from("orders").select("*").order("created_at", { ascending: false });
    if (fromEl?.value) query = query.gte("created_at", fromEl.value + "T00:00:00");
    if (toEl?.value) query = query.lte("created_at", toEl.value + "T23:59:59");

    const { data: orders, error } = await query;
    if (error) throw error;

    const filtered = (orders || []).filter(ord => {
      const [cName, mob, addr] = [String(ord.customer_name || '').toLowerCase(), String(ord.mobile || ''), String(ord.address || '').toLowerCase()];
      return !(cName.includes('counter') || mob === '0000000000' || addr.includes('[mode:'));
    });

    if (!filtered.length) return container.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'>Is date range me koi customer order nahi mila.</div>";

    const { data: allItems } = await db.from("order_items").select("*").in("order_id", filtered.map(o => o.id));
    const itemsMap = {};
    (allItems || []).forEach(it => { (itemsMap[String(it.order_id)] ||= []).push(it); });

    container.innerHTML = filtered.map(ord => {
      const items = itemsMap[String(ord.id)] || [];
      let totalAmount = items.reduce((s, it) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      if (totalAmount === 0 && String(ord.address || '').includes("Amt: ₹")) totalAmount = Number(ord.address.match(/Amt:\s*₹\s*([\d.]+)/)?.[1] || 0);

      const statusLower = String(ord.status || 'pending').toLowerCase();
      const badgeClass = statusLower === 'completed' ? 'badge-received' : ((statusLower === 'processing' || statusLower === 'under process') ? 'badge-processing' : (statusLower === 'cancelled' ? 'badge-cancelled' : 'badge-pending'));

      return `
        <div class="order-card">
          <div class="order-header">
            <span>ID: ${ord.order_id || ('#' + ord.id)} (${ord.customer_name || 'Customer'})</span>
            <span class="badge ${badgeClass}">${ord.status || 'PENDING'}</span>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">📞 <a href="tel:${ord.mobile}">${ord.mobile}</a> | 📅 Created: ${formatTime(ord.created_at)}<br>📍 ${ord.address || 'N/A'}</div>
          <div style="margin-top:6px;">${items.length ? items.map(it => `<div class="item-row"><span>• ${it.product_name} (×${it.quantity || 1})</span><strong>₹${(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}</strong></div>`).join('') : '<div style="font-size:11px; color:var(--text-muted);">Counter Sales Entry</div>'}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid var(--border); padding-top:8px; flex-wrap:wrap; gap:6px;">
            <div class="dropdown-wrapper">
              <button class="dropdown-btn" onclick="toggleDropdown(this)">⚡ Actions ▾</button>
              <div class="dropdown-menu">
                ${statusLower !== 'completed' && statusLower !== 'cancelled' ? `${statusLower !== 'processing' ? `<button class="dropdown-item" onclick="updateOrderStatus('${ord.id}', 'processing')">🔄 Process Order</button>` : ''}<button class="dropdown-item" onclick="updateOrderStatus('${ord.id}', 'completed')">✅ Complete</button><button class="dropdown-item" style="color:var(--danger);" onclick="updateOrderStatus('${ord.id}', 'cancelled')">❌ Cancel</button>` : ''}
                <button class="dropdown-item" onclick="generateCustomerBillPdf('${ord.id}')">📄 Download Bill PDF</button>
                <button class="dropdown-item" style="color:var(--danger);" onclick="deleteCustomerOrder('${ord.id}')">🗑 Delete Order from DB</button>
              </div>
            </div>
            <div style="font-weight:bold; font-size:13px;">Total: ₹${totalAmount.toFixed(2)}</div>
          </div>
        </div>`;
    }).join("");

  } catch (err) {
    container.innerHTML = `<div style="text-align:center; color:var(--danger); padding:15px;">Error: ${err.message}</div>`;
  }
}

async function deleteCustomerOrder(id) {
  if (!confirm("Kya aap is Customer Order ko Database se Delete karna chahte hain?")) return;
  await db.from("order_items").delete().eq("order_id", id);
  const { error } = await db.from("orders").delete().eq("id", id);
  if (error) alert("Delete Error: " + error.message);
  else { alert("Customer Order Remove ho gaya!"); loadCustomerOrders(); }
}

async function updateOrderStatus(id, newStatus) {
  const confirmMsg = newStatus === 'processing' ? "Kya order ko 'Under Process' mark karein?" : (newStatus === 'completed' ? "Kya order ko 'Completed' mark karein?" : "Kya aap is order ko CANCEL karna chahte hain?");
  if (!confirm(confirmMsg)) return;

  const updateData = { status: newStatus, updated_at: new Date().toISOString() };
  if (newStatus === 'completed') updateData.completed_at = new Date().toISOString();
  if (newStatus === 'cancelled') updateData.cancelled_at = new Date().toISOString();

  const { error } = await db.from("orders").update(updateData).eq("id", id);
  if (error) alert("Error: " + error.message);
  else {
    alert("Order Status update ho gaya!");
    loadCustomerOrders();
    try {
      const { data: ord } = await db.from("orders").select("*").eq("id", id).single();
      const { data: items } = await db.from("order_items").select("*").eq("order_id", id);
      if (ord) {
        const itemNames = (items || []).map(i => `${i.product_name} (×${i.quantity || 1})`).join(", ") || "Order Items";
        const totalAmount = (items || []).reduce((s, i) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
        syncOrderToGoogleSheet({
          targetSheet: "Admin Orders Log",
          isCustomerOrder: true,
          orderId: ord.order_id || ('#' + ord.id),
          orderType: "Customer Order",
          partyName: ord.customer_name || 'Customer',
          items: itemNames,
          quantity: (items || []).reduce((s, i) => s + (Number(i.quantity) || 1), 0),
          totalAmount: totalAmount,
          status: newStatus,
          notes: `Mobile: ${ord.mobile || ''} | Address: ${ord.address || ''}`
        });
      }
    } catch (e) { console.error("Sheet sync error:", e); }
  }
}

/* PDF GENERATION */
async function generateCustomerBillPdf(orderId) {
  const { data: ord } = await db.from("orders").select("*").eq("id", orderId).single();
  const { data: items } = await db.from("order_items").select("*").eq("order_id", orderId);
  if (!ord) return alert("Order Details Not Found!");

  let totalAmount = (items || []).reduce((s, it) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
  if (totalAmount === 0 && String(ord.address || '').includes("Amt: ₹")) totalAmount = Number(ord.address.match(/Amt:\s*₹\s*([\d.]+)/)?.[1] || 0);

  const printDiv = document.getElementById("printContainer");
  printDiv.innerHTML = `
    <div style="border:1px solid #000; padding:15px; font-size:12px;">
      <h2 style="text-align:center; margin:0 0 5px 0;">APNA DG STORE</h2>
      <p style="text-align:center; margin:0 0 15px 0; font-size:11px;">Customer Invoice Bill</p><hr/>
      <p><strong>Order ID:</strong> ${ord.order_id || ('#' + ord.id)}</p><p><strong>Customer Name:</strong> ${ord.customer_name || 'N/A'}</p><p><strong>Mobile:</strong> ${ord.mobile || 'N/A'}</p><p><strong>Address:</strong> ${ord.address || 'N/A'}</p><p><strong>Date:</strong> ${formatTime(ord.created_at)}</p><hr/>
      <table style="width:100%; border-collapse:collapse; margin-top:10px;" border="1" cellpadding="5">
        <thead><tr style="background:#f1f5f9;"><th>Item Name</th><th>Qty</th><th>Rate (₹)</th><th>Total (₹)</th></tr></thead>
        <tbody>${items?.length ? items.map(it => `<tr><td>${it.product_name}</td><td style="text-align:center;">${it.quantity || 1}</td><td style="text-align:right;">${Number(it.price || 0).toFixed(2)}</td><td style="text-align:right;">${(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}</td></tr>`).join('') : `<tr><td colspan="3">Counter Sales Collection</td><td style="text-align:right;">${totalAmount.toFixed(2)}</td></tr>`}</tbody>
      </table>
      <h3 style="text-align:right; margin-top:15px;">GRAND TOTAL: ₹${totalAmount.toFixed(2)}</h3>
    </div>`;

  printDiv.style.display = "block";
  await html2pdf().set({ margin: 10, filename: `Bill_Order_${ord.order_id || ord.id}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(printDiv).save();
  printDiv.style.display = "none";
}

async function generateSupplierPoPdf(poId) {
  const { data: po } = await db.from("purchase_orders").select("*").eq("id", poId).single();
  if (!po) return alert("Supplier Order Not Found!");

  const { data: poItems } = await db.from("purchase_order_items").select("*").eq("po_id", poId);
  po.purchase_order_items = poItems || [];
  const supObj = suppliersList.find(s => s.name === po.supplier_name);
  const cleanPhone = supObj?.phone ? supObj.phone.replace(/[^0-9]/g, '') : '';

  const printDiv = document.getElementById("printContainer");
  printDiv.innerHTML = `
    <div style="border:1px solid #000; padding:15px; font-size:12px;">
      <h2 style="text-align:center; margin:0 0 5px 0;">APNA DG STORE</h2>
      <p style="text-align:center; margin:0 0 15px 0; font-size:11px;">PURCHASE REORDER LIST</p><hr/>
      <p><strong>PO Number:</strong> ${po.po_number}</p><p><strong>Supplier Name:</strong> ${po.supplier_name}</p><p><strong>Phone:</strong> ${supObj?.phone || 'N/A'}</p><p><strong>Date:</strong> ${formatTime(po.created_at)}</p><hr/>
      <table style="width:100%; border-collapse:collapse; margin-top:10px;" border="1" cellpadding="5">
        <thead><tr style="background:#f1f5f9;"><th>Product Name</th><th>Required Qty</th><th>Est. Rate (₹)</th><th>Total (₹)</th></tr></thead>
        <tbody>${(po.purchase_order_items || []).map(it => `<tr><td>${it.product_name}</td><td style="text-align:center;">${it.quantity}</td><td style="text-align:right;">${Number(it.purchase_price).toFixed(2)}</td><td style="text-align:right;">${(it.quantity * it.purchase_price).toFixed(2)}</td></tr>`).join('')}</tbody>
      </table>
      <h3 style="text-align:right; margin-top:15px;">EST. TOTAL BILL: ₹${Number(po.total_amount).toFixed(2)}</h3>
    </div>`;

  printDiv.style.display = "block";
  await html2pdf().set({ margin: 10, filename: `Reorder_${po.po_number}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(printDiv).save();
  printDiv.style.display = "none";

  if (cleanPhone) {
    const waMsg = encodeURIComponent(`Hello ${po.supplier_name},\n\nApna DG Store se Order ${po.po_number} ki PDF generate ho gayi hai.`);
    window.open(`https://wa.me/${cleanPhone}?text=${waMsg}`, '_blank');
  }
}

/* INITIALIZATION */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initActiveTab();
  loadProductsForReorder();

  const urlInput = document.getElementById("googleSheetUrlInput");
  if (urlInput) {
    urlInput.value = googleSheetScriptUrl;
    saveGoogleSheetUrl(googleSheetScriptUrl);
  }

  const ts = document.getElementById("tickedSupplierSelect");
  const mts = document.getElementById("modalTickedSupplierSelect");
  if (ts && mts) {
    ts.addEventListener("change", () => mts.value = ts.value);
    mts.addEventListener("change", () => ts.value = mts.value);
  }
});
