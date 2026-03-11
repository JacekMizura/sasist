import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Prefer .tsx over .ts so reserveLocationStyle resolves to .tsx
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json', '.mjs'],
  },
})
