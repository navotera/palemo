import { useMemo, useState } from "react";
import "./division-performance.css";

export type ActiveProject={id:string;display_number?:number;name:string;status:string;open_tasks:number;overdue_tasks:number};
export type DivisionPerformanceData={id:string;name:string;active:number;closed:number;lagged:number;kpi_achievement:number;average_finish_days:number;active_projects:ActiveProject[];teams:{id:string;name:string}[]};

export function DivisionKPI({divisions}:{divisions:DivisionPerformanceData[]}){
 const ranked=[...divisions].sort((a,b)=>b.kpi_achievement-a.kpi_achievement);const average=divisions.length?Math.round(divisions.reduce((n,d)=>n+d.kpi_achievement,0)/divisions.length):0;
 return <article className="metric-card division-kpi-card"><span>KPI achievement by division</span><strong>{average}<i>%</i></strong><div className="kpi-spark" aria-label="Division KPI achievement chart">{ranked.slice(0,6).map(d=><div key={d.id} title={`${d.name}: ${d.kpi_achievement}%`}><span style={{height:`${Math.max(6,d.kpi_achievement)}%`}}/><small>{d.name.slice(0,3).toUpperCase()}</small></div>)}</div></article>
}

export function DivisionProjectLoad({divisions}:{divisions:DivisionPerformanceData[]}){
 const ranked=useMemo(()=>[...divisions].sort((a,b)=>(b.active+b.lagged)-(a.active+a.lagged)),[divisions]);const visible=ranked.slice(0,4);const [selected,setSelected]=useState<string>(ranked[0]?.id??"");const division=ranked.find(d=>d.id===selected)??ranked[0];
 if(!division)return <article className="panel division-load"><div className="empty-state">No division data yet.</div></article>;
 const total=Math.max(1,division.active+division.closed+division.lagged);
 return <article className="panel division-load">
  <div className="panel-head"><div><span className="eyebrow">Division workload</span><h1>Project loading & delivery</h1></div><div className="division-picker">{ranked.length>4&&<select aria-label="Select another division" value={selected} onChange={e=>setSelected(e.target.value)}>{ranked.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}</div></div>
  <div className="division-tabs" role="tablist" aria-label="Most active divisions">{visible.map(d=><button role="tab" aria-selected={d.id===division.id} className={d.id===division.id?"active":""} key={d.id} onClick={()=>setSelected(d.id)}><span>{d.name}</span><strong>{d.active+d.lagged}</strong><small>active projects</small></button>)}</div>
  <div className="load-layout">
   <section className="load-chart"><div className="load-track" aria-label={`${division.name} project status chart`}><span className="active" style={{width:`${division.active/total*100}%`}}/><span className="closed" style={{width:`${division.closed/total*100}%`}}/><span className="lagged" style={{width:`${division.lagged/total*100}%`}}/></div><div className="status-counts"><div><i className="active"/><strong>{division.active}</strong><span>Active</span></div><div><i className="closed"/><strong>{division.closed}</strong><span>Closed</span></div><div><i className="lagged"/><strong>{division.lagged}</strong><span>Lagged</span></div></div></section>
   <section className="finish-stat"><span>This year</span><strong>{division.average_finish_days.toFixed(1)}<small> days</small></strong><p>Average project finish time for {division.name}</p></section>
  </div>
  <div className="active-projects"><div className="active-projects-head"><h3>Active projects</h3><span>{division.active_projects.length} projects</span></div><div className="project-tabs">{division.active_projects.map(p=><article key={p.id} className={p.overdue_tasks>0?"is-lagged":""}><div><strong>{p.display_number!=null?`#${String(p.display_number).padStart(2,"0")} `:""}{p.name}</strong><span>{p.status.replace("_"," ")}</span></div><b>{p.open_tasks}<small> open tasks</small></b>{p.overdue_tasks>0&&<em>{p.overdue_tasks} overdue</em>}</article>)}{division.active_projects.length===0&&<div className="empty-state">No active projects in this division.</div>}</div></div>
 </article>
}

