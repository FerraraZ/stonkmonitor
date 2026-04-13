/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0a0e1a',
        surface:  '#0f1526',
        card:     '#151d35',
        border:   '#1e2d4a',
        accent:   '#00d4ff',
        bull:     '#00ff88',
        bear:     '#ff4466',
        gold:     '#ffd700',
        muted:    '#4a6080',
        text:     '#e2e8f0',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
