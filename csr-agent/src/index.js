import 'dotenv/config';

import express from 'express';
import bodyParser from 'body-parser';

import chatRouter from './routes/chat.route.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { logger } from './utils/logger.utils.js';

const PORT = 8080;

const app = express();

app.use(bodyParser.json({ limit: '1mb' }));

// Mounted at /csrAgent to match this app's `endpoint` in connect.yaml.
app.use('/csrAgent', chatRouter);

app.use(errorMiddleware);

const server = app.listen(PORT, () => {
  logger.info(`csr-agent listening on port ${PORT}`);
});

export default server;
