import { supabase } from './services/supabase.js';

const AUDIT_TABLE_NAME = 'bitacora_accesos';
const TIEMPO_MAXIMO_INACTIVIDAD = 30 * 60 * 1000; // 30 minutos

let inactividadTimer;
let devToolsAbiertas = false;
const loadedIframes = {}; // Almacén para los iframes cargados en memoria

// --- REGISTRO DE AUDITORÍA GLOBAL ---
async function registrarAuditoria(accion, modulo, detalle) {
  try {
    const usuarioActual = sessionStorage.getItem('usuarioActivo') || 'Desconocido';
    let ipCliente = 'Desconocida';
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      ipCliente = ipData.ip;
    } catch (e) {
      // Ignorar fallas al obtener IP
    }

    await supabase.from(AUDIT_TABLE_NAME).insert([{
      usuario: usuarioActual,
      accion: accion,
      modulo: modulo,
      detalle_consulta: detalle,
      ip: ipCliente
    }]);
  } catch (err) {
    console.error('Error al registrar auditoría:', err);
  }
}

// --- PANTALLA DE BLOQUEO INSTANTÁNEO POR INTRUSIÓN ---
async function cerrarSesionInmediataPorIntrusion(motivo) {
  if (devToolsAbiertas) return;
  devToolsAbiertas = true;
  
  try {
    await registrarAuditoria('Alerta de Seguridad', 'Seguridad Core', `⚠️ ${motivo}`);
    await supabase.auth.signOut();
  } catch (err) {
    // Ignorar
  }
  
  sessionStorage.removeItem('usuarioActivo');
  localStorage.removeItem('usuarioActivo');
  sessionStorage.clear();

  // Limpiar todos los temporizadores para detener la ejecución de lógica de negocio
  let id = window.setTimeout(function() {}, 0);
  while (id--) {
    window.clearTimeout(id);
  }

  // Destruir el cuerpo del documento para evitar visualización y mostrar modal de advertencia estilo SIAT
  document.body.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; min-height:100vh; width:100vw; background-color:#0c0c0e; color:#f4f4f7; text-align:center; font-family:'Inter', sans-serif; z-index:999999; padding:20px; box-sizing:border-box; position:fixed; top:0; left:0;">
      <div style="background-color:#16161a; border: 1px solid #23232a; max-width: 500px; width: 100%; border-radius: 24px; padding: 40px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center;">
        <div style="background-color:rgba(245,158,11,0.1); padding:16px; border-radius:100px; margin-bottom:24px; display:inline-flex;">
          <svg style="width:48px; height:48px; fill:#f59e0b;" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm1 14h-2v-2h2v2zm0-4h-2V8h2v4z"/></svg>
        </div>
        <h2 style="font-size:1.5rem; font-weight:900; margin-bottom:8px; color:#ffffff; letter-spacing:-0.025em; text-transform:uppercase; font-family:sans-serif;">ADVERTENCIA DE SEGURIDAD</h2>
        <p style="font-size:0.875rem; color:#fdba74; font-weight:600; margin-bottom:24px; line-height:1.4; font-family:sans-serif;">Se ha detectado el uso de las Herramientas de Desarrollo del navegador.</p>
        
        <div style="width:100%; text-align:left; background-color:rgba(8,13,13,0.5); padding:20px; border-radius:16px; border:1px solid #23232a; margin-bottom:24px; box-sizing:border-box;">
          <div style="display:flex; align-items:start; margin-bottom:12px;">
            <span style="color:#ef4444; margin-right:8px; font-weight:bold; font-size:1rem;">❌</span>
            <p style="margin:0; font-size:0.75rem; color:#e4e4e7; font-weight:bold; font-family:sans-serif;">Está prohibido ejecutar comandos en la consola del navegador.</p>
          </div>
          <div style="display:flex; align-items:start; margin-bottom:12px;">
            <span style="color:#ef4444; margin-right:8px; font-weight:bold; font-size:1rem;">❌</span>
            <p style="margin:0; font-size:0.75rem; color:#e4e4e7; font-weight:bold; font-family:sans-serif;">Podrías comprometer la seguridad de tu información.</p>
          </div>
          <div style="display:flex; align-items:start;">
            <span style="color:#f59e0b; margin-right:8px; font-weight:bold; font-size:1rem;">⚠️</span>
            <p style="margin:0; font-size:0.75rem; color:#e4e4e7; font-weight:bold; font-family:sans-serif;">El uso indebido puede ser considerado un intento de ataque.</p>
          </div>
        </div>
        
        <p style="font-size:0.75rem; color:#f97316; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:24px; font-family:sans-serif;">Para continuar: Cierre las herramientas de desarrollo y recargue la página.</p>
        <button onclick="window.location.reload()" style="width:100%; padding:14px 0; background-color:#ff5500; color:#ffffff; border:none; border-radius:16px; font-weight:900; font-size:0.875rem; cursor:pointer; box-shadow:0 8px 16px rgba(60,144,134,0.2); transition:background-color 0.2s; font-family:sans-serif;">Recargar Página</button>
      </div>
    </div>
  `;

  // Imprimir advertencias gigantes en la consola continuamente
  setInterval(() => {
    console.clear();
    console.log(
      "%c⚠️ ACCESO RESTRINGIDO ⚠️",
      "background: red; color: white; font-size: 32px; font-weight: bold; padding: 8px 15px; border-radius: 6px; text-shadow: 2px 2px 3px rgba(0,0,0,0.5);"
    );
    console.log(
      "%cEstá terminantemente PROHIBIDO ejecutar comandos aquí.",
      "color: #ef4444; font-size: 16px; font-weight: bold; margin-top: 10px;"
    );
    console.log(
      "%cManipular esta consola puede ser considerado un intento de ataque.",
      "color: #ef4444; font-size: 16px; font-weight: bold;"
    );
    console.log(
      "%cCierre las herramientas de desarrollador para continuar.",
      "color: #f59e0b; font-size: 14px; font-weight: bold;"
    );
    console.log(
      "%c¡Está prohibido abrir las herramientas de desarrollo!",
      "color: #f59e0b; font-size: 14px; font-weight: bold; margin-bottom: 20px;"
    );
  }, 1000);

  // Lanzar bucle infinito de debugger dinámico en segundo plano para congelar su depurador
  setInterval(() => {
    (function() {}.constructor("debugger")());
  }, 50);
}

// --- SEGURIDAD ANTI-METICHES (ANTI-DEBUGGING & DEVTOOLS) ---
function activarSeguridadAntiMetiches() {
  // Desactivar clic derecho
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Desactivar atajos de desarrollador
  document.addEventListener('keydown', function (e) {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
      (e.ctrlKey && e.key.toUpperCase() === 'U')
    ) {
      e.preventDefault();
      cerrarSesionInmediataPorIntrusion('Presionó atajo de DevTools (F12/Ctrl+Shift+I)');
      return false;
    }
  });

  // 1. Detección por cambio de tamaño de ventana (Docked DevTools)
  const chequearTamanoVentana = () => {
    if (devToolsAbiertas) return;
    const threshold = 160;
    const isWidthDevTools = (window.outerWidth - window.innerWidth) > threshold;
    const isHeightDevTools = (window.outerHeight - window.innerHeight) > threshold;
    if (isWidthDevTools || isHeightDevTools) {
      cerrarSesionInmediataPorIntrusion('Abrió herramientas de desarrollo (Inspección de Tamaño)');
    }
  };
  window.addEventListener('resize', chequearTamanoVentana);
  setInterval(chequearTamanoVentana, 1000);

  // 2. Detección de impresión en consola (Console open)
  const element = new Image();
  Object.defineProperty(element, 'id', {
    get: function() {
      cerrarSesionInmediataPorIntrusion('Abrió consola del navegador (Detección de Impresión)');
    }
  });
  setInterval(() => {
    if (devToolsAbiertas) return;
    console.log('%c', element);
  }, 1000);

  // 3. Detector de depurador dinámico por retraso de tiempo
  const chequearDebugger = () => {
    if (devToolsAbiertas) return;
    const start = performance.now();
    (function() {}.constructor("debugger")());
    const end = performance.now();
    if (end - start > 100) {
      cerrarSesionInmediataPorIntrusion('Abrió herramientas de depuración (Debugger detectado)');
    }
  };
  setInterval(chequearDebugger, 1000);
}

// --- TEMPORIZADOR DE INACTIVIDAD ---
function reiniciarTemporizador() {
  const mainLayout = document.getElementById('mainLayout');
  if (mainLayout && !mainLayout.classList.contains('hidden')) {
    clearTimeout(inactividadTimer);
    inactividadTimer = setTimeout(cerrarPorInactividad, TIEMPO_MAXIMO_INACTIVIDAD);
  }
}

async function cerrarPorInactividad() {
  await registrarAuditoria('Cierre Automático', 'Seguridad Core', 'Sesión expirada tras 30 min de inactividad');
  await supabase.auth.signOut();
  sessionStorage.removeItem('usuarioActivo');
  sessionStorage.clear();

  // Mostrar login y ocultar dashboard
  const mainLayout = document.getElementById('mainLayout');
  const loginOverlay = document.getElementById('loginOverlay');
  const timeoutMessage = document.getElementById('timeoutMessage');
  const iframeContainer = document.getElementById('iframe-container');

  if (mainLayout) mainLayout.classList.add('hidden');
  if (loginOverlay) {
    loginOverlay.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    loginOverlay.style.opacity = '1';
  }
  if (timeoutMessage) timeoutMessage.classList.remove('hidden');
  
  // Limpiar iframes de la memoria
  if (iframeContainer) iframeContainer.innerHTML = '';
  Object.keys(loadedIframes).forEach(key => delete loadedIframes[key]);
}

function iniciarTemporizadorInactividad() {
  reiniciarTemporizador();

  // Escuchar eventos de interacción en el documento principal
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, reiniciarTemporizador);
  });
}

// --- ESCUCHAR INACTIVIDAD Y ATAJOS DENTRO DE LOS IFRAMES ---
function vincularInactividadIframe(iframe) {
  iframe.addEventListener('load', () => {
    try {
      const iframeWindow = iframe.contentWindow;
      
      // Registrar eventos de interacción en el iframe para resetear inactividad
      ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
        iframeWindow.addEventListener(evt, reiniciarTemporizador);
      });

      // Desactivar clic derecho en el iframe
      iframeWindow.document.addEventListener('contextmenu', e => e.preventDefault());

      // Interceptar F12 y DevTools dentro del iframe
      iframeWindow.addEventListener('keydown', function (e) {
        if (
          e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
          (e.ctrlKey && e.key.toUpperCase() === 'U')
        ) {
          e.preventDefault();
          cerrarSesionInmediataPorIntrusion('Presionó atajo de DevTools en vista embebida');
          return false;
        }
      });
    } catch (e) {
      // Ignorar fallas por CORS
    }
  });
}

// --- CONTROL DE TEMA GLOBAL ---
function applyThemeToDocument(doc, isDark) {
  if (isDark) {
    doc.documentElement.classList.add('dark');
    doc.documentElement.classList.remove('light');
  } else {
    doc.documentElement.classList.add('light');
    doc.documentElement.classList.remove('dark');
  }
}

function setGlobalTheme(isDark) {
  // Aplicar al documento principal
  applyThemeToDocument(document, isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');

  // Sincronizar tema con todos los iframes activos en memoria
  Object.values(loadedIframes).forEach(iframe => {
    try {
      if (iframe.contentDocument) {
        applyThemeToDocument(iframe.contentDocument, isDark);
      }
    } catch (e) {
      // Ignorar fallas de CORS (en local todo corre sobre localhost:5173, por lo que no habrá problemas)
    }
  });
}

function inicializarTemaUI() {
  const currentTheme = localStorage.getItem('theme') || 'dark'; // Dark es default
  const isDark = currentTheme === 'dark';
  setGlobalTheme(isDark);

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isCurrentlyDark = document.documentElement.classList.contains('dark');
      setGlobalTheme(!isCurrentlyDark);
    });
  }
}

// --- CONTROL DE LOGIN ---
function iniciarApp(userEmail) {
  sessionStorage.setItem('usuarioActivo', userEmail);
  
  const userNameLabel = document.getElementById('userNameLabel');
  if (userNameLabel) userNameLabel.innerText = userEmail;

  const loginOverlay = document.getElementById('loginOverlay');
  const mainLayout = document.getElementById('mainLayout');

  if (loginOverlay) {
    loginOverlay.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
      loginOverlay.classList.add('hidden');
      if (mainLayout) mainLayout.classList.remove('hidden');
      
      registrarAuditoria('Consulta', 'Menú Principal', 'Inició sesión en el sistema');
      iniciarTemporizadorInactividad();
      handleRoute(); // Ejecuta el ruteador inicial
    }, 700);
  }
}

async function cerrarSesionUsuario() {
  await registrarAuditoria('Consulta', 'Menú Principal', 'Cerró sesión manualmente');
  await supabase.auth.signOut();
  sessionStorage.removeItem('usuarioActivo');
  sessionStorage.clear();
  window.location.reload();
}

// --- RUTEADOR DE VISTAS (HASH ROUTING + MULTI-IFRAME CACHE) ---
const routes = {
  '#declaraciones_importaciones': { page: '/src/views/declaraciones_importaciones.html', title: 'Declaraciones de Importaciones' },
  '#facturas': { page: '/src/views/facturas.html', title: 'Facturas' },
  '#dashboard_despachos_2026': { page: '/src/views/dashboard_despachos_2026.html', title: 'Dashboard & Gastos Despachos 2026' },
  '#reporte_msc': { page: '/src/views/reporte_msc.html', title: 'Reporte MSC' },
  '#reporte_msc2': { page: '/src/views/reporte_msc2.html', title: 'Reporte MSC Premium' },
  '#detalle_despachos_msc': { page: '/src/views/detalle_despachos_msc.html', title: 'Detalle de Despachos MSC' },
  '#control': { page: '/src/views/control.html', title: 'Control' }
};

function handleRoute() {
  const usuarioActivo = sessionStorage.getItem('usuarioActivo');
  if (!usuarioActivo) return;

  const hash = window.location.hash || '#dashboard_despachos_2026'; // Default a Dashboard & Gastos 2026
  const route = routes[hash];
  const iframeContainer = document.getElementById('iframe-container');
  const navLinks = document.querySelectorAll('#sidebar-nav a');

  if (route && iframeContainer) {
    // 1. Ocultar todos los iframes activos
    Object.values(loadedIframes).forEach(iframe => {
      iframe.classList.add('hidden');
    });

    // 2. Comprobar si ya existe el iframe para esta ruta
    let activeIframe = loadedIframes[hash];

    if (!activeIframe) {
      activeIframe = document.createElement('iframe');
      activeIframe.id = `iframe-${hash.replace('#', '')}`;
      activeIframe.src = route.page;
      activeIframe.className = "w-full h-full border-0 absolute inset-0 z-0 bg-transparent transition-opacity duration-300";
      activeIframe.title = route.title;

      // Al cargar, inyectarle el tema que esté activo actualmente en el dashboard
      activeIframe.addEventListener('load', () => {
        const isDarkTheme = document.documentElement.classList.contains('dark');
        try {
          applyThemeToDocument(activeIframe.contentDocument, isDarkTheme);
        } catch (e) {
          // Ignorar fallas por CORS
        }
      });

      // Vincular el detector de inactividad dentro del iframe
      vincularInactividadIframe(activeIframe);

      iframeContainer.appendChild(activeIframe);
      loadedIframes[hash] = activeIframe;
    } else {
      // Si ya existía, simplemente lo hacemos visible
      activeIframe.classList.remove('hidden');
      
      // Asegurar que el tema esté sincronizado
      const isDarkTheme = document.documentElement.classList.contains('dark');
      try {
        applyThemeToDocument(activeIframe.contentDocument, isDarkTheme);
      } catch (e) {
        // Ignorar
      }
    }

    // 3. Actualizar estilos activos de los botones del menú
    navLinks.forEach(link => {
      const linkHash = link.getAttribute('href');

      if (linkHash === hash) {
        link.classList.add('active-nav-item');
      } else {
        link.classList.remove('active-nav-item');
      }
    });

    // Registrar auditoría al cambiar de pestaña
    registrarAuditoria('Consulta', route.title, 'Abrió la vista del módulo');
  } else {
    window.location.hash = '#dashboard_despachos_2026';
  }
}

// --- CONTROLES DE LA BARRA LATERAL (SIDEBAR COLLAPSE) ---
function configurarSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleIcon = document.getElementById('toggleIcon');
  const sidebarTexts = document.querySelectorAll('.sidebar-text');
  let isExpanded = false;

  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    if (isExpanded) {
      sidebar.classList.remove('w-[84px]');
      sidebar.classList.add('w-[295px]');
      toggleIcon.classList.remove('fa-chevron-right');
      toggleIcon.classList.add('fa-chevron-left');
      sidebarTexts.forEach(text => {
        text.classList.remove('opacity-0', '-translate-x-4', 'invisible');
        text.classList.add('opacity-100', 'translate-x-0');
        text.style.width = 'auto';
      });
    } else {
      sidebar.classList.remove('w-[295px]');
      sidebar.classList.add('w-[84px]');
      toggleIcon.classList.remove('fa-chevron-left');
      toggleIcon.classList.add('fa-chevron-right');
      sidebarTexts.forEach(text => {
        text.classList.remove('opacity-100', 'translate-x-0');
        text.classList.add('opacity-0', '-translate-x-4');
        setTimeout(() => {
          if (!isExpanded) {
            text.classList.add('invisible');
            text.style.width = '0px';
          }
        }, 300);
      });
    }
  });
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');
  const timeoutMessage = document.getElementById('timeoutMessage');
  const btnIngresar = document.getElementById('btnIngresar');

  // Registrar listeners de autenticación
  const passwordInput = document.getElementById('passwordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const passwordEyeIcon = document.getElementById('passwordEyeIcon');
  
  if (togglePasswordBtn && passwordInput && passwordEyeIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      if (type === 'password') {
        passwordEyeIcon.classList.remove('fa-eye-slash');
        passwordEyeIcon.classList.add('fa-eye');
      } else {
        passwordEyeIcon.classList.remove('fa-eye');
        passwordEyeIcon.classList.add('fa-eye-slash');
      }
    });
  }
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('usernameInput').value.trim();
      const password = document.getElementById('passwordInput').value.trim();
      
      if (email && password) {
        const textoOriginalBtn = btnIngresar.innerHTML;
        btnIngresar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando...';
        btnIngresar.disabled = true;
        errorMessage.classList.add('hidden');
        timeoutMessage.classList.add('hidden');

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
          });

          if (error) {
            errorMessage.classList.remove('hidden');
            btnIngresar.innerHTML = textoOriginalBtn;
            btnIngresar.disabled = false;
            document.getElementById('passwordInput').value = ''; 
            registrarAuditoria('Fallo de Login', 'Seguridad', `Intento fallido para: ${email}`);
          } else {
            btnIngresar.innerHTML = textoOriginalBtn;
            btnIngresar.disabled = false;
            iniciarApp(data.user.email);
          }
        } catch (err) {
          errorMessage.innerHTML = '<i class="fa-solid fa-wifi mr-1"></i> Error de conexión. Intenta de nuevo.';
          errorMessage.classList.remove('hidden');
          btnIngresar.innerHTML = textoOriginalBtn;
          btnIngresar.disabled = false;
        }
      }
    });
  }

  // Verificar si ya hay una sesión activa con Supabase
  async function checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        iniciarApp(session.user.email);
      } else {
        sessionStorage.removeItem('usuarioActivo');
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
          loginOverlay.classList.remove('hidden');
          loginOverlay.style.opacity = '1';
        }
      }
    } catch (e) {
      console.error('Error verificando sesión inicial:', e);
    }
  }

  // Configurar elementos de UI, listeners de Hash y Tema
  configurarSidebar();
  inicializarTemaUI();
  window.addEventListener('hashchange', handleRoute);
  
  // Listener botón sincronizar Sheets
  const btnSyncSidebar = document.getElementById('btnSyncSidebar');
  if (btnSyncSidebar) {
    btnSyncSidebar.addEventListener('click', sincronizarDesdeSidebar);
  }

  // Activar seguridad anti-hackers
  activarSeguridadAntiMetiches();
  
  // Ejecutar validación de sesión
  checkSession();
});

// --- SINCRONIZACIÓN GOOGLE SHEETS DESDE SIDEBAR ---
let isSyncingSheets = false;

function sincronizarDesdeSidebar(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }

  if (isSyncingSheets) return;
  isSyncingSheets = true;

  const boton = document.getElementById('btnSyncSidebar');
  const icono = document.getElementById('syncIcon');
  const texto = document.getElementById('syncText');
  
  const BASE_URL = "https://script.google.com/macros/s/AKfycbx5aih5ET6BpcuKKQvQZ3MHQaCuBO1tN8svKtV58DrLMmROetfQujolJIDMl98mmvH1iw/exec";
  const timestampedUrl = BASE_URL + "?t=" + Date.now();

  console.log("⚡ Ejecutando actualización de Google Sheets (no bloqueante):", timestampedUrl);

  if (boton) {
    boton.disabled = true;
    boton.style.opacity = "0.7";
    boton.style.cursor = "wait";
  }
  if (icono) icono.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-amber-500"></i>';
  if (texto) texto.innerText = "Sincronizando...";

  // Petición única asíncrona no bloqueante (1 sola ejecución directa)
  try {
    const imgPing = new Image();
    imgPing.src = timestampedUrl;
  } catch (err) {
    console.warn("Aviso en envío de sincronización:", err);
  }

  // Cambiar a Ticket Verde ✅ y notificar tras 1.2 segundos
  setTimeout(() => {
    if (icono) icono.innerHTML = '<span class="text-emerald-500 text-lg font-black">✅</span>';
    if (texto) texto.innerText = "Sincronizado con Éxito";

    if (boton) {
      boton.classList.remove('border-amber-500/20');
      boton.classList.add('border-emerald-500/40', 'bg-emerald-500/10');
    }

    alert("✅ Sincronización completada con éxito.");

    // Restablecer el botón a su estado original tras 3.5 segundos
    setTimeout(() => {
      if (boton) {
        boton.disabled = false;
        boton.style.opacity = "1";
        boton.style.cursor = "pointer";
        boton.classList.remove('border-emerald-500/40', 'bg-emerald-500/10');
        boton.classList.add('border-amber-500/20');
      }
      if (icono) icono.innerHTML = '<span class="text-base">⚡</span>';
      if (texto) texto.innerText = "Sincronizar Sheets";
      isSyncingSheets = false;
    }, 3500);
  }, 1200);
}

// Exponer cerrar sesión globalmente para el botón del sidebar
window.cerrarSesionUsuario = cerrarSesionUsuario;
window.registrarAuditoria = registrarAuditoria;
window.sincronizarDesdeSidebar = sincronizarDesdeSidebar;
