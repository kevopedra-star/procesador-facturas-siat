import { supabase } from '../services/supabase.js';

const TABLE_NAME = 'importaciones';

let extractedData = [];
let historyData = []; 
let supabaseClient = supabase; // Conectado mediante el servicio unificado
let recordToDeleteId = null;
let recordToEditId = null; 
let monthlyChartInstance = null; 
let clientChartInstance = null; 
let expandedChartInstance = null;
let selectedAduanas = new Set();
let currentPage = 0;
const pageSize = 50;
let totalRecords = 0;
let searchDebounceTimer = null;

// --- CONFIGURACIÓN DE PDF.JS WORKER ---
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

// --- MANEJO DE TEMA DÍA/NOCHE ---
function toggleTheme() {
    const html = document.documentElement;
    html.classList.toggle('dark');
    localStorage.theme = html.classList.contains('dark') ? 'dark' : 'light';
    
    // Actualizar colores de las gráficas al instante
    if (historyData.length > 0) {
        const isDark = html.classList.contains('dark');
        if (window.Chart) {
            window.Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
            window.Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
        }
        
        if (monthlyChartInstance) monthlyChartInstance.update();
        if (clientChartInstance) clientChartInstance.update();
        if (expandedChartInstance) expandedChartInstance.update();
    }
}

// ----- FUNCIONES PA' LIMPIAR LA MUGRE DE LOS NOMBRES -----
function cleanRazonSocial(text) {
    if (!text || text === '-') return '-';
    return text.split(' - ')[0].trim();
}

function cleanProveedor(text) {
    if (!text || text === '-') return '-';
    let parts = text.split(',');
    if (parts.length === 1) return text.trim();
    let firstPart = parts[0].trim();
    let secondPart = parts[1] ? parts[1].trim() : '';
    if (/^(INC\.?|LLC\.?|LTD\.?|S\.A\.?|S\.A\.C\.?|S\.R\.L\.?|CORP\.?|CORPORATION|CO\.?)\b/i.test(secondPart)) {
        return firstPart + ', ' + secondPart;
    }
    return firstPart;
}

function openCleanModal() { 
    document.getElementById('cleanModal').classList.remove('hidden'); 
}

function closeCleanModal() { 
    document.getElementById('cleanModal').classList.add('hidden'); 
}

async function executeCleanDatabase() {
    closeCleanModal();
    if (!supabaseClient) return showToast("Sin conexión a la base.", true);
    
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loadingText').innerText = "Pasando la escoba...";

    const { data, error } = await supabaseClient.from(TABLE_NAME).select('id, razon_social, proveedor');
    if (error) {
        document.getElementById('loading').classList.add('hidden');
        return showToast("Error al obtener datos: " + error.message, true);
    }

    let updates = [];
    data.forEach(row => {
        const oldRz = row.razon_social || '';
        const oldProv = row.proveedor || '';
        const newRz = cleanRazonSocial(oldRz);
        const newProv = cleanProveedor(oldProv);

        if (oldRz !== newRz || oldProv !== newProv) {
            updates.push({ id: row.id, razon_social: newRz, proveedor: newProv });
        }
    });

    if (updates.length === 0) {
        document.getElementById('loading').classList.add('hidden');
        return showToast("Todo está rechinando de limpio ya.", false, "broom");
    }

    let errores = 0;
    for (const upd of updates) {
        const { error: updateError } = await supabaseClient
            .from(TABLE_NAME)
            .update({ razon_social: upd.razon_social, proveedor: upd.proveedor })
            .eq('id', upd.id);
        if (updateError) errores++;
    }

    document.getElementById('loading').classList.add('hidden');

    if (errores > 0) {
        showToast(`Chale, falló la limpieza en ${errores} registros.`, true);
    } else {
        showToast(`¡A huevo! Se arreglaron ${updates.length} registros.`, false, "broom");
        loadHistory(); 
    }
}

const parseAmount = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    return parseFloat(val.toString().replace(/,/g, '')) || 0;
};

function renderDashboard(dataArray) {
    let totalGA = 0, totalIVA = 0, totalPagar = 0, totalDocs = dataArray.length;
    const clientStats = {};
    const monthlyStats = {}; 

    dataArray.forEach(d => {
        totalGA += parseAmount(d.gravamen || d.customsTax);
        totalIVA += parseAmount(d.iva || d.vatTax);
        totalPagar += parseAmount(d.total_tributos || d.totalTributos);

        let clientName = (d.razon_social || d.razonSocial || 'DESCONOCIDO').trim().toUpperCase();
        if (!clientStats[clientName]) {
            clientStats[clientName] = { count: 0, cif: 0, tributos: 0 };
        }
        clientStats[clientName].count += 1;
        clientStats[clientName].cif += parseAmount(d.total_cif || d.totalCIFValue);
        clientStats[clientName].tributos += parseAmount(d.total_tributos || d.totalTributos);

        let dateStr = d.fecha_aceptacion || d.acceptanceDate || '';
        let monthYear = 'Desconocido';
        let sortKey = '000000';
        
        let dateMatch = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (dateMatch) {
            const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            let mIndex = parseInt(dateMatch[2], 10) - 1;
            let year = dateMatch[3];
            monthYear = `${monthNames[mIndex]} ${year}`;
            sortKey = `${year}${dateMatch[2]}`; 
        }
        
        if (!monthlyStats[monthYear]) {
            monthlyStats[monthYear] = { total: 0, sortKey: sortKey };
        }
        monthlyStats[monthYear].total += parseAmount(d.total_tributos || d.totalTributos);
    });

    document.getElementById('dash-sum-docs').innerText = totalDocs;
    document.getElementById('dash-sum-ga').innerText = totalGA.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('dash-sum-iva').innerText = totalIVA.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('dash-sum-total').innerText = totalPagar.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    const clientsArray = Object.keys(clientStats).map(k => ({
        name: k,
        count: clientStats[k].count,
        cif: clientStats[k].cif,
        tributos: clientStats[k].tributos
    }));

    const byCount = [...clientsArray].sort((a, b) => b.count - a.count);
    const listDespachos = document.getElementById('client-despachos-list');
    listDespachos.innerHTML = '';
    if(byCount.length === 0) {
        listDespachos.innerHTML = '<li class="text-slate-500 text-xs italic py-2">No hay datos todavía.</li>';
    } else {
        byCount.forEach((client) => { 
            let li = `
                <li class="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#222226] transition-colors">
                    <div class="flex items-center truncate mr-2">
                        <i class="fa-regular fa-circle text-orange-500 mr-2 text-[10px]"></i>
                        <span class="text-xs font-bold text-slate-900 dark:text-white truncate transition-colors" title="${client.name}">${client.name}</span>
                    </div>
                    <div class="bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded text-orange-500 font-bold text-[10px] whitespace-nowrap transition-colors">
                        ${client.count} Docs
                    </div>
                </li>
            `;
            listDespachos.insertAdjacentHTML('beforeend', li);
        });
    }

    const byCif = [...clientsArray].sort((a, b) => b.cif - a.cif);
    const listCif = document.getElementById('client-cif-list');
    listCif.innerHTML = '';
    if(byCif.length === 0) {
        listCif.innerHTML = '<li class="text-slate-500 text-xs italic py-2">No hay datos todavía.</li>';
    } else {
        byCif.forEach((client) => {
            let formattedCif = client.cif.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            let li = `
                <li class="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#222226] transition-colors">
                    <div class="flex items-center truncate mr-2">
                        <i class="fa-regular fa-circle text-orange-500 mr-2 text-[10px]"></i>
                        <span class="text-xs font-bold text-slate-900 dark:text-white truncate transition-colors" title="${client.name}">${client.name}</span>
                    </div>
                    <div class="text-orange-500 font-bold text-[10px] whitespace-nowrap transition-colors">
                        Bs. ${formattedCif}
                    </div>
                </li>
            `;
            listCif.insertAdjacentHTML('beforeend', li);
        });
    }

    const monthlyArray = Object.keys(monthlyStats).map(k => ({
        label: k,
        total: monthlyStats[k].total,
        sortKey: monthlyStats[k].sortKey
    })).sort((a, b) => b.sortKey.localeCompare(a.sortKey));

    const listMonthly = document.getElementById('monthly-tributos-list');
    if (listMonthly) {
        listMonthly.innerHTML = '';
        if (monthlyArray.length === 0) {
            listMonthly.innerHTML = '<li class="text-slate-500 text-xs italic py-2">No hay datos todavía.</li>';
        } else {
            monthlyArray.forEach(month => {
                let formattedTotal = month.total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                let li = `
                    <li class="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#222226] transition-colors">
                        <div class="flex items-center truncate mr-2">
                            <i class="fa-regular fa-circle text-orange-500 mr-2 text-[10px]"></i>
                            <span class="text-xs font-bold text-slate-900 dark:text-white capitalize transition-colors">${month.label}</span>
                        </div>
                        <div class="text-orange-500 font-bold text-[10px] whitespace-nowrap transition-colors">
                            Bs. ${formattedTotal}
                        </div>
                    </li>
                `;
                listMonthly.insertAdjacentHTML('beforeend', li);
            });
        }
    }

    updateCharts(monthlyArray, byCif);
}

// --- MANEJO DE GRÁFICOS ---
function updateCharts(monthlyData, clientsData) {
    const ctxMonthly = document.getElementById('monthlyChart');
    const ctxClient = document.getElementById('clientChart');
    
    if (!ctxMonthly || !ctxClient || !window.Chart) return;

    if(monthlyChartInstance) monthlyChartInstance.destroy();
    if(clientChartInstance) clientChartInstance.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    window.Chart.defaults.color = isDark ? '#ffffff' : '#0f172a';
    window.Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';

    const delayedAnimation = {
        duration: 1500,
        easing: 'easeOutQuart',
        delay: (context) => {
            let delay = 0;
            if (context.type === 'data' && context.mode === 'default') {
                delay = context.dataIndex * 150;
            }
            return delay;
        }
    };

    const chartMonths = [...monthlyData].reverse();
    const mLabels = chartMonths.map(m => m.label);
    const mValues = chartMonths.map(m => m.total);

    monthlyChartInstance = new window.Chart(ctxMonthly.getContext('2d'), {
        type: 'bar',
        data: {
            labels: mLabels,
            datasets: [{
                label: 'Total Tributos Pagados (Bs.)',
                data: mValues,
                backgroundColor: 'rgba(249, 115, 22, 0.85)',
                borderColor: '#f97316',
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: delayedAnimation,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' Bs. ' + (c.raw || 0).toLocaleString('en-US', {minimumFractionDigits: 2}); } } } },
            scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
        }
    });

    const topClients = clientsData.slice(0, 15);
    const cLabels = topClients.map(c => c.name.length > 12 ? c.name.substring(0, 12) + '...' : c.name);
    const cCifValues = topClients.map(c => c.cif);
    const cTribValues = topClients.map(c => c.tributos);

    clientChartInstance = new window.Chart(ctxClient.getContext('2d'), {
        type: 'bar',
        data: {
            labels: cLabels,
            datasets: [
                { label: 'Valor CIF', data: cCifValues, backgroundColor: 'rgba(249, 115, 22, 0.85)', borderRadius: 4 },
                { label: 'Tributos', data: cTribValues, backgroundColor: 'rgba(245, 158, 11, 0.85)', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: delayedAnimation,
            plugins: { legend: { display: true, position: 'top', labels: { font: { size: 11 } } }, tooltip: { callbacks: { label: function(c) { return c.dataset.label + ': Bs. ' + (c.raw || 0).toLocaleString('en-US', {minimumFractionDigits: 2}); } } } },
            scales: { y: { beginAtZero: true, grid: { color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)' } }, x: { grid: { display: false } } }
        }
    });
}

// --- EXPANDIR GRÁFICOS ---
function expandChart(chartType) {
    if (!window.Chart) return;
    document.getElementById('chartModal').classList.remove('hidden');
    const ctx = document.getElementById('expandedChartCanvas').getContext('2d');
    let title = "";
    let labels = [];
    let datasets = [];

    if (chartType === 'monthly' && monthlyChartInstance) {
        title = "Evolución Mensual de Tributos";
        labels = monthlyChartInstance.data.labels;
        datasets = monthlyChartInstance.data.datasets;
    } else if (chartType === 'clients' && clientChartInstance) {
        title = "Top Clientes (CIF vs Tributos)";
        labels = clientChartInstance.data.labels;
        datasets = clientChartInstance.data.datasets;
    }

    document.getElementById('chartModalTitle').innerText = title;

    if (expandedChartInstance) expandedChartInstance.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const delayedAnimation = {
        duration: 2000,
        easing: 'easeOutBounce',
        delay: (context) => context.type === 'data' && context.mode === 'default' ? context.dataIndex * 150 : 0
    };

    expandedChartInstance = new window.Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: delayedAnimation,
            plugins: { 
                legend: { 
                    display: chartType === 'clients',
                    position: 'top', 
                    labels: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 14 } } 
                }, 
                tooltip: { 
                    callbacks: { label: function(c) { return (c.dataset.label ? c.dataset.label + ': ' : '') + 'Bs. ' + (c.raw || 0).toLocaleString('en-US', {minimumFractionDigits: 2}); } } 
                } 
            },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }, 
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 14 } } 
                }, 
                x: { 
                    grid: { display: false }, 
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 14 } } 
                } 
            }
        }
    });
}

function closeChartModal() {
    document.getElementById('chartModal').classList.add('hidden');
    if (expandedChartInstance) expandedChartInstance.destroy();
}

function updateUploadSummary(dataArray) {
    let totalGA = 0, totalIVA = 0, totalPagar = 0;
    dataArray.forEach(d => { totalGA += parseAmount(d.customsTax); totalIVA += parseAmount(d.vatTax); totalPagar += parseAmount(d.totalTributos); });
    document.getElementById('upload-sum-ga').innerText = totalGA.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('upload-sum-iva').innerText = totalIVA.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('upload-sum-total').innerText = totalPagar.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
function init() {
    try {
        if (!supabaseClient) {
            console.error("Supabase client not loaded correctly.");
            showToast("Fallo de conexión a la BD", true);
        }
        
        // Inicializar filtro en 'today' (Subidos Hoy) por defecto para ahorrar transferencia de datos en Supabase
        const qf = document.getElementById('quickFilter');
        if (qf) {
            qf.value = 'today';
            applyQuickFilter();
        }
        
    } catch (e) {
        console.error("Error init Supabase", e);
        showToast("Fallo de conexión a la BD", true);
    }
}

function applyQuickFilter() {
    const select = document.getElementById('quickFilter');
    if (!select) return;
    const val = select.value;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const pad = (num) => String(num).padStart(2, '0');
    const formatDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

    if (val === 'today') {
        const todayStr = formatDateStr(now);
        document.getElementById('dateFromFilter').value = todayStr;
        document.getElementById('dateToFilter').value = todayStr;
    } else if (val === '7days') {
        const fromDate = new Date();
        fromDate.setDate(now.getDate() - 7);
        document.getElementById('dateFromFilter').value = formatDateStr(fromDate);
        document.getElementById('dateToFilter').value = formatDateStr(now);
    } else if (val === 'w1') {
        document.getElementById('dateFromFilter').value = `${year}-${pad(month+1)}-01`;
        document.getElementById('dateToFilter').value = `${year}-${pad(month+1)}-07`;
    } else if (val === 'w2') {
        document.getElementById('dateFromFilter').value = `${year}-${pad(month+1)}-08`;
        document.getElementById('dateToFilter').value = `${year}-${pad(month+1)}-14`;
    } else if (val === 'w3') {
        document.getElementById('dateFromFilter').value = `${year}-${pad(month+1)}-15`;
        document.getElementById('dateToFilter').value = `${year}-${pad(month+1)}-21`;
    } else if (val === 'w4') {
        document.getElementById('dateFromFilter').value = `${year}-${pad(month+1)}-22`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        document.getElementById('dateToFilter').value = `${year}-${pad(month+1)}-${pad(lastDay)}`;
    } else if (val === 'all') {
        document.getElementById('dateFromFilter').value = '';
        document.getElementById('dateToFilter').value = '';
    }
    filterHistory();
}

function clearDateFilter() {
    document.getElementById('dateFromFilter').value = '';
    document.getElementById('dateToFilter').value = '';
    const qf = document.getElementById('quickFilter');
    if (qf) qf.value = 'all';
    filterHistory();
}
function switchView(viewName) {
    const uploadView = document.getElementById('uploadView');
    const historyView = document.getElementById('historyView');
    const dashboardView = document.getElementById('dashboardView');
    
    const navUpload = document.getElementById('nav-upload');
    const navHistory = document.getElementById('nav-history');
    const navDashboard = document.getElementById('nav-dashboard');

    const inactiveClasses = "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 px-4 md:px-5 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all cursor-pointer";
    const activeClasses = "bg-white dark:bg-[#1f1f24] text-orange-500 shadow-sm px-4 md:px-5 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all cursor-default";

    uploadView.classList.add('hidden');
    historyView.classList.add('hidden');
    dashboardView.classList.add('hidden');

    navUpload.className = inactiveClasses;
    navHistory.className = inactiveClasses;
    navDashboard.className = inactiveClasses;

    if (viewName === 'upload') {
        uploadView.classList.remove('hidden');
        navUpload.className = activeClasses;
    } else if (viewName === 'history') {
        historyView.classList.remove('hidden');
        navHistory.className = activeClasses;
        loadHistory();
    } else if (viewName === 'dashboard') {
        dashboardView.classList.remove('hidden');
        navDashboard.className = activeClasses;
        loadHistory(); 
    }
}

        let realtimeChannel = null;
        function suscribirTiempoReal() {
            if (!supabaseClient || realtimeChannel) return;
            realtimeChannel = supabaseClient
                .channel('realtime-gestion-principal')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'importaciones' }, (payload) => {
                    if (payload && payload.eventType) {
                        const { eventType, new: newRow, old: oldRow } = payload;
                        if (eventType === 'INSERT' && newRow) {
                            const idx = historyData.findIndex(item => item.id === newRow.id);
                            if (idx >= 0) {
                                historyData[idx] = { ...historyData[idx], ...newRow };
                            } else {
                                historyData.unshift(newRow);
                            }
                        } else if (eventType === 'UPDATE' && newRow) {
                            const idx = historyData.findIndex(item => item.id === newRow.id);
                            if (idx >= 0) {
                                historyData[idx] = { ...historyData[idx], ...newRow };
                            } else {
                                historyData.unshift(newRow);
                            }
                        } else if (eventType === 'DELETE' && oldRow) {
                            historyData = historyData.filter(item => item.id !== oldRow.id);
                        }
                        filterHistory();
                        renderDashboard(historyData);
                    } else {
                        loadHistory();
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas' }, () => { loadHistory(); })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'mtodo' }, () => { loadHistory(); })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'config_nits' }, () => { loadHistory(); })
                .subscribe();
        }

function onSearchInputDebounced() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        loadHistory(0);
    }, 400);
}

function updatePaginationControls() {
    const rangeElem = document.getElementById('paginationRange');
    const totalElem = document.getElementById('paginationTotal');
    const pageInfoElem = document.getElementById('paginationPageInfo');
    const countElem = document.getElementById('historyCount');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (totalRecords === 0) {
        if (rangeElem) rangeElem.innerText = '0 - 0';
        if (totalElem) totalElem.innerText = '0';
        if (countElem) countElem.innerText = '0';
        if (pageInfoElem) pageInfoElem.innerText = 'Página 0 de 0';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    const start = currentPage * pageSize + 1;
    const end = Math.min((currentPage + 1) * pageSize, totalRecords);
    const totalPages = Math.ceil(totalRecords / pageSize);

    if (rangeElem) rangeElem.innerText = `${start} - ${end}`;
    if (totalElem) totalElem.innerText = totalRecords.toLocaleString();
    if (countElem) countElem.innerText = totalRecords.toLocaleString();
    if (pageInfoElem) pageInfoElem.innerText = `Página ${currentPage + 1} de ${totalPages}`;

    if (prevBtn) prevBtn.disabled = (currentPage === 0);
    if (nextBtn) nextBtn.disabled = (currentPage >= totalPages - 1);
}

function goToPrevPage() {
    if (currentPage > 0) {
        loadHistory(currentPage - 1);
    }
}

function goToNextPage() {
    const totalPages = Math.ceil(totalRecords / pageSize);
    if (currentPage < totalPages - 1) {
        loadHistory(currentPage + 1);
    }
}

async function loadHistory(page = 0) {
    if (!supabaseClient) return;
    currentPage = page;
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loadingText').innerText = "Cargando info...";
    
    try {
        const dimCols = 'id, created_at, n_referencia, n_declaracion, razon_social, proveedor, aduana, fecha_aceptacion, items, peso_bruto, total_cif, tipo_cambio, gravamen, iva, total_tributos, modalidad, examen_previo, guia_embarque, guia_courier, documentos_enlaces, documento_asociado, nit_importador, factura, pedido, pedido_sufijo, oi, oc, contenedor';
        
        let query = supabaseClient
            .from(TABLE_NAME)
            .select(dimCols, { count: 'exact' })
            .order('id', { ascending: false });

        // 1. Buscador por texto directo en Supabase (Debounce de 400ms)
        const searchInput = document.getElementById('searchInput');
        const q = searchInput ? searchInput.value.trim() : '';
        if (q) {
            query = query.or(`n_declaracion.ilike.%${q}%,n_referencia.ilike.%${q}%,guia_embarque.ilike.%${q}%,factura.ilike.%${q}%,razon_social.ilike.%${q}%,pedido.ilike.%${q}%`);
        }

        // 2. Filtro por Rango de Fechas (Desde / Hasta)
        const dateFromVal = document.getElementById('dateFromFilter')?.value;
        const dateToVal = document.getElementById('dateToFilter')?.value;
        if (dateFromVal) {
            query = query.gte('created_at', dateFromVal + 'T00:00:00');
        }
        if (dateToVal) {
            query = query.lte('created_at', dateToVal + 'T23:59:59');
        }

        // 3. Filtro por Aduanas Seleccionadas
        if (selectedAduanas.size > 0) {
            const aduanaList = Array.from(selectedAduanas);
            const aduanaOrStr = aduanaList.map(code => `aduana.ilike.%${code}%`).join(',');
            query = query.or(aduanaOrStr);
        }

        // 4. Paginación Servidor (.range(from, to)) - Limitar a 50 filas por página
        const from = currentPage * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        historyData = data || [];
        totalRecords = count !== null ? count : historyData.length;

        suscribirTiempoReal();

        // Limpiar checkbox general del BAT
        const selectAllCheck = document.getElementById('selectAllBat');
        if (selectAllCheck) selectAllCheck.checked = false;

        renderHistoryTable(historyData);
        updatePaginationControls();
        renderDashboard(historyData);
    } catch (err) {
        showToast("Error cargando datos: " + err.message, true);
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function renderHistoryTable(data) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        document.getElementById('noDataMessage').classList.remove('hidden');
        return;
    }
    document.getElementById('noDataMessage').classList.add('hidden');

    data.forEach((item, index) => {
        const isAnticipado = item.modalidad && item.modalidad.includes('ANTICIPADO');
        let docsArray = item.documentos_enlaces;
        if (typeof docsArray === 'string') {
            try { docsArray = JSON.parse(docsArray); } catch(e) { docsArray = []; }
        }
        const docsLinks = docsArray ? (Array.isArray(docsArray) ? docsArray.length : 0) : 0;
        
        const aduanaCode = extractAduanaCode(item.n_declaracion) || '';
        const isCheckedByAduana = (aduanaCode && selectedAduanas.has(aduanaCode));
        const isCheckedAttr = isCheckedByAduana ? 'checked' : '';

        const row = `
            <tr class="border-b border-slate-200 dark:border-slate-800/50 animate-fade-in-up hover:bg-slate-100 dark:hover:bg-[#1e293b]/50 transition-colors group" style="animation-delay: ${Math.min(index * 20, 500)}ms">
                <td class="sticky left-0 z-20 bg-slate-50 dark:bg-[#0f172a] px-3 py-2.5 text-center shadow-[1px_0_0_0_#e2e8f0] dark:shadow-[1px_0_0_0_#1e293b]">
                    <input type="checkbox" class="bat-checkbox doc-checkbox" value="${item.id}" data-aduana="${aduanaCode}" ${isCheckedAttr}>
                </td>
                <td class="sticky left-[3.2rem] z-10 bg-slate-50 dark:bg-[#0f172a] px-4 py-2.5 text-[10px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap shadow-[1px_0_0_0_#e2e8f0] dark:shadow-[1px_0_0_0_#1e293b] transition-colors">${item.n_declaracion || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] font-bold text-orange-500 whitespace-nowrap">${item.n_referencia || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${item.documento_asociado || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] font-bold text-center whitespace-nowrap">
                    <span class="${docsLinks > 0 ? 'bg-custom-orange/20 text-custom-orange' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'} px-2 py-1 rounded-lg">
                        ${docsLinks}
                    </span>
                </td>
                <td class="px-4 py-2.5 text-[10px] font-mono text-custom-purple whitespace-nowrap">${item.nit_importador || '-'}</td>
                <td class="px-4 py-2.5 text-[9px] uppercase font-bold text-slate-700 dark:text-slate-200 max-w-[200px] truncate transition-colors" title="${item.razon_social}">${item.razon_social || '-'}</td>
                
                <td class="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-[#1e293b] rounded transition-colors">${item.factura || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] font-bold text-orange-500 whitespace-nowrap">${item.pedido || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${item.pedido_sufijo || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${item.oi || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${item.oc || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${item.guia_embarque || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 max-w-[140px] truncate transition-colors" title="${item.contenedor}">${item.contenedor || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 max-w-[140px] truncate transition-colors" title="${item.proveedor}">${item.proveedor || '-'}</td>
                <td class="px-4 py-2.5 text-[9px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#1e293b] max-w-[120px] truncate rounded px-2 transition-colors" title="${item.aduana}">${item.aduana || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap transition-colors">${item.fecha_aceptacion || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] font-bold text-center text-slate-700 dark:text-slate-300 transition-colors">${item.items || '0'}</td>
                <td class="px-4 py-2.5 text-[10px] font-bold text-center text-slate-700 dark:text-slate-300 transition-colors">${item.peso_bruto || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] font-mono text-center text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">${item.tipo_cambio || '-'}</td>
                <td class="px-4 py-2.5 text-[10px] font-bold text-right text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">${item.total_cif || '0.00'}</td>
                <td class="px-4 py-2 whitespace-nowrap">
                    <div class="flex flex-col space-y-0.5">
                        <span class="text-[8px] text-slate-400 dark:text-slate-500 flex justify-between w-16 transition-colors"><span class="font-bold">GA:</span> <span class="text-slate-600 dark:text-slate-300">${item.gravamen || '0'}</span></span>
                        <span class="text-[8px] text-slate-400 dark:text-slate-500 flex justify-between w-16 transition-colors"><span class="font-bold">IVA:</span> <span class="text-slate-600 dark:text-slate-300">${item.iva || '0'}</span></span>
                    </div>
                </td>
                <td class="px-4 py-2.5 text-[11px] font-black text-right text-custom-red whitespace-nowrap">${item.total_tributos || '0'}</td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                    <span class="px-1.5 py-0.5 inline-flex text-[8px] font-bold rounded uppercase ${isAnticipado ? 'bg-custom-orange/20 text-custom-orange' : 'bg-orange-500/20 text-orange-500'} border border-transparent">
                        ${item.modalidad || 'N/A'}
                    </span>
                </td>
                <td class="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-[#1e293b] rounded transition-colors">${item.examen_previo || '-'}</td>
                <td class="px-4 py-2.5 text-center whitespace-nowrap">
                    <button onclick="openEditModal(${item.id})" class="text-orange-500 hover:text-orange-500 dark:hover:text-blue-400 rounded transition-colors mr-3" title="Editar registro">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="openDeleteModal(${item.id})" class="text-slate-400 dark:text-slate-500 hover:text-custom-red dark:hover:text-custom-red rounded transition-colors" title="Borrar alv">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
    renderAduanaPills();
}

function parseFechaAceptacion(str) {
    if (!str || str === '-') return null;
    if (str.includes('-') && !str.includes('/')) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
    }
    const firstPart = str.trim().split(' ')[0];
    const parts = firstPart.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function filterHistory() {
    loadHistory(0);
}

function extractAduanaCode(n_declaracion) {
    if (!n_declaracion) return null;
    const parts = n_declaracion.split('-');
    if (parts.length >= 3) {
        const code = parts[2].trim();
        if (/^\d{3}$/.test(code)) {
            return code;
        }
    }
    return null;
}

function renderAduanaPills() {
    const knownAduanas = ['201', '211', '241', '401', '421', '422', '521', '543', '701', '711', '721', '722'];
    const container = document.getElementById('aduanaSelectorsContainer');
    if (container) {
        container.innerHTML = knownAduanas.map(code => {
            const isChecked = selectedAduanas.has(code);
            return `
                <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-[10px] font-black cursor-pointer select-none border border-slate-200 dark:border-slate-700/80 transition-all ${isChecked ? 'ring-2 ring-custom-blue bg-blue-50/50 dark:bg-blue-900/20' : ''}">
                    <input type="checkbox" class="aduana-select-pill-checkbox accent-custom-blue" value="${code}" ${isChecked ? 'checked' : ''} onchange="toggleAduanaPill('${code}', this.checked)">
                    <span>${code}</span>
                </label>
            `;
        }).join('');
    }
}

function toggleAduanaPill(code, isChecked) {
    if (isChecked) {
        selectedAduanas.add(code);
    } else {
        selectedAduanas.delete(code);
    }
    
    // Marcar o desmarcar las casillas visibles en la tabla de inmediato
    const checkboxes = document.querySelectorAll('.doc-checkbox');
    checkboxes.forEach(cb => {
        const aduana = cb.getAttribute('data-aduana');
        if (aduana === code) {
            cb.checked = isChecked;
        }
    });

    renderAduanaPills();
    loadHistory(0);
}

// --- MANEJO DE SELECCIÓN PARA BAT ---
function toggleAllBat() {
    const isChecked = document.getElementById('selectAllBat').checked;
    const checkboxes = document.querySelectorAll('.doc-checkbox');
    checkboxes.forEach(cb => cb.checked = isChecked);
    
    const pills = document.querySelectorAll('.aduana-select-pill-checkbox');
    pills.forEach(pill => {
        pill.checked = isChecked;
        const code = pill.value;
        const parent = pill.parentElement;
        if (isChecked) {
            selectedAduanas.add(code);
            parent.classList.add('ring-2', 'ring-custom-blue', 'bg-blue-50/50', 'dark:bg-blue-900/20');
        } else {
            selectedAduanas.delete(code);
            parent.classList.remove('ring-2', 'ring-custom-blue', 'bg-blue-50/50', 'dark:bg-blue-900/20');
        }
    });

    loadHistory(0);
}

async function generateBatScript() {
    const loadingElem = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    if (loadingElem) loadingElem.classList.remove('hidden');
    if (loadingText) loadingText.innerText = "Consultando Supabase y armando .BAT...";

    try {
        let recordsToProcess = [];
        const checkedBoxes = document.querySelectorAll('.doc-checkbox:checked');
        const selectedIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value)).filter(Boolean);

        if (selectedIds.length > 0 && selectedAduanas.size === 0) {
            // Caso 1: Se marcaron casillas de filas específicas en la tabla (sin filtros de aduana)
            const { data, error } = await supabaseClient
                .from(TABLE_NAME)
                .select('id, n_referencia, razon_social, documentos_enlaces')
                .in('id', selectedIds);
            if (error) throw error;
            recordsToProcess = data || [];
        } else {
            // Caso 2: Se presiona Generar .BAT con filtros activos (Aduanas marcadas, Fechas/Día subido, Buscador)
            let query = supabaseClient
                .from(TABLE_NAME)
                .select('id, n_referencia, razon_social, documentos_enlaces')
                .order('id', { ascending: false });

            const searchInput = document.getElementById('searchInput');
            const q = searchInput ? searchInput.value.trim() : '';
            if (q) {
                query = query.or(`n_declaracion.ilike.%${q}%,n_referencia.ilike.%${q}%,guia_embarque.ilike.%${q}%,factura.ilike.%${q}%,razon_social.ilike.%${q}%,pedido.ilike.%${q}%`);
            }

            const dateFromVal = document.getElementById('dateFromFilter')?.value;
            const dateToVal = document.getElementById('dateToFilter')?.value;
            if (dateFromVal) {
                query = query.gte('created_at', dateFromVal + 'T00:00:00');
            }
            if (dateToVal) {
                query = query.lte('created_at', dateToVal + 'T23:59:59');
            }

            if (selectedAduanas.size > 0) {
                const aduanaList = Array.from(selectedAduanas);
                const aduanaOrStr = aduanaList.map(c => `aduana.ilike.%${c}%`).join(',');
                query = query.or(aduanaOrStr);
            }

            let offset = 0;
            let page = 0;
            const MAX_PAGES = 50;
            const limit = 1000;
            while (page < MAX_PAGES) {
                page++;
                const { data, error } = await query.range(offset, offset + limit - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                recordsToProcess.push(...data);
                if (data.length < limit) break;
                offset += limit;
            }
        }

        if (recordsToProcess.length === 0) {
            return showToast("No hay trámites seleccionados ni coincidentes para generar el .BAT", true);
        }

        let batContent = '@echo off\r\n';
        batContent += 'chcp 65001 > nul\r\n'; 
        batContent += 'echo -----------------------------------------\r\n';
        batContent += 'echo    DESCARGADOR AUTOMATICO DE ADUANA PRO\r\n';
        batContent += 'echo    Modo: Organizacion por Carpetas\r\n';
        batContent += 'echo -----------------------------------------\r\n';
        batContent += 'echo.\r\n';

        let filesProcessed = 0;

        recordsToProcess.forEach(record => {
            let docs = record ? record.documentos_enlaces : null;
            if (typeof docs === 'string') {
                try { docs = JSON.parse(docs); } catch(e) { docs = null; }
            }

            if (record && Array.isArray(docs) && docs.length > 0) {
                filesProcessed++;
                
                const interno = (record.n_referencia || 'Sin_Interno').replace(/[^\w\s.-]/gi, '').trim();
                const razonSocialRaw = record.razon_social || '';
                const cleanedRazon = razonSocialRaw.replace(/[^\w\s.-]/gi, '').trim();
                const folderName = cleanedRazon ? `${interno} - ${cleanedRazon}` : `${interno}`;
                
                batContent += `echo Procesando carpeta: "${folderName}"...\r\n`;
                batContent += `if not exist "${folderName}" mkdir "${folderName}"\r\n`;
                batContent += `cd "${folderName}"\r\n`;

                docs.forEach(doc => {
                    if (!doc || !doc.url) return;
                    const numOrden = doc.num ? doc.num.toString().padStart(2, '0') : '00';
                    const docTipo = doc.tipo || doc.nombre || 'DOCUMENTO';
                    const docNumero = doc.numeroDoc || doc.num || '';
                    const baseName = docNumero ? `${numOrden} - ${docTipo} - ${docNumero}` : `${numOrden} - ${docTipo}`;
                    const safeFileName = baseName.replace(/[^\w\s.-]/gi, '').trim() + '.pdf';
                    
                    batContent += `echo   Descargando: [${numOrden}] ${docTipo}...\r\n`;
                    batContent += `curl -L -s "${doc.url}" -o "${safeFileName}"\r\n`;
                });

                batContent += 'cd ..\r\n'; 
                batContent += 'echo.\r\n';
            }
        });

        if (filesProcessed === 0) {
            return showToast("Ninguno de los trámites filtrados/seleccionados tiene documentos guardados.", true);
        }

        batContent += 'echo -----------------------------------------\r\n';
        batContent += 'echo ¡Listo pariente! Todo descargado y acomodado en su lugar.\r\n';
        batContent += 'echo Presiona cualquier tecla para salir.\r\n';
        batContent += 'pause > nul\r\n';

        const blob = new Blob([batContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Descargar_Carpetas_Aduana.bat';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`¡A huevo! Script listo con ${filesProcessed} carpetas.`, false, "file-code");
    } catch (err) {
        showToast("Error generando .BAT: " + err.message, true);
    } finally {
        if (loadingElem) loadingElem.classList.add('hidden');
    }
}

// --- MANEJO DE EDICIÓN Y BORRADO ---
function openEditModal(id) {
    const record = historyData.find(r => r.id === id);
    if (!record) return;
    recordToEditId = id;
    document.getElementById('edit_n_declaracion').value = record.n_declaracion || '';
    document.getElementById('edit_n_referencia').value = record.n_referencia || '';
    document.getElementById('edit_nit_importador').value = record.nit_importador || '';
    document.getElementById('edit_razon_social').value = record.razon_social || '';
    document.getElementById('edit_documento_asociado').value = record.documento_asociado || '';
    document.getElementById('edit_factura').value = record.factura || '';
    document.getElementById('edit_pedido').value = record.pedido || '';
    document.getElementById('edit_pedido_sufijo').value = record.pedido_sufijo || '';
    document.getElementById('edit_oi').value = record.oi || '';
    document.getElementById('edit_oc').value = record.oc || '';
    document.getElementById('edit_guia_embarque').value = record.guia_embarque || '';
    document.getElementById('edit_contenedor').value = record.contenedor || '';
    document.getElementById('edit_proveedor').value = record.proveedor || '';
    document.getElementById('edit_aduana').value = record.aduana || '';
    document.getElementById('edit_fecha_aceptacion').value = record.fecha_aceptacion || '';
    document.getElementById('edit_items').value = record.items || '';
    document.getElementById('edit_peso_bruto').value = record.peso_bruto || '';
    document.getElementById('edit_total_cif').value = record.total_cif || '';
    document.getElementById('edit_tipo_cambio').value = record.tipo_cambio || '';
    document.getElementById('edit_gravamen').value = record.gravamen || '';
    document.getElementById('edit_iva').value = record.iva || '';
    document.getElementById('edit_total_tributos').value = record.total_tributos || '';
    document.getElementById('edit_modalidad').value = record.modalidad || '';
    document.getElementById('edit_examen_previo').value = record.examen_previo || '';

    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    recordToEditId = null;
    document.getElementById('editModal').classList.add('hidden');
}

async function saveEdit() {
    if (!recordToEditId || !supabaseClient) return;

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loadingText').innerText = "Guardando arreglos...";

    const parseNumeric = (id) => {
        const val = document.getElementById(id).value;
        if (val === null || val === undefined || String(val).trim() === '') {
            return null;
        }
        const cleanVal = String(val).replace(',', '.').trim();
        const parsed = parseFloat(cleanVal);
        return isNaN(parsed) ? null : parsed;
    };

    const updates = {
        n_declaracion: document.getElementById('edit_n_declaracion').value,
        n_referencia: document.getElementById('edit_n_referencia').value,
        nit_importador: document.getElementById('edit_nit_importador').value,
        razon_social: document.getElementById('edit_razon_social').value,
        documento_asociado: document.getElementById('edit_documento_asociado').value,
        factura: document.getElementById('edit_factura').value,
        pedido: document.getElementById('edit_pedido').value,
        pedido_sufijo: document.getElementById('edit_pedido_sufijo').value,
        oi: document.getElementById('edit_oi').value,
        oc: document.getElementById('edit_oc').value,
        guia_embarque: document.getElementById('edit_guia_embarque').value,
        contenedor: document.getElementById('edit_contenedor').value,
        proveedor: document.getElementById('edit_proveedor').value,
        aduana: document.getElementById('edit_aduana').value,
        fecha_aceptacion: document.getElementById('edit_fecha_aceptacion').value,
        items: document.getElementById('edit_items').value,
        peso_bruto: document.getElementById('edit_peso_bruto').value,
        total_cif: parseNumeric('edit_total_cif'),
        tipo_cambio: parseNumeric('edit_tipo_cambio'),
        gravamen: parseNumeric('edit_gravamen'),
        iva: parseNumeric('edit_iva'),
        total_tributos: parseNumeric('edit_total_tributos'),
        modalidad: document.getElementById('edit_modalidad').value,
        examen_previo: document.getElementById('edit_examen_previo').value
    };

    const { error } = await supabaseClient.from(TABLE_NAME).update(updates).eq('id', recordToEditId);
    document.getElementById('loading').classList.add('hidden');

    if (error) {
        showToast("Chale, error al editar: " + error.message, true);
    } else {
        showToast("¡Registro tuneado al cien!", false, "check");
        closeEditModal();
        loadHistory(); 
    }
}

function openDeleteModal(id) { 
    recordToDeleteId = id; 
    document.getElementById('deleteModal').classList.remove('hidden'); 
}

function closeDeleteModal() { 
    recordToDeleteId = null; 
    document.getElementById('deleteModal').classList.add('hidden'); 
}

// --- MANEJO DE EXTRACCIÓN AL SUBIR PDFS ---
async function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length === 0) return;
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loadingText').innerText = "Procesando...";
    extractedData = []; 
    document.getElementById('tableBody').innerHTML = '';
    for (let i = 0; i < files.length; i++) {
        if (files[i].type === "application/pdf") {
            try {
                const textsAndLinks = await extractTextAndLinksFromPDF(files[i]);
                const data = parseData(textsAndLinks, files[i].name);
                
                // Guardar la variable de enlaces mágicos
                data.enlaces_magicos = textsAndLinks.links;
                
                extractedData.push(data);
                renderRow(data, i);
            } catch (error) { 
                console.error(error); 
                showToast(`Error en ${files[i].name}`, true); 
            }
        }
    }
    
    updateUploadSummary(extractedData);
    document.getElementById('resultsArea').classList.remove('hidden');
    document.getElementById('btnSave').classList.remove('hidden');
    document.getElementById('recordCount').innerText = `${extractedData.length} registros`;
    document.getElementById('loading').classList.add('hidden');
    event.target.value = '';
}

// --- EXTRACCIÓN MÁGICA: TEXTO + ENLACES (BAT) ---
async function extractTextAndLinksFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let rawText = "";
    let orderedText = "";
    const documentsMap = new Map();
    const baseUrl = "https://suma.aduana.gob.bo/b-oce/rest/downloadFile/";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const annotations = await page.getAnnotations();
        
        rawText += textContent.items.map(item => item.str).join(' ') + "\n";
        
        let items = textContent.items.map(item => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5]
        })).filter(item => item.str.trim() !== '');

        items.sort((a, b) => {
            const yDiff = b.y - a.y;
            if (Math.abs(yDiff) < 5) return a.x - b.x;
            return yDiff;
        });

        let currentLine = "";
        let lastY = -1;

        items.forEach(item => {
            if (lastY === -1) lastY = item.y;
            if (Math.abs(lastY - item.y) > 5) {
                orderedText += currentLine.trim() + "\n";
                currentLine = "";
            }
            currentLine += item.str + " ";
            lastY = item.y;
        });
        orderedText += currentLine.trim() + "\n\n";

        const links = annotations.filter(ann => ann.url && ann.url.includes(baseUrl));
        if (links.length > 0) {
            links.sort((a, b) => b.rect[1] - a.rect[1]); 
            for (const link of links) {
                const y = link.rect[1];
                const lineItems = textContent.items
                    .filter(item => Math.abs(item.transform[5] - y) < 5)
                    .sort((a, b) => a.transform[4] - b.transform[4]); 

                if (lineItems.length === 0) continue;
                
                const lineText = lineItems.map(item => item.str).join('');
                const cleanRow = lineText.replace(/\s+/g, ' ').replace(/Ver$/, '').trim();
                
                const numMatch = cleanRow.match(/^(\d+)\s/);
                if (!numMatch) continue;

                const num = numMatch[1];
                let textAfterNum = cleanRow.substring(numMatch[0].length).trim();
                
                const emisorKeywords = ['SHANGHAI', 'XIZI', 'TRANSPORTE', 'SEGUROS', 'COMPAÑIA', 'EMPRESA', 'SANTANDER', 'ITI', 'WEIR', 'YELLOW', 'INDUSTRIAL', 'CPL', 'EDISON', 'HUMMINGBIRD', 'ALMACENERA', 'NEW YORK', 'DEZE'];
                const emisorRegex = new RegExp(`(${emisorKeywords.join('|')})`, 'i');
                const emisorMatch = textAfterNum.match(emisorRegex);
                
                let tipoAndNumero;
                if (emisorMatch) {
                    tipoAndNumero = textAfterNum.substring(0, emisorMatch.index).trim();
                } else {
                    const dateMatch = textAfterNum.match(/\s\d{2}\/\d{2}\/\d{4}/);
                    if (dateMatch) tipoAndNumero = textAfterNum.substring(0, dateMatch.index).trim();
                    else tipoAndNumero = textAfterNum;
                }

                const parts = tipoAndNumero.split(' ');
                const numeroDoc = parts.pop() || 'SN';
                const tipo = parts.join(' ').trim();
                const uuidMatch = link.url.match(/[a-f0-9-]{36}/i);

                if (tipo && uuidMatch) {
                    const url = baseUrl + uuidMatch[0];
                    if (!documentsMap.has(url)) {
                        documentsMap.set(url, { num, tipo, numeroDoc, url });
                    }
                }
            }
        }
    }
    
    const finalLinksArray = Array.from(documentsMap.values()).sort((a, b) => parseInt(a.num) - parseInt(b.num));
    return { rawText, orderedText, links: finalLinksArray };
}

function extractValue(text, labelRegexStr) {
    const regex = new RegExp(labelRegexStr + '[:\\s]*([\\S\\s]*?)(?=\\n|A\\d\\.|F\\d\\.|E\\d\\.|B\\d\\.|O\\.I\\.|O\\.C\\.|PEDIDO|FACTURA|\\n\\n|$)', 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
}

function extractCommercialInvoice(text) {
    const m1 = text.match(/E3\.[\s]*N[°º\.]?[\s]*de[\s]*la[\s]*factura[\s:\-]*([A-Z0-9\-\/]+)/i);
    if (m1) return m1[1];
    const m2 = text.match(/FACTURA\s*COMERCIAL\s*[:\s]*([A-Z0-9\-\/]+)/i);
    return m2 ? m2[1] : '-';
}

function extractSimple(text, regexStr, def='-') {
    const m = text.match(new RegExp(regexStr, 'i'));
    return m ? m[1].trim() : def;
}

function extractNIT(text) {
    const regex = /B1\.\s*Importador[\s\S]*?NIT\s*(\d+)/i;
    const match = text.match(regex);
    return match ? match[1] : '-';
}

function extractRazonSocial(text) {
    const regex = /B1\.\s*Importador[\s\S]*?NIT\s*\d+\s+([^\n]+?)(?=\s+OEA|\s+DOMICILIO|\s+TARIJA|\s*,)/i;
    const match = text.match(regex);
    if(match) return match[1].trim();
    const regexSimple = /B1\.\s*Importador[\s\S]*?NIT\s*\d+\s+([^\n]+)/i;
    const matchSimple = text.match(regexSimple);
    return matchSimple ? matchSimple[1].trim() : '-';
}

function extractTaxValue(text, keywordStr) {
    const regex = new RegExp(`^.*?(?:${keywordStr}).*?$`, 'im');
    const match = text.match(regex);
    if (!match) return "0";
    
    const numbers = match[0].match(/[\d.,]+/g);
    if (!numbers || numbers.length === 0) return "0";
    return numbers[numbers.length - 1]; 
}

function extractGuia(text) {
    let m = text.match(/(?:GU[IÍ]A\s*A[EÉ]REA\s*\(AWB\)|GU[IÍ]A\s*COURIER|HAWB[\s:]*|MAWB[\s:]*)[\s\n]*([A-Z0-9\-\/]{5,})/i);
    if (m) return m[1].trim();
    return '-';
}

function extractExamenPrevio(text) {
    let m = text.match(/FORMULARIO\s+DE\s+EXAMEN\s+PREVIO[\s\n\r]*EP-\d{4}-\d{3}-([0-9]+)/i);
    if (m) return m[1].trim();
    return '-';
}

function parseData(texts, fileName) {
    const cleanRawText = texts.rawText.replace(/ {2,}/g, ' ');
    const cleanOrderedText = texts.orderedText.replace(/ {2,}/g, ' ');

    const gaStr = extractTaxValue(cleanOrderedText, "GRAVAMEN\\s+ARANCELARIO");
    const ivaStr = extractTaxValue(cleanOrderedText, "IMPUESTO\\s+AL\\s+VALOR\\s+AGREGADO");
    const totalStr = extractTaxValue(cleanOrderedText, "Total\\s*tributos\\s*a\\s*pagar");

    const parseNum = (str) => parseFloat(str.replace(/,/g, '')) || 0;
    const sumaCalculada = parseNum(gaStr) + parseNum(ivaStr);
    const cuadra = Math.abs(sumaCalculada - parseNum(totalStr)) <= 1;

    return {
        declarationNumber: extractValue(cleanRawText, "A1\\.\\s*N[°º\\.]?\\s*de\\s*declaraci[óo]n") || '-',
        acceptanceDate: extractValue(cleanRawText, "A2\\.\\s*Fecha\\s*de\\s*aceptaci[óo]n") || '-',
        referenceNumber: extractValue(cleanRawText, "A3\\.\\s*N[°º\\.]?\\s*de\\s*referencia") || '-',
        customsOffice: extractValue(cleanRawText, "A4\\.\\s*Aduana\\s*de\\s*despacho") || '-',
        totalItems: extractValue(cleanRawText, "F2\\.\\s*Total\\s*N[°º\\.]?\\s*de\\s*[IíI]tems") || '0',
        tipoCambio: extractSimple(cleanRawText, "E16\\.\\s*Tipo\\s*de\\s*cambio\\s*\\(USD-BOB\\)[\\s:]*([\\d.,]+)", "0.00"),
        totalCIFValue: extractSimple(cleanRawText, "F10\\.\\s*Total\\s*valor\\s*CIF\\s*aduana\\s*\\(BOB\\)[\\s:]*([\\d.,]+)", "0.00"),
        
        customsTax: gaStr,
        vatTax: ivaStr,
        totalTributos: totalStr,
        tributosCuadran: cuadra,
        sumaCalculada: sumaCalculada,

        commercialInvoice: extractCommercialInvoice(cleanRawText),
        providerData: cleanProveedor(extractSimple(cleanRawText, "E1\\.\\s*Datos\\s*del\\s*Proveedor\\s*[:\\s]*([^\\n]+)")),
        
        dispatchMode: (() => {
            const m = cleanRawText.match(/A7\.\s*Modalidad\s*de\s*despacho\s*[\n\r\s]*(01\s*-\s*GENERAL|02\s*-\s*ANTICIPADO)/i);
            if(m && m[1].includes("GENERAL")) return "GENERAL";
            if(m && m[1].includes("ANTICIPADO")) return "ANTICIPADO";
            return '-';
        })(),
        
        pedido: extractSimple(cleanRawText, "(?:^|\\s)(?:\\bPEDIDO\\b|PEDIDO\\s+DE\\s+ORDEN|N[°º\\.]?\\s*PEDIDO)[\\s.:]+([A-Z0-9\\-\\/]+)"),
        oi: extractSimple(cleanRawText, "(?:^|\\s)(?:O\\.?I\\.?|ΟΙ|ORDEN\\s+DE\\s+IMPORTACI[OÓ]N)[\\s.:]+([A-Z0-9\\-\\/]{4,})"),
        oc: extractSimple(cleanRawText, "(?:^|\\s)(?:O\\.?C\\.?|ORDEN\\s+DE\\s+COMPRA)[\\s.:]+([A-Z0-9\\-\\/]{4,})"),
        nitImportador: extractNIT(cleanRawText),
        razonSocial: cleanRazonSocial(extractRazonSocial(cleanRawText)),
        guiaEmbarque: extractGuia(cleanRawText),
        examenPrevio: extractExamenPrevio(cleanRawText),
        sourceFile: fileName,

        // Nuevos campos extraídos de la DIM
        documentoAsociado: (() => {
            let dam = extractSimple(cleanRawText, "A10\\.\\s*N[°º\\.]?\\s*documento\\s*asociado\\s+(DAM-[A-Z0-9\\-]+)", "");
            if (!dam) {
                const flexMatch = extractSimple(cleanRawText, "A10\\.\\s*N[°º\\.]?\\s*documento\\s*asociado\\s+([A-Z0-9\\-]+)", "");
                if (flexMatch && flexMatch.toUpperCase().startsWith('DAM')) {
                    dam = flexMatch;
                }
            }
            if (!dam) {
                const m = cleanRawText.match(/REFERENCIA\s+(DAM-\d{4}-\d+)/i);
                if (m) dam = m[1];
            }
            return dam;
        })(),
        pesoBruto: extractSimple(cleanRawText, "F4\\.\\s*Total\\s*peso\\s*bruto\\s*\\(kg\\)\\s+([\\d.,]+)", ""),
        pedidoSufijo: (() => {
            const m = cleanRawText.match(/(?:PEDIDO|ORDER)[^#\n]*#\s*(\d+)/i) || cleanRawText.match(/#\s*(\d+)/);
            return m ? m[1] : "";
        })(),
        contenedor: (() => {
            const m = cleanRawText.match(/CONTENEDOR\s*:\s*([^\n]+)/i);
            return m ? m[1].trim() : "";
        })()
    };
}

// --- DIBUJADO DE LA TABLA DE CARGA DE ARCHIVOS ---
function renderRow(data, index) {
    const tbody = document.getElementById('tableBody');
    const validacionHtml = data.tributosCuadran 
        ? `` 
        : `<i class="fa-solid fa-triangle-exclamation text-custom-orange ml-1 animate-pulse" title="Discrepancia: Suman ${data.sumaCalculada}"></i>`;
    const isAnticipado = data.dispatchMode.includes('ANTICIPADO');
    const enlacesMagicosLength = data.enlaces_magicos ? data.enlaces_magicos.length : 0;

    const row = `
        <tr class="border-b border-slate-200 dark:border-slate-800/50 animate-fade-in-up hover:bg-slate-100 dark:hover:bg-[#1e293b]/50 transition-colors group" style="animation-delay: ${index * 20}ms">
            <td class="sticky left-0 z-10 bg-slate-50 dark:bg-[#0f172a] px-4 py-2.5 text-[10px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap shadow-[1px_0_0_0_#e2e8f0] dark:shadow-[1px_0_0_0_#1e293b] transition-colors">${data.declarationNumber}</td>
            <td class="px-4 py-2.5 text-[10px] font-bold text-orange-500 whitespace-nowrap">${data.referenceNumber}</td>
            <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${data.documentoAsociado || '-'}</td>
            <td class="px-4 py-2.5 text-[10px] font-bold text-center">
                <span class="${enlacesMagicosLength > 0 ? 'bg-custom-orange/20 text-custom-orange' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'} px-2 py-1 rounded-lg">
                    ${enlacesMagicosLength}
                </span>
            </td>
            <td class="px-4 py-2.5 text-[10px] font-mono text-custom-purple whitespace-nowrap">${data.nitImportador}</td>
            <td class="px-4 py-2.5 text-[9px] uppercase font-bold text-slate-700 dark:text-slate-200 max-w-[200px] truncate transition-colors" title="${data.razonSocial}">${data.razonSocial}</td>
            
            <td class="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-[#1e293b] rounded transition-colors">${data.commercialInvoice}</td>
            <td class="px-4 py-2.5 text-[10px] font-bold text-orange-500 whitespace-nowrap">${data.pedido}</td>
            <td class="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${data.pedidoSufijo || '-'}</td>
            <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${data.oi}</td>
            <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${data.oc}</td>
            <td class="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap transition-colors">${data.guiaEmbarque}</td>
            <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 max-w-[140px] truncate transition-colors" title="${data.contenedor}">${data.contenedor || '-'}</td>
            <td class="px-4 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 max-w-[140px] truncate transition-colors" title="${data.providerData}">${data.providerData}</td>
            <td class="px-4 py-2.5 text-[9px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#1e293b] max-w-[120px] truncate rounded px-2 transition-colors" title="${data.customsOffice}">${data.customsOffice}</td>
            <td class="px-4 py-2.5 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap transition-colors">${data.acceptanceDate}</td>
            <td class="px-4 py-2.5 text-[10px] font-bold text-center text-slate-700 dark:text-slate-300 transition-colors">${data.totalItems}</td>
            <td class="px-4 py-2.5 text-[10px] font-bold text-center text-slate-700 dark:text-slate-300 transition-colors">${data.pesoBruto || '-'}</td>
            <td class="px-4 py-2.5 text-[10px] font-mono text-center text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">${data.tipoCambio}</td>
            <td class="px-4 py-2.5 text-[10px] font-bold text-right text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">${data.totalCIFValue}</td>
            <td class="px-4 py-2 whitespace-nowrap">
                <div class="flex flex-col space-y-0.5">
                    <span class="text-[8px] text-slate-400 dark:text-slate-500 flex justify-between w-16 transition-colors"><span class="font-bold">GA:</span> <span class="text-slate-600 dark:text-slate-300">${data.customsTax}</span></span>
                    <span class="text-[8px] text-slate-400 dark:text-slate-500 flex justify-between w-16 transition-colors"><span class="font-bold">IVA:</span> <span class="text-slate-600 dark:text-slate-300">${data.vatTax}</span></span>
                </div>
            </td>
            <td class="px-4 py-2.5 text-[11px] font-black text-right text-custom-red whitespace-nowrap">
                <div class="flex items-center justify-end">
                    ${data.totalTributos} ${validacionHtml}
                </div>
            </td>
            <td class="px-4 py-2.5 whitespace-nowrap">
                <span class="px-1.5 py-0.5 inline-flex text-[8px] font-bold rounded uppercase ${isAnticipado ? 'bg-custom-orange/20 text-custom-orange' : 'bg-orange-500/20 text-orange-500'} border border-transparent">
                    ${data.dispatchMode}
                </span>
            </td>
            <td class="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-[#1e293b] rounded transition-colors">${data.examenPrevio}</td>
        </tr>`;
    tbody.insertAdjacentHTML('beforeend', row);
}

function showToast(msg, isError = false, icon = "info-circle") {
    const toast = document.getElementById('toast');
    const msgSpan = document.getElementById('toastMsg');
    const iconSpan = document.getElementById('toastIcon');
    
    if (!toast || !msgSpan || !iconSpan) return;

    msgSpan.innerText = msg;
    iconSpan.className = `fa-solid fa-${isError ? 'triangle-exclamation' : icon} mr-3 text-lg`;
    
    toast.className = `fixed bottom-6 right-6 bg-white dark:bg-[#0f172a] px-4 py-3 rounded-lg border transition-all duration-300 z-[140] transform flex items-center max-w-sm shadow-lg
        ${isError ? 'border-custom-red text-custom-red' : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'}`;
    
    toast.classList.remove('translate-y-10', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-10', 'opacity-0');
    }, 3000);
}

async function saveToSupabase() {
    if (!supabaseClient) {
        return showToast("Sin conexión a la base de datos.", true);
    }

    if (!extractedData || extractedData.length === 0) {
        return showToast("Nada que guardar, jefe.", true);
    }

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loadingText').innerText = "Validando papelería...";

    // 1. Filtrar registros incompletos e inválidos (que tengan '-' o vacíos)
    // 2. Eliminar duplicados dentro del lote actual antes de validar con Supabase
    const uniqueExtractedData = [];
    const seenDecls = new Set();
    const seenRefs = new Set();
    let skippedCount = 0;
    
    for (const d of extractedData) {
        const decl = (d.declarationNumber || '').trim();
        const ref = (d.referenceNumber || '').trim();
        
        if (decl === '-' || decl === '' || ref === '-' || ref === '') {
            skippedCount++;
            continue;
        }
        
        if (!seenDecls.has(decl) && !seenRefs.has(ref)) {
            seenDecls.add(decl);
            seenRefs.add(ref);
            uniqueExtractedData.push(d);
        }
    }

    if (uniqueExtractedData.length === 0) {
        document.getElementById('loading').classList.add('hidden');
        return showToast("No hay registros válidos para procesar (todos están incompletos con '-' o vacíos).", true);
    }

    const newDecls = uniqueExtractedData.map(d => d.declarationNumber).filter(Boolean);
    const newRefs = uniqueExtractedData.map(d => d.referenceNumber).filter(Boolean);
    
    // Consultar id, n_declaracion, n_referencia y campos de metadatos de los que ya existen
    const { data: existing, error: checkErr } = await supabaseClient
        .from(TABLE_NAME)
        .select('id, n_declaracion, n_referencia, documento_asociado, peso_bruto, pedido_sufijo, contenedor')
        .or(`n_declaracion.in.(${newDecls.map(x => `"${x}"`).join(',')}),n_referencia.in.(${newRefs.map(x => `"${x}"`).join(',')})`);

    if (checkErr) { 
        document.getElementById('loading').classList.add('hidden'); 
        return showToast("Error validando duplicados.", true); 
    }
    
    const existingMapDecl = new Map(existing ? existing.map(i => [i.n_declaracion, i]).filter(([k]) => k) : []);
    const existingMapRef = new Map(existing ? existing.map(i => [i.n_referencia, i]).filter(([k]) => k) : []);
    
    const toInsert = uniqueExtractedData.filter(d => !existingMapDecl.has(d.declarationNumber) && !existingMapRef.has(d.referenceNumber));
    const toUpdate = uniqueExtractedData.filter(d => {
        const dbRow = existingMapDecl.get(d.declarationNumber) || existingMapRef.get(d.referenceNumber);
        if (!dbRow) return false;
        
        const dbDoc = (dbRow.documento_asociado || '').trim();
        const dbPeso = (dbRow.peso_bruto || '').trim();
        const dbSufijo = (dbRow.pedido_sufijo || '').trim();
        const dbContenedor = (dbRow.contenedor || '').trim();

        const parsedDoc = (d.documentoAsociado || '').trim();
        const parsedPeso = (d.pesoBruto || '').trim();
        const parsedSufijo = (d.pedidoSufijo || '').trim();
        const parsedContenedor = (d.contenedor || '').trim();

        const docMissing = (!dbDoc || dbDoc === '-') && (parsedDoc && parsedDoc !== '-');
        const pesoMissing = (!dbPeso || dbPeso === '-') && (parsedPeso && parsedPeso !== '-');
        const sufijoMissing = (!dbSufijo || dbSufijo === '-') && (parsedSufijo && parsedSufijo !== '-');
        const contMissing = (!dbContenedor || dbContenedor === '-') && (parsedContenedor && parsedContenedor !== '-');

        return docMissing || pesoMissing || sufijoMissing || contMissing;
    });
    
    if (toInsert.length === 0 && toUpdate.length === 0) {
        document.getElementById('loading').classList.add('hidden');
        let msg = "El registro ya existe en el sistema y cuenta con todos sus datos completos.";
        if (skippedCount > 0) msg += ` Se omitieron ${skippedCount} archivos incompletos o con '-'.`;
        return showToast(msg, true);
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let insertError = null;
    let updateErrors = 0;

    // 1. Proceder con la inserción de nuevos registros
    if (toInsert.length > 0) {
        document.getElementById('loadingText').innerText = "Guardando nuevos registros...";

        // Prevenir error de secuencia desincronizada (importaciones_pkey) obteniendo el id máximo actual
        let nextId = null;
        try {
            const { data: maxRow } = await supabaseClient
                .from(TABLE_NAME)
                .select('id')
                .order('id', { ascending: false })
                .limit(1);
            if (maxRow && maxRow.length > 0 && typeof maxRow[0].id === 'number') {
                nextId = maxRow[0].id + 1;
            }
        } catch (e) {
            console.warn("No se pudo consultar el ID máximo:", e);
        }

        const dbData = toInsert.map((d, index) => {
            const row = {
                n_declaracion: d.declarationNumber,
                fecha_aceptacion: d.acceptanceDate,
                n_referencia: d.referenceNumber,
                aduana: d.customsOffice,
                items: d.totalItems,
                tipo_cambio: d.tipoCambio,
                total_cif: d.totalCIFValue, 
                gravamen: d.customsTax,
                iva: d.vatTax,
                total_tributos: d.totalTributos, 
                factura: d.commercialInvoice,
                proveedor: d.providerData,
                modalidad: d.dispatchMode,
                pedido: d.pedido,
                pedido_sufijo: d.pedidoSufijo,
                oi: d.oi,
                oc: d.oc,
                guia_embarque: d.guiaEmbarque,
                contenedor: d.contenedor,
                examen_previo: d.examenPrevio,
                nit_importador: d.nitImportador,
                razon_social: d.razonSocial,
                archivo_origen: d.sourceFile,
                documentos_enlaces: d.enlaces_magicos,
                documento_asociado: d.documentoAsociado,
                peso_bruto: d.pesoBruto
            };
            if (nextId !== null) {
                row.id = nextId + index;
            }
            return row;
        });

        const { error: insErr } = await supabaseClient.from(TABLE_NAME).insert(dbData);
        if (insErr) {
            insertError = insErr.message;
        } else {
            insertedCount = toInsert.length;
            // Sincronizar automáticamente hacia GASTOS_DESPACHOS_2026 para garantizar visualización inmediata en Dashboard
            try {
                for (const d of toInsert) {
                    let mes = 'SIN FECHA';
                    if (d.acceptanceDate) {
                        const str = String(d.acceptanceDate).trim();
                        const match1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                        if (match1) mes = `${match1[3]}-${match1[2].padStart(2, '0')}`;
                        else {
                            const match2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                            if (match2) mes = `${match2[1]}-${match2[2].padStart(2, '0')}`;
                        }
                    }
                    const payload = {
                        n_referencia: (d.referenceNumber || '').trim().toUpperCase(),
                        n_declaracion: d.declarationNumber || '',
                        fecha_aceptacion: d.acceptanceDate || '',
                        razon_social: d.razonSocial || '',
                        nit_importador: d.nitImportador || '',
                        aduana: d.customsOffice || '',
                        factura: d.commercialInvoice || '',
                        proveedor: d.providerData || '',
                        modalidad: d.dispatchMode || '',
                        pedido: d.pedido || '',
                        oi: d.oi || '',
                        oc: d.oc || '',
                        guia_embarque: d.guiaEmbarque || '',
                        contenedor: d.contenedor || '',
                        peso_bruto: d.pesoBruto || '',
                        items: String(d.totalItems || ''),
                        total_cif: parseFloat(String(d.totalCIFValue || '0').replace(/[^0-9.]/g, '')) || 0,
                        gravamen: parseFloat(String(d.customsTax || '0').replace(/[^0-9.]/g, '')) || 0,
                        iva: parseFloat(String(d.vatTax || '0').replace(/[^0-9.]/g, '')) || 0,
                        total_tributos: parseFloat(String(d.totalTributos || '0').replace(/[^0-9.]/g, '')) || 0,
                        mes_aceptacion: mes,
                        mes_facturacion: mes,
                        estado_tramite: 'EN PROCESO'
                    };

                    let existingRow = null;
                    if (payload.n_declaracion) {
                        const { data: byDecl } = await supabaseClient
                            .from('GASTOS_DESPACHOS_2026')
                            .select('id, estado_tramite, total_factura, total_planilla, razon_social')
                            .eq('n_declaracion', payload.n_declaracion)
                            .maybeSingle();
                        if (byDecl) existingRow = byDecl;
                    }
                    if (!existingRow && payload.n_referencia) {
                        const { data: byRef } = await supabaseClient
                            .from('GASTOS_DESPACHOS_2026')
                            .select('id, estado_tramite, total_factura, total_planilla, razon_social')
                            .eq('n_referencia', payload.n_referencia)
                            .maybeSingle();
                        if (byRef) existingRow = byRef;
                    }

                    const isMsc = (payload.razon_social || '').toUpperCase().includes('MINERA SAN CRISTOBAL');
                    if (existingRow) {
                        const hasFact = (parseFloat(existingRow.total_factura) || 0) > 0;
                        const hasPlan = (parseFloat(existingRow.total_planilla) || 0) > 0;
                        const isMscRow = isMsc || (existingRow.razon_social || '').toUpperCase().includes('MINERA SAN CRISTOBAL');
                        if (existingRow.estado_tramite === 'COMPLETADO' || isMscRow || hasFact || hasPlan) {
                            delete payload.estado_tramite;
                        }
                        await supabaseClient
                            .from('GASTOS_DESPACHOS_2026')
                            .update(payload)
                            .eq('id', existingRow.id);
                    } else {
                        if (isMsc) payload.estado_tramite = 'COMPLETADO';
                        await supabaseClient
                            .from('GASTOS_DESPACHOS_2026')
                            .insert(payload);
                    }
                }
            } catch (syncErr) {
                console.warn("Sincronización a GASTOS_DESPACHOS_2026 silenciosa:", syncErr);
            }
        }
    }

    // 2. Proceder con la actualización de los 4 campos nuevos en registros existentes
    if (toUpdate.length > 0) {
        document.getElementById('loadingText').innerText = "Actualizando campos de metadatos...";
        for (const d of toUpdate) {
            const dbRow = existingMapDecl.get(d.declarationNumber) || existingMapRef.get(d.referenceNumber);
            if (dbRow && dbRow.id) {
                const { error: updErr } = await supabaseClient
                    .from(TABLE_NAME)
                    .update({
                        documento_asociado: d.documentoAsociado,
                        peso_bruto: d.pesoBruto,
                        pedido_sufijo: d.pedidoSufijo,
                        contenedor: d.contenedor
                    })
                    .eq('id', dbRow.id);

                if (updErr) {
                    updateErrors++;
                } else {
                    updatedCount++;
                }
            }
        }
    }
    
    document.getElementById('loading').classList.add('hidden');
    
    if (insertError) {
        showToast("Error al insertar nuevos: " + insertError, true);
    } else {
        let msg = "";
        if (insertedCount > 0 && updatedCount > 0) {
            msg = `¡Listo! Guardados ${insertedCount} nuevos y actualizados ${updatedCount} existentes.`;
        } else if (insertedCount > 0) {
            msg = `¡Listo! Guardados ${insertedCount} nuevos registros.`;
        } else if (updatedCount > 0) {
            msg = `¡Listo! Se actualizaron los metadatos de ${updatedCount} registros anteriores.`;
        } else {
            msg = `No se realizaron cambios.`;
        }
        
        if (updateErrors > 0) {
            msg += ` (Fallaron ${updateErrors} actualizaciones).`;
        }
        
        showToast(msg, updateErrors > 0, "check");
        // Recargar el historial tras guardar
        loadHistory();
    }
}

// --- PROGRAMMATIC EVENT LISTENERS Y BINDING GLOBAL ---
function inicializarGestionPrincipal() {
    // Inicialización del modal de eliminación programático
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!recordToDeleteId || !supabaseClient) return;
            const { error } = await supabaseClient.from(TABLE_NAME).delete().eq('id', recordToDeleteId);
            if (error) {
                showToast("Error al borrar: " + error.message, true);
            } else { 
                showToast("Eliminado papá", false, "trash"); 
                closeDeleteModal(); 
                loadHistory(); 
            }
        });
    }

    // Ejecutar inicialización y primera carga
    init();
    loadHistory();

    // Soporte para redirección de pestañas mediante query parameters (ej: ?tab=dashboard)
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
        setTimeout(() => {
            if (typeof switchView === 'function') {
                switchView(tabParam);
            }
        }, 150);
    }
}

// Helper para convertir base64 a Blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// Listener para recibir archivos inyectados desde la extensión de Chrome
document.addEventListener('InjectFilesEvent', async (e) => {
    const filesData = e.detail && e.detail.files;
    if (!filesData || filesData.length === 0) return;
    
    const files = [];
    for (const fileData of filesData) {
        try {
            const blob = base64ToBlob(fileData.data, 'application/pdf');
            const file = new File([blob], fileData.name, { type: 'application/pdf' });
            files.push(file);
        } catch (err) {
            console.error("Error reconstruyendo archivo inyectado:", err);
        }
    }
    
    if (files.length > 0) {
        // Asegurarse de cambiar a la vista de subida para ver el procesamiento
        if (typeof switchView === 'function') {
            switchView('upload');
        }
        
        // Ejecutar el procesamiento de archivos nativo del sistema
        if (typeof handleFileSelect === 'function') {
            handleFileSelect({ target: { files: files } });
        }
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarGestionPrincipal);
} else {
    inicializarGestionPrincipal();
}

// Registrar funciones en 'window' para que sigan disponibles en los eventos del HTML
window.toggleTheme = toggleTheme;
window.cleanRazonSocial = cleanRazonSocial;
window.cleanProveedor = cleanProveedor;
window.openCleanModal = openCleanModal;
window.closeCleanModal = closeCleanModal;
window.executeCleanDatabase = executeCleanDatabase;
window.expandChart = expandChart;
window.closeChartModal = closeChartModal;
window.switchView = switchView;
window.loadHistory = loadHistory;
window.filterHistory = filterHistory;
window.toggleAllBat = toggleAllBat;
window.generateBatScript = generateBatScript;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.handleFileSelect = handleFileSelect;
window.saveToSupabase = saveToSupabase;
window.clearDateFilter = clearDateFilter;
window.toggleAduanaPill = toggleAduanaPill;
window.applyQuickFilter = applyQuickFilter;
window.onSearchInputDebounced = onSearchInputDebounced;
window.goToPrevPage = goToPrevPage;
window.goToNextPage = goToNextPage;

