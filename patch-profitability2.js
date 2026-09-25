const fs = require('fs');

const logic = `
/* PRODUCT PROFITABILITY LOGIC */
let rawProfitProducts = [];
let rawProfitOrderItems = [];
let rawProfitPoItems = [];
let rawProfitOrders = [];
let rawProfitPos = [];
let filteredProfitabilityData = [];
let profitabilitySort = { col: 'gpPercent', asc: false };
let profitCharts = { trend: null, gpPercent: null };
let packSizesCache = JSON.parse(localStorage.getItem('profitPackSizes') || '{}');

async function loadProductProfitability() {
  try {
    const tbody = document.getElementById("profitabilityTableBody");
    if(tbody) tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;">Loading raw data from database...</td></tr>';

    const [ { data: products }, { data: allPoItems }, { data: allOrderItems }, { data: pos }, { data: ords } ] = await Promise.all([
      db.from("products").select("*").order("name"),
      db.from("purchase_order_items").select("*"),
      db.from("order_items").select("*"),
      db.from("purchase_orders").select("id, po_number, status, created_at").eq("status", "received"),
      db.from("orders").select("id, status, created_at").neq("status", "cancelled")
    ]);

    rawProfitProducts = products || [];
    rawProfitPoItems = allPoItems || [];
    rawProfitOrderItems = allOrderItems || [];
    rawProfitPos = pos || [];
    rawProfitOrders = ords || [];

    setProfitQuickDate('thisMonth'); // This will trigger applyProfitFilters()
  } catch (err) {
    console.error("Error loading profitability:", err);
    alert("Error loading profitability: " + err.message);
  }
}

function setProfitQuickDate(range) {
  const today = new Date();
  const fromInput = document.getElementById("profitFilterFrom");
  const toInput = document.getElementById("profitFilterTo");
  
  if (range === 'all') {
    fromInput.value = ''; toInput.value = '';
  } else {
    let fromDate = new Date();
    let toDate = new Date();
    
    if (range === 'today') {
      // already today
    } else if (range === 'yesterday') {
      fromDate.setDate(today.getDate() - 1);
      toDate.setDate(today.getDate() - 1);
    } else if (range === 'last7') {
      fromDate.setDate(today.getDate() - 7);
    } else if (range === 'thisMonth') {
      fromDate.setDate(1);
    } else if (range === 'lastMonth') {
      fromDate.setMonth(today.getMonth() - 1);
      fromDate.setDate(1);
      toDate.setMonth(today.getMonth());
      toDate.setDate(0);
    } else if (range === 'thisFY') {
      const month = today.getMonth();
      const year = today.getFullYear();
      if (month < 3) {
        fromDate = new Date(year - 1, 3, 1); // April 1 last year
      } else {
        fromDate = new Date(year, 3, 1); // April 1 this year
      }
    }
    
    // adjust for timezone offset so ISO string matches local date
    const fromStr = new Date(fromDate.getTime() - (fromDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const toStr = new Date(toDate.getTime() - (toDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    fromInput.value = fromStr;
    toInput.value = toStr;
  }
  
  applyProfitFilters();
}

function resetProfitFilters() {
  document.getElementById("profitFilterSearch").value = "";
  document.getElementById("profitFilterGP").value = "";
  document.getElementById("profitFilterStock").value = "";
  document.getElementById("profitFilterStatus").value = "";
  document.getElementById("profitFilterQuickDate").value = "thisMonth";
  setProfitQuickDate('thisMonth');
}

function applyProfitFilters() {
  const fromStr = document.getElementById("profitFilterFrom").value;
  const toStr = document.getElementById("profitFilterTo").value;
  const searchQ = (document.getElementById("profitFilterSearch").value || "").toLowerCase();
  const gpRange = document.getElementById("profitFilterGP").value;
  const stockStat = document.getElementById("profitFilterStock").value;
  const profStat = document.getElementById("profitFilterStatus").value;

  const fromTime = fromStr ? new Date(fromStr + 'T00:00:00').getTime() : 0;
  const toTime = toStr ? new Date(toStr + 'T23:59:59').getTime() : Infinity;

  const receivedPoIds = new Set(rawProfitPos.map(po => String(po.id)));
  const receivedPoNums = new Set(rawProfitPos.map(po => String(po.po_number)));
  const validOrderIds = new Set(rawProfitOrders.map(o => String(o.id)));

  // Fast lookups for dates
  const poDateMap = {};
  rawProfitPos.forEach(po => {
    const d = new Date(po.created_at).getTime();
    poDateMap[po.id] = d;
    poDateMap[po.po_number] = d;
  });

  const orderDateMap = {};
  rawProfitOrders.forEach(o => {
    orderDateMap[o.id] = new Date(o.created_at).getTime();
  });

  let totPurchVal = 0, totSalesVal = 0, totActualGp = 0, totStockVal = 0, totPotGp = 0;

  // Process each product
  filteredProfitabilityData = [];
  const prodStatsMap = {};

  rawProfitProducts.forEach(p => {
    const sku = getProductSku(p.id, p.name);
    
    // Check Search
    if (searchQ && !p.name.toLowerCase().includes(searchQ) && !sku.toLowerCase().includes(searchQ)) return;

    const currentStock = Number(p.stock_qty || 0);
    const purchaseCost = Number(p.cost_price || 0); // Box/Carton Cost
    const currentSellingPrice = Number(p.selling_price || p.price || 0); // Unit Sell Price
    const packSize = Number(packSizesCache[p.id]) || 1;
    const unitCost = purchaseCost / packSize;
    
    const gpUnit = currentSellingPrice - unitCost;
    const currentGpPercent = currentSellingPrice > 0 ? (gpUnit / currentSellingPrice * 100) : 0;
    
    let qtyPurchased = 0, purchaseValue = 0;
    let qtySold = 0, salesValue = 0, actualGP = 0;
    
    let prodPurchaseHistory = [];
    let prodSalesHistory = [];

    // Filter purchases
    rawProfitPoItems.forEach(poi => {
      if (String(poi.product_id) === String(p.id) || String(poi.product_name) === String(p.name)) {
        if (receivedPoIds.has(String(poi.po_id)) || receivedPoNums.has(String(poi.po_id))) {
          const pDate = poDateMap[poi.po_id];
          if (pDate >= fromTime && pDate <= toTime) {
            qtyPurchased += Number(poi.quantity || 0);
            const val = (Number(poi.quantity || 0) * Number(poi.purchase_price || 0));
            purchaseValue += val;
            prodPurchaseHistory.push({ date: pDate, qty: poi.quantity, rate: poi.purchase_price, val: val });
          }
        }
      }
    });

    // Filter sales
    rawProfitOrderItems.forEach(oi => {
      if (String(oi.product_id) === String(p.id) || String(oi.product_name) === String(p.name)) {
        if (validOrderIds.has(String(oi.order_id))) {
          const sDate = orderDateMap[oi.order_id];
          if (sDate >= fromTime && sDate <= toTime) {
            qtySold += Number(oi.quantity || 0);
            const val = (Number(oi.quantity || 0) * Number(oi.price || 0));
            salesValue += val;
            const itemGp = val - (Number(oi.quantity || 0) * unitCost);
            actualGP += itemGp;
            prodSalesHistory.push({ date: sDate, qty: oi.quantity, rate: oi.price, val: val, gp: itemGp });
          }
        }
      }
    });

    const periodGpPercent = salesValue > 0 ? (actualGP / salesValue * 100) : 0;
    const potentialGP = currentStock > 0 ? (currentStock * gpUnit) : 0;
    const stockVal = currentStock > 0 ? (currentStock * unitCost) : 0;

    // Filter by Stock Status
    if (stockStat === 'in' && currentStock <= 0) return;
    if (stockStat === 'out' && currentStock > 0) return;

    // Filter by GP Range (Period GP%)
    if (gpRange === '<0' && periodGpPercent >= 0) return;
    if (gpRange === '0-10' && (periodGpPercent < 0 || periodGpPercent > 10)) return;
    if (gpRange === '10-30' && (periodGpPercent <= 10 || periodGpPercent > 30)) return;
    if (gpRange === '>30' && periodGpPercent <= 30) return;

    // Filter by Profit Status
    if (profStat === 'profitable' && actualGP <= 0) return;
    if (profStat === 'low' && (periodGpPercent <= 0 || periodGpPercent >= 10)) return;
    if (profStat === 'loss' && periodGpPercent >= 0) return;

    totPurchVal += purchaseValue;
    totSalesVal += salesValue;
    totActualGp += actualGP;
    // Potentials and stock are current, but we still sum them up for the filtered view
    totPotGp += potentialGP;
    totStockVal += stockVal;

    filteredProfitabilityData.push({
      id: p.id, name: p.name, sku,
      qtyPurchased, qtySold, currentStock,
      purchaseCost, packSize, unitCost, purchaseValue, currentSellingPrice, salesValue,
      gpUnit, gpPercent: periodGpPercent, actualGP, potentialGP, stockVal,
      currentGpPercent: currentGpPercent,
      prodPurchaseHistory, prodSalesHistory
    });
  });

  const overallGpPercent = totSalesVal > 0 ? (totActualGp / totSalesVal * 100) : 0;
  
  if(document.getElementById("profitSummaryTotalPurchase")) document.getElementById("profitSummaryTotalPurchase").textContent = \`₹\${totPurchVal.toFixed(2)}\`;
  if(document.getElementById("profitSummaryTotalSales")) document.getElementById("profitSummaryTotalSales").textContent = \`₹\${totSalesVal.toFixed(2)}\`;
  if(document.getElementById("profitSummaryActualGP")) document.getElementById("profitSummaryActualGP").textContent = \`₹\${totActualGp.toFixed(2)}\`;
  if(document.getElementById("profitSummaryOverallGP")) document.getElementById("profitSummaryOverallGP").textContent = \`\${overallGpPercent.toFixed(2)}%\`;
  if(document.getElementById("profitSummaryStockValue")) document.getElementById("profitSummaryStockValue").textContent = \`₹\${totStockVal.toFixed(2)}\`;
  if(document.getElementById("profitSummaryPotentialGP")) document.getElementById("profitSummaryPotentialGP").textContent = \`₹\${totPotGp.toFixed(2)}\`;

  calculateMoMPerformance();
  renderProfitCharts();
  renderProfitabilityLists();
  renderProfitabilityTable();
}

function calculateMoMPerformance() {
  const today = new Date();
  
  // Current Month MTD
  const thisStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const thisEnd = today.getTime();
  
  // Last Month
  const lastStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime();
  const lastEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59).getTime();

  let tP=0, tS=0, tG=0;
  let lP=0, lS=0, lG=0;

  // Faster aggregation for MoM (all products, ignore filters)
  const receivedPoIds = new Set(rawProfitPos.map(po => String(po.id)));
  const validOrderIds = new Set(rawProfitOrders.map(o => String(o.id)));
  const poDateMap = {};
  rawProfitPos.forEach(po => { poDateMap[po.id] = new Date(po.created_at).getTime(); poDateMap[po.po_number] = poDateMap[po.id]; });
  const orderDateMap = {};
  rawProfitOrders.forEach(o => { orderDateMap[o.id] = new Date(o.created_at).getTime(); });

  const costMap = {};
  rawProfitProducts.forEach(p => { 
    const pack = Number(packSizesCache[p.id]) || 1;
    costMap[p.id] = Number(p.cost_price || 0) / pack; 
    costMap[p.name] = Number(p.cost_price || 0) / pack; 
  });

  rawProfitPoItems.forEach(poi => {
    if (receivedPoIds.has(String(poi.po_id)) || poDateMap[poi.po_id]) {
      const pDate = poDateMap[poi.po_id];
      const val = (Number(poi.quantity || 0) * Number(poi.purchase_price || 0));
      if (pDate >= thisStart && pDate <= thisEnd) tP += val;
      else if (pDate >= lastStart && pDate <= lastEnd) lP += val;
    }
  });

  rawProfitOrderItems.forEach(oi => {
    if (validOrderIds.has(String(oi.order_id))) {
      const sDate = orderDateMap[oi.order_id];
      const val = (Number(oi.quantity || 0) * Number(oi.price || 0));
      const cost = costMap[oi.product_id] || costMap[oi.product_name] || 0;
      const itemGp = val - (Number(oi.quantity || 0) * cost);
      if (sDate >= thisStart && sDate <= thisEnd) { tS += val; tG += itemGp; }
      else if (sDate >= lastStart && sDate <= lastEnd) { lS += val; lG += itemGp; }
    }
  });

  const tGpP = tS > 0 ? (tG / tS * 100) : 0;
  const lGpP = lS > 0 ? (lG / lS * 100) : 0;

  if (document.getElementById("momThisPurch")) {
    document.getElementById("momThisPurch").textContent = \`₹\${tP.toFixed(2)}\`;
    document.getElementById("momLastPurch").textContent = \`₹\${lP.toFixed(2)}\`;
    document.getElementById("momThisSales").textContent = \`₹\${tS.toFixed(2)}\`;
    document.getElementById("momLastSales").textContent = \`₹\${lS.toFixed(2)}\`;
    document.getElementById("momThisGP").textContent = \`₹\${tG.toFixed(2)}\`;
    document.getElementById("momLastGP").textContent = \`₹\${lG.toFixed(2)}\`;
    document.getElementById("momThisGPPercent").textContent = \`\${tGpP.toFixed(2)}%\`;
    document.getElementById("momLastGPPercent").textContent = \`\${lGpP.toFixed(2)}%\`;
    
    // Updates KPI comparisons
    updateKPIComp("profitCompTotalPurchase", tP, lP);
    updateKPIComp("profitCompTotalSales", tS, lS);
    updateKPIComp("profitCompActualGP", tG, lG);
    updateKPIComp("profitCompOverallGP", tGpP, lGpP, true);
    
    const pChange = lP > 0 ? ((tP - lP)/lP * 100) : 0;
    const sChange = lS > 0 ? ((tS - lS)/lS * 100) : 0;
    const gChange = lG > 0 ? ((tG - lG)/lG * 100) : 0;
    const gpChange = tGpP - lGpP;

    document.getElementById("momChangePurch").innerHTML = lP > 0 ? \`<span class="profit-card-change \${pChange>0?'up':pChange<0?'down':'neutral'}">\${pChange>0?'↑':'↓'} \${Math.abs(pChange).toFixed(1)}%</span>\` : 'N/A';
    document.getElementById("momChangeSales").innerHTML = lS > 0 ? \`<span class="profit-card-change \${sChange>0?'up':sChange<0?'down':'neutral'}">\${sChange>0?'↑':'↓'} \${Math.abs(sChange).toFixed(1)}%</span>\` : 'N/A';
    document.getElementById("momChangeGP").innerHTML = lG > 0 ? \`<span class="profit-card-change \${gChange>0?'up':gChange<0?'down':'neutral'}">\${gChange>0?'↑':'↓'} \${Math.abs(gChange).toFixed(1)}%</span>\` : 'N/A';
    document.getElementById("momChangeGPPercent").innerHTML = \`<span class="profit-card-change \${gpChange>0?'up':gpChange<0?'down':'neutral'}">\${gpChange>0?'↑':'↓'} \${Math.abs(gpChange).toFixed(1)}pt</span>\`;
  }
}

function updateKPIComp(id, t, l, isPt=false) {
  const el = document.getElementById(id);
  if(!el) return;
  if(l === 0 && !isPt) { el.textContent = 'N/A'; el.className = 'profit-card-change neutral'; return; }
  
  let diff = 0, text = "";
  if(isPt) {
    diff = t - l;
    text = \`\${diff>0?'↑':'↓'} \${Math.abs(diff).toFixed(1)}pt vs Last Mth\`;
  } else {
    diff = (t - l)/l * 100;
    text = \`\${diff>0?'↑':'↓'} \${Math.abs(diff).toFixed(1)}% vs Last Mth\`;
  }
  
  el.textContent = text;
  el.className = \`profit-card-change \${diff>0?'up':diff<0?'down':'neutral'}\`;
}

function renderProfitCharts() {
  if (typeof Chart === 'undefined') return;
  
  const period = document.getElementById("profitChartPeriod")?.value || "monthly";
  
  // Aggregate data from valid orders and pos based on filter dates
  const fromStr = document.getElementById("profitFilterFrom").value;
  const toStr = document.getElementById("profitFilterTo").value;
  const fromTime = fromStr ? new Date(fromStr + 'T00:00:00').getTime() : 0;
  const toTime = toStr ? new Date(toStr + 'T23:59:59').getTime() : Infinity;

  const validOrderIds = new Set(rawProfitOrders.map(o => String(o.id)));
  const receivedPoIds = new Set(rawProfitPos.map(po => String(po.id)));
  const poDateMap = {}; rawProfitPos.forEach(po => { poDateMap[po.id] = new Date(po.created_at).getTime(); poDateMap[po.po_number] = poDateMap[po.id]; });
  const orderDateMap = {}; rawProfitOrders.forEach(o => { orderDateMap[o.id] = new Date(o.created_at).getTime(); });
  const costMap = {}; rawProfitProducts.forEach(p => { 
    const pack = Number(packSizesCache[p.id]) || 1;
    costMap[p.id] = Number(p.cost_price || 0) / pack; 
    costMap[p.name] = Number(p.cost_price || 0) / pack; 
  });

  const bucketMap = {}; // { 'YYYY-MM': { purch, sales, gp } }
  
  const getBucket = (ts) => {
    const d = new Date(ts);
    if(period === 'monthly') return \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}\`;
    if(period === 'daily') return \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}-\${String(d.getDate()).padStart(2,'0')}\`;
    if(period === 'weekly') {
      const firstDay = new Date(d.setDate(d.getDate() - d.getDay()));
      return \`\${firstDay.getFullYear()}-\${String(firstDay.getMonth()+1).padStart(2,'0')}-\${String(firstDay.getDate()).padStart(2,'0')}\`;
    }
  };

  rawProfitPoItems.forEach(poi => {
    if (receivedPoIds.has(String(poi.po_id)) || poDateMap[poi.po_id]) {
      const pDate = poDateMap[poi.po_id];
      if (pDate >= fromTime && pDate <= toTime) {
        const bk = getBucket(pDate);
        if(!bucketMap[bk]) bucketMap[bk] = { purch:0, sales:0, gp:0 };
        bucketMap[bk].purch += (Number(poi.quantity || 0) * Number(poi.purchase_price || 0));
      }
    }
  });

  rawProfitOrderItems.forEach(oi => {
    if (validOrderIds.has(String(oi.order_id))) {
      const sDate = orderDateMap[oi.order_id];
      if (sDate >= fromTime && sDate <= toTime) {
        const bk = getBucket(sDate);
        if(!bucketMap[bk]) bucketMap[bk] = { purch:0, sales:0, gp:0 };
        const val = (Number(oi.quantity || 0) * Number(oi.price || 0));
        const cost = costMap[oi.product_id] || costMap[oi.product_name] || 0;
        bucketMap[bk].sales += val;
        bucketMap[bk].gp += val - (Number(oi.quantity || 0) * cost);
      }
    }
  });

  const labels = Object.keys(bucketMap).sort();
  const dPurch = labels.map(l => bucketMap[l].purch);
  const dSales = labels.map(l => bucketMap[l].sales);
  const dGP = labels.map(l => bucketMap[l].gp);
  const dGPPct = labels.map(l => bucketMap[l].sales > 0 ? (bucketMap[l].gp / bucketMap[l].sales * 100).toFixed(1) : 0);

  if (profitCharts.trend) profitCharts.trend.destroy();
  if (profitCharts.gpPercent) profitCharts.gpPercent.destroy();

  const ctxTrend = document.getElementById('profitTrendChart');
  if (ctxTrend) {
    profitCharts.trend = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Sales Value (₹)', data: dSales, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.1)', fill: true, tension: 0.3 },
          { label: 'Purchase Value (₹)', data: dPurch, borderColor: '#64748b', borderDash: [5, 5], fill: false, tension: 0.3 },
          { label: 'Actual GP (₹)', data: dGP, borderColor: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.1)', fill: true, tension: 0.3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false } }
    });
  }

  const ctxGpPct = document.getElementById('gpPercentChart');
  if (ctxGpPct) {
    profitCharts.gpPercent = new Chart(ctxGpPct, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: 'GP %', data: dGPPct, backgroundColor: '#f59e0b', borderRadius: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

function renderProfitabilityLists() {
  const byGP = [...filteredProfitabilityData].filter(d => d.actualGP > 0).sort((a,b) => b.actualGP - a.actualGP).slice(0,10);
  const byMargin = [...filteredProfitabilityData].filter(d => d.salesValue > 0 && d.gpPercent > 0).sort((a,b) => b.gpPercent - a.gpPercent).slice(0,10);
  const lowMargin = [...filteredProfitabilityData].filter(d => d.salesValue > 0 && d.gpPercent >= 0 && d.gpPercent <= 10).sort((a,b) => a.gpPercent - b.gpPercent).slice(0,10);
  const lossMaking = [...filteredProfitabilityData].filter(d => d.salesValue > 0 && (d.gpPercent < 0 || d.actualGP < 0)).sort((a,b) => a.actualGP - b.actualGP).slice(0,10);
  const byOpportunity = [...filteredProfitabilityData].filter(d => d.potentialGP > 0).sort((a,b) => b.potentialGP - a.potentialGP).slice(0,10);

  const renderTrs = (data, mapFn) => data.length ? data.map(mapFn).join('') : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">No products found</td></tr>';

  const tActualGP = document.getElementById("topActualGPTable");
  if(tActualGP) tActualGP.innerHTML = '<thead><tr><th>Product</th><th>Sales</th><th>GP</th><th>GP%</th></tr></thead><tbody>' + 
    renderTrs(byGP, d => \`<tr><td class="col-product-name" onclick="showProductProfitDetailModal('\${d.id}')">\${d.name}</td><td>₹\${d.salesValue.toFixed(0)}</td><td style="color:var(--success);">₹\${d.actualGP.toFixed(0)}</td><td>\${d.gpPercent.toFixed(1)}%</td></tr>\`) + '</tbody>';

  const tMargin = document.getElementById("topMarginTable");
  if(tMargin) tMargin.innerHTML = '<thead><tr><th>Product</th><th>Sales</th><th>GP</th><th>GP%</th></tr></thead><tbody>' + 
    renderTrs(byMargin, d => \`<tr><td class="col-product-name" onclick="showProductProfitDetailModal('\${d.id}')">\${d.name}</td><td>₹\${d.salesValue.toFixed(0)}</td><td>₹\${d.actualGP.toFixed(0)}</td><td style="color:var(--primary);">\${d.gpPercent.toFixed(1)}%</td></tr>\`) + '</tbody>';

  const tLow = document.getElementById("lowMarginTable");
  if(tLow) tLow.innerHTML = '<thead><tr><th>Product</th><th>Cost</th><th>Price</th><th>GP%</th></tr></thead><tbody>' + 
    renderTrs(lowMargin, d => \`<tr><td class="col-product-name" onclick="showProductProfitDetailModal('\${d.id}')">\${d.name}</td><td>₹\${d.unitCost.toFixed(1)}</td><td>₹\${d.currentSellingPrice.toFixed(0)}</td><td style="color:#b45309;">\${d.gpPercent.toFixed(1)}%</td></tr>\`) + '</tbody>';

  const tLoss = document.getElementById("lossMakingTable");
  if(tLoss) tLoss.innerHTML = '<thead><tr><th>Product</th><th>Cost</th><th>Price</th><th>Loss</th></tr></thead><tbody>' + 
    renderTrs(lossMaking, d => \`<tr><td class="col-product-name" onclick="showProductProfitDetailModal('\${d.id}')">\${d.name}</td><td>₹\${d.unitCost.toFixed(1)}</td><td>₹\${d.currentSellingPrice.toFixed(0)}</td><td style="color:var(--danger);">₹\${d.actualGP.toFixed(0)}</td></tr>\`) + '</tbody>';

  const tOpp = document.getElementById("opportunityTable");
  if(tOpp) tOpp.innerHTML = '<thead><tr><th>Product</th><th>Stock</th><th>Stock Val</th><th>Pot. GP</th></tr></thead><tbody>' + 
    renderTrs(byOpportunity, d => \`<tr><td class="col-product-name" onclick="showProductProfitDetailModal('\${d.id}')">\${d.name}</td><td>\${d.currentStock}</td><td>₹\${d.stockVal.toFixed(0)}</td><td style="color:var(--blue);">₹\${d.potentialGP.toFixed(0)}</td></tr>\`) + '</tbody>';

  // Inventory Aging logic
  const now = new Date().getTime();
  let b0=0, b30=0, b60=0, b90=0; // PotGP
  let s0=0, s30=0, s60=0, s90=0; // StockVal
  
  filteredProfitabilityData.forEach(d => {
    if(d.currentStock <= 0) return;
    let latestPurch = 0;
    if(d.prodPurchaseHistory && d.prodPurchaseHistory.length > 0) {
      latestPurch = Math.max(...d.prodPurchaseHistory.map(h => h.date));
    }
    const daysOld = latestPurch > 0 ? (now - latestPurch)/(1000*60*60*24) : 999;
    if(daysOld <= 30) { b0 += d.potentialGP; s0 += d.stockVal; }
    else if(daysOld <= 60) { b30 += d.potentialGP; s30 += d.stockVal; }
    else if(daysOld <= 90) { b60 += d.potentialGP; s60 += d.stockVal; }
    else { b90 += d.potentialGP; s90 += d.stockVal; }
  });

  const tAging = document.getElementById("inventoryAgingTable");
  if(tAging) tAging.innerHTML = \`
    <tr><td>0-30 Days</td><td>₹\${s0.toFixed(0)}</td><td style="color:var(--blue);">₹\${b0.toFixed(0)}</td></tr>
    <tr><td>31-60 Days</td><td>₹\${s30.toFixed(0)}</td><td style="color:var(--blue);">₹\${b30.toFixed(0)}</td></tr>
    <tr><td>61-90 Days</td><td>₹\${s60.toFixed(0)}</td><td style="color:var(--blue);">₹\${b60.toFixed(0)}</td></tr>
    <tr><td>90+ Days</td><td>₹\${s90.toFixed(0)}</td><td style="color:var(--blue);">₹\${b90.toFixed(0)}</td></tr>
  \`;
}

function updateProfitabilityPackSize(prodId, val) {
  const pack = Number(val) || 1;
  packSizesCache[prodId] = pack;
  localStorage.setItem('profitPackSizes', JSON.stringify(packSizesCache));
  applyProfitFilters();
}

function renderProfitabilityTable() {
  const tbody = document.getElementById("profitabilityTableBody");
  if (!tbody) return;

  const data = [...filteredProfitabilityData];
  data.sort((a, b) => {
    let valA = a[profitabilitySort.col];
    let valB = b[profitabilitySort.col];
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return profitabilitySort.asc ? -1 : 1;
    if (valA > valB) return profitabilitySort.asc ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = data.map(d => {
    return \`
      <tr>
        <td class="col-product-name" title="\${d.name}" onclick="showProductProfitDetailModal('\${d.id}')"><strong>\${d.name}</strong></td>
        <td><span style="font-size:11px; background:var(--surface); padding:2px 6px; border-radius:6px; border:1px solid var(--border);">\${d.sku}</span></td>
        <td style="text-align:right;">\${d.qtyPurchased}</td>
        <td style="text-align:right;">\${d.qtySold}</td>
        <td style="text-align:right;"><strong style="color: \${d.currentStock <= 5 ? 'var(--danger)' : 'var(--text-dark)'};">\${d.currentStock}</strong></td>
        <td style="text-align:right; color:var(--text-muted);">₹\${d.purchaseCost.toFixed(2)}</td>
        <td style="text-align:right; padding:2px;">
          <input type="number" min="1" style="width:40px; font-size:11px; border:1px solid var(--border); border-radius:4px; padding:2px; text-align:center; background:var(--surface);" value="\${d.packSize}" onchange="updateProfitabilityPackSize('\${d.id}', this.value)" title="Pack Size / Pieces per Box" />
        </td>
        <td style="text-align:right; font-size:10px; color:#64748b;">₹\${d.unitCost.toFixed(2)}</td>
        <td style="text-align:right;">
          <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
            <span style="font-size:11px; color:var(--text-muted);">₹</span>
            <input type="text" inputmode="decimal" class="price-edit-input" style="width:60px; border-color:var(--primary); font-weight:bold; color:var(--success); background:var(--surface); text-align:right;" value="\${d.currentSellingPrice.toFixed(2)}" onchange="updateProfitabilitySellingPrice('\${d.id}', '\${d.currentSellingPrice}', this.value)" />
          </div>
        </td>
        <td style="text-align:right;">₹\${d.salesValue.toFixed(2)}</td>
        <td style="text-align:right;"><span style="color:\${d.gpUnit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">₹\${d.gpUnit.toFixed(2)}</span></td>
        <td style="text-align:right;"><span style="color:\${d.gpPercent >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">\${d.gpPercent.toFixed(2)}%</span></td>
        <td style="text-align:right;"><strong style="color:var(--primary);">₹\${d.actualGP.toFixed(2)}</strong></td>
        <td style="text-align:right;"><strong style="color:var(--blue);">₹\${d.potentialGP.toFixed(2)}</strong></td>
      </tr>
    \`;
  }).join('');
}

function sortProfitability(col) {
  if (profitabilitySort.col === col) profitabilitySort.asc = !profitabilitySort.asc;
  else { profitabilitySort.col = col; profitabilitySort.asc = true; }
  renderProfitabilityTable();
}

async function updateProfitabilitySellingPrice(prodId, oldVal, newVal) {
  const oldPrice = Number(oldVal) || 0;
  const newPrice = Number(newVal) || 0;
  if (oldPrice === newPrice) return;

  if (!confirm(\`Update Selling Price?\\n\\nOld Price: ₹\${oldPrice.toFixed(2)}\\nNew Price: ₹\${newPrice.toFixed(2)}\\n\\nNote: This will recalculate Current GP% and Potential GP for remaining stock. It will NOT change historical GP.\`)) {
    applyProfitFilters(); // refresh table to revert input
    return;
  }

  const idCond = !isNaN(Number(prodId)) ? Number(prodId) : prodId;
  const { error } = await db.from("products").update({ selling_price: newPrice }).or(\`id.eq.\${idCond},id.eq.\${String(prodId)}\`);
  
  if (error) {
    alert("Selling Price update fail hua: " + error.message);
    loadProductProfitability(); 
  } else {
    // Update raw products cache so filter apply works correctly
    const idx = rawProfitProducts.findIndex(d => String(d.id) === String(prodId));
    if(idx !== -1) {
      rawProfitProducts[idx].selling_price = newPrice;
      
      // Auto sync to google sheet with latest full record
      const tmpSku = getProductSku(rawProfitProducts[idx].id, rawProfitProducts[idx].name);
      const stock = Number(rawProfitProducts[idx].stock_qty||0);
      const cost = Number(rawProfitProducts[idx].cost_price||0);
      const pack = Number(packSizesCache[rawProfitProducts[idx].id]) || 1;
      const unitCost = cost / pack;
      const gp = newPrice - unitCost;
      syncProfitabilityToSheet({
        sku: tmpSku, name: rawProfitProducts[idx].name,
        qtyPurchased: 0, qtySold: 0, currentStock: stock,
        purchaseCost: cost, purchaseValue: 0, currentSellingPrice: newPrice, salesValue: 0,
        gpUnit: gp, gpPercent: newPrice > 0 ? (gp/newPrice*100) : 0, actualGP: 0, potentialGP: stock > 0 ? stock*gp : 0
      }); 
    }
    applyProfitFilters();
  }
}

function showProductProfitDetailModal(prodId) {
  const d = filteredProfitabilityData.find(x => String(x.id) === String(prodId));
  if(!d) return;

  document.getElementById("detailProdName").textContent = d.name;
  document.getElementById("detailProdSKU").textContent = d.sku;
  document.getElementById("detPurchased").textContent = d.qtyPurchased;
  document.getElementById("detSold").textContent = d.qtySold;
  document.getElementById("detStock").textContent = d.currentStock;
  document.getElementById("detActualGP").textContent = \`₹\${d.actualGP.toFixed(2)}\`;
  document.getElementById("detPurchVal").textContent = \`₹\${d.purchaseValue.toFixed(2)}\`;
  document.getElementById("detSalesVal").textContent = \`₹\${d.salesValue.toFixed(2)}\`;
  document.getElementById("detCurrGPPercent").textContent = \`\${d.currentGpPercent.toFixed(2)}%\`;
  document.getElementById("detPotGP").textContent = \`₹\${d.potentialGP.toFixed(2)}\`;

  const pHist = d.prodPurchaseHistory.sort((a,b)=>b.date-a.date).map(x => \`<tr><td>\${new Date(x.date).toLocaleDateString('en-IN')}</td><td>\${x.qty}</td><td>₹\${Number(x.rate).toFixed(2)}</td><td>₹\${x.val.toFixed(2)}</td></tr>\`).join('');
  document.getElementById("detPurchaseHistory").innerHTML = pHist || '<tr><td colspan="4" style="text-align:center;">No purchases in period</td></tr>';

  const sHist = d.prodSalesHistory.sort((a,b)=>b.date-a.date).map(x => \`<tr><td>\${new Date(x.date).toLocaleDateString('en-IN')}</td><td>\${x.qty}</td><td>₹\${Number(x.rate).toFixed(2)}</td><td>₹\${x.gp.toFixed(2)}</td><td>\${x.val>0?(x.gp/x.val*100).toFixed(1):0}%</td></tr>\`).join('');
  document.getElementById("detSalesHistory").innerHTML = sHist || '<tr><td colspan="5" style="text-align:center;">No sales in period</td></tr>';

  document.getElementById("productProfitDetailModal").style.display = "flex";
}

function closeProductProfitDetailModal() {
  document.getElementById("productProfitDetailModal").style.display = "none";
}

function exportProfitabilityCSV() {
  if(!filteredProfitabilityData.length) return alert("No data to export!");
  let csv = "Product,SKU,Qty Purchased,Qty Sold,Current Stock,Box Cost,Pack Size,Unit Cost,Current Selling Price,Sales Value,GP / Unit,Period GP%,Actual GP Generated,Potential GP\\n";
  filteredProfitabilityData.forEach(d => {
    csv += \`"\${d.name.replace(/"/g, '""')}","\${d.sku}",\${d.qtyPurchased},\${d.qtySold},\${d.currentStock},\${d.purchaseCost},\${d.packSize},\${d.unitCost.toFixed(2)},\${d.currentSellingPrice},\${d.salesValue},\${d.gpUnit.toFixed(2)},\${d.gpPercent.toFixed(1)},\${d.actualGP.toFixed(2)},\${d.potentialGP.toFixed(2)}\\n\`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = \`Profitability_Export_\${new Date().toISOString().split('T')[0]}.csv\`;
  a.click();
  URL.revokeObjectURL(url);
}

function syncProfitabilityToSheet(prodData) {
  syncOrderToGoogleSheet({
    targetSheet: "Product Profitability",
    sku: prodData.sku,
    productName: prodData.name,
    qtyPurchased: prodData.qtyPurchased,
    qtySold: prodData.qtySold,
    remainingQty: prodData.currentStock,
    purchaseCost: prodData.purchaseCost,
    purchaseValue: prodData.purchaseValue,
    currentSellingPrice: prodData.currentSellingPrice,
    salesValue: prodData.salesValue,
    gpUnit: prodData.gpUnit,
    gpPercent: prodData.gpPercent,
    actualGP: prodData.actualGP,
    potentialGP: prodData.potentialGP
  });
}

function syncAllProfitabilityToSheets() {
  if (!filteredProfitabilityData || filteredProfitabilityData.length === 0) {
    alert("No profitability data to sync.");
    return;
  }
  if (!confirm(\`Are you sure you want to sync \${filteredProfitabilityData.length} products to Google Sheets?\`)) return;
  filteredProfitabilityData.forEach(prodData => {
    syncProfitabilityToSheet(prodData);
  });
  alert("Sync process started! Check the Sync Queue indicator on the header.");
}
`;

let code = fs.readFileSync('admin.js', 'utf8');
const startIdx = code.indexOf('/* PRODUCT PROFITABILITY LOGIC */');
if(startIdx !== -1) {
  code = code.substring(0, startIdx) + logic;
  fs.writeFileSync('admin.js', code);
  console.log('Successfully patched admin.js');
} else {
  console.log('Could not find logic block!');
}
