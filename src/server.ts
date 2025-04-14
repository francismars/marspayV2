import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import registerSocketHandlers from './socket';
import paidLNURL from './routes/paidLNURL';
import withdrawnLNURL from './routes/withdrawnLNURL';

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api/LNURL/paid', paidLNURL);
app.use('/api/LNURL/withdrawn', withdrawnLNURL);
const httpServer = http.createServer(app);
const io = new Server(httpServer);

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

export { io };
