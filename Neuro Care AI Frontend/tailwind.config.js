/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#071D38',
          50: '#E8EDF5',
          100: '#D1DAEB',
          200: '#A3B4D7',
          300: '#758EC3',
          400: '#4767AF',
          500: '#284A93',
          600: '#1E3A78',
          700: '#142A5D',
          800: '#0A1A42',
          900: '#071D38',
        },
        powder: {
          DEFAULT: '#8DB9F0',
          50: '#F2F7FE',
          100: '#E0ECFB',
          200: '#C1D9F6',
          300: '#A3C6F1',
          400: '#8DB9F0',
          500: '#6BA0E8',
          600: '#4F87D6',
          700: '#3A6DB8',
          800: '#2D5590',
          900: '#1F3D68',
        },
        lavender: {
          DEFAULT: '#E9E8F8',
          50: '#FBFBFE',
          100: '#F4F3FB',
          200: '#E9E8F8',
          300: '#D6D4F0',
          400: '#BFBCE6',
          500: '#A5A1DA',
        },
        peach: {
          DEFAULT: '#F5B69E',
          50: '#FFF5F0',
          100: '#FDE8DD',
          200: '#FBD0BC',
          300: '#F5B69E',
          400: '#EE9A7C',
          500: '#E58563',
          600: '#CC6D4A',
        },
        success: '#2D9B6B',
        warning: '#D89614',
        error: '#D64545',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': '0.6875rem',
      },
      boxShadow: {
        'soft': '0 1px 3px 0 rgba(7, 29, 56, 0.06), 0 1px 2px -1px rgba(7, 29, 56, 0.06)',
        'card': '0 1px 4px 0 rgba(7, 29, 56, 0.05), 0 0 1px 0 rgba(7, 29, 56, 0.08)',
        'elevated': '0 4px 12px -2px rgba(7, 29, 56, 0.08), 0 2px 4px -1px rgba(7, 29, 56, 0.04)',
        'float': '0 8px 24px -4px rgba(7, 29, 56, 0.12), 0 4px 8px -2px rgba(7, 29, 56, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'blink': 'blink 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
};
