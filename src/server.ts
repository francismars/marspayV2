import express, { Request, Response } from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import registerSocketHandlers from "./socket";
import paidLNURL from "./routes/paidLNURL";

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, "../public")));
app.use("/api/paidLNURL", paidLNURL);
const httpServer = http.createServer(app);
const io = new Server(httpServer);

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
