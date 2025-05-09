# MarsPay V2 – LNbits Lightning Backend for 1v1 Games

**MarsPay V2** is a modular backend service designed to integrate Lightning payments into any 1v1 game. It provides a WebSocket API for real-time communication, handles LNURL generation and withdrawal via LNbits, and exposes REST endpoints for LNbits webhooks.

This backend abstracts payment logic and session tracking, letting game developers focus on gameplay while enabling Lightning-native features like deposits and real-time player payouts.

---

## ✨ Features

- ⚡ **Lightning-native**: Integrates seamlessly with LNbits for LNURLp (pay) and LNURLw (withdraw) flows
- 🔌 **Socket.IO API**: Real-time communication layer for any frontend game client
- 🎮 **Session management**: Dynamic sessions with Player 1 / Player 2 roles
- 📤 **Webhook endpoint**: Handles LNbits callbacks for payment and withdrawal confirmation

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/francismars/marspayV2.git
cd marspayV2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run in Development

```bash
npx tsx src/index.ts
```

### 4. Or Build and Start

```bash
npx tsc
node dist/index.js
```

---

## ⚙️ Environment Configuration

Create a `.env` file for the configuration:

```env
LNBITS_URL=
LNBITS_IP=
LNBITS_KEY=
LNBITS_DEPOSITHOOK=
LNBITS_WITHDRAWHOOK=
ADMIN_PASSWORD=
```

---

## 🔌 Socket.IO API

Clients connect via WebSocket and join sessions by session ID. Example events:

- `getGameMenuInfos`
- `getDuelInfos`
- `gameFinished(winnerP)`
- `postGameInfoRequest`
- `createWithdrawalPostGame`

---

## 🌐 HTTP Endpoints

### `POST /api/LNURL/paid`

Triggered by LNbits when a user pays sats via LNURLp.

### `POST /api/LNURL/withdrawn`

Triggered by LNbits when a user withdraws sats via LNURLw.

---

## 🧪 Example Use Case

1. A game starts and creates a `sessionID`
2. The game calls the API to generate LNURLp links via LNbits
3. Payments are received and handled live via Socket.IO
4. LNURLw generated for the winner to withdraw
5. Withdrawals are notified via webhook

---

## 📄 License

MIT © 2025 FrancisMars

---

## 🙋‍♂️ Contributing

Feel free to fork, open issues, or contribute improvements for more game use cases, wallets, or modes. PRs welcome!
