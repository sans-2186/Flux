import { spawn } from 'node:child_process'

process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' ')
const port = process.env.PORT || '3000'
const child = spawn(
  process.execPath,
  ['./node_modules/next/dist/bin/next', 'dev', '--port', port, '--hostname', '0.0.0.0'],
  { stdio: 'inherit', env: process.env },
)
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
