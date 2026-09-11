import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root or server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/trao_interview_prep',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-jwt-key-trao-assessment-2026',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
  groqFallbackModel: process.env.GROQ_FALLBACK_MODEL || '',
  allowLocalUrls: process.env.ALLOW_LOCAL_URLS === 'true' || process.env.NODE_ENV !== 'production',
  crawlTimeoutMs: parseInt(process.env.CRAWL_TIMEOUT_MS || '8000', 10),
  maxCrawlPages: parseInt(process.env.MAX_CRAWL_PAGES || '4', 10),
};
