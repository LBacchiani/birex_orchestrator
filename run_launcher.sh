#!/bin/bash
while true
do
        kubectl apply -k edge-server/servizi-luca/standalone/
        sleep 30
        kubectl apply -f orchestrator.yaml
        sleep 11m
        kubectl logs orchestrator >> orchestrator.log
        kubectl delete -k edge-server/servizi-luca/standalone/
        kubectl delete -f edge-server/servizi-luca/standalone/processor-edge.yaml
        kubectl delete -f orchestrator.yaml
        sleep 30
done
