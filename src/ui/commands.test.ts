import { describe, expect, it } from 'vitest';
import { findCommands, type Command } from './commands';
const commands: Command[] = [
  { id: 'move', label: 'Siirrä', group: 'Työkalut', keywords: 'move siirto', run() {} },
  { id: 'copy', label: 'Kopioi ja siirrä', group: 'Valinta', reason: 'Valitse osa.', run() {} },
  { id: 'edge', label: 'Reunat', group: 'Työkalut', keywords: 'pyöristys viiste', run() {} },
];
describe('command discovery', () => {
  it('matches Finnish with or without accents, supports aliases and favors direct names', () => {
    expect(findCommands(commands, 'SIIRRA').map((c) => c.id)).toEqual(['move', 'copy']);
    expect(findCommands(commands, 'pyoristys')[0].id).toBe('edge');
    expect(findCommands(commands, 'move')[0].id).toBe('move');
  });
  it('requires every word, exposes disabled reasons, and never invents an action', () => {
    expect(findCommands(commands, 'valinta siirrä')).toEqual([commands[1]]);
    expect(findCommands(commands, 'työkalut kopioi')).toEqual([]);
    expect(findCommands(commands, 'peilaa')).toEqual([]);
    expect(findCommands(commands, ' ')).toEqual(commands);
  });
});
