import * as dotenv from 'dotenv';
dotenv.config();

import * as express from 'express';
import * as readline from 'readline';
import {terminal as term} from 'terminal-kit';

import {Swiper, SwiperReply} from './Swiper';

type CommType = 'cli'|'telegram';

const app = express();
const CLI_ID = -1;
// const gatewayUrl = process.env.GATEWAY_URL;
const port = process.env.PORT;
const commTypes: {[id: number]: string} = {};

function sendMsgToClient(id: number, msg: SwiperReply): Promise<void> {
  const commType = commTypes[id];
  if (commType === 'telegram') {
    // TODO
  } else if (commType === 'cli') {
    msg.data ? term(msg.data) : term.red(msg.err);
    term(`\n> `);
  }
  try {
    return Promise.resolve();
  } catch (err) {
    // TODO: Attempt retry
    term.bgRed(`Error responding to client with message: ${msg.data}`);
    return Promise.resolve();
  }
}

function start(swiper: Swiper): void {
  // Create function to accept messages from the client.
  async function acceptMsgFromClient(commType: CommType, id: number, msg?: string): Promise<void> {
    if (!commTypes[id]) {
      commTypes[id] = commType;
    }
    await swiper.handleMsg(id, msg);
  }

  // Initialize terminal to read input.
  const terminal = readline.createInterface(process.stdin, process.stdout);
  terminal.on('line', (line: string) => {
    acceptMsgFromClient('cli', CLI_ID, line.trim())
    .catch(err => {
      term.bgRed(`Error handling console request "${line.trim()}": ${err}`);
      term('\n');
      sendMsgToClient(CLI_ID, {err: `Something went wrong`});
    });
  });
  terminal.on('close', () => {
    process.exit(0);
  });

  // Start the app.
  app.listen(port, () => {
    // Prompt the user once the app is running.
    term(`Running and listening on port ${port}\n> `);
  });
  app.get("/", (req, res) => {
    // Send a response when GET is called on the port for debugging.
    res.send('Running');
  });

  // Message from telegram.
  app.post("/telegram", (req, res) => {
    acceptMsgFromClient('telegram', req.body.id, req.body.message)
    .catch(err => {
      term.bgRed(`Error handling telegram request "${req.body.message}": ${err}`);
      term('\n');
      sendMsgToClient(req.body.id, {err: `Something went wrong`});
    });
    res.send('ok');
  });
}

// Create a Swiper instance and start the process.
Swiper.create(sendMsgToClient)
.then(swiper => {
  start(swiper);
})
.catch(err => {
  term.bgRed(`Process exiting on error: ${err}`);
  process.exit(1);
});
