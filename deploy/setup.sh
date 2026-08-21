#!/usr/bin/env bash
set -euo pipefail

# goelprep-server  50.19.228.178  t3.micro — 2G swap so npm build fits in 1 GB RAM
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get update -y
sudo apt-get install -y rsync
sudo mkdir -p /opt/api-server
sudo chown -R ubuntu:ubuntu /opt/api-server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sudo cp "$SCRIPT_DIR/api-server.service" /etc/systemd/system/api-server.service
sudo systemctl daemon-reload
sudo systemctl enable api-server

echo "Create /opt/api-server/.env (see .env.example). Port 8080."
echo "echo 'ubuntu ALL=NOPASSWD: /usr/bin/systemctl daemon-reload, /usr/bin/systemctl restart api-server, /usr/bin/systemctl is-active api-server' | sudo tee /etc/sudoers.d/api-server-deploy"
