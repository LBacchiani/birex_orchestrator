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

const endpoint = "http://10.244.1.23:9090";
const baseURL = "/api/v1" // default value
const path = '/usr/src/app/standalone'
const processor_cloud = path + '/processor-cloud.yaml'
const processor_edge = path + '/processor-edge.yaml'
const sizes = [80, 60, 20, 150, 80, 60, 40, 120]
var zone = "cloud"
var times = 0
var index = 0


const app = express();
const PORT = 8081;
const HOST = '0.0.0.0';

const prom = new PrometheusDriver({
  endpoint,
  baseURL
});

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function safeDelete(z) {
  k8sApi.deleteNamespacedPod('processor-' + zone, 'default', true).catch(err => { console.log("Error in delete: " + JSON.stringify(err)) });
  zone = z
}


async function apply(specPath, zone) {
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
      let res = await client.read(spec);
      while (res.body.status.phase == "Pending") res = await client.read(spec);
    }
  }
  const stop = new Date()
  console.log("Time to deploy: " + (stop - start) + "ms")
  safeDelete(zone)
  return created;
}

function setSize() {
  fetch("http://birex-collector:8080/birexcollector/actions/setSizes", {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ minSize: sizes[index % sizes.length], maxSize: sizes[index % sizes.length] })
  }).catch("Error in set size: " + console.error);
  index = index + 1
}

function moveToEdge() { apply(processor_edge, "edge").catch(err => { console.log("Error in move to edge: " + JSON.stringify(err)) }) }

function moveToCloud() { apply(processor_cloud, "cloud").catch(err => { console.log("Error in move to cloud: " + JSON.stringify(err)) }) }

function launchQuery(query) { return prom.instantQuery(query) }

function retrieveStats(i) {return fetch(`http://birex-processor-${i + 1}:3000/getStats`).then(res => res.json())}


function retrieveLatency() {
  var query = ['irate(istio_request_duration_milliseconds_sum{app="alerting",response_code="200"}[30s])',
    'irate(istio_requests_total{app="alerting",response_code="200"}[30s])']
  Promise.all([launchQuery, launchQuery].map((func, i) => func(query[i]))).then((result) => {
    let latencies = result.map(res => res.avgLatency)
    let bytes = result.map(res => res.avgDataSize)
    for (let i = 0; i < cleaned_result[0].length; i++) {
      latency_sum += cleaned_result[0][i]
      request_sum += cleaned_result[1][i]
    }
    retrieveBytes(latency_sum / request_sum)
  }).catch(err => console.log("Error in retrieve latency: " + JSON.stringify(err)))
}

function retrieveBytes(latency) {
  times = times + 1
  Promise.all([retrieveStats].map((func, i) => func(query[i]))).then((result) => {
    let latency = result.map(res => res.avgLatency)[0]
    let bytes = result.map(res => res.avgDataSize)[0]
    console.log(zone + ": (" + latency + "," + bytes + ")")
    if (times % 16 == 0) console.log("-------")
    if (zone == "cloud" && latency > 1000 * 1.8 && times % 16 != 0) moveToEdge()
    else if ((zone == "edge" && latency < 1000 * 1 && bytes < 65 * 65 * 3500) || times % 16 == 0) moveToCloud()
  }).catch(err => console.log("Error in retrieve bytes: " + JSON.stringify(err)))
}


async function monitoring() {
  let i = 0
  await sleep(10000)
  while (i < 16) {
    if (i % 2 == 0) setSize()
    await sleep(30000)
    i = i + 1
    retrieveLatency()
  }
}

monitoring()


//console.log("\nOrchestrator started\n")

//console.log(`Endpoint: ${endpoint}`)
//console.log(`Base URL: ${baseURL}\n`)

app.listen(PORT, HOST)
