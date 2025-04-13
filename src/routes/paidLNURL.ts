import { Router, Request, Response } from "express";
import { dateNow } from "../utils/time";
import { getIDFromLNURLP } from "../socket/sessionManager";

const router = Router();

router.post("/", (req: Request, res: Response) => {
    console.log(req.body);
    /*const lnurlp = req.body.lnurlp
    if (!lnurlp) {
        console.error(`${dateNow()} LNURLp not found.`);
        return res.status(404).send("LNURLp not found.");
    }
    let sessionID = getIDFromLNURLP(lnurlp)
    if (!sessionID) {
        console.error(`${dateNow()} Session ID not found.`);
        return res.status(404).send("Session ID not found.");
    }
    //let socketID = app.socketsSessionID[sessionID]
    let amount = req.body.amount/1000
    //let amountMinusFee = Math.floor(amount * 0.95)
    let comment = (req.body.comment==null ? null : req.body.comment[0])
    console.log(`dateNow() [${sessionID}] Paid LNURLp ${lnurlp} with ${amount} sats and note ${comment}.`);
    */
    res.status(200).send("OK");
});

export default router;

/*


require('dotenv').config();

const allowedServerIp = process.env.LNBITS_IP;

let lnbitsURL = process.env.LNBITS_URL
let lnbitsKEY = process.env.LNBITS_KEY

const devLN = process.env.DEVELOPER_LNADDRESS;
const designerLN = process.env.DESIGNER_LNADDRESS;
const hostLN = process.env.HOST_LNADDRESS;

const feeSplit = [[devLN, 0.0195, "developer"], [hostLN, 0.0195, "host"], [designerLN, 0.0095, "designer"]]

// Middleware to restrict access based on IP address
const ipFilter = (req, res, next) => {
  const requestIp = req.ip;
  if (requestIp === allowedServerIp) {
    next();
  } else {
    res.status(403).send('Access denied');
  }
};

// sessionidsLNURLPs {socket.sessionID: [{"id": id, "lnurlp": lnurl, "description": description}, "payments":[{"amount":amount, "note":comment}]]}
// sessionidsGameInfo {socket.sessionID: {"Player1": {"name": name, "value": value}, "Player2": {"name": name, "value": value}, winners=["Player1","Player2"]}


router.post('/', ipFilter, async function(req, res, next) {
    //console.log(app.connectionsLNURL);
    let lnurlp = req.body.lnurlp
    let sessionID = app.lnurlpsSessionID[lnurlp]
    let socketID = app.socketsSessionID[sessionID]
    let amount = req.body.amount/1000
    let amountMinusFee = Math.floor(amount * 0.95)
    let comment = (req.body.comment==null ? null : req.body.comment[0])
    console.log(app.nowTimeString()+" ["+sessionID+"] Paid LNURLp "+lnurlp+" with "+amount+" sats and note "+comment+".");
    if(app.sessionidsLNURLPs[sessionID]){
      if(app.sessionidsLNURLPs[sessionID][0].description=="Chain Duel Tournament"){ // If paid lnurl from Tournament
        if(!app.sessionidsLNURLPs[sessionID][0].payments){
          app.sessionidsLNURLPs[sessionID][0].payments = []
        }
        app.sessionidsLNURLPs[sessionID][0].payments.push({"amount":amount, "note":comment})
        let pName
        let numberOfDeposits = app.sessionidsGameInfo[sessionID].depositsCount
        let numberOfPlayers = app.sessionidsGameInfo[sessionID].playersList.length
        if(comment!=null && comment!=""){
            pName=(comment).trim()
        }
        else{
            pName="Player "+(numberOfDeposits+1)
        }
        if(numberOfDeposits<numberOfPlayers){
          let playerPosition = Math.floor(Math.random() * (numberOfPlayers-numberOfDeposits));
          for(let i=0;i<=playerPosition;i++){
              if(app.sessionidsGameInfo[sessionID].playersList[i]!="" && i<numberOfPlayers){ playerPosition++ }
          }
          //console.log(app.sessionidsGameInfo[sessionID].playersList)
          app.sessionidsGameInfo[sessionID].playersList[playerPosition]=pName
        }
        else{
          console.log(app.nowTimeString()+" ["+sessionID+"] Tournament full. Couldn't place "+pName+" in the bracket.");
        }
        app.sessionidsGameInfo[sessionID].depositsCount++
        www.ioSocket.to(socketID).emit('updatePayments', app.sessionidsGameInfo[sessionID]);
      }
      else { // If paid lnurl from P2P
        let lnurls = app.sessionidsLNURLPs[sessionID]
        for(let i=0;i<lnurls.length;i++){
          let lnurl = lnurls[i]
          let description = lnurl.description;
          if(lnurl.id == lnurlp){
            if(!app.sessionidsLNURLPs[sessionID][i].payments){
              app.sessionidsLNURLPs[sessionID][i].payments = []
            }
            app.sessionidsLNURLPs[sessionID][i].payments.push({"amount":amount, "note":comment})
            if(!app.sessionidsGameInfo[sessionID]){
              app.sessionidsGameInfo[sessionID] = {}
            }
            if(!app.sessionidsGameInfo[sessionID][description]){
              app.sessionidsGameInfo[sessionID][description] = {"name": description, "value": 0}
            }  
            if(comment!=null) app.sessionidsGameInfo[sessionID][description].name = comment;
            app.sessionidsGameInfo[sessionID][description].value += amount
            app.sessionidsGameInfo[sessionID].gamemode = "P2P"
          }
        }
        www.ioSocket.to(socketID).emit('updatePayments', app.sessionidsGameInfo[sessionID]);
      }
  
      for (split of feeSplit){
        console.log(app.nowTimeString()+" ["+sessionID+`] Sending ${split[2]} split of ${Math.floor(amount*split[1])} sats to ${split[0]}`);
        paySplit(split[0], Math.floor(amount*split[1]))
        .catch(error => {
          console.log(app.nowTimeString()+" ["+sessionID+`] Couldn't send split to ${split[2]}: ${error.message}`);
        });
      }
    }
    res.send({ "body": "Paid" })  
  });
  
  
  async function paySplit(lnAddress, satsAmount){
    const [userLN, domainLN] = lnAddress.split('@');
    const LNurl = `https://${domainLN}/.well-known/lnurlp/${userLN}`;
  
    const callback = await getCallBack(LNurl)
    const invoice = await getInvoice(callback, satsAmount)
    const respayment = await payInvoice(invoice)
  }
  
  async function getCallBack(LNurl){
    return fetch(LNurl, {    
      method: 'GET',
    })
    .then(function(response) {
      if (!response.ok) {
        return Promise.reject(new Error(response.statusText));
      }
      return response.json();
    })
    .then(data => {
      return data.callback;
    })
  }
  
  async function getInvoice(callback, satsAmount){
    const url = callback+'?amount='+satsAmount*1000
    return fetch(url, {    
      method: 'GET',
    })
    .then(function(response) {
      if (!response.ok) {
        return Promise.reject(new Error(response.statusText));
      }
      return response.json();
    })
    .then(data => {
      return data.pr;
    })
  }
  
  async function payInvoice(invoice){
    const url = lnbitsURL+"/api/v1/payments"
    return fetch(url, {    
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        "X-Api-Key": lnbitsKEY
      },
      body: JSON.stringify({      
        "out": true,
        "bolt11": invoice      
      })
    })
    .then(function(response) {
      if (!response.ok) {
        return Promise.reject(new Error(response.statusText));
      }
      return response.json();
    })
    .then(data => {
      return data;
    })
  }
  
  module.exports = router;