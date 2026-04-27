/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
      // Family Recipe design system tokens (additive — does not override
      // Tailwind's defaults so existing components remain visually identical).
      // Per-screen redesign tickets adopt these via the new utility names.
      fontFamily: {
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '14px',
        input: '10px',
        logo: '16px',
      },
    },
  },
  plugins: [],
};
