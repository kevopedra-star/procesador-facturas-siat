import { supabase } from '../services/supabase.js';
let supabaseClient = supabase;

// Variables Globales
let globalRawData = [];
let monthSet = new Set();
let excelMatchData = {}; 

// Utils
const formatMoney = (amount) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

const cleanName = (val) => {
    if (!val) return '';
    return String(val).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

const cleanNitNumeric = (val) => {
    if (val === null || val === undefined) return '';
    return String(val).replace(/[^0-9]/g, '');
};

const cleanNumber = (str) => (!str || typeof str !== 'string') ? '' : str.replace(/[^0-9]/g, '');

const parseDate = (str) => {
    if(!str || str === '-') return 0;
    const parts = str.split(' ')[0].split('/'); 
    if(parts.length !== 3) return 0;
    return new Date(parts[2], parts[1]-1, parts[0]).getTime();
};

const parseMonthYear = (myStr) => {
    const parts = myStr.split('-');
    if (parts.length !== 2) return 0;
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const monthIdx = months.indexOf(parts[0].toUpperCase());
    const year = parseInt(parts[1]) || 0;
    return year * 12 + monthIdx;
};

const getActualMonthStr = () => {
    const date = new Date();
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `${months[date.getMonth()]}-${date.getFullYear()}`;
};


const safeVal = (val) => {
    if (val === null || val === undefined) return '-';
    const str = String(val).trim();
    if (str === '' || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null') return '-';
    return str;
};

const safeFloat = (val) => {
    if (!val || val === '-') return 0;
    return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
};

window.openPopup = (url) => {
    if(!url) return;
    const width = 900; const height = 800;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(url, 'Comprobante', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no`);
    return false;
};

// =========================================================
// FUNCIÓN DEL REVISOR VISUAL DE FACTURAS SOSPECHOSAS (Mantenida por compatibilidad)
// =========================================================
window.verRevisar = (dimId) => {
    const row = globalRawData.find(r => r.id === dimId);
    if(!row || !row.revisar || row.revisar.length === 0) return;

    let html = `<div class="text-[13px] text-left">`;
    html += `<p class="mb-3 text-slate-600">El sistema detectó que estas facturas están asignadas al Interno <b>${row.interno}</b>, pero el <b>Registro Aduanero</b> no pasó la validación estricta.</p>`;
    html += `<div class="overflow-x-auto"><table class="w-full border-collapse border border-slate-300">
        <tr class="bg-slate-100"><th class="border p-2">Factura</th><th class="border p-2">Monto Bs</th><th class="border p-2 text-orange-600">Alerta (Lo que buscaba)</th><th class="border p-2 text-red-600">Reg. Aduanero</th></tr>`;
    
    row.revisar.forEach(f => {
        html += `<tr>
            <td class="border p-1.5 font-bold">${safeVal(f.n_factura)}</td>
            <td class="border p-1.5 font-mono text-right font-bold text-slate-700">${formatMoney(f.monto)}</td>
            <td class="border p-1.5 text-[11px] text-orange-700">${f.causa_alerta || 'No coincide'}</td>
            <td class="border p-1.5 font-mono text-red-600 font-bold bg-red-50">${safeVal(f.registro_aduanero || f.doc_aduanero)}</td>
        </tr>`;
    });
    html += `</table></div></div>`;

    Swal.fire({
        title: '⚠️ Revisión de Facturas',
        html: html,
        icon: 'warning',
        width: '600px',
        showCancelButton: true,
        confirmButtonColor: '#10b981', 
        cancelButtonColor: '#64748b', 
        confirmButtonText: '<i class="fa-solid fa-check-double"></i> Todo está OK, omitir alerta',
        cancelButtonText: 'Cerrar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            document.getElementById('loader').classList.remove('hidden');
            try {
                const { error } = await supabaseClient
                    .from('historial_datos_minera')
                    .upsert({ dim_id: dimId, interno: row.interno, revision_ok: true }, { onConflict: 'dim_id' });
                
                if (error) throw error;
                
                Swal.fire('¡A huevo!', 'La alerta se apagó para este trámite.', 'success');
                loadData(); 
            } catch (e) {
                Swal.fire('Error', e.message, 'error');
            } finally {
                document.getElementById('loader').classList.add('hidden');
            }
        }
    });
};

async function promptMasivoDimReg() {
    const { value: textInput } = await Swal.fire({
        title: 'Carga Masiva de Regularizadas',
        html: `
            <p class="text-xs text-slate-500 mb-2">Copia y pega puro número de INTERNO desde tu Excel (uno por línea).</p>
            <textarea id="masivo-textarea" class="swal2-textarea" placeholder="Ejemplo:&#10;0547-26&#10;0548-26" style="font-family: monospace; font-size: 13px; height: 180px; width: 90%; margin: 0 auto; display: block; border: 1px solid #cbd5e1;"></textarea>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0891b2', 
        preConfirm: () => {
            return document.getElementById('masivo-textarea').value;
        }
    });

    if (textInput) {
        const lines = textInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const updates = lines.map(interno => ({ interno: interno, dim_regularizada: 'OK' }));

        if (updates.length === 0) {
            return Swal.fire('Aguanta', 'No metiste ni un Interno válido carnal.', 'warning');
        }

        document.getElementById('loader').classList.remove('hidden');

        try {
            const { error } = await supabaseClient
                .from('regularizaciones_dims')
                .upsert(updates, { onConflict: 'interno' });

            if (error) throw error;

            Swal.fire({ title: '¡A huevo!', html: `Se marcaron como regularizados <b>${updates.length}</b> trámites.`, icon: 'success' });
            loadData(); 

        } catch (error) {
            console.error("Error al guardar masivo:", error);
            Swal.fire('Chale', 'Hubo un error al guardar en la base de datos: ' + error.message, 'error');
        } finally {
            document.getElementById('loader').classList.add('hidden');
        }
    }
}

async function promptDimReg(interno, isReg) {
    if (isReg) {
        const { isConfirmed } = await Swal.fire({
            title: '¿Quitar Regularización?',
            text: `El trámite ${interno} ya está regularizado. ¿Quieres quitarle la palomita?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, quitar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ef4444'
        });

        if (isConfirmed) {
            document.getElementById('loader').classList.remove('hidden');
            try {
                await supabaseClient.from('regularizaciones_dims').delete().eq('interno', interno);
                Swal.fire({ icon: 'success', title: '¡Listo!', text: 'Se le dio cran.', timer: 1500, showConfirmButton: false });
                loadData();
            } catch (error) {
                Swal.fire('Error', 'No se pudo quitar.', 'error');
            } finally {
                document.getElementById('loader').classList.add('hidden');
            }
        }
    } else {
        const { isConfirmed } = await Swal.fire({
            title: 'Marcar Regularizada',
            text: `¿Confirmas que el trámite Anticipado ${interno} ya se regularizó?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '¡A huevo, guardar!',
            cancelButtonText: 'Nel, me equivoqué',
            confirmButtonColor: '#10b981'
        });

        if (isConfirmed) {
            document.getElementById('loader').classList.remove('hidden');
            try {
                const { error } = await supabaseClient
                    .from('regularizaciones_dims')
                    .upsert({ interno: interno, dim_regularizada: 'OK' }, { onConflict: 'interno' });

                if (error) throw error;
                
                Swal.fire({ icon: 'success', title: '¡Fierro!', text: 'Se guardó al centavo.', timer: 1500, showConfirmButton: false });
                loadData();
            } catch (error) {
                Swal.fire('Error', 'No se pudo guardar.', 'error');
            } finally {
                document.getElementById('loader').classList.add('hidden');
            }
        }
    }
}

async function promptComision(importacionId, interno, actualVal) {
    const targetId = importacionId && String(importacionId) !== '-' ? parseInt(importacionId) : null;
    
    const result = await Swal.fire({
        title: 'Ajustar Comisión',
        html: `¿Quieres fijar la comisión de <b>${interno}</b> en la base de datos?<br><br><span class="text-xs text-slate-500">Si borras el dato, el sistema volverá a calcularla de acuerdo al CIF y escala.</span>`,
        input: 'number',
        inputValue: actualVal,
        inputAttributes: { step: '0.01' },
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar',
        denyButtonText: '<i class="fa-solid fa-eraser"></i> Borrar (Usar DB)',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4f46e5',
        denyButtonColor: '#ef4444' 
    });

    if (result.isConfirmed) {
        const finalVal = parseFloat(result.value);
        if(isNaN(finalVal)) return;
        
        document.getElementById('loader').classList.remove('hidden');
        try {
            const { error } = await supabaseClient
                .from('historial_datos_minera')
                .upsert({ dim_id: targetId, interno: interno, comision: finalVal }, { onConflict: 'interno' });
            
            if (error) throw error;
            loadData();
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        } finally {
            document.getElementById('loader').classList.add('hidden');
        }
    } else if (result.isDenied) {
        document.getElementById('loader').classList.remove('hidden');
        try {
            const { error } = await supabaseClient
                .from('historial_datos_minera')
                .delete()
                .eq('interno', interno);
                
            if (error) throw error;
            loadData();
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        } finally {
            document.getElementById('loader').classList.add('hidden');
        }
    }
}

function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, {header: 1});
        let headerIdx = -1;
        for(let i=0; i<jsonData.length; i++) {
            const rowStr = JSON.stringify(jsonData[i]).toUpperCase();
            if(rowStr.includes('TRAMITE') && rowStr.includes('NRO. FAC.')) { headerIdx = i; break; }
        }
        if(headerIdx === -1) return Swal.fire('Error', 'No encontré las columnas TRAMITE o NRO. FAC.', 'error');
        const headers = jsonData[headerIdx].map(h => String(h).toUpperCase().trim());
        const idxTramite = headers.indexOf('TRAMITE');
        const idxFactura = headers.indexOf('NRO. FAC.');
        const idxFecha = headers.indexOf('FECHA');
        const idxDebito = headers.indexOf('DEBITO');
        if(idxTramite === -1) return Swal.fire('Error', 'Falta columna TRAMITE', 'error');
        let matchesCount = 0;
        for(let i=headerIdx+1; i<jsonData.length; i++) {
            const row = jsonData[i];
            const tramite = String(row[idxTramite] || '').trim();
            if(!tramite) continue;
            let fechaRaw = row[idxFecha];
            let fechaStr = '';
            if(typeof fechaRaw === 'number') {
                const dateObj = new Date(Math.round((fechaRaw - 25569)*86400*1000));
                dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
                fechaStr = dateObj.toLocaleDateString('es-ES'); 
            } else { fechaStr = String(fechaRaw || '').trim(); }
            excelMatchData[tramite] = { ref: String(row[idxFactura] || '').trim(), fecha: fechaStr, debito: parseFloat(row[idxDebito] || 0) };
            matchesCount++;
        }
        Swal.fire('Éxito', `Excel procesado. ${matchesCount} filas leídas.`, 'success');
        document.getElementById('btnSaveExcel').classList.remove('hidden');
        filterAndRender(); 
    };
    reader.readAsArrayBuffer(file);
}

async function saveExcelToBD() {
    const matchedRows = globalRawData.filter(row => excelMatchData[row.interno]);
    if (matchedRows.length === 0) return Swal.fire('Info', 'No hay coincidencias.', 'info');
    const rowsWithErrors = matchedRows.filter(row => Math.abs(row.total - excelMatchData[row.interno].debito) > 1);
    if (rowsWithErrors.length > 0) {
        const itemsError = rowsWithErrors.map(r => r.interno).join(', ');
        return Swal.fire({ icon: 'error', title: '¡No se puede guardar!', html: `Diferencias en: <b>${itemsError}</b>. Todo debe estar verde.` });
    }
    let updates = [];
    matchedRows.forEach(row => {
        const excelData = excelMatchData[row.interno];
        const targetId = row.importacion_id && String(row.importacion_id) !== '-' ? parseInt(row.importacion_id) : null;
        updates.push({ dim_id: targetId, interno: row.interno, ref_excel: excelData.ref, fecha_excel: excelData.fecha, debito_excel: excelData.debito });
    });
    document.getElementById('loader').classList.remove('hidden');
    const { error } = await supabaseClient.from('historial_datos_minera').upsert(updates, {onConflict: 'interno'});
    document.getElementById('loader').classList.add('hidden');
    if(error) { console.error(error); Swal.fire('Error', 'Falló el guardado.', 'error'); } 
    else { Swal.fire('¡Fierro!', `Guardados ${updates.length} registros.`, 'success'); loadData(); }
}

function exportToExcel() {
    const originalTable = document.getElementById("planillaTable");
    const tableClone = originalTable.cloneNode(true);
    const rows = tableClone.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        cells.forEach(cell => {
            const multiDivs = cell.querySelectorAll('.multi-cell div');
            if (multiDivs.length > 0) {
                let textParts = []; multiDivs.forEach(div => textParts.push(div.innerText));
                cell.innerText = textParts.join('\n'); cell.style.whiteSpace = 'pre-wrap';
            }
            if (cell.querySelector('.fa-check')) cell.innerText = cell.innerText.trim() + " (OK)";
            if (cell.querySelector('a') && cell.querySelector('a').innerHTML.includes('fa-arrow-up')) cell.innerText = "Ver Link"; 
            cell.innerText = cell.innerText.trim();
        });
    });
    const wb = XLSX.utils.table_to_book(tableClone, {sheet: "Planilla MSC", raw: true});
    const ws = wb.Sheets["Planilla MSC"];
    if(!ws['!cols']) ws['!cols'] = [];
    for(let i=0; i<45; i++) ws['!cols'][i] = {wpx: 120};
    XLSX.writeFile(wb, `Reporte_Minera_San_Cristobal_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function loadData() {
    document.getElementById('loader').classList.remove('hidden');
    try {
        const fetchAllData = async (table, selectCols = '*', limit = 1000) => {
            let allData = [];
            let offset = 0;
            let page = 0;
            const MAX_PAGES = 50;
            while (page < MAX_PAGES) {
                page++;
                const { data, error } = await supabaseClient.from(table).select(selectCols).range(offset, offset + limit - 1);
                if (error) {
                    console.error(`Error al consultar ${table} (offset ${offset}):`, error);
                    break;
                }
                if (!data || data.length === 0) break;
                allData.push(...data);
                if (data.length < limit) break;
                offset += limit;
            }
            return allData;
        };

        const dataConsolidada = await fetchAllData('v_matriz_liquidacion_horizontal');

        monthSet.clear();

        globalRawData = (dataConsolidada || []).map((row) => {
            if (row.mes && row.mes !== '-') {
                monthSet.add(row.mes);
            }

            const alboTotal = safeFloat(row['ALBO - DAB MONTO']);
            const ipTotal = safeFloat(row.ip_monto);
            const guiasTotal = safeFloat(row.guias_monto);
            const puertosTotal = safeFloat(row.puertos_monto);
            const otrosTotal = safeFloat(row.otro_monto);

            return {
                id: row.interno,
                importacion_id: row.importacion_id || '-',
                cliente: 'MINERA SAN CRISTOBAL S.A.',
                fecha_val: row.fecha_dim || '-',
                mes: row.mes || '-',
                n_ref_excel: '', 
                fecha_excel: '', 
                interno: row.interno,
                dim_n: row.dim_n_ro || '-',
                oi: row.oi || '-', 
                cif: row.valor_cif_bs ? parseFloat(row.valor_cif_bs.replace(/[^0-9.]/g, '')) : 0,
                modalidad: row.modalidad || '-', 
                dim_reg: row.dim_reg === 'OK', 
                comision: row.comision_bs ? parseFloat(row.comision_bs.replace(/[^0-9.]/g, '')) : 0, 
                comision_fija: row.porcentaje_comision && (row.porcentaje_comision.includes('Fijo') || row.porcentaje_comision.includes('Manual')),
                
                // CANAL Y FECHA CANAL DESDE CONTROL_ESTADOS_IMPORTACION
                canal: row.canal || '-',
                fecha_canal: row.fecha_canal || '-',
                
                // ALBO / DAB
                albo_monto: row['ALBO - DAB MONTO'],
                albo_factura: row.albo_factura,
                albo_fecha: row.albo_fecha,
                albo_enlace: row.enlace_albo,
                albo_cod: row['ALBO COD'],
                albo_n_declaracion: row['n_declaracion (importaciones)'],
                albo_doc_aduanero: row['doc_aduanero (facturas)'],
                albo_verificado: row['verificado albo'],
                
                // IP
                ip_monto: row.ip_monto,
                ip_factura: row.ip_factura,
                ip_fecha: row.ip_fecha,
                ip_enlace: row.ip_albo,
                ip_cod: row['IP COD'],
                ip_examen_previo: row['examen_previo (importaciones)'],
                ip_doc_aduanero: row['doc_aduanero (facturas) '],
                ip_verificado: row['verificado ip'],
                
                // GUIA
                guias_monto: row.guias_monto,
                guias_factura: row.guias_factura,
                guias_fecha: row.guias_fecha,
                guias_enlace: row.guias_albo,
                guias_cod: row['GUIAS COD'],
                guias_guia_embarque: row['guia_embarque (importaciones)'],
                guias_ref_guia: row['ref_guia (facturas)'],
                guias_verificado: row['verificado guia'],
                
                // PUERTO
                puerto_monto: row.puertos_monto,
                puerto_comprobante: row.puerto_comprobante,
                puerto_fecha: row.puerto_fecha,
                
                // OTROS
                otros_monto: row.otro_monto,
                otros_factura: row.otro_factura,
                otros_fecha: row.otro_fecha,
                otros_enlace: row.otro_albo,
                otros_cod: row['OTRO COD'],
                
                revisar: [],
                showWarning: false,
                total: alboTotal + ipTotal + guiasTotal + puertosTotal + otrosTotal
            };
        });

        const monthSelect = document.getElementById('monthFilter');
        if (monthSelect) {
            monthSelect.innerHTML = '<option value="all">Todos los Meses</option>';
            Array.from(monthSet).sort((a, b) => parseMonthYear(b) - parseMonthYear(a)).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.innerText = m; monthSelect.appendChild(opt);
            });

            const curMonth = getActualMonthStr();
            if (monthSet.has(curMonth)) {
                monthSelect.value = curMonth;
            } else {
                const sortedMonths = Array.from(monthSet).sort((a, b) => parseMonthYear(b) - parseMonthYear(a));
                if (sortedMonths.length > 0) {
                    monthSelect.value = sortedMonths[0];
                } else {
                    monthSelect.value = 'all';
                }
            }
        }

        filterAndRender();
        suscribirTiempoReal();

    } catch(e) { console.error(e); Swal.fire('Error', 'Falla al cargar: ' + e.message, 'error'); }
    document.getElementById('loader').classList.add('hidden');
}

let realtimeChannel = null;
function suscribirTiempoReal() {
    if (!supabaseClient || realtimeChannel) return;
    
    realtimeChannel = supabaseClient
        .channel('realtime-planilla-msc')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mtodo' }, (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;
            if (eventType === 'INSERT' && newRow) {
                const idx = globalRawData.findIndex(r => r.interno === newRow.interno);
                if (idx >= 0) globalRawData[idx] = { ...globalRawData[idx], ...newRow };
                else globalRawData.unshift(newRow);
            } else if (eventType === 'UPDATE' && newRow) {
                const idx = globalRawData.findIndex(r => r.interno === newRow.interno || r.id === newRow.id);
                if (idx >= 0) globalRawData[idx] = { ...globalRawData[idx], ...newRow };
            } else if (eventType === 'DELETE' && oldRow) {
                globalRawData = globalRawData.filter(r => r.interno !== oldRow.interno && r.id !== oldRow.id);
            }
            filterAndRender();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'control_estados_importacion' }, (payload) => {
            const { eventType, new: newRow } = payload;
            if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow) {
                const refKey = (newRow.n_referencia || '').trim().toUpperCase();
                let updated = false;
                globalRawData.forEach(r => {
                    if (r.interno && r.interno.trim().toUpperCase() === refKey) {
                        if (newRow.canal) r.canal = newRow.canal;
                        if (newRow.fecha_canal) r.fecha_canal = newRow.fecha_canal;
                        updated = true;
                    }
                });
                if (updated) filterAndRender();
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

function filterAndRender() {
    const monthVal = document.getElementById('monthFilter').value;
    const sortVal = document.getElementById('sortFilter').value;
    const searchVal = document.getElementById('searchFilter').value.toUpperCase().trim();
    const regVal = document.getElementById('regFilter').value; 

    let filtered = globalRawData.filter(row => {
        let passMonth = true;
        if(monthVal !== 'all') passMonth = row.mes === monthVal;
        
        let passSearch = true;
        if(searchVal) {
            const txt = `${row.dim_n} ${row.interno} ${row.oi}`.toUpperCase();
            passSearch = txt.includes(searchVal);
        }
        
        let passReg = true;
        const esAnticipada = safeVal(row.modalidad).toLowerCase().includes('anticipad');
        if(regVal === 'pending') passReg = esAnticipada && !row.dim_reg; 
        else if (regVal === 'done') passReg = esAnticipada && !!row.dim_reg; 
        else if (regVal === 'general') passReg = !esAnticipada;

        return passMonth && passSearch && passReg;
    });

    filtered.sort((a, b) => {
        if(sortVal === 'fecha_desc') return parseDate(b.fecha_val) - parseDate(a.fecha_val);
        if(sortVal === 'fecha_asc') return parseDate(a.fecha_val) - parseDate(b.fecha_val);
        if(sortVal === 'dim_desc') return b.dim_n.localeCompare(a.dim_n);
        if(sortVal === 'dim_asc') return a.dim_n.localeCompare(b.dim_n);
        return 0;
    });

    let sComision=0, sAlbo=0, sIP=0, sGuia=0, sPuerto=0, sOtros=0, sTotalGastos=0;
    filtered.forEach(r => {
        sComision += (r.comision || 0); 
        sAlbo += safeFloat(r.albo_monto);
        sIP += safeFloat(r.ip_monto);
        sGuia += safeFloat(r.guias_monto);
        sPuerto += safeFloat(r.puerto_monto);
        sOtros += safeFloat(r.otros_monto);
        sTotalGastos += r.total; 
    });

    document.getElementById('kpiComision').innerText = formatMoney(sComision);
    document.getElementById('kpiAlbo').innerText = formatMoney(sAlbo);
    document.getElementById('kpiIp').innerText = formatMoney(sIP);
    document.getElementById('kpiGuia').innerText = formatMoney(sGuia);
    document.getElementById('kpiPuerto').innerText = formatMoney(sPuerto);
    document.getElementById('kpiOtros').innerText = formatMoney(sOtros);
    document.getElementById('kpiTotalGastos').innerText = formatMoney(sTotalGastos);
    document.getElementById('kpiGranTotal').innerText = formatMoney(sTotalGastos + sComision);

    renderTable(filtered.map((row, idx) => ({...row, idx: idx + 1})));
}

const renderMultiCell = (valString, isMoney = false, isLink = false) => {
    if (!valString || valString === '-') {
        return `<div class="multi-cell"><div>-</div></div>`;
    }
    const parts = valString.split(', ');
    const divs = parts.map(part => {
        let display = part.trim();
        if (isMoney) {
            display = formatMoney(parseFloat(display));
        } else if (isLink) {
            if (display.startsWith('http')) {
                return `<div><a href="javascript:void(0)" onclick="openPopup('${display}')" class="text-orange-500 hover:text-blue-800 transition-colors"><i class="fa-solid fa-arrow-up-right-from-square text-xs"></i></a></div>`;
            } else {
                return `<div>-</div>`;
            }
        }
        return `<div>${display}</div>`;
    }).join('');
    return `<div class="multi-cell">${divs}</div>`;
};

function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    document.getElementById('countDisplay').innerText = data.length;
    tbody.innerHTML = '';

    const renderGroupHtml = (codVal, factVal, fechaVal, montoVal, linkVal, extra1Val, extra2Val, extra3Val, verifVal) => {
        const cods = renderMultiCell(codVal);
        const facts = renderMultiCell(factVal);
        const fechas = renderMultiCell(fechaVal);
        const montos = renderMultiCell(montoVal, true);
        const links = renderMultiCell(linkVal, false, true);
        
        let extraHtml = '';
        if (extra1Val !== undefined) {
            const extras1 = renderMultiCell(extra1Val);
            const extras2 = renderMultiCell(extra2Val);
            
            // Colorear el verificado
            let verifClass = 'text-slate-400';
            if (verifVal === 'VERIFICADO') verifClass = 'font-black text-orange-500 dark:text-emerald-450 bg-orange-500/10 px-1.5 py-0.5 rounded text-[9px]';
            else if (verifVal === 'NO VERIFICADO') verifClass = 'font-black text-red-600 dark:text-red-450 bg-red-500/10 px-1.5 py-0.5 rounded text-[9px]';
            
            const verifs = `<div><span class="${verifClass}">${verifVal}</span></div>`;
            
            extraHtml = `
                <td>${extras1}</td>
                <td>${extras2}</td>
                <td class="text-center font-bold">${verifs}</td>
            `;
        }
        
        return `
            <td>${cods}</td>
            <td>${facts}</td>
            <td>${fechas}</td>
            <td class="font-mono text-right font-bold">${montos}</td>
            <td>${links}</td>
            ${extraHtml}
        `;
    };

    data.forEach(row => {
        let displayRef = safeVal(row.n_ref_excel);
        let displayFecha = safeVal(row.fecha_excel);
        let totalClass = "!bg-slate-800 !text-white"; 
        let totalTooltip = "";

        const excelRow = excelMatchData[row.interno];
        if (excelRow) {
            displayRef = `<span class="text-orange-500 font-bold">${excelRow.ref}</span>`;
            displayFecha = `<span class="text-orange-500 font-bold">${excelRow.fecha}</span>`;
            const diff = Math.abs(row.total - excelRow.debito);
            if (diff < 1) { 
                totalClass = "!bg-orange-500 !text-white";
                totalTooltip = "Coincide con Excel ✅";
            } else {
                totalClass = "!bg-red-600 !text-white animate-pulse";
                totalTooltip = `Diferencia! Excel: ${formatMoney(excelRow.debito)}`;
            }
        } else if (row.n_ref_excel) {
            totalClass = "!bg-slate-700 !text-white";
            totalTooltip = "Verificado Históricamente";
        }

        const mod = safeVal(row.modalidad);
        const modStyle = mod.toLowerCase().includes('anticipado') ? 'font-bold text-orange-500' : 'text-slate-500';
        const esAnticipada = mod.toLowerCase().includes('anticipad');

        let filaColorClass = "row-general";
        if (esAnticipada) {
            filaColorClass = row.dim_reg ? "row-anticipada-done" : "row-anticipada-pending";
        }

        let dimRegCell = `<td class="text-center text-[9px] text-slate-400 border-l-2 border-orange-400">-</td>`;
        if (esAnticipada) {
            if (row.dim_reg) {
                dimRegCell = `
                    <td class="text-center relative group cursor-pointer border-l-2 border-orange-400 bg-emerald-50 hover:bg-orange-500/10 transition-colors" onclick="promptDimReg('${row.interno}', true)" title="Clic para quitar regularización">
                        <span class="font-bold text-orange-600 text-[10px]">OK</span>
                        <i class="fa-solid fa-check-double text-orange-500 ml-1"></i>
                    </td>`;
            } else {
                dimRegCell = `
                    <td class="text-center relative border-l-2 border-orange-400">
                        <button onclick="promptDimReg('${row.interno}', false)" class="text-[9px] bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded shadow-sm transition-colors w-full">
                            <i class="fa-solid fa-check mr-1"></i> Reg.
                        </button>
                    </td>`;
            }
        }

        const styleComision = row.comision_fija 
            ? "bg-orange-500/10 text-indigo-900 border-orange-400" 
            : "text-orange-600 bg-indigo-50"; 
            
        const titleComision = row.comision_fija 
            ? "Ajustada Manualmente. Clic para editar/borrar." 
            : "Escala Automática. Clic para fijar.";
            
        const iconComision = row.comision_fija 
            ? `<i class="fa-solid fa-lock text-[8px] ml-1 text-orange-400"></i>` 
            : '';

        let btnRevisar = '';
        if (row.showWarning) {
            const fallas = row.revisar.filter(f => f.requiere_revision).length;
            btnRevisar = `<button onclick="verRevisar('${row.id}')" class="ml-1 bg-orange-500 hover:bg-orange-600 text-white text-[8px] px-1.5 py-0.5 rounded shadow-sm animate-pulse whitespace-nowrap" title="Verificar Facturas">
                <i class="fa-solid fa-triangle-exclamation"></i> Revisar (${fallas})
            </button>`;
        }

        const tr = document.createElement('tr');
        tr.className = filaColorClass; 
        
        tr.innerHTML = `
            <td class="font-bold text-slate-600 text-[9px] truncate max-w-[120px]" title="${row.cliente}">${row.cliente || '-'}</td>
            <td class="text-center font-bold text-slate-500">${row.idx}</td>
            <td>${row.fecha_val}</td>
            <td>${row.fecha_val}</td>
            <td class="text-center font-mono font-bold border-l-2 border-orange-400">${displayRef}</td> 
            <td class="text-center text-[9px]">${displayFecha}</td> 
            <td class="font-bold text-orange-600 whitespace-nowrap">${row.interno}<br>${btnRevisar}</td>
            <td class="mono text-slate-500 text-[9px]">${row.dim_n}</td>
            <td class="text-[9px] text-center ${modStyle}">${mod}</td>
            ${dimRegCell}
            <td class="text-[9px] font-bold text-slate-700">${safeVal(row.oi)}</td> 
            <td class="mono text-right font-medium">${formatMoney(row.cif)}</td>
            <td class="mono text-right font-bold cursor-pointer hover:bg-indigo-200 transition-colors ${styleComision}" onclick="promptComision('${row.importacion_id}', '${row.interno}', ${row.comision})" title="${titleComision}">
                ${formatMoney(row.comision)}${iconComision}
            </td>
            
            <!-- ALBO / DAB -->
            ${(function(){ const isAnticipada = safeVal(row.modalidad).toLowerCase().includes('anticipad'); return renderGroupHtml(row.albo_cod, row.albo_factura, row.albo_fecha, row.albo_monto, row.albo_enlace, isAnticipada ? '-' : row.albo_n_declaracion, row.albo_doc_aduanero, row.albo_verificado, row.albo_verificado); })()}
            
            <!-- INSPECCION PREVIA -->
            ${renderGroupHtml(row.ip_cod, row.ip_factura, row.ip_fecha, row.ip_monto, row.ip_enlace, row.ip_examen_previo, row.ip_doc_aduanero, row.ip_verificado, row.ip_verificado)}
            
            <!-- GUIA -->
            ${renderGroupHtml(row.guias_cod, row.guias_factura, row.guias_fecha, row.guias_monto, row.guias_enlace, row.guias_guia_embarque, row.guias_ref_guia, row.guias_verificado, row.guias_verificado)}
            
            <!-- PUERTOS -->
            ${renderGroupHtml(row.puerto_cod, row.puerto_comprobante, row.puerto_fecha, row.puerto_monto, null)}
            
            <!-- OTROS -->
            ${renderGroupHtml(row.otros_cod, row.otros_factura, row.otros_fecha, row.otros_monto, row.otros_enlace)}
            
            <!-- TOTAL GASTOS -->
            <td class="mono text-right font-bold ${totalClass} border-l-2 border-slate-600 tooltip-cell" data-tooltip="${totalTooltip}">
                ${formatMoney(row.total)}
                ${excelRow && Math.abs(row.total - excelRow.debito) < 1 ? '<i class="fa-solid fa-check ml-1 text-xs"></i>' : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

let isDataLoadedMsc = false;
async function inicializarPlanillaMsc() {
    if (isDataLoadedMsc) return;
    isDataLoadedMsc = true;
    await loadData();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(inicializarPlanillaMsc, 1);
} else {
    document.addEventListener('DOMContentLoaded', inicializarPlanillaMsc, { once: true });
}

// Exponer funciones globales para los eventos inline del HTML
window.promptMasivoDimReg = promptMasivoDimReg;
window.handleExcelUpload = handleExcelUpload;
window.saveExcelToBD = saveExcelToBD;
window.loadData = loadData;
window.exportToExcel = exportToExcel;
window.filterAndRender = filterAndRender;
window.openPopup = openPopup;
window.promptDimReg = promptDimReg;
window.verRevisar = verRevisar;
window.promptComision = promptComision;
