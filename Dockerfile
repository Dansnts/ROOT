# ─────────────────────────────────────────────────────────────────────────────
# ROOT — Dockerfile multi-stage pour Kubernetes avec Traefik
#
# Stage 1 (builder) : compile l'app Next.js en export statique (/out)
# Stage 2 (runner)  : sert les fichiers statiques avec nginx:alpine (HTTP simple)
# Image finale : ~25 Mo, aucun Node.js
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 : Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copier manifestes pour cache des dépendances
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copier le code source
COPY . .

# Désactiver la télémétrie Next.js
ENV NEXT_TELEMETRY_DISABLED=1

# Build statique → génère /app/out
RUN npm run build

# ── Stage 2 : Runner ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Supprimer configuration Nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copier le template de configuration (resolver injecté au démarrage)
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Copier fichiers statiques
COPY --from=builder /app/out /usr/share/nginx/html

# Copier et rendre exécutable le script entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# envsubst est inclus dans nginx:alpine (via gettext), sinon l'installer
RUN envsubst --version || apk add --no-cache gettext

# Nginx écoute sur HTTP (Traefik gère HTTPS)
EXPOSE 80

# L'entrypoint injecte le resolver DNS puis démarre nginx
CMD ["/docker-entrypoint.sh"]