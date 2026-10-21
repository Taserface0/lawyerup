// Live updates over Server-Sent Events (GET /api/data/events).
//
// Each signed-in browser keeps one stream open. When something changes, the
// server sends a bare "change" event to the people it concerns (the client
// and lawyer on a case) or to everyone (the public marketplace or calendar
// changed). The event carries no data: the browser re-reads /api/data, which
// applies the usual access checks. Streams whose session has ended (signed
// out, expired, account deleted) are closed on the next event or heartbeat.

const HEARTBEAT_MS = 25_000;

export function createEventHub() {
  /** @type {Set<{ userId: string, lawyerId: number|null, res: import('node:http').ServerResponse, isValid: () => boolean }>} */
  const streams = new Set();

  function write(stream, text) {
    if (!stream.isValid()) {
      close(stream);
      return;
    }
    stream.res.write(text);
  }

  function close(stream) {
    if (!streams.delete(stream)) return;
    clearInterval(stream.heartbeat);
    stream.res.end();
  }

  return {
    /** Opens a stream for a signed-in visitor. isValid() re-checks their session. */
    open(req, res, { userId, lawyerId, isValid }) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // tell nginx-style proxies not to buffer the stream
      });
      res.write('retry: 5000\n\n');
      const stream = { userId, lawyerId, res, isValid };
      stream.heartbeat = setInterval(() => write(stream, ': ping\n\n'), HEARTBEAT_MS);
      streams.add(stream);
      req.on('close', () => close(stream));
      return stream;
    },

    /**
     * @param {{ userIds?: string[], lawyerIds?: number[], everyone?: boolean }} audience
     */
    notify({ userIds = [], lawyerIds = [], everyone = false }) {
      for (const stream of [...streams]) {
        if (everyone || userIds.includes(stream.userId) || (stream.lawyerId !== null && lawyerIds.includes(stream.lawyerId))) {
          write(stream, 'event: change\ndata: {}\n\n');
        }
      }
    },

    size: () => streams.size,
    closeAll() {
      for (const stream of [...streams]) close(stream);
    },
  };
}
