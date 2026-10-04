export interface Command {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  shortcut?: string;
  reason?: string;
  run: () => void;
}
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
/** Search only registered actions; every word must match the name or its aliases. */
export function findCommands(commands: Command[], query: string) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return commands
    .map((command, order) => {
      const label = normalize(command.label);
      const text = normalize(`${command.label} ${command.keywords ?? ''} ${command.group}`);
      const score = words.every((word) => text.includes(word))
        ? words.reduce(
            (n, word) => n + (label.startsWith(word) ? 4 : label.includes(word) ? 2 : 1),
            0,
          )
        : -1;
      return { command, score, order };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((item) => item.command);
}
