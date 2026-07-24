import {useState} from "react";
import "./project-checklist.css";

export type ChecklistMode="predefined"|"custom";

export function ProjectChecklistBuilder({mode,onModeChange,templateID,onTemplateChange,templates,items,onItemsChange}:{mode:ChecklistMode;onModeChange:(mode:ChecklistMode)=>void;templateID:string;onTemplateChange:(id:string)=>void;templates:Array<{id:string;name:string}>;items:string[];onItemsChange:(items:string[])=>void}){
 const[draft,setDraft]=useState("");
 function selectMode(next:ChecklistMode){onModeChange(next);if(next==="predefined")onItemsChange([]);else onTemplateChange("")}
 function add(){const label=draft.trim();if(!label)return;onItemsChange([...items,label]);setDraft("")}
 return <section className="project-checklist-builder" aria-labelledby="project-checklist-title">
  <div className="checklist-builder-head"><div><strong id="project-checklist-title">Project Checklist</strong><small>Start from a reusable checklist or build one for this project.</small></div></div>
  <div className="checklist-source-options" role="radiogroup" aria-label="Project checklist source">
   <label className={mode==="predefined"?"selected":""}><input type="radio" name="checklist-mode" checked={mode==="predefined"} onChange={()=>selectMode("predefined")}/><span><strong>Load Predefined Checklist</strong><small>Use an existing project template.</small></span></label>
   <label className={mode==="custom"?"selected":""}><input type="radio" name="checklist-mode" checked={mode==="custom"} onChange={()=>selectMode("custom")}/><span><strong>Custom Checklist</strong><small>Create checklist items for this project.</small></span></label>
  </div>
  {mode==="predefined"?<label className="checklist-template-select"><span>Predefined checklist</span><select value={templateID} onChange={event=>onTemplateChange(event.target.value)}><option value="">Select a checklist</option>{templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label>:<div className="custom-checklist"><div className="custom-checklist-entry"><label><span>Checklist item</span><div><input value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();add()}}} placeholder="Example: Stakeholder approval"/><button type="button" onClick={add} disabled={!draft.trim()}>Add</button></div></label></div>{items.length===0?<small>No custom items yet.</small>:<ol>{items.map((item,index)=><li key={`${index}-${item}`}><input aria-label={`Checklist item ${index+1}`} value={item} onChange={event=>onItemsChange(items.map((value,itemIndex)=>itemIndex===index?event.target.value:value))}/><button type="button" aria-label={`Remove ${item}`} onClick={()=>onItemsChange(items.filter((_,itemIndex)=>itemIndex!==index))}>Remove</button></li>)}</ol>}</div>}
 </section>
}
