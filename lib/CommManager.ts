import TelegramBot from 'node-telegram-bot-api';
import * as readline from 'readline';
import * as log from './common/logger';

type CommType = 'cli'|'telegram';
type SwiperMsgHandler = (id: number, msg?: string) => Promise<void>

export default class CommManager {

  private static TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
  private static ENABLE_TELEGRAM = Boolean(parseInt(process.env.ENABLE_TELEGRAM || "0", 10));

  private clientCommTypes: {[clientId: number]: CommType} = {};
  private telegramBotInst: TelegramBot|null = null;
  private readonly commandLineId = -1;

  constructor(public msgHandler: SwiperMsgHandler) {}

  public start() {
    this.addCliListener();
    if (CommManager.ENABLE_TELEGRAM) {
      this.addTelegramListener();
    }
  }

  // Sent unprompted message to client
  public notifyClient(id: number, msg: string) {
    this.replyToClient(id, { data: msg });
  }

  public replyToClient(id: number, msg: SwiperReply): void {
    const commType = this.clientCommTypes[id];
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
      const msgText = msg.data ? msg.data : msg.err;
      this.telegramBot.sendMessage(id, msgText || '', {parse_mode: 'Markdown'});
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
      this.handleClientMsg('cli', this.commandLineId, line.trim())
      .catch(err => {
        log.error(`Error handling cli request "${line.trim()}": ${err}`);
        log.info('\n');
        this.replyToClient(this.commandLineId, {err: `Something went wrong`})
      });
    });
  }

  private addTelegramListener() {
    this.telegramBot.on("text", (message: any) => {
      log.subProcess(`Running and listening for messages`);
      this.handleClientMsg('telegram', message.chat.id, message.text)
      .catch(err => {
        log.error(`Error handling telegram request "${message}": ${err}`);
        log.info('\n');
        this.replyToClient(message.chat.id, {err: `Something went wrong`})
      });
    });

    this.telegramBot.on("polling_error", (message: any) => log.error(`Telegram error: ${message}`));
  }

  private async handleClientMsg(commType: CommType, id: number, msg?: string) {
    if (!this.clientCommTypes[id]) {
      this.clientCommTypes[id] = commType;
    }
    await this.msgHandler(id, msg);
  }
}