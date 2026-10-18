import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * One error shape for every failure: { statusCode, message, requestId }.
 * Known HTTP errors pass their message through. Anything unexpected is logged with the
 * request id and the client only sees a generic message (no stack traces, no SQL).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req as any)?.id;
    if (res.headersSent) return; // e.g. an SSE stream that already started

    if (err instanceof HttpException) {
      const status = err.getStatus();
      const body = err.getResponse();
      const message = typeof body === 'string' ? body : ((body as any).message ?? err.message);
      res.status(status).json({ statusCode: status, message, requestId });
      return;
    }
    // unique-violation from Postgres that a service did not translate
    if ((err as any)?.code === '23505') {
      res.status(HttpStatus.CONFLICT).json({ statusCode: 409, message: 'That already exists', requestId });
      return;
    }
    this.log.error(`${req?.method} ${req?.url} [${requestId}] ${(err as Error)?.stack ?? err}`);
    res.status(500).json({ statusCode: 500, message: 'Something went wrong on our side. Please try again.', requestId });
  }
}
