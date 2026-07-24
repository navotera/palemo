import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./advanced.css";

type Envelope<T>={data:T};
async function request<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(path,{credentials:"include",...init});const body=await response.json() as Envelope<T>;if(!response.ok)throw new Error("Request failed");return body.data}
const key=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
type AssistantAnswer={answer:string;evidence:{label:string;value:unknown;source:string}[]};
type SOP={id:string;name:string;version:number};type Rule={id:string;name:string;event_type:string;is_active:boolean};type Template={id:string;name:string};type Usage={name:string;requests:number;errors:number}[];

export function AdvancedPanel(){
 const qc=useQueryClient();const [question,setQuestion]=useState("What is the current project overview?");
 const sops=useQuery({queryKey:["sops"],queryFn:()=>request<SOP[]>("/api/v1/sops")});
 const rules=useQuery({queryKey:["automation-rules"],queryFn:()=>request<Rule[]>("/api/v1/automations/rules")});
 const templates=useQuery({queryKey:["templates"],queryFn:()=>request<Template[]>("/api/v1/templates")});
 const usage=useQuery({queryKey:["api-usage"],queryFn:()=>request<Usage>("/api/v1/api-clients/usage")});
 const ask=useMutation({mutationFn:()=>request<AssistantAnswer>("/api/v1/assistant/query",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key("assistant")},body:JSON.stringify({question})})});
 const createSOP=useMutation({mutationFn:()=>request<SOP>("/api/v1/sops",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key("sop")},body:JSON.stringify({name:"Release readiness",description:"Reusable release verification",items:["Tests pass","Review approved","Deployment verified"]})}),onSuccess:()=>qc.invalidateQueries({queryKey:["sops"]})});
 function submit(e:FormEvent){e.preventDefault();if(question.trim())ask.mutate()}
 return <article className="panel advanced-panel">
  <div className="panel-head"><div><span className="eyebrow">Advanced operations</span><h1>Assistant, SOPs & automation</h1></div><span className="live-badge">Tenant scoped</span></div>
  <div className="advanced-grid">
   <section><h3>Grounded assistant</h3><form onSubmit={submit}><input aria-label="Assistant question" value={question} onChange={e=>setQuestion(e.target.value)}/><button className="primary-button" disabled={ask.isPending}>{ask.isPending?"Checking…":"Ask"}</button></form>{ask.data&&<div className="assistant-answer"><strong>{ask.data.answer}</strong><ul>{ask.data.evidence.map(e=><li key={e.label}>{e.label}: {String(e.value)} <small>{e.source}</small></li>)}</ul></div>}</section>
   <section><h3>SOP repository</h3><strong>{sops.data?.length??0} versioned SOPs</strong><p>Apply an SOP from the task workflow to create a provenance-preserving checklist snapshot.</p><button onClick={()=>createSOP.mutate()} disabled={createSOP.isPending}>Create release SOP</button></section>
   <section><h3>Automation rules</h3><strong>{rules.data?.filter(r=>r.is_active).length??0} active / {rules.data?.length??0} total</strong><p>{rules.data?.[0]?.name??"Rules react to audited tenant events without recursive loops."}</p></section>
   <section><h3>Template marketplace</h3><strong>{templates.data?.length??0} reusable templates</strong><p>Capture projects as task/checklist structures and publish division-ready versions.</p></section>
   <section><h3>API usage</h3><strong>{usage.data?.reduce((n,x)=>n+x.requests,0)??0} metered requests</strong><p>{usage.data?.reduce((n,x)=>n+x.errors,0)??0} client errors recorded.</p></section>
  </div>
 </article>
}

