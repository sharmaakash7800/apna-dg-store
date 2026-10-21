/* DATA EXPORT FEATURE: pick From/To date + choose which data -> ONE Excel workbook (one sheet per data type) */
(function () {
  const DATASETS = [
    { key: "orders", label: "🛍 Customer Orders (with items)", sheet: "Orders", table: "orders", dateCol: "created_at", type: "ts", select: "*, order_items(*)" },
    { key: "collections", label: "💵 Collections (Cash / Online)", sheet: "Collections", table: "Collections", dateCol: "collection_date", type: "date", select: "*" },
    { key: "purchase_orders", label: "📋 Supplier Reorders (Purchase Orders)", sheet: "Supplier Reorders", table: "purchase_orders", dateCol: "created_at", type: "ts", select: "*" },
    { key: "purchase_items", label: "📦 Supplier Reorder Items", sheet: "Reorder Items", table: "purchase_order_items", dateCol: null, type: "po_items" },
    { key: "products", label: "🏷 Products List (all)", sheet: "Products", table: "products", dateCol: null, select: "*" },
    { key: "suppliers", label: "🏬 Suppliers List (all)", sheet: "Suppliers", table: "suppliers", dateCol: null, select: "*" }
  ];

  function fmtVal(v) {
    if (v === null || v === undefined) return v;
    if (typeof v === "object") return JSON.stringify(v);
    if (typeof v !== "string") return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split("-"); return `${d}-${m}-${y}`; }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}.*(\+|Z)/.test(v)) {
      const dt = new Date(v.replace(" ", "T"));
      if (isNaN(dt)) return v;
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).formatToParts(dt);
      const g = t => p.find(x => x.type === t).value;
      return `${g("day")}-${g("month")}-${g("year")} ${g("hour")}:${g("minute")} ${g("dayPeriod").toUpperCase()}`;
    }
    return v;
  }

  function csvCell(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") v = JSON.stringify(v);
    v = String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function toCSV(rows) {
    if (!rows.length) return "";
    const cols = [];
    rows.forEach(r => Object.keys(r).forEach(k => { if (!cols.includes(k)) cols.push(k); }));
    return [cols.map(csvCell).join(",")].concat(rows.map(r => cols.map(c => csvCell(r[c])).join(","))).join("\r\n");
  }

  function download(name, csv) {
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function fetchAll(buildQuery) {
    const out = [], size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await buildQuery().range(from, from + size - 1);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < size) break;
    }
    return out;
  }

  async function fetchDataset(ds, fromVal, toVal) {
    const fromIso = new Date(fromVal + "T00:00:00").toISOString();
    const toIso = new Date(toVal + "T23:59:59.999").toISOString();

    if (ds.type === "po_items") {
      const pos = await fetchAll(() => db.from("purchase_orders").select("id, po_number, supplier_name, created_at").gte("created_at", fromIso).lte("created_at", toIso).order("created_at"));
      const map = {}; pos.forEach(p => map[p.id] = p);
      const ids = Object.keys(map);
      let items = [];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        items.push(...await fetchAll(() => db.from("purchase_order_items").select("*").in("po_id", chunk)));
      }
      return items.map(it => Object.assign({ po_number: map[it.po_id]?.po_number, supplier_name: map[it.po_id]?.supplier_name, po_date: map[it.po_id]?.created_at }, it));
    }

    return fetchAll(() => {
      let q = db.from(ds.table).select(ds.select);
      if (ds.dateCol) {
        q = ds.type === "date" ? q.gte(ds.dateCol, fromVal).lte(ds.dateCol, toVal) : q.gte(ds.dateCol, fromIso).lte(ds.dateCol, toIso);
        q = q.order(ds.dateCol);
      }
      return q;
    });
  }

  function flattenOrders(rows) {
    // one row per order item (order info repeated) so Excel is easy to read
    const out = [];
    rows.forEach(o => {
      const { order_items, ...ord } = o;
      if (order_items && order_items.length) order_items.forEach(it => {
        const item = {}; Object.keys(it).forEach(k => item["item_" + k] = it[k]);
        out.push(Object.assign({}, ord, item));
      });
      else out.push(ord);
    });
    return out;
  }

  window.openExportModal = function () {
    if (typeof closeSidebar === "function") closeSidebar();
    const today = new Date().toISOString().split("T")[0];
    const first = today.slice(0, 8) + "01";
    const m = document.getElementById("exportModal");
    if (m) m.remove();
    const el = document.createElement("div");
    el.id = "exportModal";
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:20000;display:flex;align-items:center;justify-content:center;padding:12px;";
    el.innerHTML = `
      <div style="background:var(--surface,#fff);color:var(--text-dark,#111);border-radius:16px;padding:18px;width:100%;max-width:420px;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <b style="font-size:16px;">⬇️ Export Data</b>
          <button onclick="document.getElementById('exportModal').remove()" style="border:none;background:none;font-size:18px;cursor:pointer;color:inherit;">✕</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <label style="flex:1;font-size:11px;font-weight:700;">From Date
            <input type="date" id="exportFromDate" value="${first}" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border,#ccc);background:var(--bg,#fff);color:inherit;"></label>
          <label style="flex:1;font-size:11px;font-weight:700;">To Date
            <input type="date" id="exportToDate" value="${today}" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border,#ccc);background:var(--bg,#fff);color:inherit;"></label>
        </div>
        <div style="font-size:12px;font-weight:800;margin-bottom:6px;">Konsa data chahiye? (What data do you need?)</div>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:800;padding:6px 8px;cursor:pointer;">
          <input type="checkbox" id="exportSelectAll" style="width:18px;height:18px;flex:none;margin:0;padding:0;" onchange="document.querySelectorAll('.exportChk').forEach(c=>c.checked=this.checked)"> Select All
        </label>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px;">
          ${DATASETS.map(d => `<label style="display:flex;gap:8px;align-items:center;font-size:13px;padding:8px;border:1px solid var(--border,#ddd);border-radius:10px;cursor:pointer;">
            <input type="checkbox" class="exportChk" style="width:18px;height:18px;flex:none;margin:0;padding:0;" onchange="document.getElementById('exportSelectAll').checked=document.querySelectorAll('.exportChk:checked').length===document.querySelectorAll('.exportChk').length" value="${d.key}" ${d.key === "orders" ? "checked" : ""}> ${d.label}</label>`).join("")}
        </div>
        <div style="font-size:10px;color:var(--text-muted,#777);margin-bottom:10px;">Products &amp; Suppliers list me date filter nahi lagta (poori list export hoti hai).</div>
        <div id="exportStatus" style="font-size:12px;font-weight:700;min-height:16px;margin-bottom:8px;"></div>
        <button id="exportGoBtn" class="btn-primary" style="width:100%;padding:11px;font-size:14px;font-weight:bold;border-radius:10px;cursor:pointer;" onclick="runExport()">⬇️ Export to Excel (1 Workbook)</button>
      </div>`;
    document.body.appendChild(el);
  };

  window.runExport = async function () {
    const fromVal = document.getElementById("exportFromDate").value;
    const toVal = document.getElementById("exportToDate").value;
    const status = document.getElementById("exportStatus");
    const btn = document.getElementById("exportGoBtn");
    const picked = [...document.querySelectorAll(".exportChk:checked")].map(c => c.value);
    if (!fromVal || !toVal) return (status.textContent = "⚠️ Dono dates select karein.");
    if (fromVal > toVal) return (status.textContent = "⚠️ From Date, To Date se badi nahi ho sakti.");
    if (!picked.length) return (status.textContent = "⚠️ Kam se kam ek data type chunein.");

    btn.disabled = true;
    let done = 0, empty = [];
    try {
      if (!window.XLSX) throw new Error("Excel library load nahi hui. Internet check karke page refresh karein.");
      const wb = XLSX.utils.book_new();
      for (const key of picked) {
        const ds = DATASETS.find(d => d.key === key);
        status.textContent = "⏳ Exporting " + ds.label + "...";
        let rows = await fetchDataset(ds, fromVal, toVal);
        if (key === "orders") rows = flattenOrders(rows);
        if (!rows.length) { empty.push(ds.label); continue; }
        const clean = rows.map(r => {
          const o = {}; Object.keys(r).forEach(k => { o[k] = fmtVal(r[k]); });
          const qk = Object.keys(r).find(k => /^(item_)?(qty|quantity)$/.test(k));
          const pk = Object.keys(r).find(k => /^(item_)?(purchase_price|unit_price|price|selling_price)$/.test(k));
          if (qk && pk) {
            const t = Math.round((Number(r[qk]) || 0) * (Number(r[pk]) || 0) * 100) / 100;
            o[key === "orders" ? "item_total_amount" : "total_amount"] = t;
          }
          return o;
        });
        if (key === "purchase_items" && clean.length && clean[0].total_amount !== undefined) {
          const sum = Math.round(clean.reduce((s, o) => s + (o.total_amount || 0), 0) * 100) / 100;
          clean.push({ [Object.keys(clean[0])[0]]: "" });
          clean.push({ [Object.keys(clean[0])[0]]: "GRAND TOTAL", total_amount: sum });
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clean), ds.sheet);
        done++;
      }
      if (done) XLSX.writeFile(wb, `DG_Store_Export_${fromVal}_to_${toVal}.xlsx`);
      status.style.color = done ? "#16a34a" : "#d97706";
      status.textContent = (done ? `✅ 1 Excel file ban gayi (${done} sheets).` : "⚠️ Koi data nahi mila.") + (empty.length ? ` (Is date range me data nahi mila: ${empty.join(", ")})` : "");
    } catch (e) {
      status.style.color = "#dc2626";
      status.textContent = "❌ Error: " + (e.message || e);
    }
    btn.disabled = false;
  };
})();
