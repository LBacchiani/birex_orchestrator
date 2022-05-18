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

const endpoint = "http://10.244.1.3:9090";
const baseURL = "/api/v1" // default value
const path = '/usr/src/app/pipelines/pipeline'
const processor_cloud = '/processor-cloud.yaml'
const processor_edge =  '/processor-edge.yaml'
const multi_sizes = [[80, 60, 20, 150, 80, 60, 40, 120],[60, 40, 120, 80, 60, 20, 150, 80],[20, 150, 80, 60, 40, 120, 80, 60]]
var zone = ["cloud","cloud","cloud"]
var times = 0
var index = 0


const app = express();
const PORT = 8081;
const HOST = '0.0.0.0';

const prom = new PrometheusDriver({
  endpoint,
  baseURL
});

function sleep(ms) {return new Promise(resolve => setTimeout(resolve, ms));}

function safeDelete(i, z) {
  k8sApi.deleteNamespacedPod((zone[i] == "cloud") ? `processor-cloud-${i+1}` : `processor-edge-${i+1}`, 'default', true)
  .catch(err => { console.log(JSON.stringify(err))});
  zone[i] = z
}

async function apply(i, specPath, zone) {
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
  safeDelete(i, zone)
  return created;
}

async function setSizes() {
  for(let i = 0; i < 3; i++) {
    await fetch(`http://birex-collector-${i+1}:8080/birexcollector/actions/setSizes`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ minSize: multi_sizes[i][index % multi_sizes[i].length], maxSize: multi_sizes[i][index % multi_sizes[i].length] })
    });
  }
  index = index + 1
}

function retrieveLatency(i) {return prom.instantQuery(`irate(istio_request_duration_milliseconds_sum{app="alerting-${i+1}"}[30s]) / irate(istio_requests_total{app="alerting-${i+1}"}[30s])`)}

async function retrieveLatencies() {
  Promise.all([retrieveLatency, retrieveLatency, retrieveLatency].map((func,i) => func(i))).then((result) => {
    const latencies = result.map(serie => serie.result.filter(r => !isNaN(r.value.value))[0].value.value)
    retrieveMultipleBytes(latencies)
  }).catch(console.error);
}

function moveToEdge(i) {apply(i, path + (i+1) + processor_edge, "edge").catch(err => { console.log(JSON.stringify(err))})}

function moveToCloud(i) {apply(i, path + (i+1) + processor_cloud, "cloud").catch(err => { console.log(JSON.stringify(err))})}

function retrieveBytes(i) {return prom.instantQuery(`irate(istio_response_bytes_sum{app="collector-${i+1}", source_canonical_service="unknown"}[30s]) / irate(istio_requests_total{app="collector-${i+1}", source_canonical_service="unknown"}[30s])`)}

function retrieveMultipleBytes(latencies) {
  times = times + 1
  Promise.all([retrieveBytes, retrieveBytes, retrieveBytes].map((func,i) => func(i))).then((result) => {
    const bytes = result.map(serie => serie.result.filter(r => !isNaN(r.value.value))[0].value.value)
    var toPrint = ``
    for(let i = 0; i < 3; i++) {
      toPrint += `Pipeline${i+1}[zone:${zone[i]}]:(${latencies[i]},${bytes[i]}) `
    }
    console.log(toPrint)
    if (times % 16 == 0) console.log("-------")
    var max = Math.max(...latencies)
    const index = latencies.indexOf(max);
    if(times % 16 != 0){
      if(max > 1000 * 1.8) {
        if(zone.filter(z => z == "edge").length == 0) moveToEdge(index)
        else {
          const edge_index = zone.indexOf("edge")
          if(edge_index != index) {
            moveToCloud(edge_index)
            moveToEdge(index)
          }
        }
      } else if(zone[index] == "edge" && max < 1000 * 1 && bytes[index] < 65 * 65 * 3500) moveToCloud(index)
    }
  }).catch(console.error);
}

async function monitoring() {
  let i = 0
  await sleep(10000)
  while (i < 16) {
    if (i % 2 == 0) setSizes()
    await sleep(30000)
    i = i + 1
    await retrieveLatencies()
  }
}

monitoring()

app.listen(PORT, HOST)
