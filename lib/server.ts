import * as dotenv from 'dotenv';
dotenv.config();

import * as express from 'express';
import {log, logError, logInputError, logSubProcess, prompt} from './terminal';
import * as readline from 'readline';

import {Swiper, SwiperReply} from './Swiper';

type CommType = 'cli'|'telegram';

const app = express();
const CLI_ID = -1;
// const gatewayUrl = process.env.GATEWAY_URL;
const PORT = process.env.PORT;
const ENHANCED_TERMINAL = Boolean(parseInt(process.env.ENHANCED_TERMINAL || "0", 10));
const commTypes: {[id: number]: string} = {};

function sendMsgToClient(id: number, msg: SwiperReply): Promise<void> {
  const commType = commTypes[id];
  if (commType === 'telegram') {
    // TODO
  } else if (commType === 'cli') {
    if (ENHANCED_TERMINAL && msg.enhanced) {
      msg.enhanced();
    } else {
      msg.data ? log(msg.data) : logInputError(msg.err);
      prompt();
    }
  }
  try {
    return Promise.resolve();
  } catch (err) {
    // TODO: Attempt retry
    logError(`Error responding to client with message: ${msg.data}`);
    return Promise.resolve();
  }
}

function startComms(swiper: Swiper): void {
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
      logError(`Error handling console request "${line.trim()}": ${err}`);
      log('\n');
      sendMsgToClient(CLI_ID, {err: `Something went wrong`});
    });
  });
  terminal.on('close', () => {
    process.exit(0);
  });

  // Start the app.
  app.listen(PORT, () => {
    // Prompt the user once the app is running.
    logSubProcess(`Running and listening on port ${PORT}`);
  });
  app.get("/", (req, res) => {
    // Send a response when GET is called on the port for debugging.
    res.send('Running');
  });

  // Message from telegram.
  app.post("/telegram", (req, res) => {
    acceptMsgFromClient('telegram', req.body.id, req.body.message)
    .catch(err => {
      logError(`Error handling telegram request "${req.body.message}": ${err}`);
      log('\n');
      sendMsgToClient(req.body.id, {err: `Something went wrong`});
    });
    res.send('ok');
  });
}

// Create a Swiper instance and start the process.
Swiper.create(sendMsgToClient)
.then(swiper => {
  startComms(swiper);
})
.catch(err => {
  logError(`Process exiting on error: ${err}`);
  process.exit(1);
});
