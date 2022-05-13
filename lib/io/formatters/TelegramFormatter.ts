import TextFormatter from './TextFormatter';

export default class TelegramFormatter extends TextFormatter {
  public sp(length: number = 1) {
    return `\`${' '.repeat(length)}\``;
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
