import * as dotenv from 'dotenv';
dotenv.config();

import {EventEmitter} from 'events';
EventEmitter.defaultMaxListeners = Infinity; // Hides a repeated warning from 'webtorrent'

import * as TelegramBot from 'node-telegram-bot-api';
import * as readline from 'readline';

import * as log from './common/logger';
import {Swiper, SwiperReply} from './Swiper';

const CLI_ID = -1;
const ENHANCED_TERMINAL = Boolean(parseInt(process.env.ENHANCED_TERMINAL || "0", 10));
const telegramToken = process.env.TELEGRAM_TOKEN || '';

const telegram = new TelegramBot(telegramToken, {polling: true});
const commTypes: {[id: number]: string} = {};

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
    const msgText = msg.data ? msg.data : msg.err;
    telegram.sendMessage(id, msgText || '', {parse_mode: 'Markdown'});
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

  telegram.on("text", (message) => {
    log.subProcess(`Running and listening for messages`);
    acceptMsgFromClient('telegram', message.chat.id, message.text)
    .catch(err => {
      log.error(`Error handling telegram request "${message}": ${err}`);
      log.info('\n');
      sendMsgToClient(message.chat.id, {err: `Something went wrong`})
      .catch(_err => {
        log.error(`Error sending msg to client: ${_err}`);
      });
    });
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
