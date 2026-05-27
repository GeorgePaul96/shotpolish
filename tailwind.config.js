/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system tokens — light theme
        base:    '#F5F6F8',
        surface: '#FFFFFF',
        elevated:'#FFFFFF',
        sidebar: '#F0F2F5',
        stage:   '#E4E6EE',
        // Border tokens
        'border-subtle':  'rgba(0,0,0,0.07)',
        'border-default': 'rgba(0,0,0,0.10)',
        'border-strong':  'rgba(0,0,0,0.14)',
        // Accent — purple-700, WCAG AA on white
        accent: {
          DEFAULT: '#7C3AED',
          soft:    '#a78bfa',
          dim:     'rgba(124,58,237,0.08)',
          glow:    'rgba(124,58,237,0.15)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      letterSpacing: {
        tighter: '-0.04em',
        tight:   '-0.02em',
        snug:    '-0.01em',
      },
      animation: {
        'fade-in':    'fadeIn 0.6s ease forwards',
        'slide-up':   'slideUp 0.5s ease forwards',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                           to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        glowPulse: { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '0.9' } },
      },
      backgroundImage: {
        // Light dot grid for editor stage
        'dot-grid':      "radial-gradient(rgba(0,0,0,0.07) 1px, transparent 1px)",
        // Soft violet tint for hero (very subtle on light)
        'hero-glow':     'radial-gradient(ellipse 80% 60% at 50% -5%, rgba(124,58,237,0.06) 0%, transparent 70%)',
        'card-gradient': 'linear-gradient(135deg, rgba(0,0,0,0.01) 0%, rgba(0,0,0,0.00) 100%)',
      },
      backgroundSize: {
        'dot-24': '24px 24px',
      },
      boxShadow: {
        // Soft light-mode shadows
        'glow-sm':  '0 0 20px rgba(124,58,237,0.10)',
        'glow-md':  '0 0 40px rgba(124,58,237,0.14)',
        'float':    '0 20px 48px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.05)',
        'card':     '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'glass':    '0 0 0 1px rgba(0,0,0,0.07)',
        'elevated': '0 8px 24px rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.04)',
        'canvas':   '0 0 0 1px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}
