#!/usr/bin/env bash
set -euo pipefail

export APP_ENV=production

build_image() {
  docker build -t example/app .
}

deploy() {
  kubectl apply -f k8s.yaml
}
