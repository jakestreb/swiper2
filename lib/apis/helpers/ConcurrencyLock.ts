export default class ConcurrencyLock {

	// Array of promise resolvers
	private lockPromises: Array<() => void> = [];
	private concurrency = 0;

	constructor(public lockSize = 1) {}

	public async acquire<T>(lockFn: () => Promise<T>): Promise<T> {
	  this.concurrency += 1;
	  if (this.concurrency > this.lockSize) {
	    await new Promise(resolve => {
	      this.lockPromises.push(resolve as () => void);
	    });
	  }
	  try {
	    return await lockFn();
	  } finally {
	    if (this.lockPromises.length > 0) {
	      const resolver = this.lockPromises.shift()!;
	      resolver();
	    }
	    this.concurrency -= 1;
	  }
	}
}
