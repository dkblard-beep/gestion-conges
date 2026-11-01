/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./*.html", "./*.js"],
  theme: {
    extend: {
      fontFamily: {
          sans: ['Inter', 'sans-serif'],
      },
      colors: {
          primary: '#2563EB',
          'primary-hover': '#1D4ED8',
          'primary-light': '#EFF6FF',
          'primary-container': '#DBEAFE',
          'on-primary-container': '#1E3A8A',
          secondary: '#047857',
          'secondary-container': '#D1FAE5',
          'on-secondary-container': '#064E3B',
          success: '#047857',
          'success-light': '#ECFDF5',
          warning: '#D97706',
          'warning-light': '#FFFBEB',
          error: '#DC2626',
          'error-light': '#FEF2F2',
          'error-container': '#FEE2E2',
          'on-error-container': '#991B1B',
          surface: '#FFFFFF',
          'on-surface': '#0F172A',
          'surface-container-lowest': '#F8FAFC',
          'surface-container-low': '#F1F5F9',
          'surface-container': '#E2E8F0',
          'surface-container-high': '#CBD5E1',
          'on-surface-variant': '#475569',
          'surface-bright': '#F8FAFC',
      }
    },
  },
  plugins: [],
}
