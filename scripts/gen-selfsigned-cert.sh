#!/usr/bin/env bash
# 生成 Nginx 自签证书占位（无域名阶段使用；拿到正式证书后替换 nginx/certs/ 下文件即可）
set -euo pipefail

mkdir -p nginx/certs
if [ ! -f nginx/certs/server.crt ] || [ ! -f nginx/certs/server.key ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout nginx/certs/server.key \
    -out nginx/certs/server.crt \
    -subj "/CN=${APP_BASE_URL:-127.0.0.1}"
  echo "已生成自签证书：nginx/certs/server.crt / server.key"
else
  echo "证书已存在，跳过生成"
fi
