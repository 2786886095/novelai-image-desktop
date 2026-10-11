/** Pure semantic version comparison shared by launcher and renderer. */
export function isNewerBundle(candidate: string, current: string) {
  const valid=/^(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9.-]+))?$/i;
  const a=valid.exec(candidate),b=valid.exec(current);if(!a||!b)return false;
  for(let i=1;i<=3;i++)if(Number(a[i])!==Number(b[i]))return Number(a[i])>Number(b[i]);
  if(a[4]===b[4])return false;if(!a[4])return true;if(!b[4])return false;
  const x=a[4].split('.'),y=b[4].split('.');for(let i=0;i<Math.max(x.length,y.length);i++){
    if(x[i]===y[i])continue;if(x[i]===undefined)return false;if(y[i]===undefined)return true;
    const an=/^\d+$/.test(x[i]),bn=/^\d+$/.test(y[i]);if(an&&bn)return Number(x[i])>Number(y[i]);if(an!==bn)return !an;return x[i]>y[i];
  }return false;
}
