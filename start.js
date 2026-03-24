#!/usr/bin/env node
// start.js — Script de entrada para deploy no Render/Railway
// Roda a partir da raiz do repositório e direciona para o backend
require('child_process').spawn(
  'node',
  ['--require', 'dotenv/config', 'node_modules/.bin/tsx', 'src/index.ts'],
  {
    cwd: __dirname + '/backend',
    stdio: 'inherit',
    env: process.env
  }
).on('exit', process.exit)
