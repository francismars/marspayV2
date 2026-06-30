/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['BureauGrotesque', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#0c0c0e',
          raised: '#16161a',
          border: '#2a2a32',
        },
        accent: {
          DEFAULT: '#00b7ff',
          muted: '#0099d6',
          purple: '#9b59b6',
        },
      },
    },
  },
  plugins: [],
};
