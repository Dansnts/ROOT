# ─────────────────────────────────────────────────────────────────────────────
# ROOT — Dockerfile multi-stage
#
# Stage 1 (builder) : compile l'app Next.js en export statique (/out)
# Stage 2 (runner)  : sert les fichiers statiques avec nginx:alpine
#
# Image finale : ~25 Mo, aucun Node.js, aucune surface d'attaque inutile.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 : Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Métadonnées
LABEL stage="builder"

WORKDIR /app

# Copier les manifestes en premier pour tirer parti du cache des layers Docker.
# Si package.json ne change pas, npm ci est mis en cache.
COPY package.json package-lock.json ./

# Installation des dépendances (mode CI : lockfile strict, pas de scripts postinstall)
RUN npm ci --ignore-scripts

# Copier le reste du code source
COPY . .

# Désactiver la télémétrie Next.js pendant le build
ENV NEXT_TELEMETRY_DISABLED=1

# Build statique → génère le dossier /app/out
RUN npm run build

# ── Stage 2 : Runner ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Supprimer la configuration nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copier notre configuration sécurisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier l'export statique depuis le stage builder
COPY --from=builder /app/out /usr/share/nginx/html

# Vérifier que la configuration nginx est valide avant de démarrer
RUN nginx -t

# nginx écoute sur 80 (HTTP — TLS terminé par le reverse proxy upstream)
EXPOSE 80

# Lancer nginx en mode foreground (requis pour Docker)
CMD ["nginx", "-g", "daemon off;"]
