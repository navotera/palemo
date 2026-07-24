import {useEffect,useRef,useState} from "react";
import Editor from "@toast-ui/editor";
import colorSyntax from "@toast-ui/editor-plugin-color-syntax";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor-plugin-color-syntax/dist/toastui-editor-plugin-color-syntax.css";
import "tui-color-picker/dist/tui-color-picker.css";
import "./project-preliminary-notes.css";
import "./project-preliminary-notes-overrides.css";

export type PreliminaryNoteTemplate={id:string;name:string;content_markdown:string;source?:"template"|"knowledge";updated_at?:string;usage_count?:number};

function persistentTextColorCommand({selectedColor}:{selectedColor?:string},{tr,selection,schema}:any,dispatch:(tr:unknown)=>void){if(!selectedColor)return false;const mark=schema.marks.span.create({htmlAttrs:{style:`color: ${selectedColor}`}});if(selection.empty)tr.addStoredMark(mark);else tr.addMark(selection.from,selection.to,mark);dispatch(tr);return true}
function underlinePlugin(){return {markdownCommands:{underline:(_payload:unknown,{tr,selection,schema}:any,dispatch:(tr:unknown)=>void)=>{const text=selection.content().content.textBetween(0,selection.content().content.size,"\n");tr.replaceSelectionWith(schema.text(`<u>${text}</u>`));dispatch(tr);return true}},wysiwygCommands:{underline:(_payload:unknown,{tr,selection,schema}:any,dispatch:(tr:unknown)=>void)=>{if(selection.empty)return false;const mark=schema.marks.span.create({htmlAttrs:{style:"text-decoration: underline"}});tr.addMark(selection.from,selection.to,mark);dispatch(tr);return true}}}}

export function ProjectPreliminaryNotes({value,onChange,templateID,onTemplateChange,templates}:{value:string;onChange:(value:string)=>void;templateID:string;onTemplateChange:(id:string)=>void;templates:PreliminaryNoteTemplate[]}){
 const [expanded,setExpanded]=useState(false);
 const [hasOpened,setHasOpened]=useState(false);
 const [knowledgeSort,setKnowledgeSort]=useState<"recent"|"used">("recent");
 const [selectionMenu,setSelectionMenu]=useState({visible:false,left:0,top:0});
 const host=useRef<HTMLDivElement>(null);
 const instance=useRef<Editor|null>(null);
 const onChangeRef=useRef(onChange);
 onChangeRef.current=onChange;

 useEffect(()=>{
  if(!host.current)return;
  const underlineButton=document.createElement("button");
  underlineButton.type="button";
  underlineButton.className="editor-underline-control";
  underlineButton.textContent="U";
  underlineButton.setAttribute("aria-label","Underline");
  underlineButton.title="Underline";
  const editor=new Editor({
   el:host.current,
   height:"360px",
   initialEditType:"wysiwyg",
   previewStyle:"tab",
   initialValue:value||" ",
   usageStatistics:false,
   plugins:[colorSyntax,underlinePlugin],
   toolbarItems:[["heading","bold","italic",{name:"underline",tooltip:"Underline",el:underlineButton}],["hr"],["ul","ol","task","indent","outdent"],["table","link"],["code","codeblock"]]
  });
  editor.addCommand("wysiwyg","color",persistentTextColorCommand);
  underlineButton.addEventListener("click",()=>{editor.exec("underline");editor.focus()});
  let activeTextColor="";
  host.current.style.setProperty("--editor-text-color","#000000");
  host.current.addEventListener("click",event=>{const swatch=event.target instanceof Element?event.target.closest<HTMLElement>(".tui-colorpicker-palette-button"):null;if(!swatch)return;activeTextColor=swatch.getAttribute("title")||"";if(activeTextColor)host.current?.style.setProperty("--editor-text-color",activeTextColor)});
  const visualEditor=host.current.querySelector<HTMLElement>(".toastui-editor-ww-container .ProseMirror");
  visualEditor?.addEventListener("keydown",event=>{setSelectionMenu(current=>({...current,visible:false}));if(activeTextColor&&event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey)editor.exec("color",{selectedColor:activeTextColor})});
  const updateSelectionMenu=()=>{const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount){setSelectionMenu(current=>({...current,visible:false}));return}const range=selection.getRangeAt(0);if(!visualEditor?.contains(range.commonAncestorContainer)){setSelectionMenu(current=>({...current,visible:false}));return}const rect=range.getBoundingClientRect();const container=host.current?.closest<HTMLElement>(".preliminary-notes-content");if(!container)return;const containerRect=container.getBoundingClientRect();setSelectionMenu({visible:true,left:Math.max(0,Math.min(rect.left-containerRect.left,containerRect.width-150)),top:Math.max(0,rect.top-containerRect.top-38)})};
  document.addEventListener("selectionchange",updateSelectionMenu);
  editor.on("change",()=>onChangeRef.current(editor.getMarkdown()));
  instance.current=editor;
  return()=>{document.removeEventListener("selectionchange",updateSelectionMenu);editor.destroy();instance.current=null};
 },[hasOpened]);
 useEffect(()=>{const editor=instance.current;if(editor&&editor.getMarkdown()!==value)editor.setMarkdown(value||" ",false)},[value]);

 const knowledgeTemplates=templates.filter(item=>item.source==="knowledge").sort((a,b)=>knowledgeSort==="used"?(b.usage_count??0)-(a.usage_count??0)||String(b.updated_at??"").localeCompare(String(a.updated_at??"")):String(b.updated_at??"").localeCompare(String(a.updated_at??""))).slice(0,6);
 function loadTemplate(id:string){onTemplateChange(id);const template=templates.find(item=>item.id===id);if(template)onChange(template.content_markdown)}
 function formatSelection(command:"bold"|"italic"|"underline"|"color"){if(command==="color")host.current?.querySelector<HTMLElement>(".toastui-editor-toolbar-icons.color")?.click();else instance.current?.exec(command);setSelectionMenu(current=>({...current,visible:false}));instance.current?.focus()}
 return <section className={`preliminary-notes${expanded?" is-expanded":""}`} aria-labelledby="preliminary-notes-title">
  <div className="preliminary-notes-toggle"><div><strong id="preliminary-notes-title">Project Preliminary Notes</strong><small>Optional</small></div><button type="button" aria-expanded={expanded} aria-controls="project-preliminary-notes-content" onClick={()=>{if(!expanded)setHasOpened(true);setExpanded(current=>!current)}}>{expanded?"Hide notes":"+ Add notes"}</button></div>
  {hasOpened&&<div id="project-preliminary-notes-content" className="preliminary-notes-content" hidden={!expanded}><div className="preliminary-notes-head"><small>Capture the project context, objectives, and initial requirements.</small><select aria-label="Load preliminary notes" value={templateID} onChange={event=>loadTemplate(event.target.value)}><option value="">Load from database</option>{templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></div><div className="preliminary-knowledge-browser"><header><div><strong>Knowledge Management notes</strong><small>Load a recent or frequently used preliminary note.</small></div><div><button type="button" className={knowledgeSort==="recent"?"active":""} onClick={()=>setKnowledgeSort("recent")}>Recent</button><button type="button" className={knowledgeSort==="used"?"active":""} onClick={()=>setKnowledgeSort("used")}>Most used</button></div></header><div>{knowledgeTemplates.map(item=><button type="button" className={templateID===item.id?"selected":""} onClick={()=>loadTemplate(item.id)} key={item.id}><span><strong>{item.name}</strong><small>{item.updated_at?`Updated ${new Date(item.updated_at).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}`:"Knowledge note"}</small></span><em>{item.usage_count??0} uses</em></button>)}{!knowledgeTemplates.length&&<p>No Project Preliminary Notes are available in Knowledge Management yet.</p>}</div></div><div ref={host} className="toast-editor-host" aria-label="Project preliminary notes editor"/>{selectionMenu.visible&&<div className="selection-format-menu" role="toolbar" aria-label="Text formatting" style={{left:selectionMenu.left,top:selectionMenu.top}} onMouseDown={event=>event.preventDefault()}><button type="button" aria-label="Bold selection" onClick={()=>formatSelection("bold")}><b>B</b></button><button type="button" aria-label="Italic selection" onClick={()=>formatSelection("italic")}><i>I</i></button><button type="button" aria-label="Underline selection" onClick={()=>formatSelection("underline")}><u>U</u></button><button type="button" aria-label="Color selection" onClick={()=>formatSelection("color")}>A</button></div>}</div>}
 </section>;
}
