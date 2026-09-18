const SUPABASE_URL = "https://sfqpptquojlsbeheguff.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcXBwdHF1b2psc2JlaGVndWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzgzNzAsImV4cCI6MjEwNDgxNDM3MH0.h-wOCnoz6KW8CdGBRowuWJIvknk_sEJ-_2HLx7SC1ek";
const TABLE_NAME = "importaciones";

// Instanciar cliente Supabase usando la librería local UMD
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let extractedData = [];
let pendingFilesCount = 0;
let parsedFilesCount = 0;
let monthlyChartInstance = null;
let clientChartInstance = null;

// ----- CONTROL DE PESTAÑAS -----
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-pane').forEach(v => v.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById(`view-${tabName}`).classList.add('active');

    if (tabName === 'dashboard') {
        loadDashboardData();
    }
}

// ----- MANEJO DE ARCHIVOS (DROPZONE) -----
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('hover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('hover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        processFiles(e.target.files);
    }
});

// ----- PROCESAR ARCHIVOS PDFs -----
async function processFiles(files) {
    const pdfFiles = Array.from(files).filter(f => f.name.endsWith('.pdf'));
    if (pdfFiles.length === 0) return;

    showLoader("Preparando archivos para procesar...");
    extractedData = [];
    document.getElementById('table-body').innerHTML = '';
    document.getElementById('results-area').classList.add('hidden');
    
    pendingFilesCount = pdfFiles.length;
    parsedFilesCount = 0;

    const iframe = document.getElementById('sandbox-frame');

    for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        try {
            const buffer = await file.arrayBuffer();
            // Enviar buffer al iframe sandboxed para extracción de texto
            iframe.contentWindow.postMessage({
                action: 'parsePdf',
                arrayBuffer: buffer,
                fileName: file.name,
                index: i
            }, '*', [buffer]); // Transferir buffer para mejorar performance
        } catch (error) {
            console.error(error);
            showToast(`Error al leer archivo: ${file.name}`, true);
            pendingFilesCount--;
            checkAllFilesProcessed();
        }
    }
}

// ----- LISTENER PARA RECIBIR LA EXTRACCIÓN DEL SANDBOX -----
window.addEventListener('message', (event) => {
    const data = event.data;
    if (data && data.action === 'pdfParsed') {
        parsedFilesCount++;
        
        if (data.success) {
            try {
                // Analizar el texto extraído con las regexes locales del popup
                const parsed = parseData(data.result, data.fileName);
                parsed.enlaces_magicos = data.result.links;
                
                extractedData.push(parsed);
                renderRow(parsed);
            } catch (err) {
                console.error("Error analizando datos del PDF:", err);
                showToast(`Error de análisis en: ${data.fileName}`, true);
            }
        } else {
            console.error("Fallo extracción en sandbox:", data.error);
            showToast(`Fallo extracción en: ${data.fileName}`, true);
        }
        
        checkAllFilesProcessed();
    }
});

function checkAllFilesProcessed() {
    if (parsedFilesCount >= pendingFilesCount) {
        hideLoader();
        if (extractedData.length > 0) {
            document.getElementById('results-area').classList.remove('hidden');
        }
    } else {
        showLoader(`Procesando PDFs (${parsedFilesCount}/${pendingFilesCount})...`);
    }
}

// ----- ANALIZADOR Y EXTRACCIÓN DE EXPRESIONES REGULARES -----
function extractSimple(text, regexStr, def = '-') {
    const m = text.match(new RegExp(regexStr, 'i'));
    return m ? m[1].trim() : def;
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

function extractNIT(text) {
    const regex = /B1\.\s*Importador[\s\S]*?NIT\s*(\d+)/i;
    const match = text.match(regex);
    return match ? match[1] : '-';
}

function extractRazonSocial(text) {
    const regex = /B1\.\s*Importador[\s\S]*?NIT\s*\d+\s+([^\n]+?)(?=\s+OEA|\s+DOMICILIO|\s+TARIJA|\s*,)/i;
    const match = text.match(regex);
    if (match) return match[1].trim();
    const regexSimple = /B1\.\s*Importador[\s\S]*?NIT\s*\d+\s+([^\n]+)/i;
    const matchSimple = text.match(regexSimple);
    return matchSimple ? matchSimple[1].trim() : '-';
}

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
            if (m && m[1].includes("GENERAL")) return "GENERAL";
            if (m && m[1].includes("ANTICIPADO")) return "ANTICIPADO";
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

// ----- RENDERIZAR TABLA EN PANTALLA -----
function renderRow(data) {
    const tbody = document.getElementById('table-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="text-blue">${data.declarationNumber}</td>
        <td>${data.referenceNumber}</td>
        <td>${data.documentoAsociado || '-'}</td>
        <td class="text-purple">${data.commercialInvoice}</td>
        <td>${data.pedido}</td>
        <td>${data.pedidoSufijo || '-'}</td>
        <td>${data.contenedor || '-'}</td>
        <td>${data.pesoBruto || '-'}</td>
        <td class="text-orange">${data.totalTributos}</td>
    `;
    tbody.appendChild(tr);
}

// ----- SUBIR A SUPABASE CON ACTUALIZACIÓN SELECTIVA -----
document.getElementById('btn-save').addEventListener('click', saveToSupabase);
async function saveToSupabase() {
    if (extractedData.length === 0) return;
    
    showLoader("Enviando y actualizando datos en Supabase...");
    const newDecls = extractedData.map(d => d.declarationNumber);
    
    try {
        // Consultar qué declaraciones ya existen en Supabase
        const { data: existing, error: checkErr } = await supabase
            .from(TABLE_NAME)
            .select('id, n_declaracion, documento_asociado, peso_bruto, pedido_sufijo, contenedor')
            .in('n_declaracion', newDecls);

        if (checkErr) throw checkErr;
        
        const existingMap = new Map(existing ? existing.map(i => [i.n_declaracion, i]) : []);
        
        const toInsert = extractedData.filter(d => !existingMap.has(d.declarationNumber));
        const toUpdate = extractedData.filter(d => {
            if (!existingMap.has(d.declarationNumber)) return false;
            const dbRow = existingMap.get(d.declarationNumber);
            
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
            hideLoader();
            return showToast("El registro ya existe en el sistema y cuenta con todos sus datos completos.", true);
        }

        let insertedCount = 0;
        let updatedCount = 0;
        let updateErrors = 0;

        // 1. Inserción de nuevos registros
        if (toInsert.length > 0) {
            const dbData = toInsert.map(d => ({
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
            }));

            const { error: insErr } = await supabase.from(TABLE_NAME).insert(dbData);
            if (insErr) throw insErr;
            insertedCount = toInsert.length;
        }

        // 2. Actualización de los 4 campos en registros existentes
        if (toUpdate.length > 0) {
            for (const d of toUpdate) {
                const dbRow = existingMap.get(d.declarationNumber);
                if (dbRow && dbRow.id) {
                    const { error: updErr } = await supabase
                        .from(TABLE_NAME)
                        .update({
                            documento_asociado: d.documentoAsociado,
                            peso_bruto: d.pesoBruto,
                            pedido_sufijo: d.pedidoSufijo,
                            contenedor: d.contenedor
                        })
                        .eq('id', dbRow.id);

                    if (updErr) updateErrors++;
                    else updatedCount++;
                }
            }
        }
        
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
            msg += ` (Fallaron ${updateErrors} filas).`;
        }
        
        showToast(msg, updateErrors > 0);
        extractedData = [];
        document.getElementById('table-body').innerHTML = '';
        document.getElementById('results-area').classList.add('hidden');

    } catch (e) {
        console.error(e);
        showToast("Error al subir a la nube: " + e.message, true);
    } finally {
        hideLoader();
    }
}

// ----- CARGAR Y RENDERIZAR DASHBOARD -----
async function loadDashboardData() {
    showLoader("Cargando métricas de Supabase...");
    
    try {
        // Intentar cargar de la tabla de resumen dashboard_summary
        const { data: summaryData, error: summaryErr } = await supabase
            .from('dashboard_summary')
            .select('*');
            
        if (!summaryErr && summaryData && summaryData.length > 0) {
            console.log("Cargando dashboard desde tabla resumida dashboard_summary...");
            const kpiRow = summaryData.find(r => r.key === 'declaraciones_kpis');
            const monthlyRow = summaryData.find(r => r.key === 'tributos_mensuales');
            const clientsRow = summaryData.find(r => r.key === 'top_clientes_tributos');
            
            if (kpiRow && monthlyRow && clientsRow) {
                renderDashboardFromSummary(kpiRow.data, monthlyRow.data, clientsRow.data);
                hideLoader();
                return;
            }
        }
        
        // Fallback: Carga clásica lenta (paginada)
        console.warn("Tabla dashboard_summary no disponible. Usando fallback clásico lento...");
        let allData = [];
        let from = 0;
        const step = 999;
        
        // Paginación para traer todo el historial (optimizada para traer solo las columnas de interés)
        while (true) {
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .select('gravamen, iva, total_tributos, razon_social, fecha_aceptacion, total_cif')
                .range(from, from + step);
                
            if (error) throw error;
            if (!data || data.length === 0) break;
            allData.push(...data);
            if (data.length <= step) break;
            from += step + 1;
        }

        renderDashboard(allData);

    } catch (e) {
        console.error(e);
        showToast("Error al cargar dashboard: " + e.message, true);
    } finally {
        hideLoader();
    }
}

function renderDashboardFromSummary(kpiData, monthlyData, clientData) {
    // KPIs
    document.getElementById('kpi-docs').innerText = kpiData.total_docs;
    document.getElementById('kpi-ga').innerText = kpiData.total_ga.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('kpi-iva').innerText = kpiData.total_iva.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('kpi-total').innerText = kpiData.total_tributos.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    // Ordenar y preparar datos para gráficos
    const monthlyArray = [...monthlyData].sort((a, b) => a.sort_key.localeCompare(b.sort_key));
    const clientsArray = [...clientData].sort((a, b) => b.tributos - a.tributos).slice(0, 10);

    updateCharts(monthlyArray, clientsArray);
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
        totalGA += parseAmount(d.gravamen);
        totalIVA += parseAmount(d.iva);
        totalPagar += parseAmount(d.total_tributos);

        let clientName = (d.razon_social || 'DESCONOCIDO').trim().toUpperCase();
        if (!clientStats[clientName]) {
            clientStats[clientName] = 0;
        }
        clientStats[clientName] += parseAmount(d.total_tributos);

        let dateStr = d.fecha_aceptacion || '';
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
        monthlyStats[monthYear].total += parseAmount(d.total_tributos);
    });

    // KPIs
    document.getElementById('kpi-docs').innerText = totalDocs;
    document.getElementById('kpi-ga').innerText = totalGA.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('kpi-iva').innerText = totalIVA.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('kpi-total').innerText = totalPagar.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    // Ordenar y preparar datos para gráficos
    const monthlyArray = Object.keys(monthlyStats).map(k => ({
        label: k,
        total: monthlyStats[k].total,
        sortKey: monthlyStats[k].sortKey
    })).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const clientsArray = Object.keys(clientStats).map(k => ({
        name: k,
        total: clientStats[k]
    })).sort((a, b) => b.total - a.total).slice(0, 10);

    updateCharts(monthlyArray, clientsArray);
}

function updateCharts(monthlyData, clientsData) {
    const ctxMonthly = document.getElementById('chart-monthly').getContext('2d');
    const ctxClients = document.getElementById('chart-clients').getContext('2d');

    if (monthlyChartInstance) monthlyChartInstance.destroy();
    if (clientChartInstance) clientChartInstance.destroy();

    // Estilo común oscuro
    const chartColor = '#f8fafc';
    const gridColor = 'rgba(255, 255, 255, 0.05)';

    monthlyChartInstance = new Chart(ctxMonthly, {
        type: 'bar',
        data: {
            labels: monthlyData.map(m => m.label),
            datasets: [{
                label: 'Tributos (Bs.)',
                data: monthlyData.map(m => m.total),
                backgroundColor: 'rgba(59, 130, 246, 0.85)',
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ` Bs. ${c.raw.toLocaleString('en-US', {minimumFractionDigits: 2})}` } }
            },
            scales: {
                y: { grid: { color: gridColor }, ticks: { color: chartColor, font: { size: 9 } } },
                x: { grid: { display: false }, ticks: { color: chartColor, font: { size: 9 } } }
            }
        }
    });

    clientChartInstance = new Chart(ctxClients, {
        type: 'bar',
        data: {
            labels: clientsData.map(c => c.name.length > 10 ? c.name.substring(0, 10) + '...' : c.name),
            datasets: [{
                label: 'Tributos (Bs.)',
                data: clientsData.map(c => c.total),
                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                borderColor: '#10b981',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ` Bs. ${c.raw.toLocaleString('en-US', {minimumFractionDigits: 2})}` } }
            },
            scales: {
                y: { grid: { color: gridColor }, ticks: { color: chartColor, font: { size: 9 } } },
                x: { grid: { display: false }, ticks: { color: chartColor, font: { size: 9 } } }
            }
        }
    });
}

// ----- UI AUXILIAR -----
function showLoader(text = "Procesando...") {
    document.getElementById('loader-text').innerText = text;
    document.getElementById('loader').classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('loader').classList.add('hidden');
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');
    
    toastMsg.innerText = msg;
    toastIcon.style.color = isError ? "var(--accent-orange)" : "var(--accent-blue)";
    
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}
