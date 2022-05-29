import DownloadClient from './DownloadClient';

let downloadClient: DownloadClient;

process.on('message', async (req) => {
	console.warn('REQUEST', req);
	const { id, fn, args } = req;

	if (fn === 'constructor') {
		// @ts-ignore
		downloadClient = new DownloadClient(...args);
		return;
	}

	try {
		// @ts-ignore
		const result = await downloadClient[fn](...args);
		process.send!({ id, result });
	} catch (err) {
		process.send!({ id, err: `${err}` });
	}
});
