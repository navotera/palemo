import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./supervision.css";

type Review={id:string;entity_type:string;entity_id:string;status:string;notes:string|null;created_at:string};
type Productivity={from:string;to:string;rows:Array<{user_id:string;name:string;completed_tasks:number;open_tasks:number;duration_seconds:number}>;totals:{completed_tasks:number;open_tasks:number;duration_seconds:number}};
type Export={download_url:string;status:string};type Envelope<T>={data:T;errors:null|Array<{message:string}>};
async function api<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(path,{credentials:"include",...init});const body=await response.json() as Envelope<T>;if(!response.ok)throw new Error(body.errors?.[0]?.message??"Request failed");return body.data}

export function SupervisionPanel(){
 const client=useQueryClient();const reviews=useQuery({queryKey:["reviews"],queryFn:()=>api<Review[]>("/api/v1/reviews")});const report=useQuery({queryKey:["productivity"],queryFn:()=>api<Productivity>("/api/v1/reports/productivity")});
 const decide=useMutation({mutationFn:({id,status}:{id:string;status:string})=>api<Review>(`/api/v1/reviews/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})}),onSuccess:()=>client.invalidateQueries({queryKey:["reviews"]})});
 const exportPDF=useMutation({mutationFn:()=>api<Export>("/api/v1/reports/productivity?format=pdf"),onSuccess:value=>{window.location.assign(value.download_url)}});
 const pending=reviews.data?.filter(item=>item.status==="pending")??[];
 return <section className="supervision-panel"><header><div><span className="eyebrow">Supervision</span><h1>Review and productivity</h1></div><button onClick={()=>exportPDF.mutate()} disabled={exportPDF.isPending}>{exportPDF.isPending?"Preparing…":"Download PDF"}</button></header>
  <div className="supervision-metrics"><div><strong>{report.data?.totals.completed_tasks??0}</strong><span>Completed tasks</span></div><div><strong>{report.data?.totals.open_tasks??0}</strong><span>Open tasks</span></div><div><strong>{((report.data?.totals.duration_seconds??0)/3600).toFixed(1)}</strong><span>Tracked hours</span></div><div><strong>{pending.length}</strong><span>Pending reviews</span></div></div>
  <div className="review-list">{pending.map(item=><article key={item.id}><div><strong>{item.entity_type} review</strong><small>{item.entity_id.slice(0,8)} · {new Date(item.created_at).toLocaleDateString()}</small></div><div><button onClick={()=>decide.mutate({id:item.id,status:"approved"})}>Approve</button><button className="reject" onClick={()=>decide.mutate({id:item.id,status:"revision_requested"})}>Request revision</button></div></article>)}{!reviews.isPending&&pending.length===0&&<p>No reviews waiting for a decision.</p>}</div>
 </section>
}
