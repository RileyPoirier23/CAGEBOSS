import { describe, it, expect } from 'vitest';
import { setBleep, bleepText } from '../src/ui/text';
describe('bleep', () => {
  it('grawlixes swears only when on', () => {
    const s = "HOLY SHIT, that motherfucker got his ass kicked. Assassin passes the class.";
    expect(bleepText(s)).toBe(s);
    setBleep(true);
    const b = bleepText(s);
    console.log(b);
    expect(b).not.toMatch(/shit|fuck|\bass\b/i);
    expect(b).toContain('Assassin passes the class');
  });
});
