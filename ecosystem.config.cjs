const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'dashboard-server',
      cwd: path.join(__dirname, 'server'),
      script: 'npm',
      args: 'run dev',
      env: { PORT: '3100' },
    },
    {
      name: 'dashboard-web',
      cwd: path.join(__dirname, 'web'),
      script: 'npm',
      args: 'run dev',
      env: { PORT: '3100', WEB_PORT: '9000' },
    },
  ],
};
