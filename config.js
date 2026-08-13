/* ==========================================
   APNA DG STORE - CONFIG & ROLE AUTH MODULE
   ========================================== */

const DEFAULT_SHEET_URL = "https://script.google.com/macros/s/AKfycbyPS3892GpqKPPoL3gkHLK2BnMtXrW2j9ALCBqblf82uLi9rslEVh2eaGOMwi9UT6-R7Q/exec";

// Google Sheet Script URL
let googleSheetScriptUrl = localStorage.getItem("googleSheetScriptUrl") || DEFAULT_SHEET_URL;

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

// ------------------------------------------
// ROLE-BASED AUTH & MASTER PIN PERMISSIONS (POINT 3)
// ------------------------------------------

// Roles: 'owner' (Full Access) | 'staff' (Restricted Actions)
let currentRole = localStorage.getItem("appUserRole") || "owner";
let masterPin = localStorage.getItem("appMasterPin") || "1234";

function getCurrentRole() {
  return currentRole;
}

function isOwner() {
  return currentRole === "owner";
}

function setRole(role) {
  if (role !== "owner" && role !== "staff") return;
  currentRole = role;
  localStorage.setItem("appUserRole", role);
  updateRoleUI();
  if (typeof loadPurchaseOrders === "function") loadPurchaseOrders();
}

function verifyOwnerPin(promptText) {
  if (isOwner()) return true;
  const enteredPin = prompt(promptText || "Owner Permission Required! Enter Master PIN:");
  if (enteredPin === null) return false;
  if (enteredPin.trim() === masterPin) {
    return true;
  } else {
    alert("❌ Galat Master PIN! Action Cancelled.");
    return false;
  }
}

function changeMasterPin() {
  if (!verifyOwnerPin("Purana Master PIN entered karein PIN badalne ke liye:")) return;
  const newPin = prompt("Naya 4-Digit Master PIN dalein:");
  if (!newPin || newPin.trim().length < 4) {
    return alert("❌ PIN kam se kam 4 digits ka hona chahiye.");
  }
  masterPin = newPin.trim();
  localStorage.setItem("appMasterPin", masterPin);
  alert("✅ Master PIN successfully update ho gaya!");
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
    if (confirm("Staff Mode me switch karein? (Staff Delete/Settings ke liye PIN mangega)")) {
      setRole("staff");
      alert("👤 Aap Staff Mode me switch ho gaye hain!");
    }
  }
}

function updateRoleUI() {
  const roleBadgeHeader = document.getElementById("roleBadgeHeader");
  const roleBadgeSidebar = document.getElementById("roleBadgeSidebar");
  const isOwn = isOwner();
  const labelText = isOwn ? "👑 Owner" : "👤 Staff";
  const bgStyle = isOwn ? "background:rgba(79,70,229,0.15); color:var(--primary); border:1px solid var(--primary);" : "background:rgba(245,158,11,0.15); color:#d97706; border:1px solid #f59e0b;";

  if (roleBadgeHeader) {
    roleBadgeHeader.textContent = labelText;
    roleBadgeHeader.style.cssText = `padding:4px 8px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; ${bgStyle}`;
  }
  if (roleBadgeSidebar) {
    roleBadgeSidebar.textContent = labelText;
    roleBadgeSidebar.style.cssText = `padding:4px 8px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; ${bgStyle}`;
  }
}

// ------------------------------------------
// PANEL CUSTOMIZER STATE CONFIGURATION
// ------------------------------------------
let panelCustomizerConfig = JSON.parse(localStorage.getItem("panelCustomizerConfig")) || {
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
  nav_salesReport: true
};
