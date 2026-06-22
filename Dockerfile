FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/

RUN npm ci && npm ci --prefix server

COPY . .

RUN npm run build

EXPOSE 3001 5173

CMD ["npm", "run", "start", "--prefix", "server"]
