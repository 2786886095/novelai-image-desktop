import {useId,useRef,useState,type ReactNode,type InputHTMLAttributes} from 'react';
import {useAppStore} from '../store';
import {Button} from './ui';
const labels={
 'zh-CN':['选择文件','选择多个文件','尚未选择文件'],
 'zh-TW':['選擇檔案','選擇多個檔案','尚未選擇檔案'],
 'en-US':['Choose file','Choose files','No file selected'],
 'ja-JP':['ファイルを選択','複数のファイルを選択','ファイル未選択'],
 'ko-KR':['파일 선택','여러 파일 선택','선택한 파일 없음'],
};
/** Keep native selection semantics; only the in-app presentation is customized. */
export function FilePicker({onChange,disabled,multiple,className,selectedName,compact=false,buttonLabel,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'value'|'defaultValue'> & {selectedName?:string;compact?:boolean;buttonLabel?:ReactNode}){
 const language=useAppStore(s=>s.settings?.language??'zh-CN');
 const text=labels[language as keyof typeof labels]??labels['en-US'];
 const ref=useRef<HTMLInputElement>(null),id=useId();const [names,setNames]=useState('');
 const display=selectedName??names;
 return <span className={`file-picker ${compact?'file-picker-compact':''} ${className??''}`} data-disabled={disabled||undefined}>
  <input {...props} ref={ref} type="file" hidden disabled={disabled} multiple={multiple} onChange={e=>{
   if(e.target.files?.length)setNames(Array.from(e.target.files,f=>f.name).join(', '));
   onChange?.(e);
  }}/>
  <Button type="button" disabled={disabled} aria-describedby={compact?undefined:id} onClick={e=>{
   e.preventDefault();if(ref.current){ref.current.value='';ref.current.click();}
  }}>{buttonLabel??text[multiple?1:0]}</Button>
  {!compact && <span id={id} className="file-picker-name" title={display||undefined} aria-live="polite">{display||text[2]}</span>}
 </span>;
}
