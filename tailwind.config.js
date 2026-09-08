/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // dayGLANCE wordmark (Lora, self-hosted). Georgia/serif fallback
        // renders immediately while the woff2 loads (font-display: swap).
        brand: ['Lora', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      colors: {
        // 考研蓝绿主题 (Material Design 3 teal 700) — 替代原 dayGLANCE orange
        brand: '#00695c',
        // MD3 辅助色
        'brand-light': '#439889',
        'brand-dark': '#003d33',
        'brand-bg': '#e0f2f1',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
