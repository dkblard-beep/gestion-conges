const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Serve static files from root directory
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for any route not matched by static files
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Suivi Congés & RTT server running at http://${HOST}:${PORT}`);
});
