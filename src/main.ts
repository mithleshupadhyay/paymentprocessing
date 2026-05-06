import { settings } from "./paymentprocessing/config";
import { configureLogging, getLogger } from "./paymentprocessing/logging";
import { createApp } from "./paymentprocessing/main";

configureLogging();

const logger = getLogger("main");
const app = createApp();

const server = app.listen(settings.PORT);

server.on("listening", () => {
  logger.info("Payment Processing API started", {
    appName: settings.APP_NAME,
    env: settings.APP_ENV,
    port: settings.PORT,
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error("Payment Processing API could not start because the port is already in use", {
      port: settings.PORT,
      hint: `Stop the existing process on port ${settings.PORT} or run with PORT=3001 npm run dev.`,
    });
    process.exit(1);
  }

  logger.error("Payment Processing API failed to start", { error });
  process.exit(1);
});
