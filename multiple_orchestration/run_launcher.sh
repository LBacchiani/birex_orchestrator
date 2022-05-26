#!/bin/bash
while true
do
        kubectl apply -f pipelines/generator-ip.yaml
        kubectl apply -f pipelines/generator.yaml
        kubectl apply -k pipelines/pipeline1
        kubectl apply -k pipelines/pipeline2
        kubectl apply -k pipelines/pipeline3
        kubectl apply -f orchestrator.yaml
        sleep 4m
        kubectl logs multiple-orchestrator >> multiple_orchestrator.log
        kubectl delete -f pipelines/generator-ip.yaml
        kubectl delete -f pipelines/generator.yaml
        kubectl delete -k pipelines/pipeline1
        kubectl delete -k pipelines/pipeline2
        kubectl delete -k pipelines/pipeline3
        kubectl delete -f pipelines/pipeline1/processor-edge.yaml
        kubectl delete -f pipelines/pipeline2/processor-edge.yaml
        kubectl delete -f pipelines/pipeline3/processor-edge.yaml
        kubectl delete -f orchestrator.yaml
        sleep 30
done
