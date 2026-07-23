const { defineConfig } = require('vite');
module.exports = defineConfig({ server: { proxy: { '/api': 'http://localhost:3001' } } });
