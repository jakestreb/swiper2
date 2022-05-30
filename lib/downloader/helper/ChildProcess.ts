import * as child from 'child_process';

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

export default abstract class ChildProcess {
	private child: child.ChildProcess;
	private buildArgs: any[];
	private started: boolean = false;

	private id: number = 0;
	private resolvers: {[id: number]: Resolver} = {};

	constructor(...buildArgs: any[]) {
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
			this.started = false;
		});
		this.child.on('error', (err) => {
			throw err;
		});
		this.child.send({
			id: 0,
			fn: 'constructor',
			args: this.buildArgs,
		});
		this.started = true;
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
}
