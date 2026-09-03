import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'dev:enrich'], { shell: true, stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:personal'], { shell: true, stdio: 'inherit' }),
];

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => {
  if (code && code !== 0) process.exitCode = code;
});
