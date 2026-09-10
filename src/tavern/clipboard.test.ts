import { it, expect, vi } from 'vitest';
import { copyTavernText } from './clipboard';

it('modern copy resolves only after clipboard writes', async () => {
  let finish!: () => void;
  const write = vi.fn(() => new Promise<void>(r => finish = r));
  const done = vi.fn();
  const promise = copyTavernText('neutral text', write, {} as Document).then(done);
  await Promise.resolve(); expect(done).not.toHaveBeenCalled();
  finish(); await promise; expect(done).toHaveBeenCalledOnce();
});
for (const result of [true, false, 'throw']) {
  it(`legacy result ${result} is not falsely reported as success; focus and nodes restored`, async () => {
    const textarea = {value: '',style:{},select:vi.fn(),remove:vi.fn()};
    const focus = {isConnected:true,focus:vi.fn()};
    const doc = {activeElement:focus,getSelection:()=>null,createElement:()=>textarea,
      body:{appendChild:vi.fn()}, execCommand:vi.fn(()=>{if(result==='throw')throw Error('denied');return result;})};
    const copy = copyTavernText('plain text', async()=>{throw Error('denied')},doc as unknown as Document);
    if (result === true) await expect(copy).resolves.toBeUndefined();
    else await expect(copy).rejects.toThrow();
    expect(textarea.remove).toHaveBeenCalledOnce();
    expect(focus.focus).toHaveBeenCalledWith({preventScroll:true});
  });
}
