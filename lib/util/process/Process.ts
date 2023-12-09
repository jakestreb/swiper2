interface Constructor<T> {
  new (...any: any): T;
}

export abstract class Process {
  public healthCheck(): boolean {
    return true;
  }
}

export function runProcess<T extends Process>(ctor: Constructor<T>): void {
  let childProcess: T;
  process.on('message', async (req) => {
    const { id, fn, args } = req;

    if (fn === 'constructor') {
      // @ts-ignore
      childProcess = new ctor(...args);
      return;
    }

    try {
      // @ts-ignore
      const result = await childProcess[fn](...args);
      process.send!({ id, result });
    } catch (err) {
      process.send!({ id, err: `${err}` });
    } 
  });
}
