import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://brk828.github.io',
  base: process.env.NODE_ENV === 'production' ? '/AFLFantasyFootball' : '/',
  output: 'static',
});
