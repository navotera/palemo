import { useMutation, useQueryClient } from "@tanstack/react-query";

type Envelope<T>={data:T;errors:null|Array<{message:string}>};
async function api<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(path,{credentials:"include",...init});const body=await response.json() as Envelope<T>;if(!response.ok)throw new Error(body.errors?.[0]?.message??"Request failed");return body.data}

export function TaskReview({taskID}:{taskID:string}){
 const queryClient=useQueryClient();
 const request=useMutation({mutationFn:()=>api("/api/v1/reviews",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({entity_type:"task",entity_id:taskID})}),onSuccess:()=>queryClient.invalidateQueries({queryKey:["reviews"]})});
 return <button type="button" className="request-review" onClick={()=>request.mutate()} disabled={request.isPending}>{request.isSuccess?"Review requested":request.isPending?"Requesting…":"Request review"}</button>
}
