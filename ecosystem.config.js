require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'Server',
      script: 'bin/www',

      // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
      interpreter_args: '--expose-gc --max-old-space-size=4096',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '8G',
      env: {
        NODE_ENV: "production",
      },
    }
  ]
};
