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


  /* ---------- Excel (ExcelJS) + charts (Chart.js images) ---------- */
  const NUM = v => Number(v) || 0;
  const R2 = v => Math.round(v * 100) / 100;
  const pickKey = (row, re) => Object.keys(row || {}).find(k => re.test(k));

  function chartImage(type, labels, data, title, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 760; canvas.height = 340;
    const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];
    const isPie = type === "pie";
    const ctx = canvas.getContext("2d");
    const ch = new Chart(ctx, {
      type: type,
      data: { labels, datasets: [{ label: title, data, backgroundColor: isPie ? palette : (color || "#6366f1"), borderColor: color || "#6366f1", borderWidth: type === "line" ? 3 : 1, fill: false, tension: 0.25 }] },
      options: { responsive: false, animation: false, plugins: { title: { display: true, text: title, font: { size: 16 } }, legend: { display: isPie } },
        scales: isPie ? {} : { y: { beginAtZero: true } } },
      plugins: [{ id: "bg", beforeDraw: c => { c.ctx.save(); c.ctx.fillStyle = "#fff"; c.ctx.fillRect(0, 0, c.width, c.height); c.ctx.restore(); } }]
    });
    const url = canvas.toDataURL("image/png");
    ch.destroy();
    return url;
  }

  function groupSum(arr, keyFn, valFn) {
    const m = {};
    arr.forEach(x => { const k = keyFn(x); if (k === undefined || k === null || k === "") return; m[k] = (m[k] || 0) + valFn(x); });
    return Object.entries(m).map(([k, v]) => [k, R2(v)]);
  }

  function addSheet(wb, name, rows, totalCols) {
    const ws = wb.addWorksheet(name);
    const cols = [];
    rows.forEach(r => Object.keys(r).forEach(k => { if (!cols.includes(k)) cols.push(k); }));
    ws.columns = cols.map(c => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
    rows.forEach(r => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    (totalCols || []).forEach(tc => {
      const idx = cols.indexOf(tc);
      if (idx >= 0) { ws.getColumn(idx + 1).numFmt = "#,##0.00"; ws.getColumn(idx + 1).width = 16; }
    });
    return ws;
  }

  function addAnalysis(wb, blocks, kpis, range) {
    const ws = wb.addWorksheet("Analysis", { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 34; ws.getColumn(2).width = 18; ws.getColumn(3).width = 3;
    ws.getCell("A1").value = "DG Store - Data Analysis"; ws.getCell("A1").font = { size: 18, bold: true, color: { argb: "FF4F46E5" } };
    ws.getCell("A2").value = "Period: " + range; ws.getCell("A2").font = { italic: true };
    let r = 4;
    kpis.forEach(([k, v]) => {
      ws.getCell(r, 1).value = k; ws.getCell(r, 1).font = { bold: true };
      ws.getCell(r, 2).value = v; ws.getCell(r, 2).numFmt = "#,##0.00"; ws.getCell(r, 2).font = { bold: true, color: { argb: "FF059669" } };
      r++;
    });
    r += 2;
    blocks.forEach(b => {
      ws.getCell(r, 1).value = b.title; ws.getCell(r, 1).font = { bold: true, size: 13 };
      ws.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
      ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
      ws.getCell(r, 2).value = b.valueLabel; ws.getCell(r, 2).font = { bold: true };
      const startRow = r;
      b.data.forEach((d, i) => { ws.getCell(r + 1 + i, 1).value = d[0]; ws.getCell(r + 1 + i, 2).value = d[1]; ws.getCell(r + 1 + i, 2).numFmt = "#,##0.00"; });
      const img = wb.addImage({ base64: chartImage(b.chart, b.data.map(d => d[0]), b.data.map(d => d[1]), b.title, b.color), extension: "png" });
      ws.addImage(img, { tl: { col: 3, row: startRow - 1 }, ext: { width: 760, height: 340 } });
      r += Math.max(b.data.length + 3, 19);
    });
  }

  function fmtDay(v) { const s = fmtVal(String(v || "")); return String(s).slice(0, 10); }

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
    status.style.color = "";
    let done = 0, empty = [];
    try {
      if (!window.ExcelJS || !window.Chart) throw new Error("Excel/Chart library load nahi hui. Internet check karke page refresh (Ctrl+F5) karein.");
      const wb = new ExcelJS.Workbook();
      const blocks = [], kpis = [];
      const sheets = [];
      let prodById = null, prodByName = null;
      if (picked.includes("purchase_items")) {
        const prods = await fetchAll(() => db.from("products").select("*"));
        prodById = {}; prodByName = {};
        prods.forEach(p => { prodById[String(p.id)] = p; if (p.name) prodByName[String(p.name).trim().toLowerCase()] = p; });
      }

      for (const key of picked) {
        const ds = DATASETS.find(d => d.key === key);
        status.textContent = "⏳ Exporting " + ds.label + "...";
        const raw = await fetchDataset(ds, fromVal, toVal);
        if (!raw.length) { empty.push(ds.label); continue; }
        const rows = key === "orders" ? flattenOrders(raw) : raw;

        const clean = rows.map(r => {
          const o = {}; Object.keys(r).forEach(k => { o[k] = fmtVal(r[k]); });
          const qk = pickKey(r, /^(item_)?(qty|quantity)$/);
          const pk = pickKey(r, /^(item_)?(purchase_price|unit_price|price|selling_price)$/);
          if (qk && pk) {
            const pre = key === "orders" ? "item_" : "";
            o[pre + "per_unit_price"] = R2(NUM(r[pk]));
            o[pre + "total_price"] = R2(NUM(r[qk]) * NUM(r[pk]));
            if (key === "purchase_items") {
              const pr = prodById[String(r.product_id)] || prodByName[String(r.product_name || "").trim().toLowerCase()];
              const sp = pr ? NUM(pr.selling_price) : 0;
              o.product_code = pr ? pr.id : (r.product_id && String(r.product_id) !== "0" ? r.product_id : "");
              o.selling_price = R2(sp);
              o.total_selling_price = R2(NUM(r[qk]) * sp);
              o.total_profit = sp ? R2(NUM(r[qk]) * (sp - NUM(r[pk]))) : 0;
            }
          }
          return o;
        });
        const tcols = ["total_price", "item_total_price", "per_unit_price", "item_per_unit_price", "total_selling_price", "total_profit", "total_amount", "amount", "selling_price", "purchase_price", "price"];

        if (key === "purchase_items" && clean.length && clean[0].total_price !== undefined) {
          const sum = R2(clean.reduce((s, o) => s + NUM(o.total_price), 0));
          const first = Object.keys(clean[0])[0];
          clean.push({ [first]: "" });
          clean.push({ [first]: "GRAND TOTAL", total_price: sum, total_selling_price: R2(clean.reduce((s, o) => s + NUM(o.total_selling_price), 0)), total_profit: R2(clean.reduce((s, o) => s + NUM(o.total_profit), 0)) });
        }
        sheets.push([ds.sheet, clean, tcols]);

        /* ---- analysis blocks ---- */
        if (key === "orders") {
          const live = raw.filter(o => o.status !== "cancelled");
          const tk = pickKey(raw[0], /^(total_amount|total|grand_total|amount)$/);
          if (tk) {
            const total = R2(live.reduce((s, o) => s + NUM(o[tk]), 0));
            kpis.push(["Total Orders (non-cancelled)", live.length], ["Total Sales (Rs)", total], ["Average Order Value (Rs)", live.length ? R2(total / live.length) : 0]);
            blocks.push({ title: "Daily Sales (Rs)", valueLabel: "Sales", chart: "line", color: "#10b981",
              data: groupSum(live, o => fmtDay(o.created_at), o => NUM(o[tk])).sort((a, b) => a[0].split("-").reverse().join("").localeCompare(b[0].split("-").reverse().join(""))) });
          }
          const sk = pickKey(raw[0], /^status$/);
          if (sk) blocks.push({ title: "Orders by Status", valueLabel: "Orders", chart: "pie", data: groupSum(raw, o => o[sk], () => 1) });
          const items = rows.filter(r => pickKey(r, /^item_(qty|quantity)$/));
          const nk = items.length ? pickKey(items[0], /^item_(product_name|name|title)$/) : null;
          const iq = items.length ? pickKey(items[0], /^item_(qty|quantity)$/) : null;
          const ip = items.length ? pickKey(items[0], /^item_(price|unit_price|selling_price)$/) : null;
          if (nk && iq && ip) blocks.push({ title: "Top 10 Products by Sales (Rs)", valueLabel: "Sales", chart: "bar", color: "#6366f1",
            data: groupSum(items, r => r[nk], r => NUM(r[iq]) * NUM(r[ip])).sort((a, b) => b[1] - a[1]).slice(0, 10) });
        }
        if (key === "purchase_items") {
          const t = rows.map(r => ({ ...r, _t: NUM(r.quantity) * NUM(r.purchase_price) }));
          const total = R2(t.reduce((s, r) => s + r._t, 0));
          kpis.push(["Total Purchase (Rs)", total], ["Purchase Items Count", t.length]);
          if (t[0] && "supplier_name" in t[0]) blocks.push({ title: "Purchase by Supplier (Rs)", valueLabel: "Amount", chart: "pie",
            data: groupSum(t, r => r.supplier_name, r => r._t).sort((a, b) => b[1] - a[1]) });
          const pn = pickKey(t[0], /^product_name$/);
          if (pn) blocks.push({ title: "Top 10 Purchased Products (Rs)", valueLabel: "Amount", chart: "bar", color: "#f59e0b",
            data: groupSum(t, r => r[pn], r => r._t).sort((a, b) => b[1] - a[1]).slice(0, 10) });
        }
        if (key === "collections") {
          const ak = pickKey(raw[0], /^(amount|total_amount|collection_amount)$/);
          if (ak) {
            kpis.push(["Total Collection (Rs)", R2(raw.reduce((s, r) => s + NUM(r[ak]), 0))]);
            const dk = pickKey(raw[0], /^collection_date$/);
            if (dk) blocks.push({ title: "Daily Collection (Rs)", valueLabel: "Amount", chart: "bar", color: "#06b6d4",
              data: groupSum(raw, r => fmtDay(r[dk]), r => NUM(r[ak])) });
            const mk = pickKey(raw[0], /^(mode|payment_mode|type)$/);
            if (mk) blocks.push({ title: "Collection by Mode", valueLabel: "Amount", chart: "pie", data: groupSum(raw, r => r[mk], r => NUM(r[ak])) });
          }
        }
        if (key === "purchase_orders") {
          const ak = pickKey(raw[0], /^total_amount$/);
          if (ak) kpis.push(["Total Purchase Orders (Rs)", R2(raw.reduce((s, r) => s + NUM(r[ak]), 0))], ["Purchase Orders Count", raw.length]);
        }
        done++;
      }

      if (done) {
        const fm = v => v.split("-").reverse().join("-");
        addAnalysis(wb, blocks, kpis, `${fm(fromVal)} to ${fm(toVal)}`);
        sheets.forEach(([name, rows, tcols]) => addSheet(wb, name, rows, tcols));
        const buf = await wb.xlsx.writeBuffer();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        a.download = `DG_Store_Export_${fromVal}_to_${toVal}.xlsx`;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      }
      status.style.color = done ? "#16a34a" : "#d97706";
      status.textContent = (done ? `✅ 1 Excel file ban gayi (Analysis + ${done} data sheets).` : "⚠️ Koi data nahi mila.") + (empty.length ? ` (Is date range me data nahi mila: ${empty.join(", ")})` : "");
    } catch (e) {
      status.style.color = "#dc2626";
      status.textContent = "❌ Error: " + (e.message || e);
    }
    btn.disabled = false;
  };
})();
