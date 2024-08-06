import TextFormatter from './TextFormatter.js';

export default class TelegramFormatter extends TextFormatter {
	public static MSG_SPLIT_STRING = '&NEW_MSG';

	public multiMessage(...messages: string[]) {
		return messages.join(TelegramFormatter.MSG_SPLIT_STRING);
	}

	public sp(length: number = 1) {
		const f = this;
		return f.m(' '.repeat(length));
	}

	// Bold
	public b(text: string) {
		return `<b>${text}</b>`;
	}

	// Italics
	public i(text: string) {
		return `<i>${text}</i>`;
	}

	// Underline
	public u(text: string) {
		return `<u>${text}</u>`;
	}

	// Strikethrough
	public s(text: string) {
		return `<s>${text}</s>`;
	}

	// Monospace
	public m(text: string) {
		return `<code>${text}</code>`;
	}
}
