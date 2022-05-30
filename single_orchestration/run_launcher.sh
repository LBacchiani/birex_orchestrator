#!/bin/bash
while true
do
        kubectl apply -k standalone/
        kubectl apply -f orchestrator.yaml
        sleep 3m
        kubectl logs orchestrator >> orchestrator.log
        kubectl delete -k standalone/
        kubectl delete -f standalone/processor-edge.yaml
        kubectl delete -f orchestrator.yaml
        sleep 30
done
