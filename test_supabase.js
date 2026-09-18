import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Leer .env manualmente
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

console.log('URL:', supabaseUrl);
console.log('Key (primeros 20):', supabaseAnonKey?.substring(0, 20));

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan credenciales.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const tables = [
  'importaciones',
  'facturas',
  'reporte_unificado_data',
  'historial_datos_minera',
  'config_nits',
  'regularizaciones_dims',
  'gastos_importacion',
  'bitacora_accesos'
];

async function testConnection() {
  console.log('\n--- Probando Conexión a Tablas ---');
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
        
      if (error) {
        console.log(`❌ Tabla "${table}": Error ->`, error.message);
      } else {
        console.log(`✅ Tabla "${table}": OK -> Total filas: ${count}`);
      }
    } catch (err) {
      console.log(`❌ Tabla "${table}": Excepción ->`, err.message);
    }
  }
}

testConnection();
