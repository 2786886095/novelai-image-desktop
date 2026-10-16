// Synthetic policy replay only; never an Android native pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {folderUiAction} from './android-folder-picker-driver.mjs';
const appId='com.example.isolated',ctx={appId,folderName:'NativeOutput-7192-1792191883494204'};
const attrs=o=>Object.entries(o).map(([k,v])=>`${k}="${v}"`).join(' ');
const label={package:'com.android.settings',class:'android.widget.TextView',text:'Allow access to manage all files',enabled:'true',checkable:'false',clickable:'false',bounds:'[63,1005][840,1076]'};
const row={package:'com.android.settings',class:'android.view.View','resource-id':'',enabled:'true',checkable:'true',clickable:'true',checked:'false',bounds:'[0,963][1080,1118]'};
const leaf=o=>`<node ${attrs(o)}/>`;
const wrap=body=>`<hierarchy><node package="com.android.settings" class="androidx.compose.ui.platform.ComposeView">${body}</node></hierarchy>`;
const tree=(r={},l={},extra='')=>wrap(`<node ${attrs({...row,...r})}>${leaf({...label,...l})}${extra}</node>`);
const run=(xml,state={useTapped:true})=>folderUiAction(xml,ctx,state);
test('captured Android14 Compose permission row shape is actionable only after actual nonce selection',()=>{
 const state={useTapped:true};assert.deepEqual(run(tree(),state),{kind:'enable-observed-all-files-permission',tap:[540,1040]});assert.equal(state.permissionTapped,true);
 assert.throws(()=>run(tree(),{}),/before real folder/);
 const granted={useTapped:true};assert.deepEqual(run(tree({checked:'true'}),granted),{kind:'return-from-observed-permission',key:'KEYCODE_BACK'});assert.equal(granted.permissionObserved,true);
});
test('Compose permission label must be a descendant of the same checkable parent, not a nearby flat label',()=>{
 assert.equal(run(wrap(leaf(row)+leaf(label))).kind,'wait-permission-switch');
 assert.equal(run(tree().replace('androidx.compose.ui.platform.ComposeView','android.widget.LinearLayout')).kind,'wait-permission-switch');
});
test('ambiguous duplicate Compose rows or labels never choose the first unchecked control',()=>{
 const body=`<node ${attrs(row)}>${leaf(label)}</node>`;
 assert.throws(()=>run(wrap(body+body)),/Ambiguous/);
 assert.throws(()=>run(tree({}, {},leaf(label))),/Ambiguous/);
});
test('unknown disabled unchecked identity fields cannot authorize permission',()=>{
 for(const patch of [{checked:'unknown'},{checked:''},{checkable:'false'},{clickable:'false'},{enabled:'false'},{'resource-id':'other:id/switch'}])assert.throws(()=>run(tree(patch)),/Unrecognized/);
 for(const patch of [{enabled:'false'},{checkable:'true'},{clickable:'true'}])assert.throws(()=>run(tree({},patch)),/Unrecognized/);
 assert.throws(()=>run(tree({}, {text:'Allow a different permission'})),/Unrecognized Android settings page/);
});
test('Compose row and exact label bounds must both be valid and contained',()=>{
 for(const patch of [{bounds:'[0,0][0,0]'},{bounds:'[0,0][20000,20000]'},{bounds:'invalid'}])assert.throws(()=>run(tree(patch)),/bounds/);
 for(const patch of [{bounds:'[0,0][0,0]'},{bounds:'[0,962][840,1076]'},{bounds:'[63,1005][1081,1076]'}])assert.throws(()=>run(tree({},patch)),/bounds|outside/);
});
test('foreign OS packages unhealthy dialogs and unbalanced hierarchy fail closed',()=>{
 assert.throws(()=>run(tree({package:'other.app'})),/Unexpected/);
 assert.throws(()=>run(tree({}, {text:'App is not responding'})),/Unhealthy/);
 assert.throws(()=>run(tree().replace('</node></node>','</node>')),/Unbalanced/);
});
