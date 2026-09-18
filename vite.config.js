import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        declaraciones_importaciones: resolve(__dirname, 'src/views/declaraciones_importaciones.html'),
        facturas: resolve(__dirname, 'src/views/facturas.html'),
        planillas_gastos: resolve(__dirname, 'src/views/planillas_gastos.html'),
        reporte_unificado: resolve(__dirname, 'src/views/reporte_unificado.html'),
        reporte_msc: resolve(__dirname, 'src/views/reporte_msc.html'),
        detalle_despachos_msc: resolve(__dirname, 'src/views/detalle_despachos_msc.html'),
        control: resolve(__dirname, 'src/views/control.html'),
        reporte_msc2: resolve(__dirname, 'src/views/reporte_msc2.html'),
        dashboard_despachos_2026: resolve(__dirname, 'src/views/dashboard_despachos_2026.html')
      }
    }
  },
  server: {
    port: 5173,
    open: true
  }
});
