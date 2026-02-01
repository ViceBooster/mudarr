FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --workspaces --omit=dev
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
