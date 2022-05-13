import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

// TODO: Update/refactor
const commands = {
  "basic": [{
    "name": "status",
    "description": "shows all downloading/monitored items",
    "emphasize": true
  }, {
    "name": "download",
    "description": "downloads a movie/show",
    "emphasize": true,
    "examples": [
      "download the lion king",
      "download batman 1989",
      "download stranger things s2",
      "download the office s1e2-4 & e6"
    ]
  }, {
    "name": "remove",
    "description": "removes a downloading/monitored item",
    "emphasize": true,
    "examples": [
      "remove the outsider"
    ]
  }, {
    "name": "cancel",
    "description": "ends the current conversation"
  }],

  "advanced": [{
    "name": "search",
    "description": "gives a list of options for a movie/episode",
    "examples": [
      "search old yeller",
      "search game of thrones s1e2"
    ]
  }]
};
const ALL_CMDS = [...commands.basic, ...commands.advanced];

export function help(this: Swiper, convo: Conversation, f: TextFormatter): SwiperReply {
  if (!convo.input) {
    return {
      data: `\`COMMANDS\`\n` +
        `\`  \`${cmdGroup(commands.basic)}\n` +
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
