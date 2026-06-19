import { toTurnSignal } from './control-tool';

describe('toTurnSignal', () => {
  it('yieldTo와 passReason, done를 정규화한다', () => {
    expect(toTurnSignal({ yieldTo: 'a1', passReason: '보안 관점 필요', done: false })).toEqual({
      yieldTo: 'a1',
      passReason: '보안 관점 필요',
      done: false,
    });
  });

  it('passReason이 비면 null로 둔다', () => {
    expect(toTurnSignal({ yieldTo: 'a1', done: true })).toEqual({
      yieldTo: 'a1',
      passReason: null,
      done: true,
    });
  });

  it('빈 문자열/누락은 기본값으로 처리한다', () => {
    expect(toTurnSignal({ yieldTo: '  ', passReason: '' })).toEqual({
      yieldTo: null,
      passReason: null,
      done: false,
    });
  });
});
