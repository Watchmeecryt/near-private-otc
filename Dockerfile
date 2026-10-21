FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY web/package.json web/package-lock.json web/
RUN cd web && npm install --no-audit --no-fund
COPY shared shared
COPY keeper keeper
COPY web web
ARG VITE_PRIVY_APP_ID=cmvi99u1e01os0il20daip5mv
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID
RUN cd web && npx vite build && rm -rf node_modules
ENV NODE_ENV=production
CMD ["node", "keeper/index.mjs"]
