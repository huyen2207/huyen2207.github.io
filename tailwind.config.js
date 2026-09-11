/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        ja: ['"Hiragino Sans"', '"Noto Sans JP"', '"Yu Gothic"', 'Meiryo', 'sans-serif'],
        ui: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Noto Sans"', 'sans-serif'],
      },
      colors: {
        paper: { DEFAULT: '#faf9f7', dark: '#14120f' },
        ink: { DEFAULT: '#1c1917', dark: '#f5f3f0' },
        sumi: { 50:'#f7f6f4',100:'#eeece8',200:'#dcd8d1',300:'#bfb8ad',400:'#9c9285',500:'#7d7263',600:'#635a4e',700:'#4d463d',800:'#332e28',900:'#211d19' },
        seal: '#a0522d',
        indigo2: '#2f4858',
        matcha: '#5d7052',
      },
      maxWidth: { phone: '430px' },
    },
  },
  plugins: [],
};
