/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Bloomwired-aligned palette. Warm paper neutral with mauve/blush
        // accents. Numbered variants are darker/lighter siblings.
        charcoal: '#1E1E2A',
        'charcoal-2': '#4A4453',
        mauve: '#B48EAD',
        'mauve-deep': '#8E6A8D',
        blush: '#EDD9DE',
        'blush-soft': '#F4E5E9',
        paper: '#F5EFE6',
        surface: '#FBF7F0',
        line: '#E4DAD0',
        muted: '#8A8194',
        bg: '#F5EFE6',
      },
      fontFamily: {
        // Inter stays as the absolute fallback in case the Google Fonts
        // request fails. Order matters.
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        // Soft, warm-paper-friendly elevation. No harsh black drop shadows.
        card: '0 1px 2px rgba(40, 30, 40, 0.04), 0 4px 16px rgba(40, 30, 40, 0.04)',
        pill: '0 8px 24px rgba(40, 30, 40, 0.18)',
      },
    },
  },
  plugins: [],
};
