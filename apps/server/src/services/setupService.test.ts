import { describe, expect, it } from 'vitest';
import { setupSchema } from './setupService';

const VALID = {
  hotelName: 'Hotel Grand Palace',
  ownerFullName: 'Asha Patil',
  username: 'asha',
  password: 'correct-horse',
};

describe('setupSchema', () => {
  it('accepts a complete setup request', () => {
    const parsed = setupSchema.parse(VALID);
    expect(parsed).toEqual(VALID);
  });

  it('trims surrounding whitespace', () => {
    const parsed = setupSchema.parse({ ...VALID, hotelName: '  Hotel Grand  ', username: ' asha ' });
    expect(parsed.hotelName).toBe('Hotel Grand');
    expect(parsed.username).toBe('asha');
  });

  it('rejects a short password', () => {
    expect(setupSchema.safeParse({ ...VALID, password: 'short12' }).success).toBe(false);
  });

  it('rejects usernames with unsupported characters', () => {
    expect(setupSchema.safeParse({ ...VALID, username: 'asha patil' }).success).toBe(false);
    expect(setupSchema.safeParse({ ...VALID, username: 'as' }).success).toBe(false);
  });

  it('rejects an empty hotel name', () => {
    expect(setupSchema.safeParse({ ...VALID, hotelName: '   ' }).success).toBe(false);
  });
});
