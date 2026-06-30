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
          DEFAULT: '#0a0a0a',
          raised: 'rgba(0, 0, 0, 0.5)',
          border: 'rgba(255, 255, 255, 0.22)',
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
