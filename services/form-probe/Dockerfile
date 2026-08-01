# Stateless form-probe worker (AD-12). One env var: PROBE_SECRET —
# the HMAC key shared with the Convex deployment (FORM_WORKER_SECRET).
FROM mcr.microsoft.com/playwright:v1.60.0-jammy
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY index.mjs .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.mjs"]
