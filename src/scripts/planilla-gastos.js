
        // ==========================================
        // UI CUSTOM SELECTS (LA MAGIA VISUAL CONTINÚA)
        // ==========================================
        function initOrUpdateCustomSelect(selectId, iconClass) {
            const nativeSelect = document.getElementById(selectId);
            const containerId = 'custom-' + selectId;
            const container = document.getElementById(containerId);
            
            if(!nativeSelect || !container) return;
            container.innerHTML = '';
            
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'w-full bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-700 border border-gray-200/80 dark:border-slate-600/80 text-xs rounded-xl px-3 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-slate-500/20 transition-all shadow-sm flex items-center justify-between group cursor-pointer backdrop-blur-xl relative overflow-hidden';
            
            let selectedText = 'Seleccionar...';
            if (nativeSelect.multiple) {
                const selectedOptions = Array.from(nativeSelect.selectedOptions);
                const isAllSelected = selectedOptions.length === 0 || (selectedOptions.length === 1 && selectedOptions[0].value === 'ALL');
                if (isAllSelected) {
                    selectedText = 'Todos los clientes';
                } else {
                    const names = selectedOptions.filter(o => o.value !== 'ALL').map(o => o.text);
                    if (names.length === 0) {
                        selectedText = 'Todos los clientes';
                    } else if (names.length <= 2) {
                        selectedText = 'Clientes: ' + names.join(', ');
                    } else {
                        selectedText = `Clientes (${names.length} sel)`;
                    }
                }
            } else {
                selectedText = nativeSelect.options[nativeSelect.selectedIndex] ? nativeSelect.options[nativeSelect.selectedIndex].text : 'Seleccionar...';
            }
            
            btn.innerHTML = `
                <div class="absolute inset-0 bg-slate-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div class="flex items-center gap-2 overflow-hidden relative z-10">
                    <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-750 flex items-center justify-center shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-transform border border-slate-300/50 dark:border-slate-700/50">
                        <i class="${iconClass} text-slate-700 dark:text-slate-200 text-[10px]"></i>
                    </div>
                    <span class="truncate font-bold text-left tracking-wide">${selectedText}</span>
                </div>
                <div class="relative z-10 w-5 h-5 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center group-hover:bg-slate-200 dark:group-hover:bg-slate-800/50 transition-colors shadow-inner">
                    <i class="fas fa-chevron-down text-gray-500 dark:text-slate-400 text-[9px] transition-transform duration-300 group-focus:rotate-180"></i>
                </div>
            `;

            const menu = document.createElement('div');
            // Menú más ancho (w-max y max-w-[450px]) para que no se trunquen los nombres de clientes y aduanas
            menu.className = 'absolute top-full left-0 mt-3 bg-white/95 dark:bg-slate-800/95 backdrop-blur-3xl border border-gray-200 dark:border-slate-700 rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden transition-all duration-300 opacity-0 translate-y-4 pointer-events-none z-[99] transform origin-top max-h-[350px] flex flex-col w-max min-w-full max-w-[420px] md:max-w-[480px]';
            
            menu.addEventListener('click', (e) => e.stopPropagation());
            menu.addEventListener('mousedown', (e) => e.stopPropagation());

            const searchBoxWrap = document.createElement('div');
            searchBoxWrap.className = 'shrink-0 bg-gray-50/50 dark:bg-slate-900/50 backdrop-blur-xl p-4 border-b border-gray-100 dark:border-slate-700 z-10';
            searchBoxWrap.innerHTML = `
                <div class="relative group/search">
                    <div class="absolute inset-0 bg-slate-500/5 rounded-xl blur opacity-0 group-focus-within/search:opacity-100 transition-opacity"></div>
                    <i class="fas fa-search absolute left-4 top-3.5 text-gray-400 group-focus-within/search:text-slate-700 transition-colors z-10"></i>
                    <input type="text" placeholder="Buscar aquí..." class="w-full bg-white dark:bg-slate-800 text-sm font-semibold rounded-xl pl-11 pr-4 py-3 outline-none border border-gray-200 dark:border-slate-600 focus:border-slate-700 focus:ring-4 focus:ring-slate-500/15 text-gray-800 dark:text-white transition-all shadow-sm relative z-10">
                </div>
            `;
            const searchBox = searchBoxWrap.querySelector('input');
            
            if(nativeSelect.options.length > 5) menu.appendChild(searchBoxWrap);

            const scrollableArea = document.createElement('div');
            scrollableArea.className = 'overflow-y-auto custom-scrollbar flex-grow p-2';

            const optionsList = document.createElement('ul');
            optionsList.className = 'flex flex-col gap-1.5';

            Array.from(nativeSelect.options).forEach((opt, idx) => {
                const li = document.createElement('li');
                let isSelected = false;
                if (nativeSelect.multiple) {
                    isSelected = opt.selected;
                } else {
                    isSelected = nativeSelect.selectedIndex === idx;
                }
                
                li.className = `px-5 py-3 text-sm cursor-pointer transition-all duration-300 rounded-2xl flex items-center justify-between group/item ${isSelected ? 'bg-[#1A1918] dark:bg-white text-white dark:text-[#1A1918] font-black shadow-lg transform scale-[1.02]' : 'text-gray-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/80 hover:pl-6 hover:text-slate-900 dark:hover:text-white font-semibold'}`;
                
                if (nativeSelect.multiple) {
                    li.innerHTML = `
                        <span class="truncate pr-4 select-none">${opt.text}</span>
                        ${isSelected ? '<i class="fas fa-check-square text-white text-lg"></i>' : '<i class="far fa-square text-gray-400 group-hover/item:text-slate-500 text-base"></i>'}
                    `;
                } else {
                    li.innerHTML = `
                        <span class="truncate pr-4 select-none">${opt.text}</span>
                        ${isSelected ? '<i class="fas fa-check-circle text-white text-lg shadow-sm rounded-full animate-pulse"></i>' : '<i class="fas fa-chevron-right text-[10px] opacity-0 group-hover/item:opacity-100 transition-all transform -translate-x-3 group-hover/item:translate-x-0"></i>'}
                    `;
                }

                li.onclick = (e) => {
                    e.stopPropagation();
                    if (nativeSelect.multiple) {
                        if (opt.value === 'ALL') {
                            Array.from(nativeSelect.options).forEach((o, i) => {
                                o.selected = (i === idx);
                            });
                        } else {
                            opt.selected = !opt.selected;
                            const allOpt = Array.from(nativeSelect.options).find(o => o.value === 'ALL');
                            if (allOpt) allOpt.selected = false;
                            
                            const selectedCount = Array.from(nativeSelect.options).filter(o => o.selected && o.value !== 'ALL').length;
                            if (selectedCount === 0 && allOpt) {
                                allOpt.selected = true;
                            }
                        }
                        nativeSelect.dispatchEvent(new Event('change'));
                        
                        // Actualizar visualmente los elementos li sin destruir y recrear el DOM completo
                        const listItems = optionsList.querySelectorAll('li');
                        Array.from(nativeSelect.options).forEach((o, i) => {
                            const itemLi = listItems[i];
                            if (!itemLi) return;
                            const isSel = o.selected;
                            
                            if (isSel) {
                                itemLi.className = `px-5 py-3 text-sm cursor-pointer transition-all duration-300 rounded-2xl flex items-center justify-between group/item bg-[#ff5500] dark:bg-[#ff5500] text-white dark:text-[#091010] font-black shadow-lg shadow-[#ff5500]/25 dark:shadow-[#ff5500]/25 transform scale-[1.02]`;
                                itemLi.innerHTML = `
                                    <span class="truncate pr-4 select-none">${o.text}</span>
                                    <i class="fas fa-check-square text-white dark:text-[#091010] text-lg"></i>
                                `;
                            } else {
                                itemLi.className = `px-5 py-3 text-sm cursor-pointer transition-all duration-300 rounded-2xl flex items-center justify-between group/item text-gray-700 dark:text-slate-300 hover:bg-[#f4f4f7] dark:hover:bg-[#1f1f26]/80 hover:pl-6 hover:text-[#ea580c] dark:hover:text-orange-500 font-semibold`;
                                itemLi.innerHTML = `
                                    <span class="truncate pr-4 select-none">${o.text}</span>
                                    <i class="far fa-square text-gray-400 group-hover/item:text-slate-500 text-base"></i>
                                `;
                            }
                        });
                        
                        // Actualizar texto del botón principal
                        let newSelectedText = 'Seleccionar...';
                        const selectedOptions = Array.from(nativeSelect.selectedOptions);
                        const isAllSel = selectedOptions.length === 0 || (selectedOptions.length === 1 && selectedOptions[0].value === 'ALL');
                        
                        if (selectId === 'clientFilter') {
                            if (isAllSel) {
                                newSelectedText = 'Todos los clientes';
                            } else {
                                const names = selectedOptions.filter(o => o.value !== 'ALL').map(o => o.text);
                                if (names.length === 0) {
                                    newSelectedText = 'Todos los clientes';
                                } else if (names.length <= 2) {
                                    newSelectedText = 'Clientes: ' + names.join(', ');
                                } else {
                                    newSelectedText = `Clientes (${names.length} sel)`;
                                }
                            }
                        } else if (selectId === 'aduanaFilter') {
                            if (isAllSel) {
                                newSelectedText = 'Todas las aduanas';
                            } else {
                                const names = selectedOptions.filter(o => o.value !== 'ALL').map(o => o.text);
                                if (names.length === 0) {
                                    newSelectedText = 'Todas las aduanas';
                                } else if (names.length <= 2) {
                                    newSelectedText = 'Aduanas: ' + names.join(', ');
                                } else {
                                    newSelectedText = `Aduanas (${names.length} sel)`;
                                }
                            }
                        } else {
                            if (isAllSel) {
                                newSelectedText = 'Todos';
                            } else {
                                const names = selectedOptions.filter(o => o.value !== 'ALL').map(o => o.text);
                                newSelectedText = names.join(', ');
                            }
                        }
                        btn.querySelector('span.truncate').innerText = newSelectedText;
                    } else {
                        nativeSelect.selectedIndex = idx;
                        nativeSelect.dispatchEvent(new Event('change'));
                        cerrarTodosCustomSelects();
                        initOrUpdateCustomSelect(selectId, iconClass); 
                    }
                };
                optionsList.appendChild(li);
            });

            searchBox.oninput = (e) => {
                const val = e.target.value.toLowerCase();
                Array.from(optionsList.children).forEach(li => {
                    const text = li.innerText.toLowerCase();
                    li.style.display = text.includes(val) ? 'flex' : 'none';
                });
            };

            scrollableArea.appendChild(optionsList);
            menu.appendChild(scrollableArea);

            btn.onclick = (e) => {
                e.stopPropagation();
                const isOpen = !menu.classList.contains('opacity-0');
                cerrarTodosCustomSelects();
                if (!isOpen) {
                    menu.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
                    btn.querySelector('.fa-chevron-down').classList.add('rotate-180');
                    btn.classList.add('ring-4', 'ring-slate-500/15', 'border-slate-400');
                    if(nativeSelect.options.length > 5) setTimeout(() => searchBox.focus(), 100);
                }
            };

            container.appendChild(btn);
            container.appendChild(menu);
        }

        function cerrarTodosCustomSelects() {
            document.querySelectorAll('[id^="custom-"] > div').forEach(menu => {
                menu.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
            });
            document.querySelectorAll('[id^="custom-"] button').forEach(btn => {
                btn.classList.remove('ring-4', 'ring-slate-500/15', 'border-slate-400');
                const icon = btn.querySelector('.fa-chevron-down');
                if(icon) icon.classList.remove('rotate-180');
            });
        }
        document.addEventListener('click', cerrarTodosCustomSelects);

        // ==========================================
        // VARIABLES GLOBALES
        // ==========================================
        let currentMainView = 'table'; 
        let chartInstClientes = null;
        let chartInstEvolucion = null;
        let chartInstDesglose = null;
        let chartInstClientesFactura = null; 
        let lastFilteredData = []; 
        let currentRankingMode = 'monto'; // 'monto' o 'despachos' 

        function switchMainView(view) {
            currentMainView = view;
            const btnTable = document.getElementById('btnViewTable');
            const btnDash = document.getElementById('btnViewDash');
            const viewTable = document.getElementById('viewTable');
            const viewDash = document.getElementById('viewDashboard');
            const btnToggleDet = document.getElementById('btnToggleDetails');

            if (view === 'table') {
                btnTable.className = "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm transition-all main-tab-active flex items-center justify-center";
                btnDash.className = "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm transition-all main-tab-inactive flex items-center justify-center";
                viewTable.classList.remove('hidden');
                viewTable.classList.add('flex');
                viewDash.classList.add('hidden');
                viewDash.classList.remove('flex');
                btnToggleDet.classList.remove('hidden');
            } else {
                btnDash.className = "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm transition-all main-tab-active flex items-center justify-center";
                btnTable.className = "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm transition-all main-tab-inactive flex items-center justify-center";
                viewDash.classList.remove('hidden');
                viewDash.classList.add('flex');
                viewTable.classList.add('hidden');
                viewTable.classList.remove('flex');
                btnToggleDet.classList.add('hidden');
                
                // Aseguramos de darle un segundito a la UI antes de renderizar la gráfica para que los canvas existan visualmente
                setTimeout(() => renderDashboard(), 50); 
            }
        }

        function changeRankingMode(mode) {
            currentRankingMode = mode;
            const btnMonto = document.getElementById('btnRankMonto');
            const btnDespachos = document.getElementById('btnRankDespachos');
            
            if (mode === 'monto') {
                if (btnMonto) btnMonto.className = "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all bg-white dark:bg-slate-700 text-orange-500 dark:text-orange-400 shadow-sm";
                if (btnDespachos) btnDespachos.className = "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white";
            } else {
                if (btnDespachos) btnDespachos.className = "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all bg-white dark:bg-slate-700 text-orange-500 dark:text-orange-400 shadow-sm";
                if (btnMonto) btnMonto.className = "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white";
            }
            renderDashboard();
        }

        // ==========================================
        // MODO CLARO / OSCURO LOGICA
        // ==========================================
        function toggleTheme() {
            const html = document.documentElement;
            html.classList.toggle('dark');
            const isDark = html.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateThemeIcon(isDark);
            if(currentMainView === 'dashboard') renderDashboard(); 
        }

        let _headerCollapsed = false;
        function toggleHeader() {
            _headerCollapsed = !_headerCollapsed;
            const hp = document.getElementById('headerPanel');
            const fp = document.getElementById('filtersPanel');
            const icon = document.getElementById('toggleHeaderIcon');
            if (_headerCollapsed) {
                hp.classList.add('collapsed');
                fp.classList.add('collapsed');
                icon.className = 'fas fa-chevron-down text-[9px]';
            } else {
                hp.classList.remove('collapsed');
                fp.classList.remove('collapsed');
                icon.className = 'fas fa-chevron-up text-[9px]';
            }
        }

        function updateThemeIcon(isDark) {
            const icon = document.getElementById('themeIcon');
            if(isDark) {
                icon.className = 'fas fa-moon text-orange-400 text-2xl group-hover:rotate-12 group-hover:scale-110 transition-all relative z-10';
            } else {
                icon.className = 'fas fa-sun text-amber-500 text-2xl group-hover:rotate-90 group-hover:scale-110 transition-all relative z-10';
            }
        }

        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
            updateThemeIcon(true);
        } else {
            document.documentElement.classList.remove('dark');
            updateThemeIcon(false);
        }

        function generateUUID() {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        // ==========================================
        // FORMATEO DE FECHAS
        // ==========================================
        function formatToYYYYMMDD(dateVal) {
            if (dateVal === null || dateVal === undefined || String(dateVal).trim() === '' || dateVal === '0') return null;
            if (dateVal instanceof Date) {
                if (isNaN(dateVal.getTime())) return null;
                const y = dateVal.getUTCFullYear();
                const m = String(dateVal.getUTCMonth() + 1).padStart(2, '0');
                const d = String(dateVal.getUTCDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            if (typeof dateVal === 'number' || (!isNaN(dateVal) && Number(dateVal) > 20000)) {
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const jsDate = new Date(excelEpoch.getTime() + Number(dateVal) * 86400000);
                const y = jsDate.getUTCFullYear();
                const m = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
                const d = String(jsDate.getUTCDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            let str = String(dateVal).trim().split(' ')[0];
            let parts = str.split(/[\/\-]/);
            if (parts.length === 3) {
                let p1 = parseInt(parts[0]), p2 = parseInt(parts[1]), p3 = parseInt(parts[2]);
                let y, m, d;
                if (p3 >= 1000) { y = p3; if (p1 > 12) { d = p1; m = p2; } else if (p2 > 12) { m = p1; d = p2; } else { d = p1; m = p2; }
                } else if (p1 >= 1000) { y = p1; if (p2 > 12) { d = p2; m = p3; } else { m = p2; d = p3; } 
                } else if (p3 < 100) { y = p3 + 2000; if (p1 > 12) { d = p1; m = p2; } else if (p2 > 12) { m = p1; d = p2; } else { d = p1; m = p2; } }
                if (y && m && d) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            }
            return str; 
        }

        function extractYYYYMM(dateVal) {
            const fullDate = formatToYYYYMMDD(dateVal);
            if (fullDate && /^\d{4}-\d{2}/.test(fullDate)) return fullDate.substring(0, 7);
            return null;
        }

        function formatToMonthText(yyyy_mm) {
            if (!yyyy_mm) return '<span class="text-gray-300 dark:text-slate-600">-</span>';
            const [y, m] = yyyy_mm.split('-');
            const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return `<span class="font-black text-gray-800 dark:text-gray-200 tracking-wide">${meses[parseInt(m)-1]} <span class="text-orange-500">${y}</span></span>`;
        }
        function getMonthNameShort(yyyy_mm) {
            if(!yyyy_mm) return 'Sin Fecha';
            const [y, m] = yyyy_mm.split('-');
            const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return `${meses[parseInt(m)-1]} ${y}`;
        }

        // ==========================================
        // PARSEO ROBUSTO A PRUEBA DE BALAS LATAM
        // ==========================================
        function robustParseFloat(val) {
            if (val === null || val === undefined || val === '') return 0;
            if (typeof val === 'number') return val;
            
            let str = String(val).trim();
            // Quitar todo lo que no sea número, coma, punto o signo negativo
            str = str.replace(/[^\d.,-]/g, '');
            
            // Si el texto trae punto Y coma (Ej: 1.234,56 o 1,234.56)
            if (str.includes('.') && str.includes(',')) {
                if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
                    // La coma va al último (formato 1.234,56)
                    str = str.replace(/\./g, '').replace(',', '.');
                } else {
                    // El punto va al último (formato 1,234.56)
                    str = str.replace(/,/g, '');
                }
            } 
            // Si solo trae comas (Ej: 1234,56 o 1,234)
            else if (str.includes(',')) {
                if (str.match(/,\d{1,2}$/)) {
                    // Termina en 1 o 2 dígitos, asumimos que son decimales
                    str = str.replace(',', '.');
                } else {
                    // Es un separador de miles
                    str = str.replace(/,/g, '');
                }
            } 
            // Si solo trae puntos (Ej: 1.234 o 1234.56)
            else if (str.includes('.')) {
                // Si termina exactamente en 3 dígitos (Ej: 1.000) lo más seguro es que en LATAM sean miles
                if (str.match(/\.\d{3}$/)) {
                    str = str.replace(/\./g, '');
                }
            }
            
            let parsed = parseFloat(str);
            return isNaN(parsed) ? 0 : parsed;
        }

        import { supabase } from '../services/supabase.js';
        let supabaseClient = supabase;

        const COLUMNAS_EXCEL = [
            "HONORARIOS AGENCIA", "CARPETA P/ ARCHIVO", "GASTOS EN DESPACHO", "FOTOCOPIAS LEGALIZADAS",
            "VERIFICACION Y ETIQUETADO", "REGULARIZACION DESP. ANTICIPAD", "ITEMS DECLARADOS EN DIM Y DAV",
            "DESPACHO ADUANA FRONTERA", "SERVICIO LOGISTICO", "FORMULARIO DAM", "OTROS SERVICIOS",
            "FORMULARIO RITEX", "SERV. DE TRAM. SENASAG/UNALAB", "INGRESO Y RECOJO TRAM. SENASAG",
            "TOTAL FACTURA", "GRAVAMEN ARANCELARIO", "IMPUESTO AL VALOR AGREGADO", "IMP. AL CONSUMO. ESPCIFICO",
            "IMP.  ESP. A LOS HIDROCARBUROS", "FORMULARIO DIGITAL", "IMP. AL CON. ESPEC. AL DEPORTE",
            "LEVANTAMIENTO DE ABANDONO", "CAM. IND. Y COM..", "RECOJO GUIA", "EMISION CERTIFICADO",
            "TRANSPORTE LOCAL", "ALMACENAJE DAB", "GASTOS PUERTO", "SENASAG", "AGEMED",
            "ALMACENAJE ALBO VILLAZON", "PERMISO E INSPECCION SENASAG", "IBNORCA/IBMETRO", "INSPECCION PREVIA",
            "ESCANEO DE FACTURAS", "CONTRAVENCIONES", "ALMACENAJE ALBO", "PAGO PRIMA DE SEGURO",
            "SERV. TRANSPORTE", "REINTERGO GA", "REINTEGRO IVA", "REINTEGRO ICE", "CARGUIO Y DESCARGUIO",
            "TRAMITE SENASAG VILLAZON", "LIBERACION CONTENEDOR", "TRAMITE SENASAG", "FLETE MARITIMO",
            "EMISION DE B/L", "SOBREESTADÍAS", "DEPOSITO ESPECIAL", "TRAMITES ADUANA", "ANALISIS LABORATORIO",
            "GTO PUERTO - ASPB", "GTOS DE LOGISTICA", "COMISION BANCO-LIBERACION", "SERV CARGUIO Y DESCARGUIO",
            "SEGURO()", "PROLECHE", "INSPECCION SENASAG", "TOTAL PLANILLA"
        ];

        function sanitizarColumna(nombre) {
            if(!nombre) return "";
            return nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                         .replace(/[\/\(\)\.\-]/g, ' ').trim().replace(/\s+/g, '_');
        }

        const mapColumnas = COLUMNAS_EXCEL.map(col => ({ excel: col, db: sanitizarColumna(col) }));

        let tramitesDB = []; 
        let gastosGuardados = []; 
        let reporteUnificadoDB = []; 
        let historialMineraDB = []; 
        let controlEstadosDB = [];
        let mtodoDB = [];
        let datosExcel = []; 
        let dataAInsertar = []; 
        let currentStatusFilter = 'ALL';
        let showDetails = false;
        let currentPage = 1;
        let rowsPerPage = 20;

        async function inicializarPlanillaGastos() {
            dibujarCabeceras();
            setupDragAndDrop();
            
            // Debounce en búsqueda: espera 250ms después de dejar de escribir
            let _searchDebounce = null;
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    clearTimeout(_searchDebounce);
                    _searchDebounce = setTimeout(() => { currentPage = 1; renderTable(); }, 250);
                });
            }
            const clientFilter = document.getElementById('clientFilter');
            if (clientFilter) clientFilter.addEventListener('change', () => { currentPage = 1; renderTable(); });
            const monthAceptacionFilter = document.getElementById('monthAceptacionFilter');
            if (monthAceptacionFilter) monthAceptacionFilter.addEventListener('change', () => { currentPage = 1; renderTable(); });
            const monthFacturaFilter = document.getElementById('monthFacturaFilter');
            if (monthFacturaFilter) monthFacturaFilter.addEventListener('change', () => { currentPage = 1; renderTable(); });
            const aduanaFilter = document.getElementById('aduanaFilter');
            if (aduanaFilter) aduanaFilter.addEventListener('change', () => { currentPage = 1; renderTable(); });
            
            await cargarDatosBD();
            suscribirTiempoReal();
        }
        if (document.readyState === 'loading') {
            document.addEventListener("DOMContentLoaded", inicializarPlanillaGastos);
        } else {
            inicializarPlanillaGastos();
        }

        // ==========================================
        let realtimeChannel = null;
        function suscribirTiempoReal() {
            if(!supabaseClient || realtimeChannel) return;

            // Mostramos el indicador de conexión
            const liveIndicator = document.getElementById('liveIndicator');
            if (liveIndicator) {
                liveIndicator.classList.remove('hidden');
                liveIndicator.classList.add('flex');
            }

            realtimeChannel = supabaseClient.channel('mexican-realtime-channel')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_importacion' }, payload => {
                    manejarCambioRealtime(payload, gastosGuardados, 'n_referencia', 'Gastos');
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'importaciones' }, payload => {
                    manejarCambioRealtime(payload, tramitesDB, 'n_referencia', 'Importaciones');
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'reporte_unificado_data' }, payload => {
                    manejarCambioRealtime(payload, reporteUnificadoDB, 'n_referencia', 'Reporte Unificado');
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'control_estados_importacion' }, payload => {
                    manejarCambioRealtime(payload, controlEstadosDB, 'n_referencia', 'Control de Estados');
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'mtodo' }, payload => {
                    manejarCambioRealtime(payload, mtodoDB, 'interno', 'mtodo');
                })
                .subscribe((status) => {
                    const liveDot = document.getElementById('liveDot');
                    const liveText = document.getElementById('liveText');
                    if (status === 'SUBSCRIBED') {
                        if (liveDot) {
                            liveDot.classList.add('bg-orange-500', 'animate-pulse-glow');
                            liveDot.classList.remove('bg-gray-400');
                        }
                        if (liveText) {
                            liveText.innerText = 'EN VIVO';
                            liveText.classList.add('text-orange-600', 'dark:text-orange-400');
                        }
                    } else {
                        if (liveDot) {
                            liveDot.classList.remove('bg-orange-500', 'animate-pulse-glow');
                            liveDot.classList.add('bg-gray-400');
                        }
                        if (liveText) {
                            liveText.innerText = 'DESCONECTADO';
                            liveText.classList.remove('text-orange-600', 'dark:text-orange-400');
                        }
                    }
                });
        }

        function desuscribirTiempoReal() {
            if (realtimeChannel && supabaseClient) {
                supabaseClient.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
        }

        window.addEventListener('beforeunload', desuscribirTiempoReal);
        window.addEventListener('pagehide', desuscribirTiempoReal);

        function manejarCambioRealtime(payload, arrayRef, keyName, tableName) {
            const { eventType, new: newRec, old: oldRec } = payload;
            let refActualizada = '';

            if (eventType === 'INSERT' || eventType === 'UPDATE') {
                const idx = arrayRef.findIndex(item => item[keyName] === newRec[keyName]);
                if (idx >= 0) arrayRef[idx] = newRec;
                else arrayRef.push(newRec);
                refActualizada = newRec[keyName] || 'Nuevo Registro';
            } else if (eventType === 'DELETE') {
                const idx = arrayRef.findIndex(item => item[keyName] === oldRec[keyName]);
                if (idx >= 0) arrayRef.splice(idx, 1);
                refActualizada = oldRec[keyName] || 'Registro Eliminado';
            }

            // Reconstruir hashmaps para mantener lookups O(1) actualizados
            _reconstruirHashmaps();
            poblarFiltros();
            renderTable();

            // Destello visual en la tabla para que se note el cambio
            const tableContainer = document.getElementById('viewTable');
            tableContainer.classList.add('flash-update');
            setTimeout(() => tableContainer.classList.remove('flash-update'), 1500);

            // Toast de notificación
            showToast(`Datos actualizados: <strong>${tableName}</strong><br><span class="text-xs opacity-75">Ref: ${refActualizada}</span>`, false, 'DATOS EN VIVO');
        }

        // ==========================================
        // DIBUJADO DE CABECERAS Y TABLA
        // ==========================================
        function dibujarCabeceras() {
            let html = `
                <th scope="col" class="px-6 py-4 sticky left-0 z-20 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur font-black tracking-widest text-slate-800 dark:text-slate-200">No. Referencia</th>
                <th scope="col" class="px-6 py-4 font-bold tracking-widest">Mes Aceptación</th>
                <th scope="col" class="px-6 py-4 font-bold tracking-widest">Mes Factura</th>
                <th scope="col" class="px-6 py-4 font-bold tracking-widest">Declaración</th>
                <th scope="col" class="px-6 py-4 max-w-[200px] font-bold tracking-widest">Cliente</th>
                <th scope="col" class="px-6 py-4 text-center font-bold tracking-widest">Estado</th>
            `;
            COLUMNAS_EXCEL.forEach(col => {
                const isTotal = (col === "TOTAL FACTURA" || col === "TOTAL PLANILLA");
                if (!showDetails && !isTotal) return; 
                
                let extraClass = isTotal ? "text-slate-800 dark:text-slate-200 font-black bg-slate-200/60 dark:bg-slate-800/70 tracking-wider shadow-inner" : "font-bold tracking-wide";
                html += `<th scope="col" class="px-6 py-4 text-right ${extraClass}">${col}</th>`;
            });
            document.getElementById('dynamicHeaders').innerHTML = html;
        }

        function toggleDetails() {
            showDetails = !showDetails;
            const btn = document.getElementById('btnToggleDetails');
            if (showDetails) {
                btn.innerHTML = '<i class="fas fa-eye-slash mr-2 text-white"></i>Ocultar Desglose';
                btn.className = "bg-[#0c0c0e] hover:bg-[#16203a] text-white px-6 py-3 rounded-xl text-sm font-black transition-all w-full md:w-auto border border-slate-700/50 shadow-lg hover:-translate-y-1 shrink-0 flex items-center justify-center tracking-wide";
            } else {
                btn.innerHTML = '<i class="fas fa-eye mr-2 text-[#0c0c0e] dark:text-slate-350 group-hover:scale-110 transition-transform"></i>Ver Desglose';
                btn.className = "bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-600/80 text-gray-700 dark:text-slate-300 px-6 py-3 rounded-xl text-sm font-bold transition-all w-full md:w-auto shrink-0 shadow-sm hover:shadow-lg flex items-center justify-center group tracking-wide";
            }
            dibujarCabeceras();
            renderTable();      
        }

        // ==========================================
        // HASHMAPS PARA LOOKUPS O(1) EN LUGAR DE O(n)
        // ==========================================
        let _gastosMap = {};       // n_referencia -> gasto row
        let _reporteMap = {};      // n_referencia -> reporte row
        let _datosExcelMap = {};   // tramite -> excel row
        let _historialMineraMap = {}; // interno -> minera row
        let _controlMap = {};      // n_referencia -> control row
        let _mtodoMap = {};        // interno -> mtodo row
        let _mesAcepCache = {};    // fecha_aceptacion -> YYYY-MM
        let _mesFacCache = {};     // fecha_factura -> YYYY-MM

        function normalizeReferencia(ref) {
            if (!ref) return '';
            let clean = String(ref).trim().toUpperCase();
            const match = clean.match(/^0*(\d+)-(\d+)$/);
            if (match) {
                return `${match[1]}-${match[2]}`;
            }
            return clean;
        }

        function _reconstruirHashmaps() {
            _gastosMap = {};
            gastosGuardados.forEach(g => {
                if (g.n_referencia) {
                    _gastosMap[normalizeReferencia(g.n_referencia)] = g;
                }
            });
            _reporteMap = {};
            reporteUnificadoDB.forEach(r => {
                if (r.n_referencia) {
                    _reporteMap[normalizeReferencia(r.n_referencia)] = r;
                }
            });
            _datosExcelMap = {};
            datosExcel.forEach(e => {
                if (e["TRAMITE"]) {
                    _datosExcelMap[normalizeReferencia(e["TRAMITE"])] = e;
                }
            });
            _historialMineraMap = {};
            historialMineraDB.forEach(h => {
                if (h.interno) {
                    _historialMineraMap[normalizeReferencia(h.interno)] = h;
                }
            });
            _controlMap = {};
            controlEstadosDB.forEach(c => {
                if (c.n_referencia) {
                    _controlMap[normalizeReferencia(c.n_referencia)] = c;
                }
            });
            _mtodoMap = {};
            mtodoDB.forEach(m => {
                if (m.interno) {
                    _mtodoMap[normalizeReferencia(m.interno)] = m;
                }
            });
            _mesAcepCache = {};
            _mesFacCache = {};
        }

        function evaluarCompletitudTramite(tramite, statusInfo, excelInfo, mineraHistInfo, reporteInfo, ctrlInfo, mtodoInfo) {
            const isMinera = tramite.razon_social && tramite.razon_social.toUpperCase().includes("MINERA SAN CRISTOBAL");
            let totPlanillaFila = 0;
            let totFacturaFila = 0;

            if (excelInfo) {
                totPlanillaFila = parseFloat(excelInfo["TOTAL PLANILLA"]) || 0;
                totFacturaFila = parseFloat(excelInfo["TOTAL FACTURA"]) || 0;
            } else {
                if (statusInfo) {
                    totPlanillaFila = Math.max(totPlanillaFila, parseFloat(statusInfo["total_planilla"]) || 0);
                    totFacturaFila = Math.max(totFacturaFila, parseFloat(statusInfo["total_factura"]) || 0);
                }
                if (ctrlInfo) {
                    totPlanillaFila = Math.max(totPlanillaFila, parseFloat(ctrlInfo.total_planilla) || 0);
                    totFacturaFila = Math.max(totFacturaFila, parseFloat(ctrlInfo.total_factura) || 0);
                }
                if (mtodoInfo) {
                    totPlanillaFila = Math.max(totPlanillaFila, parseFloat(mtodoInfo.debito_excel) || 0);
                    const mtodoFactura = (parseFloat(mtodoInfo.albo_monto) || 0) + 
                                         (parseFloat(mtodoInfo.ip_monto) || 0) + 
                                         (parseFloat(mtodoInfo.guias_monto) || 0) + 
                                         (parseFloat(mtodoInfo.puertos_monto) || 0) + 
                                         (parseFloat(mtodoInfo.otros_monto) || 0) + 
                                         (parseFloat(mtodoInfo.comision_bob) || 0);
                    totFacturaFila = Math.max(totFacturaFila, mtodoFactura);
                }
                if (isMinera) {
                    if (mineraHistInfo && parseFloat(mineraHistInfo.debito_excel) > 0) {
                        totPlanillaFila = Math.max(totPlanillaFila, parseFloat(mineraHistInfo.debito_excel) || 0);
                    }
                    if (reporteInfo) {
                        if (parseFloat(reporteInfo.total_gastos_logistica) > 0) {
                            totPlanillaFila = Math.max(totPlanillaFila, parseFloat(reporteInfo.total_gastos_logistica) || 0);
                        }
                        const repComision = parseFloat(reporteInfo.comision || reporteInfo.comisiones || reporteInfo.comision_banco || reporteInfo.comision_agencia || 0) || 0;
                        totFacturaFila = Math.max(totFacturaFila, repComision);
                    }
                }
            }

            let isComplete = false;
            if (totFacturaFila > 0 || totPlanillaFila > 0 || !!excelInfo) {
                isComplete = true;
            } else if (ctrlInfo && (ctrlInfo.estado_general === 'COMPLETO' || ctrlInfo.estado_general === 'LISTO' || ctrlInfo.estado_factura === 'COMPLETO')) {
                isComplete = true;
            }

            return { totPlanillaFila, totFacturaFila, isComplete };
        }

        // Wrapper extractYYYYMM con caché para evitar recalcular 707 veces
        const _origExtractYYYYMM = extractYYYYMM;
        function extractYYYYMMCached(val) {
            if (!val) return null;
            const key = String(val);
            if (_mesAcepCache[key] !== undefined) return _mesAcepCache[key];
            const result = _origExtractYYYYMM(val);
            _mesAcepCache[key] = result;
            return result;
        }

        async function fetchAll(table, select = '*', orderCol = null, limit = 1000) {
            let allData = [];
            let offset = 0;
            let page = 0;
            const MAX_PAGES = 50;
            while (page < MAX_PAGES) {
                page++;
                let query = supabaseClient.from(table).select(select);
                if (orderCol) {
                    query = query.order(orderCol, { ascending: false });
                }
                const { data, error } = await query.range(offset, offset + limit - 1);
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
        }

        async function fetchWithCache(table, selectCols = '*', orderCol = null, primaryKey = 'n_referencia') {
            const cacheKey = `cache_table_${table}`;
            const syncKey = `cache_sync_${table}`;
            let cachedData = [];
            let lastSync = localStorage.getItem(syncKey) || null;

            try {
                const raw = localStorage.getItem(cacheKey);
                if (raw) cachedData = JSON.parse(raw) || [];
            } catch (e) {
                console.warn(`Error al leer cache de ${table}:`, e);
            }

            let fetchedData = [];
            let offset = 0;
            let page = 0;
            const MAX_PAGES = 50;
            const limit = 1000;
            const isIncremental = (cachedData.length > 0 && !!lastSync);
            const syncTimestamp = new Date().toISOString();

            while (page < MAX_PAGES) {
                page++;
                let query = supabaseClient.from(table).select(selectCols);
                if (orderCol) {
                    query = query.order(orderCol, { ascending: false });
                }
                if (isIncremental) {
                    query = query.gt('updated_at', lastSync);
                }

                const { data, error } = await query.range(offset, offset + limit - 1);
                if (error) {
                    console.error(`Error en fetchWithCache ${table} (offset ${offset}):`, error);
                    break;
                }

                if (!data || data.length === 0) break;
                fetchedData.push(...data);
                if (data.length < limit) break;
                offset += limit;
            }

            let finalData = [];
            if (isIncremental) {
                if (fetchedData.length > 0) {
                    const map = new Map();
                    cachedData.forEach(item => {
                        const k = item[primaryKey] || item.id;
                        if (k) map.set(String(k).trim().toUpperCase(), item);
                    });
                    fetchedData.forEach(item => {
                        const k = item[primaryKey] || item.id;
                        if (k) map.set(String(k).trim().toUpperCase(), item);
                    });
                    finalData = Array.from(map.values());
                } else {
                    finalData = cachedData;
                }
            } else {
                finalData = fetchedData.length > 0 ? fetchedData : cachedData;
            }

            try {
                if (finalData.length > 0) {
                    localStorage.setItem(cacheKey, JSON.stringify(finalData));
                    localStorage.setItem(syncKey, syncTimestamp);
                }
            } catch (eStorage) {
                console.warn(`Error al guardar LocalStorage ${table}:`, eStorage);
            }

            return finalData;
        }

        async function cargarDatosBD() {
            if(!supabaseClient) return;
            try {
                // Cargar importaciones primero de forma paginada para mostrar la tabla rápido
                tramitesDB = await fetchAll('importaciones', 'n_declaracion, n_referencia, razon_social, fecha_aceptacion, modalidad', 'id');

                // Poblar filtros y mostrar tabla sin gastos (aparece rápido)
                poblarFiltros();
                renderTable();

                // Luego cargar el resto en paralelo con paginación optimizando columnas y usando caché local
                const [gasData, repData, histData, ctrlData, mtodoData] = await Promise.all([
                    fetchAll('gastos_importacion', 'n_referencia, n_declaracion, fecha_factura, honorarios_agencia, carpeta_p_archivo, gastos_en_despacho, fotocopias_legalizadas, verificacion_y_etiquetado, regularizacion_desp_anticipad, items_declarados_en_dim_y_dav, despacho_aduana_frontera, servicio_logistico, formulario_dam, otros_servicios, formulario_ritex, serv_de_tram_senasag_unalab, ingreso_y_recojo_tram_senasag, total_factura, total_planilla'),
                    fetchAll('reporte_unificado_data', 'n_referencia, dim_id, total_gastos_logistica, comision, comisiones, comision_banco, comision_agencia'),
                    fetchAll('historial_datos_minera', 'interno, debito_excel, fecha_excel'),
                    fetchWithCache('control_estados_importacion', 'n_referencia, total_planilla, total_factura, estado_general, estado_factura, canal, fecha_canal, updated_at', null, 'n_referencia'),
                    fetchAll('mtodo', 'interno, debito_excel, albo_monto, ip_monto, guias_monto, puertos_monto, otros_monto, comision_bob')
                ]);

                gastosGuardados = gasData || [];
                reporteUnificadoDB = repData || [];
                historialMineraDB = histData || [];
                controlEstadosDB = ctrlData || [];
                mtodoDB = mtodoData || [];

                // Reconstruir hashmaps y re-renderizar con datos completos
                _reconstruirHashmaps();
                poblarFiltros();
                renderTable();

            } catch (err) {
                console.error("Error de carga:", err);
                showToast("Error de conexión a la BD.", true);
            }
        }

        function poblarFiltros() {
            const selectCli = document.getElementById('clientFilter');
            const selectedClients = Array.from(selectCli.selectedOptions).map(opt => opt.value);
            const clientes = [...new Set(tramitesDB.map(t => t.razon_social).filter(Boolean))].sort();
            // Usar join en vez de += innerHTML (10x más rápido)
            selectCli.innerHTML = '<option value="ALL">Todos los clientes</option>' +
                clientes.map(c => `<option value="${c}">${c}</option>`).join('');
                
            Array.from(selectCli.options).forEach(opt => {
                opt.selected = selectedClients.includes(opt.value);
            });
            if (selectCli.selectedOptions.length === 0) {
                selectCli.options[0].selected = true;
            } 

            const selectMesAcep = document.getElementById('monthAceptacionFilter');
            const currentAcep = selectMesAcep.value;
            const mesesAcep = [...new Set(tramitesDB.map(t => extractYYYYMMCached(t.fecha_aceptacion)).filter(Boolean))].sort().reverse();
            selectMesAcep.innerHTML = '<option value="ALL">Mes Aceptación (Todos)</option>' +
                mesesAcep.map(m => `<option value="${m}">${getMonthNameShort(m)}</option>`).join('');
            selectMesAcep.value = currentAcep;

            const selectMesFact = document.getElementById('monthFacturaFilter');
            const currentFact = selectMesFact.value;
            const facturasBD = gastosGuardados.map(g => extractYYYYMMCached(g.fecha_factura));
            const facturasEx = datosExcel.map(e => extractYYYYMMCached(e["FECHA FACTURA"]));
            const mesesFact = [...new Set([...facturasBD, ...facturasEx].filter(Boolean))].sort().reverse();
            
            selectMesFact.innerHTML = '<option value="ALL">Mes Factura (Todos)</option>' +
                mesesFact.map(m => `<option value="${m}">${getMonthNameShort(m)}</option>`).join('');
            selectMesFact.value = currentFact;

            // Obtener códigos de aduana únicos y poblar aduanaFilter dynamically
            const selectAduana = document.getElementById('aduanaFilter');
            if (selectAduana) {
                const selectedAduanas = Array.from(selectAduana.selectedOptions).map(opt => opt.value);
                const aduanas = [...new Set(tramitesDB.map(t => obtenerCodigoAduana(t.n_declaracion)).filter(Boolean))].sort();
                
                selectAduana.innerHTML = '<option value="ALL">Todas las aduanas</option>' +
                    aduanas.map(ad => `<option value="${ad}">${ad}</option>`).join('');
                
                Array.from(selectAduana.options).forEach(opt => {
                    opt.selected = selectedAduanas.includes(opt.value);
                });
                if (selectAduana.selectedOptions.length === 0) {
                    selectAduana.options[0].selected = true;
                }
            }

            initOrUpdateCustomSelect('clientFilter', 'fas fa-user-tie');
            initOrUpdateCustomSelect('aduanaFilter', 'fa-solid fa-list-check');
            initOrUpdateCustomSelect('monthAceptacionFilter', 'fas fa-calendar-check');
            initOrUpdateCustomSelect('monthFacturaFilter', 'fas fa-file-invoice');
        }

        function setStatusFilter(status) {
            currentStatusFilter = status;
            ['btnFilterAll', 'btnFilterPend', 'btnFilterComp'].forEach(id => {
                document.getElementById(id).className = 'tab-btn tab-inactive-light dark:tab-inactive-dark hover:text-gray-900 dark:hover:text-white flex-1 md:flex-none px-6 py-2 rounded-lg text-sm transition-colors flex items-center justify-center font-bold';
            });
            let activeId = status === 'ALL' ? 'btnFilterAll' : (status === 'PENDIENTE' ? 'btnFilterPend' : 'btnFilterComp');
            document.getElementById(activeId).className = 'tab-btn tab-active flex-1 md:flex-none px-6 py-2 rounded-lg text-sm flex items-center justify-center font-bold tracking-wide';
            currentPage = 1;
            renderTable();
        }

        function changeRowsPerPage(val) {
            rowsPerPage = parseInt(val);
            currentPage = 1;
            renderTable();
        }

        function goToPage(page) {
            currentPage = page;
            renderTable();
        }

        // ==========================================
        // DEBOUNCE: evita re-renderizar en cada tecla
        // ==========================================
        let _renderTimer = null;
        function renderTable() {
            if (_renderTimer) cancelAnimationFrame(_renderTimer);
            _renderTimer = requestAnimationFrame(_renderTableCore);
        }

        function obtenerCodigoAduana(declaracion) {
            if (!declaracion) return null;
            const parts = String(declaracion).trim().split('-');
            if (parts.length >= 3 && parts[2].length === 3) {
                return parts[2];
            }
            return null;
        }

        function filterAduanaChanged() {
            renderTable();
        }

        let _aduanasCollapsed = false;
        window.toggleAduanasCheckboxes = function() {
            _aduanasCollapsed = !_aduanasCollapsed;
            const container = document.getElementById('aduanaCheckboxesContainer');
            const icon = document.getElementById('toggleAduanasIcon');
            const text = document.getElementById('toggleAduanasText');
            if (container && icon && text) {
                if (_aduanasCollapsed) {
                    container.classList.add('max-w-0', 'opacity-0', 'pointer-events-none');
                    container.classList.remove('max-w-[60vw]', 'lg:max-w-[40vw]', 'opacity-100');
                    icon.className = 'fas fa-chevron-right';
                    text.innerText = 'Mostrar';
                } else {
                    container.classList.remove('max-w-0', 'opacity-0', 'pointer-events-none');
                    container.classList.add('max-w-[60vw]', 'lg:max-w-[40vw]', 'opacity-100');
                    icon.className = 'fas fa-chevron-left';
                    text.innerText = 'Ocultar';
                }
            }
        };

        let _filtersCollapsed = false;
        window.toggleFiltersPanel = function() {
            _filtersCollapsed = !_filtersCollapsed;
            const fp = document.getElementById('filtersPanel');
            const ap = document.getElementById('aduanaAndStatsPanel');
            const icon = document.getElementById('toggleFiltersIcon');
            const text = document.getElementById('toggleFiltersText');
            if (fp && ap && icon && text) {
                if (_filtersCollapsed) {
                    fp.classList.add('collapsed');
                    ap.classList.add('collapsed');
                    icon.className = 'fas fa-filter text-gray-400';
                    text.innerText = 'Mostrar Filtros';
                } else {
                    fp.classList.remove('collapsed');
                    ap.classList.remove('collapsed');
                    icon.className = 'fas fa-filter-circle-xmark text-orange-500 dark:text-orange-400';
                    text.innerText = 'Filtros';
                }
            }
        };

        function _renderTableCore() {
            const tbody = document.getElementById('tableBody');
            const term = document.getElementById('searchInput').value.toLowerCase();
            
            // Filtro múltiple de clientes
            const clientSelect = document.getElementById('clientFilter');
            const selectedClients = Array.from(clientSelect.selectedOptions).map(opt => opt.value);
            const isAllClients = selectedClients.length === 0 || selectedClients.includes('ALL');

            // Filtro múltiple de aduanas
            const aduanaSelect = document.getElementById('aduanaFilter');
            const selectedAduanas = aduanaSelect ? Array.from(aduanaSelect.selectedOptions).map(opt => opt.value) : [];
            const isAllAduanas = selectedAduanas.length === 0 || selectedAduanas.includes('ALL');

            const monthAcepVal = document.getElementById('monthAceptacionFilter').value;
            const monthFactVal = document.getElementById('monthFacturaFilter').value;
            
            let rows = [];
            let countMatches = 0;
            let totalPlanillaGeneral = 0;
            let totalFacturaGeneral = 0;
            
            lastFilteredData = [];

            // 1. Calcular contadores de faltantes por cliente (aplicando filtros de mes y aduana solamente)
            let clientFaltantes = {};
            let totalF = 0;

            tramitesDB.forEach(tramite => {
                // Filtro de mes aceptación
                const rowMesAcep = extractYYYYMMCached(tramite.fecha_aceptacion);
                if (monthAcepVal !== 'ALL' && rowMesAcep !== monthAcepVal) return;

                // Filtro de aduana
                if (!isAllAduanas) {
                    const adCode = obtenerCodigoAduana(tramite.n_declaracion);
                    if (!adCode || !selectedAduanas.includes(adCode)) return;
                }

                // Evaluar completitud
                const rowRefClean = normalizeReferencia(tramite.n_referencia);
                const statusInfo = _gastosMap[rowRefClean] || null;
                const excelInfo = _datosExcelMap[rowRefClean] || null;
                const mineraHistInfo = _historialMineraMap[rowRefClean] || null;
                const reporteInfo = _reporteMap[rowRefClean] || null;
                const ctrlInfo = _controlMap[rowRefClean] || null;
                const mtodoInfo = _mtodoMap[rowRefClean] || null;

                const { isComplete } = evaluarCompletitudTramite(tramite, statusInfo, excelInfo, mineraHistInfo, reporteInfo, ctrlInfo, mtodoInfo);

                if (!isComplete) {
                    totalF++;
                    const cliName = tramite.razon_social || 'Sin Cliente';
                    clientFaltantes[cliName] = (clientFaltantes[cliName] || 0) + 1;
                }
            });

            // 2. Renderizar botones dinámicos de clientes
            const sortedClients = Object.entries(clientFaltantes).sort((a, b) => b[1] - a[1]);
            let htmlButtons = `
                <span class="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <i class="fa-solid fa-clock-rotate-left text-amber-500 animate-pulse"></i> Faltantes por Cliente:
                </span>
            `;

            const isTotalActive = isAllClients;
            const totalClass = isTotalActive 
                ? 'bg-amber-500/20 hover:bg-amber-500/35 border-amber-500 text-amber-700 dark:text-amber-300 font-extrabold shadow' 
                : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold';
            
            htmlButtons += `
                <button onclick="selectClientFromStats('ALL')" class="${totalClass} px-3 py-1 rounded-xl border text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                    <span>Total:</span>
                    <span class="text-sm font-extrabold">${totalF}</span>
                </button>
            `;

            sortedClients.forEach(([cliName, count]) => {
                const isClientActive = (!isAllClients && selectedClients.includes(cliName));
                const btnClass = isClientActive 
                    ? 'bg-orange-500/20 hover:bg-orange-500/35 border-orange-500 text-orange-600 dark:text-orange-300 font-extrabold shadow' 
                    : 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-500 dark:text-orange-400 font-bold';
                
                const displayName = cliName.length > 22 ? cliName.substring(0, 22) + '...' : cliName;
                
                htmlButtons += `
                    <button onclick="selectClientFromStats('${cliName.replace(/'/g, "\\'")}')" class="${btnClass} px-3 py-1 rounded-xl border text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap" title="${cliName}">
                        <span>${displayName}:</span>
                        <span class="text-sm font-extrabold">${count}</span>
                    </button>
                `;
            });

            const container = document.getElementById('dynamicFaltantesContainer');
            if (container) {
                container.innerHTML = htmlButtons;
            }

            // 3. Renderizar filas de la tabla
            tramitesDB.forEach(tramite => {
                if (term && !`${tramite.n_declaracion} ${tramite.n_referencia} ${tramite.razon_social}`.toLowerCase().includes(term)) return;
                if (!isAllClients && !selectedClients.includes(tramite.razon_social)) return;
                
                // Usar caché para extractYYYYMM
                const rowMesAcep = extractYYYYMMCached(tramite.fecha_aceptacion);
                if (monthAcepVal !== 'ALL' && rowMesAcep !== monthAcepVal) return;

                // Filtro de Aduanas
                if (!isAllAduanas) {
                    const adCode = obtenerCodigoAduana(tramite.n_declaracion);
                    if (!adCode || !selectedAduanas.includes(adCode)) return;
                }

                // LOOKUP O(1) con hashmap en vez de .find() O(n)
                const rowRefClean = normalizeReferencia(tramite.n_referencia);
                const statusInfo = _gastosMap[rowRefClean] || null;
                const excelInfo = _datosExcelMap[rowRefClean] || null;
                const mineraHistInfo = _historialMineraMap[rowRefClean] || null;
                const reporteInfo = _reporteMap[rowRefClean] || null;
                const ctrlInfo = _controlMap[rowRefClean] || null;
                const mtodoInfo = _mtodoMap[rowRefClean] || null;
                
                const rowFechaFacturaRaw = excelInfo ? excelInfo["FECHA FACTURA"] : (statusInfo ? statusInfo.fecha_factura : (mineraHistInfo ? mineraHistInfo.fecha_excel : null));
                const rowMesFact = extractYYYYMMCached(rowFechaFacturaRaw);
                if (monthFactVal !== 'ALL' && rowMesFact !== monthFactVal) return;

                const isMinera = tramite.razon_social && tramite.razon_social.toUpperCase().includes("MINERA SAN CRISTOBAL");
                const isNewFromExcel = !!excelInfo;

                let desgloseFila = {};
                const { totPlanillaFila, totFacturaFila, isComplete } = evaluarCompletitudTramite(tramite, statusInfo, excelInfo, mineraHistInfo, reporteInfo, ctrlInfo, mtodoInfo);

                if (currentStatusFilter === 'PENDIENTE' && isComplete) return;
                if (currentStatusFilter === 'COMPLETO' && !isComplete) return;

                countMatches++;

                let trClass = 'table-row-hover hover:bg-white dark:hover:bg-slate-800/80 group';
                if(isNewFromExcel) trClass += ' bg-blue-50/60 dark:bg-blue-900/30';

                let badge = '';
                if(isComplete) {
                    badge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-500/10 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-full text-xs font-black ring-1 ring-inset ring-emerald-500/30 shadow-sm"><i class="fas fa-check-circle"></i> LISTO</span>`;
                } else {
                    badge = `
                    <div class="relative group/badge inline-block">
                        <button onclick="marcarComoListoManual('${tramite.n_referencia}')" class="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full text-xs font-black ring-1 ring-inset ring-amber-500/30 shadow-sm transition-all cursor-pointer" title="Clic para marcar como LISTO manualmente">
                            <i class="fas fa-clock"></i> FALTAN
                            <i class="fas fa-edit ml-1 opacity-0 group-hover/badge:opacity-100 transition-opacity"></i>
                        </button>
                    </div>`;
                }

                // Texto de mes pre-renderizado O(1)
                const mesAcepTxt = formatToMonthText(rowMesAcep);
                const mesFactTxt = formatToMonthText(rowMesFact);

                let row = `<tr class="transition-colors border-b border-gray-100/50 dark:border-slate-700/30 ${trClass}">
                        <td class="px-6 py-4 sticky left-0 z-20 font-black text-slate-800 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl group-hover:bg-transparent transition-colors border-r border-gray-100/50 dark:border-slate-700/30 shadow-[4px_0_15px_-5px_rgba(0,0,0,0.08)]">${tramite.n_referencia}</td>
                        <td class="px-6 py-4 text-gray-700 dark:text-slate-300">${mesAcepTxt}</td>
                        <td class="px-6 py-4 text-gray-700 dark:text-slate-300">${mesFactTxt}</td>
                        <td class="px-6 py-4 text-gray-700 dark:text-slate-300 font-bold">${tramite.n_declaracion || '<span class="text-gray-400">S/D</span>'}</td>
                        <td class="px-6 py-4 text-gray-800 dark:text-slate-200 truncate max-w-[200px] font-bold" title="${tramite.razon_social || ''}">${tramite.razon_social || '-'}</td>
                        <td class="px-6 py-4 text-center">${badge}</td>`;
                
                // LOOKUP O(1) para Minera
                let comisionExtraParaMinera = 0;
                if (isMinera && reporteInfo) {
                    comisionExtraParaMinera = parseFloat(reporteInfo.comision || reporteInfo.comisiones || reporteInfo.comision_banco || reporteInfo.comision_agencia || 0) || 0;
                }

                mapColumnas.forEach(map => {
                    let val = 0;
                    if (isNewFromExcel) {
                        val = parseFloat(excelInfo[map.excel]) || 0;
                    } else if (map.excel === "TOTAL FACTURA" && ctrlInfo) {
                        val = parseFloat(ctrlInfo.total_factura) || 0;
                    } else if (map.excel === "TOTAL PLANILLA" && ctrlInfo) {
                        val = parseFloat(ctrlInfo.total_planilla) || 0;
                    } else if (statusInfo) {
                        val = parseFloat(statusInfo[map.db]) || 0;
                    } else if (isMinera) {
                        if (map.excel === "TOTAL PLANILLA") {
                            val = mineraHistInfo ? (parseFloat(mineraHistInfo.debito_excel) || 0) : (reporteInfo ? (parseFloat(reporteInfo.total_gastos_logistica) || 0) : 0);
                        }
                    }
                    
                    if (isMinera && map.excel === "TOTAL FACTURA" && comisionExtraParaMinera > 0) {
                        if (val === 0) {
                            val += comisionExtraParaMinera;
                        }
                        desgloseFila['COMISIÓN (MINERA SAN CRISTOBAL)'] = comisionExtraParaMinera; 
                    } else if (map.excel !== "TOTAL FACTURA" && map.excel !== "TOTAL PLANILLA") {
                        desgloseFila[map.excel] = val; 
                    }

                    const isTotal = (map.excel === "TOTAL FACTURA" || map.excel === "TOTAL PLANILLA");
                    if (!showDetails && !isTotal) return; 
                    
                    let extraClass = isTotal ? "font-black text-gray-900 dark:text-white bg-slate-200/50 dark:bg-slate-800/40" : "text-gray-500 dark:text-slate-400 font-medium";
                    let valFormatted = val > 0 ? val.toLocaleString('es-BO', {minimumFractionDigits:2}) : '<span class="text-gray-300 dark:text-slate-600">-</span>';
                    row += `<td class="px-6 py-4 text-right tabular-nums ${extraClass}">${valFormatted}</td>`;
                });

                row += `</tr>`;
                rows.push(row);
                totalPlanillaGeneral += totPlanillaFila;
                totalFacturaGeneral += totFacturaFila;

                if(totPlanillaFila > 0 || totFacturaFila > 0) {
                    lastFilteredData.push({
                        cliente: tramite.razon_social || 'Sin Cliente',
                        mesAcep: rowMesAcep,
                        mesFact: rowMesFact,
                        totPlanilla: totPlanillaFila,
                        totFactura: totFacturaFila,
                        desglose: desgloseFila 
                    });
                }
            });

            // Paginación: calcular página actual y filas a mostrar
            const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
            if (currentPage > totalPages) currentPage = 1;
            const pageStart = (currentPage - 1) * rowsPerPage;
            const pageRows = rows.slice(pageStart, pageStart + rowsPerPage);

            // Un solo innerHTML con todo el HTML construido (más rápido que múltiples inserts)
            if(countMatches === 0) {
                tbody.innerHTML = `<tr><td colspan="100" class="px-6 py-24 text-center text-gray-400 dark:text-slate-500 text-xl font-bold"><i class="fas fa-ghost text-5xl mb-5 opacity-40 block"></i> No hay trámites que mostrar.</td></tr>`;
            } else {
                tbody.innerHTML = pageRows.join('');
            }

            // Footer stats: mostrando X-Y de Z
            const showFrom = countMatches === 0 ? 0 : pageStart + 1;
            const showTo = Math.min(pageStart + rowsPerPage, countMatches);
            document.getElementById('footerStats').innerText = countMatches === 0 ? '0 Registros' : `${showFrom}–${showTo} de ${countMatches} Registros`;
            document.getElementById('footSumFac').innerText = `Bs ${totalFacturaGeneral.toLocaleString('es-BO', {minimumFractionDigits:2})}`;
            document.getElementById('footSumPlan').innerText = `Bs ${totalPlanillaGeneral.toLocaleString('es-BO', {minimumFractionDigits:2})}`;

            // Render controles de paginación
            const pc = document.getElementById('paginationControls');
            if (totalPages <= 1) {
                pc.innerHTML = '';
            } else {
                const isDark = document.documentElement.classList.contains('dark');
                const inactiveBase = isDark ? 'color:#94a3b8;background:rgba(30,41,59,0.8);border-color:rgba(71,85,105,0.5)' : 'color:#64748b;background:rgba(255,255,255,0.8);border-color:#e2e8f0';
                let pgHtml = '';

                // Botón anterior
                pgHtml += `<button onclick="goToPage(${currentPage-1})" class="page-btn ${currentPage===1?'page-btn-disabled':''}" ${currentPage===1?'disabled':''}><i class="fas fa-chevron-left text-xs"></i></button>`;

                // Números de página con elipsis
                let pages = [];
                if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                    pages.push(1);
                    if (currentPage > 3) pages.push('...');
                    for (let i = Math.max(2, currentPage-1); i <= Math.min(totalPages-1, currentPage+1); i++) pages.push(i);
                    if (currentPage < totalPages - 2) pages.push('...');
                    pages.push(totalPages);
                }

                pages.forEach(p => {
                    if (p === '...') {
                        pgHtml += `<span class="page-btn" style="cursor:default;opacity:0.5">…</span>`;
                    } else {
                        pgHtml += `<button onclick="goToPage(${p})" class="page-btn ${p===currentPage?'page-active':''}">${p}</button>`;
                    }
                });

                // Botón siguiente
                pgHtml += `<button onclick="goToPage(${currentPage+1})" class="page-btn ${currentPage===totalPages?'page-btn-disabled':''}" ${currentPage===totalPages?'disabled':''}><i class="fas fa-chevron-right text-xs"></i></button>`;
                pc.innerHTML = pgHtml;
            }

            if (currentMainView === 'dashboard') renderDashboard();
        }

        // Función para cambiar el estado manualmente (Modo Visual)
        function marcarComoListoManual(referencia) {
            let tramiteOriginal = tramitesDB.find(t => t.n_referencia === referencia);
            if(tramiteOriginal) {
                // Simulamos que ya se guardó para que en lo visual aparezca como LISTO
                gastosGuardados.push({
                    n_referencia: referencia,
                    fecha_factura: formatToYYYYMMDD(new Date()), // Fecha de hoy simulada
                    "TOTAL FACTURA": 0, 
                    "TOTAL PLANILLA": 0
                });
                showToast(`Trámite ${referencia} marcado como LISTO.`, false, '¡Edición Manual!');
                poblarFiltros();
                renderTable();
            }
        }

        // ==========================================
        // RENDER DEL DASHBOARD
        // ==========================================
        function renderDashboard() {
            const isDark = document.documentElement.classList.contains('dark');
            const textColor = isDark ? '#94a3b8' : '#64748b';
            const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

            // CONCEPTOS ESPECÍFICOS PARA LA GRÁFICA APILADA
            const conceptosAgencia = [
                "HONORARIOS AGENCIA", "CARPETA P/ ARCHIVO", "GASTOS EN DESPACHO", "FOTOCOPIAS LEGALIZADAS",
                "VERIFICACION Y ETIQUETADO", "REGULARIZACION DESP. ANTICIPAD", "ITEMS DECLARADOS EN DIM Y DAV",
                "DESPACHO ADUANA FRONTERA", "SERVICIO LOGISTICO", "FORMULARIO DAM", "OTROS SERVICIOS",
                "FORMULARIO RITEX", "SERV. DE TRAM. SENASAG/UNALAB", "INGRESO Y RECOJO TRAM. SENASAG"
            ];

            let totalFac = 0, totalPlan = 0;
            const cliMap = {};
            const monthMap = {};
            const globalDesgloseMap = {}; 
            const totalTramitesCount = lastFilteredData.length;

            lastFilteredData.forEach(d => {
                totalFac += d.totFactura;
                totalPlan += d.totPlanilla;

                if(!cliMap[d.cliente]) cliMap[d.cliente] = { fac: 0, plan: 0, despachos: 0 };
                cliMap[d.cliente].fac += d.totFactura;
                cliMap[d.cliente].plan += d.totPlanilla;
                cliMap[d.cliente].despachos += 1;

                let m = d.mesFact || d.mesAcep || '1900-01'; 
                if(!monthMap[m]) {
                    monthMap[m] = { fac: 0, plan: 0, despachos: 0, conceptos: {} };
                    conceptosAgencia.forEach(c => monthMap[m].conceptos[c] = 0);
                }
                monthMap[m].fac += d.totFactura;
                monthMap[m].plan += d.totPlanilla;
                monthMap[m].despachos += 1;
                
                // Sumamos los conceptos específicos mes a mes
                conceptosAgencia.forEach(c => {
                    monthMap[m].conceptos[c] += (d.desglose[c] || 0);
                });

            });

            // 1. Actualizar KPIs (Factura, Líquido, Planilla, Trámites)
            document.getElementById('kpiFactura').innerText = 'Bs ' + totalFac.toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2});
            document.getElementById('kpiLiquido').innerText = 'Bs ' + (totalFac * 0.87).toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2});
            document.getElementById('kpiPlanilla').innerText = 'Bs ' + totalPlan.toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2});
            document.getElementById('kpiTramites').innerText = lastFilteredData.length;

            // 2. Gráfica Clientes: Facturación (Barras) y Despachos (Línea) - Eje Y Dual
            const topClientes = Object.keys(cliMap).sort((a,b) => cliMap[b].fac - cliMap[a].fac).slice(0, 10);
            if(chartInstClientes) chartInstClientes.destroy();

            const ctxClientes = document.getElementById('chartClientes').getContext('2d');
            
            let gradFacturaFlat = ctxClientes.createLinearGradient(0, 300, 0, 0);
            gradFacturaFlat.addColorStop(0, '#6366f1');
            gradFacturaFlat.addColorStop(1, '#818cf8');

            chartInstClientes = new Chart(ctxClientes, {
                type: 'bar',
                data: {
                    labels: topClientes.map(c => c.length > 18 ? c.substring(0,18)+'...' : c),
                    datasets: [
                        { 
                            type: 'bar',
                            label: 'Total Facturado (Bs.)', 
                            data: topClientes.map(c => cliMap[c].fac), 
                            backgroundColor: gradFacturaFlat, 
                            borderRadius: 6,
                            borderWidth: 0,
                            yAxisID: 'y'
                        },
                        { 
                            type: 'line',
                            label: 'Despachos Realizados (Nº)', 
                            data: topClientes.map(c => cliMap[c].despachos), 
                            borderColor: '#10b981', 
                            backgroundColor: '#10b981', 
                            borderWidth: 3,
                            pointBackgroundColor: '#10b981',
                            pointRadius: 4,
                            fill: false,
                            tension: 0.2,
                            yAxisID: 'y1',
                            datalabels: {
                                display: true,
                                anchor: 'end',
                                align: 'top',
                                color: '#10b981',
                                font: { family: 'Inter', weight: 'bold', size: 9 }
                            }
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { 
                        legend: { labels: { color: textColor, font: {family: 'Inter', size: 10} } }
                    },
                    scales: {
                        x: { ticks: { color: textColor }, grid: { display: false } },
                        y: { 
                            type: 'linear',
                            display: true,
                            position: 'left',
                            ticks: { 
                                color: textColor,
                                callback: v => v >= 1000 ? (v/1000).toFixed(1).replace('.0','')+'k' : v
                            }, 
                            grid: { color: gridColor } 
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            ticks: { color: '#10b981', font: { family: 'Inter', weight: 'bold' } },
                            grid: { drawOnChartArea: false }
                        }
                    }
                }
            });

            // 3. Gráfica Dona -> AHORA ES PANEL DE DISTRIBUCIÓN ESTILO BARRAS HTML (Facturación & Trámites)
            const completedCount = lastFilteredData.filter(d => {
                const rowRefClean = normalizeReferencia(d.n_referencia);
                const ctrlInfo = _controlMap[rowRefClean];
                if (ctrlInfo) {
                    return (parseFloat(ctrlInfo.total_factura) > 0 || parseFloat(ctrlInfo.total_planilla) > 0);
                }
                return (d.totFactura > 0 || d.totPlanilla > 0);
            }).length;
            const completionRate = totalTramitesCount > 0 ? (completedCount / totalTramitesCount) * 100 : 0;
            const formatMoney = (val) => 'Bs ' + val.toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2});

            document.getElementById('distribucionBars').innerHTML = `
                <div class="flex flex-col w-full group/bar">
                    <div class="flex justify-between items-end mb-2.5">
                        <div>
                            <h4 class="text-gray-900 dark:text-white font-black text-sm tracking-tight">TOTAL FACTURADO</h4>
                            <p class="text-[10px] text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider">Monto Bruto Global</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-sm transition-all group-hover/bar:border-orange-400 dark:group-hover/bar:border-orange-600">
                            <span class="text-gray-900 dark:text-white font-black text-xs">${formatMoney(totalFac)}</span>
                        </div>
                    </div>
                    <div class="h-3 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                        <div class="h-full bg-[#6366f1] rounded-full transition-all duration-1000 ease-out" style="width: 100%;"></div>
                    </div>
                </div>

                <div class="flex flex-col w-full group/bar">
                    <div class="flex justify-between items-end mb-2.5">
                        <div>
                            <h4 class="text-gray-900 dark:text-white font-black text-sm tracking-tight">LÍQUIDO (87%)</h4>
                            <p class="text-[10px] text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider">Ingreso Neto de la Agencia</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-sm transition-all group-hover/bar:border-amber-300 dark:group-hover/bar:border-amber-700">
                            <span class="text-gray-900 dark:text-white font-black text-xs">${formatMoney(totalFac * 0.87)}</span>
                        </div>
                    </div>
                    <div class="h-3 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                        <div class="h-full bg-[#f59e0b] rounded-full transition-all duration-1000 ease-out" style="width: 87%;"></div>
                    </div>
                </div>

                <div class="flex flex-col w-full group/bar">
                    <div class="flex justify-between items-end mb-2.5">
                        <div>
                            <h4 class="text-gray-900 dark:text-white font-black text-sm tracking-tight">TRÁMITES COMPLETADOS</h4>
                            <p class="text-[10px] text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider">Tasa de Conclusión: ${completedCount} de ${totalTramitesCount}</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-sm transition-all group-hover/bar:border-orange-400 dark:group-hover/bar:border-emerald-700">
                    <div class="h-3 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                        <div class="h-full bg-[#10b981] rounded-full transition-all duration-1000 ease-out" style="width: ${completionRate}%;"></div>
                    </div>
                </div>
            `;

            // 4. Gráfica Evolución — Barras apiladas por cliente + Línea de total sumado mensual
            const sortedMonths = Object.keys(monthMap).filter(m => m !== '1900-01').sort();
            const allMonths = sortedMonths; // Mostrar todos los meses!

            // Obtener lista de clientes activos en los meses
            const activeClientsInLast5 = [];
            const clientMonthMap = {}; // client -> { month -> amount }
            
            lastFilteredData.forEach(d => {
                let m = d.mesFact || d.mesAcep || '1900-01';
                if (!allMonths.includes(m)) return;
                if (d.totFactura <= 0) return;
                
                if (!clientMonthMap[d.cliente]) {
                    clientMonthMap[d.cliente] = {};
                    activeClientsInLast5.push(d.cliente);
                }
                clientMonthMap[d.cliente][m] = (clientMonthMap[d.cliente][m] || 0) + d.totFactura;
            });

            const colorsPalette = ['#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fbbf24', '#f87171', '#2dd4bf', '#fb7185', '#38bdf8', '#fb923c'];
            const datasetsEvolucion = activeClientsInLast5.map((cli, idx) => {
                return {
                    type: 'bar',
                    label: cli.length > 20 ? cli.substring(0, 20) + '...' : cli,
                    data: allMonths.map(m => clientMonthMap[cli][m] || 0),
                    backgroundColor: colorsPalette[idx % colorsPalette.length],
                    stack: 'total',
                    barPercentage: 0.5,
                    datalabels: { display: false }
                };
            });

            // Añadir el dataset de la línea que une el total sumado mensual
            datasetsEvolucion.push({
                type: 'line',
                label: 'Total Sumado de Clientes',
                data: allMonths.map(m => monthMap[m].fac),
                borderColor: isDark ? '#fbbf24' : '#4f46e5',
                backgroundColor: isDark ? '#fbbf24' : '#4f46e5',
                borderWidth: 3,
                pointBackgroundColor: isDark ? '#fbbf24' : '#4f46e5',
                pointRadius: 6,
                pointHoverRadius: 8,
                fill: false,
                tension: 0.25,
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    offset: 6,
                    color: isDark ? '#fbbf24' : '#4f46e5',
                    font: { family: 'Inter', weight: '850', size: 10 },
                    formatter: (val) => val > 0 ? 'Bs ' + val.toLocaleString('es-BO', {minimumFractionDigits:0, maximumFractionDigits:0}) : ''
                }
            });

            if(chartInstEvolucion) chartInstEvolucion.destroy();
            chartInstEvolucion = new Chart(document.getElementById('chartEvolucion'), {
                type: 'bar',
                data: {
                    labels: allMonths.map(m => getMonthNameShort(m).toUpperCase()),
                    datasets: datasetsEvolucion
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 25 } },
                    plugins: {
                        legend: { 
                            display: true, 
                            position: 'top',
                            labels: { color: textColor, boxWidth: 10, font: {family: 'Inter', size: 9} }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ' ' + context.dataset.label + ': Bs ' + context.raw.toLocaleString('es-BO', {minimumFractionDigits:2});
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            ticks: { color: textColor, font: { family: 'Inter', weight: '800', size: 10 } },
                            grid: { display: false },
                            border: { display: false }
                        },
                        y: {
                            stacked: true,
                            ticks: { color: textColor, font: { family: 'Inter', weight: '700', size: 10 }, callback: v => v >= 1000 ? (v/1000).toFixed(1).replace('.0','')+'k' : v },
                            grid: { color: gridColor, borderDash: [5, 5] },
                            border: { display: false },
                            beginAtZero: true
                        }
                    }
                }
            });

            // 5. GRÁFICA: EVOLUCIÓN DE CONCEPTOS DE AGENCIA (APILADA / STACKED)
            const sortedMonthsFactura = Object.keys(monthMap).filter(m => m !== '1900-01').sort();
            const coloresGrafica = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#3b82f6', '#d946ef', '#14b8a6', '#f97316', '#64748b', '#0ea5e9'];
            
            const activeConceptos = conceptosAgencia.filter(c => sortedMonthsFactura.some(m => monthMap[m].conceptos[c] > 0));

            const datasetsFactura = activeConceptos.map((c, i) => ({
                label: c,
                data: sortedMonthsFactura.map(m => monthMap[m].conceptos[c]),
                backgroundColor: coloresGrafica[i % coloresGrafica.length],
                borderRadius: 0,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(15,23,42,0.3)' : 'rgba(255,255,255,0.5)',
                datalabels: { display: false }
            }));

            if(chartInstDesglose) chartInstDesglose.destroy();
            chartInstDesglose = new Chart(document.getElementById('chartDesglose'), {
                type: 'bar',
                data: {
                    labels: sortedMonthsFactura.map(m => getMonthNameShort(m)),
                    datasets: datasetsFactura
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            display: true, 
                            position: 'right', 
                            labels: { color: textColor, boxWidth: 10, font: {family: 'Inter', size: 10} } 
                        }, 
                        tooltip: {
                            backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
                            titleColor: isDark ? '#fff' : '#000',
                            bodyColor: isDark ? '#cbd5e1' : '#475569',
                            borderColor: isDark ? '#334155' : '#e2e8f0',
                            borderWidth: 1, padding: 14, boxPadding: 8,
                            callbacks: {
                                label: function(context) { return ' ' + context.dataset.label + ': Bs ' + context.raw.toLocaleString('es-BO', {minimumFractionDigits:2}); }
                            }
                        }
                    },
                    scales: {
                        x: { 
                            stacked: true, 
                            ticks: { color: textColor, font: {family: 'Inter', weight: 500} }, 
                            grid: { display: false } 
                        },
                        y: { 
                            stacked: true, 
                            ticks: { color: textColor, font: {family: 'Inter', weight: 500} }, 
                            grid: { color: gridColor, borderDash: [5, 5], drawBorder: false }, 
                            beginAtZero: true 
                        }
                    }
                }
            });

            // 6. RANKING CLIENTES (DINÁMICO SEGÚN MODO SELECCIONADO: MONTO VS DESPACHOS)
            let clientesRanking = [];
            if (currentRankingMode === 'monto') {
                clientesRanking = Object.keys(cliMap)
                    .map(k => ({ nombre: k, valor: cliMap[k].fac }))
                    .filter(c => c.valor > 0)
                    .sort((a,b) => b.valor - a.valor);
            } else {
                clientesRanking = Object.keys(cliMap)
                    .map(k => ({ nombre: k, valor: cliMap[k].despachos }))
                    .filter(c => c.valor > 0)
                    .sort((a,b) => b.valor - a.valor);
            }
            clientesRanking = clientesRanking.slice(0, 15);

            if(chartInstClientesFactura) chartInstClientesFactura.destroy();

            const ctxRanking = document.getElementById('chartClientesFactura').getContext('2d');

            chartInstClientesFactura = new Chart(ctxRanking, {
                type: 'bar',
                data: {
                    labels: clientesRanking.map(c => c.nombre.length > 20 ? c.nombre.substring(0,20)+'...' : c.nombre),
                    datasets: [{
                        label: currentRankingMode === 'monto' ? 'Total Facturado (Bs.)' : 'Cantidad de Despachos (Nº)',
                        data: clientesRanking.map(c => c.valor),
                        backgroundColor: currentRankingMode === 'monto' ? '#f97316' : '#0ea5e9',
                        borderRadius: 6,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { 
                        legend: { display: false }, 
                        tooltip: { 
                            callbacks: { 
                                label: function(context) { 
                                    if (currentRankingMode === 'monto') {
                                        return ' Bs ' + context.raw.toLocaleString('es-BO', {minimumFractionDigits:2}); 
                                    } else {
                                        return ' ' + context.raw + ' despachos';
                                    }
                                } 
                            } 
                        },
                        datalabels: {
                            display: true,
                            anchor: 'end',
                            align: 'top',
                            color: textColor,
                            font: { family: 'Inter', weight: 'bold', size: 9 },
                            formatter: (val) => {
                                if (currentRankingMode === 'monto') {
                                    return val >= 1000 ? (val/1000).toFixed(0) + 'k' : val;
                                } else {
                                    return val;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { color: textColor, maxRotation: 45, minRotation: 45, font: {family: 'Inter', weight: 500, size: 9} }, grid: { display: false } },
                        y: { ticks: { color: textColor, font: {family: 'Inter', weight: 500} }, grid: { color: gridColor, drawBorder: false }, beginAtZero: true }
                    }
                }
            });

            // 7. WIDGET TOP MESES MÁS FACTURADOS
            const sortedMonthsTop = Object.keys(monthMap).filter(m => m !== '1900-01').sort((a, b) => monthMap[b].fac - monthMap[a].fac).slice(0, 5);
            let topMesesHtml = '';
            sortedMonthsTop.forEach((m, idx) => {
                const total = monthMap[m].fac;
                const formattedTotal = 'Bs ' + total.toLocaleString('es-BO', {minimumFractionDigits:0, maximumFractionDigits:0});
                const percentage = totalFac > 0 ? ((total / totalFac) * 100).toFixed(1) + '%' : '0%';
                
                const medalColors = [
                    'bg-amber-500 text-white shadow-amber-500/30',
                    'bg-slate-400 text-white shadow-slate-400/30',
                    'bg-amber-700 text-white shadow-amber-700/30',
                    'bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-indigo-350',
                    'bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-indigo-350'
                ];
                
                topMesesHtml += `
                    <div class="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/50 border border-gray-100/50 dark:border-slate-700/50 hover:scale-[1.02] hover:border-orange-400/50 dark:hover:border-orange-600/50 transition-all duration-300">
                        <div class="flex items-center gap-3">
                            <span class="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shadow-lg ${medalColors[idx]}">
                                ${idx + 1}
                            </span>
                            <div>
                                <h4 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">${getMonthNameShort(m).toUpperCase()}</h4>
                                <p class="text-[9px] font-semibold text-gray-400">${percentage} del total</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="text-xs font-black text-gray-900 dark:text-white">${formattedTotal}</span>
                        </div>
                    </div>
                `;
            });
            const topMesesContainer = document.getElementById('topMesesList');
            if (topMesesContainer) {
                topMesesContainer.innerHTML = topMesesHtml;
            }
        }

        // ==========================================
        // LÓGICA EXCEL
        function setupDragAndDrop() {
            const dropZone = document.getElementById('dropZone');
            const fileInput = document.getElementById('fileInput');

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
            ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('dragover')));
            ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover')));

            dropZone.addEventListener('drop', e => { if(e.dataTransfer.files.length) procesarArchivo(e.dataTransfer.files[0]); });
            fileInput.addEventListener('change', function() { if(this.files.length) procesarArchivo(this.files[0]); });
        }

        function procesarArchivo(file) {
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('loading').classList.add('flex');
            document.getElementById('dropText').innerText = file.name;
            document.getElementById('dropText').classList.add('text-slate-800', 'dark:text-slate-200');

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, {type: 'array', cellDates: true});
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    
                    const rawArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    let headerRowIndex = 0;
                    for (let i = 0; i < rawArray.length; i++) {
                        if (rawArray[i] && rawArray[i].some(cell => String(cell).trim().toUpperCase() === "TRAMITE")) {
                            headerRowIndex = i; break;
                        }
                    }

                    const rawJson = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex, defval: 0, raw: true });
                    datosExcel = rawJson.map(row => {
                        let newRow = {};
                        for(let key in row) newRow[key.trim()] = row[key];
                        return newRow;
                    });

                    prepararDatosParaInsertar();
                } catch (error) {
                    showToast("El archivo Excel está corrupto.", true);
                    document.getElementById('loading').classList.add('hidden');
                    document.getElementById('loading').classList.remove('flex');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        function prepararDatosParaInsertar() {
            dataAInsertar = [];
            let matchCount = 0;

            // Reconstruir hashmap de excel para lookups O(1)
            _datosExcelMap = {};
            datosExcel.forEach(e => {
                if (e["TRAMITE"]) {
                    _datosExcelMap[normalizeReferencia(e["TRAMITE"])] = e;
                }
            });

            datosExcel.forEach(row => {
                const tramiteExcel = String(row["TRAMITE"] || "").trim();
                if(!tramiteExcel) return;

                const normExcel = normalizeReferencia(tramiteExcel);
                const existeEnDB = tramitesDB.find(t => normalizeReferencia(t.n_referencia) === normExcel);
                if(existeEnDB) {
                    matchCount++;
                    const existInfo = _gastosMap[normExcel] || null;
                    let filaLimpia = {};

                    if (existInfo) {
                        filaLimpia = { ...existInfo };
                        const excelFecha = formatToYYYYMMDD(row["FECHA FACTURA"]);
                        if (excelFecha) {
                            filaLimpia.fecha_factura = excelFecha;
                        }
                        mapColumnas.forEach(map => {
                            const valExcel = parseFloat(row[map.excel]) || 0;
                            if (valExcel > 0) {
                                filaLimpia[map.db] = valExcel;
                            }
                        });
                    } else {
                        filaLimpia = { 
                            id: generateUUID(),
                            n_referencia: existeEnDB.n_referencia, 
                            n_declaracion: existeEnDB.n_declaracion,
                            fecha_factura: formatToYYYYMMDD(row["FECHA FACTURA"]) || null
                        };
                        mapColumnas.forEach(map => filaLimpia[map.db] = parseFloat(row[map.excel]) || 0);
                    }
                    dataAInsertar.push(filaLimpia);
                }
            });

            if(matchCount > 0) {
                document.getElementById('btnSave').classList.remove('hidden');
                switchMainView('table');
                showToast(`Se detectaron ${matchCount} gastos en el Excel.`);
            } else {
                document.getElementById('btnSave').classList.add('hidden');
                showToast("Ningún TRAMITE cruzó con la BD.", true);
            }

            poblarFiltros(); 
            setStatusFilter('ALL');
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('loading').classList.remove('flex');
        }

        async function saveToCloud() {
            if(!dataAInsertar.length) return;
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('loading').classList.add('flex');
            
            try {
                const { error } = await supabaseClient.from('gastos_importacion').upsert(dataAInsertar, { onConflict: 'n_referencia' });
                if (error) {
                    console.error("Supabase upsert error:", error);
                    const detailEl = document.getElementById('rlsErrorDetail');
                    if (detailEl) {
                        detailEl.innerText = `Detalles del error: [Código ${error.code || 'Desconocido'}] ${error.message}\n${error.details || ''}`;
                        detailEl.classList.remove('hidden');
                    }
                    document.getElementById('rlsModal').classList.remove('hidden');
                    document.getElementById('rlsModal').classList.add('flex');
                    throw new Error("Rechazado por Supabase.");
                }

                dataAInsertar.forEach(d => {
                    const existIdx = gastosGuardados.findIndex(g => g.n_referencia === d.n_referencia);
                    if(existIdx >= 0) gastosGuardados[existIdx] = d;
                    else gastosGuardados.push(d);
                });
                
                document.getElementById('btnSave').classList.add('hidden');
                datosExcel = []; 
                document.getElementById('fileInput').value = '';
                document.getElementById('dropText').innerText = "Cargar Excel";
                document.getElementById('dropText').classList.remove('text-slate-800', 'dark:text-slate-200');
                
                poblarFiltros(); 
                renderTable(); 
                showToast(`¡Chingón! Guardados / Actualizados ${dataAInsertar.length} registros.`);
            } catch (err) {
                if (err.message !== "Rechazado por Supabase.") showToast("Fallo la subida.", true);
            } finally {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('loading').classList.remove('flex');
            }
        }

        // ==========================================
        // UTILIDADES Y MODALES
        // ==========================================
        function showToast(msg, isError = false, customTitle = null) {
            const toast = document.getElementById('toast');
            document.getElementById('toastMsg').innerHTML = msg;
            
            if (customTitle) {
                document.getElementById('toastTitle').innerText = customTitle;
                document.getElementById('toastTitle').classList.remove('hidden');
            } else {
                document.getElementById('toastTitle').classList.add('hidden');
            }
            
            toast.className = `fixed top-5 right-5 z-[9999] transform transition-all duration-500 flex items-center gap-4 px-6 py-4 rounded-3xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.4)] border-l-4 backdrop-blur-3xl translate-x-0 opacity-100 ${
                isError ? 'bg-white/95 dark:bg-slate-800/95 border-red-500 text-gray-800 dark:text-white' : 'bg-white/95 dark:bg-slate-800/95 border-orange-500 text-gray-800 dark:text-white'
            }`;
            
            document.getElementById('toastIcon').className = isError ? 'fas fa-exclamation-circle text-3xl text-red-500 animate-pulse' : 'fas fa-check-circle text-3xl text-orange-500';
            if(customTitle === 'DATOS EN VIVO') document.getElementById('toastIcon').className = 'fas fa-satellite-dish text-3xl text-orange-500 animate-pulse';
            
            setTimeout(() => {
                toast.classList.add('translate-x-[120%]', 'opacity-0');
                toast.classList.remove('translate-x-0', 'opacity-100');
            }, 5000);
        }

        function closeRlsModal() {
            document.getElementById('rlsModal').classList.add('hidden');
            document.getElementById('rlsModal').classList.remove('flex');
        }

        function toggleFullScreen(elemId) {
            let elem = document.getElementById(elemId);
            if (elem.classList.contains('custom-fullscreen')) {
                elem.classList.remove('custom-fullscreen');
                elem.querySelector('.chart-wrapper').classList.remove('fullscreen-canvas-wrapper');
                document.body.style.overflow = ''; 
            } else {
                document.querySelectorAll('.custom-fullscreen').forEach(el => {
                    el.classList.remove('custom-fullscreen');
                    el.querySelector('.chart-wrapper').classList.remove('fullscreen-canvas-wrapper');
                });
                elem.classList.add('custom-fullscreen');
                elem.querySelector('.chart-wrapper').classList.add('fullscreen-canvas-wrapper');
                document.body.style.overflow = 'hidden'; 
            }
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                document.querySelectorAll('.custom-fullscreen').forEach(el => {
                    el.classList.remove('custom-fullscreen');
                    el.querySelector('.chart-wrapper').classList.remove('fullscreen-canvas-wrapper');
                });
                document.body.style.overflow = '';
            }
        });

        // === AJUSTE DINÁMICO DE ALTURA DE TABLA ===
        function adjustTableHeight() {
            // ¡Pura magia de Flexbox ahora! Se quitó el cálculo manual matemático 
            // que forzaba dejar ese hueco muerto abajo en la tabla.
        }
        window.addEventListener('resize', adjustTableHeight);
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', adjustTableHeight); } else { adjustTableHeight(); }
        setTimeout(adjustTableHeight, 500);
    
        window.selectClientFromStats = function(clientName) {
            const selectCli = document.getElementById('clientFilter');
            if (!selectCli) return;
            
            if (clientName === 'ALL') {
                Array.from(selectCli.options).forEach(opt => {
                    opt.selected = (opt.value === 'ALL');
                });
            } else {
                Array.from(selectCli.options).forEach(opt => {
                    opt.selected = (opt.value === clientName);
                });
            }
            selectCli.dispatchEvent(new Event('change'));
            initOrUpdateCustomSelect('clientFilter', 'fas fa-user-tie');
        };

// Exponer funciones globales para los eventos inline del HTML
window.toggleHeader = toggleHeader;
window.closeRlsModal = closeRlsModal;
window.toggleTheme = toggleTheme;
window.switchMainView = switchMainView;
window.saveToCloud = saveToCloud;
window.toggleDetails = toggleDetails;
window.setStatusFilter = setStatusFilter;
window.toggleFullScreen = toggleFullScreen;
window.marcarComoListoManual = marcarComoListoManual;
window.goToPage = goToPage;
window.changeRowsPerPage = changeRowsPerPage;
window.filterAduanaChanged = filterAduanaChanged;
window.changeRankingMode = changeRankingMode;
