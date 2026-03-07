import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Génère un export statique dans /out — aucun serveur Node.js requis
  output: "export",
  // Nécessaire pour que les assets soient référencés correctement derrière nginx
  trailingSlash: true,
};

export default nextConfig;
