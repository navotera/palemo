import "./project-type-selector.css";

export type ProjectTypeOption={value:string;name:string;color:string;built_in:boolean};
const fallbackTypes:ProjectTypeOption[]=[{value:"operational",name:"Operational",color:"#3b9a68",built_in:true},{value:"technical",name:"Technical",color:"#4774b8",built_in:true},{value:"rnd",name:"R&D",color:"#7c5dba",built_in:true}];

export function ProjectTypeSelector({value,onChange,options=fallbackTypes}:{value:string;onChange:(value:string)=>void;options?:ProjectTypeOption[]}){
 return <fieldset className="project-type-fieldset"><legend>Project type</legend><div className="project-type-options">{options.map(option=>{const tone=option.built_in?option.value:"custom";return <label key={option.value} className={`project-type-option ${tone} ${value===option.value?"selected":""}`} style={{"--project-type-color":option.color} as React.CSSProperties}><input type="radio" name="project-type" value={option.value} checked={value===option.value} onChange={()=>onChange(option.value)}/><span><i aria-hidden="true"/>{option.name}</span></label>})}</div><small>Manage reusable project types from Settings.</small></fieldset>
}
