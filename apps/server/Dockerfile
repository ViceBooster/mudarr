FROM node:20-alpine
RUN apk add --no-cache ffmpeg yt-dlp
WORKDIR /app
COPY package.json ./
COPY apps/server/package.json ./apps/server/package.json
RUN npm install --workspaces
COPY tsconfig.base.json ./
COPY apps/server ./apps/server
WORKDIR /app/apps/server
RUN npm run build
EXPOSE 3002
CMD ["node", "dist/index.js"]
