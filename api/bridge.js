import worker from '../cloudflare-worker/worker.js';

/**
 * Vercel Serverless Function entrypoint for the UDT Studio Google/Gemini bridge.
 * Delegates standard Web Fetch Request/Response directly to the shared bridge handler.
 */
export default {
  async fetch(request) {
    return worker.fetch(request, process.env);
  }
};
