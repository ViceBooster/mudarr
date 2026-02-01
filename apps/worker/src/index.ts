import "dotenv/config";
import downloadWorker from "./downloadWorker.js";

console.log("Mudarr worker booting...");

process.on("SIGINT", async () => {
  await downloadWorker.close();
  process.exit(0);
});
