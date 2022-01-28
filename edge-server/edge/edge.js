'use strict';

const express = require('express');
const app = express();
const axios = require('axios');
const process = require('process');
const fs = require('fs');
const PORT = 8080;
const HOST = '0.0.0.0';
var received = 0

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/', async (req, res) =>  {
    received = req.query.value || received;
    await sleep(5000);
    res.send('Received: ' + received);
});

app.listen(PORT, HOST);

console.log(`Running on http://${HOST}:${PORT}`);
