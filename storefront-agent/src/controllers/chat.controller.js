import CustomError from '../errors/custom.error.js';
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_OK,
  HTTP_STATUS_SERVER_ERROR,
} from '../constants/http.status.constants.js';
import {
  getConversationHistory,
  saveConversationHistory,
} from '../services/conversation.service.js';
import { runAgentTurn } from '../services/agent.service.js';
import { logger } from '../utils/logger.utils.js';

export const chatHandler = async (request, response) => {
  const { customerId, sessionId, message } = request.body || {};

  if (!customerId || !sessionId || !message) {
    return response
      .status(HTTP_STATUS_BAD_REQUEST)
      .send(
        new CustomError(
          HTTP_STATUS_BAD_REQUEST,
          'customerId, sessionId, and message are all required.'
        )
      );
  }

  try {
    const history = await getConversationHistory(customerId, sessionId);
    const { replyText, updatedHistory, products } = await runAgentTurn({
      identityId: customerId,
      sessionId,
      userMessage: message,
      history,
    });

    await saveConversationHistory(customerId, sessionId, updatedHistory);

    return response.status(HTTP_STATUS_OK).send({ reply: replyText, products });
  } catch (error) {
    logger.error(error);
    return response
      .status(HTTP_STATUS_SERVER_ERROR)
      .send(
        new CustomError(
          HTTP_STATUS_SERVER_ERROR,
          'The agent could not process this message.'
        )
      );
  }
};

export const healthHandler = (_request, response) => {
  response.status(HTTP_STATUS_OK).send({ status: 'ok' });
};
