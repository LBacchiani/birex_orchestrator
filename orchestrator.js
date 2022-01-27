'use strict';

import { PrometheusDriver } from 'prometheus-query';

const prom = new PrometheusDriver({
    endpoint: "10.244.1.4:9090",
    baseURL: "/api/v1" // default value
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function monitoring() {

  while(true) {
    const q = 'up';
    prom.instantQuery(q).then((res) => {
        const series = res.result;
        series.forEach((serie) => {
            console.log("Serie:", serie.metric.toString());
            console.log("Time:", serie.value.time);
            console.log("Value:", serie.value.value);
        });
    }).catch(console.error);
    sleep(60000 * 5);
  }
}

monitoring();
