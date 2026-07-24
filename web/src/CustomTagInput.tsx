import {useState} from "react";
import "./custom-tag-input.css";
import "./popular-tags.css";

export function CustomTagInput({value,onChange,popularTags=[]}:{value:string[];onChange:(tags:string[])=>void;popularTags?:Array<{tag:string;count:number}>}){
 const[draft,setDraft]=useState("");
 function add(){const tag=draft.trim();if(!tag||value.some(item=>item.toLocaleLowerCase()===tag.toLocaleLowerCase()))return;onChange([...value,tag]);setDraft("")}
 const suggestions=popularTags.filter(item=>!value.some(tag=>tag.toLocaleLowerCase()===item.tag.toLocaleLowerCase())).slice(0,8);
 return <div className="custom-tag-input-wrap"><div className="custom-tag-input">
  <div className="custom-tag-control">{value.map(tag=><span className="project-tag" key={tag}>{tag}<button type="button" aria-label={`Remove tag ${tag}`} onClick={()=>onChange(value.filter(item=>item!==tag))}>×</button></span>)}<input aria-label="Add project tag" value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"||event.key===","){event.preventDefault();add()}}} placeholder={value.length?"Add another tag":"Type a tag and press Enter"}/></div>
  <button type="button" className="tag-add-button" onClick={add} disabled={!draft.trim()}>Add tag</button>
 </div>{suggestions.length>0&&<div className="popular-tags"><span>Most used</span><div>{suggestions.map(item=><button type="button" key={item.tag} onClick={()=>onChange([...value,item.tag])}>{item.tag}<small>{item.count}</small></button>)}</div></div>}</div>
}
