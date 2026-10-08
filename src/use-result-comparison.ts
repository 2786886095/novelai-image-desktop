import {useEffect,useRef,useState} from 'react';
import {useAppStore} from './store';
export function useResultComparison(surface:string,afterIdentity:string,beforeIdentity:string,canCompare:boolean,automatic:boolean){
 const request=useAppStore(s=>s.comparisonAutoOpenRequest);
 const pair=surface+'|'+afterIdentity+'|'+beforeIdentity;
 const previous=useRef('');const [enabled,setEnabled]=useState(false);
 useEffect(()=>{
  if(previous.current!==pair){previous.current=pair;setEnabled(false);}
  if(!canCompare)setEnabled(false);
  if(request===surface+'|'+afterIdentity){
   setEnabled(canCompare&&automatic);
   // Consume completion once: remount, settings updates and URL handoff must not reopen it.
   useAppStore.setState({comparisonAutoOpenRequest:null});
  }
 },[pair,surface,afterIdentity,canCompare,automatic,request]);
 return [enabled,setEnabled] as const;
}
