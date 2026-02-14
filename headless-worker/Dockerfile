FROM mcr.microsoft.com/playwright:v1.50.0-jammy

WORKDIR /worker

COPY package.json ./package.json
RUN npm install --omit=dev

COPY worker.mjs ./worker.mjs

ENV NODE_ENV=production

CMD ["node", "worker.mjs"]

