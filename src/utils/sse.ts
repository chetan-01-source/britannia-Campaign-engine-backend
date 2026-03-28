import { Response } from 'express';

// Per-connection event ID stored on the response object
const EVENT_ID_KEY = Symbol('sseEventId');

/**
 * Set up SSE response headers and flush them immediately
 */
export function setupSSEResponse(res: Response): void {
  // Disable Nagle algorithm to prevent TCP buffering
  res.socket?.setNoDelay(true);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx/proxy buffering
  res.flushHeaders();

  // Initialize per-connection event counter
  (res as any)[EVENT_ID_KEY] = 0;

  // Send an initial SSE comment to fully open the stream pipeline
  res.write(': stream opened\n\n');
}

/**
 * Send a named SSE event with JSON data
 */
export function sendSSEEvent(res: Response, event: string, data: Record<string, any>): boolean {
  if (res.writableEnded) return false;

  const id = ++(res as any)[EVENT_ID_KEY];
  const payload = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const ok = res.write(payload);

  // Force flush if available (e.g. behind compression middleware)
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }

  console.log(`📡 SSE [${id}] event=${event}`);
  return ok;
}

/**
 * Start a heartbeat interval that sends SSE events to keep the connection alive.
 * Sends a proper SSE event (not a comment) so all clients recognise it as activity.
 */
export function startHeartbeat(res: Response, intervalMs = 5000): NodeJS.Timeout {
  return setInterval(() => {
    if (!res.writableEnded) {
      // Send as a real SSE event so HTTP clients count it as data
      sendSSEEvent(res, 'heartbeat', { timestamp: new Date().toISOString() });
    }
  }, intervalMs);
}

/**
 * Clean up SSE connection: clear heartbeat and end response
 */
export function cleanupSSE(res: Response, heartbeatInterval: NodeJS.Timeout): void {
  clearInterval(heartbeatInterval);
  if (!res.writableEnded) {
    res.end();
    console.log('🔒 SSE connection closed');
  }
}
