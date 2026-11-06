import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The managed Clerk integration provides only a public key with this prefix.
  // Server credentials have no public prefix and never enter the browser bundle.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  build: { target: 'es2022' },
});
