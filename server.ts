import * as dotenv from 'dotenv';
import * as express from 'express';
import * as readline from 'readline';
import * as term from 'terminal-kit';

import {Swiper, SwiperReply} from './lib/Swiper';

dotenv.config();

type CommType = 'cli'|'telegram';

const app = express();
const gatewayUrl = 'https://limitless-island-56260.herokuapp.com';
const port = process.env.PORT || 8250;
const maxLength = 640;

const commTypes: {[id: number]: string} = {};

function acceptMsg(commType: CommType, id: number, msg?: string) {
  if (!commTypes[id]) {
    commTypes[id] = commType;
  }
  swiper.handleMsg(id, msg);
}

function sendMsgToClient(id: number, msg: SwiperReply): Promise<void> {
  const commType = commTypes[id];
  if (commType === 'telegram') {
    // TODO
  } else if (commType === 'cli') {
    term(msg.data);
  }
  return;
}

const swiper = new Swiper(sendMsgToClient);

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

app.get("/", (req, res) => {
  res.send('Running');
});

// Message from telegram
app.post("/telegram", (req, res) => {
  acceptMsg('telegram', req.body.id, req.body.message);
  res.send('ok');
});

// Start reading the terminal for input
const terminal = readline.createInterface(process.stdin, process.stdout);

terminal.prompt();
terminal.on('line', (line: string) => {
  acceptMsg('cli', -1, line.trim());
  terminal.prompt();
});
terminal.on('close', () => {
  process.exit(0);
});
