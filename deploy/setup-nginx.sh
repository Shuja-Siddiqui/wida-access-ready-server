#!/usr/bin/env bash
# Run on goelprep-server after DNS for api.goelprep.com points here.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EMAIL="${CERTBOT_EMAIL:-admin@zentu.io}"

sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx

sudo cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/api-server
sudo ln -sfn /etc/nginx/sites-available/api-server /etc/nginx/sites-enabled/api-server
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

sudo certbot --nginx -d api.goelprep.com --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "API is https://api.goelprep.com"
echo "Set APP_URL=https://goelprep.com in /opt/api-server/.env then: sudo systemctl restart api-server"
