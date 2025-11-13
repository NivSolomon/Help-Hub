export default {
  plugins: process.env.TAILWIND_DISABLE_LIGHTNINGCSS
    ? {
        tailwindcss: {},
        autoprefixer: {},
      }
    : {
        "@tailwindcss/postcss": {},
        autoprefixer: {},
      },
};
