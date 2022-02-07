'use strict';

import { PrometheusDriver } from 'prometheus-query';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { promisify } from 'util';

const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const endpoint = "http://10.244.1.4:9090";
const baseURL = "/api/v1" // default value
const latency = 'rate(istio_request_duration_milliseconds_sum{app="alerting"}[1m]) / rate(istio_requests_total{app="alerting"}[1m])'
//const throughput =
const path = '/usr/src/app/edge-server/servizi-luca/'
const processor_cloud = path + 'processor-cloud.yaml'
const processor_edge = path + 'processor-edge.yaml'


const prom = new PrometheusDriver({
  endpoint,
  baseURL
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apply(specPath: string): Promise<k8s.KubernetesObject[]> {
    const client = k8s.KubernetesObjectApi.makeApiClient(kc);
    const fsReadFileP = promisify(fs.readFile);
    const specString = await fsReadFileP(specPath, 'utf8');
    const specs: k8s.KubernetesObject[] = yaml.loadAll(specString);
    const validSpecs = specs.filter((s) => s && s.kind && s.metadata);
    const created: k8s.KubernetesObject[] = [];
    for (const spec of validSpecs) {
        // this is to convince the old version of TypeScript that metadata exists even though we already filtered specs
        // without metadata out
        spec.metadata = spec.metadata || {};
        spec.metadata.annotations = spec.metadata.annotations || {};
        delete spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
        spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'] = JSON.stringify(spec);
        try {
            // try to get the resource, if it does not exist an error will be thrown and we will end up in the catch
            // block.
            await client.read(spec);
            // we got the resource, so it exists, so patch it
            const response = await client.patch(spec);
            created.push(response.body);
        } catch (e) {
            // we did not get the resource, so it does not exist, so create it
            const response = await client.create(spec);
            created.push(response.body);
        }
    }
    return created;
}

async function monitoring() {

  while (true) {
    console.log(`\nI will sleep for 5 minutes\n`)
    await sleep(600 * 5);

    console.log(`Executing query:     ${latency}`)

    await prom.instantQuery(latency).then((res) => {
      const series = res.result;
      series.forEach((serie) => {
        console.log("Serie:", serie.metric.toString());
        console.log("Time:", serie.value.time);
        console.log("Value:", serie.value.value);
        if(serie.value.value > 80) {
          k8sApi.deleteNamespacedPod('processor','default')
        }
      });
    }).catch(console.error);
  }
}


monitoring();

console.log("\nOrchestrator started\n")

console.log(`Endpoint: ${endpoint}`)
console.log(`Base URL: ${baseURL}\n`)
