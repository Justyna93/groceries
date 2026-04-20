/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#fafaf9',
          100: '#f4f4f2',
          200: '#e8e8e4',
        },
        ink: {
          900: '#1f2024',
          700: '#3a3b40',
          500: '#6b6c72',
          400: '#9a9ba0',
        },
        accent: {
          500: '#5b8def',
          600: '#3b6fd6',
        },
        presence: {
          on: '#34c759',
          off: '#c7c7cc',
        },
        // Dark-mode named tokens (standalone names, not new shades, so v3 JIT picks them up reliably)
        night: {
          bg: '#14161c',     // body
          card: '#1a1c22',   // card surface
          edge: '#2a2d36',   // borders
          deep: '#0f1115',   // deepest (inputs)
          text: '#e8e9ec',   // primary text
          sub: '#c9cad0',    // secondary text
          mute: '#9a9ba0',   // tertiary text
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
      },
      borderRadius: {
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
