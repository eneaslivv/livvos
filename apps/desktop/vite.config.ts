import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    // Prevent Vite from clearing the screen 
    clearScreen: false,
    // Tauri expects a fixed port
    server: {
        port: 1420,
        strictPort: true,
    },
    // Env variables starting with TAURI_ are exposed
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        // Tauri supports es2021
        target: ['es2021', 'chrome100', 'safari13'],
        // Don't minify for debug builds
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        // Produce sourcemaps for debug builds
        sourcemap: !!process.env.TAURI_DEBUG,
    },
});
