import { supabase } from '../services/supabase.js';
let supabaseClient = supabase;

// Variables Globales
let globalRawData = [];
let globalFilteredData = [];
let monthSet = new Set();
let excelMatchData = {}; 
let nitMap = {};

// Utils
const formatMoney = (amount) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

const parseDate = (str) => {
    if(!str || str === '-') return 0;
    const parts = str.split(' ')[0].split('/'); 
    if(parts.length !== 3) return 0;
    return new Date(parts[2], parts[1]-1, parts[0]).getTime();
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

// Helper para ordenar cronológicamente meses de formato MMM-YYYY (ej. ENE-2026, JUL-2026)
const parseMonthYear = (myStr) => {
    const parts = myStr.split('-');
    if (parts.length !== 2) return 0;
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const monthIdx = months.indexOf(parts[0].toUpperCase());
    const year = parseInt(parts[1]) || 0;
    return year * 12 + monthIdx;
};

const escapeHtmlQuote = (str) => {
    return String(str || '').replace(/'/g, "\\'");
};

window.openPopup = (url) => {
    if(!url) return;
    const width = 900; const height = 800;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(url, 'Comprobante', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no`);
    return false;
};

async function promptMasivoDimReg() {
    const { value: textInput } = await Swal.fire({
        title: 'Carga Masiva de Regularizadas',
        html: `
            <p class="text-xs text-slate-400 mb-2">Copia y pega puro número de INTERNO desde tu Excel (uno por línea).</p>
            <textarea id="masivo-textarea" class="swal2-textarea" placeholder="Ejemplo:&#10;0547-26&#10;0548-26" style="font-family: monospace; font-size: 13px; height: 180px; width: 90%; margin: 0 auto; display: block; border: 1px solid var(--border-color); background-color: var(--card-bg); color: var(--text-color);"></textarea>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0891b2', 
        cancelButtonColor: '#1f202b',
        preConfirm: () => {
            return document.getElementById('masivo-textarea').value;
        }
    });

    if (textInput) {
        const lines = textInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const updates = lines.map(interno => ({ interno: interno, dim_regularizada: 'OK' }));

        if (updates.length === 0) {
            return Swal.fire('Aguanta', 'No metiste ni un Interno válido.', 'warning');
        }

        document.getElementById('loader').classList.remove('hidden');

        try {
            const { error } = await supabaseClient
                .from('regularizaciones_dims')
                .upsert(updates, { onConflict: 'interno' });

            if (error) throw error;

            Swal.fire({ title: '¡Fierro!', html: `Se marcaron como regularizados <b>${updates.length}</b> trámites.`, icon: 'success' });
            loadData(); 

        } catch (error) {
            console.error("Error al guardar masivo:", error);
            Swal.fire('Error', 'Hubo un error al guardar en la base de datos: ' + error.message, 'error');
        } finally {
            document.getElementById('loader').classList.add('hidden');
        }
    }
}

async function promptDimReg(interno, isReg) {
    if (isReg) {
        const { isConfirmed } = await Swal.fire({
            title: '¿Quitar Regularización?',
            text: `El trámite ${interno} ya está regularizado. ¿Quieres quitarlo?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, quitar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#1f202b'
        });

        if (isConfirmed) {
            document.getElementById('loader').classList.remove('hidden');
            try {
                await supabaseClient.from('regularizaciones_dims').delete().eq('interno', interno);
                Swal.fire({ icon: 'success', title: '¡Listo!', text: 'Se quitó la regularización.', timer: 1500, showConfirmButton: false });
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
            confirmButtonText: '¡Confirmar!',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#00e676',
            cancelButtonColor: '#1f202b'
        });

        if (isConfirmed) {
            document.getElementById('loader').classList.remove('hidden');
            try {
                const { error } = await supabaseClient
                    .from('regularizaciones_dims')
                    .upsert({ interno: interno, dim_regularizada: 'OK' }, { onConflict: 'interno', returning: 'minimal' });

                if (error) throw error;
                
                Swal.fire({ icon: 'success', title: '¡Fierro!', text: 'Se guardó con éxito.', timer: 1500, showConfirmButton: false });
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
        html: `¿Quieres fijar la comisión de <b>${interno}</b> en la base de datos?<br><br><span class="text-xs text-slate-400">Si borras el dato, el sistema volverá a calcularla de acuerdo al CIF y escala.</span>`,
        input: 'number',
        inputValue: actualVal,
        inputAttributes: { step: '0.01' },
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar',
        denyButtonText: '<i class="fa-solid fa-eraser"></i> Borrar (Usar DB)',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0891b2',
        denyButtonColor: '#ef4444',
        cancelButtonColor: '#1f202b'
    });

    if (result.isConfirmed) {
        const finalVal = parseFloat(result.value);
        if(isNaN(finalVal)) return;
        
        document.getElementById('loader').classList.remove('hidden');
        try {
            const { error } = await supabaseClient
                .from('historial_datos_minera')
                .upsert({ dim_id: targetId, interno: interno, comision: finalVal }, { onConflict: 'interno', returning: 'minimal' });
            
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

async function promptPuertos(importacionId, interno, actualComp, actualFecha, actualMonto) {
    const targetId = importacionId && String(importacionId) !== '-' ? parseInt(importacionId) : null;
    if (!targetId) {
        return Swal.fire('Error', 'No se puede guardar gastos de puerto porque este trámite no está en la tabla de importaciones.', 'error');
    }

    const { value: formValues } = await Swal.fire({
        title: `Gastos de Puerto (ASPB) - ${interno}`,
        html: `
            <div class="flex flex-col gap-3 text-left">
                <div>
                    <label class="text-xs text-slate-400 block mb-1 font-bold">Número de Comprobante</label>
                    <input id="swal-comp" class="swal2-input !m-0 !w-full" value="${actualComp === 'null' || actualComp === '-' ? '' : actualComp}" placeholder="Ej. COMP-ASPB-123" style="border: 1px solid var(--border-color); background-color: var(--card-bg); color: var(--text-color);">
                </div>
                <div>
                    <label class="text-xs text-slate-400 block mb-1 font-bold">Fecha</label>
                    <input id="swal-fecha" type="date" class="swal2-input !m-0 !w-full" value="${actualFecha === 'null' || actualFecha === '-' ? '' : actualFecha}" style="border: 1px solid var(--border-color); background-color: var(--card-bg); color: var(--text-color);">
                </div>
                <div>
                    <label class="text-xs text-slate-400 block mb-1 font-bold">Monto (Bs)</label>
                    <input id="swal-monto" type="number" step="0.01" class="swal2-input !m-0 !w-full" value="${actualMonto || 0}" style="border: 1px solid var(--border-color); background-color: var(--card-bg); color: var(--text-color);">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0891b2',
        cancelButtonColor: '#1f202b',
        preConfirm: () => {
            return {
                comprobante: document.getElementById('swal-comp').value.trim(),
                fecha: document.getElementById('swal-fecha').value.trim(),
                monto: parseFloat(document.getElementById('swal-monto').value) || 0
            }
        }
    });

    if (formValues) {
        document.getElementById('loader').classList.remove('hidden');
        try {
            const { error: deleteErr } = await supabaseClient
                .from('gastos_puertos_manual')
                .delete()
                .eq('importacion_id', targetId);

            if (deleteErr) throw deleteErr;

            if (formValues.monto > 0 || formValues.comprobante || formValues.fecha) {
                const aspbCode = (function() {
                    const aspbEntry = Object.values(nitMap).find(x => x.name && x.name.toUpperCase() === 'ASPB');
                    if (aspbEntry && aspbEntry.code) return aspbEntry.code;
                    if (nitMap['0'] && nitMap['0'].code) return nitMap['0'].code;
                    return '61216';
                })();

                const { error: insertErr } = await supabaseClient
                    .from('gastos_puertos_manual')
                    .insert({
                        importacion_id: targetId,
                        monto: formValues.monto,
                        comprobante: formValues.comprobante || '-',
                        fecha: formValues.fecha || '-',
                        codigo_puerto: aspbCode
                    }, { returning: 'minimal' });

                if (insertErr) throw insertErr;

                // Actualizar también en mtodo
                await supabaseClient
                    .from('mtodo')
                    .update({
                        puertos_monto: formValues.monto > 0 ? formValues.monto : null,
                        puertos_comprobante: formValues.comprobante || null,
                        puertos_fecha: formValues.fecha || null
                    })
                    .eq('importacion_id', targetId);
            }

            Swal.fire({ icon: 'success', title: '¡Listo!', text: 'Gastos de puerto actualizados.', timer: 1500, showConfirmButton: false });
            loadData();

        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo guardar: ' + e.message, 'error');
        } finally {
            document.getElementById('loader').classList.add('hidden');
        }
    }
}

async function promptVerificationError(tipo, interno, esperado, encontrado) {
    let desc = '';
    const cleanEsp = (esperado === 'null' || esperado === '-') ? '' : esperado;
    const cleanEnc = (encontrado === 'null' || encontrado === '-') ? '' : encontrado;

    if (tipo === 'ALBO') {
        desc = `<b>Diferencia en Declaración de Aduana (ALBO):</b><br><br>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Declaración en Importaciones (Trámite ${interno}):</label>
                <input id="swal-input-imp" type="text" value="${cleanEsp}" class="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 font-bold mb-3 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Doc. Aduanero en Factura (ALBO):</label>
                <input id="swal-input-fac" type="text" value="${cleanEnc}" class="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-orange-600 dark:text-orange-400 font-bold mb-2 focus:outline-none focus:ring-2 focus:ring-orange-500">
                <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-2">💡 Compara y corrige el doc_aduanero de la factura o la declaración del trámite para que coincidan.</span>`;
    } else if (tipo === 'IP') {
        desc = `<b>Diferencia en Examen Previo (Insp. Previa):</b><br><br>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Examen Previo en Importaciones (${interno}):</label>
                <input id="swal-input-imp" type="text" value="${cleanEsp}" class="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 font-bold mb-3 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Doc. Aduanero en Factura (IP):</label>
                <input id="swal-input-fac" type="text" value="${cleanEnc}" class="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-orange-600 dark:text-orange-400 font-bold mb-2 focus:outline-none focus:ring-2 focus:ring-orange-500">`;
    } else if (tipo === 'GUIA') {
        desc = `<b>Diferencia en Guía de Embarque:</b><br><br>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Guía en Importaciones (${interno}):</label>
                <input id="swal-input-imp" type="text" value="${cleanEsp}" class="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 font-bold mb-3 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ref. Guía en Factura:</label>
                <input id="swal-input-fac" type="text" value="${cleanEnc}" class="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-orange-600 dark:text-orange-400 font-bold mb-2 focus:outline-none focus:ring-2 focus:ring-orange-500">`;
    }

    const { isConfirmed } = await Swal.fire({
        title: `Detalle de No Verificación - ${interno}`,
        html: `<div class="text-left text-xs leading-relaxed text-slate-700 dark:text-slate-300">${desc}</div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-floppy-disk mr-1"></i> Guardar y Corregir',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ea580c',
        cancelButtonColor: '#64748b',
        focusConfirm: false
    });

    if (isConfirmed) {
        const valImp = document.getElementById('swal-input-imp')?.value.trim();
        const valFac = document.getElementById('swal-input-fac')?.value.trim();
        
        try {
            const loader = document.getElementById('loader');
            if (loader) loader.classList.remove('hidden');

            // Buscar la importación correspondiente
            const { data: impData } = await supabaseClient
                .from('importaciones')
                .select('id, n_referencia')
                .eq('n_referencia', interno)
                .maybeSingle();

            if (impData) {
                // Actualizar facturas asociadas a esta importación
                if (valFac) {
                    let query = supabaseClient.from('facturas').update({
                        doc_aduanero: valFac,
                        ref_guia: valFac,
                        registro_aduanero: valFac
                    }).eq('importacion_id', impData.id);

                    if (tipo === 'ALBO') {
                        query = query.ilike('tipo', '%ALBO%');
                    } else if (tipo === 'IP') {
                        query = query.ilike('tipo', '%IP%');
                    } else if (tipo === 'GUIA') {
                        query = query.ilike('tipo', '%GUIA%');
                    }
                    await query;
                }

                // Actualizar declaración del trámite en importaciones si se modificó
                if (valImp) {
                    if (tipo === 'ALBO') {
                        await supabaseClient.from('importaciones').update({ n_declaracion: valImp }).eq('id', impData.id);
                    } else if (tipo === 'IP') {
                        await supabaseClient.from('importaciones').update({ examen_previo: valImp }).eq('id', impData.id);
                    } else if (tipo === 'GUIA') {
                        await supabaseClient.from('importaciones').update({ guia_embarque: valImp }).eq('id', impData.id);
                    }
                }

                // Invocar recálculo matricial en mtodo
                await supabaseClient.rpc('recalcular_carpeta_matriz', { target_n_referencia: interno }).catch(() => {});
            }

            Swal.fire('¡Sincronizado!', 'Los datos fueron actualizados en Supabase y el estado fue recalculado.', 'success');
            if (typeof fetchAllData === 'function') {
                await fetchAllData();
            }
        } catch (err) {
            console.error('Error al actualizar desde modal:', err);
            Swal.fire('Error', 'No se pudo actualizar: ' + err.message, 'error');
        } finally {
            const loader = document.getElementById('loader');
            if (loader) loader.classList.add('hidden');
        }
    }
}

function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, {header: 1});
        
        let headerIdx = -1;
        for(let i=0; i<jsonData.length; i++) {
            const rowArr = (jsonData[i] || []).map(c => String(c).toUpperCase().trim());
            const hasTramite = rowArr.some(c => c.includes('TRAMITE') || c.includes('INTERNO') || c.includes('DECLARACION') || c.includes('DIM') || c.includes('Nº') || c.includes('N°'));
            const hasFacturaOrDebito = rowArr.some(c => c.includes('FAC') || c.includes('REF') || c.includes('DEBITO') || c.includes('DÉBITO') || c.includes('MONTO') || c.includes('TOTAL') || c.includes('PLANILLA'));
            if(hasTramite && hasFacturaOrDebito) { 
                headerIdx = i; 
                break; 
            }
        }
        if(headerIdx === -1) return Swal.fire('Error', 'No encontré las columnas necesarias (Trámite, Nro. Fac, Débito, Ref, etc.) en el Excel.', 'error');
        
        const headers = jsonData[headerIdx].map(h => String(h).toUpperCase().trim());
        let idxTramite = headers.findIndex(h => h === 'TRAMITE' || h === 'INTERNO' || h.includes('TRAMITE') || h.includes('INTERNO'));
        if(idxTramite === -1) idxTramite = headers.findIndex(h => h.includes('DECLARACION') || h.includes('DIM'));
        
        let idxFactura = headers.findIndex((h, idx) => idx !== idxTramite && (h.includes('NRO. FAC') || h.includes('FAC') || h.includes('Nº (REF)') || h.includes('N° (REF)') || h.includes('REF') || h.includes('PLANILLA')));
        let idxFecha = headers.findIndex(h => h.includes('FECHA') || h.includes('DATE'));
        let idxDebito = headers.findIndex(h => h.includes('DEBITO') || h.includes('DÉBITO') || h.includes('MONTO') || h.includes('TOTAL'));

        if(idxTramite === -1) return Swal.fire('Error', 'Falta la columna de Trámite / Interno en el archivo Excel.', 'error');

        let matchesCount = 0;
        let mtodoUpdates = [];
        let historialUpdates = [];

        for(let i=headerIdx+1; i<jsonData.length; i++) {
            const row = jsonData[i];
            if(!row) continue;
            const tramite = String(row[idxTramite] || '').trim();
            if(!tramite) continue;

            let fechaRaw = idxFecha !== -1 ? row[idxFecha] : '';
            let fechaStr = '';
            if(typeof fechaRaw === 'number') {
                const dateObj = new Date(Math.round((fechaRaw - 25569)*86400*1000));
                dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
                fechaStr = dateObj.toLocaleDateString('es-ES'); 
            } else { fechaStr = String(fechaRaw || '').trim(); }

            let refStr = idxFactura !== -1 ? String(row[idxFactura] || '').trim() : '';
            if (refStr === tramite) refStr = '';
            const debitoNum = idxDebito !== -1 ? (parseFloat(String(row[idxDebito] || 0).replace(/,/g, '')) || 0) : 0;

            excelMatchData[tramite] = { ref: refStr, fecha: fechaStr, debito: debitoNum };
            matchesCount++;
        }

        Swal.fire({
            icon: 'success',
            title: 'Excel Leído Correctamente',
            text: `Se leyeron ${matchesCount} filas del Excel. Revisa los saldos y haz clic en "Guardar en BD" para registrar los cambios en Supabase.`,
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#0891b2'
        });

        // Mostrar botón de "Guardar en BD" y re-renderizar tabla para verificación visual
        const btnSave = document.getElementById('btnSaveExcel');
        if (btnSave) btnSave.classList.remove('hidden');
        
        filterAndRender(); 
    };
    reader.readAsArrayBuffer(file);
}

async function saveExcelToBD() {
    const matchedRows = globalRawData.filter(row => excelMatchData[row.interno]);
    if (matchedRows.length === 0) return Swal.fire('Info', 'No hay coincidencias.', 'info');
    
    let mtodoUpdates = [];
    let historialUpdates = [];

    matchedRows.forEach(row => {
        const excelData = excelMatchData[row.interno];
        const targetId = row.importacion_id && String(row.importacion_id) !== '-' ? parseInt(row.importacion_id) : null;
        
        mtodoUpdates.push({
            interno: row.interno,
            ref_excel: excelData.ref,
            fecha_excel: excelData.fecha,
            debito_excel: excelData.debito
        });

        if (targetId) {
            historialUpdates.push({ 
                dim_id: targetId, 
                interno: row.interno, 
                ref_excel: excelData.ref, 
                fecha_excel: excelData.fecha, 
                debito_excel: excelData.debito,
                revision_ok: true 
            });
        }
    });

    document.getElementById('loader').classList.remove('hidden');
    try {
        const { error: err1 } = await supabaseClient.from('mtodo').upsert(mtodoUpdates, { onConflict: 'interno' });
        if (err1) throw err1;

        if (historialUpdates.length > 0) {
            try {
                await supabaseClient.from('historial_datos_minera').upsert(historialUpdates);
            } catch(eHist) {
                console.warn("Aviso en historial_datos_minera:", eHist);
            }
        }

        Swal.fire('¡Listo!', `Guardados y conciliados en Supabase ${mtodoUpdates.length} registros.`, 'success');
        await loadData();
    } catch(err) {
        console.error("Error al guardar Excel en Supabase:", err);
        Swal.fire('Error', 'Falló el guardado en Supabase: ' + err.message, 'error');
    } finally {
        document.getElementById('loader').classList.add('hidden');
    }
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
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
    
    try {
        async function getCachedConfigNits(sb) {
            try {
                const cached = localStorage.getItem('cache_config_nits');
                const cachedTime = localStorage.getItem('cache_config_nits_time');
                if (cached && cachedTime && (Date.now() - Number(cachedTime) < 3600000)) {
                    return JSON.parse(cached);
                }
            } catch(e) {}

            const { data, error } = await sb.from('config_nits').select('id, nit, proveedor, codigo');
            if (!error && data) {
                try {
                    localStorage.setItem('cache_config_nits', JSON.stringify(data));
                    localStorage.setItem('cache_config_nits_time', String(Date.now()));
                } catch(e) {}
            }
            return data || [];
        }

        const dataNits = await getCachedConfigNits(supabaseClient);

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

        const [dataConsolidada, dataHistorial] = await Promise.all([
            fetchAllData('v_matriz_liquidacion_horizontal'),
            fetchAllData('historial_datos_minera')
        ]);

        nitMap = {};
        (dataNits || []).forEach(item => {
            nitMap[item.nit] = { name: item.proveedor, code: item.codigo, id: item.id };
        });

        const historialMap = {};
        (dataHistorial || []).forEach(h => {
            if (h.ref_excel) {
                historialMap[h.interno] = {
                    ref: h.ref_excel,
                    fecha: h.fecha_excel,
                    debito: h.debito_excel
                };
            }
        });

        monthSet.clear();

        globalRawData = (dataConsolidada || [])
          .filter(row => row.interno && !row.interno.toUpperCase().includes('TEST'))
          .map((row) => {
            if (row.mes && row.mes !== '-') {
                monthSet.add(row.mes);
            }

            const alboTotal = safeFloat(row['ALBO - DAB MONTO']);
            const ipTotal = safeFloat(row.ip_monto);
            const guiasTotal = safeFloat(row.guias_monto);
            const puertosTotal = safeFloat(row.puertos_monto);
            const otrosTotal = safeFloat(row.otro_monto);

            const hData = historialMap[row.interno];
            const rawRef = (row.ref_excel && row.ref_excel !== '-' && row.ref_excel !== 'null') ? String(row.ref_excel).trim() : (hData ? String(hData.ref).trim() : '');
            const rawFecha = (row.fecha_excel && row.fecha_excel !== '-' && row.fecha_excel !== 'null') ? String(row.fecha_excel).trim() : (hData ? String(hData.fecha).trim() : '');

            const cleanRef = (rawRef && rawRef !== String(row.interno).trim() && rawRef !== String(row.dim_n_ro).trim()) ? rawRef : '';
            const cleanFecha = (rawFecha && rawFecha !== String(row.fecha_dim).trim()) ? rawFecha : '';

            return {
                id: row.interno,
                importacion_id: row.importacion_id || '-',
                fecha_val: row.fecha_dim || '-',
                mes: row.mes || '-',
                interno: row.interno,
                dim_n: row.dim_n_ro || '-',
                oi: row.oi || '-', 
                tipo_cambio: row.tipo_cambio || '-',
                porcentaje_comision: row.porcentaje_comision || '-',
                cif: row.valor_cif_bs ? parseFloat(row.valor_cif_bs.replace(/[^0-9.]/g, '')) : 0,
                modalidad: row.modalidad || '-', 
                dim_reg: row.dim_reg === 'OK', 
                comision: row.comision_bs ? parseFloat(row.comision_bs.replace(/[^0-9.]/g, '')) : 0, 
                comision_fija: row.porcentaje_comision && (row.porcentaje_comision.includes('Fijo') || row.porcentaje_comision.includes('Manual')),
                gravamen: row.gravamen && row.gravamen !== '-' ? parseFloat(row.gravamen.replace(/[^0-9.]/g, '')) : 0,
                iva: row.iva && row.iva !== '-' ? parseFloat(row.iva.replace(/[^0-9.]/g, '')) : 0,
                
                n_ref_excel: cleanRef,
                fecha_excel: cleanFecha,
                
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
                
                // VERIFICACIONES
                verificado_suma: row.verificado_suma || 'NO VERIFICADO',
                verificado_saldos: row.verificado_saldos || 'NO VERIFICADO',
                
                total_tributos: row.total_tributos && row.total_tributos !== '-' ? parseFloat(row.total_tributos.replace(/[^0-9.]/g, '')) : 0,
                total: alboTotal + ipTotal + guiasTotal + puertosTotal + otrosTotal
            };
        });

        const monthSelect = document.getElementById('monthFilter');
        if (monthSelect) {
            monthSelect.innerHTML = '<option value="all">Todos los Meses</option>';
            
            // Requisito especial: ordenar cronológicamente descendente
            Array.from(monthSet).sort((a, b) => parseMonthYear(b) - parseMonthYear(a)).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.innerText = m; monthSelect.appendChild(opt);
            });

            // Seleccionar por defecto el mes actual
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

    } catch(e) { console.error(e); }
    if (loader) loader.classList.add('hidden');
}

let realtimeChannel = null;
function suscribirTiempoReal() {
    if (!supabaseClient || realtimeChannel) return;
    
    realtimeChannel = supabaseClient
        .channel('realtime-planilla-msc2')
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

window.setRegFilter = (val) => {
    const regFilter = document.getElementById('regFilter');
    if (regFilter) {
        regFilter.value = val;
        filterAndRender();
    }
};

function filterAndRender() {
    const monthFilter = document.getElementById('monthFilter');
    const searchFilter = document.getElementById('searchFilter');
    const sortFilter = document.getElementById('sortFilter');
    const regFilter = document.getElementById('regFilter');
    
    const monthVal = monthFilter ? monthFilter.value : 'all';
    const searchVal = searchFilter ? searchFilter.value.toUpperCase().trim() : '';
    const sortVal = sortFilter ? sortFilter.value : 'fecha_desc';
    const regVal = regFilter ? regFilter.value : 'all';

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
        else if (regVal === 'verif') passReg = (row.albo_verificado === 'VERIFICADO' || row.guias_verificado === 'VERIFICADO' || row.ip_verificado === 'VERIFICADO');
        else if (regVal === 'noverif') passReg = (row.albo_verificado === 'NO VERIFICADO' || row.guias_verificado === 'NO VERIFICADO' || row.ip_verificado === 'NO VERIFICADO');
        
        return passMonth && passSearch && passReg;
    });

    filtered.sort((a, b) => {
        if(sortVal === 'fecha_desc') return parseDate(b.fecha_val) - parseDate(a.fecha_val);
        if(sortVal === 'fecha_asc') return parseDate(a.fecha_val) - parseDate(b.fecha_val);
        if(sortVal === 'dim_desc') return b.dim_n.localeCompare(a.dim_n);
        if(sortVal === 'dim_asc') return a.dim_n.localeCompare(b.dim_n);
        return 0;
    });

    globalFilteredData = filtered;

    let sComision=0, sAlbo=0, sIP=0, sGuia=0, sPuerto=0, sOtros=0, sTotalGastos=0;
    let cReg = 0, cPend = 0, cVerif = 0, cNoVerif = 0;

    filtered.forEach(r => {
        sComision += (r.comision || 0); 
        sAlbo += safeFloat(r.albo_monto);
        sIP += safeFloat(r.ip_monto);
        sGuia += safeFloat(r.guias_monto);
        sPuerto += safeFloat(r.puerto_monto);
        sOtros += safeFloat(r.otros_monto);
        sTotalGastos += r.total; 

        // Cálculo de métricas
        const isAnt = safeVal(r.modalidad).toLowerCase().includes('anticipad');
        if (isAnt) {
            if (r.dim_reg) cReg++;
            else cPend++;
        }
        
        if (!isAnt) {
            if (r.albo_verificado === 'VERIFICADO') cVerif++;
            else if (r.albo_verificado === 'NO VERIFICADO') cNoVerif++;
            
            if (r.guias_verificado === 'VERIFICADO') cVerif++;
            else if (r.guias_verificado === 'NO VERIFICADO') cNoVerif++;
        }

        if (r.ip_verificado === 'VERIFICADO') cVerif++;
        else if (r.ip_verificado === 'NO VERIFICADO') cNoVerif++;
    });

    const kpiComision = document.getElementById('kpiComision');
    const kpiAlbo = document.getElementById('kpiAlbo');
    const kpiIp = document.getElementById('kpiIp');
    const kpiGuia = document.getElementById('kpiGuia');
    const kpiPuerto = document.getElementById('kpiPuerto');
    const kpiOtros = document.getElementById('kpiOtros');
    const kpiTotalGastos = document.getElementById('kpiTotalGastos');
    const kpiGranTotal = document.getElementById('kpiGranTotal');

    if (kpiComision) kpiComision.innerText = formatMoney(sComision);
    if (kpiAlbo) kpiAlbo.innerText = formatMoney(sAlbo);
    if (kpiIp) kpiIp.innerText = formatMoney(sIP);
    if (kpiGuia) kpiGuia.innerText = formatMoney(sGuia);
    if (kpiPuerto) kpiPuerto.innerText = formatMoney(sPuerto);
    if (kpiOtros) kpiOtros.innerText = formatMoney(sOtros);
    if (kpiTotalGastos) kpiTotalGastos.innerText = formatMoney(sTotalGastos);
    if (kpiGranTotal) kpiGranTotal.innerText = formatMoney(sTotalGastos + sComision);

    const countReg = document.getElementById('countReg');
    const countPend = document.getElementById('countPend');
    const countVerif = document.getElementById('countVerif');
    const countNoVerif = document.getElementById('countNoVerif');

    if (countReg) countReg.innerText = cReg;
    if (countPend) countPend.innerText = cPend;
    if (countVerif) countVerif.innerText = cVerif;
    if (countNoVerif) countNoVerif.innerText = cNoVerif;

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
                return `<div><a href="javascript:void(0)" onclick="openPopup('${display}')" class="text-orange-500 dark:text-[#00f0ff] hover:underline transition-colors"><i class="fa-solid fa-arrow-up-right-from-square text-[10px] shadow-[0_0_10px_var(--accent-glow)]"></i></a></div>`;
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
    const countDisplay = document.getElementById('countDisplay');
    
    if (countDisplay) countDisplay.innerText = data.length;
    if (!tbody) return;
    
    tbody.innerHTML = '';

    const renderGroupHtml = (tipoGrupo, internoId, codVal, factVal, fechaVal, montoVal, linkVal, extra1Val, extra2Val, extra3Val, verifVal) => {
        const cods = renderMultiCell(codVal);
        const facts = renderMultiCell(factVal);
        const fechas = renderMultiCell(fechaVal);
        const montos = renderMultiCell(montoVal, true);
        
        let linkCell = '';
        if (linkVal !== undefined) {
            const links = renderMultiCell(linkVal, false, true);
            linkCell = `<td>${links}</td>`;
        }
        
        let extraHtml = '';
        if (extra1Val !== undefined) {
            const extras1 = renderMultiCell(extra1Val);
            const extras2 = renderMultiCell(extra2Val);
            
            let verifClass = 'text-slate-500';
            let displayVerif = verifVal;
            let clickHandler = '';
            
            if (verifVal === 'VERIFICADO') {
                verifClass = 'font-black text-orange-500 dark:text-emerald-450 bg-orange-500/10 px-2 py-0.5 rounded text-[8.5px] border border-orange-500/20';
            } else if (verifVal === 'NO VERIFICADO') {
                verifClass = 'font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded text-[8.5px] border border-red-500/20 cursor-pointer hover:bg-red-550/25';
                const escEsp = escapeHtmlQuote(extra1Val);
                const escEnc = escapeHtmlQuote(extra2Val);
                clickHandler = `onclick="promptVerificationError('${tipoGrupo}', '${internoId}', '${escEsp}', '${escEnc}')" title="Clic para ver diferencia"`;
            } else if (verifVal === '') {
                displayVerif = ''; 
                verifClass = '';
            }
            
            const verifs = `<div><span class="${verifClass}" ${clickHandler}>${displayVerif}</span></div>`;
            
            extraHtml = `
                <td>${extras1}</td>
                <td>${extras2}</td>
                <td class="text-center">${verifs}</td>
            `;
        }
        
        return `
            <td>${cods}</td>
            <td>${facts}</td>
            <td>${fechas}</td>
            <td class="font-mono text-right font-bold text-slate-800 dark:text-slate-100">${montos}</td>
            ${linkCell}
            ${extraHtml}
        `;
    };

    data.forEach((row, idx) => {
        const tr = document.createElement('tr');

        const mod = safeVal(row.modalidad);
        const isAnticipada = mod.toLowerCase().includes('anticipad');

        if (isAnticipada) {
            tr.className = row.dim_reg ? 'row-anticipada-done' : 'row-anticipada-pending';
        }

        const dimRegCell = row.dim_reg 
            ? `<td class="text-center relative cursor-pointer bg-orange-500/10 hover:bg-orange-500/20" onclick="promptDimReg('${row.interno}', true)" title="Quitar regularización">
                <span class="font-bold text-[#10b981] text-[10px]">OK</span>
                <i class="fa-solid fa-check-double text-[#10b981] ml-1"></i>
               </td>`
            : `<td class="text-center">
                <button onclick="promptDimReg('${row.interno}', false)" class="text-[9px] bg-red-650 hover:bg-red-750 text-white px-2 py-0.5 rounded shadow-sm">
                    Reg.
                </button>
               </td>`;

        const styleComision = row.comision_fija 
            ? "bg-[#0891b2]/10 dark:bg-orange-500/15 text-orange-500 dark:text-[#00f0ff] border border-orange-500/30 font-bold" 
            : "text-slate-800 dark:text-slate-100 font-medium";

        let displayRef = row.n_ref_excel ? row.n_ref_excel : '-';
        let displayFecha = row.fecha_excel ? row.fecha_excel : '-';
        let totalClass = "bg-slate-100 dark:bg-[#16171f] text-slate-800 dark:text-white"; 
        let totalTooltip = "";

        const excelRow = excelMatchData[row.interno];
        if (excelRow) {
            displayRef = excelRow.ref ? `<span class="text-orange-500 dark:text-[#00f0ff] font-bold">${excelRow.ref}</span>` : '-';
            displayFecha = excelRow.fecha ? `<span class="text-orange-500 dark:text-[#00f0ff] font-bold">${excelRow.fecha}</span>` : '-';
            const diff = Math.abs(row.total - excelRow.debito);
            if (diff < 1) { 
                totalClass = "!bg-orange-500 !text-white font-black";
                totalTooltip = "Coincide con Excel ✅";
            } else {
                totalClass = "!bg-red-600 !text-white font-black";
                totalTooltip = `Diferencia! Excel: ${formatMoney(excelRow.debito)}`;
            }
        } else if (row.n_ref_excel) {
            totalClass = "!bg-slate-200 dark:!bg-slate-800 text-slate-800 dark:text-[#c9d1d9]";
            totalTooltip = "Verificado en Base de Datos";
        }

        const modStyle = isAnticipada ? 'font-bold text-orange-500 dark:text-[#00f0ff]' : 'text-slate-500 dark:text-slate-400';

        const alboVerif = isAnticipada ? '' : row.albo_verificado;
        const guiasVerif = isAnticipada ? '' : row.guias_verificado;

        // Render Puertos con edición interactiva clickeable y SIN link
        const hasPuertoData = safeFloat(row.puerto_monto) > 0 || (row.puerto_comprobante && row.puerto_comprobante !== '-' && row.puerto_comprobante !== 'null') || (row.puerto_fecha && row.puerto_fecha !== '-' && row.puerto_fecha !== 'null');
        const aspbCodeVal = (function() {
            const aspbEntry = Object.values(nitMap).find(x => x.name && x.name.toUpperCase() === 'ASPB');
            if (aspbEntry && aspbEntry.code) return aspbEntry.code;
            if (nitMap['0'] && nitMap['0'].code) return nitMap['0'].code;
            return '61216';
        })();
        const puertoCodVal = hasPuertoData ? aspbCodeVal : '-';
        const puertoCods = renderMultiCell(puertoCodVal);
        const puertoComps = renderMultiCell(row.puerto_comprobante);
        const puertoFechas = renderMultiCell(row.puerto_fecha);
        const puertoMontos = renderMultiCell(row.puerto_monto, true);
        const onPuertoClick = `onclick="promptPuertos('${row.importacion_id}', '${row.interno}', '${row.puerto_comprobante || ''}', '${row.puerto_fecha || ''}', ${safeFloat(row.puerto_monto)})"`;

        tr.innerHTML = `
            <td class="text-center font-bold text-slate-450 sticky-col-n">${row.idx}</td>
            <td class="font-bold text-orange-500 dark:text-[#00f0ff] sticky-col-interno">${row.interno}</td>
            <td class="mono text-slate-500 dark:text-slate-400 text-[9px] sticky-col-dim">${row.dim_n}</td>
            
            <td>${row.fecha_val}</td>
            <td>${row.fecha_val}</td>
            <td class="text-center font-mono font-bold">${displayRef}</td> 
            <td class="text-center text-[9px]">${displayFecha}</td> 
            <td class="text-[9px] text-center ${modStyle}">${mod}</td>
            ${dimRegCell}
            <td class="text-[9px] font-bold text-slate-350">${safeVal(row.oi)}</td> 
            <td class="mono text-center text-slate-500 dark:text-slate-450">${safeVal(row.tipo_cambio)}</td>
            <td class="mono text-right font-medium text-slate-800 dark:text-slate-100">${formatMoney(row.cif)}</td>
            <td class="mono text-center text-slate-500 dark:text-slate-450">${safeVal(row.porcentaje_comision)}</td>
            <td class="mono text-right cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1f202b] transition-all ${styleComision}" onclick="promptComision('${row.importacion_id}', '${row.interno}', ${row.comision})">
                ${formatMoney(row.comision)}
            </td>
            <td class="mono text-right text-slate-500 dark:text-slate-450">${formatMoney(row.gravamen)}</td>
            <td class="mono text-right text-slate-500 dark:text-slate-450">${formatMoney(row.iva)}</td>
            <td class="mono text-right font-bold text-slate-800 dark:text-slate-100">${formatMoney(row.total_tributos)}</td>
            
            <!-- ALBO / DAB -->
            ${renderGroupHtml('ALBO', row.interno, row.albo_cod, row.albo_factura, row.albo_fecha, row.albo_monto, row.albo_enlace, isAnticipada ? '-' : row.albo_n_declaracion, row.albo_doc_aduanero, alboVerif, alboVerif)}
            
            <!-- INSPECCION PREVIA -->
            ${renderGroupHtml('IP', row.interno, row.ip_cod, row.ip_factura, row.ip_fecha, row.ip_monto, row.ip_enlace, row.ip_examen_previo, row.ip_doc_aduanero, row.ip_verificado, row.ip_verificado)}
            
            <!-- GUIA -->
            ${renderGroupHtml('GUIA', row.interno, row.guias_cod, row.guias_factura, row.guias_fecha, row.guias_monto, row.guias_enlace, row.guias_guia_embarque, row.guias_ref_guia, guiasVerif, guiasVerif)}
            
            <!-- PUERTOS -->
            <td class="cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1f202b] transition-all" ${onPuertoClick}>${puertoCods}</td>
            <td class="cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1f202b] transition-all" ${onPuertoClick}>${puertoComps}</td>
            <td class="cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1f202b] transition-all" ${onPuertoClick}>${puertoFechas}</td>
            <td class="font-mono text-right font-bold text-slate-800 dark:text-slate-100 cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1f202b] transition-all" ${onPuertoClick}>${puertoMontos}</td>
            
            <!-- OTROS -->
            ${renderGroupHtml('OTROS', row.interno, row.otros_cod, row.otros_factura, row.otros_fecha, row.otros_monto, row.otros_enlace)}
            
            <!-- VERIFICACIONES ADICIONALES -->
            <td class="text-center font-medium">${formatVerifCell(row.verificado_suma)}</td>
            <td class="text-center font-medium">${formatVerifCell(row.verificado_saldos)}</td>
            
            <!-- TOTAL GASTOS -->
            <td class="mono text-right font-bold ${totalClass} border-l border-var(--border-color)" title="${totalTooltip}">
                ${formatMoney(row.total)}
                ${excelRow && Math.abs(row.total - excelRow.debito) < 1 ? '<i class="fa-solid fa-circle-check ml-1 text-[10px]"></i>' : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

let isDataLoadedMsc2 = false;
async function inicializarPlanillaMsc2() {
    if (isDataLoadedMsc2) return;
    isDataLoadedMsc2 = true;
    await loadData();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(inicializarPlanillaMsc2, 1);
} else {
    document.addEventListener('DOMContentLoaded', inicializarPlanillaMsc2, { once: true });
}

async function handleVerifyFile(event) {
    const file = event.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
        
        let headerRowIndex = -1;
        for(let i=0; i<rawData.length; i++) {
            const row = rawData[i].map(c => String(c).toUpperCase().trim());
            if(row.includes('TRAMITE') && row.includes('DEBITO')) {
                headerRowIndex = i;
                break;
            }
        }
        if(headerRowIndex === -1) {
            Swal.fire('Error', 'No encontré las columnas "TRAMITE" y "DEBITO" en el archivo.', 'error');
            return;
        }
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {range: headerRowIndex});
        await verifyBalances(jsonData);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// Formateador visual premium para verificar celdas
const formatVerifCell = (val) => {
    const v = val || 'NO VERIFICADO';
    if (v.startsWith('VERIFICADO')) {
        const parts = v.split(' - ');
        const datePart = parts[1] || '';
        return `<div class="flex flex-col items-center"><span class="bg-orange-500/15 text-orange-500 dark:text-orange-400 font-bold px-2 py-0.5 rounded text-[9px] mb-0.5">VERIFICADO</span><span class="text-[9px] text-slate-400 font-mono">${datePart}</span></div>`;
    } else if (v.startsWith('DIFERENCIA')) {
        const parts = v.split(' - ');
        const diffPart = parts[0];
        const datePart = parts[1] || '';
        return `<div class="flex flex-col items-center"><span class="bg-red-500/15 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded text-[9px] mb-0.5">${diffPart}</span><span class="text-[9px] text-slate-450 font-mono">${datePart}</span></div>`;
    } else {
        return `<span class="text-slate-400 dark:text-slate-500 font-bold text-[9px]">-</span>`;
    }
};

async function verifyBalances(excelData) {
    const diffs = [];
    const processedInternos = new Set();
    
    globalFilteredData.forEach(sysItem => {
        const internoSys = String(sysItem.interno || '').trim();
        if(!internoSys || internoSys === '-') return;
        processedInternos.add(internoSys);
        
        const excelMatch = excelData.find(row => {
            const tramiteExcel = String(row['TRAMITE'] || '').trim();
            return tramiteExcel === internoSys;
        });
        
        if(excelMatch) {
            const totalSys = sysItem.total;
            const debitoExcel = parseFloat(excelMatch['DEBITO'] || excelMatch['MONTO'] || 0);
            let rawRef = String(excelMatch['Nº (REF)'] || excelMatch['N° (REF)'] || excelMatch['Nº'] || excelMatch['N°'] || excelMatch['REF'] || excelMatch['PLANILLA'] || excelMatch['FAC'] || '').trim();
            if (rawRef === internoSys || rawRef === sysItem.dim_n) rawRef = '';
            const refVal = rawRef;
            const fechaVal = String(excelMatch['FECHA'] || excelMatch['FECHA EXCEL'] || excelMatch['FECHA PLANILLA'] || '').trim();

            const diff = totalSys - debitoExcel;
            if(Math.abs(diff) > 0.05) { 
                diffs.push({ interno: internoSys, totalSys: totalSys, debitoExcel: debitoExcel, refExcel: refVal, fechaExcel: fechaVal, diff: diff, status: 'bad' });
            } else {
                diffs.push({ interno: internoSys, totalSys: totalSys, debitoExcel: debitoExcel, refExcel: refVal, fechaExcel: fechaVal, diff: 0, status: 'good' });
            }
        }
    });

    excelData.forEach(row => {
        const tramiteExcel = String(row['TRAMITE'] || row['INTERNO'] || row['Nº (REF)'] || row['N° (REF)'] || '').trim();
        if (tramiteExcel && !processedInternos.has(tramiteExcel)) {
            let rawRef = String(row['Nº (REF)'] || row['N° (REF)'] || row['Nº'] || row['N°'] || row['REF'] || row['PLANILLA'] || row['FAC'] || '').trim();
            if (rawRef === tramiteExcel) rawRef = '';
            const refVal = rawRef;
            const fechaVal = String(row['FECHA'] || row['FECHA EXCEL'] || row['FECHA PLANILLA'] || '').trim();
            diffs.push({ interno: tramiteExcel, totalSys: 0, debitoExcel: parseFloat(row['DEBITO'] || row['MONTO'] || 0), refExcel: refVal, fechaExcel: fechaVal, diff: -parseFloat(row['DEBITO'] || row['MONTO'] || 0), status: 'missing_in_system' });
        }
    });

    renderVerifyResults(diffs);

    const countTotal = diffs.length;
    const countOk = diffs.filter(r => r.status === 'good').length;
    const countDiff = diffs.filter(r => r.status === 'bad').length;
    const countExcel = diffs.filter(r => r.status === 'missing_in_system').length;
    const countSys = 0;

    // Actualizar estados de verificación de Saldos y GUARDAR ref_excel / fecha_excel / debito_excel en BD Supabase
    const nowStr = new Date().toLocaleString('es-ES', { hour12: false });
    const updates = diffs.map(d => {
        let statusText = 'NO VERIFICADO';
        if (d.status === 'good') {
            statusText = `VERIFICADO - ${nowStr}`;
        } else if (d.status === 'bad') {
            statusText = `DIFERENCIA (${d.diff.toFixed(2)}) - ${nowStr}`;
        }
        const obj = {
            interno: d.interno,
            verificado_saldos: statusText
        };
        if (d.refExcel) obj.ref_excel = d.refExcel;
        if (d.fechaExcel) obj.fecha_excel = d.fechaExcel;
        if (d.debitoExcel !== undefined && !isNaN(d.debitoExcel)) obj.debito_excel = d.debitoExcel;

        return obj;
    }).filter(u => u.interno && u.interno !== 'S/N');

    if (updates.length > 0) {
        try {
            await supabaseClient.from('mtodo').upsert(updates, { onConflict: 'interno', returning: 'minimal' });

            const historialUpdates = updates
                .map(u => {
                    const row = globalRawData.find(r => r.interno === u.interno);
                    const targetId = row && row.importacion_id && String(row.importacion_id) !== '-' ? parseInt(row.importacion_id) : null;
                    if (!targetId) return null;
                    return {
                        dim_id: targetId,
                        interno: u.interno,
                        ref_excel: u.ref_excel || null,
                        fecha_excel: u.fecha_excel || null,
                        debito_excel: u.debito_excel || 0
                    };
                })
                .filter(u => u !== null);

            if (historialUpdates.length > 0) {
                try {
                    await supabaseClient.from('historial_datos_minera').upsert(historialUpdates, { returning: 'minimal' });
                } catch(eHist) {
                    console.warn("Aviso en historial_datos_minera:", eHist);
                }
            }
        } catch(e) {
            console.error("Excepción al guardar verificado_saldos y datos excel:", e);
        }
    }

    guardarLogVerificacion('SALDOS', {
        total: countTotal,
        ok: countOk,
        diff: countDiff,
        solo_excel: countExcel,
        solo_sistema: countSys
    }, diffs);
}

function renderVerifyResults(diffs) {
    const tbody = document.getElementById('verifyBody');
    tbody.innerHTML = '';
    const modal = document.getElementById('verifyModal');
    const noDiffMsg = document.getElementById('noDiffMsg');
    
    const errorsOnly = diffs.filter(d => d.status !== 'good');

    if(errorsOnly.length === 0) {
        noDiffMsg.classList.remove('hidden');
    } else {
        noDiffMsg.classList.add('hidden');
        errorsOnly.sort((a,b) => {
            if (a.status === 'missing_in_system') return -1;
            if (b.status === 'missing_in_system') return 1;
            return Math.abs(b.diff) - Math.abs(a.diff);
        });

        errorsOnly.forEach(d => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-var(--border-color) hover:bg-slate-100 dark:hover:bg-[#23232a] transition-colors";
            
            let statusBadge = '';
            if (d.status === 'good') {
                statusBadge = '<span class="bg-orange-500/15 text-orange-500 dark:text-orange-400 font-bold px-2 py-0.5 rounded text-[9px]">CUADRA</span>';
            } else if (d.status === 'bad') {
                statusBadge = '<span class="bg-red-500/15 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded text-[9px]">DIFERENCIA</span>';
            } else {
                statusBadge = '<span class="bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold px-2 py-0.5 rounded text-[9px]">FALTA EN SIS</span>';
            }

            tr.innerHTML = `
                <td class="px-4 py-2 font-bold text-slate-800 dark:text-white">${d.interno}</td>
                <td class="px-4 py-2 text-right">${formatMoney(d.totalSys)}</td>
                <td class="px-4 py-2 text-right text-orange-500 dark:text-[#00f0ff] font-bold">${formatMoney(d.debitoExcel)}</td>
                <td class="px-4 py-2 text-right font-bold ${Math.abs(d.diff) > 0.05 ? 'text-red-500' : 'text-slate-500'}">${formatMoney(d.diff)}</td>
                <td class="px-4 py-2 text-center">${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    modal.classList.remove('hidden');
}

// --- TOAST HELPER A LA MEXICANO ---
function showToast(msg, isError = false) {
    Swal.fire({
        icon: isError ? 'error' : 'success',
        title: isError ? 'Error' : '¡Listo!',
        text: msg,
        timer: 1500,
        showConfirmButton: false
    });
}

async function guardarLogVerificacion(tipo, resumen, detalles) {
    try {
        const { error } = await supabaseClient.from('registro_verificaciones').insert([{
            tipo: tipo,
            resumen: resumen,
            detalles: detalles,
            fecha_ejecucion: new Date().toISOString()
        }]);
        if(error) throw error;
        
        console.log("Log de verificación de saldos guardado exitosamente en Supabase.");
    } catch(e) {
        console.warn("Aviso en guardarLogVerificacion (el log de auditoría no se pudo guardar en Supabase):", e.message || e);
    }
}

// --- GESTIÓN NITS EN PLANILLA PREMIUM ---
function openNitConfig() {
    document.getElementById('nitConfigModal').classList.remove('hidden');
    renderNitConfigList();
}

async function addNitConfig() {
    const nit = document.getElementById('newNit').value.trim();
    const prov = document.getElementById('newProv').value.trim();
    const code = document.getElementById('newCode').value.trim();

    if(!nit || !code) return Swal.fire('Error', 'NIT y Código son obligatorios', 'error');

    try {
        const { error } = await supabaseClient.from('config_nits').upsert({
            nit: nit, proveedor: prov, codigo: code
        }, { onConflict: 'nit', returning: 'minimal' });
        if(error) throw error;
        nitMap[nit] = { name: prov, code: code };
        document.getElementById('newNit').value = '';
        document.getElementById('newProv').value = '';
        document.getElementById('newCode').value = '';
        renderNitConfigList();
        showToast('NIT guardado en BD.');
    } catch(e) { Swal.fire('Error', 'No se pudo guardar: ' + e.message, 'error'); }
}

async function deleteNitConfig(nit) {
    try {
        const { error } = await supabaseClient.from('config_nits').delete().eq('nit', nit);
        if(error) throw error;
        delete nitMap[nit];
        renderNitConfigList();
        showToast('NIT eliminado.');
    } catch(e) { Swal.fire('Error', 'No se pudo eliminar: ' + e.message, 'error'); }
}

function renderNitConfigList() {
    const tbody = document.getElementById('nitConfigBody');
    tbody.innerHTML = '';
    Object.keys(nitMap).forEach(nit => {
        const item = nitMap[nit];
        const tr = document.createElement('tr');
        tr.className = "border-b border-var(--border-color) hover:bg-slate-100 dark:hover:bg-[#172422]";
        tr.innerHTML = `
            <td class="p-2 font-mono text-orange-500 dark:text-[#00f0ff]">${nit}</td>
            <td class="p-2">${item.name}</td>
            <td class="p-2 font-bold">${item.code}</td>
            <td class="p-2 text-center">
                <button onclick="deleteNitConfig('${nit}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- VERIFICACIÓN DE SUMA ---
async function handleVerifySumaFile(event) {
    const file = event.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
        
        let headerRowIndex = -1;
        let colMap = { dim: -1, ref: -1, date: -1, cif: -1, trib: -1, client: -1 };

        for(let i=0; i<rawData.length; i++) {
            const row = rawData[i].map(c => String(c).toUpperCase().trim());
            
            const hasDim = row.some(s => s.includes('DIM') || s.includes('DECLARACION'));
            const hasRef = row.some(s => s.includes('REF') || s.includes('INTERNO')); 
            
            if(hasDim && hasRef) {
                headerRowIndex = i;
                row.forEach((colName, idx) => {
                    const name = String(colName).toUpperCase();
                    if(name.includes('DIM') || name.includes('DECLARACION')) colMap.dim = idx;
                    else if(name.includes('REF') || name.includes('INTERNO')) colMap.ref = idx;
                    else if(name.includes('FECHA') && (name.includes('ACEPTA') || name === 'FECHA')) colMap.date = idx;
                    else if(name.includes('CIF') && name.includes('BOB')) colMap.cif = idx;
                    else if(name.includes('TOTAL') && (name.includes('TRIBUTOS') || name.includes('DETERMINADOS'))) colMap.trib = idx;
                    else if(name.includes('RAZON SOCIAL') || name.includes('IMPORTADOR') || name.includes('CLIENTE')) colMap.client = idx;
                });
                break;
            }
        }

        if(headerRowIndex === -1) {
            Swal.fire('Error de Lectura', 'No encontré las columnas clave (DIM, Referencia). Revisa el archivo.', 'error');
            return;
        }

        const dataRows = rawData.slice(headerRowIndex + 1);
        await verifySumaData(dataRows, colMap);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

async function verifySumaData(excelRows, colMap) {
    const results = [];
    
    const normalizeDIM = (val) => {
        if(!val) return '';
        let s = String(val).replace(/[^0-9]/g, '');
        if(s.length > 7) return s.slice(-7);
        return s;
    };

    const normalizeRef = (val) => {
        if(!val) return '';
        return String(val).trim().toUpperCase();
    };

    const normalizeDate = (val) => {
        if(!val) return '';
        let s = String(val).trim();
        if(s.includes(' ')) s = s.split(' ')[0];
        
        // Convertir YYYY-MM-DD a DD/MM/YYYY
        if (s.includes('-')) {
            const parts = s.split('-');
            if (parts.length === 3) {
                return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
            }
        }
        
        // Asegurar formato DD/MM/YYYY con ceros a la izquierda
        if (s.includes('/')) {
            const parts = s.split('/');
            if (parts.length === 3) {
                return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
            }
        }
        
        return s;
    };

    globalFilteredData.forEach(sysItem => {
        const sysDIM = normalizeDIM(sysItem.dim_n);
        const sysRef = normalizeRef(sysItem.interno);
        
        const excelMatch = excelRows.find(row => {
            const rowDIM = normalizeDIM(row[colMap.dim]); 
            const rowRef = normalizeRef(row[colMap.ref]);
            
            if(sysDIM && rowDIM && sysDIM === rowDIM) return true;
            if(sysRef && rowRef) {
                if(sysRef === rowRef) return true;
                if(sysRef.length > 2 && rowRef.length > 2) {
                    return rowRef.includes(sysRef) || sysRef.includes(rowRef);
                }
            }
            return false;
        });
        
        if (excelMatch) {
            let errors = [];
            const fechaSys = normalizeDate(sysItem.fecha_val);
            const fechaExcel = normalizeDate(excelMatch[colMap.date]);
            if(fechaSys && fechaExcel && fechaExcel !== fechaSys) errors.push('date');

            const cifSys = parseFloat(sysItem.cif || 0);
            let rawCif = String(excelMatch[colMap.cif] || '0').replace(/,/g, '');
            const cifExcel = parseFloat(rawCif);
            if(Math.abs(cifSys - cifExcel) > 5.00) errors.push('cif'); 

            const tribSys = parseFloat(sysItem.total_tributos || 0);
            let rawTrib = String(excelMatch[colMap.trib] || '0').replace(/,/g, '');
            const tribExcel = parseFloat(rawTrib);
            if(Math.abs(tribSys - tribExcel) > 5.00) errors.push('trib');

            const d = { 
                dimS: sysItem.dim_n, dimE: excelMatch[colMap.dim], 
                dateS: fechaSys, dateE: fechaExcel, 
                cifS: cifSys, cifE: cifExcel, 
                tribS: tribSys, tribE: tribExcel 
            };

            const refExcelVal = String(excelMatch[colMap.ref] || '').trim();
            const dateExcelVal = String(excelMatch[colMap.date] || '').trim();

            if (errors.length === 0) {
                results.push({ interno: sysItem.interno, refExcel: refExcelVal, fechaExcel: dateExcelVal, status: 'ok', data: d });
            } else {
                results.push({ interno: sysItem.interno, refExcel: refExcelVal, fechaExcel: dateExcelVal, status: 'bad', errors: errors, data: d });
            }
        } else {
             results.push({ 
                interno: sysItem.interno, 
                status: 'missing_in_excel',
                data: { 
                    dimS: sysItem.dim_n, 
                    dateS: normalizeDate(sysItem.fecha_val),
                    cifS: parseFloat(sysItem.cif || 0), 
                    tribS: parseFloat(sysItem.total_tributos || 0)
                }
             });
        }
    });

    excelRows.forEach(row => {
        if(colMap.client !== -1) {
            const rowClient = String(row[colMap.client] || '').toUpperCase();
            if(!rowClient.includes('MINERA') && !rowClient.includes('CRISTOBAL')) return;
        }

        const rowDIM = normalizeDIM(row[colMap.dim]);
        const rowRef = normalizeRef(row[colMap.ref]);

        const alreadyMatched = globalFilteredData.some(sysItem => {
            const sysDIM = normalizeDIM(sysItem.dim_n);
            const sysRef = normalizeRef(sysItem.interno);
            
            if(sysDIM && rowDIM && sysDIM === rowDIM) return true;
            if(sysRef && rowRef) {
                if(sysRef === rowRef) return true;
                if(sysRef.length > 2 && rowRef.length > 2 && (rowRef.includes(sysRef) || sysRef.includes(rowRef))) return true;
            }
            return false;
        });

        if(!alreadyMatched) {
            if(!rowDIM && !rowRef) return; 

            let rawCif = String(row[colMap.cif] || '0').replace(/,/g, '');
            let rawTrib = String(row[colMap.trib] || '0').replace(/,/g, '');

            results.push({ 
                interno: row[colMap.ref] || 'S/N', 
                refExcel: row[colMap.ref] || '',
                fechaExcel: normalizeDate(row[colMap.date]),
                status: 'missing_in_system',
                data: { 
                    dimE: row[colMap.dim], 
                    dateE: normalizeDate(row[colMap.date]), 
                    cifE: parseFloat(rawCif), 
                    cifS: 0,
                    tribE: parseFloat(rawTrib),
                    tribS: 0
                }
            });
        }
    });

    renderVerifySumaResults(results);

    const countTotal = results.length;
    const countOk = results.filter(r => r.status === 'ok').length;
    const countDiff = results.filter(r => r.status === 'bad').length;
    const countExcel = results.filter(r => r.status === 'missing_in_system').length;
    const countSys = results.filter(r => r.status === 'missing_in_excel').length;

    // Actualizar estados de verificación de SUMA y GUARDAR ref_excel / fecha_excel en BD Supabase
    const nowStr = new Date().toLocaleString('es-ES', { hour12: false });
    const updates = results.map(r => {
        let statusText = 'NO VERIFICADO';
        if (r.status === 'ok') {
            statusText = `VERIFICADO - ${nowStr}`;
        } else if (r.status === 'bad') {
            statusText = `DIFERENCIA (${r.errors.join(', ')}) - ${nowStr}`;
        }
        const obj = {
            interno: r.interno,
            verificado_suma: statusText
        };
        if (r.refExcel) obj.ref_excel = r.refExcel;
        if (r.fechaExcel) obj.fecha_excel = r.fechaExcel;
        return obj;
    }).filter(u => u.interno && u.interno !== 'S/N');

    if (updates.length > 0) {
        try {
            await supabaseClient.from('mtodo').upsert(updates, { onConflict: 'interno', returning: 'minimal' });

            const historialUpdates = updates
                .map(u => {
                    const row = globalRawData.find(r => r.interno === u.interno);
                    const targetId = row && row.importacion_id && String(row.importacion_id) !== '-' ? parseInt(row.importacion_id) : null;
                    if (!targetId) return null;
                    return {
                        dim_id: targetId,
                        interno: u.interno,
                        ref_excel: u.ref_excel || null,
                        fecha_excel: u.fecha_excel || null
                    };
                })
                .filter(u => u !== null);

            if (historialUpdates.length > 0) {
                try {
                    await supabaseClient.from('historial_datos_minera').upsert(historialUpdates, { returning: 'minimal' });
                } catch(eHist) {
                    console.warn("Aviso en historial_datos_minera:", eHist);
                }
            }
        } catch(e) {
            console.error("Excepción al guardar verificado_suma y datos excel:", e);
        }
    }

    guardarLogVerificacion('SUMA', {
        total: countTotal,
        ok: countOk,
        diff: countDiff,
        solo_excel: countExcel,
        solo_sistema: countSys
    }, results);
}

function renderVerifySumaResults(results) {
    const tbody = document.getElementById('verifySumaBody');
    const noDiffMsg = document.getElementById('noDiffMsgSuma');
    const modal = document.getElementById('verifySumaModal');
    
    const countTotal = results.length;
    const countOk = results.filter(r => r.status === 'ok').length;
    const countDiff = results.filter(r => r.status === 'bad').length;
    const countExcel = results.filter(r => r.status === 'missing_in_system').length;
    const countSys = results.filter(r => r.status === 'missing_in_excel').length;

    document.getElementById('sumaCountTotal').innerText = countTotal;
    document.getElementById('sumaCountOk').innerText = countOk;
    document.getElementById('sumaCountDiff').innerText = countDiff;
    document.getElementById('sumaCountExcel').innerText = countExcel;
    document.getElementById('sumaCountSys').innerText = countSys;

    tbody.innerHTML = '';
    
    if(results.length === 0) {
         tbody.innerHTML = '<tr><td colspan="10" class="text-center p-4 text-slate-500 italic">No hay datos para comparar.</td></tr>';
         noDiffMsg.classList.add('hidden');
    } else if(results.every(r => r.status === 'ok')) {
        noDiffMsg.classList.remove('hidden');
    } else {
        noDiffMsg.classList.add('hidden');
        
        results.sort((a,b) => {
            const rank = (s) => {
                if (s === 'missing_in_system') return 0;
                if (s === 'bad') return 1;
                if (s === 'missing_in_excel') return 2;
                return 3;
            };
            return rank(a.status) - rank(b.status);
        });

        results.forEach(r => {
            const tr = document.createElement('tr');
            const d = r.data || {};
            let rowClass = "border-b border-var(--border-color) text-xs ";
            let statusIcon = '';

            const check = (type, val1, val2, isMoney=false) => {
                const hasErr = r.errors && r.errors.includes(type);
                const v1 = isMoney ? formatMoney(val1) : (val1 || '-');
                const v2 = isMoney ? formatMoney(val2) : (val2 || '-');
                const style = hasErr ? 'bg-red-500/10 text-red-600 dark:text-red-405 font-bold' : '';
                return `<td class="px-2 py-1 border-l border-var(--border-color) ${isMoney?'text-right':''}">${v1}</td><td class="px-2 py-1 ${style} ${isMoney?'text-right':''}">${v2}</td>`;
            };

            if(r.status === 'ok') {
                rowClass += 'bg-orange-500/5 hover:bg-orange-500/10';
                statusIcon = '<i class="fa-solid fa-check text-orange-500 dark:text-orange-400"></i>';
                tr.innerHTML = `
                    <td class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300">${r.interno}</td>
                    <td class="px-2 py-1 text-center">${statusIcon}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color)">${d.dimS||'-'}</td><td class="px-2 py-1 text-orange-600 dark:text-orange-400 font-medium">${d.dimE||'-'}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color)">${d.dateS||'-'}</td><td class="px-2 py-1 text-orange-600 dark:text-orange-400 font-medium">${d.dateE||'-'}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color) text-right">${formatMoney(d.cifS)}</td><td class="px-2 py-1 text-right text-orange-600 dark:text-orange-400 font-medium">${formatMoney(d.cifE)}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color) text-right">${formatMoney(d.tribS)}</td><td class="px-2 py-1 text-right text-orange-600 dark:text-orange-400 font-medium">${formatMoney(d.tribE)}</td>
                `;
            } else if (r.status === 'missing_in_system') {
                rowClass += 'bg-amber-500/5 hover:bg-amber-500/10';
                statusIcon = '<div class="flex flex-col items-center"><i class="fa-solid fa-triangle-exclamation text-amber-500"></i><span class="text-[8px] font-bold text-amber-600 dark:text-amber-400">SOLO EXCEL</span></div>';
                tr.innerHTML = `
                    <td class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300">${r.interno}</td>
                    <td class="px-2 py-1 text-center">${statusIcon}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color) bg-slate-100 dark:bg-[#16171f]/50"></td><td class="px-2 py-1">${d.dimE || '-'}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color) bg-slate-100 dark:bg-[#16171f]/50"></td><td class="px-2 py-1">${d.dateE || '-'}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color) bg-slate-100 dark:bg-[#16171f]/50"></td><td class="px-2 py-1 text-right">${formatMoney(d.cifE)}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color) bg-slate-100 dark:bg-[#16171f]/50"></td><td class="px-2 py-1 text-right">${formatMoney(d.tribE)}</td>
                `;
            } else if (r.status === 'missing_in_excel') {
                rowClass += 'bg-orange-500/5 hover:bg-orange-500/10';
                statusIcon = '<div class="flex flex-col items-center"><i class="fa-solid fa-database text-orange-500"></i><span class="text-[8px] font-bold text-orange-500 dark:text-blue-400">SOLO SIST</span></div>';
                tr.innerHTML = `
                    <td class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300">${r.interno}</td>
                    <td class="px-2 py-1 text-center">${statusIcon}</td>
                    <td class="px-2 py-1 border-l border-var(--border-color) text-orange-600 dark:text-blue-400 font-medium">${d.dimS || '-'}</td><td class="px-2 py-1 bg-slate-100 dark:bg-[#16171f]/50"></td>
                    <td class="px-2 py-1 border-l border-var(--border-color) text-orange-600 dark:text-blue-400 font-medium">${d.dateS || '-'}</td><td class="px-2 py-1 bg-slate-100 dark:bg-[#16171f]/50"></td>
                    <td class="px-2 py-1 border-l border-var(--border-color) text-right text-orange-600 dark:text-blue-400 font-medium">${formatMoney(d.cifS)}</td><td class="px-2 py-1 bg-slate-100 dark:bg-[#16171f]/50"></td>
                    <td class="px-2 py-1 border-l border-var(--border-color) text-right text-orange-600 dark:text-blue-400 font-medium">${formatMoney(d.tribS)}</td><td class="px-2 py-1 bg-slate-100 dark:bg-[#16171f]/50"></td>
                `;
            } else { // BAD
                rowClass += 'bg-white dark:bg-[#16161a] hover:bg-red-500/5';
                statusIcon = '<i class="fa-solid fa-xmark text-red-600 text-lg"></i>';
                tr.innerHTML = `
                    <td class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300">${r.interno}</td>
                    <td class="px-2 py-1 text-center">${statusIcon}</td>
                    ${check('dim', d.dimS, d.dimE)}
                    ${check('date', d.dateS, d.dateE)}
                    ${check('cif', d.cifS, d.cifE, true)}
                    ${check('trib', d.tribS, d.tribE, true)}
                `;
            }
            tr.className = rowClass;
            tbody.appendChild(tr);
        });
    }
    
    modal.classList.remove('hidden');
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
window.promptComision = promptComision;
window.promptPuertos = promptPuertos;
window.promptVerificationError = promptVerificationError;
window.handleVerifyFile = handleVerifyFile;
window.openNitConfig = openNitConfig;
window.addNitConfig = addNitConfig;
window.deleteNitConfig = deleteNitConfig;
window.handleVerifySumaFile = handleVerifySumaFile;

