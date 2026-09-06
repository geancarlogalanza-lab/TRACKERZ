import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built bundle works from a GitHub Pages project
// subpath (user.github.io/repo/) without hardcoding the repo name.
export default defineConfig({
  base: './',
  plugins: [react()],
})
