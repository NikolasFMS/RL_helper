const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT_DIR = __dirname;

const BLOCKED_PATHS = new Set([
  '/server.js',
  '/package.json',
  '/package-lock.json',
]);

app.use((req, res, next) => {
  if (
    BLOCKED_PATHS.has(req.path) ||
    req.path === '/node_modules' ||
    req.path.startsWith('/node_modules/')
  ) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(ROOT_DIR, { dotfiles: 'ignore' }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
