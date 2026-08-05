/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        void: '#0A0B0D',
        panel: {
          DEFAULT: '#17181C',
          hover: '#1D1F24'
        },
        line: '#26282E',
        ink: {
          DEFAULT: '#ECEDEF',
          dim: '#90939B'
        },
        glow: '#6EE7DA'
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out both',
        'spin-slow': 'spin 8s linear infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif'
        ],
        mono: [
          'ui-monospace',
          '"SF Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace'
        ]
      }
    }
  },
  plugins: []
}
