const express = require('express');
const os = require('os');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received since container start',
  registers: [register],
});

let requestCount = 0;

app.get('/', (req, res) => {
  requestCount += 1;
  httpRequestsTotal.inc();
  res.json({
    hostname: os.hostname(),
    pet: process.env.PET || '',
    requests: requestCount,
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
