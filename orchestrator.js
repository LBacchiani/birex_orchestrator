'use strict';

import { PrometheusDriver } from 'prometheus-query';

const endpoint = "10.244.1.4:9090";
const baseURL = "/api/v1" // default value

const prom = new PrometheusDriver({
  endpoint,
  baseURL
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function monitoring() {

  while (true) {
    const q = 'up';
    console.log(`Executing query:     ${q}`)

    await prom.instantQuery(q).then((res) => {
      const series = res.result;
      series.forEach((serie) => {
        console.log("Serie:", serie.metric.toString());
        console.log("Time:", serie.value.time);
        console.log("Value:", serie.value.value);
      });
    }).catch(console.error);

    console.log(`\nI will sleep for 5 minutes\n`)
    await sleep(60000 * 5);
  }
}


monitoring();

console.log("\nOrchestrator started\n")

console.log(`Endpoint: ${endpoint}`)
console.log(`Base URL: ${baseURL}\n`)
