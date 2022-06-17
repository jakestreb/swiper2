import * as child from 'child_process';
import * as log from '../../log';
import EventEmitter from 'events';

interface Request {
	id: number;
	fn: string;
	args: any[];
}

interface Response {
	id: number;
	result?: any;
	err?: string;
}

interface Resolver {
	resolve: (value: unknown) => void;
	reject: (reason?: any) => void;
}

export default abstract class ChildProcess extends EventEmitter {
	public static HEALTH_CHECK_INTERVAL_S = 30; // TODO: Unused
	public static FAIL_HEALTH_CHECK_AFTER = 6; // TODO: Unused

	private child: child.ChildProcess;
	private buildArgs: any[];
	private started: boolean = false;

	private healthCheckTimeout: NodeJS.Timeout|null = null;
	private healthCheckFailCount: number = 0;

	private id: number = 0;
	private resolvers: {[id: number]: Resolver} = {};

	constructor(...buildArgs: any[]) {
		super();
		this.buildArgs = buildArgs || [];
	}

	public get nextId(): number {
		this.id += 1;
		return this.id;
	}

	public abstract get processPath(): string;

	public start(): void {
		if (this.started) {
			return;
		}
		this.child = child.fork(this.processPath);
		this.child.on('message', (resp: Response) => {
			const resolver = this.resolvers[resp.id];
			if (!resolver) {
				throw new Error('Child process messaged with no call to resolve');
			}
			if (resp.err) {
				resolver.reject(`Webtorrent error: ${resp.err}`);
			} else {
				resolver.resolve(resp.result);
			}
		});
		this.child.on('exit', () => {
			log.error('Download process exited, restarting');
			if (this.healthCheckTimeout) {
				clearTimeout(this.healthCheckTimeout);
			}
			this.started = false;
			this.start();
		});
		this.child.on('error', (err) => {
			log.error(`Download process fatal error: ${err}`);
		});
		this.child.send({
			id: 0,
			fn: 'constructor',
			args: this.buildArgs,
		});
		this.started = true;
		this.emit('start');
	}

	public restart(): void {
		this.child.kill('SIGINT');
	}

	public async call(fn: string, ...args: any[]): Promise<any> {
		if (!this.started) {
			throw new Error('Child process not started');
		}
		return new Promise((resolve, reject) => {
			const id = this.nextId;
			this.resolvers[id] = { resolve, reject };
			this.child.send({ id, fn, args } as Request);
		});
	}

	public async callWithTimeout(fn: string, timeoutMs: number, ...args: any[]): Promise<any> {
	    const promise = this.call(fn, ...args);
	    if (timeoutMs && timeoutMs > 0) {
	      const timeoutPromise = new Promise((resolve, reject) => {
	        const timeout = setTimeout(() => {
	          reject(`${fn} timed out after ${timeoutMs}ms`);
	        }, timeoutMs);
	        promise.then(() => clearTimeout(timeout));
	      });
	      return Promise.race([promise, timeoutPromise]);
	    }
	    return promise;
	}

	// TODO: Unused
	public async healthCheck(): Promise<void> {
		return;
	}

	// TODO: Unused
	private runHealthChecks(): void {
		setTimeout(async () => {
			if (!this.started) {
				return;
			}
			try {
				await this.healthCheck();
				this.healthCheckFailCount = 0;
			} catch (err) {
				log.error(`ChildProcess health check failed: ${err}`);
				this.healthCheckFailCount += 1;
				if (this.healthCheckFailCount >= ChildProcess.FAIL_HEALTH_CHECK_AFTER) {
					this.healthCheckFailCount = 0;
					this.restart();
					return;
				}
			}
			this.runHealthChecks();
		}, ChildProcess.HEALTH_CHECK_INTERVAL_S * 1000)
	}
}
