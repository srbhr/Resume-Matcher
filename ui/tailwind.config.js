/** @type {import('tailwindcss').Config} */
module.exports = {
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
                mono: ['"Geist Mono"', 'monospace'],
            },
        },
    },
    plugins: [],
}