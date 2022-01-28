'use strict';
const axios = require('axios');
const process = require('process');
const fs = require('fs');

var n = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request() {
  while(true) {
    let response = axios.get("http://edge-cluster-ip:8080?value=" + n);
    console.log(response.data);
    n = n+1;
    await sleep(10);
  }
}

request();
