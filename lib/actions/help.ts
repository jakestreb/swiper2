import {commands} from '../commands';
import {Conversation, Swiper, SwiperReply} from '../Swiper';

export function help(this: Swiper, convo: Conversation): SwiperReply {
  if (!convo.input) {
    return {
      data: `\`COMMANDS\`\n` +
        `${Object.keys(commands).map(cmd => `\`${cmd}\``).join(', ')}\n\n` +
        `\`help COMMAND\` for details`,
      final: true
    };
  } else {
    const cmdInfo = commands[convo.input];
    if (!cmdInfo) {
      return {
        data: `${convo.input} isn't a command`,
        final: true
      };
    } else {
      const argStr = cmdInfo.args.map(arg => ` ${arg}`).join('');
      const contentDesc = !cmdInfo.args.includes('CONTENT') ? '' : `Where \`CONTENT\` is of the form\n` +
        `\`  [movie/tv] TITLE [YEAR] [EPISODES]\`\n` +
        `_Ex:_\n` +
        `\`  game of thrones\`\n` +
        `\`  tv game of thrones 2011 s02\`\n` +
        `\`  game of thrones s01-03, s04e05 & e08\``;
      return {
        data: `\`${convo.input}${argStr}\` _${cmdInfo.desc}_\n${contentDesc}`,
        final: true
      };
    }
  }
}
