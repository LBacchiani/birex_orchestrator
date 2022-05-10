'use strict';

import { PrometheusDriver } from 'prometheus-query';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { promisify } from 'util';
import k8s from '@kubernetes/client-node';
import express from 'express'
import fetch from 'node-fetch';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const endpoint = "http://10.244.1.4:9090";
const baseURL = "/api/v1" // default value
const path = '/usr/src/app/edge-server/servizi-luca/standalone/'
const processor_cloud = path + 'processor-cloud.yaml'
const processor_edge = path + 'processor-edge.yaml'
var zone = "cloud"
var times = 0
let sizes = [80, 60, 20, 150, 80, 60, 40, 120]//[20, 40, 60, 80, 100, 120, 150]
var index = 0


const app = express();
const PORT = 8081;
const HOST = '0.0.0.0';

const prom = new PrometheusDriver({
  endpoint,
  baseURL
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeDelete(z) {
  var deleted = false
  while (!deleted) {
    await sleep(50)
    await prom.instantQuery('up{kubernetes_pod_name="processor-' + zone + '"}').then((res) => {
      const series = res.result;
      series.forEach((serie) => {
        if (!isNaN(serie.value.value)) {
          k8sApi.deleteNamespacedPod((zone == "cloud") ?
            'processor-cloud' :
            'processor-edge', 'default', true)
            .catch(err => { console.log(JSON.stringify(err)) });
          deleted = true;
        }
      });
    }).catch(console.error);
  }
  zone = z
}

async function apply(specPath) {
  const client = k8s.KubernetesObjectApi.makeApiClient(kc);
  const fsReadFileP = promisify(fs.readFile);
  const specString = await fsReadFileP(specPath, 'utf8');
  const specs = yaml.loadAll(specString);
  const validSpecs = specs.filter((s) => s && s.kind && s.metadata);
  const created = [];
  const start = new Date()
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
  const stop = new Date()
  console.log("Time to deploy: " + (stop - start) + "ms")
  return created;
}

async function setSize(inc = true) {
  await fetch("http://birex-collector:8080/birexcollector/actions/setSizes", {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ minSize: sizes[index % sizes.length], maxSize: sizes[index % sizes.length] })
  });
  if(inc) index = index + 1
}

async function retrieveLatency() {
  var latencyQuery = 'rate(istio_request_duration_milliseconds_sum{app="alerting"}[30s]) / rate(istio_requests_total{app="alerting"}[30s])'
  //var latencyQuery = 'rate(istio_request_duration_milliseconds_sum{app="alerting",destination_workload="processor-' + zone + '"}[10s]) / rate(istio_requests_total{app="alerting",destination_workload="processor-' + zone + '"}[10s])'
  await prom.instantQuery(latencyQuery).then(async (res) => {
    const serie = res.result.filter(serie => !isNaN(serie.value.value))[0]
    await retrieveBytes(serie.value.value)
  }).catch(console.error);
}

function moveToEdge() {
  //zone = "edge"
  apply(processor_edge).catch(err => { console.log(JSON.stringify(err)) })
  safeDelete("edge")
}

function moveToCloud() {
  //zone = "cloud"
  apply(processor_cloud).catch(err => { console.log(JSON.stringify(err)) })
  safeDelete("cloud")
}


async function retrieveBytes(latency) {
  var bytesQuery = 'rate(istio_response_bytes_sum{app="collector", source_canonical_service="unknown"}[30s]) / rate(istio_requests_total{app="collector", source_canonical_service="unknown"}[30s])'
  times = times + 1
  await prom.instantQuery(bytesQuery).then((res) => {
    const bytes = res.result.filter(serie => !isNaN(serie.value.value))[0].value.value
    console.log(zone + ": (" + latency + "," + bytes + ")")
    if (times % 16 == 0) console.log("-------")
    if (zone == "cloud" && latency > 1000 * 1.8 && times % 16 != 0) moveToEdge()
    else if ((zone == "edge" && latency < 1000 * 1 && bytes < 65 * 65 * 3500) || times % 16 == 0) moveToCloud()
  }).catch(console.error);
}

async function retrieveLatencyWithoutBytes() {
  let bytes = sizes[index % sizes.length]
  times = times + 1
  //var latencyQuery = 'rate(istio_request_duration_milliseconds_sum{app="alerting",destination_workload="processor-' + zone + '"}[30s]) / rate(istio_requests_total{app="alerting",destination_workload="processor-' + zone + '"}[30s])'
  console.log("querying zone: " + zone)
  await prom.instantQuery(latencyQuery).then(async (res) => {
    const latency = res.result.filter(serie => !isNaN(serie.value.value))[0].value.value
    console.log(zone + ": (" + latency + "," + bytes * bytes * 3500 + ")")
    if (times % 16 == 0) console.log("-------")
    if (zone == "cloud" && latency > 1000 * 1.8 && times % 16 != 0) moveToEdge()
    else if ((zone == "edge" && latency < 1000 * 1 && bytes < 65 * 65 * 3500) || times % 16 == 0) moveToCloud()
  }).catch(console.error);
}

async function monitoring() {
  //console.log(`Start monitoring...`)
  let i = 0
  setSize(false)
  await sleep(60000)
  while (i < 16) {
    if (i % 2 == 0) setSize()
    await sleep(30000)
    i = i + 1
    await retrieveLatency()
    //await retrieveLatencyWithoutBytes()
  }
}


monitoring()


//console.log("\nOrchestrator started\n")

//console.log(`Endpoint: ${endpoint}`)
//console.log(`Base URL: ${baseURL}\n`)

app.listen(PORT, HOST)
