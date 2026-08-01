import { Redis } from '@upstash/redis';
import configUtils from '../utils/config.util.js';

let redisClient;

export function getRedisClient() {
  if (!redisClient) {
    const config = configUtils.readConfiguration();
    redisClient = new Redis({
      url: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken,
    });
  }
  return redisClient;
}
