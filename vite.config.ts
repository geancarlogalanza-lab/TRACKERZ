import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { GEAN_STAGE_CSS, geanShellHtml } from './src/lib/gean.ts'

/**
 * Inlines the loading screen's first frame — empty GEAN vessels — into
 * index.html, so it is on screen before any JavaScript or stylesheet has
 * arrived. The geometry comes from the same module the canvas draws from.
 */
const geanShell: Plugin = {
  name: 'gean-shell',
  transformIndexHtml(html) {
    return html
      .replace('<!--gean-stage-css-->', `<style>${GEAN_STAGE_CSS}</style>`)
      .replace('<!--gean-shell-->', geanShellHtml())
  },
}

// Relative base so the built bundle works from a GitHub Pages project
// subpath (user.github.io/repo/) without hardcoding the repo name.
export default defineConfig({
  base: './',
  plugins: [react(), geanShell],
})
