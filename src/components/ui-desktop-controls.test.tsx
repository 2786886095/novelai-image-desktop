import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {Button,SecretInput} from './ui';

describe('shared desktop action contract',()=>{
  it('keeps the default secondary action and caller type/form/name/value',()=>{
    const markup=renderToStaticMarkup(<Button type="submit" form="fixture" name="intent" value="save">Save</Button>);
    expect(markup).toContain('class="btn btn-secondary"');
    for(const fragment of ['type="submit"','form="fixture"','name="intent"','value="save"','>Save</button>'])expect(markup).toContain(fragment);
    expect(markup).not.toContain('disabled');expect(markup).not.toContain('aria-busy');
  });
  it('offers an explicit compact size without forwarding an invalid size attribute',()=>{
    const markup=renderToStaticMarkup(<Button size="sm" variant="ghost" className="fixture-action">Compact</Button>);
    expect(markup).toContain('class="btn btn-ghost btn-sm fixture-action"');expect(markup).not.toContain('size=');
  });
  it('loading is a native disabled control with an accessible name and busy state',()=>{
    const markup=renderToStaticMarkup(<Button loading aria-busy={false} aria-label="Save draft">Saving</Button>);
    expect(markup).toContain('is-loading');expect(markup).toContain('disabled=""');expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Save draft"');expect(markup).toContain('>Saving</button>');expect(markup).not.toContain('loading=');
  });
  it('retains caller-supplied disabled and busy states without loading',()=>{
    const markup=renderToStaticMarkup(<Button disabled aria-busy="true">Work</Button>);
    expect(markup).toContain('disabled=""');expect(markup).toContain('aria-busy="true"');expect(markup).not.toContain('is-loading');
  });
  it('a secret field keeps its value masked and makes its named eye action tabbable',()=>{
    const markup=renderToStaticMarkup(<SecretInput label="Fixture credential" value="not-a-real-secret" onChange={()=>{}} showLabel="Show fixture" hideLabel="Hide fixture"/>);
    expect(markup).toContain('type="password"');expect(markup).toContain('value="not-a-real-secret"');
    expect(markup).toContain('class="secret-field-toggle"');expect(markup).toContain('aria-label="Show fixture"');
    expect(markup).not.toContain('tabindex="-1"');expect(markup).toContain('type="button"');
  });
});
