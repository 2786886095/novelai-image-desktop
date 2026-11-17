import {Button} from "./ui";

type Waypoint = readonly [key:string,label:string,unavailable?:boolean];

/** Jump within the mounted tool; never remount its form, queue or results. */
export function ToolWaypoints({label,items}:{label:string;items:readonly Waypoint[]}){
  return <nav className="tool-waypoints" aria-label={label}>
    {items.map(([key,caption,unavailable])=><Button key={key} type="button" disabled={unavailable}
      data-tool-waypoint={key} onClick={event=>{
        const host=event.currentTarget.closest(".tool-workspace-host")??event.currentTarget.closest("main");
        const target=Array.from(host?.querySelectorAll<HTMLElement>("[data-tool-anchor]")??[]).find(node=>node.dataset.toolAnchor===key);
        if(!target)return;
        target.scrollIntoView({block:"start",inline:"nearest"});
        target.focus({preventScroll:true});
      }}>{caption}</Button>)}
  </nav>;
}
