import {Conversation, Swiper, SwiperReply} from '../Swiper';
import * as commands from './_helpcommands.json';

const ALL_CMDS = [...commands.basic, ...commands.monitoring, ...commands.advanced];

export function help(this: Swiper, convo: Conversation): SwiperReply {
  if (!convo.input) {
    return {
      data: `\`COMMANDS\`\n` +
        `\`  \`${cmdGroup(commands.basic)}\n` +
        `\`  \`${cmdGroup(commands.monitoring)}\n` +
        `\`  \`${cmdGroup(commands.advanced)}\n\n` +
        `help \`command\` for details`,
      final: true
    };
  } else {
    const cmd = ALL_CMDS.find(_cmd => _cmd.name === convo.input);
    if (!cmd) {
      return {
        data: `command \`${convo.input}\` not recognized`,
        final: true
      };
    } else {
      let examples = '';
      if (cmd.examples) {
        examples = `\n_Ex:_\n` +
          `${cmd.examples.map(ex => `\`  ${ex}\``).join('\n')}`;
      }
      return {
        data: `\`${convo.input}\`\n_${cmd.description}_${examples}`,
        final: true
      };
    }
  }
}

function cmdGroup(group: any) {
  return group.map((cmd: any) => cmdName(cmd)).join(', ');
}

function cmdName(cmd: any) {
  return cmd.emphasize ? `*${cmd.name}*` : cmd.name;
}
