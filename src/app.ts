import express, { Request, Response, NextFunction } from 'express';
import paidLNURL from './routes/paidLNURL';
import withdrawnLNURL from './routes/withdrawnLNURL';
import dashboard from './routes/dashboard';
import path from 'path';
import morgan from 'morgan';
import { dateNow } from './utils/time';
import { normalizeIP } from './utils/ip';

export const app = express();

app.use(express.json());

morgan.token('custom-date', () => dateNow());
morgan.token(
  'real-ip',
  (req: Request) =>
    '[' + normalizeIP(req.ip || req.socket.remoteAddress || '-') + ']'
);
const format = ':custom-date :real-ip :method :url :status';
app.use(morgan(format));

app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/api/LNURL/paid', paidLNURL);
app.use('/api/LNURL/withdrawn', withdrawnLNURL);
app.use('/dashboard', dashboard);

app.use((_req, _res, next) => {
  const err: Error & { status?: number } = new Error('Not Found');
  err.status = 404;
  next(err);
});

app.use(
  (
    err: Error & { status?: number },
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    const status = err.status || 500;
    console.error(`[ERROR] ${status}:`, err.message);
    res.status(status).json({
      error: {
        message: err.message,
      },
    });
  }
);
