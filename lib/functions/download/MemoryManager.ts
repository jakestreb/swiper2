import getFolderSize from 'get-folder-size';
import checkDiskSpace from 'check-disk-space'
import * as path from 'path';
import { promisify } from 'util';

const getFolderSizeAsync = promisify(getFolderSize);

export default class MemoryManager {

  private static MAX_MEMORY_MB = parseInt(process.env.MAX_MEMORY_MB || '0', 10) || 100000;
  private static AVAILABILITY_MARGIN_MB = 1000;

  constructor(public downloadRoot: string) {}

  public async getRemainingMb() {
    const machineAvailable = await this.getAvailableMb();
    const swiperUsed = await this.getUsedMb();
    const allowedAvailable = MemoryManager.MAX_MEMORY_MB - swiperUsed;
    return Math.min(allowedAvailable, machineAvailable);
  }

  public async getAvailableMb() {
    const free = await this.getFreeMb();
    return free - MemoryManager.AVAILABILITY_MARGIN_MB;
  }

  public getUsedMb() {
    return getDirectorySizeMb(this.downloadRoot);
  }

  public getProgressMb(t: ITorrent): Promise<number> {
    return getDirectorySizeMb(path.join(this.downloadRoot, t.getDownloadPath()));
  }

  private async getFreeMb() {
    const { free } = await checkDiskSpace(this.downloadRoot);
    return free / 1024 / 1024;
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
