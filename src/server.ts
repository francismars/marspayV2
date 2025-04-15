import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import registerSocketHandlers from './socket';
import paidLNURL from './routes/paidLNURL';
import withdrawnLNURL from './routes/withdrawnLNURL';
import dashboard from './routes/dashboard';

const app = express();
const port = 3000;

app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/api/LNURL/paid', paidLNURL);
app.use('/api/LNURL/withdrawn', withdrawnLNURL);
app.use('/dashboard', dashboard);
const httpServer = http.createServer(app);
const io = new Server(httpServer);

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

export { io };
