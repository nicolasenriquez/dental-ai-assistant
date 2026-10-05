/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        background: 'var(--bg)',
        surface: {
          DEFAULT: 'var(--surface-1)',
          raised: 'var(--surface-2)',
        },
        foreground: 'var(--text-primary)',
        muted: {
          DEFAULT: 'var(--text-secondary)',
          foreground: 'var(--text-tertiary)',
        },
        border: 'var(--border)',
        primary: {
          DEFAULT: 'var(--accent)',
          dark: 'var(--accent-dark)',
        },
        success: 'var(--success)',
        danger: 'var(--danger)',
        error: 'var(--error)',
        warning: 'var(--warning)',
      },
    },
  },
  plugins: [],
}
