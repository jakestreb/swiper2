import getFolderSize from 'get-folder-size';
import checkDiskSpace from 'check-disk-space'
import * as path from 'path';
import { promisify } from 'util';

const getFolderSizeAsync = promisify(getFolderSize);

export default class MemoryManager {

  private static MAX_MEMORY_MB = parseInt(process.env.MAX_MEMORY_MB || '0', 10) || 20000;
  private static MARGIN_MB = 1000;

  constructor(public downloadRoot: string) {}

  public async getRemainingMb() {
    const machineAvailable = await this.getAvailableMb();
    const swiperUsed = await this.getUsedMb();
    const allowedAvailable = MemoryManager.MAX_MEMORY_MB - swiperUsed;
    return Math.min(allowedAvailable, machineAvailable);
  }

  public async getAvailableMb() {
    const free = await this.getFreeMb();
    return free - MemoryManager.MARGIN_MB;
  }

  public getUsedMb() {
    return getDirectorySizeMb(this.downloadRoot);
  }

  public getProgressMb(t: ITorrent): Promise<number> {
    return getDirectorySizeMb(path.join(this.downloadRoot, t.getDownloadPath()));
  }

  // TODO: Remove (used for logging only)
  public async getTotalMb() {
    const { size } = await checkDiskSpace(this.downloadRoot);
    return size / 1024 / 1024;
  }

  // TODO: Remove (used for logging only)
  public async getFreeMb() {
    // return os.freemem() / 1024 / 1024;
    const { free } = await checkDiskSpace(this.downloadRoot);
    return free / 1024 / 1024;
  }

  // TODO: Remove (used for logging only)
  public async log() {
    const total = await this.getTotalMb();
    const free = await this.getFreeMb();
    console.warn('free / total', free, total);
  }
}

async function getDirectorySizeMb(directory: string): Promise<number> {
  try {
    const folderSize = await getFolderSizeAsync(directory);
    return folderSize / 1024 / 1024;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return 0;
    }
    throw err;
  }
}
