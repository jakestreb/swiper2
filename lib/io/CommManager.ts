import TelegramBot from 'node-telegram-bot-api';
import * as readline from 'readline';
import * as log from '../log';
import TextFormatter from './formatters/TextFormatter';
import TelegramFormatter from './formatters/TelegramFormatter';
import PublicError from '../util/errors/PublicError'

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

  public replyToClient(clientId: number, msg: SwiperReply): void {
    const commType = this.clientCommTypes[clientId];
    if (commType === 'cli') {
      if (msg.data) {
        log.info(msg.data);
      } else {
        log.inputError(msg.err);
      }
      log.prompt();
    } else {
      if (msg.data) {
        log.foreignResponse(msg.data);
      } else {
        log.foreignInputError(msg.err);
      }
      const msgText = (msg.data ? msg.data : msg.err) || '';
      const messages = msgText.split(TelegramFormatter.MSG_SPLIT_STRING);
      messages.map(msg => {
        this.telegramBot.sendMessage(clientId, msg, {parse_mode: 'HTML'});
      });
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
    this.telegramBot.on("text", (message: any) => {
      log.debug(`Received telegram message: ${message.text} (${new Date(message.date * 1000)})`);
      this.handleClientMsg('telegram', message.chat.id, message.text);
    });

    this.telegramBot.on("polling_error", (message: any) => log.error(`Telegram error: ${message}`));
  }

  private async handleClientMsg(commType: CommType, id: number, msg?: string) {
    if (!this.clientCommTypes[id]) {
      this.clientCommTypes[id] = commType;
    }
    try {
      await this.msgHandler(id, msg);
    } catch (err) {
      log.error(`Error handling ${commType} request "${msg}": ${err}`);
      let reply = 'Something went wrong';
      if (err instanceof PublicError) {
        reply = err.message;
      }
      this.replyToClient(id, {err: reply});
    }
  }
}
