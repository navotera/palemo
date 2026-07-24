import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {DivisionManagement,TeamManagement,type DirectoryUser,type OrgDivision} from "./SettingsPage";
import "./organization.css";

type Envelope<T>={data:T;errors:null|Array<{message:string}>};
async function api<T>(path:string):Promise<T>{const response=await fetch(path,{credentials:"include"});const body=await response.json() as Envelope<T>;if(!response.ok)throw new Error(body.errors?.[0]?.message??"Request failed");return body.data}

export function OrganizationPage(){
 const cache=useQueryClient();
 const[tab,setTab]=useState<"divisions"|"teams">("divisions");
 const divisions=useQuery({queryKey:["divisions"],queryFn:()=>api<OrgDivision[]>("/api/v1/divisions")});
 const users=useQuery({queryKey:["users"],queryFn:()=>api<DirectoryUser[]>("/api/v1/users")});
 const saved=()=>{cache.invalidateQueries({queryKey:["divisions"]});cache.invalidateQueries({queryKey:["users"]});cache.invalidateQueries({queryKey:["dashboard-summary"]})};
 return <section className="organization-page"><header className="organization-head"><div><span className="eyebrow">Company structure</span><h1>Organization</h1><p>Manage divisions, teams, membership, and organizational responsibility.</p></div></header><nav className="organization-submenu" aria-label="Organization sections"><button type="button" className={tab==="divisions"?"active":""} onClick={()=>setTab("divisions")}><span>Divisions</span><small>Structure and responsibility</small></button><button type="button" className={tab==="teams"?"active":""} onClick={()=>setTab("teams")}><span>Teams</span><small>Members of each team</small></button></nav><div className="organization-content">{tab==="divisions"?<DivisionManagement divisions={divisions.data??[]} users={users.data??[]} onSaved={saved}/>:<TeamManagement divisions={divisions.data??[]} users={users.data??[]} onSaved={saved}/>}</div></section>
}