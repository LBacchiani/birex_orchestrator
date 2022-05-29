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
const path = '/usr/src/app/standalone'
const processor_cloud = path + '/processor-cloud.yaml'
const processor_edge = path + '/processor-edge.yaml'
//const sizes = [80, 60, 20, 150, 80, 60, 40, 120]
const sizes = [20]//[20, 40, 60, 80, 100, 120, 140]
var zone = "cloud"
var times = 0
var index = 0


const app = express();
const PORT = 8081;
const HOST = '0.0.0.0';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function isRunning() {return fetch(`http://birex-processor:3000/getStatus`).then(res => res.json())}

function safeDelete(z) {
  isRunning().then(async res => {
    if(res === true) {
      k8sApi.deleteNamespacedPod('processor-' + zone, 'default', true).catch(err => { console.log("Error in delete: " + JSON.stringify(err))})
      zone = z
    }
    else {
      await sleep(3000)
      safeDelete(z)
    }
  })
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
  //index = index + 1
}

function moveToEdge() { apply(processor_edge, "edge").catch(err => { console.log("Error in move to edge: " + JSON.stringify(err)) }) }

function moveToCloud() { apply(processor_cloud, "cloud").catch(err => { console.log("Error in move to cloud: " + JSON.stringify(err)) }) }

function resetStats() {return fetch(`http://birex-processor:3000/resetStats`)}

function retrieveStats() {return fetch(`http://birex-processor:3000/getStats`).then(res => res.json())}

async function retrieveMetrics() {
  times = times + 1
  await Promise.all([retrieveStats].map((func) => func())).then((result) => {
    let latency = result.map(res => res.avgLatency)[0]
    let bytes = result.map(res => res.avgDataSize)[0]
    console.log(zone + ": (" + latency + "," + bytes + ")")
    //if (zone == "cloud" && latency > 1000 * 1.8) moveToEdge()
    //else if (zone == "edge" && latency < 1000 * 1 && bytes < 65 * 65 * 3500) moveToCloud()
  }).catch(err => console.log("Error in retrieve bytes: " + JSON.stringify(err)))
}


async function monitoring() {
  let i = 0
  await sleep(10000)
  await resetStats()
  while (i < 10) {
    if (i % 10 == 0) setSize()
    await sleep(10000)
    await retrieveMetrics()
    await resetStats()
    i = i + 1
  }
  console.log("-------")
}

monitoring()


//console.log("\nOrchestrator started\n")

//console.log(`Endpoint: ${endpoint}`)
//console.log(`Base URL: ${baseURL}\n`)

app.listen(PORT, HOST)
