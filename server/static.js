const express = require('express');
const path = require('path');

const app = express();
const [site, portValue] = process.argv.slice(2);
const allowedSites = new Set(['patient-portal', 'doctor-dashboard']);
const port = Number(portValue);

if (!allowedSites.has(site) || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: node server/static.js <patient-portal|doctor-dashboard> <port>');
  process.exit(1);
}

const root = path.join(__dirname, '..', site);
app.use(express.static(root, { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(root, 'index.html')));

app.listen(port, () => {
  console.log(`${site} available at http://localhost:${port}`);
});
