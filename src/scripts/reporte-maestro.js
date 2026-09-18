
        // 🚨 CONFIGURACIÓN 🚨
        import { supabase } from '../services/supabase.js';
        let supabaseClient = supabase;
        
        let globalProcessedData = []; 
        let dataToSave = []; 
        let savedManualInputs = {}; 
        let columnsHidden = true; 
        let nitMap = {}; 
        let clientTableData = []; 

        // VARIABLES PARA CONTROL DE FILTROS A LO MEXICANO
        let lastClient = 'all';
        let lastMonth = 'all';

        // --- GESTIÓN NITS CON CACHÉ DE NAVEGADOR ---
        async function loadNitConfig() {
            try {
                const cached = localStorage.getItem('cache_config_nits');
                const cachedTime = localStorage.getItem('cache_config_nits_time');
                if (cached && cachedTime && (Date.now() - Number(cachedTime) < 3600000)) {
                    const data = JSON.parse(cached);
                    nitMap = {};
                    data.forEach(item => {
                        nitMap[item.nit] = { name: item.proveedor, code: item.codigo, id: item.id };
                    });
                    return;
                }
                const { data, error } = await supabaseClient.from('config_nits').select('id, nit, proveedor, codigo');
                if(error) throw error;
                if (data) {
                    try {
                        localStorage.setItem('cache_config_nits', JSON.stringify(data));
                        localStorage.setItem('cache_config_nits_time', String(Date.now()));
                    } catch(e) {}
                }
                nitMap = {};
                data.forEach(item => {
                    nitMap[item.nit] = { name: item.proveedor, code: item.codigo, id: item.id };
                });
            } catch(e) {
                console.error("Error cargando NITs:", e);
                const local = JSON.parse(localStorage.getItem('nitMap'));
                if(local) nitMap = local;
            }
        }

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
                tr.className = "border-b hover:bg-gray-50";
                tr.innerHTML = `
                    <td class="p-2 font-mono text-orange-500">${nit}</td>
                    <td class="p-2">${item.name}</td>
                    <td class="p-2 font-bold">${item.code}</td>
                    <td class="p-2 text-center">
                        <button onclick="deleteNitConfig('${nit}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function extractNitFromUrl(url) {
            if(!url) return null;
            try {
                if (url.includes('nit=')) {
                    const match = url.match(/nit=([^&]+)/);
                    if(match && match[1]) return match[1];
                }
                const urlObj = new URL(url);
                return urlObj.searchParams.get('nit');
            } catch (e) { return null; }
        }

        // --- MANEJO DE INPUTS Y AUTOCOMPLETE ---
        window.handleLinkInput = (el, id, type) => {
            const val = el.value;
            updateManualData(id, type + '_link', val, 'text');
            const nit = extractNitFromUrl(val);
            if(nit && nitMap[nit]) {
                const code = nitMap[nit].code;
                updateManualData(id, type + '_cod', code, 'text');
                try {
                    const tdLink = el.parentElement;
                    const tdCode = tdLink.nextElementSibling;
                    const inputCode = tdCode.querySelector('input');
                    if(inputCode) {
                        inputCode.value = code;
                        inputCode.classList.add('bg-green-100');
                        setTimeout(()=>inputCode.classList.remove('bg-green-100'), 500);
                    }
                } catch(e) {}
            }
        };

        window.handleAmountInput = (el, id, type) => {
            const val = parseFloat(el.value) || 0;
            updateManualData(id, type, el.value, 'number');
            if (type === 'gastos_puerto' && val > 0) {
                try {
                    const tr = el.closest('tr');
                    const codeInput = tr.querySelector(`input[oninput*="_cod"]`); 
                    if (codeInput && !codeInput.value) {
                         const aspbEntry = nitMap['ASPB'] || Object.values(nitMap).find(x => x.name && x.name.toUpperCase() === 'ASPB');
                         if (aspbEntry) {
                             codeInput.value = aspbEntry.code;
                             updateManualData(id, type + '_cod', aspbEntry.code, 'text');
                             codeInput.classList.add('bg-green-100');
                             setTimeout(()=>codeInput.classList.remove('bg-green-100'), 500);
                         }
                    }
                } catch(e) { console.error(e); }
            }
        };

        // --- UTILIDADES ---
        const formatMoney = (amount) => {
            if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
            return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
        };

        const getMonthYear = (dateString) => {
            if (!dateString || dateString === '-' || dateString === 'null') return '-';
            const raw = dateString.split(' ')[0];
            let year, month;

            if(raw.includes('/')) {
                const parts = raw.split('/');
                if(parts.length === 3) { month = parseInt(parts[1], 10); year = parseInt(parts[2], 10); }
            } else if(raw.includes('-')) {
                const parts = raw.split('-');
                if(parts.length === 3) { year = parseInt(parts[0], 10); month = parseInt(parts[1], 10); }
            }

            if(year && month) {
                const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
                if(month >= 1 && month <= 12) return months[month - 1] + '-' + year;
            }
            return dateString;
        };

        const formatDateForDB = (dateString) => {
            if (!dateString || dateString === '-' || dateString === 'null') return null;
            const rawDate = dateString.split(' ')[0];
            if (rawDate.includes('/')) {
                const [d, m, y] = rawDate.split('/');
                if (d && m && y) return y + '-' + m + '-' + d;
            }
            return rawDate;
        };

        const cleanNumber = (str) => {
            if (!str) return '';
            return String(str).replace(/[^0-9]/g, '');
        };

        function showToast(msg, type = 'info') {
            const toast = document.getElementById('toast');
            const toastMsg = document.getElementById('toastMsg');
            toastMsg.innerText = msg;
            toast.className = 'fixed bottom-5 right-5 px-4 py-2 rounded shadow-lg transition-opacity duration-300 z-50 text-xs ' + (type === 'error' ? 'bg-red-600' : 'bg-gray-800') + ' text-white';
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 3000);
        }

        // --- CARGA DINÁMICA DE LIBRERÍA EXCEL ---
        async function ensureXLSXLoaded() {
            if (window.XLSX) return true;
            showToast('Cargando motor de Excel... aguanta vara ⏳');
            return new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
                script.onload = () => { showToast('¡Motor de Excel listo! 👊'); resolve(true); };
                script.onerror = () => { Swal.fire('Error', 'No se pudo cargar la librería de Excel.', 'error'); resolve(false); };
                document.head.appendChild(script);
            });
        }

        // --- VERIFICACIÓN DE SALDOS ---
        async function handleVerifyFile(event) {
            const file = event.target.files[0];
            if(!file) return;
            const loaded = await ensureXLSXLoaded();
            if (!loaded) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = window.XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawData = window.XLSX.utils.sheet_to_json(worksheet, {header: 1});
                
                let headerRowIndex = -1;
                for(let i=0; i<rawData.length; i++) {
                    const row = rawData[i].map(c => String(c).toUpperCase().trim());
                    if(row.includes('TRAMITE') && row.includes('DEBITO')) {
                        headerRowIndex = i;
                        break;
                    }
                }
                if(headerRowIndex === -1) {
                    Swal.fire('Error', 'No encontré las columnas "TRAMITE" y "DEBITO".', 'error');
                    return;
                }
                const jsonData = window.XLSX.utils.sheet_to_json(worksheet, {range: headerRowIndex});
                verifyBalances(jsonData);
            };
            reader.readAsArrayBuffer(file);
            event.target.value = '';
        }

        function verifyBalances(excelData) {
            const diffs = [];
            const processedInternos = new Set();
            dataToSave.forEach(sysItem => {
                const internoSys = String(sysItem.n_referencia || '').trim();
                if(!internoSys || internoSys === '-') return;
                processedInternos.add(internoSys);
                const excelMatch = excelData.find(row => {
                    const tramiteExcel = String(row['TRAMITE'] || '').trim();
                    return tramiteExcel === internoSys;
                });
                if(excelMatch) {
                    const totalSys = sysItem.total_facturas_albo + sysItem.total_facturas_ip + sysItem.total_facturas_guia + (parseFloat(sysItem.gastos_puerto) || 0) + (parseFloat(sysItem.otros_gastos) || 0);
                    const debitoExcel = parseFloat(excelMatch['DEBITO'] || 0);
                    const diff = totalSys - debitoExcel;
                    if(Math.abs(diff) > 0.05) { 
                        diffs.push({ interno: internoSys, cliente: sysItem.razon_social, totalSys: totalSys, debitoExcel: debitoExcel, diff: diff, status: 'bad' });
                    } else {
                         diffs.push({ interno: internoSys, cliente: sysItem.razon_social, totalSys: totalSys, debitoExcel: debitoExcel, diff: 0, status: 'good' });
                    }
                }
            });
            excelData.forEach(row => {
                const tramiteExcel = String(row['TRAMITE'] || '').trim();
                if (tramiteExcel && !processedInternos.has(tramiteExcel)) {
                    diffs.push({ interno: tramiteExcel, cliente: row['CLIENTE'] || 'Desconocido', totalSys: 0, debitoExcel: parseFloat(row['DEBITO'] || 0), diff: -parseFloat(row['DEBITO'] || 0), status: 'missing_in_system' });
                }
            });
            renderVerifyResults(diffs);
        }

        function renderVerifyResults(diffs) {
            const tbody = document.getElementById('verifyBody');
            tbody.innerHTML = '';
            const modal = document.getElementById('verifyModal');
            const noDiffMsg = document.getElementById('noDiffMsg');
            if(diffs.length === 0) {
                noDiffMsg.classList.remove('hidden');
            } else {
                noDiffMsg.classList.add('hidden');
                diffs.sort((a,b) => {
                    if (a.status === 'missing_in_system') return -1;
                    if (b.status === 'missing_in_system') return 1;
                    if (a.status === 'bad') return -1;
                    return 1;
                });
                diffs.forEach(d => {
                    const tr = document.createElement('tr');
                    let rowClass = "border-b hover:bg-gray-50 ";
                    let statusIcon = '';
                    let colorDiff = '';
                    if(d.status === 'good') {
                        rowClass += 'bg-green-50/30'; colorDiff = 'text-green-600';
                        statusIcon = '<div class="flex justify-center items-center h-full text-green-500 text-lg"><i class="fa-solid fa-circle-check"></i></div>';
                    } else if (d.status === 'missing_in_system') {
                        rowClass += 'bg-yellow-50'; colorDiff = 'text-red-600';
                        statusIcon = '<div class="flex flex-col justify-center items-center h-full text-yellow-600 text-xs font-bold leading-tight"><i class="fa-solid fa-triangle-exclamation text-lg mb-1"></i>No en Sist.</div>';
                    } else {
                        colorDiff = d.diff > 0 ? 'text-green-600' : 'text-red-600';
                        statusIcon = '<div class="flex justify-center items-center h-full text-red-500 text-lg"><i class="fa-solid fa-circle-xmark"></i></div>';
                    }
                    tr.className = rowClass;
                    tr.innerHTML = `
                        <td class="px-4 py-2 font-bold text-gray-700">${d.interno}</td>
                        <td class="px-4 py-2 text-xs text-gray-500">${d.cliente}</td>
                        <td class="px-4 py-2 text-right font-mono">${formatMoney(d.totalSys)}</td>
                        <td class="px-4 py-2 text-right font-mono text-orange-500">${formatMoney(d.debitoExcel)}</td>
                        <td class="px-4 py-2 text-right font-bold ${colorDiff}">${formatMoney(d.diff)}</td>
                        <td class="px-4 py-2 text-center w-24">${statusIcon}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            modal.classList.remove('hidden');
        }

        // --- VERIFICADOR SUMA ---
        async function handleVerifySumaFile(event) {
            const file = event.target.files[0];
            if(!file) return;
            const loaded = await ensureXLSXLoaded();
            if (!loaded) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = window.XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawData = window.XLSX.utils.sheet_to_json(worksheet, {header: 1});
                
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
                verifySumaData(dataRows, colMap);
            };
            reader.readAsArrayBuffer(file);
            event.target.value = '';
        }

        function verifySumaData(excelRows, colMap) {
            const results = [];
            const selectedClient = document.getElementById('clientFilter').value;
            
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

            globalProcessedData.forEach(sysItem => {
                if(selectedClient !== 'all' && String(sysItem.razon_social).trim() !== selectedClient) return;

                const sysDIM = normalizeDIM(sysItem.n_declaracion);
                const sysRef = normalizeRef(sysItem.n_referencia);
                
                const excelMatch = excelRows.find(row => {
                    if(selectedClient !== 'all' && colMap.client !== -1) {
                        const rowClient = String(row[colMap.client] || '').toUpperCase();
                        if(!rowClient.includes(selectedClient.toUpperCase()) && !selectedClient.toUpperCase().includes(rowClient)) return false; 
                    }

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
                    const fechaSys = normalizeDate(sysItem.fecha_aceptacion);
                    const fechaExcel = normalizeDate(excelMatch[colMap.date]);
                    if(fechaSys && fechaExcel && fechaExcel !== fechaSys) errors.push('date');

                    const cifSys = parseFloat(sysItem.cif_bs || 0);
                    let rawCif = String(excelMatch[colMap.cif] || '0').replace(/,/g, '');
                    const cifExcel = parseFloat(rawCif);
                    if(Math.abs(cifSys - cifExcel) > 5.00) errors.push('cif'); 

                    const tribSys = parseFloat(sysItem.total_tributos || 0);
                    let rawTrib = String(excelMatch[colMap.trib] || '0').replace(/,/g, '');
                    const tribExcel = parseFloat(rawTrib);
                    if(Math.abs(tribSys - tribExcel) > 5.00) errors.push('trib');

                    const d = { 
                        dimS: sysItem.n_declaracion, dimE: excelMatch[colMap.dim], 
                        dateS: fechaSys, dateE: fechaExcel, 
                        cifS: cifSys, cifE: cifExcel, 
                        tribS: tribSys, tribE: tribExcel 
                    };

                    if (errors.length === 0) {
                        results.push({ interno: sysItem.n_referencia, status: 'ok', data: d });
                    } else {
                        results.push({ interno: sysItem.n_referencia, status: 'bad', errors: errors, data: d });
                    }
                } else {
                     results.push({ 
                        interno: sysItem.n_referencia, 
                        status: 'missing_in_excel',
                        data: { 
                            dimS: sysItem.n_declaracion, 
                            dateS: normalizeDate(sysItem.fecha_aceptacion),
                            cifS: parseFloat(sysItem.cif_bs || 0), 
                            tribS: parseFloat(sysItem.total_tributos || 0)
                        }
                     });
                }
            });

            excelRows.forEach(row => {
                if(selectedClient !== 'all' && colMap.client !== -1) {
                    const rowClient = String(row[colMap.client] || '').toUpperCase();
                    if(!rowClient.includes(selectedClient.toUpperCase().replace(' S.A.', '').replace(' SRL', ''))) return;
                }

                const rowDIM = normalizeDIM(row[colMap.dim]);
                const rowRef = normalizeRef(row[colMap.ref]);

                const alreadyMatched = globalProcessedData.some(sysItem => {
                    if(selectedClient !== 'all' && String(sysItem.razon_social).trim() !== selectedClient) return false;

                    const sysDIM = normalizeDIM(sysItem.n_declaracion);
                    const sysRef = normalizeRef(sysItem.n_referencia);
                    
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
                        status: 'missing_in_system',
                        data: { 
                            dimE: row[colMap.dim], 
                            dateE: normalizeDate(row[colMap.date]), 
                            cifE: parseFloat(rawCif), 
                            tribE: parseFloat(rawTrib) 
                        }
                    });
                }
            });

            renderVerifySumaResults(results);
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
                 tbody.innerHTML = '<tr><td colspan="10" class="text-center p-4 text-gray-500 italic">No hay datos para comparar con los filtros actuales.</td></tr>';
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
                    let rowClass = "border-b text-xs ";
                    let statusIcon = '';

                    const check = (type, val1, val2, isMoney=false) => {
                        const hasErr = r.errors && r.errors.includes(type);
                        const v1 = isMoney ? formatMoney(val1) : (val1 || '-');
                        const v2 = isMoney ? formatMoney(val2) : (val2 || '-');
                        const style = hasErr ? 'suma-diff' : '';
                        return `<td class="px-2 py-1 border-l border-l-gray-300 ${isMoney?'text-right':''}">${v1}</td><td class="px-2 py-1 ${style} ${isMoney?'text-right':''}">${v2}</td>`;
                    };

                    if(r.status === 'ok') {
                        rowClass += 'bg-green-50 hover:bg-green-100';
                        statusIcon = '<i class="fa-solid fa-check text-green-600"></i>';
                        tr.innerHTML = `
                            <td class="px-2 py-1 font-bold text-gray-700">${r.interno}</td>
                            <td class="px-2 py-1 text-center">${statusIcon}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300">${d.dimS||'-'}</td><td class="px-2 py-1 text-green-700 font-medium">${d.dimE||'-'}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300">${d.dateS||'-'}</td><td class="px-2 py-1 text-green-700 font-medium">${d.dateE||'-'}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300 text-right">${formatMoney(d.cifS)}</td><td class="px-2 py-1 text-right text-green-700 font-medium">${formatMoney(d.cifE)}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300 text-right">${formatMoney(d.tribS)}</td><td class="px-2 py-1 text-right text-green-700 font-medium">${formatMoney(d.tribE)}</td>
                        `;
                    } else if (r.status === 'missing_in_system') {
                        rowClass += 'bg-orange-50 hover:bg-orange-100';
                        statusIcon = '<div class="flex flex-col items-center"><i class="fa-solid fa-triangle-exclamation text-orange-500"></i><span class="text-[8px] font-bold text-orange-600">SOLO EXCEL</span></div>';
                        tr.innerHTML = `
                            <td class="px-2 py-1 font-bold text-gray-700">${r.interno}</td>
                            <td class="px-2 py-1 text-center">${statusIcon}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300 bg-gray-100"></td><td class="px-2 py-1">${d.dimE || '-'}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300 bg-gray-100"></td><td class="px-2 py-1">${d.dateE || '-'}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300 bg-gray-100"></td><td class="px-2 py-1 text-right">${formatMoney(d.cifE)}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300 bg-gray-100"></td><td class="px-2 py-1 text-right">${formatMoney(d.tribE)}</td>
                        `;
                    } else if (r.status === 'missing_in_excel') {
                        rowClass += 'bg-blue-50 hover:bg-orange-500/10';
                        statusIcon = '<div class="flex flex-col items-center"><i class="fa-solid fa-database text-orange-500"></i><span class="text-[8px] font-bold text-orange-500">SOLO SIST</span></div>';
                        tr.innerHTML = `
                            <td class="px-2 py-1 font-bold text-gray-700">${r.interno}</td>
                            <td class="px-2 py-1 text-center">${statusIcon}</td>
                            <td class="px-2 py-1 border-l border-l-gray-300 text-orange-600 font-medium">${d.dimS || '-'}</td><td class="px-2 py-1 bg-gray-100"></td>
                            <td class="px-2 py-1 border-l border-l-gray-300 text-orange-600 font-medium">${d.dateS || '-'}</td><td class="px-2 py-1 bg-gray-100"></td>
                            <td class="px-2 py-1 border-l border-l-gray-300 text-right text-orange-600 font-medium">${formatMoney(d.cifS)}</td><td class="px-2 py-1 bg-gray-100"></td>
                            <td class="px-2 py-1 border-l border-l-gray-300 text-right text-orange-600 font-medium">${formatMoney(d.tribS)}</td><td class="px-2 py-1 bg-gray-100"></td>
                        `;
                    } else { // BAD
                        rowClass += 'bg-white hover:bg-red-50';
                        statusIcon = '<i class="fa-solid fa-xmark text-red-600 text-lg"></i>';
                        tr.innerHTML = `
                            <td class="px-2 py-1 font-bold text-gray-700">${r.interno}</td>
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
        
        window.toggleColumns = () => {
            columnsHidden = !columnsHidden;
            const cols = document.querySelectorAll('.col-detail');
            const btnText = document.getElementById('toggle-text');
            cols.forEach(col => {
                if (columnsHidden) col.classList.add('col-hidden');
                else col.classList.remove('col-hidden');
            });
            btnText.innerText = columnsHidden ? "Mostrar Detalles" : "Ocultar Detalles";
        };

        // --- SISTEMA DE VERIFICACIÓN MANUAL DE FACTURAS ---
        window.toggleVerif = (dimId, facturaId) => {
            if (!savedManualInputs[dimId]) savedManualInputs[dimId] = {};
            if (!savedManualInputs[dimId].verif) savedManualInputs[dimId].verif = {};
            
            // Inverte o estado de verificado
            savedManualInputs[dimId].verif[facturaId] = !savedManualInputs[dimId].verif[facturaId];
            
            renderTable(globalProcessedData); 
        };

        function setupRealtime() {
            suscribirTiempoReal();
        }

        window.updateManualData = (id, field, value, type = 'number') => {
            let finalValue = value;
            if (type === 'number') finalValue = parseFloat(value) || 0;
            if(!savedManualInputs[id]) savedManualInputs[id] = {};
            savedManualInputs[id][field] = finalValue;

            const record = globalProcessedData.find(item => String(item.id) === String(id));
            if(record) {
                record[field] = finalValue;
                const totalGastos = record.total_facturas_albo + record.total_facturas_ip + record.total_facturas_guia + (parseFloat(record.gastos_puerto) || 0) + (parseFloat(record.otros_gastos) || 0);
                const cellGastos = document.getElementById(`total-gastos-${id}`);
                if(cellGastos) cellGastos.innerText = formatMoney(totalGastos);
                recalcKPIs();
            }
        };

        function recalcKPIs() {
            let kpiTributos = 0, kpiGastos = 0, kpiTotalGral = 0, kpiComisiones = 0;
            let kpiAlbo = 0, kpiIP = 0, kpiGuias = 0, kpiPuertos = 0, kpiOtros = 0;

            dataToSave.forEach(item => {
                kpiAlbo += item.total_facturas_albo;
                kpiIP += item.total_facturas_ip;
                kpiGuias += item.total_facturas_guia;
                kpiPuertos += (parseFloat(item.gastos_puerto) || 0);
                kpiOtros += (parseFloat(item.otros_gastos) || 0);

                const totalGastosExternos = item.total_facturas_albo + item.total_facturas_ip + item.total_facturas_guia + (parseFloat(item.gastos_puerto) || 0) + (parseFloat(item.otros_gastos) || 0);
                const totalGeneralFila = item.total_tributos + totalGastosExternos + (parseFloat(item.comision) || 0);
                kpiTributos += item.total_tributos; kpiGastos += totalGastosExternos; kpiTotalGral += totalGeneralFila;
                kpiComisiones += (parseFloat(item.comision) || 0);
            });

            document.getElementById('stat-gastos').innerText = formatMoney(kpiGastos);
            document.getElementById('stat-tributos').innerText = formatMoney(kpiTributos);
            document.getElementById('stat-total-general').innerText = formatMoney(kpiTotalGral);
            document.getElementById('stat-comisiones').innerText = formatMoney(kpiComisiones);
            
            document.getElementById('kpi-albo').innerText = formatMoney(kpiAlbo);
            document.getElementById('kpi-ip').innerText = formatMoney(kpiIP);
            document.getElementById('kpi-guias').innerText = formatMoney(kpiGuias);
            document.getElementById('kpi-puertos').innerText = formatMoney(kpiPuertos);
            document.getElementById('kpi-otros').innerText = formatMoney(kpiOtros);
        }

        const removeDuplicates = (list) => {
            const seen = new Set();
            return list.filter(item => {
                const key = String(item.n_factura || '').trim();
                if(!key) return true; 
                if (seen.has(key)) return false;
                seen.add(key); return true;
            });
        };

        // --- NUEVO: FUNCIÓN PARA JALAR SÓLO OPCIONES DE FILTROS AL INICIO ---
        async function loadFiltersOnly() {
            try {
                const { data, error } = await supabaseClient.from('importaciones').select('razon_social, fecha_aceptacion');
                if (error) throw error;
                
                const clients = [...new Set((data || []).map(item => String(item.razon_social).trim()))].filter(Boolean).sort();
                const months = [...new Set((data || []).map(item => getMonthYear(item.fecha_aceptacion)))].filter(m => m !== '-').sort();

                const clientSelect = document.getElementById('clientFilter');
                const monthSelect = document.getElementById('monthFilter');
                
                const currentClient = clientSelect.value;
                const currentMonth = monthSelect.value;

                clientSelect.innerHTML = '<option value="all">Todos los Clientes</option>';
                clients.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c; opt.innerText = c;
                    clientSelect.appendChild(opt);
                });

                monthSelect.innerHTML = '<option value="all">Todos los Meses</option>';
                months.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m; opt.innerText = m;
                    monthSelect.appendChild(opt);
                });

                // Mantener selección por si acaso
                if(clients.includes(currentClient)) clientSelect.value = currentClient;
                if(months.includes(currentMonth)) monthSelect.value = currentMonth;

            } catch(e) {
                console.error("Error jalando opciones de filtros: ", e);
            }
        }

        // --- ACTUALIZADO: APLICADOR DE FILTROS ---
        async function applyFilters() {
            const currentClient = document.getElementById('clientFilter').value;
            const currentMonth = document.getElementById('monthFilter').value;
            const savedVal = document.getElementById('savedFilter').value; 

            // Si cambió el cliente o el mes, disparamos la consulta a la BD (solo trae lo necesario)
            if (currentClient !== lastClient || currentMonth !== lastMonth) {
                lastClient = currentClient;
                lastMonth = currentMonth;
                await loadData(false);
            } else {
                // Si solo cambió el estado de guardado, filtramos localmente la data que ya bajó
                let filtered = globalProcessedData;
                if(savedVal === 'saved') filtered = filtered.filter(item => item.is_saved);
                if(savedVal === 'unsaved') filtered = filtered.filter(item => !item.is_saved);
                renderTable(filtered);
            }
        }

        // --- ACTUALIZADO: CARGADOR DE DATOS DE SUPABASE ---
        async function loadData(isUpdate = false) {
            try {
                const clientVal = document.getElementById('clientFilter').value;
                const monthVal = document.getElementById('monthFilter').value;
                const savedVal = document.getElementById('savedFilter').value;

                if (!isUpdate) {
                    document.getElementById('loader').classList.remove('hidden');
                    document.getElementById('reportContainer').classList.add('hidden');
                }
                await loadNitConfig();

                const dimCols = 'id, n_declaracion, n_referencia, razon_social, fecha_aceptacion, aduana, proveedor, total_cif_bs, total_cif_usd, total_tributos, gravamen, iva, ice, iehd, tasa_albo, estado';
                let dimsQuery = supabaseClient.from('importaciones').select(dimCols).order('id', { ascending: false });
                if (clientVal !== 'all') {
                    dimsQuery = dimsQuery.eq('razon_social', clientVal);
                }
                
                const fetchAllWithQuery = async (query, limit = 1000) => {
                    let allData = [];
                    let offset = 0;
                    let page = 0;
                    const MAX_PAGES = 50;
                    while (page < MAX_PAGES) {
                        page++;
                        const { data, error } = await query.range(offset, offset + limit - 1);
                        if (error) {
                            console.error(`Error en fetchAllWithQuery (offset ${offset}):`, error);
                            throw error;
                        }
                        if (!data || data.length === 0) break;
                        allData.push(...data);
                        if (data.length < limit) break;
                        offset += limit;
                    }
                    return allData;
                };

                const factCols = 'id, dim_id, n_factura, fecha_emision, monto_total, nit_emisor, razon_social_emisor, estado, importaciones(n_referencia)';
                let [dims, facturas] = await Promise.all([
                    fetchAllWithQuery(dimsQuery),
                    fetchAllWithQuery(supabaseClient.from('facturas').select(factCols))
                ]);

                // Filtramos por mes localmente (porque el mes se calcula con una función de JS)
                if (monthVal !== 'all') {
                    dims = dims.filter(dim => getMonthYear(dim.fecha_aceptacion) === monthVal);
                }

                // Jalamos los reportes_unificados_data SÓLO de los DIMs que quedaron
                let savedReportData = [];
                if (dims.length > 0) {
                    const dimIds = dims.map(d => d.id);
                    if (dimIds.length <= 1000) {
                        const resReporte = await supabaseClient.from('reporte_unificado_data').select('dim_id, total_gastos_logistica, comision, comisiones, comision_banco, comision_agencia').in('dim_id', dimIds);
                        if (resReporte.error) throw resReporte.error;
                        savedReportData = resReporte.data || [];
                    } else {
                        const resReporte = await supabaseClient.from('reporte_unificado_data').select('dim_id, total_gastos_logistica, comision, comisiones, comision_banco, comision_agencia');
                        if (resReporte.error) throw resReporte.error;
                        savedReportData = resReporte.data || [];
                    }
                }
                const savedMap = {};
                savedReportData.forEach(r => savedMap[r.dim_id] = r);

                globalProcessedData = dims.map((dim) => {
                    const saved = savedMap[dim.id] || {};
                    const ga = parseFloat(dim.gravamen || 0);
                    const iva = parseFloat(dim.iva || 0);
                    const totalTrib = parseFloat(dim.total_tributos || 0);
                    const diferencia = (ga + iva) - totalTrib; 
                    const dimClean = cleanNumber(dim.n_declaracion);
                    const dimSuffix = dimClean.length > 7 ? dimClean.slice(-7) : dimClean;
                    const dimRefInterna = String(dim.n_referencia || '').trim();

                    const dimGuiaEmbarque = String(dim.guia_embarque || '').trim();
                    const dimGuiaCourier = String(dim.guia_courier || '').trim();

                    let facturasAlboDab = [];
                    let facturasIP = [];
                    let facturasGuia = [];

                    facturas.forEach(f => {
                        const fInterno = String(f.importaciones?.n_referencia || f.interno_archivo || '').trim().toUpperCase();
                        const dInterno = dimRefInterna.toUpperCase();
                        
                        const regAduanero = String(f.registro_aduanero || f.doc_aduanero || '').trim();
                        const docRef = cleanNumber(regAduanero);
                        
                        let pertence = false;
                        
                        if (fInterno.length >= 3 && dInterno.length >= 3 && (fInterno === dInterno || fInterno.includes(dInterno) || dInterno.includes(fInterno))) {
                            pertence = true;
                        }
                        if (docRef.length > 4 && docRef.includes(dimSuffix)) {
                            pertence = true;
                        }
                        
                        if (f.tipo === 'GUIA') {
                            const fRefGuia = cleanNumber(f.ref_guia || '') + cleanNumber(f.importaciones?.n_referencia || f.interno_archivo || '');
                            const cleanE = cleanNumber(dimGuiaEmbarque);
                            const cleanC = cleanNumber(dimGuiaCourier);
                            
                            if (cleanE.length >= 4 && (fRefGuia.includes(cleanE) || regAduanero.toUpperCase().includes(dimGuiaEmbarque.toUpperCase()))) pertence = true;
                            if (cleanC.length >= 4 && (fRefGuia.includes(cleanC) || regAduanero.toUpperCase().includes(dimGuiaCourier.toUpperCase()))) pertence = true;
                        }

                        if (!pertence) return; 

                        if (f.tipo === 'GUIA') {
                            facturasGuia.push(f);
                        } else if (f.tipo === 'ALBO IP') {
                            facturasIP.push(f);
                        } else {
                            if (regAduanero.includes('-')) {
                                facturasIP.push(f);
                            } else {
                                facturasAlboDab.push(f);
                            }
                        }
                    });

                    const uniqueAlboDab = removeDuplicates(facturasAlboDab);
                    const uniqueIP = removeDuplicates(facturasIP);
                    const uniqueGuia = removeDuplicates(facturasGuia);

                    const sumAlbo = uniqueAlboDab.reduce((sum, f) => sum + (f.monto || 0), 0);
                    const sumIP = uniqueIP.reduce((sum, f) => sum + (f.monto || 0), 0);
                    const sumGuia = uniqueGuia.reduce((sum, f) => sum + (f.monto || 0), 0);

                    const bdPuertoJson = saved.gastos_puerto_json || {};
                    const bdOtrosJson = saved.otros_gastos_json || {};
                    let defPuerto = saved.gastos_puerto !== undefined ? saved.gastos_puerto : (dim.gastos_puerto || 0);
                    let defOtros = saved.otros_gastos !== undefined ? saved.otros_gastos : (dim.otros_gastos || 0);
                    let defComision = saved.comision !== undefined ? saved.comision : null;

                    const verifData = bdOtrosJson.verif || {};
                    if (!savedManualInputs[dim.id]) savedManualInputs[dim.id] = {};
                    if (savedManualInputs[dim.id].verif === undefined) savedManualInputs[dim.id].verif = verifData;

                    if(savedManualInputs[dim.id]) {
                        if(savedManualInputs[dim.id].gastos_puerto !== undefined) defPuerto = savedManualInputs[dim.id].gastos_puerto;
                        if(savedManualInputs[dim.id].otros_gastos !== undefined) defOtros = savedManualInputs[dim.id].otros_gastos;
                        if(savedManualInputs[dim.id].comision !== undefined) defComision = savedManualInputs[dim.id].comision;
                    }

                    const getField = (field, bdJson, key) => {
                        const manual = savedManualInputs[dim.id] ? savedManualInputs[dim.id][field] : undefined;
                        return manual !== undefined ? manual : (bdJson[key] || '');
                    };

                    const manualPuertoFact = getField('gastos_puerto_nfact', bdPuertoJson, 'nfact');
                    const manualPuertoFecha = getField('gastos_puerto_fecha', bdPuertoJson, 'fecha');
                    const manualPuertoCod = getField('gastos_puerto_cod', bdPuertoJson, 'cod');
                    const manualOtrosFact = getField('otros_gastos_nfact', bdOtrosJson, 'nfact');
                    const manualOtrosFecha = getField('otros_gastos_fecha', bdOtrosJson, 'fecha');
                    const manualOtrosLink = getField('otros_gastos_link', bdOtrosJson, 'link');
                    const manualOtrosCod = getField('otros_gastos_cod', bdOtrosJson, 'cod');

                    let finalComision = 0;
                    if (defComision !== null) {
                        finalComision = defComision;
                    } else {
                        const cifValue = parseFloat(dim.total_cif || 0);
                        const oiValue = String(dim.oi || '').trim().toUpperCase();
                        let autoComision = 0;
                        if (oiValue === 'EXP') { autoComision = 700; }
                        else if (cifValue > 0) {
                            if (cifValue <= 243600) autoComision = 600;
                            else if (cifValue <= 3480000) autoComision = cifValue * 0.003;
                            else autoComision = cifValue * 0.0025;
                        }
                        finalComision = Math.round(autoComision * 100) / 100;
                    }
                    
                    const mesGestion = getMonthYear(dim.fecha_aceptacion);

                    return {
                        id: dim.id,
                        razon_social: dim.razon_social || 'Sin Nombre',
                        mes_gestion: mesGestion,
                        fecha_aceptacion: dim.fecha_aceptacion || '-', 
                        aduana: dim.aduana,
                        n_declaracion: dim.n_declaracion || '',
                        examen_previo: dim.examen_previo || '',
                        guia_embarque: dim.guia_embarque || '', 
                        guia_courier: dim.guia_courier || '',
                        n_referencia: dim.n_referencia || '-',
                        cif_bs: parseFloat(dim.total_cif || 0),
                        oi: dim.oi, ga: ga, iva: iva, total_tributos: totalTrib, diferencia: diferencia,
                        facturas_albo_dab: uniqueAlboDab, total_facturas_albo: sumAlbo,
                        facturas_ip: uniqueIP, total_facturas_ip: sumIP,
                        facturas_guia: uniqueGuia, total_facturas_guia: sumGuia,
                        gastos_puerto: defPuerto, gastos_puerto_nfact: manualPuertoFact,
                        gastos_puerto_fecha: manualPuertoFecha, gastos_puerto_cod: manualPuertoCod,
                        otros_gastos: defOtros, otros_gastos_nfact: manualOtrosFact,
                        otros_gastos_fecha: manualOtrosFecha, otros_gastos_link: manualOtrosLink,
                        otros_gastos_cod: manualOtrosCod, comision: finalComision,
                        is_saved: !!savedMap[dim.id] 
                    };
                });

                // Filtro final para "Estado: Guardados/Pendientes"
                let filtered = globalProcessedData;
                if(savedVal === 'saved') filtered = filtered.filter(item => item.is_saved);
                if(savedVal === 'unsaved') filtered = filtered.filter(item => !item.is_saved);

                renderTable(filtered); 
                
                document.getElementById('loader').classList.add('hidden');
                document.getElementById('reportContainer').classList.remove('hidden');
                if(globalProcessedData.length > 0) document.getElementById('btn-save-cloud').classList.remove('hidden');
                
                if(isUpdate) {
                    document.getElementById('status-indicator').classList.add('animate-pulse');
                    setTimeout(() => document.getElementById('status-indicator').classList.remove('animate-pulse'), 2000);
                }
                suscribirTiempoReal();
            } catch (err) { 
                console.error(err); 
                if(!isUpdate) Swal.fire('Error', "Hubo bronca al cargar los datos: " + err.message, 'error'); 
            }
        }

        let realtimeChannel = null;
        function suscribirTiempoReal() {
            if (!supabaseClient || realtimeChannel) return;
            
            realtimeChannel = supabaseClient
                .channel('realtime-reporte-maestro')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'reporte_unificado_data' }, (payload) => {
                    const { eventType, new: newRow, old: oldRow } = payload;
                    if (eventType === 'INSERT' && newRow) {
                        const idx = rawData.findIndex(r => r.n_referencia === newRow.n_referencia);
                        if (idx >= 0) rawData[idx] = { ...rawData[idx], ...newRow };
                        else rawData.unshift(newRow);
                    } else if (eventType === 'UPDATE' && newRow) {
                        const idx = rawData.findIndex(r => r.id === newRow.id || r.n_referencia === newRow.n_referencia);
                        if (idx >= 0) rawData[idx] = { ...rawData[idx], ...newRow };
                    } else if (eventType === 'DELETE' && oldRow) {
                        rawData = rawData.filter(r => r.id !== oldRow.id && r.n_referencia !== oldRow.n_referencia);
                    }
                    filterData();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'control_estados_importacion' }, (payload) => {
                    const { eventType, new: newRow } = payload;
                    if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow) {
                        const refKey = (newRow.n_referencia || '').trim().toUpperCase();
                        let updated = false;
                        rawData.forEach(r => {
                            if (r.n_referencia && r.n_referencia.trim().toUpperCase() === refKey) {
                                if (newRow.canal) r.canal = newRow.canal;
                                if (newRow.fecha_canal) r.fecha_canal = newRow.fecha_canal;
                                updated = true;
                            }
                        });
                        if (updated) filterData();
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

        // --- MÓDULO CLIENTE ---
        function openClientReportModal() {
            document.getElementById('clientReportModal').classList.remove('hidden');
        }

        function renderClientTable() {
            const rawInput = document.getElementById('internosInput').value;
            const mesGestionContrato = document.getElementById('mesGestionInput').value || '012026';
            const container = document.getElementById('clientTableContainer');
            const emptyState = document.getElementById('clientEmptyState');
            const btnCopy = document.getElementById('btnCopyTable');
            const btnExport = document.getElementById('btnExportTable');
            const thead = document.getElementById('clientTableHead');
            const tbody = document.getElementById('clientTableBody');

            if(!rawInput.trim()) {
                Swal.fire('¡Aguanta!', 'Necesitas pegar los números de Interno primero.', 'warning');
                return;
            }

            const internosList = rawInput.split(/\r?\n/).map(s => s.trim()).filter(s => s !== "");
            const filteredData = globalProcessedData.filter(item => internosList.includes(String(item.n_referencia).trim()));

            if(filteredData.length === 0) {
                Swal.fire('Error', 'No encontré ningún trámite con esos números. Asegúrate de tener cargado al Cliente primero en el filtro superior.', 'error');
                return;
            }

            const getRegAd = (f) => String(f.registro_aduanero || f.doc_aduanero || '');
            const joinFacs = (list, field) => list.map(f => f[field]).join(' / ');
            const joinRegAd = (list) => list.map(getRegAd).join(' / ');

            clientTableData = filteredData.map(item => {
                const dimClean = String(item.n_declaracion || '').replace(/[^0-9]/g, '');
                const dimYear = "2026"; 
                const dimCode = "211";  
                const dimNumberOnly = dimClean.slice(-7);
                const h1ndim = dimYear + dimCode + dimNumberOnly;
                const h1bs = (item.total_tributos + 100) * -1;
                const h1sist = (item.oi === 'EXP') ? 0 : 100;
                const control = h1bs + item.iva + item.ga + h1sist;
                const cifUsd = item.cif_bs / 6.96;
                let h1cav = 0;
                const dbComision = parseFloat(item.comision || item.comision_bs || item.comision_bob) || 0;
                if (dbComision > 0) {
                    h1cav = dbComision;
                } else if (item.oi === 'EXP') {
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

                return {
                    H1NDIM: h1ndim, H1BAN: "BUN", H1DOC: dimNumberOnly, H1BS: h1bs, H1FECHA: item.fecha_aceptacion ? String(item.fecha_aceptacion).split(' ')[0] : '',
                    CONTRATO: 'CN1900006' + mesGestionContrato, H1CODAD: "211", H1IVA: item.iva, H1GA: item.ga, H1SIST: h1sist,
                    CONTROL: control, H1CIFBS: item.cif_bs, INTERNO: item.n_referencia, H1OI: item.oi || '', H1CIFUSD: cifUsd, H1CAV: h1cav,
                    ALM: item.total_facturas_albo, AB: joinRegAd(item.facturas_albo_dab), FAC: joinFacs(item.facturas_albo_dab, 'n_factura'),
                    FECH: joinFacs(item.facturas_albo_dab, 'fecha'), QR: joinFacs(item.facturas_albo_dab, 'codigo_qr'),
                    ALM2: item.total_facturas_ip, AB2: joinRegAd(item.facturas_ip), FAC_IP: joinFacs(item.facturas_ip, 'n_factura'),
                    FECH_IP: joinFacs(item.facturas_ip, 'fecha'), QR_IP: joinFacs(item.facturas_ip, 'codigo_qr'),
                    COUR: item.total_facturas_guia, FECH_GUIA: joinFacs(item.facturas_guia, 'fecha'), QR_GUIA: joinFacs(item.facturas_guia, 'codigo_qr'),
                    TRANS: item.otros_gastos || 0, AB_OTROS: item.otros_gastos_cod || '', FAC_OTROS: item.otros_gastos_nfact || '',
                    FECH_OTROS: item.otros_gastos_fecha || '', QR_OTROS: item.otros_gastos_link || '',
                    PUERT: item.gastos_puerto || 0, AB42: item.gastos_puerto_cod || '', FAC43: item.gastos_puerto_nfact || '', FECH44: item.gastos_puerto_fecha || ''
                };
            });

            const headers = Object.keys(clientTableData[0]);
            let headerHTML = "<tr>";
            headers.forEach(h => headerHTML += '<th class="p-2 border border-pink-200">' + h + '</th>');
            headerHTML += "</tr>";
            thead.innerHTML = headerHTML;

            let bodyHTML = "";
            clientTableData.forEach(row => {
                bodyHTML += "<tr class='hover:bg-pink-50'>";
                Object.values(row).forEach(val => {
                    let displayVal = val;
                    if (typeof val === 'number') displayVal = val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                    bodyHTML += '<td class="p-2 border border-gray-100 whitespace-nowrap">' + displayVal + '</td>';
                });
                bodyHTML += "</tr>";
            });
            tbody.innerHTML = bodyHTML;

            container.classList.remove('hidden');
            emptyState.classList.add('hidden');
            btnCopy.classList.remove('hidden');
            btnExport.classList.remove('hidden');
        }

        function copyClientTable() {
            const table = document.getElementById('clientResultTable');
            if (!table) return;

            const range = document.createRange();
            range.selectNode(table);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            
            try {
                const successful = document.execCommand('copy');
                if (successful) showToast('¡Tabla copiada al portapapeles!');
                else Swal.fire('Error', 'No se pudo copiar automáticamente. Intenta seleccionar y CTRL+C', 'error');
            } catch (err) {
                console.error('Oops, unable to copy', err);
            }
            window.getSelection().removeAllRanges();
        }

        function exportClientExcel() {
            if(clientTableData.length === 0) return;
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(clientTableData);
            XLSX.utils.book_append_sheet(wb, ws, "Reporte Cliente");
            XLSX.writeFile(wb, "Reporte_Cliente_Visual.xlsx");
        }

        // --- RENDERIZADO DE LA TABLA ---
        function renderFacturasCell(list, colorClass, dimItem, docType) {
            if (!list.length) return '<span class="text-gray-300 italic text-[10px]">-</span>';
            
            const rows = list.map(f => {
                const fQr = String(f.codigo_qr || '');
                const link = fQr.startsWith('http') || fQr.startsWith('www') 
                    ? '<a href="' + fQr + '" target="_blank" class="text-orange-500 hover:text-orange-600 transition-colors"><i class="fa-solid fa-link"></i></a>' 
                    : '<span class="text-gray-300 text-[8px]">-</span>';
                
                let codigoDisplay = '-';
                const nit = extractNitFromUrl(fQr);
                if (nit) {
                    if (nitMap[nit]) codigoDisplay = '<span class="font-bold text-gray-700">' + nitMap[nit].code + '</span>';
                    else codigoDisplay = '<span class="text-red-500 font-bold flex items-center gap-1" title="NIT Desconocido: ' + nit + '"><i class="fa-solid fa-triangle-exclamation"></i> ' + nit + '</span>';
                } else { codigoDisplay = f.importaciones?.n_referencia || f.interno_archivo || f.registro_aduanero || f.doc_aduanero || '-'; }

                let isAutoMatch = false;
                const regAd = String(f.registro_aduanero || f.doc_aduanero || '').trim().toUpperCase();
                const regAdClean = cleanNumber(regAd);
                
                let expectedData = ''; 

                if (docType === 'ALBO') {
                    const dimDecClean = cleanNumber(String(dimItem.n_declaracion || ''));
                    const suffix = dimDecClean.length > 7 ? dimDecClean.slice(-7) : dimDecClean;
                    expectedData = suffix || 'Vacío';
                    if (suffix.length >= 4 && regAdClean.endsWith(suffix)) isAutoMatch = true;
                } else if (docType === 'IP') {
                    const dimExamen = String(dimItem.examen_previo || '').trim().toUpperCase();
                    expectedData = dimExamen || 'Vacío';
                    if (dimExamen.length >= 3 && (regAd.includes(dimExamen) || dimExamen.includes(regAdClean))) isAutoMatch = true;
                } else if (docType === 'GUIA') {
                    const guiaE = String(dimItem.guia_embarque || '').trim().toUpperCase();
                    const guiaC = String(dimItem.guia_courier || '').trim().toUpperCase();
                    
                    expectedData = (guiaE ? guiaE : '') + (guiaE && guiaC ? ' o ' : '') + (guiaC ? guiaC : '');
                    if (!expectedData) expectedData = 'Vacío';
                    
                    if (guiaE.length >= 4 && (regAd === guiaE || regAd.includes(guiaE))) isAutoMatch = true;
                    if (guiaC.length >= 4 && (regAd === guiaC || regAd.includes(guiaC))) isAutoMatch = true;
                    
                    if (!isAutoMatch) {
                        const cleanE = cleanNumber(guiaE);
                        const cleanC = cleanNumber(guiaC);
                        if (cleanE.length >= 4 && regAdClean.includes(cleanE)) isAutoMatch = true;
                        if (cleanC.length >= 4 && regAdClean.includes(cleanC)) isAutoMatch = true;
                    }
                }

                const verifObj = savedManualInputs[dimItem.id] ? savedManualInputs[dimItem.id].verif : null;
                const isManualOk = verifObj && verifObj[f.id] === true;

                let statusHtml = '';
                let rowBg = 'hover:bg-gray-50';

                if (isAutoMatch) {
                    statusHtml = '<i class="fa-solid fa-circle-check text-green-500" title="Verificado Automático: Coincide al 100%"></i>';
                    rowBg = 'bg-green-50/40 hover:bg-green-100 border-l-[3px] border-green-500';
                } else if (isManualOk) {
                    statusHtml = '<button onclick="toggleVerif(\'' + dimItem.id + '\', \'' + f.id + '\')" class="text-orange-500 hover:text-orange-600 drop-shadow-sm transition-transform hover:scale-110" title="Verificado Manualmente: Marcado como Correcto"><i class="fa-solid fa-user-check"></i></button>';
                    rowBg = 'bg-orange-500/10 hover:bg-orange-500/10 border-l-[3px] border-orange-500';
                } else {
                    const debugMsg = '¡No cuadra! DIM pide: [' + expectedData + '] | Factura trae: [' + (regAd || 'Vacío') + ']. Clic para forzar validación OK';
                    statusHtml = '<button onclick="toggleVerif(\'' + dimItem.id + '\', \'' + f.id + '\')" class="text-red-500 hover:text-red-700 drop-shadow-sm transition-transform hover:scale-110" title="' + debugMsg + '"><i class="fa-solid fa-triangle-exclamation animate-pulse"></i></button>';
                    rowBg = 'bg-red-50 hover:bg-red-100 border-l-[3px] border-red-500';
                }

                return '<tr class="border-b border-gray-100 last:border-0 transition-colors ' + rowBg + '"><td class="text-center align-middle p-1">' + statusHtml + '</td><td class="text-right font-mono font-bold ' + colorClass + ' p-1">' + formatMoney(f.monto) + '</td><td class="text-center font-bold text-gray-700 p-1 text-[9px]">' + (f.n_factura||'-') + '</td><td class="text-center text-gray-500 whitespace-nowrap p-1 text-[9px]">' + (f.fecha||'-') + '</td><td class="text-center p-1">' + link + '</td><td class="text-left text-gray-500 truncate max-w-[100px] p-1 text-[9px]">' + codigoDisplay + '</td></tr>';
            }).join('');
            
            return '<div class="overflow-x-auto rounded border border-gray-200 bg-white"><table class="w-full text-[9px]"><thead class="text-xs text-gray-500 bg-gray-50 border-b border-gray-200 font-semibold"><tr><th class="p-1 w-6 text-center" title="Estado de Verificación">V.</th><th class="text-right p-1 w-20">Monto</th><th class="text-center p-1 w-16">N° Fact</th><th class="text-center p-1 w-20">Fecha</th><th class="text-center p-1 w-8">Link</th><th class="text-left p-1">Cód.</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
        }

        function renderManualTable(item, type) {
            const montoVal = item[type] || 0;
            const factVal = item[type + '_nfact'] || '';
            const fechaVal = item[type + '_fecha'] || '';
            let codVal = item[type + '_cod'] || '';
            const colorClass = type === 'gastos_puerto' ? 'text-yellow-700' : 'text-gray-700';

            if (type === 'gastos_puerto') {
                if (!codVal && montoVal > 0) {
                    const aspbEntry = nitMap['ASPB'] || Object.values(nitMap).find(x => x.name && x.name.toUpperCase() === 'ASPB');
                    if (aspbEntry) {
                        codVal = aspbEntry.code;
                        item[type + '_cod'] = codVal;
                        if(!savedManualInputs[item.id]) savedManualInputs[item.id] = {};
                        savedManualInputs[item.id][type + '_cod'] = codVal;
                    }
                }
                return '<div class="overflow-x-auto rounded border border-gray-200 bg-white"><table class="w-full text-[9px]"><thead class="text-xs text-gray-500 bg-gray-50 border-b border-gray-200 font-semibold"><tr><th class="text-right p-1 w-20">Monto</th><th class="text-center p-1 w-20">Comprobante</th><th class="text-center p-1 w-20">Fecha</th><th class="text-left p-1">Código</th></tr></thead><tbody><tr><td class="p-0 border-b border-gray-100"><input type="number" step="0.01" class="table-input text-right font-mono font-bold ' + colorClass + '" value="' + (montoVal !== 0 ? montoVal : '') + '" placeholder="0.00" oninput="handleAmountInput(this, \'' + item.id + '\', \'' + type + '\')"></td><td class="p-0 border-b border-gray-100"><input type="text" class="table-input text-center" value="' + factVal + '" placeholder="-" oninput="updateManualData(\'' + item.id + '\', \'' + type + '_nfact\', this.value, \'text\')"></td><td class="p-0 border-b border-gray-100"><input type="text" class="table-input text-center" value="' + fechaVal + '" placeholder="dd/mm/aaaa" oninput="updateManualData(\'' + item.id + '\', \'' + type + '_fecha\', this.value, \'text\')"></td><td class="p-0 border-b border-gray-100"><input type="text" class="table-input text-left" value="' + codVal + '" placeholder="-" oninput="updateManualData(\'' + item.id + '\', \'' + type + '_cod\', this.value, \'text\')"></td></tr></tbody></table></div>';
            }
            const linkVal = item[type + '_link'] || '';
            return '<div class="overflow-x-auto rounded border border-gray-200 bg-white"><table class="w-full text-[9px]"><thead class="text-xs text-gray-500 bg-gray-50 border-b border-gray-200 font-semibold"><tr><th class="text-right p-1 w-20">Monto</th><th class="text-center p-1 w-16">N° Fact</th><th class="text-center p-1 w-20">Fecha</th><th class="text-center p-1 w-8">Link</th><th class="text-left p-1">Cód.</th></tr></thead><tbody><tr><td class="p-0 border-b border-gray-100"><input type="number" step="0.01" class="table-input text-right font-mono font-bold ' + colorClass + '" value="' + (montoVal !== 0 ? montoVal : '') + '" placeholder="0.00" oninput="updateManualData(\'' + item.id + '\', \'' + type + '\', this.value, \'number\')"></td><td class="p-0 border-b border-gray-100"><input type="text" class="table-input text-center" value="' + factVal + '" placeholder="-" oninput="updateManualData(\'' + item.id + '\', \'' + type + '_nfact\', this.value, \'text\')"></td><td class="p-0 border-b border-gray-100"><input type="text" class="table-input text-center" value="' + fechaVal + '" placeholder="dd/mm/aaaa" oninput="updateManualData(\'' + item.id + '\', \'' + type + '_fecha\', this.value, \'text\')"></td><td class="p-0 border-b border-gray-100"><input type="text" class="table-input text-center" value="' + linkVal + '" placeholder="http..." oninput="handleLinkInput(this, \'' + item.id + '\', \'' + type + '\')"></td><td class="p-0 border-b border-gray-100"><input type="text" class="table-input text-left" value="' + codVal + '" placeholder="-" oninput="updateManualData(\'' + item.id + '\', \'' + type + '_cod\', this.value, \'text\')"></td></tr></tbody></table></div>';
        }

        function renderTable(data) {
            const tbody = document.getElementById('reportBody');
            const tfoot = document.getElementById('reportFooter');
            tbody.innerHTML = ''; tfoot.innerHTML = '';
            let kpiTributos=0, kpiGastos=0, kpiTotalGral=0, sumGA=0, sumIVA=0, sumCIF=0, sumComision=0;
            const visibilityClass = columnsHidden ? 'col-hidden' : '';

            data.forEach(item => {
                const totalGastosExternos = item.total_facturas_albo + item.total_facturas_ip + item.total_facturas_guia + (parseFloat(item.gastos_puerto)||0) + (parseFloat(item.otros_gastos)||0);
                const totalGeneralFila = item.total_tributos + totalGastosExternos + (parseFloat(item.comision)||0);
                kpiTributos += item.total_tributos; kpiGastos += totalGastosExternos; kpiTotalGral += totalGeneralFila;
                sumGA += item.ga; sumIVA += item.iva; sumCIF += item.cif_bs; sumComision += (parseFloat(item.comision)||0);

                const statusIcon = item.is_saved 
                    ? '<i class="fa-solid fa-cloud text-green-500" title="Guardado en Nube"></i>' 
                    : '<i class="fa-solid fa-cloud-arrow-up text-gray-300" title="Pendiente/Local"></i>';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-orange-500/5 transition-colors group";
                
                const razonSocialEscaped = String(item.razon_social || '').replace(/"/g, '&quot;');
                const dimCleanDisplay = String(item.n_declaracion || '').split('-').slice(-2).join('-');

                tr.innerHTML = '<td class="font-bold text-[10px] text-slate-500 truncate max-w-[120px]" title="' + razonSocialEscaped + '"><span class="mr-1">' + statusIcon + '</span>' + item.razon_social + '</td>' +
                    '<td class="font-bold text-brand-700 text-[11px] border-r border-gray-300" title="' + item.n_declaracion + '">' + dimCleanDisplay + '</td>' +
                    '<td class="font-bold text-orange-600 text-[11px] border-r border-gray-300 text-center">' + item.n_referencia + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' text-slate-700 text-[11px]">' + item.mes_gestion + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' text-slate-500 text-[10px] truncate max-w-[80px]">' + item.fecha_aceptacion + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' text-gray-500 text-[10px] truncate max-w-[80px]" title="' + item.aduana + '">' + item.aduana + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' num-cell text-gray-600 text-[10px]">' + formatMoney(item.cif_bs) + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' text-gray-500 text-[10px] truncate max-w-[60px]" title="' + item.oi + '">' + (item.oi || '-') + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' num-cell text-gray-500 text-[10px]">' + formatMoney(item.ga) + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' num-cell text-gray-500 text-[10px] border-r border-gray-300">' + formatMoney(item.iva) + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' num-cell font-bold text-gray-900 bg-gray-50 text-xs border-r border-gray-300">' + formatMoney(item.total_tributos) + '</td>' +
                    '<td class="col-detail ' + visibilityClass + ' num-cell font-bold border-r border-gray-300 ' + (item.diferencia !== 0 ? 'text-red-500' : 'text-slate-300') + ' text-[10px]">' + formatMoney(item.diferencia) + '</td>' +
                    '<td class="p-0 bg-indigo-50/20 border-r-2 border-indigo-200 align-top"><input type="number" step="0.01" class="table-input text-orange-600 font-bold" placeholder="0.00" value="' + (item.comision || 0).toFixed(2) + '" oninput="updateManualData(\'' + item.id + '\', \'comision\', this.value, \'number\')"></td>' +
                    '<td class="align-top bg-blue-50/20 p-1 min-w-[340px] border-r border-dashed border-gray-300">' + renderFacturasCell(item.facturas_albo_dab, 'text-orange-500', item, 'ALBO') + '</td>' +
                    '<td class="align-top bg-purple-50/20 p-1 min-w-[340px] border-r border-dashed border-gray-300">' + renderFacturasCell(item.facturas_ip, 'text-purple-600', item, 'IP') + '</td>' +
                    '<td class="align-top bg-amber-50/20 p-1 min-w-[340px] border-r border-gray-300">' + renderFacturasCell(item.facturas_guia, 'text-amber-600', item, 'GUIA') + '</td>' +
                    '<td class="p-1 bg-yellow-50/10 border-r border-gray-300 align-top min-w-[340px]">' + renderManualTable(item, 'gastos_puerto') + '</td>' +
                    '<td class="p-1 bg-yellow-50/10 border-r border-gray-300 align-top min-w-[340px]">' + renderManualTable(item, 'otros_gastos') + '</td>' +
                    '<td class="num-cell font-bold text-slate-900 bg-slate-100 text-xs" id="total-gastos-' + item.id + '">' + formatMoney(totalGastosExternos) + '</td>';
                
                tbody.appendChild(tr);
            });

            tfoot.innerHTML = '<tr class="bg-gray-800 text-white border-t-2 border-gray-900 text-[11px]"><td colspan="3" class="text-right py-2 px-4 uppercase tracking-wider">Totales Generales:</td><td class="col-detail ' + visibilityClass + '"></td><td class="col-detail ' + visibilityClass + '"></td><td class="col-detail ' + visibilityClass + '"></td><td class="col-detail ' + visibilityClass + ' num-cell py-2 px-2 text-gray-400">' + formatMoney(sumCIF) + '</td><td class="col-detail ' + visibilityClass + '"></td><td class="col-detail ' + visibilityClass + ' num-cell py-2 px-2 text-gray-400">' + formatMoney(sumGA) + '</td><td class="col-detail ' + visibilityClass + ' num-cell py-2 px-2 text-gray-400 border-r border-gray-600">' + formatMoney(sumIVA) + '</td><td class="col-detail ' + visibilityClass + ' num-cell py-2 px-2 bg-gray-700 font-bold text-white border-r border-gray-600">' + formatMoney(kpiTributos) + '</td><td class="col-detail ' + visibilityClass + ' num-cell py-2 px-2 text-gray-400 border-r border-gray-600">Dif: ' + formatMoney(data.reduce((a,b)=>a+b.diferencia,0)) + '</td><td class="num-cell py-2 px-2 text-orange-300 font-bold border-r border-gray-600">' + formatMoney(sumComision) + '</td><td colspan="5" class="text-center text-gray-400 italic font-normal py-2 border-r border-gray-600">Sumatoria de Facturas</td><td class="num-cell py-2 px-2 bg-blue-900 text-xs font-bold text-white">' + formatMoney(kpiGastos) + '</td></tr>';
            
            document.getElementById('stat-dims').innerText = data.length;
            document.getElementById('stat-gastos').innerText = formatMoney(kpiGastos);
            document.getElementById('stat-tributos').innerText = formatMoney(kpiTributos);
            document.getElementById('stat-total-general').innerText = formatMoney(kpiTotalGral);
            document.getElementById('stat-comisiones').innerText = formatMoney(sumComision);
            
            document.getElementById('kpi-albo').innerText = formatMoney(data.reduce((sum, item) => sum + item.total_facturas_albo, 0));
            document.getElementById('kpi-ip').innerText = formatMoney(data.reduce((sum, item) => sum + item.total_facturas_ip, 0));
            document.getElementById('kpi-guias').innerText = formatMoney(data.reduce((sum, item) => sum + item.total_facturas_guia, 0));
            document.getElementById('kpi-puertos').innerText = formatMoney(data.reduce((sum, item) => sum + (parseFloat(item.gastos_puerto)||0), 0));
            document.getElementById('kpi-otros').innerText = formatMoney(data.reduce((sum, item) => sum + (parseFloat(item.otros_gastos)||0), 0));

            dataToSave = data;
        }

        async function saveAllToSupabase() {
            if(dataToSave.length === 0) return Swal.fire('Ojo', 'No hay datos para guardar', 'warning');
            const btn = document.getElementById('btn-save-cloud');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Guardando...';
            btn.disabled = true;
            try {
                const upsertData = dataToSave.map(item => ({
                    dim_id: item.id,
                    n_referencia: item.n_referencia,
                    mes_gestion: item.mes_gestion,
                    fecha_aceptacion: formatDateForDB(item.fecha_aceptacion), 
                    comision: parseFloat(item.comision) || 0,
                    gastos_puerto: parseFloat(item.gastos_puerto) || 0,
                    gastos_puerto_json: { nfact: item.gastos_puerto_nfact, fecha: item.gastos_puerto_fecha, cod: item.gastos_puerto_cod },
                    otros_gastos: parseFloat(item.otros_gastos) || 0,
                    otros_gastos_json: { 
                        nfact: item.otros_gastos_nfact, 
                        fecha: item.otros_gastos_fecha, 
                        link: item.otros_gastos_link, 
                        cod: item.otros_gastos_cod,
                        verif: (savedManualInputs[item.id] ? savedManualInputs[item.id].verif : {}) || {} 
                    },
                    total_gastos_logistica: (item.total_facturas_albo + item.total_facturas_ip + item.total_facturas_guia + (parseFloat(item.gastos_puerto)||0) + (parseFloat(item.otros_gastos)||0)),
                    costo_total_importacion: (item.total_tributos + item.total_facturas_albo + item.total_facturas_ip + item.total_facturas_guia + (parseFloat(item.gastos_puerto)||0) + (parseFloat(item.otros_gastos)||0) + (parseFloat(item.comision)||0))
                }));
                const { error } = await supabaseClient.from('reporte_unificado_data').upsert(upsertData, { onConflict: 'dim_id', returning: 'minimal' });
                if(error) throw error;
                
                await loadData(true);

                Swal.fire({ title: '¡Fierro!', text: 'Datos y verificaciones guardadas al mero cien.', icon: 'success' });
                btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>¡Listo!';
                setTimeout(() => { btn.disabled = false; btn.innerHTML = originalHTML; }, 2000);
            } catch (e) { console.error(e); Swal.fire('Error', e.message, 'error'); btn.innerHTML = originalHTML; btn.disabled = false; }
        }

        function exportToExcel() {
            const table = document.getElementById("mainTable");
            const tableClone = table.cloneNode(true);
            
            // 1. Quitar las columnas ocultas visualmente para que el Excel salga limpiecito y sin basura
            const hiddenCols = tableClone.querySelectorAll('.col-hidden');
            hiddenCols.forEach(col => col.remove());

            // 2. Convertir inputs a texto
            const detailRows = tableClone.querySelectorAll('.detail-row'); detailRows.forEach(row => row.remove());
            const inputs = tableClone.querySelectorAll('input'); 
            inputs.forEach(input => { 
                const val = input.value || ''; 
                const span = document.createElement('span'); 
                span.innerText = val; 
                input.parentNode.replaceChild(span, input); 
            });

            // 3. ¡LA MAGIA AQUÍ! Aplanar las sub-tablas (ALBO, IP, Guías, etc.) a texto puro para evitar múltiples filas
            const innerTables = tableClone.querySelectorAll('table');
            innerTables.forEach(innerTable => {
                const parentTd = innerTable.closest('td');
                if (parentTd) {
                    const tbody = innerTable.querySelector('tbody');
                    if (tbody) {
                        const rows = Array.from(tbody.querySelectorAll('tr'));
                        const flatRows = rows.map(tr => {
                            const cells = Array.from(tr.querySelectorAll('td'));
                            // Extraer texto, si hay un enlace sacar el href, ignorar celdas vacías y unir los datos con " | "
                            return cells.map(td => {
                                const link = td.querySelector('a');
                                if (link && link.href) {
                                    return link.href; // ¡Aquí rescatamos la URL completa!
                                }
                                return td.innerText.trim().replace(/\n/g, '');
                            }).filter(t => t !== '').join(' | ');
                        }).filter(rowText => rowText !== '');
                        
                        // Unir las facturas de ese trámite con " // ", si no hay nada ponemos un guion
                        parentTd.innerText = flatRows.length > 0 ? flatRows.join(' // ') : '-';
                    } else {
                        parentTd.innerText = '-';
                    }
                }
            });

            const wb = XLSX.utils.table_to_book(tableClone, {sheet: "Reporte"});
            XLSX.writeFile(wb, "Reporte_Aduanero_Unificado.xlsx");
        }

        // --- INICIO DE LA APP ---
        window.onload = async () => { 
            setupRealtime(); 
            document.getElementById('loader').classList.remove('hidden');
            await loadFiltersOnly(); 
            document.getElementById('loader').classList.add('hidden');
            // Ya no llamamos a loadData() aquí para que arranque limpio y rápido
        };
    
// Exponer funciones globales para los eventos inline del HTML
window.toggleColumns = toggleColumns;
window.applyFilters = applyFilters;
window.openClientReportModal = openClientReportModal;
window.handleVerifySumaFile = handleVerifySumaFile;
window.openNitConfig = openNitConfig;
window.handleVerifyFile = handleVerifyFile;
window.saveAllToSupabase = saveAllToSupabase;
window.loadData = loadData;
window.exportToExcel = exportToExcel;
window.renderClientTable = renderClientTable;
window.copyClientTable = copyClientTable;
window.exportClientExcel = exportClientExcel;
window.addNitConfig = addNitConfig;
window.deleteNitConfig = deleteNitConfig;
window.toggleVerif = toggleVerif;
window.handleAmountInput = handleAmountInput;
window.updateManualData = updateManualData;
window.handleLinkInput = handleLinkInput;
