FROM node:20-alpine
RUN apk add --no-cache ffmpeg python3 py3-pip
RUN pip3 install --no-cache-dir yt-dlp
WORKDIR /app
COPY package.json ./
COPY apps/server/package.json ./apps/server/package.json
RUN npm install --workspaces --omit=dev
COPY tsconfig.base.json ./
COPY apps/server ./apps/server
WORKDIR /app/apps/server
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
