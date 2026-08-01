import 'dotenv/config';

import express from 'express';
import bodyParser from 'body-parser';

import chatRouter from './routes/chat.route.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { logger } from './utils/logger.utils.js';

const PORT = process.env.PORT || 8080;

const app = express();

app.use(bodyParser.json({ limit: '1mb' }));

// Mounted at /storefrontAgent to match this app's `endpoint` in connect.yaml.
app.use('/storefrontAgent', chatRouter);

app.use(errorMiddleware);

const server = app.listen(PORT, () => {
  logger.info(`storefront-agent listening on port ${PORT}`);
});

export default server;
