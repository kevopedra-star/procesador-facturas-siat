/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#ff5500', // RA/dev Electric Flame Orange Primary
          600: '#f97316',
          700: '#ea580c',
          800: '#c2410c',
          900: '#9a3412',
          950: '#431407',
        },
        dark: {
          bg: '#0c0c0e',       // RA/dev Pitch Matte Black
          card: '#16161a',     // RA/dev Dark Slate Card
          border: '#23232a',   // RA/dev Dark Border Stroke
          sidebar: '#121215',  // RA/dev Sidebar Panel
          text: '#ffffff',
          muted: '#8e8e98',
          accent: '#ff5500'
        },
        light: {
          bg: '#f4f4f7',       // Crisp Porcelain
          card: '#ffffff',     // Pure White Card
          border: '#e4e4e7',   // Light Border
          sidebar: '#ffffff',  // Pure White Sidebar
          text: '#09090b',
          muted: '#71717a',
          accent: '#ea580c'
        },
        custom: {
          red: '#ef4444',
          green: '#22c55e',
          blue: '#3b82f6',
          purple: '#8b5cf6',
          orange: '#ff5500',
          amber: '#f59e0b'
        }
      },
      boxShadow: {
        'cyber-orange': '0 0 25px -5px rgba(255, 85, 0, 0.25)',
        'cyber-card': '0 10px 30px -10px rgba(0, 0, 0, 0.6)',
        'glow-green': '0 0 20px -3px rgba(34, 197, 94, 0.3)',
        'glow-red': '0 0 20px -3px rgba(239, 68, 68, 0.3)',
      }
    }
  },
  plugins: []
};

