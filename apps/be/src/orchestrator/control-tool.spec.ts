import { extractSignalFromText, toTurnSignal } from './control-tool';

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

describe('extractSignalFromText', () => {
  it('함수호출 형태 signal_turn({...}) 를 캡처하고 본문에서 제거한다 (실모드 관측 형식)', () => {
    const content =
      "본문입니다.\n\nsignal_turn({ done: false, yieldTo: 'be-1', passReason: 'API 의견을 듣고 싶다.' });";
    const { signal, cleaned } = extractSignalFromText(content);
    expect(signal).toEqual({ done: false, yieldTo: 'be-1', passReason: 'API 의견을 듣고 싶다.' });
    expect(cleaned).toBe('본문입니다.');
  });

  it('대입 형태 signal_turn = {...} 를 캡처한다 (작은따옴표)', () => {
    const content =
      "발언.\nsignal_turn = {done: false, yieldTo: '69928268-7881-40c2-88c4-bb82a2f2686b', passReason: '의견 필요'}";
    const { signal, cleaned } = extractSignalFromText(content);
    expect(signal.yieldTo).toBe('69928268-7881-40c2-88c4-bb82a2f2686b');
    expect(signal.done).toBe(false);
    expect(cleaned).toBe('발언.');
  });

  it('큰따옴표 JSON 키와 done:true 를 캡처한다', () => {
    const content = '본문.\nsignal_turn = {"done": true, "yieldTo": null, "passReason": null}';
    const { signal, cleaned } = extractSignalFromText(content);
    expect(signal).toEqual({ done: true, yieldTo: null, passReason: null });
    expect(cleaned).toBe('본문.');
  });

  it('레거시 ```control 펜스 블록을 캡처한다', () => {
    const content = '발언 본문.\n```control\n{"yieldTo": "abc", "passReason": "이유", "done": false}\n```';
    const { signal, cleaned } = extractSignalFromText(content);
    expect(signal).toEqual({ done: false, yieldTo: 'abc', passReason: '이유' });
    expect(cleaned).toBe('발언 본문.');
  });

  it('신호 블록이 없으면 본문을 그대로 두고 빈 신호를 반환한다', () => {
    const content = '그냥 평범한 발언입니다.';
    const { signal, cleaned } = extractSignalFromText(content);
    expect(signal).toEqual({ done: false, yieldTo: null, passReason: null });
    expect(cleaned).toBe(content);
  });
});
