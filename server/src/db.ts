import mongoose from 'mongoose';
import { config } from './config';

/**
 * Sanitizes MongoDB connection string for safe logging without exposing passwords.
 */
function sanitizeMongoUri(uri: string): string {
  try {
    return uri.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
  } catch {
    return 'mongodb://[redacted]';
  }
}

export async function connectDB(): Promise<typeof mongoose> {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[Database] MongoDB connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error: any) {
    const safeTarget = sanitizeMongoUri(config.mongoUri);
    console.error(`\n[Database] Connection Error: Unable to connect to MongoDB (${safeTarget})`);
    console.error(`[Database] Reason: ${error?.message || error}`);
    console.error('\n--- MongoDB Troubleshooting Checklist ---');
    console.error('1. Verify MONGODB_URI in your .env file.');
    console.error('2. For MongoDB Atlas: Verify your IP is added to the Atlas Network Access / IP Allowlist (or allow 0.0.0.0/0).');
    console.error('3. Check that database username and password are correct and URL-encoded if containing special characters.');
    console.error('4. Check your network connection and firewall settings to ensure port 27017 or Atlas port is reachable.');
    console.error('-----------------------------------------\n');
    throw error;
  }
}
