/* ==========================================
   APNA DG STORE - CONFIG & ROLE AUTH MODULE
   ========================================== */

// NEW GOOGLE APPS SCRIPT DEPLOYED URL
const DEFAULT_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbyIOEfIb8J8slIm5_fr3aKrh7vtosC-PSpBjET6pfiRjTJScnvNMVNitumQfa4Bwgsz/exec";

// Google Sheet Script URL
let googleSheetScriptUrl =
  localStorage.getItem("googleSheetScriptUrl") || DEFAULT_SHEET_URL;

function saveGoogleSheetUrl(url) {
  googleSheetScriptUrl = (url || "").trim() || DEFAULT_SHEET_URL;
  localStorage.setItem("googleSheetScriptUrl", googleSheetScriptUrl);
  updateSheetStatusUI();
}

function updateSheetStatusUI() {
  const statusEl = document.getElementById("sheetSyncStatus");

  if (statusEl) {
    statusEl.textContent =
      googleSheetScriptUrl
        ? "✅ Sheet Sync Active"
        : "⚠️ Sheet URL Not Set";

    statusEl.style.color =
      googleSheetScriptUrl
        ? "var(--success)"
        : "var(--danger)";
  }
}


// ------------------------------------------
// ROLE-BASED AUTH & STAFF CREDENTIALS MANAGER
// ------------------------------------------

let currentRole =
  localStorage.getItem("appUserRole") || "owner";

let masterPin =
  localStorage.getItem("appMasterPin") || "1234";


// Staff Security Credentials & Permissions

let staffPassword =
  localStorage.getItem("appStaffPassword") || "staff123";

let staffAccessEnabled =
  localStorage.getItem("appStaffAccessEnabled") !== "false";


let staffPermissions =
  JSON.parse(
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


function getCurrentRole() {
  return currentRole;
}


function isOwner() {
  return currentRole === "owner";
}


function setRole(role) {

  if (
    role !== "owner" &&
    role !== "staff"
  ) {
    return;
  }

  currentRole = role;

  localStorage.setItem(
    "appUserRole",
    role
  );

  updateRoleUI();

  if (
    typeof applyPanelCustomizer === "function"
  ) {
    applyPanelCustomizer();
  }

  if (
    typeof loadPurchaseOrders === "function"
  ) {
    loadPurchaseOrders();
  }
}


function verifyOwnerPin(promptText) {

  if (isOwner()) {
    return true;
  }

  const enteredPin =
    prompt(
      promptText ||
      "Owner Permission Required! Enter Master PIN:"
    );

  if (enteredPin === null) {
    return false;
  }

  if (
    enteredPin.trim() === masterPin
  ) {

    return true;

  } else {

    alert(
      "❌ Galat Master PIN! Action Cancelled."
    );

    return false;
  }
}


function changeMasterPin() {

  if (
    !verifyOwnerPin(
      "Purana Master PIN entered karein PIN badalne ke liye:"
    )
  ) {
    return;
  }

  const newPin =
    prompt(
      "Naya 4-Digit Owner Master PIN dalein:"
    );

  if (
    !newPin ||
    newPin.trim().length < 4
  ) {

    return alert(
      "❌ PIN kam se kam 4 digits ka hona chahiye."
    );
  }

  masterPin =
    newPin.trim();

  localStorage.setItem(
    "appMasterPin",
    masterPin
  );

  alert(
    "✅ Owner Master PIN successfully update ho gaya!"
  );
}


function switchRoleUI() {

  if (
    currentRole === "staff"
  ) {

    const pin =
      prompt(
        "Owner Mode me switch karne ke liye Owner Master PIN dalein:"
      );

    if (
      pin &&
      pin.trim() === masterPin
    ) {

      setRole("owner");

      alert(
        "👑 Aap Owner Mode me switch ho gaye hain!"
      );

    } else if (
      pin !== null
    ) {

      alert("❌ Galat PIN!");
    }

  } else {

    if (
      !staffAccessEnabled
    ) {

      return alert(
        "⛔ Staff Access is BLOCKED by Owner! Staff Manager me jaa kar enable karein."
      );
    }

    const staffPass =
      prompt(
        `Staff Mode me switch karne ke liye Staff Password dalein:
(Default Password: ${staffPassword})`
      );

    if (
      staffPass &&
      staffPass.trim() === staffPassword
    ) {

      setRole("staff");

      alert(
        "👤 Aap Staff Mode me switch ho gaye hain!"
      );

    } else if (
      staffPass !== null
    ) {

      alert(
        "❌ Galat Staff Password!"
      );
    }
  }
}


function updateRoleUI() {

  const roleBadgeHeader =
    document.getElementById(
      "roleBadgeHeader"
    );

  const roleBadgeSidebar =
    document.getElementById(
      "roleBadgeSidebar"
    );

  const ownerSettingsDiv =
    document.getElementById(
      "ownerOnlySidebarSettings"
    );

  const isOwn =
    isOwner();

  const labelText =
    isOwn
      ? "👑 Owner"
      : "👤 Staff";

  const bgStyle =
    isOwn
      ? "background:rgba(79,70,229,0.15); color:var(--primary); border:1px solid var(--primary);"
      : "background:rgba(245,158,11,0.15); color:#d97706; border:1px solid #f59e0b;";


  if (
    roleBadgeHeader
  ) {

    roleBadgeHeader.textContent =
      labelText;

    roleBadgeHeader.style.cssText =
      `padding:4px 8px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; ${bgStyle}`;
  }


  if (
    roleBadgeSidebar
  ) {

    roleBadgeSidebar.textContent =
      labelText;

    roleBadgeSidebar.style.cssText =
      `padding:4px 8px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; ${bgStyle}`;
  }


  if (
    ownerSettingsDiv
  ) {

    ownerSettingsDiv.style.setProperty(
      "display",
      isOwn ? "block" : "none",
      "important"
    );
  }
}


// ------------------------------------------
// STAFF ACCOUNTS & PERMISSIONS MANAGER
// ------------------------------------------

function openStaffManagerModal() {

  if (
    !verifyOwnerPin(
      "Staff Permissions & Passwords manage karne ke liye Owner PIN dalein:"
    )
  ) {
    return;
  }

  const modal =
    document.getElementById(
      "staffManagerModal"
    );

  if (!modal) {
    return;
  }


  const passInput =
    document.getElementById(
      "staffPassInput"
    );

  const statusSelect =
    document.getElementById(
      "staffAccessStatusSelect"
    );


  if (
    passInput
  ) {

    passInput.value =
      staffPassword;
  }


  if (
    statusSelect
  ) {

    statusSelect.value =
      String(
        staffAccessEnabled
      );
  }


  Object.keys(
    staffPermissions
  ).forEach(key => {

    const chk =
      document.getElementById(
        `stf_${key}`
      );

    if (chk) {

      chk.checked =
        staffPermissions[key] === true;
    }
  });


  modal.style.display =
    "flex";
}


function closeStaffManagerModal() {

  const modal =
    document.getElementById(
      "staffManagerModal"
    );

  if (modal) {

    modal.style.display =
      "none";
  }
}


function updateStaffPermission(
  key,
  isChecked
) {

  staffPermissions[key] =
    isChecked;
}


function saveStaffAccountSettings() {

  const passInput =
    document.getElementById(
      "staffPassInput"
    );

  const statusSelect =
    document.getElementById(
      "staffAccessStatusSelect"
    );


  if (
    passInput &&
    passInput.value.trim()
  ) {

    staffPassword =
      passInput.value.trim();

    localStorage.setItem(
      "appStaffPassword",
      staffPassword
    );
  }


  if (
    statusSelect
  ) {

    staffAccessEnabled =
      statusSelect.value === "true";

    localStorage.setItem(
      "appStaffAccessEnabled",
      String(
        staffAccessEnabled
      )
    );
  }


  localStorage.setItem(
    "appStaffPermissions",
    JSON.stringify(
      staffPermissions
    )
  );


  closeStaffManagerModal();


  if (
    typeof applyPanelCustomizer === "function"
  ) {

    applyPanelCustomizer();
  }


  if (
    typeof loadPurchaseOrders === "function"
  ) {

    loadPurchaseOrders();
  }


  alert(
    "✅ Staff Password, Access Status aur Permissions update ho gayi!"
  );
}


// ------------------------------------------
// OWNER PANEL CUSTOMIZER CONFIGURATION
// ------------------------------------------

let panelCustomizerConfig =
  JSON.parse(
    localStorage.getItem(
      "panelCustomizerConfig"
    )
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


function updatePanelCustomizer(
  key,
  isChecked
) {

  panelCustomizerConfig[key] =
    isChecked;

  localStorage.setItem(
    "panelCustomizerConfig",
    JSON.stringify(
      panelCustomizerConfig
    )
  );


  if (
    typeof applyPanelCustomizer === "function"
  ) {

    applyPanelCustomizer();
  }


  if (
    typeof loadPurchaseOrders === "function"
  ) {

    loadPurchaseOrders();
  }
}
