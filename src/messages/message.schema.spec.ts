import { parseMessageBody } from './message.schema';

describe('parseMessageBody', () => {
  it('parses a urlencoded-style payload', () => {
    expect(parseMessageBody({ email: 'Visitor@Company.COM ', message: '  hi  ', company: '' })).toEqual({
      email: 'visitor@company.com',
      message: 'hi',
      company: '',
    });
  });

  it('rejects missing/invalid fields and non-objects', () => {
    expect(parseMessageBody(null)).toBeNull();
    expect(parseMessageBody('str')).toBeNull();
    expect(parseMessageBody({})).toBeNull();
    expect(parseMessageBody({ email: 'not-an-email', message: 'hi' })).toBeNull();
    expect(parseMessageBody({ email: 'a@b.co', message: '' })).toBeNull();
    expect(parseMessageBody({ email: 'a@b.co', message: 'x'.repeat(5001) })).toBeNull();
  });

  it('accepts an empty email as anonymous', () => {
    expect(parseMessageBody({ email: '', message: 'hi' })).toEqual({ email: '', message: 'hi', company: '' });
    expect(parseMessageBody({ email: undefined, message: 'hi' })).toEqual({ email: '', message: 'hi', company: '' });
    expect(parseMessageBody({ message: '  hi  ' })).toEqual({ email: '', message: 'hi', company: '' });
  });

  it('keeps the honeypot value for the controller', () => {
    expect(parseMessageBody({ email: 'a@b.co', message: 'hi', company: 'bot filled' })?.company).toBe('bot filled');
  });
});
