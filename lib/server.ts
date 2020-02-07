import * as dotenv from 'dotenv';
dotenv.config();

import {EventEmitter} from 'events';
EventEmitter.defaultMaxListeners = Infinity; // Hides a repeated warning from 'webtorrent'

import * as express from 'express';
import * as readline from 'readline';
import * as rp from 'request-promise';

import * as log from './common/logger';
import {Swiper, SwiperReply} from './Swiper';

// import * as heapProfile from 'heap-profile';

// Uncomment to enable heap profiling
// heapProfile.start();
// setInterval(() => {
//   Write a snapshot to disk every 6 hours
//   heapProfile.write((err, filename) => {
//     console.log(`heapProfile.write. err: ${err} filename: ${filename}`);
//   });
// }, 6 * 60 * 60 * 1000).unref();

type CommType = 'cli'|'telegram';

const app = express();
app.use(express.json());

const CLI_ID = -1;
const gatewayUrl = process.env.GATEWAY_URL || 'https://limitless-island-56260.herokuapp.com';
const PORT = process.env.PORT;
const ENHANCED_TERMINAL = Boolean(parseInt(process.env.ENHANCED_TERMINAL || "0", 10));
const commTypes: {[id: number]: string} = {};

async function sendMsgToClient(id: number, msg: SwiperReply): Promise<void> {
  const commType = commTypes[id];
  if (commType === 'cli') {
    if (ENHANCED_TERMINAL && msg.enhanced) {
      msg.enhanced();
    } else {
      if (msg.data) {
        log.info(msg.data);
      } else {
        log.inputError(msg.err);
      }
      log.prompt();
    }
  } else {
    if (msg.data) {
      log.foreignResponse(msg.data);
    } else {
      log.foreignInputError(msg.err);
    }
    return rp({
      uri: `${gatewayUrl}/swiper`,
      method: 'POST',
      json: {
        id,
        message: msg.data ? msg.data : msg.err,
        destination: commType
      }
    });
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
      log.error(`Error handling cli request "${line.trim()}": ${err}`);
      log.info('\n');
      sendMsgToClient(CLI_ID, {err: `Something went wrong`})
      .catch(_err => {
        log.error(`Error sending msg to client: ${_err}`);
      });
    });
  });

  // terminal.on('close', () => {
  //   logError(`Process exiting on terminal close`);
  //   process.exit(0);
  // });

  // Start the app.
  app.listen(PORT, () => {
    // Prompt the user once the app is running.
    log.subProcess(`Running and listening on port ${PORT}`);
  });
  app.get("/", (req, res) => {
    // Send a response when GET is called on the port for debugging.
    res.send('Running');
  });

  // Message from telegram.
  app.post("/telegram", (req, res) => {
    acceptMsgFromClient('telegram', req.body.id, req.body.message)
    .catch(err => {
      log.error(`Error handling telegram request "${req.body.message}": ${err}`);
      log.info('\n');
      sendMsgToClient(req.body.id, {err: `Something went wrong`})
      .catch(_err => {
        log.error(`Error sending msg to client: ${_err}`);
      });
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
  log.error(`Process exiting on error: ${err}`);
  process.exit(1);
});
