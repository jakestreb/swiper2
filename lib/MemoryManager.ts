import * as os from 'os';

export default class MemoryManager {

  private static MARGIN_MB = 250;

  constructor() {
    setInterval(() => this.log(), 30000);
  }

  public get freeMb() {
    return os.freemem() / 1000000;
  }

  public get totalMb() {
    return os.totalmem() / 1000000;
  }

  public get availableMb() {
    return this.freeMb - MemoryManager.MARGIN_MB;
  }

  public log() {
    console.warn('free / total', this.freeMb, this.totalMb);
  }
}
