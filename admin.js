/* ==========================================
   APNA DG STORE - COMPLETE ADMIN ENGINE
   ========================================== */

const SUPABASE_URL = "https://xbzvnhhyataeciiysbhh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_aevPjOJgExRRlhUA9-iAYg_tpIk03it";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_SHEET_URL = "https://script.google.com/macros/s/AKfycbyQ5OJdBIJLWGXzEefiUA26Cdm98RMfZLJbR0NasykpLEWOvDweOUZJ5vF9xTP46eMXbA/exec";
let googleSheetScriptUrl = localStorage.getItem("googleSheetScriptUrl") || DEFAULT_SHEET_URL;
localStorage.setItem("googleSheetScriptUrl", googleSheetScriptUrl);

let productsList = [], suppliersList = [], poCart = [], editPoCart = [], tickedProductsMap = {};
let editingProductIds = new Set(), lastEditExitTimestamp = 0;

/* ==========================================
   ROLE-BASED AUTH & SETTINGS MANAGER
   ========================================== */

let currentRole = localStorage.getItem("appUserRole") || "owner";
let masterPin = localStorage.getItem("appMasterPin") || "1234";
let staffPassword = localStorage.getItem("appStaffPassword") || "staff123";
let staffAccessEnabled = localStorage.getItem("appStaffAccessEnabled") !== "false";

let staffPermissions = JSON.parse(
  localStorage.getItem("appStaffPermissions")
) || {
  nav_customerOrders: true,
  nav_supplierHistory: true,
  nav_supplierReorder: true,
  nav_productsAdmin: false,
  nav_salesReport: false,
  contactPills: true,
  pdfReport: true,
  googleSync: true,
  changeSupplier: false,
  editItems: false,
  cancelOrder: false,
  changeDate: false,
  deleteOrder: false,
  globalSearch: true
};

let panelCustomizerConfig = JSON.parse(
  localStorage.getItem("panelCustomizerConfig")
) || {
  contactPills: true,
  pdfReport: true,
  googleSync: true,
  changeSupplier: true,
  editItems: true,
  cancelOrder: true,
  changeDate: true,
  deleteOrder: true,
  nav_customerOrders: true,
  nav_supplierHistory: true,
  nav_supplierReorder: true,
  nav_productsAdmin: true,
  nav_salesReport: true,
  globalSearch: true
};

function getCurrentRole() { return currentRole; }
function isOwner() { return currentRole === "owner"; }

function setRole(role) {
  if (role !== "owner" && role !== "staff") return;
  currentRole = role;
  localStorage.setItem("appUserRole", role);
  updateRoleUI();
  if (typeof applyPanelCustomizer === "function") applyPanelCustomizer();
  if (typeof loadPurchaseOrders === "function") loadPurchaseOrders();
}

function verifyOwnerPin(promptText) {
  if (isOwner()) return true;
  const enteredPin = prompt(promptText || "Owner Permission Required! Enter Master PIN:");
  if (enteredPin === null) return false;
  if (enteredPin.trim() === masterPin) return true;
  alert("❌ Galat Master PIN! Action Cancelled.");
  return false;
}

function changeMasterPin() {
  if (!verifyOwnerPin("Purana Master PIN entered karein PIN badalne ke liye:")) return;
  const newPin = prompt("Naya 4-Digit Owner Master PIN dalein:");
  if (!newPin || newPin.trim().length < 4) {
    return alert("❌ PIN kam se kam 4 digits ka hona chahiye.");
  }
  masterPin = newPin.trim();
  localStorage.setItem("appMasterPin", masterPin);
  alert("✅ Owner Master PIN successfully update ho gaya!");
}

function switchRoleUI() {
  if (currentRole === "staff") {
    const pin = prompt("Owner Mode me switch karne ke liye Master PIN dalein:");
    if (pin && pin.trim() === masterPin) {
      setRole("owner");
      alert("👑 Aap Owner Mode me switch ho gaye hain!");
    } else if (pin !== null) {
      alert("❌ Galat PIN!");
    }
  } else {
    if (!staffAccessEnabled) {
      return alert("⛔ Staff Access is BLOCKED by Owner!");
    }
    const staffPass = prompt(`Staff Mode me switch karne ke liye Staff Password dalein:\n(Default Password: ${staffPassword})`);
    if (staffPass && staffPass.trim() === staffPassword) {
      setRole("staff");
      alert("👤 Aap Staff Mode me switch ho gaye hain!");
    } else if (staffPass !== null) {
      alert("❌ Galat Staff Password!");
    }
  }
}

function updateRoleUI() {
  const roleBadgeHeader = document.getElementById("roleBadgeHeader");
  const roleBadgeSidebar = document.getElementById("roleBadgeSidebar");
  const ownerSettingsDiv = document.getElementById("ownerOnlySidebarSettings");

  const isOwn = isOwner();
  const labelText = isOwn ? "👑 Owner" : "👤 Staff";
  const bgStyle = isOwn
    ? "background:rgba(79,70,229,0.15); color:var(--primary); border:1px solid var(--primary);"
    : "background:rgba(245,158,11,0.15); color:#d97706; border:1px solid #f59e0b;";

  if (roleBadgeHeader) {
    roleBadgeHeader.textContent = labelText;
    roleBadgeHeader.style.cssText = `padding:4px 8px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; ${bgStyle}`;
  }
  if (roleBadgeSidebar) {
    roleBadgeSidebar.textContent = labelText;
    roleBadgeSidebar.style.cssText = `padding:4px 8px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; ${bgStyle}`;
  }
  if (ownerSettingsDiv) {
    ownerSettingsDiv.style.setProperty("display", isOwn ? "block" : "none", "important");
  }
}

function saveGoogleSheetUrl(url) {
  googleSheetScriptUrl = (url || "").trim() || DEFAULT_SHEET_URL;
  localStorage.setItem("googleSheetScriptUrl", googleSheetScriptUrl);
  updateSheetStatusUI();
}

function updateSheetStatusUI() {
  const statusEl = document.getElementById("sheetSyncStatus");
  if (statusEl) {
    statusEl.textContent = googleSheetScriptUrl ? "✅ Sheet Sync Active" : "⚠️ Sheet URL Not Set";
    statusEl.style.color = googleSheetScriptUrl ? "var(--success)" : "var(--danger)";
  }
}

function openStaffManagerModal() {
  if (!verifyOwnerPin("Staff Permissions & Passwords manage karne ke liye Owner PIN dalein:")) return;
  const modal = document.getElementById("staffManagerModal");
  if (!modal) return;

  const passInput = document.getElementById("staffPassInput");
  const statusSelect = document.getElementById("staffAccessStatusSelect");
  if (passInput) passInput.value = staffPassword;
  if (statusSelect) statusSelect.value = String(staffAccessEnabled);

  Object.keys(staffPermissions).forEach(key => {
    const chk = document.getElementById(`stf_${key}`);
    if (chk) chk.checked = staffPermissions[key] === true;
  });
  modal.style.display = "flex";
}

function closeStaffManagerModal() {
  const modal = document.getElementById("staffManagerModal");
  if (modal) modal.style.display = "none";
}

function updateStaffPermission(key, isChecked) { staffPermissions[key] = isChecked; }

function saveStaffAccountSettings() {
  const passInput = document.getElementById("staffPassInput");
  const statusSelect = document.getElementById("staffAccessStatusSelect");

  if (passInput && passInput.value.trim()) {
    staffPassword = passInput.value.trim();
    localStorage.setItem("appStaffPassword", staffPassword);
  }
  if (statusSelect) {
    staffAccessEnabled = statusSelect.value === "true";
    localStorage.setItem("appStaffAccessEnabled", String(staffAccessEnabled));
  }
  localStorage.setItem("appStaffPermissions", JSON.stringify(staffPermissions));
  closeStaffManagerModal();
  if (typeof applyPanelCustomizer === "function") applyPanelCustomizer();
  if (typeof loadPurchaseOrders === "function") loadPurchaseOrders();
  alert("✅ Staff Credentials aur Permissions update ho gayi!");
}

function updatePanelCustomizer(key, isChecked) {
  panelCustomizerConfig[key] = isChecked;
  localStorage.setItem("panelCustomizerConfig", JSON.stringify(panelCustomizerConfig));
  if (typeof applyPanelCustomizer === "function") applyPanelCustomizer();
  if (typeof loadPurchaseOrders === "function") loadPurchaseOrders();
}

function openPanelCustomizerModal() {
  if (!verifyOwnerPin("Panel Customizer kholne ke liye Owner PIN dalein:")) return;
  const modal = document.getElementById("panelCustomizerModal");
  if (!modal) return;
  Object.keys(panelCustomizerConfig).forEach(key => {
    const chk = document.getElementById(`pop_${key}`);
    if (chk) chk.checked = panelCustomizerConfig[key] !== false;
  });
  modal.style.display = "flex";
}

function closePanelCustomizerModal() {
  const modal = document.getElementById("panelCustomizerModal");
  if (modal) modal.style.display = "none";
  applyPanelCustomizer();
  loadPurchaseOrders();
}

function resetPanelCustomizer() {
  panelCustomizerConfig = {
    contactPills: true, pdfReport: true, googleSync: true, changeSupplier: true,
    editItems: true, cancelOrder: true, changeDate: true, deleteOrder: true,
    nav_customerOrders: true, nav_supplierHistory: true, nav_supplierReorder: true,
    nav_productsAdmin: true, nav_salesReport: true, globalSearch: true
  };
  localStorage.setItem("panelCustomizerConfig", JSON.stringify(panelCustomizerConfig));
  openPanelCustomizerModal();
  applyPanelCustomizer();
}

function applyPanelCustomizer() {
  const isOwn = isOwner();
  const config = isOwn ? panelCustomizerConfig : staffPermissions;

  const navKeys = [
    { key: 'customerOrders', bId: 'nav-customerOrders' },
    { key: 'supplierHistory', bId: 'nav-supplierHistory' },
    { key: 'supplierReorder', bId: 'nav-supplierReorder' },
    { key: 'productsAdmin', bId: 'nav-productsAdmin' },
    { key: 'salesReport', bId: 'nav-salesReport' }
  ];

  navKeys.forEach(item => {
    const isVisible = config[`nav_${item.key}`] !== false;
    const bNavBtn = document.getElementById(item.bId);
    if (bNavBtn) bNavBtn.style.setProperty("display", isVisible ? "flex" : "none", "important");

    const sidebarBtn = document.querySelector(`.sidebar-btn[data-view="${item.key}"]`);
    if (sidebarBtn) sidebarBtn.style.setProperty("display", isVisible ? "flex" : "none", "important");
  });

  const globalSearchContainer = document.getElementById("globalSmartSearchContainer");
  if (globalSearchContainer) {
    globalSearchContainer.style.setProperty("display", config.globalSearch !== false ? "block" : "none", "important");
  }
}

/* ==========================================
   GOOGLE SHEET API SYNC FUNCTION
   ========================================== */

async function syncOrderToGoogleSheet(payload) {
  const syncUrl = localStorage.getItem("googleSheetScriptUrl") || DEFAULT_SHEET_URL;
  if (!syncUrl) {
    console.warn("⚠️ Google Sheet Script URL is not set.");
    return;
  }
  try {
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    console.log("Sheet Sync Result:", result);
    return result;
  } catch (err) {
    console.error("Sheet Sync API Error:", err);
  }
}

/* ==========================================
   NAVIGATION & THEME
   ========================================== */

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

const formatTime = dtStr => dtStr ? new Date(dtStr).toLocaleString("hi-IN", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

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

function toggleDropdown(btn) {
  const menu = btn.nextElementSibling;
  document.querySelectorAll('.dropdown-menu').forEach(m => m !== menu && m.classList.remove('show'));
  menu?.classList.toggle('show');
}
document.addEventListener('click', e => !e.target.closest('.dropdown-wrapper') && document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show')));

/* ==========================================
   REORDERS & RECEIVE STOCK MODULE
   ========================================== */

async function loadProductsForReorder() {
  if (!productsList.length) {
    const { data } = await db.from("products").select("*").order("name");
    productsList = data || [];
  }
  setupProductSearch("poProductSearch", "poSearchResults", "selectedProductId", "poPrice");
  setupProductSearch("editPoProductSearch", "editPoSearchResults", "editSelectedProductId", "editPoPrice");
}

async function ensureProductsLoaded() {
  if (!productsList.length) await loadProductsForReorder();
}

function getProductSku(productId, productName) {
  const pIdNum = Number(productId || 0);
  const pName = String(productName || '').trim();
  let prod = null;

  if (pIdNum > 0) prod = productsList.find(p => String(p.id) === String(pIdNum));
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

  return clean.replace(/^([A-Z0-9]{2,4}-)\1/gi, '$1');
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
  renderPoCart();
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
      <div class="item-row" style="padding:8px; border-bottom:1px solid var(--border); background:var(--surface); border-radius:8px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="flex:1;">
          <strong style="font-size:12px; color:var(--text-dark);">${item.product_name}</strong>
          <div style="display:flex; gap:6px; margin-top:4px; align-items:center;">
            <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Qty:</label><input type="text" inputmode="numeric" value="${item.quantity}" style="width:55px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="poCart[${idx}].quantity = Number(this.value)||1; renderPoCart();" />
            <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Rate:</label><input type="text" inputmode="decimal" value="${item.purchase_price}" style="width:70px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="poCart[${idx}].purchase_price = Number(this.value)||0; renderPoCart();" />
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong style="font-size:13px; color:var(--success);">₹${itemTotal.toFixed(2)}</strong>
          <button type="button" class="btn-danger" style="padding:3px 6px; border-radius:6px; font-size:11px;" onclick="poCart.splice(${idx}, 1); renderPoCart();">✕</button>
        </div>
      </div>`;
  }).join("");

  document.getElementById("poTotalBill") && (document.getElementById("poTotalBill").textContent = total.toFixed(2));
}

async function generateNextPoNumber() {
  try {
    const { data: pos } = await db.from("purchase_orders").select("po_number, id").order("id", { ascending: false }).limit(100);
    let maxSeq = 1000;
    if (pos && pos.length) {
      pos.forEach(p => {
        if (p.po_number && p.po_number.startsWith("PO-")) {
          const num = parseInt(p.po_number.replace(/^PO-/, "").trim(), 10);
          if (!isNaN(num) && num < 1000000 && num > maxSeq) maxSeq = num;
        }
      });
    }
    return "PO-" + (maxSeq + 1);
  } catch (e) {
    return "PO-" + (1000 + Math.floor(Math.random() * 900));
  }
}

async function submitPurchaseOrder() {
  const select = document.getElementById("poSupplierSelect");
  const supplier = select ? select.value : "";
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
  else alert(`Reorder ${poNumber} submit ho gaya! Bill: ₹${totalAmount.toFixed(2)}\n(Sheet sync stock receive hone par hogi)`);

  poCart = [];
  if (select) select.value = "";
  ['poProductSearch', 'selectedProductId', 'poPrice'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ""));
  renderPoCart();
  loadPurchaseOrders();
}

async function submitTickedReorder(sourceModal = false) {
  const supplierSelect = sourceModal ? document.getElementById("modalTickedSupplierSelect") : document.getElementById("tickedSupplierSelect");
  const supplier = supplierSelect ? supplierSelect.value : "";
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
  else alert(`Reorder ${poNumber} successfully save ho gaya! Bill: ₹${totalAmount.toFixed(2)}\n(Sheet sync stock receive hone par hogi)`);

  clearAllSelection();
  ['tickedSupplierSelect', 'modalTickedSupplierSelect'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ""));
  closeTickedCartModal();
  loadPurchaseOrders();
}

const submitTickedReorderFromModal = () => submitTickedReorder(true);

/* ======================================================
   RECEIVE STOCK (EXACT LIVE TIME + STRICT SHEET SYNC)
   ====================================================== */

async function receiveStock(poId) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const inputDate = prompt(
    "Stock Receive hone ki date dalein (YYYY-MM-DD format):\n(Aaj ke LIVE TIME ke sath receive karne ke liye OK dabayein)",
    todayStr
  );
  if (inputDate === null) return;

  let cleanDate = inputDate.trim();
  let receivedTimestamp;

  // Agar aaj ki date hai toh LIVE TIME save hoga, varna manual date
  if (!cleanDate || cleanDate === todayStr) {
    receivedTimestamp = new Date().toISOString();
  } else {
    receivedTimestamp = new Date(`${cleanDate}T${now.toTimeString().split(' ')[0]}`).toISOString();
  }

  if (!confirm(`Stock Receive confirm karein?\nIsse Stock Qty, Live Time aur Google Sheet sync update ho jayenge.`)) return;

  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;

  // 1. Fetch PO & Items
  const { data: po } = await db.from("purchase_orders").select("*").or(`id.eq.${idCond},id.eq.${String(poId)},po_number.eq.${String(poId)}`).single();
  const { data: allItems } = await db.from("purchase_order_items").select("*");
  const items = (allItems || []).filter(i => String(i.po_id) === String(po?.id) || String(i.po_id) === String(po?.po_number));

  // 2. Supabase Stock & Cost Update
  if (items?.length) {
    for (let item of items) {
      if (!item.product_id) continue;
      const pIdCond = !isNaN(Number(item.product_id)) ? Number(item.product_id) : item.product_id;
      const { data: prod } = await db.from("products").select("stock_qty").or(`id.eq.${pIdCond},id.eq.${String(item.product_id)}`).single();
      const currentQty = Number(prod?.stock_qty || 0);
      await db.from("products").update({
        cost_price: item.purchase_price,
        stock_qty: currentQty + Number(item.quantity || 0)
      }).or(`id.eq.${pIdCond},id.eq.${String(item.product_id)}`);
    }
  }

  // 3. Database Status Update
  await db.from("purchase_orders").update({
    status: "received",
    received_at: receivedTimestamp
  }).or(`id.eq.${idCond},id.eq.${String(poId)},po_number.eq.${String(poId)}`);

  // 4. PREPARE SHEET PAYLOAD & SYNC STRICTLY HERE
  await ensureProductsLoaded();
  const poNum = po?.po_number || ('PO-' + poId);
  const totalBill = Number(po?.total_amount || items.reduce((s, i) => s + (Number(i.quantity || 1) * Number(i.purchase_price || 0)), 0));

  const sheetItems = items.map((i, idx) => {
    const skuCode = getProductSku(i.product_id, i.product_name);
    const q = Number(i.quantity || 1);
    const cp = Number(i.purchase_price || 0);
    const isLast = (idx === items.length - 1);
    return {
      indentNo: 101 + idx,
      sku: skuCode,
      name: i.product_name || 'Item',
      quantity: q,
      costPack: cp > 0 ? cp.toFixed(2) : "0",
      cost_pack: cp > 0 ? cp.toFixed(2) : "0",
      supplier: po?.supplier_name || 'N/A',
      buyer: 'Akash sharma',
      price: (q * cp).toFixed(2),
      orderTotal: isLast ? totalBill.toFixed(2) : ""
    };
  });

  await syncOrderToGoogleSheet({
    action: "stock_received",
    status: "received",
    targetSheet: "Admin Orders Indent",
    orderId: poNum,
    poId: poNum,
    supplierName: po?.supplier_name || 'Akash Sharma',
    itemsArray: sheetItems,
    totalAmount: totalBill,
    buyer: "Akash sharma"
  });

  alert(`✅ Stock Receive ho gaya!\nLive Time update ho gaya aur Google Sheet (${poNum}) me entry complete ho gayi.`);
  loadPurchaseOrders();
  loadProductsForReorder();
}

async function syncPoToSheet(poId) {
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("*").or(`id.eq.${idCond},id.eq.${String(poId)}`).single();
  const { data: items } = await db.from("purchase_order_items").select("*").or(`po_id.eq.${idCond},po_id.eq.${String(poId)}`);

  if (!po || !items?.length) return alert("Order details load nahi ho payi.");
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
      buyer: 'Akash sharma',
      price: (q * cp).toFixed(2),
      orderTotal: isLast ? Number(totalBill).toFixed(2) : ""
    };
  });

  await syncOrderToGoogleSheet({
    action: "stock_received",
    status: "received",
    targetSheet: "Admin Orders Indent",
    orderId: po.po_number || ('#' + po.id),
    poId: po.po_number || ('#' + po.id),
    supplierName: po.supplier_name || 'Akash Sharma',
    itemsArray: sheetItems,
    totalAmount: totalBill,
    buyer: "Akash sharma"
  });

  alert(`✅ Order ${po.po_number || po.id} Google Sheet me successfully Sync ho gaya!`);
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

    const isOwn = isOwner();
    const cfg = isOwn ? panelCustomizerConfig : staffPermissions;

    return `
      <div class="order-card">
        <div class="order-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="flex:1; min-width:0; padding-right:4px;">
            <strong style="font-size:13px; display:block; word-break:break-word;">Supplier: ${po.supplier_name} (${po.po_number || '#' + po.id})</strong>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <span class="badge ${badgeClass}">${po.status}</span>
            <div class="dropdown-wrapper">
              <button class="dropdown-btn" onclick="toggleDropdown(this)">⚡ Actions ▾</button>
              <div class="dropdown-menu">
                ${cfg.contactPills !== false && phone ? `
                  <div class="dropdown-header">📞 Contact Supplier</div>
                  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:4px;">
                    <a href="tel:${phone}" class="dropdown-item" style="background:#eff6ff; color:#2563eb; justify-content:center; padding:6px 8px !important; border-radius:6px;">📞 Call</a>
                    <a href="https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(po.supplier_name)},%20Order%20${po.po_number}%20ke%20rate%20confirm%20karne%20hain." target="_blank" class="dropdown-item" style="background:#f0fdf4; color:#16a34a; justify-content:center; padding:6px 8px !important; border-radius:6px;">💬 WhatsApp</a>
                  </div>
                  <div class="dropdown-divider"></div>
                ` : ''}
                <div class="dropdown-header">📄 Document & Actions</div>
                ${cfg.pdfReport !== false ? `<button class="dropdown-item" onclick="generateSupplierPoPdf('${po.id}')">📄 Send PDF Report</button>` : ''}
                ${cfg.googleSync !== false ? `<button class="dropdown-item" onclick="syncPoToSheet('${po.id}')">📊 Sync to Google Sheet</button>` : ''}
                ${cfg.changeSupplier !== false ? `<button class="dropdown-item" onclick="changePoSupplier('${po.id}')">🏷 Change Supplier Name</button>` : ''}
                ${cfg.editItems !== false && statusLower === 'pending' ? `<button class="dropdown-item" onclick="openEditPoModal('${po.id}')">✏️ Edit Order Items</button>` : ''}
                <div class="dropdown-divider"></div>
                <div class="dropdown-header">⚡ Manage Status</div>
                ${cfg.cancelOrder !== false && statusLower === 'pending' ? `<button class="dropdown-item" style="color:var(--danger);" onclick="cancelPurchaseOrder('${po.id}')">❌ Cancel Reorder</button>` : ''}
                ${cfg.changeDate !== false && statusLower === 'received' ? `<button class="dropdown-item" onclick="changePoReceivedDate('${po.id}', '${po.received_at || po.created_at}')">📅 Change Received Date</button>` : ''}
                ${isOwn && cfg.deleteOrder !== false ? `<button class="dropdown-item" style="color:var(--danger);" onclick="deletePurchaseOrder('${po.id}')">🗑 Delete Order from DB</button>` : ''}
              </div>
            </div>
          </div>
        </div>
        <div style="margin-top:8px;">
          ${items.length > 0 ? `
            <div class="table-responsive" style="border-radius:10px; border:1px solid var(--border); overflow:auto; resize:vertical; max-height:320px; margin-bottom:8px;">
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

async function cancelPurchaseOrder(poId) {
  if (!confirm("Kya aap is Supplier Reorder ko Cancel karna chahte hain?")) return;
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { error } = await db.from("purchase_orders").update({ status: "cancelled" }).or(`id.eq.${idCond},id.eq.${String(poId)},po_number.eq.${String(poId)}`);
  if (error) alert("Error: " + error.message);
  else { alert("Reorder successfully Cancel ho gaya!"); loadPurchaseOrders(); }
}

async function deletePurchaseOrder(poId) {
  if (!verifyOwnerPin("Order Delete karne ke liye Owner Master PIN dalein:")) return;
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("po_number").or(`id.eq.${idCond},id.eq.${String(poId)}`).single();
  const poNum = po?.po_number || (typeof poId === 'string' && poId.startsWith('PO-') ? poId : `PO-${poId}`);

  await db.from("purchase_order_items").delete().or(`po_id.eq.${idCond},po_id.eq.${String(poId)}`);
  const { error } = await db.from("purchase_orders").delete().or(`id.eq.${idCond},id.eq.${String(poId)}`);
  if (error) alert("Delete error: " + error.message);
  else {
    syncOrderToGoogleSheet({ action: "delete", targetSheet: "Admin Orders Indent", orderId: poNum });
    alert(`Order ${poNum} Database se remove ho gaya!`);
    loadPurchaseOrders();
  }
}

async function changePoSupplier(poId) {
  await loadSuppliers();
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { data: po } = await db.from("purchase_orders").select("supplier_name").or(`id.eq.${idCond},id.eq.${String(poId)}`).single();
  if (!po) return alert("Order nahi mila.");

  const currentSupplier = po.supplier_name || '';
  const supplierNames = suppliersList.map(s => s.name);
  const chosen = prompt(`Naya Supplier Name chunein:\n\nAvailable Suppliers:\n${supplierNames.join("\n")}`, currentSupplier);
  if (!chosen || chosen.trim() === "" || chosen.trim() === currentSupplier) return;

  const { error } = await db.from("purchase_orders").update({ supplier_name: chosen.trim() }).or(`id.eq.${idCond},id.eq.${String(poId)}`);
  if (error) alert("Error: " + error.message);
  else { alert(`Supplier Name update ho gaya!`); loadPurchaseOrders(); }
}

async function changePoReceivedDate(poId, currentDateStr) {
  let defaultDate = new Date().toISOString().split('T')[0];
  if (currentDateStr) {
    try {
      const d = new Date(currentDateStr);
      if (!isNaN(d.getTime())) defaultDate = d.toISOString().split('T')[0];
    } catch (e) { }
  }

  const newDateInput = prompt("Stock Receive hone ki actual date dalein (YYYY-MM-DD format):", defaultDate);
  if (newDateInput === null) return;
  const cleanDate = newDateInput.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return alert("Galat date format! YYYY-MM-DD dalein.");

  const selectedIso = new Date(`${cleanDate}T12:00:00`).toISOString();
  const idCond = !isNaN(Number(poId)) ? Number(poId) : poId;
  const { error } = await db.from("purchase_orders").update({ received_at: selectedIso }).or(`id.eq.${idCond},id.eq.${String(poId)}`);

  if (error) alert("Date update error: " + error.message);
  else { alert("Stock Received Date update ho gayi: " + cleanDate); loadPurchaseOrders(); }
}

/* ==========================================
   EDIT REORDER CART MODAL
   ========================================== */

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
      <div class="item-row" style="padding:8px; border-bottom:1px solid var(--border); background:var(--surface); border-radius:8px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="flex:1;">
          <strong style="font-size:12px; color:var(--text-dark);">${item.product_name}</strong>
          <div style="display:flex; gap:6px; margin-top:4px; align-items:center;">
            <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Qty:</label><input type="text" inputmode="numeric" value="${item.quantity}" style="width:55px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="editPoCart[${idx}].quantity = Number(this.value)||1; renderEditPoCart();" />
            <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Rate:</label><input type="text" inputmode="decimal" value="${item.purchase_price}" style="width:70px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="editPoCart[${idx}].purchase_price = Number(this.value)||0; renderEditPoCart();" />
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong style="font-size:13px; color:var(--success);">₹${itemTotal.toFixed(2)}</strong>
          <button type="button" class="btn-danger" style="padding:3px 6px; border-radius:6px; font-size:11px;" onclick="editPoCart.splice(${idx}, 1); renderEditPoCart();">✕</button>
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
  if (insErr) alert("Items save karne mein error: " + insErr.message);
  else alert("Reorder successfully update ho gaya!");

  closeEditPoModal();
  loadPurchaseOrders();
}

/* ==========================================
   CUSTOMER ORDERS HANDLING
   ========================================== */

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
      const isOwn = isOwner();
      const items = itemsMap[String(ord.id)] || [];
      let totalAmount = items.reduce((s, it) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      if (totalAmount === 0 && String(ord.address || '').includes("Amt: ₹")) totalAmount = Number(ord.address.match(/Amt:\s*₹\s*([\d.]+)/)?.[1] || 0);

      const statusLower = String(ord.status || 'pending').toLowerCase();
      const badgeClass = statusLower === 'completed' ? 'badge-received' : ((statusLower === 'processing' || statusLower === 'under process') ? 'badge-processing' : (statusLower === 'cancelled' ? 'badge-cancelled' : 'badge-pending'));

      return `
        <div class="order-card">
          <div class="order-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div style="flex:1; min-width:0; padding-right:4px;">
              <strong style="font-size:13px; display:block; word-break:break-word;">ID: ${ord.order_id || ('#' + ord.id)} (${ord.customer_name || 'Customer'})</strong>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
              <span class="badge ${badgeClass}">${ord.status || 'PENDING'}</span>
              <div class="dropdown-wrapper">
                <button class="dropdown-btn" onclick="toggleDropdown(this)">⚡ Actions ▾</button>
                <div class="dropdown-menu">
                  ${statusLower !== 'completed' && statusLower !== 'cancelled' ? `${statusLower !== 'processing' ? `<button class="dropdown-item" onclick="updateOrderStatus('${ord.id}', 'processing')">🔄 Process Order</button>` : ''}<button class="dropdown-item" onclick="updateOrderStatus('${ord.id}', 'completed')">✅ Complete</button><button class="dropdown-item" style="color:var(--danger);" onclick="updateOrderStatus('${ord.id}', 'cancelled')">❌ Cancel</button>` : ''}
                  <button class="dropdown-item" onclick="generateCustomerBillPdf('${ord.id}')">📄 Download Bill PDF</button>
                  ${isOwn ? `<button class="dropdown-item" style="color:var(--danger);" onclick="deleteCustomerOrder('${ord.id}')">🗑 Delete Order from DB</button>` : ''}
                </div>
              </div>
            </div>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px; margin-bottom:6px;">📞 <a href="tel:${ord.mobile}">${ord.mobile}</a> | 📅 Created: ${formatTime(ord.created_at)}<br>📍 ${ord.address || 'N/A'}</div>
          <div style="margin-top:6px;">${items.length ? items.map(it => `<div class="item-row"><span>• ${it.product_name} (×${it.quantity || 1})</span><strong>₹${(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}</strong></div>`).join('') : '<div style="font-size:11px; color:var(--text-muted);">Counter Sales Entry</div>'}</div>
          <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:10px; border-top:1px solid var(--border); padding-top:8px;">
            <div style="font-weight:bold; font-size:14px; color:var(--success);">Total: ₹${totalAmount.toFixed(2)}</div>
          </div>
        </div>`;
    }).join("");

  } catch (err) {
    container.innerHTML = `<div style="text-align:center; color:var(--danger); padding:15px;">Error: ${err.message}</div>`;
  }
}

async function updateOrderStatus(id, newStatus) {
  const confirmMsg = newStatus === 'processing' ? "Order ko 'Under Process' mark karein?" : (newStatus === 'completed' ? "Order ko 'Completed' mark karein?" : "Kya aap is order ko CANCEL karna chahte hain?");
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

async function deleteCustomerOrder(id) {
  if (!confirm("Kya aap is Customer Order ko Database se Delete karna chahte hain?")) return;
  await db.from("order_items").delete().eq("order_id", id);
  const { error } = await db.from("orders").delete().eq("id", id);
  if (error) alert("Delete Error: " + error.message);
  else { alert("Customer Order Remove ho gaya!"); loadCustomerOrders(); }
}

/* ==========================================
   SUPPLIERS MASTER & PRODUCTS VIEW
   ========================================== */

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

function getPackCountFromUnit(unitStr) {
  if (!unitStr) return 1;
  const match = String(unitStr).trim().match(/(?:pack\s*of|pack|\/)\s*(\d+)/i) || String(unitStr).trim().match(/(\d+)\s*(?:pcs|pouch|pouches|pack|nos|items)/i) || String(unitStr).trim().match(/\((\d+)\)/);
  return match && match[1] && parseInt(match[1], 10) > 0 ? parseInt(match[1], 10) : 1;
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
          <td><input type="text" id="edit_unit_${p.id}" class="name-edit-input" style="min-width:90px; width:100%; text-align:center; border-color:var(--primary); background:var(--surface); color:var(--text-dark);" value="${escUnit}" /></td>
          <td><input type="text" inputmode="numeric" id="edit_qty_${p.id}" class="price-edit-input" style="width:60px; text-align:center; border-color:var(--primary); background:var(--surface); color:var(--text-dark);" value="${qtyVal}" onfocus="this.select()" /></td>
          <td><div style="display:flex; align-items:center; gap:2px;"><span style="font-size:11px; color:var(--text-muted);">₹</span><input type="text" inputmode="decimal" id="edit_cost_${p.id}" class="price-edit-input" style="width:70px; border-color:var(--primary); background:var(--surface); color:var(--blue);" value="${costPriceNum.toFixed(2)}" onfocus="this.select()" /></div></td>
          <td><span style="color:#8b5cf6; font-weight:700; background:rgba(139,92,246,0.12); padding:4px 6px; border-radius:6px; font-size:11px;">₹${unitCostNum.toFixed(2)}</span></td>
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

const enableRowEditing = prodId => { editingProductIds.add(String(prodId)); renderProductsTable(); };
const cancelRowEditing = prodId => { editingProductIds.delete(String(prodId)); renderProductsTable(); };

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
  if (error) alert("Product update karne mein error: " + error.message);
  else {
    const prod = productsList.find(p => String(p.id) === String(prodId));
    if (prod) Object.assign(prod, updateData);
    editingProductIds.delete(String(prodId));
    updateCategoryDropdown();
    renderProductsTable();
  }
}

async function toggleProductActiveStatus(prodId, newStatus) {
  const prod = productsList.find(p => String(p.id) === String(prodId));
  if (prod) prod.active = newStatus;
  renderProductsTable();
  const { error } = await db.from("products").update({ active: newStatus }).eq("id", prodId);
  if (error) { if (prod) prod.active = !newStatus; renderProductsTable(); alert("Status update fail: " + error.message); }
}

function toggleProductSelection(prodId, isChecked) {
  const prod = productsList.find(p => String(p.id) === String(prodId));
  if (!prod) return;
  if (isChecked) {
    tickedProductsMap[prodId] = { product_id: prod.id, product_name: prod.name, quantity: 1, purchase_price: Number(prod.cost_price ?? prod.price ?? 0) };
  } else delete tickedProductsMap[prodId];
  renderTickedProductsList();
}

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
    const packetCost = Number(item.purchase_price || prod?.cost_price || 0);
    const itemTotal = Number(item.quantity) * packetCost;
    total += itemTotal;

    return `
      <div class="item-row" style="flex-direction:column; align-items:stretch; gap:6px; padding:8px 10px; border-bottom:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:12px; color:var(--text-dark);">${item.product_name}</strong>
          <strong style="font-size:13px; color:var(--primary);">₹${itemTotal.toFixed(2)}</strong>
        </div>
        <div style="display:flex; gap:8px; align-items:center; background:var(--bg); padding:6px 10px; border-radius:8px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:4px;"><label style="font-size:10px; font-weight:700;">Qty:</label><input type="text" inputmode="numeric" value="${item.quantity}" style="width:55px; padding:3px 6px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="tickedProductsMap['${k}'].quantity = Number(this.value)||1; renderTickedProductsList();" /></div>
          <div style="display:flex; align-items:center; gap:4px;"><label style="font-size:10px; font-weight:700;">Rate:</label><input type="text" inputmode="decimal" value="${packetCost.toFixed(2)}" style="width:65px; padding:3px 6px; font-size:11px; font-weight:bold; border:1px solid var(--border); border-radius:6px;" onfocus="this.select()" oninput="tickedProductsMap['${k}'].purchase_price = Number(this.value)||0; renderTickedProductsList();" /></div>
          <button class="btn-danger" style="padding:3px 8px; border-radius:6px; font-size:11px; margin-left:auto;" onclick="toggleProductSelection('${k}', false); renderProductsTable();">✕ Remove</button>
        </div>
      </div>`;
  }).join('');

  if (container) container.innerHTML = htmlList;
  if (modalContainer) modalContainer.innerHTML = htmlList;
  ['tickedTotalBill', 'floatingTickedTotalBill', 'modalTickedTotalBill'].forEach(id => document.getElementById(id) && (document.getElementById(id).textContent = total.toFixed(2)));
}

const openTickedCartModal = async () => { await loadSuppliers(); const m = document.getElementById("tickedCartModal"); if (m) m.style.display = "flex"; };
const closeTickedCartModal = () => { const m = document.getElementById("tickedCartModal"); if (m) m.style.display = "none"; };
function clearAllSelection() { tickedProductsMap = {}; renderTickedProductsList(); renderProductsTable(); }

/* ==========================================
   GLOBAL SEARCH & INITIALIZATION
   ========================================== */

async function handleGlobalSmartSearch(query) {
  const dropdown = document.getElementById("globalSearchResultsDropdown");
  if (!dropdown) return;
  const q = (query || "").trim().toLowerCase();
  if (q.length < 2) { dropdown.style.display = "none"; dropdown.innerHTML = ""; return; }

  dropdown.style.display = "block";
  dropdown.innerHTML = "<div style='text-align:center; padding:8px; font-size:11px; color:var(--text-muted);'>🔍 Searching store...</div>";

  try {
    const matchedProducts = (productsList || []).filter(p => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)).slice(0, 4);
    let html = "";
    if (matchedProducts.length > 0) {
      html += `<div style="font-size:10px; font-weight:800; color:var(--primary); margin-bottom:4px; padding-bottom:2px; border-bottom:1px solid var(--border);">📦 PRODUCTS (${matchedProducts.length})</div>`;
      matchedProducts.forEach(p => {
        html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid var(--border); font-size:11px; cursor:pointer;" onclick="switchAdminView('productsAdmin'); document.getElementById('globalSearchResultsDropdown').style.display='none';"><div><strong>${p.name}</strong><br><small style="color:var(--text-muted);">Stock: ${p.stock_qty || 0}</small></div></div>`;
      });
    }
    dropdown.innerHTML = html || "<div style='text-align:center; padding:12px; font-size:11px; color:var(--text-muted);'>❌ Koi result nahi mila.</div>";
  } catch (e) {
    dropdown.innerHTML = "<div style='text-align:center; padding:8px; font-size:11px; color:var(--danger);'>Search error.</div>";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initActiveTab();
  updateRoleUI();
  updateSheetStatusUI();
  applyPanelCustomizer();
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
