#!/bin/bash
while true
do
        kubectl apply -k edge-server/servizi-luca/pipeline1/
        sleep 30
        kubectl apply -f orchestrator.yaml
        sleep 50m
        echo '\n-------\n' >> orchestrator.log
        kubectl logs pod orchestrator >> orchestrator.log
        kubectl delete -k edge-server/servizi-luca/pipeline1/
        kubectl delete -f edge-server/servizi-luca/pipeline1/processor-edge.yaml
        kubectl delete -f orchestrator.yaml
        sleep 30
done
