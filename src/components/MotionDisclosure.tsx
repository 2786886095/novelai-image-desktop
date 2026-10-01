import {useId,type ReactNode} from 'react';
import {useDisclosurePresence,disclosureAttributes} from './disclosure-motion';
/** Retain visual closing content without retaining live focus or pointer targets. */
export function MotionDisclosure({open,children,className='',id}:{open:boolean;children:ReactNode;className?:string;id?:string}){
 const present=useDisclosurePresence(open),fallback=useId();
 return <div id={id??fallback} className={'pi-motion-disclosure '+className} {...disclosureAttributes(open)}><div>{present&&children}</div></div>;
}
