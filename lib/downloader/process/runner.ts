import DownloadProcess from './DownloadProcess';

let childProcess: DownloadProcess;

process.on('message', async (req) => {
	const { id, fn, args } = req;

	if (fn === 'constructor') {
		// @ts-ignore
		childProcess = new DownloadProcess(...args);
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
