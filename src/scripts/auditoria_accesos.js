import { supabase } from '../services/supabase.js';
import { exportarBackupCompleto, obtenerEstadoUltimoBackup } from './backup_manager.js';

let allAuditData = [];
const supabaseClient = supabase; // Conectado mediante el servicio unificado

// Colores para cada acción
const actionColors = {
    'Consulta': 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    'Exportación': 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    'Edición': 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    'Eliminación': 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    'Alerta de Seguridad': 'text-rose-500 bg-rose-500/15 border-rose-500/30 font-black animate-pulse'
};

function getActionColor(action) {
    return actionColors[action] || 'text-slate-400 bg-slate-400/10 border-slate-400/20';
}

// Jalar el historial inicial desde tu Supabase
async function fetchAuditData(isSilent = false) {
    try {
        const { data, error } = await supabaseClient
            .from('bitacora_accesos')
            .select('id, created_at, usuario, accion, modulo, detalle_consulta, ip')
            .order('created_at', { ascending: false })
            .range(0, 49);

        if (error) throw error;

        // Mapeamos los datos de la BD a como los lee la tabla
        allAuditData = data.map(row => ({
            id: row.id,
            timestamp: new Date(row.created_at),
            user: row.usuario || 'Desconocido',
            action: row.accion || 'Consulta',
            actionColor: getActionColor(row.accion),
            module: row.modulo || '-',
            details: row.detalle_consulta || '-',
            ip: row.ip || 'N/A'
        }));

        applyFilters();
        updateStats(allAuditData);
        actualizarPillEstadoBackup();
    } catch (error) {
        if (!isSilent) console.error("Error al cargar los datos:", error);
        
        // Si la tabla no existe
        if (error.code === "PGRST205" && !isSilent) {
            const tbody = document.getElementById('table-body');
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-rose-500 font-bold">Falta crear la tabla 'bitacora_accesos' en tu Supabase. Por favor, créala para que funcione el módulo.</td></tr>`;
        }
    }
}

function actualizarPillEstadoBackup() {
    const backupStatusText = document.getElementById('backup-status-text');
    if (!backupStatusText) return;
    
    const estadoObj = obtenerEstadoUltimoBackup();
    backupStatusText.innerText = estadoObj.texto;
}

let realtimeChannel = null;
function suscribirTiempoReal() {
    if (!supabaseClient || realtimeChannel) return;
    realtimeChannel = supabaseClient
        .channel('realtime-bitacora')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bitacora_accesos' }, (payload) => {
            if ((payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
                const row = payload.new;
                const newAuditItem = {
                    id: row.id,
                    timestamp: new Date(row.created_at || Date.now()),
                    user: row.usuario || 'Desconocido',
                    action: row.accion || 'Consulta',
                    actionColor: getActionColor(row.accion),
                    module: row.modulo || '-',
                    details: row.detalle_consulta || '-',
                    ip: row.ip || 'N/A'
                };
                const idx = allAuditData.findIndex(item => item.id === row.id);
                if (idx >= 0) {
                    allAuditData[idx] = newAuditItem;
                } else {
                    allAuditData.unshift(newAuditItem);
                }
                applyFilters();
                updateStats(allAuditData);
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

function startPolling() {
    suscribirTiempoReal();
}

function formatDateTime(dateObj) {
    const d = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    const t = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<div class="flex flex-col"><span class="font-bold">${d}</span><span class="text-[10px] text-slate-500 font-mono">${t}</span></div>`;
}

function renderTable(data) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-500 font-medium">No se encontraron registros de auditoría con esos filtros.</td></tr>`;
        document.getElementById('showing-count').innerText = "0";
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'premium-tr';
        
        tr.innerHTML = `
            <td class="premium-td">${formatDateTime(row.timestamp)}</td>
            <td class="premium-td font-semibold text-orange-600 dark:text-orange-400">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 flex items-center justify-center text-[10px] font-black">
                        ${row.user.charAt(0).toUpperCase()}
                    </div>
                    ${row.user}
                </div>
            </td>
            <td class="premium-td">
                <span class="px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider border ${row.actionColor}">
                    ${row.action}
                </span>
            </td>
            <td class="premium-td font-bold text-slate-700 dark:text-slate-300">${row.module}</td>
            <td class="premium-td font-mono text-xs text-slate-600 dark:text-slate-400 truncate max-w-md">
                ${row.details}
            </td>
            <td class="premium-td font-mono text-[11px] text-slate-500">
                ${row.ip}
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('showing-count').innerText = data.length;
}

function updateStats(data) {
    const statToday = document.getElementById('stat-today');
    const statUsers = document.getElementById('stat-users');
    const statTopModule = document.getElementById('stat-top-module');
    const statAlerts = document.getElementById('stat-alerts');

    if (!statToday || !statUsers || !statTopModule) return;

    // Consultas hoy
    const today = new Date().toDateString();
    const todayCount = data.filter(d => d.timestamp.toDateString() === today).length;
    statToday.innerText = todayCount;

    // Usuarios Activos (únicos)
    const uniqueUsers = new Set(data.map(d => d.user)).size;
    statUsers.innerText = uniqueUsers;

    // Alertas de seguridad
    const alertCount = data.filter(d => d.action.includes('Alerta') || d.details.includes('⚠️')).length;
    if (statAlerts) statAlerts.innerText = alertCount;

    // Módulo top
    const moduleCounts = {};
    data.forEach(d => moduleCounts[d.module] = (moduleCounts[d.module] || 0) + 1);
    const topModule = Object.keys(moduleCounts).reduce((a, b) => moduleCounts[a] > moduleCounts[b] ? a : b, '-');
    statTopModule.innerText = topModule;
}

function applyFilters() {
    const userFilterElement = document.getElementById('filter-user');
    const moduleFilterElement = document.getElementById('filter-module');
    const dateFilterElement = document.getElementById('filter-date');

    const userFilter = userFilterElement ? userFilterElement.value.toLowerCase() : '';
    const moduleFilter = moduleFilterElement ? moduleFilterElement.value : '';
    const dateFilter = dateFilterElement ? dateFilterElement.value : '';

    const filteredData = allAuditData.filter(row => {
        const matchUser = row.user.toLowerCase().includes(userFilter);
        const matchModule = moduleFilter === "" || row.module === moduleFilter;
        
        let matchDate = true;
        if (dateFilter) {
            const rowDate = row.timestamp.toISOString().split('T')[0];
            matchDate = rowDate === dateFilter;
        }

        return matchUser && matchModule && matchDate;
    });

    renderTable(filteredData);
}

async function ejecutarBackupModal() {
    const swal = window.Swal || (typeof Swal !== 'undefined' ? Swal : null);
    if (!swal) {
        exportarBackupCompleto();
        return;
    }

    swal.fire({
        title: '¿Generar Copia de Seguridad Completa?',
        text: 'Se exportarán todas las facturas, importaciones, planillas y bitácora en formato JSON respaldado.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#f97316',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fa-solid fa-download"></i> Sí, Exportar Backup',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            swal.fire({
                title: 'Generando Respaldo...',
                text: 'Recopilando registros de Supabase...',
                allowOutsideClick: false,
                didOpen: () => { swal.showLoading(); }
            });

            const res = await exportarBackupCompleto();
            if (res.success) {
                swal.fire({
                    title: '¡Backup Exitoso! 💾',
                    html: `Se ha descargado la copia de seguridad correctamente.<br><br><strong>Registros respaldados:</strong><br>• Facturas: ${res.registros.facturas}<br>• Importaciones: ${res.registros.importaciones}<br>• Gastos: ${res.registros.gastos}<br>• Clientes: ${res.registros.clientes}`,
                    icon: 'success',
                    confirmButtonColor: '#10b981'
                });
                actualizarPillEstadoBackup();
            } else {
                swal.fire({
                    title: 'Error al Generar Backup',
                    text: res.error || 'Ocurrió un problema inesperado.',
                    icon: 'error',
                    confirmButtonColor: '#ef4444'
                });
            }
        }
    });
}

function exportToExcel() {
    if (!window.XLSX) {
        console.error("La librería XLSX no está disponible.");
        return;
    }
    // Recuperar datos actuales de la tabla mostrada
    const table = document.getElementById('auditTable');
    const ws = window.XLSX.utils.table_to_sheet(table);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Auditoría");
    
    const dateStr = new Date().toISOString().split('T')[0];
    window.XLSX.writeFile(wb, `Reporte_Auditoria_${dateStr}.xlsx`);
}

// Inicializar App
function inicializarAuditoria() {
    fetchAuditData(); // Cargamos historial
    startPolling();   // Prendemos el polling
    
    const filterUser = document.getElementById('filter-user');
    const filterModule = document.getElementById('filter-module');
    const filterDate = document.getElementById('filter-date');

    if (filterUser) filterUser.addEventListener('input', applyFilters);
    if (filterModule) filterModule.addEventListener('change', applyFilters);
    if (filterDate) filterDate.addEventListener('change', applyFilters);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarAuditoria);
} else {
    inicializarAuditoria();
}

// Registrar funciones en 'window' para que sigan disponibles en los eventos del HTML
window.applyFilters = applyFilters;
window.exportToExcel = exportToExcel;
window.ejecutarBackupModal = ejecutarBackupModal;

