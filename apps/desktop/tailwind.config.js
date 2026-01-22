/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Custom brand colors
                primary: {
                    50: '#f0f9ff',
                    100: '#e0f2fe',
                    200: '#bae6fd',
                    300: '#7dd3fc',
                    400: '#38bdf8',
                    500: '#0ea5e9',
                    600: '#0284c7',
                    700: '#0369a1',
                    800: '#075985',
                    900: '#0c4a6e',
                },
                accent: {
                    DEFAULT: '#8b5cf6',
                    hover: '#7c3aed',
                },
            },
            animation: {
                'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'wave': 'wave 1s ease-in-out infinite',
            },
            keyframes: {
                'pulse-ring': {
                    '0%': { transform: 'scale(1)', opacity: '1' },
                    '50%': { transform: 'scale(1.2)', opacity: '0.5' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                'wave': {
                    '0%, 100%': { transform: 'scaleY(1)' },
                    '50%': { transform: 'scaleY(1.5)' },
                },
            },
        },
    },
    plugins: [],
}
