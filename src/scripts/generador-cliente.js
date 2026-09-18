import { supabase } from '../services/supabase.js';
let supabaseClient = supabase;

let globalDB = [];
let matchedMtodoRows = []; // Conservar los registros originales encontrados para cambiar de formato al vuelo
let processedResults = [];
let isSidebarOpen = true;
let currentFormat = 'h1doc'; // 'h1doc' (unificado clásico) o 'premium' (doble cabecera)

// Configuración Regional
let currentDecimalSeparator = '.'; 
let currentDateFormat = 'DD/MM/YYYY';

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    isSidebarOpen ? sidebar.classList.add('sidebar-hidden') : sidebar.classList.remove('sidebar-hidden');
    isSidebarOpen = !isSidebarOpen;
}

function changeReportFormat(format) {
    currentFormat = format;
    if (matchedMtodoRows.length > 0) {
        regenerateActiveFormatTable();
    }
}

// --- CONFIG REGIONAL ---
function setDecimalSeparator(sep) {
    currentDecimalSeparator = sep;
    document.getElementById('btnDecDot').className = sep === '.' ? 'flex-1 py-1 text-[10px] font-bold bg-blue-600 text-white transition-colors' : 'flex-1 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors';
    document.getElementById('btnDecComma').className = sep === ',' ? 'flex-1 py-1 text-[10px] font-bold bg-blue-600 text-white transition-colors' : 'flex-1 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors';
    if (processedResults.length > 0) regenerateActiveFormatTable();
}

function setDateFormat(fmt) {
    currentDateFormat = fmt;
    document.getElementById('btnDateDMY').className = fmt === 'DD/MM/YYYY' ? 'flex-1 py-1 text-[10px] font-bold bg-blue-600 text-white transition-colors' : 'flex-1 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors';
    document.getElementById('btnDateMDY').className = fmt === 'MM/DD/YYYY' ? 'flex-1 py-1 text-[10px] font-bold bg-blue-600 text-white transition-colors' : 'flex-1 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors';
    if (processedResults.length > 0) regenerateActiveFormatTable();
}

// Formateador monetario: Retorna vacío "" si el valor es 0 para una grilla limpia sin "0.00"
function formatMoneyCustom(amount) {
    const num = parseFloat(amount) || 0;
    if (Math.abs(num) < 0.009) return ''; 
    if (currentDecimalSeparator === ',') {
        return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

function formatDateCustom(dateString) {
    if (!dateString || dateString === '-') return '';
    let year, month, day;
    if (dateString.includes('-')) {
        [year, month, day] = dateString.split('-');
    } else if (dateString.includes('/')) {
        [day, month, year] = dateString.split('/');
    }
    if (!year || !month || !day) return dateString;
    return currentDateFormat === 'DD/MM/YYYY' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

// Limpiador especial para celdas vacías (evita guiones "-" o "None")
function cleanH1DocValue(val) {
    if (val === null || val === undefined) return '';
    const s = String(val).trim();
    if (s === '-' || s === 'None' || s.toLowerCase() === 'null' || s === 'None / None' || s === '- / -') return '';
    return s;
}

let isDataLoadedGen = false;
async function inicializarGeneradorCliente() {
    if (isDataLoadedGen) return;
    isDataLoadedGen = true;
    document.getElementById('loader-mini')?.classList.remove('hidden');
    await loadAllData();
    document.getElementById('loader-mini')?.classList.add('hidden');
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(inicializarGeneradorCliente, 1);
} else {
    document.addEventListener('DOMContentLoaded', inicializarGeneradorCliente, { once: true });
}

async function loadAllData() {
    try {
        let allData = [];
        let offset = 0;
        let page = 0;
        const MAX_PAGES = 50;
        const limit = 1000;
        while (page < MAX_PAGES) {
            page++;
            const { data, error } = await supabaseClient.from('mtodo').select('*').range(offset, offset + limit - 1);
            if (error) {
                console.error("Error al consultar mtodo:", error);
                break;
            }
            if (!data || data.length === 0) break;
            allData.push(...data);
            if (data.length < limit) break;
            offset += limit;
        }
        globalDB = allData;
        console.log("DB Loaded mtodo completo:", globalDB.length);
        suscribirTiempoReal();
    } catch (e) { 
        console.error("Error al cargar mtodo:", e); 
        Swal.fire('Error', 'Falla carga DB desde mtodo: ' + (e.message || e), 'error'); 
    }
}

let realtimeChannel = null;
function suscribirTiempoReal() {
    if (!supabaseClient || realtimeChannel) return;
    
    realtimeChannel = supabaseClient
        .channel('realtime-generador-cliente-mtodo')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mtodo' }, (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;
            if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow) {
                const idx = globalDB.findIndex(d => d.interno === newRow.interno || (d.id && d.id === newRow.id));
                if (idx >= 0) {
                    globalDB[idx] = { ...globalDB[idx], ...newRow };
                } else {
                    globalDB.unshift(newRow);
                }
                if (matchedMtodoRows.length > 0) {
                    const inputEle = document.getElementById('inputInternos');
                    if (inputEle && inputEle.value.trim()) processData();
                }
            } else if (eventType === 'DELETE' && oldRow) {
                globalDB = globalDB.filter(d => d.interno !== oldRow.interno && d.id !== oldRow.id);
                if (matchedMtodoRows.length > 0) {
                    const inputEle = document.getElementById('inputInternos');
                    if (inputEle && inputEle.value.trim()) processData();
                }
            }
        })
        .subscribe();
}

function desuscribirTiempoReal() {
    if (realtimeChannel && supabaseClient) {
        supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

window.addEventListener('beforeunload', desuscribirTiempoReal);
window.addEventListener('pagehide', desuscribirTiempoReal);

function toggleOnlyVerifiedFilter() {
    processData();
}

async function processData() {
    const rawInput = document.getElementById('inputInternos').value;
    const onlyVerified = document.getElementById('chkOnlyVerified').checked;

    if (!rawInput.trim()) { 
        Swal.fire('Ojo', 'Faltan DIMS', 'warning'); 
        return; 
    }

    const loaderMini = document.getElementById('loader-mini');
    if (loaderMini) loaderMini.classList.remove('hidden');
    await loadAllData();
    if (loaderMini) loaderMini.classList.add('hidden');

    const inputs = rawInput.split(/\r?\n/).map(s => s.trim()).filter(s => s !== "");
    let encontrados = 0;
    let faltantes = 0;
    let arrayFaltantes = [];
    const matchedSet = new Set();
    const results = [];

    inputs.forEach(input => {
        const searchClean = input.replace(/[^0-9]/g, '');
        const row = globalDB.find(d => {
            const dimClean = (d.dim_n_ro || '').replace(/[^0-9]/g, '');
            return (dimClean && dimClean.endsWith(searchClean)) || d.interno === input;
        });
        
        if (!row) { 
            faltantes++; 
            arrayFaltantes.push(input);
            return; 
        }

        // Filtro de Solo Verificadas
        const vSuma = row.verificado_suma || 'NO VERIFICADO';
        const vSaldos = row.verificado_saldos || 'NO VERIFICADO';
        const isSumaOk = vSuma.startsWith('VERIFICADO');
        const isSaldosOk = vSaldos.startsWith('VERIFICADO');

        if (onlyVerified && (!isSumaOk || !isSaldosOk)) {
            faltantes++;
            arrayFaltantes.push(`${input} (No Verificado)`);
            return;
        }

        encontrados++;
        matchedSet.add(row);
        results.push(row);
    });

    matchedMtodoRows = results;

    document.getElementById('statFound').innerText = encontrados;
    document.getElementById('statMissing').innerText = faltantes;
    document.getElementById('statsBox').classList.remove('hidden');
    
    const missingBox = document.getElementById('missingBox');
    const missingList = document.getElementById('missingList');
    if (faltantes > 0) {
        missingList.value = arrayFaltantes.join('\n');
        missingBox.classList.remove('hidden');
    } else {
        missingBox.classList.add('hidden');
        missingList.value = '';
    }

    // --- CALCULAR TRÁMITES EN SISTEMA DEL MES ACTUAL NO INCLUIDOS EN LA LISTA ---
    const targetMonths = new Set();
    matchedMtodoRows.forEach(r => {
        if (r.mes) targetMonths.add(String(r.mes).trim().toUpperCase());
        if (r.fecha_dim) {
            const parts = String(r.fecha_dim).split(' ')[0].split('/');
            if (parts.length === 3) targetMonths.add(`${parts[1]}/${parts[2]}`);
        }
    });

    const inputMesAnioVal = (document.getElementById('inputMesAnio').value || '').trim();
    if (targetMonths.size === 0 && inputMesAnioVal) {
        const mm = inputMesAnioVal.slice(0, 2);
        const yyyy = inputMesAnioVal.slice(2);
        targetMonths.add(`${mm}/${yyyy}`);
    }

    const monthMap = { '01': 'ENE', '02': 'FEB', '03': 'MAR', '04': 'ABR', '05': 'MAY', '06': 'JUN', '07': 'JUL', '08': 'AGO', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DIC' };

    let arrayUnlistedInSystem = [];
    globalDB.forEach(row => {
        if (matchedSet.has(row)) return;

        let rowMes = (row.mes || '').trim().toUpperCase();
        let rowDateStr = '';
        if (row.fecha_dim) {
            const parts = String(row.fecha_dim).split(' ')[0].split('/');
            if (parts.length === 3) rowDateStr = `${parts[1]}/${parts[2]}`;
        }

        let isSameMonth = false;
        if (targetMonths.size > 0) {
            targetMonths.forEach(tMonth => {
                if (rowMes && rowMes.includes(tMonth)) isSameMonth = true;
                if (rowDateStr && (tMonth.includes(rowDateStr) || rowDateStr.includes(tMonth))) isSameMonth = true;
                
                const tMM = tMonth.slice(0, 2);
                if (monthMap[tMM] && rowMes.includes(monthMap[tMM])) isSameMonth = true;
                for (const [code, name] of Object.entries(monthMap)) {
                    if (tMonth.includes(name) && (rowDateStr.startsWith(code) || rowMes.includes(name))) {
                        isSameMonth = true;
                    }
                }
            });
        } else {
            isSameMonth = true;
        }

        if (isSameMonth) {
            const dim7Digits = (row.dim_n_ro || '').replace(/[^0-9]/g, '').slice(-7);
            const val = dim7Digits || row.interno || row.dim_n_ro;
            if (val && !arrayUnlistedInSystem.includes(val)) {
                arrayUnlistedInSystem.push(val);
            }
        }
    });

    const unlistedBox = document.getElementById('unlistedInSystemBox');
    const unlistedList = document.getElementById('unlistedInSystemList');
    const unlistedBadge = document.getElementById('unlistedCountBadge');

    if (arrayUnlistedInSystem.length > 0) {
        if (unlistedList) unlistedList.value = arrayUnlistedInSystem.join('\n');
        if (unlistedBadge) unlistedBadge.innerText = arrayUnlistedInSystem.length;
        if (unlistedBox) unlistedBox.classList.remove('hidden');
    } else {
        if (unlistedBox) unlistedBox.classList.add('hidden');
        if (unlistedList) unlistedList.value = '';
        if (unlistedBadge) unlistedBadge.innerText = '0';
    }

    if (matchedMtodoRows.length > 0) {
        regenerateActiveFormatTable();
        if(window.innerWidth < 1024) toggleSidebar();
    } else {
        Swal.fire('¡Híjole!', 'No se encontraron registros con los criterios seleccionados.', 'info');
    }
}

function regenerateActiveFormatTable() {
    const mesAnio = document.getElementById('inputMesAnio').value || '012026';
    
    // Actualizar Tarjetas Resumen ejecutivas
    updateSummaryCards(matchedMtodoRows);

    if (currentFormat === 'h1doc') {
        processedResults = buildH1DocRows(matchedMtodoRows, mesAnio);
        renderTableH1Doc(processedResults);
    } else {
        processedResults = buildPremiumRows(matchedMtodoRows);
        renderTablePremium(processedResults);
    }
}

function updateSummaryCards(rows) {
    let sComision = 0;
    let sAlbo = 0;
    let sIP = 0;
    let sGuia = 0;
    let sPuerto = 0;
    let sOtros = 0;

    rows.forEach(r => {
        sComision += parseFloat(r.comision_bob) || 0;
        sAlbo += parseFloat(r.albo_monto) || 0;
        sIP += parseFloat(r.ip_monto) || 0;
        sGuia += parseFloat(r.guias_monto) || 0;
        sPuerto += parseFloat(r.puertos_monto) || 0;
        sOtros += parseFloat(r.otros_monto) || 0;
    });

    const sTotalGastos = sAlbo + sIP + sGuia + sPuerto + sOtros;
    const sGranTotal = sTotalGastos + sComision;

    const kpiComision = document.getElementById('kpiComision');
    const kpiAlbo = document.getElementById('kpiAlbo');
    const kpiIp = document.getElementById('kpiIp');
    const kpiGuia = document.getElementById('kpiGuia');
    const kpiPuerto = document.getElementById('kpiPuerto');
    const kpiOtros = document.getElementById('kpiOtros');
    const kpiTotalGastos = document.getElementById('kpiTotalGastos');
    const kpiGranTotal = document.getElementById('kpiGranTotal');

    // Aquí las sumas siempre se muestran (incluso si son 0, usamos formato estándar con 0,00 si es necesario)
    const formatKPIValue = (val) => {
        const num = parseFloat(val) || 0;
        if (currentDecimalSeparator === ',') {
            return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    };

    if (kpiComision) kpiComision.innerText = formatKPIValue(sComision);
    if (kpiAlbo) kpiAlbo.innerText = formatKPIValue(sAlbo);
    if (kpiIp) kpiIp.innerText = formatKPIValue(sIP);
    if (kpiGuia) kpiGuia.innerText = formatKPIValue(sGuia);
    if (kpiPuerto) kpiPuerto.innerText = formatKPIValue(sPuerto);
    if (kpiOtros) kpiOtros.innerText = formatKPIValue(sOtros);
    if (kpiTotalGastos) kpiTotalGastos.innerText = formatKPIValue(sTotalGastos);
    if (kpiGranTotal) kpiGranTotal.innerText = formatKPIValue(sGranTotal);
}

function buildH1DocRows(rows, mesAnio) {
    return rows.map(row => {
        const dimNumberOnly = (row.dim_n_ro || '').replace(/[^0-9]/g, '').slice(-7);
        let aduanaCode = "211";
        const declRaw = row.dim_n_ro || '';
        const declParts = declRaw.split(/[^a-zA-Z0-9]/);
        const foundCode = declParts.find(p => p.length === 3 && /^\d+$/.test(p));
        if (foundCode) aduanaCode = foundCode;

        const dimYear = mesAnio.length >= 4 ? mesAnio.slice(-4) : "2026";
        const h1ndim = `${dimYear}${aduanaCode}${dimNumberOnly}`;
        
        const totalTributos = parseFloat(row.total_tributos) || 0;
        const h1bs = ((totalTributos) + 100) * -1;
        const isExp = (row.oi || '').toUpperCase() === 'EXP';
        const h1sist = isExp ? 0 : 100;
        
        const ivaVal = parseFloat(row.iva) || 0;
        const gaVal = parseFloat(row.gravamen) || 0;
        const control = h1bs + ivaVal + gaVal + h1sist;
        
        const cifBs = parseFloat(row.valor_cif_bs ? String(row.valor_cif_bs).replace(/[^0-9.]/g, '') : 0) || 0;
        const cifUsd = parseFloat(row.cif_usd) || (cifBs / 6.96);
        
        let h1cav = parseFloat(row.comision_bob || row.comision_bs) || 0;
        if (h1cav === 0) {
            if (isExp) {
                h1cav = 700;
            } else if (cifUsd === 0) {
                h1cav = 100;
            } else if (cifUsd <= 35000) {
                h1cav = 600;
            } else if (cifUsd <= 500000) {
                h1cav = cifUsd * 0.003 * 6.96;
            } else {
                h1cav = cifUsd * 0.0025 * 6.96;
            }
        }

        const fechaClean = (row.fecha_dim || '').split(' ')[0];
        const puertosMonto = parseFloat(row.puertos_monto || row.puerto_monto) || 0;
        const puertosComp = cleanH1DocValue(row.puertos_comprobante || row.puerto_comprobante);
        const puertosFecha = cleanH1DocValue(row.puertos_fecha || row.puerto_fecha);
        const hasPuertos = puertosMonto > 0 || puertosComp !== '' || puertosFecha !== '';

        return {
            H1NDIM: h1ndim,
            H1BAN: "BUN",
            H1DOC: dimNumberOnly,
            H1BS: h1bs,
            H1FECHA: cleanH1DocValue(fechaClean),
            CONTRATO: `CN1900006${mesAnio}`,
            H1CODAD: aduanaCode,
            H1IVA: ivaVal,
            H1GA: gaVal,
            H1SIST: h1sist,
            CONTROL: control,
            H1CIFBS: cifBs,
            INTERNO: cleanH1DocValue(row.interno),
            H1OI: cleanH1DocValue(row.oi),
            H1TC: parseFloat(row.tipo_cambio) || 6.96,
            H1CIFUSD: cifUsd,
            H1CAV: h1cav,
            ALM: parseFloat(row.albo_monto) || 0,
            AB: cleanH1DocValue(row.albo_cod),
            FAC: cleanH1DocValue(row.albo_factura),
            FECH: cleanH1DocValue(row.albo_fecha),
            QR: cleanH1DocValue(row.albo_enlace),
            ALM2: parseFloat(row.ip_monto) || 0,
            AB2: cleanH1DocValue(row.ip_cod), // ASIGNADO: Código de IP desde la base de datos
            FAC_IP: cleanH1DocValue(row.ip_factura),
            FECH_IP: cleanH1DocValue(row.ip_fecha),
            QR_IP: cleanH1DocValue(row.ip_enlace),
            COUR: parseFloat(row.guias_monto) || 0,
            AB3: cleanH1DocValue(row.guias_cod),
            FAC3: cleanH1DocValue(row.guias_factura),
            FECH32: cleanH1DocValue(row.guias_fecha),
            QR3: cleanH1DocValue(row.guias_enlace),
            TRANS: parseFloat(row.otros_monto) || 0,
            AB_OTROS: cleanH1DocValue(row.otros_cod),
            FAC_OTROS: cleanH1DocValue(row.otros_factura),
            FECH_OTROS: cleanH1DocValue(row.otros_fecha),
            QR_OTROS: cleanH1DocValue(row.otros_enlace),
            PUERT: puertosMonto,
            AB42: hasPuertos ? "61216" : "",
            FAC43: puertosComp,
            FECH44: puertosFecha
        };
    });
}

function buildPremiumRows(rows) {
    return rows.map((row, index) => {
        // 1. Separar ALBO y DAB
        let alboVal = 0;
        let dabVal = 0;
        const alboMonto = parseFloat(row.albo_monto) || 0;
        const ipMonto = parseFloat(row.ip_monto) || 0;
        
        const alboCod = String(row.albo_cod || '').trim();
        const alboEnlace = String(row.albo_enlace || '').trim();
        const ipCod = String(row.ip_cod || '').trim();
        const ipEnlace = String(row.ip_enlace || '').trim();

        // Albo
        if (alboCod.includes('20934') || alboCod.includes('120585022') || alboEnlace.includes('120585022')) {
            alboVal += alboMonto;
        } else if (alboCod.includes('70742') || alboCod.includes('161462027') || alboEnlace.includes('161462027')) {
            dabVal += alboMonto;
        } else {
            if (alboCod.toLowerCase().includes('dab') || alboEnlace.toLowerCase().includes('dab') || String(row.albo_doc_aduanero_fac || '').includes('DAB')) {
                dabVal += alboMonto;
            } else {
                alboVal += alboMonto;
            }
        }

        // IP
        if (ipMonto > 0) {
            if (ipCod.includes('20934') || ipCod.includes('120585022') || ipEnlace.includes('120585022')) {
                alboVal += ipMonto;
            } else if (ipCod.includes('70742') || ipCod.includes('161462027') || ipEnlace.includes('161462027')) {
                dabVal += ipMonto;
            } else {
                if (ipCod.toLowerCase().includes('dab') || ipEnlace.toLowerCase().includes('dab')) {
                    dabVal += ipMonto;
                } else {
                    alboVal += ipMonto;
                }
            }
        }

        // 2. Courier Carriers
        let dhl = 0, remac = 0, deze = 0, scharff = 0, maritime = 0, ctrans = 0, express = 0, latam = 0, otrosCourier = 0;
        const guiasMonto = parseFloat(row.guias_monto) || 0;
        const guiasCod = String(row.guias_cod || '').trim();

        if (guiasMonto > 0) {
            if (guiasCod.includes('20152')) dhl = guiasMonto;
            else if (guiasCod.includes('63157')) remac = guiasMonto;
            else if (guiasCod.includes('70717')) deze = guiasMonto;
            else if (guiasCod.includes('63986')) scharff = guiasMonto;
            else if (guiasCod.includes('67295')) maritime = guiasMonto;
            else if (guiasCod.includes('64294')) ctrans = guiasMonto;
            else if (guiasCod.includes('71817')) express = guiasMonto;
            else if (guiasCod.includes('69512')) latam = guiasMonto;
            else otrosCourier = guiasMonto;
        }

        // 3. Facturas Almacenaje
        const facturasAlmacenaje = [row.albo_factura, row.ip_factura]
            .map(f => cleanH1DocValue(f))
            .filter(f => f !== '')
            .join(' / ') || '';

        const portsVal = parseFloat(row.puertos_monto || row.puerto_monto) || 0;
        const otrosVal = parseFloat(row.otros_monto) || 0;
        const comisionVal = parseFloat(row.comision_bob) || 0;
        const cifVal = parseFloat(row.valor_cif_bs ? String(row.valor_cif_bs).replace(/[^0-9.]/g, '') : 0) || 0;

        const totalPlanilla = alboVal + dabVal + dhl + remac + deze + scharff + maritime + ctrans + express + latam + otrosCourier + portsVal + otrosVal;
        const totalGeneral = totalPlanilla + comisionVal;

        return {
            n_correlativo: index + 1,
            fecha_validacion: cleanH1DocValue(row.fecha_dim),
            planilla_num: cleanH1DocValue(row.ref_excel),
            planilla_fecha: cleanH1DocValue(row.fecha_excel),
            interno_agencia: cleanH1DocValue(row.interno),
            n_declaracion: cleanH1DocValue(row.dim_n_ro),
            orden_compra: cleanH1DocValue(row.oi),
            valor_cif: cifVal,
            tipo_cambio: parseFloat(row.tipo_cambio) || 6.96,
            comision_agencia: comisionVal,
            n_factura_almacenaje: facturasAlmacenaje,
            albo: alboVal,
            dab: dabVal,
            n_factura_courrier: cleanH1DocValue(row.guias_factura),
            dhl: dhl,
            remac: remac,
            deze: deze,
            scharff: scharff,
            maritime: maritime,
            ctrans: ctrans,
            express: express,
            latam: latam,
            otros: otrosCourier,
            aspb: portsVal,
            n_factura_otros: cleanH1DocValue(row.otros_factura),
            otro_gasto: otrosVal,
            total_planilla: totalPlanilla,
            total_general: totalGeneral,
            verificado_suma: row.verificado_suma || 'NO VERIFICADO',
            verificado_saldos: row.verificado_saldos || 'NO VERIFICADO'
        };
    });
}

function copyMissing() {
    const text = document.getElementById('missingList').value;
    if (!text) return;
    
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        const Toast = Swal.mixin({ toast: true, position: 'top', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: '¡Lista copiada!' });
    } catch (err) {
        Swal.fire('Error', 'No se pudo copiar.', 'error');
    }
    document.body.removeChild(textarea);
}

function copyUnlistedInSystem() {
    const text = document.getElementById('unlistedInSystemList').value;
    if (!text) return;
    
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        const Toast = Swal.mixin({ toast: true, position: 'top', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: '¡Trámites no pegados del sistema copiados!' });
    } catch (err) {
        Swal.fire('Error', 'No se pudo copiar.', 'error');
    }
    document.body.removeChild(textarea);
}

// Formateador de verificación
function formatVerifCell(val) {
    const v = val || 'NO VERIFICADO';
    if (v.startsWith('VERIFICADO')) {
        const parts = v.split(' - ');
        const datePart = parts[1] || '';
        return `<div class="flex flex-col items-center"><span class="bg-orange-500/10 text-emerald-800 dark:bg-emerald-900/40 dark:text-orange-300 font-bold px-1.5 py-0.5 rounded text-[9px] mb-0.5 whitespace-nowrap">VERIFICADO</span><span class="text-[8px] text-slate-400 font-mono">${datePart}</span></div>`;
    } else if (v.startsWith('DIFERENCIA')) {
        const parts = v.split(' - ');
        const diffPart = parts[0];
        const datePart = parts[1] || '';
        return `<div class="flex flex-col items-center"><span class="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold px-1.5 py-0.5 rounded text-[9px] mb-0.5 whitespace-nowrap">${diffPart}</span><span class="text-[8px] text-slate-400 font-mono">${datePart}</span></div>`;
    } else {
        return `<span class="text-slate-400 font-bold text-[9px]">-</span>`;
    }
}

// RENDERIZAR TABLA FORMATO UNIFICADO CLÁSICO (H1DOC)
function renderTableH1Doc(data) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const tfoot = document.getElementById('tableFoot');
    const table = document.getElementById('resultTable');
    const empty = document.getElementById('emptyState');
    const btnCopy = document.getElementById('btnCopy');
    const btnExcel = document.getElementById('btnExcel');
    const cards = document.getElementById('summaryCards');

    const numericCols = ['H1BS', 'H1IVA', 'H1GA', 'H1SIST', 'CONTROL', 'H1CIFBS', 'H1TC', 'H1CIFUSD', 'H1CAV', 'ALM', 'ALM2', 'COUR', 'TRANS', 'PUERT'];
    const dateCols = ['H1FECHA', 'FECH', 'FECH_IP', 'FECH32', 'FECH_OTROS', 'FECH44'];
    const qrCols = ['QR', 'QR_IP', 'QR3', 'QR_OTROS'];
    const h1DocSumColumns = ['H1IVA', 'H1GA', 'H1CIFBS', 'H1CIFUSD', 'H1CAV', 'ALM', 'ALM2', 'COUR', 'TRANS', 'PUERT'];

    const headers = Object.keys(data[0]);
    thead.innerHTML = "<tr>" + headers.map(h => `
        <th onclick="copyColumn('${h}')" title="Copiar columna" class="cursor-pointer select-none">
            ${h} <i class="fa-solid fa-copy col-copy-btn text-orange-500 ml-1"></i>
        </th>
    `).join('') + "</tr>";

    const totals = {};
    h1DocSumColumns.forEach(col => totals[col] = 0);

    let bodyHtml = '';
    data.forEach(row => {
        bodyHtml += "<tr class='hover:bg-orange-500/5/50 transition-colors'>";
        headers.forEach(key => {
            const val = row[key];
            let cellHtml = "";
            
            if (numericCols.includes(key)) {
                const valNum = parseFloat(val) || 0;
                if (h1DocSumColumns.includes(key)) totals[key] += valNum;
                cellHtml = `<td class="num-cell">${formatMoneyCustom(valNum)}</td>`;
            } else if (dateCols.includes(key)) {
                cellHtml = `<td class="text-cell">${formatDateCustom(val)}</td>`;
            } else if (qrCols.includes(key)) {
                if (!val || val === '') {
                    cellHtml = `<td class="text-center"></td>`; // Vacío
                } else {
                    const links = val.split(' / ');
                    let label = 'Ver';
                    if (key === 'QR' && row['FAC']) label = row['FAC'].split(' / ')[0]; 
                    else if (key === 'QR3' && row['FAC3']) label = row['FAC3'].split(' / ')[0]; 
                    else if (key === 'QR_OTROS' && row['FAC_OTROS']) label = row['FAC_OTROS'];
                    
                    cellHtml = `<td class="link-cell text-center"><a href="${links[0]}" target="_blank">${label}</a></td>`;
                }
            } else {
                cellHtml = `<td class="text-cell">${val}</td>`;
            }
            bodyHtml += cellHtml;
        });
        bodyHtml += "</tr>";
    });
    tbody.innerHTML = bodyHtml;

    let footHtml = "<tr>";
    headers.forEach((key, index) => {
        if (index === 0) {
            footHtml += `<td>TOTALES</td>`;
        } else if (h1DocSumColumns.includes(key)) {
            // Totales de sumas se muestran formateados (incluso si la suma final es 0, mostramos vacío o el valor si es relevante. Usemos formatMoneyCustom)
            footHtml += `<td class="num-cell">${formatMoneyCustom(totals[key])}</td>`;
        } else {
            footHtml += `<td></td>`;
        }
    });
    footHtml += "</tr>";
    tfoot.innerHTML = footHtml;

    table.className = "excel-grid"; 
    table.classList.remove('hidden');
    empty.classList.add('hidden');
    cards.classList.remove('hidden');
    document.getElementById('rowCountBadge').classList.remove('hidden');
    document.getElementById('rowCountBadge').innerText = `${data.length} Carpetas`;
    btnCopy.classList.remove('hidden');
    btnExcel.classList.remove('hidden');
}

// RENDERIZAR TABLA FORMATO PREMIUM (DOBLE CABECERA)
function renderTablePremium(data) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const tfoot = document.getElementById('tableFoot');
    const table = document.getElementById('resultTable');
    const empty = document.getElementById('emptyState');
    const btnCopy = document.getElementById('btnCopy');
    const btnExcel = document.getElementById('btnExcel');
    const cards = document.getElementById('summaryCards');

    const premiumSumColumns = [
        'valor_cif', 'comision_agencia', 'albo', 'dab', 'dhl', 'remac', 'deze', 
        'scharff', 'maritime', 'ctrans', 'express', 'latam', 'otros', 'aspb', 
        'otro_gasto', 'total_planilla', 'total_general'
    ];

    // Doble Cabecera HTML
    thead.innerHTML = `
        <tr>
            <th rowspan="2">N°</th>
            <th rowspan="2">FECHA VALIDACIÓN</th>
            <th colspan="2" class="text-center bg-slate-100 border-b">PLANILLA</th>
            <th rowspan="2">INTERNO AGENCIA</th>
            <th rowspan="2">N° DE DECLARACIÓN</th>
            <th rowspan="2">ORDEN DE COMPRA</th>
            <th rowspan="2" class="text-right">VALOR CIF Bs.</th>
            <th rowspan="2" class="text-right">TIPO DE CAMBIO</th>
            <th rowspan="2" class="text-right">COMISIÓN AGENCIA</th>
            <th rowspan="2">Nº FACTURA ALMACENAJE</th>
            <th rowspan="2" class="text-right">ALBO</th>
            <th rowspan="2" class="text-right">DAB</th>
            <th rowspan="2">Nº FACT. COURRIER</th>
            <th rowspan="2" class="text-right">DHL</th>
            <th rowspan="2" class="text-right">REMAC</th>
            <th rowspan="2" class="text-right">DEZE</th>
            <th rowspan="2" class="text-right">SCHARFF</th>
            <th rowspan="2" class="text-right">MARITIME</th>
            <th rowspan="2" class="text-right">CTRANS</th>
            <th rowspan="2" class="text-right">EXPRESS</th>
            <th rowspan="2" class="text-right">LATAM</th>
            <th rowspan="2" class="text-right">OTROS</th>
            <th rowspan="2" class="text-right">ASP-B</th>
            <th rowspan="2">N° FACTURA</th>
            <th rowspan="2" class="text-right">OTRO GASTO</th>
            <th rowspan="2" class="text-right">TOTAL PLANILLA</th>
            <th rowspan="2" class="text-right">TOTAL GENERAL</th>
            <th rowspan="2" class="text-center">VERIFICADO SUMA</th>
            <th rowspan="2" class="text-center">VERIFICADO SALDOS</th>
        </tr>
        <tr>
            <th class="bg-slate-50 border-r text-center">Nº</th>
            <th class="bg-slate-50 text-center">FECHA</th>
        </tr>
    `;

    const totals = {};
    premiumSumColumns.forEach(col => totals[col] = 0);

    let bodyHtml = '';
    data.forEach(row => {
        bodyHtml += "<tr class='hover:bg-orange-500/5/50 transition-colors'>";
        
        bodyHtml += `<td class="text-center font-mono">${row.n_correlativo}</td>`;
        bodyHtml += `<td class="text-center">${formatDateCustom(row.fecha_validacion)}</td>`;
        bodyHtml += `<td class="text-center font-mono">${row.planilla_num}</td>`;
        bodyHtml += `<td class="text-center">${formatDateCustom(row.planilla_fecha)}</td>`;
        bodyHtml += `<td class="text-center font-bold text-slate-700">${row.interno_agencia}</td>`;
        bodyHtml += `<td class="text-center font-mono">${row.n_declaracion}</td>`;
        bodyHtml += `<td class="text-center">${row.orden_compra}</td>`;
        
        // Cif
        totals['valor_cif'] += row.valor_cif;
        bodyHtml += `<td class="num-cell font-medium">${formatMoneyCustom(row.valor_cif)}</td>`;
        
        // Tipo de Cambio
        bodyHtml += `<td class="num-cell font-medium">${formatMoneyCustom(row.tipo_cambio)}</td>`;

        // Comisión
        totals['comision_agencia'] += row.comision_agencia;
        bodyHtml += `<td class="num-cell text-slate-800 font-bold">${formatMoneyCustom(row.comision_agencia)}</td>`;
        
        bodyHtml += `<td class="text-center font-mono">${row.n_factura_almacenaje}</td>`;
        
        // Albo
        totals['albo'] += row.albo;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.albo)}</td>`;
        
        // Dab
        totals['dab'] += row.dab;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.dab)}</td>`;
        
        bodyHtml += `<td class="text-center font-mono">${row.n_factura_courrier}</td>`;
        
        // Courier columns
        totals['dhl'] += row.dhl;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.dhl)}</td>`;
        totals['remac'] += row.remac;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.remac)}</td>`;
        totals['deze'] += row.deze;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.deze)}</td>`;
        totals['scharff'] += row.scharff;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.scharff)}</td>`;
        totals['maritime'] += row.maritime;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.maritime)}</td>`;
        totals['ctrans'] += row.ctrans;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.ctrans)}</td>`;
        totals['express'] += row.express;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.express)}</td>`;
        totals['latam'] += row.latam;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.latam)}</td>`;
        totals['otros'] += row.otros;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.otros)}</td>`;
        
        // Ports
        totals['aspb'] += row.aspb;
        bodyHtml += `<td class="num-cell font-bold">${formatMoneyCustom(row.aspb)}</td>`;
        
        bodyHtml += `<td class="text-center font-mono">${row.n_factura_otros}</td>`;
        
        // Otros
        totals['otro_gasto'] += row.otro_gasto;
        bodyHtml += `<td class="num-cell">${formatMoneyCustom(row.otro_gasto)}</td>`;
        
        // Planilla & General Totales
        totals['total_planilla'] += row.total_planilla;
        bodyHtml += `<td class="num-cell font-black bg-slate-50 text-slate-900">${formatMoneyCustom(row.total_planilla)}</td>`;
        
        totals['total_general'] += row.total_general;
        bodyHtml += `<td class="num-cell font-black bg-slate-100">${formatMoneyCustom(row.total_general)}</td>`;
        
        // Verificaciones
        bodyHtml += `<td class="text-center">${formatVerifCell(row.verificado_suma)}</td>`;
        bodyHtml += `<td class="text-center">${formatVerifCell(row.verificado_saldos)}</td>`;
        
        bodyHtml += "</tr>";
    });
    tbody.innerHTML = bodyHtml;

    // Totales (Footer)
    let footHtml = "<tr>";
    footHtml += `<td colspan="7" class="text-right font-black uppercase text-xs tracking-wider px-4">TOTALES</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['valor_cif'])}</td>`;
    footHtml += `<td></td>`; 
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['comision_agencia'])}</td>`;
    footHtml += `<td></td>`; 
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['albo'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['dab'])}</td>`;
    footHtml += `<td></td>`; 
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['dhl'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['remac'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['deze'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['scharff'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['maritime'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['ctrans'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['express'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['latam'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['otros'])}</td>`;
    
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['aspb'])}</td>`;
    footHtml += `<td></td>`; 
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['otro_gasto'])}</td>`;
    
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['total_planilla'])}</td>`;
    footHtml += `<td class="num-cell">${formatMoneyCustom(totals['total_general'])}</td>`;
    footHtml += `<td colspan="2"></td>`; 
    footHtml += "</tr>";
    tfoot.innerHTML = footHtml;

    table.className = "excel-grid";
    table.classList.remove('hidden');
    empty.classList.add('hidden');
    cards.classList.remove('hidden');
    document.getElementById('rowCountBadge').classList.remove('hidden');
    document.getElementById('rowCountBadge').innerText = `${data.length} Carpetas`;
    btnCopy.classList.remove('hidden');
    btnExcel.classList.remove('hidden');
}

// COPIAR COLUMNA INDIVIDUAL (Con formato raw para links)
function copyColumn(key) {
    let textData = '';
    if (currentFormat === 'h1doc') {
        const numericCols = ['H1BS', 'H1IVA', 'H1GA', 'H1SIST', 'CONTROL', 'H1CIFBS', 'H1TC', 'H1CIFUSD', 'H1CAV', 'ALM', 'ALM2', 'COUR', 'TRANS', 'PUERT'];
        const dateCols = ['H1FECHA', 'FECH', 'FECH_IP', 'FECH32', 'FECH_OTROS', 'FECH44'];

        textData = processedResults.map(row => {
            let val = row[key];
            if (numericCols.includes(key)) return formatMoneyCustom(val);
            if (dateCols.includes(key)) return formatDateCustom(val);
            return val;
        }).join('\n');
    } else {
        const premiumNumCols = ['valor_cif', 'tipo_cambio', 'comision_agencia', 'albo', 'dab', 'dhl', 'remac', 'deze', 'scharff', 'maritime', 'ctrans', 'express', 'latam', 'otros', 'aspb', 'otro_gasto', 'total_planilla', 'total_general'];
        const premiumDateCols = ['fecha_validacion', 'planilla_fecha'];

        textData = processedResults.map(row => {
            let val = row[key];
            if (premiumNumCols.includes(key)) return formatMoneyCustom(val);
            if (premiumDateCols.includes(key)) return formatDateCustom(val);
            return val;
        }).join('\n');
    }

    const textarea = document.createElement("textarea");
    textarea.value = textData;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        const Toast = Swal.mixin({ toast: true, position: 'top', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: `Columna "${key}" copiada` });
    } catch (err) {
        Swal.fire('Error', 'No se pudo copiar.', 'error');
    }
    document.body.removeChild(textarea);
}

function copyTable() {
    const table = document.getElementById('resultTable');
    if (!table) return;
    const range = document.createRange();
    range.selectNode(table);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('copy');
    selection.removeAllRanges();
    Swal.fire({ icon: 'success', title: 'Tabla Copiada', text: 'Pégala en Excel con confianza, compa.', timer: 1500, showConfirmButton: false });
}

function downloadExcel() {
    if (processedResults.length === 0) return;

    // Helper para retornar null en vez de 0 en el Excel
    const formatValExcel = (val) => {
        const num = parseFloat(val) || 0;
        return Math.abs(num) < 0.009 ? null : num;
    };

    if (currentFormat === 'h1doc') {
        const wsRows = processedResults.map(r => {
            const copy = { ...r };
            const moneyKeys = ['H1IVA', 'H1GA', 'H1SIST', 'CONTROL', 'ALM', 'ALM2', 'COUR', 'TRANS', 'PUERT'];
            moneyKeys.forEach(k => {
                if (copy[k] !== undefined) {
                    copy[k] = formatValExcel(copy[k]);
                }
            });
            return copy;
        });
        const ws = XLSX.utils.json_to_sheet(wsRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte H1DOC");
        XLSX.writeFile(wb, "Reporte_Cliente_H1DOC.xlsx");
    } else {
        // Construir la matriz de datos para SheetJS con doble cabecera (Formato Premium)
        const headerRow1 = [
            "N°", "FECHA VALIDACIÓN", "PLANILLA", "", "INTERNO AGENCIA", "N° DE DECLARACIÓN", "ORDEN DE COMPRA",
            "VALOR CIF Bs.", "TIPO DE CAMBIO", "COMISIÓN AGENCIA", "Nº FACTURA ALMACENAJE", "ALBO", "DAB", "Nº FACT. COURRIER",
            "DHL", "REMAC", "DEZE", "SCHARFF", "MARITIME", "CTRANS", "EXPRESS", "LATAM", "OTROS",
            "ASP-B", "N° FACTURA", "OTRO GASTO", "TOTAL PLANILLA", "TOTAL GENERAL", "VERIFICADO POR SUMA", "VERIFICADO POR SALDOS"
        ];
        const headerRow2 = [
            "", "", "Nº", "FECHA", "", "", "",
            "", "", "", "", "", "", "",
            "", "", "", "", "", "", "", "", "",
            "", "", "", "", "", "", ""
        ];

        const rows = [headerRow1, headerRow2];

        // Llenar datos
        processedResults.forEach(r => {
            rows.push([
                r.n_correlativo,
                formatDateCustom(r.fecha_validacion),
                r.planilla_num,
                formatDateCustom(r.planilla_fecha),
                r.interno_agencia,
                r.n_declaracion,
                r.orden_compra,
                formatValExcel(r.valor_cif),
                formatValExcel(r.tipo_cambio),
                formatValExcel(r.comision_agencia),
                r.n_factura_almacenaje,
                formatValExcel(r.albo),
                formatValExcel(r.dab),
                r.n_factura_courrier,
                formatValExcel(r.dhl),
                formatValExcel(r.remac),
                formatValExcel(r.deze),
                formatValExcel(r.scharff),
                formatValExcel(r.maritime),
                formatValExcel(r.ctrans),
                formatValExcel(r.express),
                formatValExcel(r.latam),
                formatValExcel(r.otros),
                formatValExcel(r.aspb),
                r.n_factura_otros,
                formatValExcel(r.otro_gasto),
                formatValExcel(r.total_planilla),
                formatValExcel(r.total_general),
                r.verificado_suma,
                r.verificado_saldos
            ]);
        });

        // Agregar fila de Totales
        let totalCif = 0, totalCom = 0, totalAlbo = 0, totalDab = 0, totalDhl = 0, totalRemac = 0, totalDeze = 0;
        let totalSch = 0, totalMar = 0, totalCtr = 0, totalExp = 0, totalLat = 0, totalOtr = 0, totalAsp = 0, totalOtrG = 0;
        let totalPlan = 0, totalGen = 0;

        processedResults.forEach(r => {
            totalCif += r.valor_cif;
            totalCom += r.comision_agencia;
            totalAlbo += r.albo;
            totalDab += r.dab;
            totalDhl += r.dhl;
            totalRemac += r.remac;
            totalDeze += r.deze;
            totalSch += r.scharff;
            totalMar += r.maritime;
            totalCtr += r.ctrans;
            totalExp += r.express;
            totalLat += r.latam;
            totalOtr += r.otros;
            totalAsp += r.aspb;
            totalOtrG += r.otro_gasto;
            totalPlan += r.total_planilla;
            totalGen += r.total_general;
        });

        rows.push([
            "TOTALES", "", "", "", "", "", "",
            formatValExcel(totalCif), formatValExcel(totalCom), "", formatValExcel(totalAlbo), formatValExcel(totalDab), "",
            formatValExcel(totalDhl), formatValExcel(totalRemac), formatValExcel(totalDeze), formatValExcel(totalSch), formatValExcel(totalMar), formatValExcel(totalCtr), formatValExcel(totalExp), formatValExcel(totalLat), formatValExcel(totalOtr),
            formatValExcel(totalAsp), "", formatValExcel(totalOtrG), formatValExcel(totalPlan), formatValExcel(totalGen), "", ""
        ]);

        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Definir merges para la doble cabecera (s = start, e = end, r = row, c = col)
        const merges = [
            { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, 
            { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, 
            { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } }, 
            { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, 
            { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } }, 
            { s: { r: 0, c: 6 }, e: { r: 1, c: 6 } }, 
            { s: { r: 0, c: 7 }, e: { r: 1, c: 7 } }, 
            { s: { r: 0, c: 8 }, e: { r: 1, c: 8 } }, 
            { s: { r: 0, c: 9 }, e: { r: 1, c: 9 } }, 
            { s: { r: 0, c: 10 }, e: { r: 1, c: 10 } }, 
            { s: { r: 0, c: 11 }, e: { r: 1, c: 11 } }, 
            { s: { r: 0, c: 12 }, e: { r: 1, c: 12 } }, 
            { s: { r: 0, c: 13 }, e: { r: 1, c: 13 } }, 
            { s: { r: 0, c: 14 }, e: { r: 1, c: 14 } }, 
            { s: { r: 0, c: 15 }, e: { r: 1, c: 15 } }, 
            { s: { r: 0, c: 16 }, e: { r: 1, c: 16 } }, 
            { s: { r: 0, c: 17 }, e: { r: 1, c: 17 } }, 
            { s: { r: 0, c: 18 }, e: { r: 1, c: 18 } }, 
            { s: { r: 0, c: 19 }, e: { r: 1, c: 19 } }, 
            { s: { r: 0, c: 20 }, e: { r: 1, c: 20 } }, 
            { s: { r: 0, c: 21 }, e: { r: 1, c: 21 } }, 
            { s: { r: 0, c: 22 }, e: { r: 1, c: 22 } }, 
            { s: { r: 0, c: 23 }, e: { r: 1, c: 23 } }, 
            { s: { r: 0, c: 24 }, e: { r: 1, c: 24 } }, 
            { s: { r: 0, c: 25 }, e: { r: 1, c: 25 } }, 
            { s: { r: 0, c: 26 }, e: { r: 1, c: 26 } }, 
            { s: { r: 0, c: 27 }, e: { r: 1, c: 27 } }, 
            { s: { r: 0, c: 28 }, e: { r: 1, c: 28 } }  
        ];

        ws['!merges'] = merges;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte Detalle Despachos");
        XLSX.writeFile(wb, "Reporte_Detalle_Despachos_MSC.xlsx");
    }
}

// Exponer funciones globales para los eventos inline del HTML
window.toggleSidebar = toggleSidebar;
window.setDecimalSeparator = setDecimalSeparator;
window.setDateFormat = setDateFormat;
window.processData = processData;
window.copyMissing = copyMissing;
window.copyTable = copyTable;
window.downloadExcel = downloadExcel;
window.toggleOnlyVerifiedFilter = toggleOnlyVerifiedFilter;
window.changeReportFormat = changeReportFormat;
window.copyColumn = copyColumn;
