// start.js — Entrada para Render (roda a partir da raiz)
const { spawn } = require('child_process')
const path = require('path')

const backendDir = path.join(__dirname, 'backend')
const tsx = path.join(backendDir, 'node_modules', '.bin', 'tsx')

console.log('🛸 ORBIT iniciando backend...')

const proc = spawn(tsx, ['src/index.ts'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: process.env
})

proc.on('exit', (code) => process.exit(code || 0))
proc.on('error', (err) => {
  console.error('Erro ao iniciar:', err.message)
  process.exit(1)
})
