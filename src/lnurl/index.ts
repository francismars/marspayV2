import { BUYINMAX, BUYINMIN, BUYINMINWINNER } from "../consts/values";
import { appendLNURLPToID, setLNURLPToID } from "../socket/sessionManager";
import { dateNow } from "../utils/time";
import { createLNURLP } from "./calls";

export async function newLNURLPsP2P(
  sessionID: string,
  previousWinner = null
): Promise<void> {
  const playersDescriptions = ["Player 1", "Player 2"];
  for (const description of playersDescriptions) {
    const reqInDescription = description;
    const buyInMax = BUYINMAX;
    const buyInMin = BUYINMIN;
    if (previousWinner) {
      //description == previousWinner ? buyInMin = BUYINMINWINNER : buyInMin = app.sessionidsGameInfo[sessionID][previousWinner].value
    }
    console.log(
      `${dateNow()} [${sessionID}] Requesting new LNURLp with description ${reqInDescription} from ${buyInMin} to ${buyInMax} sats.`
    );
    const lnurlinfo = await createLNURLP(description, buyInMin, buyInMax);
    if (!lnurlinfo) {
      console.log(
        `${dateNow()} [${sessionID}] It wasn't possible to create LNURLp.`
      );
      return;
    }
    console.log(`${dateNow()} [${sessionID}] Created LNURLp ${lnurlinfo.id}.`);
    setLNURLPToID(lnurlinfo.id, sessionID);
    lnurlinfo["mode"] = "P2P";
    appendLNURLPToID(sessionID, lnurlinfo);
  }
}
