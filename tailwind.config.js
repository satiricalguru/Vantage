/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.html', './src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#07080B',
        panel: {
          DEFAULT: '#101216',
          hover: '#171a20',
          raised: '#1b1e25'
        },
        line: {
          DEFAULT: 'rgba(255,255,255,0.07)',
          strong: 'rgba(255,255,255,0.13)'
        },
        ink: {
          DEFAULT: '#EEF0F4',
          dim: '#8D92A1',
          faint: '#5C6170'
        },
        // Primary accent: white (was teal #6EE7DA)
        glow: {
          DEFAULT: '#FFFFFF',
          deep: '#E6E8EC'
        },
        iris: '#B59CFF',
        ember: '#FF7AB6'
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px'
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.6)',
        lift: '0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 60px -20px rgba(0,0,0,0.75)',
        glow: '0 0 0 1px rgba(255,255,255,0.35), 0 10px 40px -10px rgba(255,255,255,0.25)'
      },
      animation: {
        'fade-in': 'fadeIn 0.35s cubic-bezier(0.19,1,0.22,1) both',
        'rise': 'rise 0.5s cubic-bezier(0.19,1,0.22,1) both',
        'pop': 'pop 0.35s cubic-bezier(0.19,1,0.22,1) both',
        'spin-slow': 'spin 8s linear infinite',
        'shimmer': 'shimmer 1.6s linear infinite'
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        rise: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pop: { '0%': { opacity: '0', transform: 'scale(0.96) translateY(8px)' }, '100%': { opacity: '1', transform: 'scale(1) translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Segoe UI Variable"', '"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}
