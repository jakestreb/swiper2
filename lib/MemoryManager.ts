import * as os from 'os';
import * as util from './common/util';

export default class MemoryManager {

  // TODO: Investigate and remove
  private _initFree = os.freemem();

  constructor(private _allocationsMb: {[key: number]: number} = {}) {
    // check free memory
    const freeMemory = os.freemem();
    // check the total memory
    const totalMemory = os.totalmem();
    console.warn('free / total', freeMemory, totalMemory);

    setInterval(() => { console.warn('lostMb', this.lostMb) }, 30000);
  }

  public get freeMb() {
    return os.freemem();
  }

  public get allocatedMb() {
    return util.sum(Object.keys(this._allocationsMb).map((k: any) => this._allocationsMb[k]));
  }

  public get remainingMb() {
    return this.freeMb - this.allocatedMb;
  }

  // TODO: Investigate and remove
  public get lostMb() {
    return this._initFree - this.allocatedMb - this.freeMb;
  }

  public allocate(key: number, totalSizeMb: number) {
    this._allocationsMb[key] = totalSizeMb;
  }

  public pause(key: number, currentSizeMb: number) {
    this._allocationsMb[key] = currentSizeMb;
  }

  public delete(key: number) {
    delete this._allocationsMb[key];
  }

  // Useful to preview pause allocation changes
  public copy() {
    return new MemoryManager(this._allocationsMb);
  }
}
