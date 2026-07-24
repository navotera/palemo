import {useMemo,useState} from "react";

export type TagOption={value:string;label:string;description?:string;tone?:"division"|"team"|"user"};

export function TagMultiSelect({options,value,onChange,placeholder,emptyText="No matches found"}:{options:TagOption[];value:string[];onChange:(value:string[])=>void;placeholder:string;emptyText?:string}){
 const[query,setQuery]=useState("");const[open,setOpen]=useState(false);
 const selected=options.filter(option=>value.includes(option.value));
 const available=useMemo(()=>options.filter(option=>!value.includes(option.value)&&option.label.toLowerCase().includes(query.trim().toLowerCase())),[options,value,query]);
 function add(id:string){onChange([...value,id]);setQuery("");setOpen(true)}
 return <div className="tag-select" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
  <div className="tag-select-control" onClick={()=>setOpen(true)}>
   {selected.map(option=><span className="selection-tag" key={option.value}>{option.label}<button type="button" aria-label={`Remove ${option.label}`} onClick={event=>{event.stopPropagation();onChange(value.filter(id=>id!==option.value))}}>×</button></span>)}
   <input value={query} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setOpen(true)}} placeholder={selected.length?"Search more…":placeholder} aria-label={placeholder}/>
  </div>
  {open&&<div className="tag-select-menu">{available.length?available.map(option=><button type="button" key={option.value} onMouseDown={event=>event.preventDefault()} onClick={()=>add(option.value)}><strong>{option.tone==="user"?<svg className="tag-option-user" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>:option.tone?<i className={`tag-option-dot ${option.tone}`} aria-hidden="true"/>:null}{option.label}</strong>{option.description&&<small>{option.description}</small>}</button>):<p>{emptyText}</p>}</div>}
 </div>
}
