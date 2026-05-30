import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import registerSocketHandlers from './socket';
import { app } from './app';

dotenv.config();

const port = Number(process.env.PORT) || 3001;

const httpServer = http.createServer(app);
const io = new Server(httpServer);

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

httpServer.on('error', onError);

function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

export { io };
