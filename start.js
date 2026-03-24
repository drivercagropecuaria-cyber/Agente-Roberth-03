const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const backendDir = path.join(__dirname, 'backend')
const tsxBin = path.join(backendDir, 'node_modules', '.bin', 'tsx')
const cmd = fs.existsSync(tsxBin) ? tsxBin : 'npx'
const args = fs.existsSync(tsxBin) ? ['src/index.ts'] : ['tsx', 'src/index.ts']
console.log('ORBIT iniciando:', cmd, args.join(' '))
const proc = spawn(cmd, args, { cwd: backendDir, stdio: 'inherit', env: process.env })
proc.on('exit', code => process.exit(code || 0))
proc.on('error', err => { console.error('Erro:', err.message); process.exit(1) })
