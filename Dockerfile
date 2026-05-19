FROM node:20-alpine
RUN apk add --no-cache git && \
    git config --global user.name "obsidian-autocommit" && \
    git config --global user.email "obsidian@localhost"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --production
COPY lib/ ./lib/
COPY server.mjs ./
EXPOSE 3000
CMD ["node", "server.mjs", "/vault/Obsidian Vault"]
