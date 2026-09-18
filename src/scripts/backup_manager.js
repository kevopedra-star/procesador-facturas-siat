import { supabase } from '../services/supabase.js';

/**
 * MÓDULO DE RESPALDOS Y SEGURIDAD (RECOMENDACIÓN DE SEGURIDAD 5)
 * "Si no tenés backups, no tenés Plan B. Los backups existen para que
 * un problema no se convierta en una catástrofe."
 */

export async function exportarBackupCompleto() {
    try {
        console.log("📦 Generando copia de seguridad completa...");
        
        // 1. Obtener datos de todas las tablas principales
        const [facturasRes, importacionesRes, gastosRes, clientesRes, bitacoraRes] = await Promise.all([
            supabase.from('facturas').select('*').limit(5000),
            supabase.from('importaciones').select('*').limit(5000),
            supabase.from('gastos').select('*').limit(5000),
            supabase.from('clientes').select('*').limit(5000),
            supabase.from('bitacora_accesos').select('*').order('created_at', { ascending: false }).limit(500)
        ]);

        const backupData = {
            metadata: {
                sistema: "SISTEMA 1 - CONTROL ERP ADUANERO",
                version: "2.0.0",
                fecha_backup: new Date().toISOString(),
                usuario: sessionStorage.getItem('usuarioActivo') || 'Administrador',
                total_registros: {
                    facturas: (facturasRes.data || []).length,
                    importaciones: (importacionesRes.data || []).length,
                    gastos: (gastosRes.data || []).length,
                    clientes: (clientesRes.data || []).length,
                    bitacora_accesos: (bitacoraRes.data || []).length
                }
            },
            tablas: {
                facturas: facturasRes.data || [],
                importaciones: importacionesRes.data || [],
                gastos: gastosRes.data || [],
                clientes: clientesRes.data || [],
                bitacora_accesos: bitacoraRes.data || []
            }
        };

        // 2. Convertir a Blob y descargar archivo JSON estructurado
        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const link = document.createElement('a');
        link.href = url;
        link.download = `BACKUP_SISTEMA1_${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // 3. Guardar registro en localStorage y bitácora de auditoría
        const fechaHoraLocal = new Date().toLocaleString('es-ES');
        localStorage.setItem('ultimo_backup_fecha', fechaHoraLocal);
        
        if (window.registrarAuditoria) {
            window.registrarAuditoria('Exportación', 'Seguridad & Backups', `Descargó copia de seguridad completa JSON (${backupData.metadata.total_registros.facturas} facturas, ${backupData.metadata.total_registros.importaciones} importaciones)`);
        }

        return {
            success: true,
            fecha: fechaHoraLocal,
            registros: backupData.metadata.total_registros
        };
    } catch (err) {
        console.error("❌ Error al generar el backup:", err);
        return {
            success: false,
            error: err.message
        };
    }
}

export function obtenerEstadoUltimoBackup() {
    const ultimaFecha = localStorage.getItem('ultimo_backup_fecha');
    if (!ultimaFecha) {
        return {
            estado: 'PENDIENTE',
            badgeClass: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
            texto: 'Sin respaldos recientes en este navegador',
            icono: 'fa-triangle-exclamation'
        };
    }

    return {
        estado: 'RESTUARADO / ALMACENADO',
        badgeClass: 'bg-orange-500/20 text-orange-500 dark:text-orange-400 border-orange-500/30',
        texto: `Último respaldo seguro: ${ultimaFecha}`,
        icono: 'fa-circle-check'
    };
}

// Exponer funciones globalmente
window.exportarBackupCompleto = exportarBackupCompleto;
window.obtenerEstadoUltimoBackup = obtenerEstadoUltimoBackup;
