import * as os from 'os';

export default class MemoryManager {

  private static MARGIN_MB = 250;

  constructor() {
    setInterval(() => this.log(), 30000);
  }

  public get freeMb() {
    return (os.freemem() / 1000) - MemoryManager.MARGIN_MB;
  }

  public log() {
    const freeMemory = os.freemem() / 1000;
    const totalMemory = os.totalmem() / 1000;
    console.warn('free / total', freeMemory, totalMemory);
  }
}
