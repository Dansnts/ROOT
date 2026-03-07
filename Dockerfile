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

# Copier configuration personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier fichiers statiques
COPY --from=builder /app/out /usr/share/nginx/html

# Vérifier configuration
RUN nginx -t

# Nginx écoute sur HTTP (Traefik gère HTTPS)
EXPOSE 80

# Lancer Nginx
CMD ["nginx", "-g", "daemon off;"]