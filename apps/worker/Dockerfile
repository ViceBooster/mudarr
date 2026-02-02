FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg yt-dlp
COPY package.json ./
COPY apps/worker/package.json ./apps/worker/package.json
RUN npm install --workspaces
COPY tsconfig.base.json ./
COPY apps/worker ./apps/worker
WORKDIR /app/apps/worker
RUN npm run build
CMD ["node", "dist/index.js"]
