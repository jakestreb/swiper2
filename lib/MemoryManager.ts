import checkDiskSpace from 'check-disk-space'

export default class MemoryManager {

  private static MARGIN_MB = 1000;

  constructor(public downloadRoot: string) {}

  public async getAvailableMb() {
    const free = await this.getFreeMb();
    return free - MemoryManager.MARGIN_MB;
  }

  public async getTotalMb() {
    const { size } = await checkDiskSpace(this.downloadRoot);
    return size / 1024 / 1024;
  }

  public async getFreeMb() {
    // return os.freemem() / 1024 / 1024;
    const { free } = await checkDiskSpace(this.downloadRoot);
    return free / 1024 / 1024;
  }

  public async log() {
    const total = await this.getTotalMb();
    const free = await this.getFreeMb();
    console.warn('free / total', free, total);
  }
}
