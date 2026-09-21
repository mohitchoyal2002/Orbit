// A bounded CSV reader for the explicit, previewed lead import. No spreadsheet formulas are evaluated.
export function parseCoachingCsv(text:string){
  if(text.length>64000)throw new Error("Use a CSV smaller than 64 KB and at most 50 students.");
  const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
  const source=text.replace(/^\uFEFF/,"");
  for(let i=0;i<=source.length;i++){
    const c=source[i];
    if(c==='"'){
      if(quoted&&source[i+1]==='"'){field+='"';i++;}else if(quoted||field==="")quoted=!quoted;else throw new Error("Unexpected quote in CSV.");
    }else if((c===","||c==="\n"||c===undefined)&&!quoted){
      row.push(field.replace(/\r$/,"").trim());field="";
      if(c!==","){if(row.some(Boolean))rows.push(row);row=[];}
    }else if(c!==undefined)field+=c;
  }
  if(quoted)throw new Error("Close the quoted CSV field.");
  if(rows.length<2||rows.length>51)throw new Error("Add a header and between 1 and 50 students.");
  const header=rows.shift()!.map(s=>s.toLowerCase());
  const allowed=["name","phone","email","course","centre","source","consent_at","consent_evidence"];
  if(new Set(header).size!==header.length||!header.includes("name")||!header.includes("phone")||header.some(h=>!allowed.includes(h)))throw new Error("Required columns: name,phone. Optional: email,course,centre,source,consent_at,consent_evidence.");
  return rows.map((values,i)=>{
    if(values.length!==header.length)throw new Error(`Row ${i+2}: column count does not match the header.`);
    const r=Object.fromEntries(header.map((h,j)=>[h,values[j]]));
    const consentAt=r.consent_at?Date.parse(r.consent_at):null;
    if(consentAt!==null&&(!Number.isFinite(consentAt)||!/(Z|[+-]\d{2}:\d{2})$/.test(r.consent_at)))throw new Error(`Row ${i+2}: use an ISO consent time with timezone, such as 2026-09-09T10:00:00+05:30.`);
    return {name:r.name,phone:r.phone,email:r.email||"",course:r.course||"undecided",centre:r.centre||"Bhawarkua",source:r.source||"CSV import",consentAt,consentEvidence:r.consent_evidence||""};
  });
}
