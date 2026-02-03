import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT ?? 6379)
};

const hlsControlQueue = new Queue("hlsControlQueue", { connection });

export default hlsControlQueue;

