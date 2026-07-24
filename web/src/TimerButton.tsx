import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./timer.css";

type Entry={id:string;task_id:string;started_at:string;ended_at?:string;auto_closed:boolean};
type StartResult={entry:Entry;previous_stopped:boolean;warning?:string};
type Envelope<T>={data:T;errors:null|Array<{message:string}>};
async function api<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(path,{credentials:"include",...init});const body=await response.json() as Envelope<T>;if(!response.ok)throw new Error(body.errors?.[0]?.message??"Timer request failed");return body.data}

export function TimerButton({taskID}:{taskID:string}){
 const client=useQueryClient();
 const entries=useQuery({queryKey:["time-entries"],queryFn:()=>api<Entry[]>("/api/v1/time-entries")});
 const active=entries.data?.find(entry=>!entry.ended_at);
 const start=useMutation({mutationFn:()=>api<StartResult>("/api/v1/time-entries/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task_id:taskID})}),onSuccess:(result)=>{client.invalidateQueries({queryKey:["time-entries"]});if(result.warning)client.setQueryData(["timer-warning"],result.warning)}});
 const stop=useMutation({mutationFn:(id:string)=>api<Entry>("/api/v1/time-entries/stop",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({time_entry_id:id})}),onSuccess:()=>client.invalidateQueries({queryKey:["time-entries"]})});
 const isActive=active?.task_id===taskID;
 return <button className={isActive?"timer-button active":"timer-button"} onClick={()=>isActive&&active?stop.mutate(active.id):start.mutate()} disabled={start.isPending||stop.isPending}>{isActive?"Stop timer":"Start timer"}</button>
}

