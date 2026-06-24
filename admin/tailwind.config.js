/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1419',
          raised: '#1a2332',
          border: '#2d3a4f',
        },
        accent: {
          DEFAULT: '#38bdf8',
          muted: '#0ea5e9',
        },
      },
    },
  },
  plugins: [],
};
