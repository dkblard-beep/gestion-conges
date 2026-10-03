/** @type {import('tailwindcss').Config} */
module.exports = {
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
          secondary: '#10B981',
          'secondary-container': '#D1FAE5',
          'on-secondary-container': '#065F46',
          success: '#10B981',
          'success-light': '#ECFDF5',
          warning: '#F59E0B',
          'warning-light': '#FFFBEB',
          error: '#EF4444',
          'error-light': '#FEF2F2',
          'error-container': '#FEE2E2',
          'on-error-container': '#991B1B',
          surface: '#FFFFFF',
          'on-surface': '#0F172A',
          'surface-container-lowest': '#F8FAFC',
          'surface-container-low': '#F1F5F9',
          'surface-container': '#E2E8F0',
          'surface-container-high': '#CBD5E1',
          'on-surface-variant': '#64748B',
          'surface-bright': '#F8FAFC',
      }
    },
  },
  plugins: [],
}
