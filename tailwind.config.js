/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#000000',
          white: '#FFFFFF',
          green: '#39FF14',
          yellow: '#FFF01F',
          orange: '#FF5E00',
        },
        neutral: {
          darkLine: 'rgba(255, 255, 255, 0.08)',
          textDark: 'rgba(255, 255, 255, 0.4)',
        },
      },
      letterSpacing: {
        wuxian: '0.35em',
        heading: '0.15em',
      },
      borderWidth: {
        '0.5': '0.5px',
      },
      boxShadow: {
        'neon-green': '0 0 12px rgba(57, 255, 14, 0.25)',
        'neon-orange': '0 0 12px rgba(255, 94, 0, 0.25)',
      },
    },
  },
  plugins: [],
};
