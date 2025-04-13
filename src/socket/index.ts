import { Server, Socket } from "socket.io";
import middleware from "./middleware";
import { dateNow } from "../utils/time";
import { getP2PMenuInfos } from "./P2PMenu";

export default function registerSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    middleware(io);

    const realIP = socket.handshake.address; // change when NGINX is set up
    console.log(
      `${dateNow()} [${socket.data.sessionID}] connected with IP ${realIP}.`
    );

    // TODO: Change to getP2PMenuInfos
    socket.on("getGameMenuInfos", async () => {
      getP2PMenuInfos(socket);
    });

    socket.on("disconnect", () => {
      console.log(`${dateNow()} [${socket.data.sessionID}] Disconnected.`);
    });
  });
}
