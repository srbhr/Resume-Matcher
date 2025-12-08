/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            animation: {
                'gradient': 'gradient 8s linear infinite',
            },
            keyframes: {
                'gradient': {
                    to: { 'background-position': '200% center' },
                }
            },
            fontFamily: {
                sans: ['"Geist Sans"', 'sans-serif'],
                mono: ['"Space Grotesk"', 'monospace'],
            },
            colors: {
                'dark-bg': '#0f172a',
                'dark-surface': '#1e293b',
                'dark-text': '#f1f5f9',
            },
        },
    },
    plugins: [],
}