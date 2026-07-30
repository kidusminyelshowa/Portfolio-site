const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const rootStatic = path.join(__dirname, '..');
app.use(express.static(rootStatic));

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from server' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(rootStatic, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
