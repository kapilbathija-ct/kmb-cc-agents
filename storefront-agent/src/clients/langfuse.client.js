import { Langfuse } from 'langfuse';
import configUtils from '../utils/config.util.js';

let langfuseClient;

export function getLangfuseClient() {
  if (!langfuseClient) {
    const config = configUtils.readConfiguration();
    langfuseClient = new Langfuse({
      secretKey: config.langfuseSecretKey,
      publicKey: config.langfusePublicKey,
      baseUrl: config.langfuseBaseUrl,
    });
  }
  return langfuseClient;
}
