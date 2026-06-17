module.exports = {
  apps: [
    {
      name: 'marspay',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env_file: '.env',
      error_file: 'logs/marspay-error.log',
      out_file: 'logs/marspay-out.log',
      time: true,
    },
  ],
};
