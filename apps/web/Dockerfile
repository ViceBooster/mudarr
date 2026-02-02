FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --workspaces
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build
EXPOSE 3000
RUN chmod +x /app/apps/web/entrypoint.sh
CMD ["/app/apps/web/entrypoint.sh"]
