import type {HarnessSnapshot} from './harness-types';
import {isNewerBundle} from './harness-version';
/** Official runtime state must never be inferred from the adapter version. */
export function officialUpdateStatus(state:HarnessSnapshot) {
 if(state.checkingUpdates)return 'checking';
 if(!state.version||!state.installedUpstream)return 'uninstalled';
 if(!state.updateInfo)return 'unknown';
 if(state.updateInfo.officialFailed||!state.updateInfo.official)return 'failed';
 return isNewerBundle(state.updateInfo.official,state.installedUpstream)?'available':'current';
}

/** One adapted package updates the component/runtime together; never download twice. */
export function combinedUpdateKind(state:HarnessSnapshot):'component'|'official'|null {
 const info=state.updateInfo;if(!info||state.checkingUpdates)return null;
 if(!info.componentFailed&&info.component&&(!state.version||isNewerBundle(info.component,state.version)))return 'component';
 return officialUpdateStatus(state)==='available'?'official':null;
}
