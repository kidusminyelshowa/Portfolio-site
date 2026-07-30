const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve production build of client if available
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Serve root static assets (css, js, assets) so old paths keep working
const rootStatic = path.join(__dirname, '..');
app.use('/assets', express.static(path.join(rootStatic, 'assets')));
app.use('/css', express.static(path.join(rootStatic, 'css')));
app.use('/js', express.static(path.join(rootStatic, 'js')));

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from server' });
});

// Fallback to index.html for client-side routing when dist exists
app.get('*', (req, res) => {
  const indexFile = path.join(clientDist, 'index.html');
  if (require('fs').existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).send('Not Found');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
