import * as os from 'os';

export default class MemoryManager {

  private static MARGIN_MB = 250;

  constructor() {}

  public get freeMb() {
    return os.freemem() / 1024 / 1024;
  }

  public get totalMb() {
    return os.totalmem() / 1024 / 1024;
  }

  public get availableMb() {
    return this.freeMb - MemoryManager.MARGIN_MB;
  }

  public log() {
    console.warn('free / total', this.freeMb, this.totalMb);
  }
}
