#!/bin/sh
set -eu

: "${GAMMA_SERVER_URL:=}"

envsubst '${GAMMA_SERVER_URL}' < /etc/gamma/config.js.template > /usr/share/nginx/html/config.js
