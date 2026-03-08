#!/bin/sh
# Injecte le resolver DNS du pod dans la config nginx
# (permet à nginx de résoudre les hostnames CalDAV via proxy_pass variable)
NGINX_RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
export NGINX_RESOLVER
envsubst '${NGINX_RESOLVER}' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
