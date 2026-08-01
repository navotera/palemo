import {useEffect,useState} from "react";
import {KnowledgeRichEditor} from "./KnowledgeRichEditor";
import "./project-preliminary-notes.css";
import "./project-preliminary-notes-overrides.css";

export type PreliminaryNoteTemplate={id:string;name:string;content_markdown:string;source?:"template"|"knowledge";updated_at?:string;usage_count?:number};
type TemplateEnvelope={data:PreliminaryNoteTemplate[];errors:null|Array<{message:string}>};

export function ProjectPreliminaryNotes({value,onChange,reviewerValue,onReviewerChange,canEditReviewerNote,templates,selectedKnowledgeIDs,onKnowledgeIDsChange}:{value:string;onChange:(value:string)=>void;reviewerValue:string;onReviewerChange:(value:string)=>void;canEditReviewerNote:boolean;templates:PreliminaryNoteTemplate[];selectedKnowledgeIDs:string[];onKnowledgeIDsChange:(ids:string[])=>void}){
 const [knowledgeExpanded,setKnowledgeExpanded]=useState(false);
 const [notesExpanded,setNotesExpanded]=useState(false);
 const [activeNoteTab,setActiveNoteTab]=useState<"user"|"reviewer">("user");
 const [knowledgeSort,setKnowledgeSort]=useState<"recent"|"used">("recent");
 const [knowledgeSearch,setKnowledgeSearch]=useState("");
 const [knowledgeResults,setKnowledgeResults]=useState<PreliminaryNoteTemplate[]>([]);
 const [knowledgeSearchPending,setKnowledgeSearchPending]=useState(false);
 const [knowledgeSearchError,setKnowledgeSearchError]=useState("");

 useEffect(()=>{
  if(!knowledgeExpanded)return;
  const controller=new AbortController();
  const timer=window.setTimeout(async()=>{
   setKnowledgeSearchPending(true);setKnowledgeSearchError("");
   try{const params=new URLSearchParams({source:"knowledge",limit:"20"});if(knowledgeSearch.trim())params.set("q",knowledgeSearch.trim());const response=await fetch(`/api/v1/preliminary-note-templates?${params}`,{credentials:"include",signal:controller.signal});const body=await response.json() as TemplateEnvelope;if(!response.ok)throw new Error(body.errors?.[0]?.message??"Knowledge search failed");setKnowledgeResults(body.data)}catch(error){if(!controller.signal.aborted)setKnowledgeSearchError(error instanceof Error?error.message:"Knowledge search failed")}finally{if(!controller.signal.aborted)setKnowledgeSearchPending(false)}
  },300);
  return()=>{window.clearTimeout(timer);controller.abort()};
 },[knowledgeExpanded,knowledgeSearch]);

 const knowledgeTemplates=[...knowledgeResults].sort((a,b)=>knowledgeSort==="used"?(b.usage_count??0)-(a.usage_count??0)||String(b.updated_at??"").localeCompare(String(a.updated_at??"")):String(b.updated_at??"").localeCompare(String(a.updated_at??"")));
 const reviewerReadOnly=activeNoteTab==="reviewer"&&!canEditReviewerNote;
 function addKnowledgeSource(item:PreliminaryNoteTemplate){const id=item.id.replace(/^knowledge:/,"");if(!selectedKnowledgeIDs.includes(id))onKnowledgeIDsChange([...selectedKnowledgeIDs,id])}
 function removeKnowledgeSource(id:string){onKnowledgeIDsChange(selectedKnowledgeIDs.filter(item=>item!==id))}
 function toggleKnowledge(){setKnowledgeExpanded(current=>!current)}
 function toggleNotes(){setNotesExpanded(current=>!current)}

 return <div className="preliminary-project-inputs">
  <section className={`preliminary-notes${knowledgeExpanded?" is-expanded":""}`} aria-labelledby="knowledge-source-title">
   <div className="preliminary-notes-toggle is-clickable" onClick={toggleKnowledge}><div><strong id="knowledge-source-title">Knowledge Source</strong><small>Optional</small></div><button type="button" aria-expanded={knowledgeExpanded} aria-controls="project-knowledge-source-content" onClick={event=>{event.stopPropagation();toggleKnowledge()}}>{knowledgeExpanded?"Hide sources":"+ Add sources"}</button></div>
   <div id="project-knowledge-source-content" className="preliminary-notes-content" hidden={!knowledgeExpanded}>
    <div className="preliminary-knowledge-browser">
     <div className="knowledge-search-row"><input type="search" value={knowledgeSearch} onChange={event=>setKnowledgeSearch(event.target.value)} placeholder="Search knowledge sources..." aria-label="Search knowledge sources"/><span>{knowledgeSearchPending?"Searching...":`${knowledgeTemplates.length} results`}</span></div>
     {!!selectedKnowledgeIDs.length&&<div className="selected-knowledge-sources" aria-label="Selected knowledge sources">{selectedKnowledgeIDs.map(id=>{const item=knowledgeResults.find(result=>result.id===`knowledge:${id}`)||templates.find(result=>result.id===`knowledge:${id}`);return <span key={id}>{item?.name??"Knowledge source"}<button type="button" onClick={()=>removeKnowledgeSource(id)} aria-label={`Remove ${item?.name??"knowledge source"}`}>×</button></span>})}</div>}
     <header><div><button type="button" className={knowledgeSort==="recent"?"active":""} onClick={()=>setKnowledgeSort("recent")}>Recent</button><button type="button" className={knowledgeSort==="used"?"active":""} onClick={()=>setKnowledgeSort("used")}>Most used</button></div></header>
     <div className="knowledge-search-results">{knowledgeTemplates.map(item=>{const selected=selectedKnowledgeIDs.includes(item.id.replace(/^knowledge:/,""));return <div className={selected?"selected":""} key={item.id}><span><strong>{item.name}</strong></span><em>{item.usage_count??0} uses</em><button type="button" disabled={selected} onClick={()=>addKnowledgeSource(item)}>{selected?"Added":"Add"}</button></div>})}{knowledgeSearchError&&<p>{knowledgeSearchError}</p>}{!knowledgeSearchPending&&!knowledgeSearchError&&!knowledgeTemplates.length&&<p>No matching knowledge sources found.</p>}</div>
    </div>
   </div>
  </section>
  <section className={`preliminary-notes${notesExpanded?" is-expanded":""}`} aria-labelledby="preliminary-notes-title">
   <div className="preliminary-notes-toggle is-clickable" onClick={toggleNotes}><div><strong id="preliminary-notes-title">Preliminary Notes</strong><small>Optional</small></div><button type="button" aria-expanded={notesExpanded} aria-controls="project-preliminary-notes-content" onClick={event=>{event.stopPropagation();toggleNotes()}}>{notesExpanded?"Hide notes":"+ Add notes"}</button></div>
   {notesExpanded&&<div id="project-preliminary-notes-content" className="preliminary-notes-content"><div className="preliminary-note-tabs" role="tablist" aria-label="Preliminary note type"><button type="button" role="tab" aria-selected={activeNoteTab==="user"} className={activeNoteTab==="user"?"active":""} onClick={()=>setActiveNoteTab("user")}>User Note</button><button type="button" role="tab" aria-selected={activeNoteTab==="reviewer"} className={activeNoteTab==="reviewer"?"active":""} onClick={()=>setActiveNoteTab("reviewer")}>Reviewer Note</button></div><KnowledgeRichEditor key={activeNoteTab} value={activeNoteTab==="reviewer"?reviewerValue:value} onChange={activeNoteTab==="reviewer"?onReviewerChange:onChange} readOnly={reviewerReadOnly} ariaLabel={activeNoteTab==="reviewer"?`Project reviewer note editor${reviewerReadOnly?" read only":""}`:"Project user note editor"} compact changeDebounceMs={0}/>{reviewerReadOnly&&<small className="reviewer-note-lock">Only an assigned project reviewer can edit this note.</small>}</div>}
  </section>
 </div>;
}
