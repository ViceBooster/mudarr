FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 py3-pip ffmpeg
RUN pip3 install --no-cache-dir yt-dlp
COPY package.json ./
COPY apps/worker/package.json ./apps/worker/package.json
RUN npm install --workspaces --omit=dev
COPY tsconfig.base.json ./
COPY apps/worker ./apps/worker
WORKDIR /app/apps/worker
RUN npm run build
CMD ["node", "dist/index.js"]
