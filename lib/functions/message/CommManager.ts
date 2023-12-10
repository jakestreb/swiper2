import TelegramBot from 'node-telegram-bot-api';
import * as readline from 'readline';
import logger from '../../util/logger';
import TextFormatter from './formatters/TextFormatter';
import TelegramFormatter from './formatters/TelegramFormatter';
import PublicError from '../../util/errors/PublicError'

type CommType = 'cli'|'telegram';
type SwiperMsgHandler = (id: number, msg?: string) => Promise<void>

export default class CommManager {

  private static TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
  private static ENABLE_TELEGRAM = Boolean(parseInt(process.env.ENABLE_TELEGRAM || "0", 10));

  private clientCommTypes: {[clientId: number]: CommType} = {};
  private textFormatters: {[commType in CommType]: TextFormatter} = {
    'cli': new TextFormatter(),
    'telegram': new TelegramFormatter(),
  };
  private telegramBotInst: TelegramBot|null = null;
  private readonly commandLineId = -1;

  constructor(public msgHandler: SwiperMsgHandler) {}

  public start() {
    this.addCliListener();
    if (CommManager.ENABLE_TELEGRAM) {
      this.addTelegramListener();
    }
  }

  // Returns the TextFormatter for the given client
  public getTextFormatter(clientId: number): TextFormatter {
    const commType = this.clientCommTypes[clientId];
    return this.textFormatters[commType];
  }

  // Sent unprompted message to client
  public notifyClient(clientId: number, msg: string) {
    this.replyToClient(clientId, { data: msg });
  }

  public async replyToClient(clientId: number, msg: SwiperReply): Promise<void> {
    const commType = this.clientCommTypes[clientId];
    if (commType === 'cli') {
      if (msg.data) {
        logger.info(msg.data);
      } else {
        logger.error(msg.err);
      }
      // Prompt input
      console.log('> ')
    } else {
      const msgText = msg.data || msg.err || '';
      logger.info('Responding to client', { data: msgText });
      const messages = msgText.split(TelegramFormatter.MSG_SPLIT_STRING);
      for (const msg of messages) {
        await this.telegramBot.sendMessage(clientId, msg, { parse_mode: 'HTML' });
      }
    }
  }

  private get telegramBot(): TelegramBot {
    if (!this.telegramBotInst) {
      this.telegramBotInst = new TelegramBot(CommManager.TELEGRAM_TOKEN, { polling: true });
    }
    return this.telegramBotInst;
  }

  private addCliListener() {
    const terminal = readline.createInterface(process.stdin, process.stdout);
    terminal.on('line', (line: string) => {
      this.handleClientMsg('cli', this.commandLineId, line.trim());
    });
  }

  private addTelegramListener() {
    this.telegramBot.on("text", async (message: any) => {
      logger.debug('Received telegram message', { data: message.text, date: new Date(message.date * 1000) });
      await this.handleClientMsg('telegram', message.chat.id, message.text);
    });

    this.telegramBot.on("polling_error", (message: any) => logger.error(`Telegram error: ${message}`));
  }

  private async handleClientMsg(commType: CommType, id: number, msg?: string) {
    if (!this.clientCommTypes[id]) {
      this.clientCommTypes[id] = commType;
    }
    try {
      await this.msgHandler(id, msg);
    } catch (err) {
      let reply = 'Something went wrong';
      if (err instanceof PublicError) {
        reply = err.message;
      }
      logger.error(`Error handling ${commType} request "${msg}"`, { err, reply });
      this.replyToClient(id, { err: reply });
    }
  }
}
