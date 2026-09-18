# Sistema ERP y Centro de Control Personal

Este proyecto es una reestructuración moderna y limpia basada en una arquitectura multipágina (MPA) con **Vite**, **Tailwind CSS** y **Supabase**.

## Requisitos Previos

- [Node.js](https://nodejs.org/) (Versión 18 o superior recomendada)
- Cuenta y proyecto activo en [Supabase](https://supabase.com/)

## Configuración Inicial

1. Instalar las dependencias del proyecto:
   ```bash
   npm install
   ```

2. Duplicar o configurar el archivo de variables de entorno:
   - Asegúrate de rellenar las variables en tu archivo `.env`:
     ```env
     VITE_SUPABASE_URL=tu_url_de_supabase
     VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
     ```

## Comandos Disponibles

- **Desarrollo Local:** Inicia el servidor de desarrollo de Vite con recarga rápida (HMR).
  ```bash
  npm run dev
  ```
  El servidor estará disponible en [http://localhost:5173](http://localhost:5173) por defecto.

- **Compilación de Producción:** Genera los archivos estáticos listos para producción en la carpeta `dist`.
  ```bash
  npm run build
  ```

- **Previsualizar Compilación:** Sirve localmente la compilación de producción generada en `dist`.
  ```bash
  npm run preview
  ```

## Estructura del Proyecto

- `index.html` - Dashboard Maestro (Contenedor principal con iframe de ruteo).
- `/src/main.js` - Script principal del Dashboard Maestro para manejar el ruteo dinámico mediante Hash (`#`).
- `/src/css/style.css` - Estilos globales de Tailwind.
- `/src/services/supabase.js` - Conexión unificada a Supabase.
- `/src/views/` - Directorio que contendrá los archivos HTML de cada módulo (ej. `indexa.html`).
- `/src/scripts/` - Directorio que contendrá la lógica en Javascript de cada vista (ej. `gestion-principal.js`).
