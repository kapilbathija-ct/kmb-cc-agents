import { Router } from 'express';
import { chatHandler, healthHandler } from '../controllers/chat.controller.js';
import { verifyInboundAuth } from '../middlewares/auth.middleware.js';
import { rateLimitMiddleware } from '../middlewares/rate-limit.middleware.js';

const chatRouter = Router();

chatRouter.get('/status', healthHandler);
chatRouter.post('/chat', verifyInboundAuth, rateLimitMiddleware, chatHandler);

export default chatRouter;
