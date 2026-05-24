/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: '#1E1E2A',
        mauve: '#B48EAD',
        blush: '#E8C4D4',
        bg: '#F7F3F6',
        muted: '#8A8194',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
