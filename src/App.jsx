import { useState, useRef, useEffect, useCallback } from 'react';
import {
  fetchTickets, createTicket as apiCreateTicket, updateTicket as apiUpdateTicket, deleteTicket as apiDeleteTicket,
  fetchNotes, addNote as apiAddNote, fetchInternalNotes, addInternalNote as apiAddInternalNote,
  fetchHealth, fetchAgentPayloads,
  loadConfig, saveConfig, toBackend,
  apiLogin, apiChangePassword,
  fetchRequesters, createRequester, updateRequester, deleteRequester,
  fetchEmailConfig, saveEmailConfig, testEmailConnection,
  fetchEmailTemplates, updateEmailTemplate, fetchEmailLog,
} from './api.js';
import { isLoggedIn, saveAuth, clearAuth, getUser, logout } from './auth.js';

const MODEL = "claude-sonnet-4-20250514";

async function callAI(msgs, sys) {
  const token = localStorage.getItem("itsm_token") || "";
  const r = await fetch("https://itsmbackend.vercel.app/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: sys || "", messages: msgs })
  });
  const d = await r.json();
  return (d.data && d.data.text) || "";
}

// ── Colours ─────────────────────────────────────────────────
const C = {
  navy: "#0D1B2A", navyMid: "#152236", navyBorder: "#1E2F45",
  orange: "#F4801A", og2: "#E06C0A",
  bg: "#F7F8FA", card: "#FFFFFF", border: "#E4E7EC",
  t1: "#0D1B2A", t2: "#5A6A7A", t3: "#8A99A8",
  red: "#DC2626", redBg: "#FEF2F2", redT: "#991B1B",
  yel: "#D97706", yelBg: "#FFFBEB", yelT: "#92400E",
  blu: "#1D6FAF", bluBg: "#EFF6FF", bluT: "#1E3A5F",
  grn: "#16A34A", grnBg: "#F0FDF4", grnT: "#14532D",
  neu: "#F1F5F9", amberBg: "#FFF7ED", amber: "#92400E"
};

// ── Static data ──────────────────────────────────────────────
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const CATS = ["Hardware","Software","Network","Access / Permissions","Email","Other"];

const PRIO0 = [
  { id:"p1", label:"P1 - Critical", color:"#DC2626", responseMin:30,  resolveMin:240  },
  { id:"p2", label:"P2 - High",     color:"#D97706", responseMin:60,  resolveMin:480  },
  { id:"p3", label:"P3 - Medium",   color:"#1D6FAF", responseMin:120, resolveMin:1440 },
  { id:"p4", label:"P4 - Low",      color:"#16A34A", responseMin:240, resolveMin:2880 },
];
const STATUS0 = [
  { id:"s1", label:"Open",                    color:"#DC2626", bg:"#FEF2F2" },
  { id:"s2", label:"In Progress",             color:"#1D6FAF", bg:"#EFF6FF" },
  { id:"s3", label:"Pending User Feedback",   color:"#D97706", bg:"#FFFBEB" },
  { id:"s4", label:"User Feedback Received",  color:"#7C3AED", bg:"#F5F3FF" },
  { id:"s5", label:"Reopened",                color:"#F4801A", bg:"#FFF7ED" },
  { id:"s6", label:"Resolved",                color:"#16A34A", bg:"#F0FDF4" },
  { id:"s7", label:"Closed",                  color:"#8A99A8", bg:"#F1F5F9" },
];
const ROLES0 = [
  { id:"r1", name:"Service Desk Agent",    level:"L1",    cats:["Software","Email"] },
  { id:"r2", name:"Desktop Support L1",    level:"L1",    cats:["Hardware","Software","Email"] },
  { id:"r3", name:"Desktop Support L2",    level:"L2",    cats:["Hardware","Software","Email","Access / Permissions"] },
  { id:"r4", name:"Network Engineer",      level:"L2",    cats:["Network","Access / Permissions"] },
  { id:"r5", name:"Systems Administrator", level:"L2",    cats:["Hardware","Software","Network","Access / Permissions","Email"] },
  { id:"r6", name:"Security Analyst",      level:"L2",    cats:["Network","Access / Permissions","Software"] },
  { id:"r7", name:"IT Manager",            level:"Admin", cats:["Hardware","Software","Network","Access / Permissions","Email","Other"] },
];
const TECHS0 = [
  { id:"t1", name:"Alice Naidoo",   roleId:"r2", email:"alice@ignitiongroup.co.za",  catsOverride:null, maxTix:5, autoAssign:true },
  { id:"t2", name:"Brian Mokoena", roleId:"r4", email:"brian@ignitiongroup.co.za",  catsOverride:null, maxTix:5, autoAssign:true },
  { id:"t3", name:"Carol Singh",   roleId:"r7", email:"carol@ignitiongroup.co.za",  catsOverride:null, maxTix:5, autoAssign:true },
  { id:"t4", name:"Dev Pillay",    roleId:"r2", email:"dev@ignitiongroup.co.za",    catsOverride:["Hardware"], maxTix:5, autoAssign:true },
];
const BH0 = [
  { id:"bh1", name:"Standard", start:"08:00", end:"17:30", days:["Mon","Tue","Wed","Thu","Fri"] },
  { id:"bh2", name:"Extended", start:"07:00", end:"20:00", days:["Mon","Tue","Wed","Thu","Fri","Sat"] },
  { id:"bh3", name:"24/7",     start:"00:00", end:"23:59", days:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] },
];
const CLS0 = [
  { id:"c1", name:"Password Reset / Account Lockout", group:"Incident", cat:"Access / Permissions", responseMin:60,  resolveMin:240  },
  { id:"c2", name:"Network / Connectivity Issue",     group:"Incident", cat:"Network",              responseMin:30,  resolveMin:120  },
  { id:"c3", name:"Application Error / Crash",        group:"Incident", cat:"Software",             responseMin:60,  resolveMin:240  },
  { id:"c4", name:"Hardware Failure",                 group:"Incident", cat:"Hardware",             responseMin:30,  resolveMin:480  },
  { id:"c5", name:"Email Issue",                      group:"Incident", cat:"Email",                responseMin:60,  resolveMin:240  },
  { id:"c6", name:"New Equipment Request",            group:"Request",  cat:"Hardware",             responseMin:240, resolveMin:2880 },
  { id:"c7", name:"Software Installation",            group:"Request",  cat:"Software",             responseMin:240, resolveMin:1440 },
  { id:"c8", name:"Access / Permissions Request",     group:"Request",  cat:"Access / Permissions", responseMin:120, resolveMin:480  },
];

const now0 = Date.now();
const TIX0 = [
  { id:"TKT-1001", title:"Outlook not syncing emails",        cat:"Email",                    pri:"P2 - High",    st:"Open",        user:"John Smith",    mac:"PC-JSmith-001",   ip:"192.168.1.42", asgn:"Alice Naidoo",  cls:"Email Issue",                    grp:"Incident", created:new Date(now0-7200000).toISOString(),   logs:"", notes:[], internalNotes:[] },
  { id:"TKT-1002", title:"Cannot access shared drive Z:",     cat:"Network",                  pri:"P3 - Medium",  st:"In Progress", user:"Mary Dlamini",  mac:"PC-MDlamini-003", ip:"192.168.1.55", asgn:"Brian Mokoena", cls:"Network / Connectivity Issue",   grp:"Incident", created:new Date(now0-18000000).toISOString(),  logs:"", notes:[], internalNotes:[] },
  { id:"TKT-1003", title:"BSOD - KERNEL_DATA_INPAGE_ERROR",   cat:"Hardware",                 pri:"P1 - Critical",st:"Open",        user:"Sipho Khumalo", mac:"PC-SKhumalo-007", ip:"192.168.1.88", asgn:"Carol Singh",   cls:"Hardware Failure",               grp:"Incident", created:new Date(now0-3600000).toISOString(),   logs:"Event ID 41\nEvent ID 1001", notes:[], internalNotes:[] },
  { id:"TKT-1004", title:"Request new laptop - Dell XPS 15",  cat:"Hardware",                 pri:"P4 - Low",     st:"Pending User Feedback",     user:"Thabo Moyo",    mac:"N/A",             ip:"N/A",          asgn:"Dev Pillay",    cls:"New Equipment Request",          grp:"Request",  created:new Date(now0-86400000).toISOString(),  logs:"", notes:[], internalNotes:[] },
  { id:"TKT-1005", title:"Account locked out",                cat:"Access / Permissions",     pri:"P2 - High",    st:"Resolved",    user:"Priya Nair",    mac:"PC-PNair-002",    ip:"192.168.1.70", asgn:"Alice Naidoo",  cls:"Password Reset / Account Lockout",grp:"Incident", created:new Date(now0-172800000).toISOString(), logs:"", notes:[], internalNotes:[] },
  { id:"TKT-1006", title:"Install Adobe Acrobat Pro",         cat:"Software",                 pri:"P3 - Medium",  st:"Open",        user:"Lee Wessels",   mac:"PC-LWessels-005", ip:"192.168.1.90", asgn:"",              cls:"Software Installation",          grp:"Request",  created:new Date(now0-10800000).toISOString(),  logs:"", notes:[], internalNotes:[] },
  { id:"TKT-1007", title:"VPN keeps dropping connection",     cat:"Network",                  pri:"P2 - High",    st:"Open",        user:"Nomsa Dube",    mac:"PC-NDube-008",    ip:"192.168.1.22", asgn:"",              cls:"Network / Connectivity Issue",   grp:"Incident", created:new Date(now0-5400000).toISOString(),   logs:"", notes:[], internalNotes:[] },
];
const CHATS0 = [
  { id:"ch1", user:"John Smith",    st:"ai",    tkId:"TKT-1001", msgs:[{f:"user",t:"Outlook stopped syncing about an hour ago"},{f:"ai",t:"Hi John! Are you getting any error messages?"},{f:"user",t:"Just says Disconnected in the status bar"}] },
  { id:"ch2", user:"Sipho Khumalo", st:"queue", tkId:"TKT-1003", msgs:[{f:"user",t:"PC keeps crashing with a blue screen"},{f:"ai",t:"Flagged as high priority. What were you doing when it crashed?"},{f:"user",t:"Just opening Chrome, happens randomly"}] },
];
const KB0 = [
  { id:"kb1", title:"How to reset a Windows password", summary:"Reset user passwords via Active Directory.", steps:["Open Active Directory Users & Computers","Locate the user account","Right-click and select Reset Password","Set a temporary password and force change on next login"], tags:["password","AD"], cls:"Password Reset / Account Lockout", author:"Carol Singh", excluded:false, created:"2024-01-10" },
  { id:"kb2", title:"Troubleshooting Outlook disconnected", summary:"Diagnose and resolve Outlook connectivity issues.", steps:["Check internet connectivity","Verify Exchange status in M365 Admin","Repair Office via Control Panel","Re-add Exchange account"], tags:["outlook","email"], cls:"Email Issue", author:"Alice Naidoo", excluded:false, created:"2024-02-14" },
];
const MONS0 = [
  { id:"m1", name:"Company Website", type:"http", target:"https://www.ignitiongroup.co.za", st:"unknown", ms:null, checked:null },
  { id:"m2", name:"M365 Portal",     type:"http", target:"https://portal.office.com",       st:"unknown", ms:null, checked:null },
];
const SVCS = [
  { name:"Microsoft 365",      st:"healthy", up:"99.8%", ago:"2m ago" },
  { name:"Active Directory",   st:"healthy", up:"100%",  ago:"1m ago" },
  { name:"Email Gateway",      st:"warning", up:"97.2%", ago:"3m ago", msg:"High queue depth" },
  { name:"VPN / Remote",       st:"healthy", up:"99.1%", ago:"2m ago" },
  { name:"DNS Servers",        st:"healthy", up:"100%",  ago:"1m ago" },
  { name:"DHCP",               st:"error",   up:"94.5%", ago:"5m ago", msg:"Pool exhaustion VLAN 20" },
  { name:"File Share / NAS",   st:"healthy", up:"99.9%", ago:"2m ago" },
  { name:"Backup Service",     st:"warning", up:"96.0%", ago:"10m ago",msg:"Last backup job failed" },
  { name:"Endpoint Protection",st:"healthy", up:"99.5%", ago:"4m ago" },
  { name:"Network Switches",   st:"healthy", up:"100%",  ago:"1m ago" },
];
const ERRS = [
  { id:"e1", sev:"critical", msg:"DHCP pool exhaustion \u2014 VLAN 20. Available leases: 3/254", ts:"08:42" },
  { id:"e2", sev:"warning",  msg:"Email gateway queue depth: 1,240 messages", ts:"09:15" },
  { id:"e3", sev:"warning",  msg:"Backup job FS-DAILY-001 failed. Retry 2/3 at 10:00", ts:"09:30" },
  { id:"e4", sev:"info",     msg:"Windows Defender definitions out of date on 7 endpoints", ts:"07:55" },
  { id:"e5", sev:"info",     msg:"SSL cert for vpn.ignitiongroup.co.za expires in 18 days", ts:"06:00" },
];
const SCRIPTS = [
  { id:1, name:"Flush DNS",       cmd:"ipconfig /flushdns",                               desc:"Clears DNS resolver cache" },
  { id:2, name:"Restart Spooler", cmd:"net stop spooler && net start spooler",             desc:"Restarts print spooler" },
  { id:3, name:"Disk Cleanup",    cmd:"cleanmgr /sagerun:1",                              desc:"Runs automated disk cleanup" },
  { id:4, name:"Clear Temp",      cmd:"del /q /f /s %TEMP%\\*",                           desc:"Removes temporary files" },
  { id:5, name:"Restart Adapter", cmd:"netsh interface set interface 'Ethernet' disable", desc:"Resets network adapter" },
  { id:6, name:"Windows Update",  cmd:"wuauclt /detectnow",                               desc:"Forces Windows Update check" },
];
const WEEK = [{l:"Mon",v:8},{l:"Tue",v:12},{l:"Wed",v:6},{l:"Thu",v:15},{l:"Fri",v:9},{l:"Sat",v:2},{l:"Sun",v:1}];
const NAV = [
  {id:"dashboard",label:"Dashboard"},{id:"tickets",label:"Tickets"},{id:"create",label:"New Ticket"},
  {id:"teams",label:"Teams Chat"},{id:"reports",label:"Reports"},{id:"health",label:"System Health"},
  {id:"logs",label:"Log Analyser"},{id:"scripts",label:"Self-Heal"},{id:"kb",label:"Knowledge Base"},
  {id:"users",label:"Users"},{id:"settings",label:"Settings"},
];
let tkCounter = 1007;

// ── Pure helpers ─────────────────────────────────────────────
const fmtMin = m => { if (!m) return "\u2014"; const h = Math.floor(m/60), mn = m%60; return h > 0 ? (mn > 0 ? h+"h "+mn+"m" : h+"h") : mn+"m"; };
const elMin  = d => Math.floor((Date.now() - new Date(d).getTime()) / 60000);
const scCol  = s => s==="healthy" ? C.grn : s==="warning" ? C.yel : s==="error" ? C.red : C.t3;
const sevBg  = s => s==="critical" ? C.redBg : s==="warning" ? C.yelBg : C.bluBg;
const sevFg  = s => s==="critical" ? C.redT  : s==="warning" ? C.yelT  : C.bluT;
const lvlBg  = l => l==="Admin" ? C.yelBg : l==="L2" ? C.bluBg : C.neu;
const lvlFg  = l => l==="Admin" ? C.yelT  : l==="L2" ? C.bluT  : C.t2;

const getSlaInfo = (tk, clsList, prioList) => {
  const p = prioList.find(x => x.label === tk.pri);
  const c = clsList.find(x => x.name  === tk.cls);
  const responseMin = p ? p.responseMin : (c ? c.responseMin : null);
  const resolveMin  = p ? p.resolveMin  : (c ? c.resolveMin  : null);
  const source = p ? "priority" : "classification";
  if (!resolveMin) return null;

  const pausedMin = tk.total_paused_minutes || 0;
  const st = tk.st || tk.status || "";
  const isPaused = st === "Pending User Feedback";

  // Resolved/Closed: measure Open → resolved_at minus paused time
  if (tk.resolved_at && ["Resolved","Closed"].includes(st)) {
    const totalMin = Math.floor((new Date(tk.resolved_at).getTime() - new Date(tk.created || tk.created_at).getTime()) / 60000);
    const activeMin = Math.max(0, totalMin - pausedMin);
    return { pct:100, label:"Resolved", color:C.grn, responseMin, resolveMin, source, activeMin, pausedMin, isPaused:false, resolvedAt:tk.resolved_at };
  }

  // Active ticket: elapsed minus paused time
  const totalElapsed = elMin(tk.created || tk.created_at);
  let currentPauseMin = 0;
  if (isPaused && tk.paused_at) {
    currentPauseMin = Math.floor((Date.now() - new Date(tk.paused_at).getTime()) / 60000);
  }
  const activeMin = Math.max(0, totalElapsed - pausedMin - currentPauseMin);
  const pct = Math.min(100, Math.round(activeMin / resolveMin * 100));
  const remainMin = Math.max(0, resolveMin - activeMin);

  if (isPaused) return { pct, label:"SLA Paused", color:C.yel, responseMin, resolveMin, source, activeMin, pausedMin:pausedMin+currentPauseMin, isPaused:true, remainMin };
  if (activeMin >= resolveMin) return { pct:100, label:"Breached", color:C.red, responseMin, resolveMin, source, activeMin, pausedMin, isPaused:false, remainMin:0 };
  if (pct >= 75) return { pct, label:"At risk", color:C.yel, responseMin, resolveMin, source, activeMin, pausedMin, isPaused:false, remainMin };
  return { pct, label:"On track", color:C.grn, responseMin, resolveMin, source, activeMin, pausedMin, isPaused:false, remainMin };
};

// ── Tiny components ──────────────────────────────────────────
function Bdg({ label, bg, fg, xstyle }) {
  return <span style={{ background:bg, color:fg, fontSize:11, fontWeight:600, padding:"2px 9px", borderRadius:20, whiteSpace:"nowrap", ...(xstyle||{}) }}>{label}</span>;
}
function Crd({ children, xstyle }) {
  return <div style={{ background:C.card, border:"1px solid "+C.border, borderRadius:12, padding:"1rem 1.25rem", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", ...(xstyle||{}) }}>{children}</div>;
}
function Met({ label, value, color, sub }) {
  return (
    <div style={{ background:C.card, border:"1px solid "+C.border, borderRadius:12, padding:"1rem 1.25rem", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize:11, color:C.t2, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color:color||C.t1, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:C.t3, marginTop:4 }}>{sub}</div>}
    </div>
  );
}
function Lbl({ text }) { return <label style={{ fontSize:12, fontWeight:500, color:C.t2, display:"block", marginBottom:5 }}>{text}</label>; }
function Bar({ pct, color }) {
  return <div style={{ height:6, background:C.neu, borderRadius:3, overflow:"hidden" }}><div style={{ width:pct+"%", height:"100%", background:color, borderRadius:3 }} /></div>;
}
function MBar({ data, color, height }) {
  const h = height||60, c = color||C.orange, mx = Math.max(...data.map(d=>d.v), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:h }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
          <div style={{ width:"100%", background:c, borderRadius:"3px 3px 0 0", height:Math.max(4,Math.round(d.v/mx*(h-14)))+"px", opacity:.85 }} />
          <div style={{ fontSize:10, color:C.t3 }}>{d.l}</div>
        </div>
      ))}
    </div>
  );
}
function HexLogo({ size }) {
  const s = size || 28;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <polygon points="20,2 35,11 35,29 20,38 5,29 5,11" fill={C.orange} opacity=".95" />
      <polygon points="20,8 30,14 30,26 20,32 10,26 10,14" fill={C.navy} opacity=".5" />
      <path d="M17 15l-3 5 3 5h6l3-5-3-5h-6z" fill="#fff" opacity=".9" />
    </svg>
  );
}
function NavIcon({ id }) {
  if (id==="tickets")   return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="2" rx="1" fill="currentColor"/><rect x="2" y="8" width="10" height="2" rx="1" fill="currentColor"/><rect x="2" y="13" width="7" height="2" rx="1" fill="currentColor"/></svg>;
  if (id==="create")    return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M9 6v6M6 9h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  if (id==="teams")     return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4h12a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 2V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  if (id==="reports")   return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 14V8l3-3 3 3 3-4 3 4v6H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  if (id==="health")    return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9h3l2-4 3 8 2-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (id==="logs")      return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 6h8M5 9h5M5 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  if (id==="scripts")   return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l1.5 3.5L14 6.5l-2.5 2.5.5 3.5L9 11l-3 1.5.5-3.5L4 6.5l3.5-.5L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  if (id==="kb")        return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 2h10a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  if (id==="settings")  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="10" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="2" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="10" y="10" width="6" height="6" rx="1.5" fill="currentColor"/></svg>;
}
function DayPicker({ days, onChange }) {
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {DAYS.map(d => {
        const on = days.includes(d);
        return (
          <label key={d} style={{ display:"flex", alignItems:"center", gap:4, fontSize:13, cursor:"pointer" }}>
            <input type="checkbox" checked={on} onChange={() => onChange(on ? days.filter(x=>x!==d) : [...days,d])} />
            {d}
          </label>
        );
      })}
    </div>
  );
}
function CatPicker({ selected, onChange }) {
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {CATS.map(c => {
        const on = (selected||[]).includes(c);
        return (
          <label key={c} style={{ display:"flex", alignItems:"center", gap:4, fontSize:13, cursor:"pointer", padding:"4px 10px", border:"1px solid "+(on?C.orange:C.border), borderRadius:8, background:on?"#F4801A22":"transparent" }}>
            <input type="checkbox" style={{ display:"none" }} checked={on} onChange={() => onChange(on ? (selected||[]).filter(x=>x!==c) : [...(selected||[]),c])} />
            {c}
          </label>
        );
      })}
    </div>
  );
}
function MinSelect({ label, value, onChange }) {
  const opts = [];
  for (let i = 0; i <= 2880; i += 30) opts.push(i);
  return (
    <div>
      <Lbl text={label} />
      <select value={value} onChange={e => onChange(+e.target.value)}>
        {opts.map(o => <option key={o} value={o}>{fmtMin(o) || "0m"}</option>)}
      </select>
    </div>
  );
}

// ── Loading spinner ──────────────────────────────────────────
function Spinner({ size, color }) {
  const s = size || 24;
  return (
    <div style={{ display:"inline-block", width:s, height:s, border:`3px solid ${C.border}`, borderTopColor:color||C.orange, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
  );
}

// ── Login Screen ────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await apiLogin(email.trim(), password);
      if (res.error) { setError(res.error); setBusy(false); return; }
      saveAuth(res.data.token, res.data.user);
      onLogin(res.data.user);
    } catch (err) {
      setError("Connection error. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg, ${C.navy} 0%, #1a2a3f 100%)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',system-ui,sans-serif" }}>
      <div style={{ width:400, maxWidth:"90vw" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <HexLogo size={56} />
          <div style={{ fontSize:22, fontWeight:700, color:"#fff", marginTop:12 }}>Ignition ITSM</div>
          <div style={{ fontSize:13, color:C.t3, marginTop:4 }}>IT Service Management Console</div>
        </div>
        <form onSubmit={handleSubmit} style={{ background:C.card, borderRadius:16, padding:"32px 28px", boxShadow:"0 8px 32px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize:18, fontWeight:600, color:C.t1, marginBottom:4 }}>Sign In</div>
          <div style={{ fontSize:13, color:C.t2, marginBottom:24 }}>Enter your credentials to access the console</div>
          {error && <div style={{ background:C.redBg, color:C.redT, padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:16, fontWeight:500 }}>{error}</div>}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:500, color:C.t2, display:"block", marginBottom:6 }}>Email address</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@ignitiongroup.co.za" required autoFocus
              style={{ width:"100%", padding:"10px 12px", border:"1px solid "+C.border, borderRadius:8, fontSize:14, outline:"none", boxSizing:"border-box" }} />
          </div>
          <div style={{ marginBottom:24 }}>
            <label style={{ fontSize:12, fontWeight:500, color:C.t2, display:"block", marginBottom:6 }}>Password</label>
            <div style={{ position:"relative" }}>
              <input type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" required
                style={{ width:"100%", padding:"10px 40px 10px 12px", border:"1px solid "+C.border, borderRadius:8, fontSize:14, outline:"none", boxSizing:"border-box" }} />
              <span onClick={()=>setShowPw(!showPw)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", cursor:"pointer", fontSize:12, color:C.t3, userSelect:"none" }}>{showPw?"Hide":"Show"}</span>
            </div>
          </div>
          <button type="submit" disabled={busy} style={{ width:"100%", padding:"11px 0", background:busy?C.t3:C.orange, color:"#fff", fontWeight:600, fontSize:14, border:"none", borderRadius:8, cursor:busy?"wait":"pointer", transition:"background 0.2s" }}>
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <div style={{ textAlign:"center", marginTop:24, fontSize:11, color:C.t3 }}>Ignition Group IT &middot; Service Management Platform</div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [curUser, setCurUser] = useState(getUser());
  const [roles,    setRoles]    = useState(ROLES0);
  const [techs,    setTechs]    = useState(TECHS0);
  const [prios,    setPrios]    = useState(PRIO0);
  const [statuses, setStatuses] = useState(STATUS0);
  const [sideOpen, setSideOpen] = useState(false);
  const [tab,      setTab]      = useState("dashboard");
  const [stab,     setStab]     = useState("m365");
  const [tickets,  setTickets]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [chats,    setChats]    = useState(CHATS0);
  const [kb,       setKb]       = useState(KB0);
  const [cls,      setCls]      = useState(CLS0);
  const [bh,       setBh]       = useState(BH0);
  const [mons,     setMons]     = useState(MONS0);
  const [selTk,    setSelTk]    = useState(null);
  const [selCh,    setSelCh]    = useState(null);
  const [q,        setQ]        = useState("");
  const [fSt,      setFSt]      = useState("All");
  const [fPr,      setFPr]      = useState("All");
  const [cfg,      setCfg]      = useState({ m365:"personal", pe:"daryl@ignitiongroup.co.za", se:"itsm@ignitiongroup.co.za", bot:"Ignition IT Bot", at:true, ar:true, autoAssign:true, maxTix:5 });
  const [tmsg,     setTmsg]     = useState("");
  const [logIn,    setLogIn]    = useState("");
  const [logOut,   setLogOut]   = useState("");
  const [logLoad,  setLogLoad]  = useState(false);
  const [hint,     setHint]     = useState("");
  const [aiLoad,   setAiLoad]   = useState(false);
  const [nTk,      setNTk]      = useState({ title:"", desc:"", cat:"", pri:"", user:"", mac:"", ip:"", asgn:"", cls:"", grp:"Incident" });
  const [repTxt,   setRepTxt]   = useState("");
  const [repLoad,  setRepLoad]  = useState(false);
  const [kbMode,   setKbMode]   = useState("list");
  const [kbDraft,  setKbDraft]  = useState({ title:"", body:"", tags:"" });
  const [kbRef,    setKbRef]    = useState(null);
  const [kbLoad,   setKbLoad]   = useState(false);
  const [m365H,    setM365H]    = useState(null);
  const [m365L,    setM365L]    = useState(false);
  const [chkId,    setChkId]    = useState(null);
  const [aiT,      setAiT]      = useState([]);
  const [noteTab,  setNoteTab]  = useState("public");
  const [noteText, setNoteText] = useState("");
  const [assignLog,setAssignLog]= useState([]);
  const [apiError, setApiError] = useState(null);
  const [backendHealth, setBackendHealth] = useState(null);
  const [agentData, setAgentData] = useState(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  // API Config state
  const [apiCfg, setApiCfg] = useState(() => loadConfig());
  const [apiTestResult, setApiTestResult] = useState(null);
  const [apiTesting, setApiTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  // settings forms
  const [eCls,setECls]         = useState(null); const [addCls,setAddCls] = useState(false);
  const [clsF,setClsF]         = useState({ name:"", group:"Incident", cat:"Software", responseMin:60, resolveMin:240 });
  const [ePrio,setEPrio]       = useState(null);
  const [priF,setPriF]         = useState({ label:"", color:"#1D6FAF", responseMin:60, resolveMin:240 });
  const [eSt,setESt]           = useState(null); const [addSt,setAddSt] = useState(false);
  const [stF,setStF]           = useState({ label:"", color:"#1D6FAF", bg:"#EFF6FF" });
  const [eBh,setEBh]           = useState(null); const [addBh,setAddBh] = useState(false);
  const [bhF,setBhF]           = useState({ name:"", start:"08:00", end:"17:30", days:["Mon","Tue","Wed","Thu","Fri"] });
  const [eRole,setERole]       = useState(null); const [addRole,setAddRole] = useState(false);
  const [roleF,setRoleF]       = useState({ name:"", level:"L1", cats:[] });
  const [eTech,setETech]       = useState(null); const [addTech,setAddTech] = useState(false);
  const [techF,setTechF]       = useState({ name:"", roleId:"r1", email:"", catsOverride:null, maxTix:5, autoAssign:true });
  const [eMon,setEMon]         = useState(null); const [addMon,setAddMon] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [scripts, setScripts] = useState(SCRIPTS);
  const [addScript, setAddScript] = useState(false);
  const [scriptForm, setScriptForm] = useState({ name:"", cmd:"", desc:"" });
  const [scriptDetail, setScriptDetail] = useState(null);
  const [monF,setMonF]         = useState({ name:"", type:"http", target:"" });

  // ── Requesters / Email state ──────────────────────────────
  const [requesters, setRequesters] = useState([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [addReq, setAddReq] = useState(false);
  const [reqForm, setReqForm] = useState({ name:"", email:"", department:"", phone:"", password:"" });
  const [editReq, setEditReq] = useState(null);
  const [reqQ, setReqQ] = useState("");
  const [emailCfg, setEmailCfg] = useState(null);
  const [emailCfgLoading, setEmailCfgLoading] = useState(false);
  const [emailCfgSaving, setEmailCfgSaving] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailTplLoading, setEmailTplLoading] = useState(false);
  const [editTpl, setEditTpl] = useState(null);
  const [emailLogs, setEmailLogs] = useState([]);
  const [emailLogLoading, setEmailLogLoading] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState(null);
  const [showM365Guide, setShowM365Guide] = useState(false);

  const chatEnd = useRef(null);
  useEffect(() => { chatEnd.current && chatEnd.current.scrollIntoView({ behavior:"smooth" }); }, [selCh]);

  // ── Load tickets from API on mount ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchTickets()
      .then(res => {
        if (cancelled) return;
        if (res.data && res.data.length > 0) {
          setTickets(res.data.map(t => ({ ...t, notes: t.notes || [], internalNotes: t.internalNotes || [] })));
          // Update tkCounter to highest existing ticket number
          res.data.forEach(t => {
            const num = parseInt((t.id || "").replace("TKT-", ""), 10);
            if (!isNaN(num) && num > tkCounter) tkCounter = num;
          });
        } else {
          // Fallback to sample data if API returns empty
          setTickets(TIX0);
        }
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error("Failed to load tickets:", err);
        setApiError("Failed to load tickets from backend. Using sample data.");
        setTimeout(() => setApiError(null), 5000);
        setTickets(TIX0);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Backend health polling ──────────────────────────────────
  useEffect(() => {
    const check = () => {
      fetchHealth()
        .then(res => setBackendHealth({ status: res.status || "ok", checked: new Date().toLocaleTimeString(), error: null }))
        .catch(() => setBackendHealth({ status: "error", checked: new Date().toLocaleTimeString(), error: "Unreachable" }));
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, []);

  // ── Load notes when ticket selected ─────────────────────────
  useEffect(() => {
    if (!selTk) { setAgentData(null); return; }
    fetchNotes(selTk.id)
      .then(res => { if (res.data) updTk(selTk.id, { notes: res.data }); })
      .catch(() => {});
    fetchInternalNotes(selTk.id)
      .then(res => { if (res.data) updTk(selTk.id, { internalNotes: res.data }); })
      .catch(() => {});
    fetchAgentPayloads(selTk.id)
      .then(res => { if (res.data && res.data.length > 0) setAgentData(res.data[0]); else setAgentData(null); })
      .catch(() => setAgentData(null));
  }, [selTk?.id]);

  // helpers
  const techRole = t => roles.find(r => r.id === t.roleId) || { name:"\u2014", level:"L1", cats:[] };
  const techCats = t => t.catsOverride || (techRole(t).cats || []);
  const stObj    = s => statuses.find(x => x.label === s) || { label:s, color:C.t2, bg:C.neu };
  const pObj     = p => prios.find(x => x.label === p)    || { label:p, color:C.t2 };
  const getSla   = tk => getSlaInfo(tk, cls, prios);

  const showError = (msg) => {
    setApiError(msg);
    setTimeout(() => setApiError(null), 5000);
  };

  const addTk = async (t) => {
    const id = "TKT-"+(++tkCounter);
    const tk = { ...t, id, created:new Date().toISOString(), notes:[], internalNotes:[], st:"Open" };
    setCreating(true);
    try {
      const res = await apiCreateTicket(tk);
      if (res.error) throw new Error(res.error);
      const saved = res.data ? { ...tk, ...res.data, notes: res.data.notes || [], internalNotes: res.data.internalNotes || [] } : tk;
      setTickets(p => [saved, ...p]);
      setCreating(false);
      return saved;
    } catch (e) {
      // Fallback: add locally anyway
      showError("Failed to save ticket to backend: " + e.message);
      setTickets(p => [tk, ...p]);
      setCreating(false);
      return tk;
    }
  };

  const updTk = (id, patch) => {
    // Optimistic local update
    setTickets(p => p.map(t => t.id===id ? { ...t, ...patch } : t));
    if (selTk && selTk.id===id) setSelTk(p => ({ ...p, ...patch }));
  };

  const updTkWithApi = async (id, patch) => {
    // Optimistic local update
    updTk(id, patch);
    // Sync to backend
    try {
      const res = await apiUpdateTicket(id, patch);
      if (res.error) throw new Error(res.error);
    } catch (e) {
      showError("Failed to sync update: " + e.message);
    }
  };

  const deleteTk = async (id) => {
    try {
      await apiDeleteTicket(id);
      setTickets(p => p.filter(t => t.id !== id));
      if (selTk && selTk.id === id) setSelTk(null);
    } catch (e) {
      showError("Failed to delete ticket: " + e.message);
    }
  };

  const handleAddNote = async (ticketId, text, isInternal) => {
    setNoteSaving(true);
    try {
      const fn = isInternal ? apiAddInternalNote : apiAddNote;
      const res = await fn(ticketId, { text, author: curUser?.name || "Tech" });
      if (res.data) {
        const field = isInternal ? "internalNotes" : "notes";
        const tk = tickets.find(t => t.id === ticketId);
        updTk(ticketId, { [field]: [...(tk?.[field] || []), res.data] });
      } else {
        // Fallback local
        const field = isInternal ? "internalNotes" : "notes";
        const tk = tickets.find(t => t.id === ticketId);
        const note = { text, ts: new Date().toLocaleString(), author: curUser?.name || "Tech", type: isInternal ? "internal" : "public" };
        updTk(ticketId, { [field]: [...(tk?.[field] || []), note] });
      }
    } catch (e) {
      // Fallback local
      const field = isInternal ? "internalNotes" : "notes";
      const tk = tickets.find(t => t.id === ticketId);
      const note = { text, ts: new Date().toLocaleString(), author: curUser?.name || "Tech", type: isInternal ? "internal" : "public" };
      updTk(ticketId, { [field]: [...(tk?.[field] || []), note] });
      showError("Note saved locally only: " + e.message);
    }
    setNoteSaving(false);
  };

  const navTo = id => { setTab(id); setSelTk(null); setSelCh(null); };

  // ── Requesters load ──────────────────────────────────────
  const loadRequesters = async () => {
    setReqLoading(true);
    try {
      const res = await fetchRequesters();
      if (res.data) setRequesters(res.data);
    } catch(e) { console.error(e); }
    setReqLoading(false);
  };
  useEffect(() => { if (tab === "users") loadRequesters(); }, [tab]);

  const handleCreateRequester = async () => {
    try {
      const res = await createRequester(reqForm);
      if (res.error) { setApiError(res.error); return; }
      setAddReq(false);
      setReqForm({ name:"", email:"", department:"", phone:"", password:"" });
      loadRequesters();
    } catch(e) { setApiError(e.message); }
  };

  const handleUpdateRequester = async (id, updates) => {
    try {
      const res = await updateRequester(id, updates);
      if (res.error) { setApiError(res.error); return; }
      setEditReq(null);
      loadRequesters();
    } catch(e) { setApiError(e.message); }
  };

  const handleDeactivateRequester = async (id) => {
    try {
      await deleteRequester(id);
      loadRequesters();
    } catch(e) { setApiError(e.message); }
  };

  // ── Email config/templates load ──────────────────────────
  const loadEmailConfig = async () => {
    setEmailCfgLoading(true);
    try {
      const res = await fetchEmailConfig();
      if (res.data) setEmailCfg(res.data);
    } catch(e) { console.error(e); }
    setEmailCfgLoading(false);
  };

  const loadEmailTemplates = async () => {
    setEmailTplLoading(true);
    try {
      const res = await fetchEmailTemplates();
      if (res.data) setEmailTemplates(res.data);
    } catch(e) { console.error(e); }
    setEmailTplLoading(false);
  };

  const loadEmailLog = async () => {
    setEmailLogLoading(true);
    try {
      const res = await fetchEmailLog();
      if (res.data) setEmailLogs(res.data);
    } catch(e) { console.error(e); }
    setEmailLogLoading(false);
  };

  useEffect(() => {
    if (tab === "settings" && stab === "email") loadEmailConfig();
    if (tab === "settings" && stab === "templates") loadEmailTemplates();
    if (tab === "settings" && stab === "emaillog") loadEmailLog();
  }, [tab, stab]);

  const handleSaveEmailConfig = async (cfg) => {
    setEmailCfgSaving(true);
    try {
      const res = await saveEmailConfig(cfg);
      if (res.error) setApiError(res.error);
      else setEmailTestResult({ ok: true, msg: "Config saved" });
    } catch(e) { setApiError(e.message); }
    setEmailCfgSaving(false);
  };

  const handleTestEmail = async () => {
    setEmailTestResult(null);
    try {
      const res = await testEmailConnection();
      if (res.error) setEmailTestResult({ ok: false, msg: res.error });
      else setEmailTestResult({ ok: true, msg: res.data?.message || "Test sent" });
    } catch(e) { setEmailTestResult({ ok: false, msg: e.message }); }
  };

  const handleUpdateTemplate = async (id, updates) => {
    try {
      const res = await updateEmailTemplate(id, updates);
      if (res.error) setApiError(res.error);
      else loadEmailTemplates();
    } catch(e) { setApiError(e.message); }
  };

  // derived
  const stats = {
    open: tickets.filter(t=>t.st==="Open").length,
    inp:  tickets.filter(t=>t.st==="In Progress").length,
    p1:   tickets.filter(t=>t.pri==="P1 - Critical").length,
    res:  tickets.filter(t=>["Resolved","Closed"].includes(t.st)).length,
    inc:  tickets.filter(t=>t.grp==="Incident").length,
    req:  tickets.filter(t=>t.grp==="Request").length,
    unassigned: tickets.filter(t=>!t.asgn&&!["Resolved","Closed"].includes(t.st)).length,
    srcConsole: tickets.filter(t=>!t.source||t.source==="console").length,
    srcEmail: tickets.filter(t=>t.source==="email").length,
    srcPortal: tickets.filter(t=>t.source==="portal").length,
    srcTeams: tickets.filter(t=>t.source==="teams").length,
  };
  const queued   = chats.filter(c=>c.st==="queue").length;
  const wkTotal  = WEEK.reduce((a,d)=>a+d.v,0);
  const slaAdh   = Math.round(tickets.filter(t=>{ const s=getSla(t); return s&&s.label!=="Breached"; }).length / Math.max(tickets.length,1) * 100);
  const breach   = tickets.filter(t=>{ const s=getSla(t); return s&&(s.label==="Breached"||s.label==="At risk")&&!["Resolved","Closed"].includes(t.st); });
  const avgAi    = aiT.length>0 ? (Math.round(aiT.reduce((a,b)=>a+b,0)/aiT.length/100)/10)+"s" : "\u2014";
  const fTix     = tickets.filter(t=>(fSt==="All"||t.st===fSt)&&(fPr==="All"||t.pri===fPr)&&(!q||t.title.toLowerCase().includes(q.toLowerCase())||t.id.includes(q)||(t.user||"").toLowerCase().includes(q.toLowerCase())));
  const catD     = CATS.map(c=>({l:c.split(" ")[0],v:tickets.filter(t=>t.cat===c).length}));
  const priD     = prios.map(p=>({l:p.label.split(" ")[0],v:tickets.filter(t=>t.pri===p.label).length}));
  const bc = (() => {
    const base = (NAV.find(n=>n.id===tab)||{}).label||"";
    if (tab==="tickets"&&selTk) return [{label:"Tickets",back:()=>setSelTk(null)},{label:selTk.id}];
    if (tab==="teams"&&selCh)   return [{label:"Teams Chat",back:()=>setSelCh(null)},{label:selCh.user}];
    return [{label:base}];
  })();

  // auto-assign
  const runAutoAssign = useCallback(() => {
    if (!cfg.autoAssign) return;
    setTickets(prev => {
      let updated = [...prev];
      const log = [];
      const unassigned = updated.filter(t=>!t.asgn&&t.st==="Open").sort((a,b)=>new Date(a.created)-new Date(b.created));
      unassigned.forEach(tk => {
        const clsObj = cls.find(c=>c.name===tk.cls);
        const reqCat = clsObj ? clsObj.cat : tk.cat;
        const eligible = techs.filter(t => {
          if (!t.autoAssign) return false;
          const cats = t.catsOverride || (roles.find(r=>r.id===t.roleId)||{}).cats || [];
          if (!cats.includes(reqCat)) return false;
          const max = t.maxTix || cfg.maxTix || 5;
          const cur = updated.filter(x=>x.asgn===t.name&&["Open","In Progress"].includes(x.st)).length;
          return cur < max;
        });
        if (!eligible.length) return;
        const best = eligible.reduce((a,b) => {
          const aC = updated.filter(x=>x.asgn===a.name&&["Open","In Progress"].includes(x.st)).length;
          const bC = updated.filter(x=>x.asgn===b.name&&["Open","In Progress"].includes(x.st)).length;
          return aC <= bC ? a : b;
        });
        updated = updated.map(t => t.id===tk.id ? { ...t, asgn:best.name, notes:[...t.notes,{text:"Auto-assigned to "+best.name,ts:new Date().toLocaleString(),type:"system"}] } : t);
        log.push(tk.id+" \u2192 "+best.name);
        // Sync assignment to backend
        apiUpdateTicket(tk.id, { asgn: best.name }).catch(() => {});
      });
      if (log.length) setAssignLog(p=>[...log.map(m=>({msg:m,ts:new Date().toLocaleTimeString()})),...p].slice(0,20));
      return updated;
    });
  }, [cfg.autoAssign, cfg.maxTix, cls, techs, roles]);

  useEffect(() => {
    if (!loading) runAutoAssign();
    const iv = setInterval(runAutoAssign, 300000);
    return () => clearInterval(iv);
  }, [runAutoAssign, loading]);

  // AI actions
  const runTriage = async () => {
    if (!nTk.desc) return;
    setAiLoad(true); setHint("Analysing\u2026");
    const t0 = Date.now();
    const r = await callAI([{role:"user",content:nTk.desc}],
      "You are an ITSM triage assistant. Respond ONLY with JSON (no markdown): {title,cat(one of:"+CATS.join(",")+"),pri(one of:"+prios.map(p=>p.label).join(",")+"),asgn(one of:"+techs.map(t=>t.name).join(",")+"),cls(one of:"+cls.map(c=>c.name).join(",")+"),grp(Incident or Request),summary}");
    setAiT(p=>[...p,Date.now()-t0].slice(-20));
    try { const p=JSON.parse(r.replace(/```json|```/g,"").trim()); setNTk(v=>({...v,...p})); setHint("AI: "+p.summary); }
    catch(e) { setHint("Could not parse \u2014 fill manually."); }
    setAiLoad(false);
  };
  const runReport = async () => {
    setRepLoad(true); setRepTxt("");
    const s = tickets.map(t=>t.id+"|"+(t.cls||t.cat)+"|"+t.pri+"|"+t.st+"|"+t.user).join("\n");
    const r = await callAI([{role:"user",content:"Ticket data:\n"+s}],
      "You are an IT operations analyst. Provide: 1) Top 3 recurring issue patterns. 2) 3 stability improvements. 3) User/machine hotspots. 4) Priority recommendation this week.");
    setRepTxt(r); setRepLoad(false);
  };
  const runLog = async () => {
    if (!logIn) return; setLogLoad(true); setLogOut("");
    const r = await callAI([{role:"user",content:logIn}], "IT log analyst. Identify: 1) Key anomalies 2) Root cause 3) Remediation.");
    setLogOut(r); setLogLoad(false);
  };
  const runKbRefine = async () => {
    if (!kbDraft.body) return; setKbLoad(true); setKbRef(null);
    const r = await callAI([{role:"user",content:"Title: "+kbDraft.title+"\nContent: "+kbDraft.body+"\nTags: "+kbDraft.tags}],
      "ITSM knowledge base editor. Respond ONLY with JSON (no markdown): {title,summary,steps(array),tags(array),category}");
    try { setKbRef(JSON.parse(r.replace(/```json|```/g,"").trim())); }
    catch(e) { setKbRef({title:kbDraft.title,summary:"Review manually.",steps:[kbDraft.body],tags:[],category:"General"}); }
    setKbLoad(false);
  };
  const approveKb = () => {
    if (!kbRef) return;
    setKb(p=>[{id:"kb"+Date.now(),title:kbRef.title,summary:kbRef.summary,steps:kbRef.steps,tags:kbRef.tags,cls:kbRef.category||"",author:"Daryl",excluded:false,created:new Date().toISOString().split("T")[0]},...p]);
    setKbRef(null); setKbDraft({title:"",body:"",tags:""}); setKbMode("list");
  };
  const sendTech = cid => {
    if (!tmsg.trim()) return;
    const m = {f:"tech",t:tmsg};
    setChats(p=>p.map(c=>c.id===cid?{...c,msgs:[...c.msgs,m],st:"takeover"}:c));
    setSelCh(p=>p?{...p,msgs:[...p.msgs,m],st:"takeover"}:p);
    setTmsg("");
  };
  const takeover = cid => { setChats(p=>p.map(c=>c.id===cid?{...c,st:"takeover"}:c)); setSelCh(p=>p?{...p,st:"takeover"}:p); };
  const logChat  = ch => {
    const last = [...ch.msgs].reverse().find(m=>m.f==="user");
    addTk({title:"Teams: "+((last&&last.t&&last.t.slice(0,60))||"Support request"),cat:"Other",pri:"P3 - Medium",user:ch.user,mac:"Unknown",ip:"Unknown",asgn:"",cls:"",grp:"Incident",logs:""}).then(t => {
      if (t) {
        setChats(p=>p.map(c=>c.id===ch.id?{...c,tkId:t.id}:c)); setSelCh(p=>p?{...p,tkId:t.id}:p);
      }
    });
  };
  const fetchM365 = async () => {
    setM365L(true);
    try {
      const txt = await callAI(
        [{role:"user",content:"Get M365 service health."}],
        "Use Microsoft 365 MCP to get service health. Return ONLY JSON: {services:[{name,status,description}]}."
      );
      try { setM365H(JSON.parse(txt.replace(/```json|```/g,"").trim())); }
      catch(e) { setM365H({services:[{name:"M365",status:"healthy",description:txt.slice(0,120)}]}); }
    } catch(e) { setM365H({services:[{name:"M365",status:"warning",description:"Could not reach AI: "+e.message}]}); }
    setM365L(false);
  };
  const checkMon = async mon => {
    setChkId(mon.id);
    const t0 = Date.now();
    try { await fetch(mon.target,{method:"HEAD",mode:"no-cors"}); } catch(e) {}
    setMons(p=>p.map(m=>m.id===mon.id?{...m,st:"healthy",ms:Date.now()-t0,checked:new Date().toLocaleTimeString()}:m));
    setChkId(null);
  };
  const checkAll = async () => { for (let i=0;i<mons.length;i++) await checkMon(mons[i]); };

  // API Config test
  const testApiConnection = async () => {
    setApiTesting(true); setApiTestResult(null);
    try {
      const res = await fetch(`${apiCfg.baseUrl}/api/health`);
      const json = await res.json();
      setApiTestResult({ ok: true, data: json });
    } catch (e) {
      setApiTestResult({ ok: false, error: e.message });
    }
    setApiTesting(false);
  };

  const SB = sideOpen ? 220 : 56;

  const css = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Inter',system-ui,sans-serif;}
    input,select,textarea,button{font-family:inherit;font-size:13px;}
    input:not([type=checkbox]),select,textarea{width:100%;padding:8px 12px;border-radius:8px;border:1px solid ${C.border};background:#fff;color:${C.t1};}
    input:focus,select:focus,textarea:focus{outline:none;border-color:${C.orange};box-shadow:0 0 0 3px ${C.orange}22;}
    textarea{resize:vertical;}
    .btn{padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;border:1px solid ${C.border};background:#fff;color:${C.t1};white-space:nowrap;}
    .btn:hover{background:${C.bg};}
    .btn:disabled{opacity:.5;cursor:not-allowed;}
    .btp{background:${C.orange};color:#fff;border-color:${C.orange};}
    .btp:hover{background:${C.og2};}
    .btd{background:${C.redBg};color:${C.redT};border-color:${C.red}44;}
    .bti{background:${C.bluBg};color:${C.bluT};border-color:${C.blu}44;}
    .sm{padding:5px 12px;font-size:12px;}
    .ni{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;color:rgba(255,255,255,.55);font-size:13px;font-weight:500;overflow:hidden;white-space:nowrap;}
    .ni:hover{background:${C.navyMid};color:rgba(255,255,255,.9);}
    .ni.on{background:${C.orange}22;color:${C.orange};}
    .stb{padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:${C.t2};border:none;background:none;text-align:left;width:100%;}
    .stb:hover{background:${C.bg};}
    .stb.on{background:${C.bg};color:${C.t1};}
    tr:hover td{background:${C.bg};}
    ::-webkit-scrollbar{width:4px;height:4px;}
    ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px;}
    input[type=checkbox]{width:auto;cursor:pointer;}
    .tag{display:inline-block;background:${C.neu};color:${C.t2};padding:2px 8px;border-radius:12px;margin:2px;font-size:11px;}
    .sec{font-size:11px;font-weight:700;color:${C.t2};text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;}
    .ntab{padding:6px 14px;cursor:pointer;font-size:13px;font-weight:500;color:${C.t2};border:none;background:none;border-bottom:2px solid transparent;}
    .ntab.on{color:${C.t1};border-bottom-color:${C.orange};}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  // ── Auth gate ──────────────────────────────────────────────
  if (!authed) return <LoginScreen onLogin={(user) => { setAuthed(true); setCurUser(user); }} />;

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:C.bg,color:C.t1,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{css}</style>

      {/* API Error banner */}
      {apiError && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:C.redBg,color:C.redT,padding:"10px 24px",fontSize:13,fontWeight:500,borderBottom:"2px solid "+C.red,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{apiError}</span>
          <button style={{background:"none",border:"none",color:C.redT,cursor:"pointer",fontSize:16,fontWeight:700}} onClick={()=>setApiError(null)}>x</button>
        </div>
      )}

      {/* SIDEBAR */}
      <div style={{width:SB,flexShrink:0,background:C.navy,display:"flex",flexDirection:"column",transition:"width .2s",overflow:"hidden",borderRight:"1px solid "+C.navyBorder}}>
        <div style={{height:56,display:"flex",alignItems:"center",padding:"0 12px",gap:10,cursor:"pointer",flexShrink:0,borderBottom:"1px solid "+C.navyBorder}} onClick={()=>setSideOpen(o=>!o)}>
          <HexLogo size={30}/>
          {sideOpen && <div><div style={{fontSize:13,fontWeight:700,color:"#fff",lineHeight:1}}>Ignition</div><div style={{fontSize:10,color:C.orange,fontWeight:600,letterSpacing:"0.8px",textTransform:"uppercase"}}>ITSM Console</div></div>}
        </div>
        <nav style={{flex:1,padding:"10px 8px",display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
          {NAV.map(n => {
            const badge = n.id==="tickets" ? stats.open : n.id==="teams" ? queued : n.id==="health" ? ERRS.filter(e=>e.sev==="critical").length : 0;
            return (
              <div key={n.id} className={"ni"+(tab===n.id?" on":"")} onClick={()=>navTo(n.id)} title={!sideOpen?n.label:""}>
                <span style={{flexShrink:0,width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center"}}><NavIcon id={n.id}/></span>
                {sideOpen && <span style={{flex:1}}>{n.label}</span>}
                {badge>0 && <span style={{background:C.orange,color:"#fff",fontSize:10,fontWeight:700,minWidth:18,height:18,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",flexShrink:0}}>{badge}</span>}
              </div>
            );
          })}
        </nav>
        <div style={{borderTop:"1px solid "+C.navyBorder,padding:"12px 10px",flexShrink:0}}>
          <div onClick={()=>setUserMenu(!userMenu)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",borderRadius:8,padding:"4px 2px",transition:"background 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background=C.navyMid} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{width:32,height:32,borderRadius:"50%",background:C.orange,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{(curUser?.name||"U")[0]}</div>
            {sideOpen && <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{curUser?.name||"User"}</div>
              <div style={{fontSize:11,color:C.orange,fontWeight:500}}>{curUser?.role||"Tech"}</div>
            </div>}
          </div>
        </div>
        {userMenu && <>
          <div onClick={()=>setUserMenu(false)} style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9998}} />
          <div style={{position:"fixed",bottom:70,left:sideOpen?16:56,background:C.card,border:"1px solid "+C.border,borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.2)",width:280,zIndex:9999}}>
            <div style={{padding:"20px 16px 14px",borderBottom:"1px solid "+C.border}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:48,height:48,borderRadius:"50%",background:C.orange,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#fff",flexShrink:0}}>{(curUser?.name||"U").split(" ").map(w=>w[0]).join("")}</div>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:C.t1}}>{curUser?.name||"User"}</div>
                  <div style={{fontSize:12,color:C.t2,marginTop:2}}>{curUser?.email||""}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <span style={{background:C.orange+"18",color:C.orange,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20}}>{curUser?.role||"Tech"}</span>
                <span style={{background:C.bluBg,color:C.bluT,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20}}>{curUser?.id ? "ID: "+curUser.id.slice(0,8) : ""}</span>
              </div>
            </div>
            <div style={{padding:"8px 8px 4px"}}>
              <div style={{padding:"4px 10px",fontSize:11,fontWeight:600,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Account</div>
              <div onClick={()=>{setUserMenu(false);setTab("settings");}} style={{padding:"9px 12px",borderRadius:8,cursor:"pointer",fontSize:13,color:C.t1,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Settings
              </div>
            </div>
            <div style={{padding:"0 8px 8px"}}>
              <div style={{height:1,background:C.border,margin:"0 4px 6px"}} />
              <div onClick={logout} style={{padding:"9px 12px",borderRadius:8,cursor:"pointer",fontSize:13,color:C.red,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=C.redBg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M6 15H4a1 1 0 01-1-1V4a1 1 0 011-1h2M12 12l3-3-3-3M7 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Sign Out
              </div>
            </div>
          </div>
        </>}
      </div>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{height:56,background:C.card,borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",padding:"0 24px",gap:16,flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}>
            {bc.map((c,i) => (
              <span key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                {i>0 && <span style={{color:C.t3}}>&rsaquo;</span>}
                <span style={{color:c.back?C.orange:C.t1,cursor:c.back?"pointer":"default",fontWeight:i===bc.length-1?600:400}} onClick={c.back}>{c.label}</span>
              </span>
            ))}
          </div>
          <div style={{flex:1,maxWidth:340,position:"relative"}}>
            <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}} width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke={C.t3} strokeWidth="1.5"/><path d="M10 10l2 2" stroke={C.t3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input style={{paddingLeft:32,background:C.bg,border:"1px solid "+C.border}} placeholder="Search tickets, users\u2026" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
            {backendHealth && (
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",background:backendHealth.status==="ok"||backendHealth.status==="healthy"?C.grnBg:C.redBg,borderRadius:8,border:"1px solid "+(backendHealth.status==="ok"||backendHealth.status==="healthy"?C.grn:C.red)+"44"}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:backendHealth.status==="ok"||backendHealth.status==="healthy"?C.grn:C.red}}/>
                <span style={{fontSize:12,color:backendHealth.status==="ok"||backendHealth.status==="healthy"?C.grnT:C.redT,fontWeight:500}}>API</span>
              </div>
            )}
            {stats.unassigned>0 && <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",background:C.yelBg,borderRadius:8,border:"1px solid "+C.yel+"44"}}><div style={{width:7,height:7,borderRadius:"50%",background:C.yel}}/><span style={{fontSize:12,color:C.yelT,fontWeight:500}}>{stats.unassigned} unassigned</span></div>}
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",background:C.bg,borderRadius:8,border:"1px solid "+C.border}}><div style={{width:7,height:7,borderRadius:"50%",background:C.grn}}/><span style={{fontSize:12,color:C.t2,fontWeight:500}}>M365 {cfg.m365==="personal"?"Personal":"Service"}</span></div>
          </div>
        </div>

        {/* Page content */}
        <div style={{flex:1,overflow:"auto",padding:"1.5rem 1.75rem"}}>

          {/* Loading state */}
          {loading && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh",gap:16}}>
              <Spinner size={40} />
              <div style={{fontSize:14,color:C.t2,fontWeight:500}}>Loading tickets from backend...</div>
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {!loading && tab==="dashboard" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:"1rem"}}>
                <Met label="Open tickets"  value={stats.open} color={C.red}    sub={stats.p1+" critical"}/>
                <Met label="In progress"   value={stats.inp}  color={C.blu}/>
                <Met label="SLA adherence" value={slaAdh+"%"} color={slaAdh>85?C.grn:C.yel}/>
                <Met label="This week"     value={wkTotal}    color={C.orange} sub="tickets raised"/>
                {stats.unassigned>0 && <Met label="Unassigned" value={stats.unassigned} color={C.yel} sub="awaiting assignment"/>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginBottom:16}}>
                <Crd>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:13,fontWeight:600}}>Ticket volume \u2014 this week</div><Bdg label={wkTotal+" total"} bg={C.neu} fg={C.t2}/></div>
                  <MBar data={WEEK} color={C.orange} height={72}/>
                </Crd>
                <Crd>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Type split</div>
                  {[["Incidents",stats.inc,C.red],["Requests",stats.req,C.blu],["Resolved",stats.res,C.grn]].map(r=>(
                    <div key={r[0]} style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>{r[0]}</span><span style={{fontWeight:600,color:r[2]}}>{r[1]}</span></div>
                      <Bar pct={Math.round(r[1]/Math.max(tickets.length,1)*100)} color={r[2]}/>
                    </div>
                  ))}
                </Crd>
              </div>
              <Crd xstyle={{marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Ticket sources</div>
                <div style={{display:"flex",gap:16,fontSize:13}}>
                  {[["Console",stats.srcConsole,C.t2],["Email",stats.srcEmail,C.blu],["Portal",stats.srcPortal,"#7C3AED"],["Teams",stats.srcTeams,C.orange]].map(r=>(
                    <div key={r[0]} style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:10,height:10,borderRadius:"50%",background:r[2]}}/><span>{r[0]}: <strong>{r[1]}</strong></span></div>
                  ))}
                </div>
              </Crd>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <Crd>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>SLA alerts {breach.length>0&&<Bdg label={breach.length+" at risk"} bg={C.redBg} fg={C.redT}/>}</div>
                  {breach.length===0 ? <div style={{fontSize:13,color:C.t3,padding:"12px 0"}}>All tickets within SLA</div> : breach.map(t=>{const s=getSla(t);return(
                    <div key={t.id} style={{padding:"8px 0",borderBottom:"1px solid "+C.border,cursor:"pointer"}} onClick={()=>{setSelTk(t);setTab("tickets");}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,fontWeight:600,color:C.orange}}>{t.id}</span><Bdg label={s.label} bg={s.label==="Breached"?C.redBg:C.yelBg} fg={s.label==="Breached"?C.redT:C.yelT}/></div>
                      <div style={{fontSize:12,color:C.t2,marginBottom:4}}>{t.title.slice(0,48)}</div>
                      <Bar pct={s.pct} color={s.color}/>
                    </div>
                  );})}
                </Crd>
                <Crd>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Ticket health snapshot</div>
                  {tickets.filter(t=>!["Resolved","Closed"].includes(t.st)).slice(0,5).map(t=>{const s=getSla(t);return(
                    <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+C.border}}>
                      <div style={{flex:1,minWidth:0,marginRight:8}}>
                        <div style={{fontSize:12,fontWeight:600,color:C.orange,marginBottom:2}}>{t.id} <span style={{color:C.t2,fontWeight:400}}>{(t.title||"").slice(0,26)}\u2026</span>{!t.asgn&&<span style={{color:C.yelT,fontSize:10,marginLeft:4}}>unassigned</span>}</div>
                        <Bar pct={(s&&s.pct)||0} color={(s&&s.color)||C.grn}/>
                      </div>
                      <Bdg label={t.st} bg={stObj(t.st).bg} fg={stObj(t.st).color}/>
                    </div>
                  );})}
                </Crd>
              </div>
            </div>
          )}

          {/* ── TICKETS LIST ── */}
          {!loading && tab==="tickets" && !selTk && (
            <div>
              <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
                <select style={{width:150}} value={fSt} onChange={e=>setFSt(e.target.value)}><option>All</option>{statuses.map(s=><option key={s.id}>{s.label}</option>)}</select>
                <select style={{width:160}} value={fPr} onChange={e=>setFPr(e.target.value)}><option>All</option>{prios.map(p=><option key={p.id}>{p.label}</option>)}</select>
                <button className="btn sm" style={{background:C.yelBg,color:C.yelT,border:"1px solid "+C.yel+"44"}} onClick={runAutoAssign}>Run auto-assign</button>
                <button className="btn btp sm" style={{marginLeft:"auto"}} onClick={()=>setTab("create")}>+ New ticket</button>
              </div>
              <Crd xstyle={{padding:0,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:C.bg,borderBottom:"1px solid "+C.border}}>{["ID","Title","Classification","Priority","SLA","Status","Assignee"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",fontWeight:600,color:C.t2,fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {fTix.map(t=>{
                      const s=getSla(t); const po=pObj(t.pri); const so=stObj(t.st);
                      return(
                        <tr key={t.id} style={{borderTop:"1px solid "+C.border,cursor:"pointer"}} onClick={()=>setSelTk(t)}>
                          <td style={{padding:"11px 14px",fontWeight:600,color:C.orange}}>{t.id}</td>
                          <td style={{padding:"11px 14px",maxWidth:200,fontWeight:500}}>{t.title}</td>
                          <td style={{padding:"11px 14px"}}><div style={{fontSize:12}}>{t.cls||"\u2014"}</div><div style={{fontSize:11,color:t.grp==="Incident"?C.redT:C.bluT,fontWeight:600}}>{t.grp}</div></td>
                          <td style={{padding:"11px 14px"}}><Bdg label={(t.pri&&t.pri.split(" ")[0])||"\u2014"} bg={po.color+"22"} fg={po.color}/></td>
                          <td style={{padding:"11px 14px",minWidth:110}}>
                            {s ? <div><Bdg label={s.label} bg={s.label==="Breached"?C.redBg:s.label==="At risk"?C.yelBg:C.grnBg} fg={s.label==="Breached"?C.redT:s.label==="At risk"?C.yelT:C.grnT}/><div style={{marginTop:4}}><Bar pct={s.pct} color={s.color}/></div><div style={{fontSize:10,color:C.t3,marginTop:2}}>{s.source==="priority"?"P-type override":"Cls SLA"}</div></div> : <span style={{color:C.t3,fontSize:12}}>\u2014</span>}
                          </td>
                          <td style={{padding:"11px 14px"}}><Bdg label={so.label} bg={so.bg} fg={so.color}/></td>
                          <td style={{padding:"11px 14px"}}>{t.asgn?<span style={{color:C.t2}}>{t.asgn}</span>:<span style={{color:C.yelT,fontSize:12,fontWeight:500}}>Unassigned</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Crd>
            </div>
          )}

          {/* ── TICKET DETAIL ── */}
          {!loading && tab==="tickets" && selTk && (() => {
            const t  = tickets.find(x=>x.id===selTk.id) || selTk;
            const s  = getSla(t);
            const po = pObj(t.pri);
            const so = stObj(t.st);
            const clsSla = cls.find(c=>c.name===t.cls);
            return (
              <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16}}>
                <div>
                  <Crd xstyle={{marginBottom:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                      <div><div style={{fontSize:12,color:C.t3,marginBottom:4,fontWeight:500}}>{t.id} \u00B7 <span style={{color:t.grp==="Incident"?C.redT:C.bluT,fontWeight:600}}>{t.grp}</span></div><div style={{fontWeight:700,fontSize:16}}>{t.title}</div></div>
                      <div style={{display:"flex",gap:6}}><Bdg label={t.pri} bg={po.color+"22"} fg={po.color}/><Bdg label={so.label} bg={so.bg} fg={so.color}/>{t.source && <Bdg label={t.source} bg={t.source==="email"?C.bluBg:t.source==="portal"?"#F5F3FF":t.source==="teams"?"#EFF6FF":C.neu} fg={t.source==="email"?C.bluT:t.source==="portal"?"#7C3AED":t.source==="teams"?C.bluT:C.t2}/>}</div>
                    </div>
                    {s && (()=>{
                      const createdTs = t.created || t.created_at;
                      const pausedTotal = s.pausedMin || 0;
                      const deadline = new Date(new Date(createdTs).getTime() + (s.resolveMin + pausedTotal) * 60000);
                      const remainMs = deadline.getTime() - Date.now();
                      const overdue = remainMs < 0 && !["Resolved","Closed"].includes(t.st);
                      const bgCol = s.isPaused ? C.yelBg : s.label==="Breached" ? C.redBg : s.label==="At risk" ? C.yelBg : C.grnBg;
                      return (
                      <div style={{marginBottom:14,padding:"12px 14px",background:bgCol,borderRadius:8,border:"1px solid "+s.color+"33"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}>
                          <span style={{fontWeight:700,color:s.color}}>SLA: {s.label}{s.isPaused?" \u23F8":""}</span>
                          <div style={{display:"flex",gap:6}}>
                            {pausedTotal>0 && <Bdg label={"Paused: "+fmtMin(pausedTotal)} bg={C.yelBg} fg={C.yelT} xstyle={{fontSize:10}}/>}
                            <Bdg label={s.source==="priority"?"Priority override":"Classification SLA"} bg={s.source==="priority"?C.yelBg:C.bluBg} fg={s.source==="priority"?C.yelT:C.bluT}/>
                          </div>
                        </div>
                        <Bar pct={s.pct} color={s.color}/>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginTop:10,fontSize:12}}>
                          <div style={{padding:"6px 10px",background:"rgba(255,255,255,0.6)",borderRadius:6}}><div style={{color:C.t3,fontSize:11,marginBottom:2}}>Response SLA</div><div style={{fontWeight:600}}>{fmtMin(s.responseMin)}</div></div>
                          <div style={{padding:"6px 10px",background:"rgba(255,255,255,0.6)",borderRadius:6}}><div style={{color:C.t3,fontSize:11,marginBottom:2}}>Resolve SLA</div><div style={{fontWeight:600}}>{fmtMin(s.resolveMin)}</div></div>
                          <div style={{padding:"6px 10px",background:"rgba(255,255,255,0.6)",borderRadius:6}}>
                            <div style={{color:C.t3,fontSize:11,marginBottom:2}}>Time remaining</div>
                            <div style={{fontWeight:700,color:overdue?C.red:s.isPaused?C.yel:s.remainMin!=null&&s.remainMin<=60?C.yel:s.color}}>
                              {s.label==="Resolved"?"Completed":s.isPaused?"Paused":overdue?"Overdue "+fmtMin(Math.abs(Math.ceil(remainMs/60000))):"\u223C"+fmtMin(s.remainMin||0)}
                            </div>
                          </div>
                          <div style={{padding:"6px 10px",background:"rgba(255,255,255,0.6)",borderRadius:6}}>
                            <div style={{color:C.t3,fontSize:11,marginBottom:2}}>Resolved at</div>
                            <div style={{fontWeight:600}}>{s.resolvedAt?new Date(s.resolvedAt).toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"--"}</div>
                          </div>
                        </div>
                        <div style={{marginTop:8,padding:"6px 10px",background:"rgba(255,255,255,0.6)",borderRadius:6,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
                          <div>
                            <div style={{color:C.t3,fontSize:11,marginBottom:2}}>Resolve deadline</div>
                            <div style={{fontWeight:600,fontSize:13}}>{deadline.toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"})} at {deadline.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</div>
                            <div style={{fontSize:11,color:C.t3,marginTop:2}}>Created {new Date(createdTs).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}{pausedTotal>0?" \u00B7 "+fmtMin(pausedTotal)+" paused":""}</div>
                          </div>
                          {s.activeMin!=null && <div style={{textAlign:"right",fontSize:11,color:C.t2}}>Active time: <strong>{fmtMin(s.activeMin)}</strong></div>}
                        </div>
                      </div>);
                    })()}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:13}}>
                      {[["User",t.user],["Machine",t.mac],["IP",t.ip],["Category",t.cat],["Created",new Date(t.created).toLocaleString()],["Classification",t.cls||"\u2014"]].map(kv=>(
                        <div key={kv[0]} style={{padding:"8px 12px",background:C.bg,borderRadius:8}}><span style={{color:C.t3,fontSize:11,fontWeight:500,display:"block",marginBottom:2}}>{kv[0]}</span><span style={{fontWeight:500}}>{kv[1]}</span></div>
                      ))}
                    </div>
                  </Crd>
                  {t.logs && <Crd xstyle={{marginBottom:16}}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Logs</div><pre style={{fontSize:11,color:C.t2,background:C.bg,padding:12,borderRadius:8,overflow:"auto",whiteSpace:"pre-wrap",fontFamily:"monospace"}}>{t.logs}</pre></Crd>}

                  {/* Agent / Machine Data */}
                  {agentData && (
                    <Crd xstyle={{marginBottom:16,borderTop:"3px solid "+C.blu}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                        <div style={{fontWeight:600,fontSize:13}}>Machine Data</div>
                        <Bdg label="Desktop Agent" bg={C.bluBg} fg={C.bluT}/>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13}}>
                        {agentData.machine_name && <div style={{padding:"6px 10px",background:C.bg,borderRadius:6}}><div style={{color:C.t3,fontSize:11}}>Machine</div><div style={{fontWeight:500}}>{agentData.machine_name}</div></div>}
                        {agentData.ip_address && <div style={{padding:"6px 10px",background:C.bg,borderRadius:6}}><div style={{color:C.t3,fontSize:11}}>IP</div><div style={{fontWeight:500}}>{agentData.ip_address}</div></div>}
                        {agentData.os_info && <div style={{padding:"6px 10px",background:C.bg,borderRadius:6,gridColumn:"1/-1"}}><div style={{color:C.t3,fontSize:11}}>OS</div><div style={{fontWeight:500}}>{agentData.os_info}</div></div>}
                        {agentData.disk_usage && <div style={{padding:"6px 10px",background:C.bg,borderRadius:6,gridColumn:"1/-1"}}><div style={{color:C.t3,fontSize:11}}>Disk Usage</div><div style={{fontWeight:500,fontSize:12,fontFamily:"monospace",whiteSpace:"pre-wrap"}}>{typeof agentData.disk_usage === "string" ? agentData.disk_usage : JSON.stringify(agentData.disk_usage, null, 2)}</div></div>}
                      </div>
                      {agentData.top_processes && (
                        <div style={{marginTop:8}}><div style={{color:C.t3,fontSize:11,marginBottom:4}}>Top Processes</div><pre style={{fontSize:11,color:C.t2,background:C.bg,padding:8,borderRadius:6,overflow:"auto",whiteSpace:"pre-wrap",fontFamily:"monospace"}}>{typeof agentData.top_processes === "string" ? agentData.top_processes : JSON.stringify(agentData.top_processes, null, 2)}</pre></div>
                      )}
                      {agentData.event_log && (
                        <div style={{marginTop:8}}><div style={{color:C.t3,fontSize:11,marginBottom:4}}>Recent Events</div><pre style={{fontSize:11,color:C.t2,background:C.bg,padding:8,borderRadius:6,overflow:"auto",whiteSpace:"pre-wrap",fontFamily:"monospace"}}>{typeof agentData.event_log === "string" ? agentData.event_log : JSON.stringify(agentData.event_log, null, 2)}</pre></div>
                      )}
                    </Crd>
                  )}

                  <Crd>
                    <div style={{display:"flex",alignItems:"center",borderBottom:"1px solid "+C.border,marginBottom:0}}>
                      <button className={"ntab"+(noteTab==="public"?" on":"")} onClick={()=>setNoteTab("public")}>Public notes</button>
                      <button className={"ntab"+(noteTab==="internal"?" on":"")} onClick={()=>setNoteTab("internal")}>Internal notes</button>
                    </div>
                    {noteTab==="public" && (
                      <div style={{paddingTop:12}}>
                        <div style={{fontSize:12,color:C.t3,marginBottom:10}}>Visible to end user</div>
                        {(t.notes||[]).filter(n=>n.type!=="system"&&n.type!=="internal").map((n,i)=><div key={i} style={{padding:"8px 0",borderBottom:"1px solid "+C.border,fontSize:13}}><div style={{color:C.t3,fontSize:11,marginBottom:2}}>{n.ts}</div>{n.text}</div>)}
                        {(t.notes||[]).filter(n=>n.type==="system").map((n,i)=><div key={"s"+i} style={{padding:"5px 0",fontSize:12,color:C.t3,fontStyle:"italic",borderBottom:"1px solid "+C.border}}>{n.ts} \u2014 {n.text}</div>)}
                        <div style={{display:"flex",gap:8,marginTop:12}}>
                          <input placeholder="Add public note\u2026" value={noteTab==="public"?noteText:""} onChange={e=>setNoteText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&e.target.value){handleAddNote(t.id,e.target.value,false);setNoteText("");}}}/>
                          <button className="btn btp sm" disabled={noteSaving} onClick={()=>{if(noteText){handleAddNote(t.id,noteText,false);setNoteText("");}}}>{noteSaving?"Saving\u2026":"Add"}</button>
                        </div>
                      </div>
                    )}
                    {noteTab==="internal" && (
                      <div style={{paddingTop:12}}>
                        <div style={{fontSize:12,color:C.yelT,background:C.yelBg,padding:"6px 10px",borderRadius:6,marginBottom:10}}>Internal only \u2014 not visible to end user</div>
                        {(t.internalNotes||[]).map((n,i)=><div key={i} style={{padding:"8px 12px",borderRadius:8,background:C.amberBg,border:"1px solid "+C.yel+"33",marginBottom:6,fontSize:13}}><div style={{color:C.t3,fontSize:11,marginBottom:2}}>{n.ts} \u00B7 {n.author||"Tech"}</div>{n.text}</div>)}
                        {!(t.internalNotes&&t.internalNotes.length) && <div style={{fontSize:13,color:C.t3,padding:"8px 0"}}>No internal notes yet.</div>}
                        <div style={{display:"flex",gap:8,marginTop:12}}>
                          <input placeholder="Add internal note (tech only)\u2026" value={noteTab==="internal"?noteText:""} onChange={e=>setNoteText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&e.target.value){handleAddNote(t.id,e.target.value,true);setNoteText("");}}}/>
                          <button className="btn sm" style={{background:C.amberBg,color:C.amber,border:"1px solid "+C.yel+"44"}} disabled={noteSaving} onClick={()=>{if(noteText){handleAddNote(t.id,noteText,true);setNoteText("");}}}>{noteSaving?"Saving\u2026":"Add internal"}</button>
                        </div>
                      </div>
                    )}
                  </Crd>
                </div>
                <div>
                  <Crd xstyle={{marginBottom:16}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Update ticket</div>
                    {[["Status",statuses.map(x=>x.label),"st"],["Priority",prios.map(x=>x.label),"pri"],["Classification",cls.map(x=>x.name),"cls"]].map(row=>(
                      <div key={row[2]} style={{marginBottom:10}}><Lbl text={row[0]}/><select value={t[row[2]]||""} onChange={e=>{const u={};u[row[2]]=e.target.value;updTkWithApi(t.id,u);}}>{row[1].map(o=><option key={o}>{o}</option>)}</select></div>
                    ))}
                    <div style={{marginBottom:10}}>
                      <Lbl text="Assigned technician"/>
                      <select value={t.asgn||""} onChange={e=>updTkWithApi(t.id,{asgn:e.target.value})}>
                        <option value="">— Unassigned —</option>
                        {techs.map(x=><option key={x.id}>{x.name}</option>)}
                      </select>
                    </div>
                    <button className="btn sm btd" style={{marginTop:8}} onClick={()=>deleteTk(t.id)}>Delete ticket</button>
                  </Crd>
                  <Crd>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Quick scripts</div>
                    {scripts.slice(0,4).map(sc=>(
                      <div key={sc.id} style={{padding:"8px 0",borderBottom:"1px solid "+C.border}}>
                        <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{sc.name}</div>
                        <div style={{fontSize:12,color:C.t2,marginBottom:6}}>{sc.desc}</div>
                        <button className="btn sm" onClick={()=>{handleAddNote(t.id,"Script triggered: "+sc.name,false);}}>Run on {t.mac}</button>
                      </div>
                    ))}
                  </Crd>
                </div>
              </div>
            );
          })()}

          {/* ── NEW TICKET ── */}
          {!loading && tab==="create" && (
            <div style={{maxWidth:660}}>
              <Crd>
                <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>New ticket</div>
                <div style={{fontSize:13,color:C.t2,marginBottom:16}}>Describe the issue and let AI triage it, or fill in manually.</div>
                <Lbl text="Describe the issue"/>
                <textarea style={{minHeight:80,marginBottom:8}} placeholder="e.g. User laptop keeps disconnecting from WiFi\u2026" value={nTk.desc} onChange={e=>setNTk(p=>({...p,desc:e.target.value}))}/>
                <button className="btn btp sm" style={{marginBottom:16}} onClick={runTriage} disabled={aiLoad}>{aiLoad?"Analysing\u2026":"AI triage"}</button>
                {hint && <div style={{fontSize:13,color:C.bluT,background:C.bluBg,padding:"10px 14px",borderRadius:8,marginBottom:16}}>{hint}</div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {[["Title","title","Short summary"],["User","user","Full name"],["Machine","mac","PC-Username-001"],["IP","ip","192.168.x.x"]].map(r=>(
                    <div key={r[1]}><Lbl text={r[0]}/><input placeholder={r[2]} value={nTk[r[1]]||""} onChange={e=>{const u={};u[r[1]]=e.target.value;setNTk(p=>({...p,...u}));}}/></div>
                  ))}
                  <div><Lbl text="Classification"/><select value={nTk.cls||""} onChange={e=>{const f=cls.find(x=>x.name===e.target.value);setNTk(p=>({...p,cls:e.target.value,grp:f?f.group:p.grp,cat:f?f.cat:p.cat}));}}><option value="">Select\u2026</option>{cls.map(c=><option key={c.id}>{c.name}</option>)}</select></div>
                  <div><Lbl text="Priority"/><select value={nTk.pri||""} onChange={e=>setNTk(p=>({...p,pri:e.target.value}))}><option value="">Select\u2026</option>{prios.map(p=><option key={p.id}>{p.label}</option>)}</select></div>
                  <div><Lbl text="Assignee (optional)"/><select value={nTk.asgn||""} onChange={e=>setNTk(p=>({...p,asgn:e.target.value}))}><option value="">\u2014 Auto-assign \u2014</option>{techs.map(t=><option key={t.id}>{t.name}</option>)}</select></div>
                  <div><Lbl text="Group"/><select value={nTk.grp||"Incident"} onChange={e=>setNTk(p=>({...p,grp:e.target.value}))}><option>Incident</option><option>Request</option></select></div>
                </div>
                <div style={{marginTop:16,display:"flex",gap:8}}>
                  <button className="btn btp" disabled={creating} onClick={async ()=>{if(!nTk.title||!nTk.pri)return;await addTk(nTk);setNTk({title:"",desc:"",cat:"",pri:"",user:"",mac:"",ip:"",asgn:"",cls:"",grp:"Incident"});setHint("");setTab("tickets");}}>{creating?"Saving\u2026":"Create ticket"}</button>
                  <button className="btn" onClick={()=>setTab("tickets")}>Cancel</button>
                </div>
              </Crd>
            </div>
          )}

          {/* ── TEAMS ── */}
          {!loading && tab==="teams" && (
            <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:16,height:"calc(100vh - 130px)"}}>
              <Crd xstyle={{padding:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:"1px solid "+C.border,fontWeight:600,fontSize:11,color:C.t2,textTransform:"uppercase",letterSpacing:"0.6px"}}>Conversations</div>
                <div style={{flex:1,overflow:"auto"}}>
                  {chats.map(c=>(
                    <div key={c.id} style={{padding:"12px 16px",borderBottom:"1px solid "+C.border,cursor:"pointer",background:selCh&&selCh.id===c.id?C.bg:"transparent"}} onClick={()=>setSelCh(c)}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><span style={{fontWeight:600,fontSize:13}}>{c.user}</span><Bdg label={c.st==="takeover"?"Tech":c.st==="queue"?"Queued":"AI"} bg={c.st==="takeover"?C.bluBg:c.st==="queue"?C.yelBg:C.grnBg} fg={c.st==="takeover"?C.bluT:c.st==="queue"?C.yelT:C.grnT}/></div>
                      <div style={{fontSize:12,color:C.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(c.msgs[c.msgs.length-1]||{}).t}</div>
                      {c.tkId && <div style={{fontSize:11,color:C.orange,marginTop:3,fontWeight:500}}>{c.tkId}</div>}
                    </div>
                  ))}
                </div>
              </Crd>
              {selCh ? (
                <Crd xstyle={{padding:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:C.bg}}>
                    <div><span style={{fontWeight:600}}>{selCh.user}</span><span style={{fontSize:12,color:C.t2,marginLeft:8}}>via Microsoft Teams</span></div>
                    <div style={{display:"flex",gap:8}}>
                      {selCh.st!=="takeover" && <button className="btn sm" onClick={()=>takeover(selCh.id)}>Take over</button>}
                      {!selCh.tkId ? <button className="btn btp sm" onClick={()=>logChat(selCh)}>Log ticket</button> : <span style={{fontSize:12,color:C.orange,fontWeight:500}}>{selCh.tkId}</span>}
                    </div>
                  </div>
                  <div style={{flex:1,overflow:"auto",padding:16,display:"flex",flexDirection:"column",gap:10}}>
                    {(chats.find(c=>c.id===selCh.id)||{msgs:[]}).msgs.map((m,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:m.f==="user"?"flex-start":"flex-end"}}>
                        <div style={{maxWidth:"70%",padding:"10px 14px",borderRadius:12,background:m.f==="user"?C.bg:C.bluBg,border:"1px solid "+C.border,fontSize:13}}>
                          <div style={{fontSize:10,color:C.t3,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>{m.f==="user"?selCh.user:m.f==="tech"?"Tech":"IT Bot"}</div>
                          {m.t}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEnd}/>
                  </div>
                  {selCh.st==="takeover"
                    ? <div style={{padding:12,borderTop:"1px solid "+C.border,display:"flex",gap:8,flexShrink:0}}><input placeholder="Reply as tech\u2026" value={tmsg} onChange={e=>setTmsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendTech(selCh.id)}/><button className="btn btp sm" onClick={()=>sendTech(selCh.id)}>Send</button></div>
                    : <div style={{padding:"10px 16px",borderTop:"1px solid "+C.border,fontSize:12,color:C.t2,background:C.bg}}>AI is handling this \u2014 click &quot;Take over&quot; to respond as tech.</div>
                  }
                </Crd>
              ) : (
                <Crd xstyle={{display:"flex",alignItems:"center",justifyContent:"center",color:C.t3,fontSize:14}}>Select a conversation</Crd>
              )}
            </div>
          )}

          {/* ── REPORTS ── */}
          {!loading && tab==="reports" && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div><div style={{fontWeight:700,fontSize:16,marginBottom:4}}>IT Operations Report</div><div style={{fontSize:13,color:C.t2}}>Trend analysis, patterns, and AI-driven recommendations.</div></div>
                <button className="btn btp" onClick={runReport} disabled={repLoad}>{repLoad?"Generating\u2026":"Generate AI insights"}</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:16}}>
                <Met label="Total"        value={tickets.length} color={C.t1}/>
                <Met label="Incidents"    value={stats.inc}      color={C.red}/>
                <Met label="Requests"     value={stats.req}      color={C.blu}/>
                <Met label="SLA adherence"value={slaAdh+"%"}     color={slaAdh>85?C.grn:C.yel}/>
                <Met label="Avg AI resp"  value={avgAi}          color={C.t2}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                <Crd><div style={{fontWeight:600,fontSize:13,marginBottom:12}}>By category</div><MBar data={catD} color={C.orange} height={80}/></Crd>
                <Crd><div style={{fontWeight:600,fontSize:13,marginBottom:12}}>By priority</div><MBar data={priD} color={C.navy} height={80}/></Crd>
              </div>
              <Crd xstyle={{marginBottom:16}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Top affected users</div>
                {Object.entries(tickets.reduce((a,t)=>{a[t.user]=(a[t.user]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>(
                  <div key={e[0]} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+C.border,fontSize:13}}>
                    <span>{e[0]}</span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:80,height:6,background:C.neu,borderRadius:3,overflow:"hidden"}}><div style={{width:Math.min(100,Math.round(e[1]/tickets.length*300))+"%",height:"100%",background:C.orange,borderRadius:3}}/></div><span style={{fontWeight:600,color:C.orange}}>{e[1]}</span></div>
                  </div>
                ))}
              </Crd>
              {repTxt
                ? <Crd xstyle={{borderTop:"3px solid "+C.orange}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><HexLogo size={22}/><span style={{fontWeight:700,fontSize:14}}>AI Insights</span></div><div style={{fontSize:13,lineHeight:1.9,whiteSpace:"pre-wrap"}}>{repTxt}</div></Crd>
                : <Crd xstyle={{display:"flex",alignItems:"center",justifyContent:"center",padding:"2.5rem",color:C.t3,fontSize:14}}>Click &quot;Generate AI insights&quot; to analyse your ticket data</Crd>
              }
            </div>
          )}

          {/* ── SYSTEM HEALTH ── */}
          {!loading && tab==="health" && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div><div style={{fontWeight:700,fontSize:16,marginBottom:4}}>System Health</div><div style={{fontSize:13,color:C.t2}}>Live platform status, configurable monitors, and ITSM metrics.</div></div>
                <button className="btn btp sm" onClick={checkAll}>Check all monitors</button>
              </div>

              {/* Backend API Health Card */}
              <div className="sec">Backend API</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,marginBottom:20}}>
                <Crd xstyle={{borderLeft:"3px solid "+(backendHealth && (backendHealth.status==="ok"||backendHealth.status==="healthy") ? C.grn : backendHealth ? C.red : C.t3)}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>ITSM Backend API</div>
                  <div style={{fontSize:12,color:C.t2,marginBottom:6,fontFamily:"monospace"}}>{loadConfig().baseUrl}</div>
                  {backendHealth ? (
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:backendHealth.status==="ok"||backendHealth.status==="healthy"?C.grn:C.red}}/>
                        <span style={{fontSize:13,fontWeight:500,color:backendHealth.status==="ok"||backendHealth.status==="healthy"?C.grn:C.red}}>{backendHealth.status==="ok"||backendHealth.status==="healthy"?"Healthy":"Unreachable"}</span>
                      </div>
                      <div style={{fontSize:11,color:C.t3}}>Last checked: {backendHealth.checked}</div>
                      {backendHealth.error && <div style={{fontSize:12,color:C.redT,marginTop:4}}>{backendHealth.error}</div>}
                    </div>
                  ) : (
                    <div style={{fontSize:12,color:C.t3}}>Checking...</div>
                  )}
                </Crd>
              </div>

              <div className="sec">ITSM Application Health</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20}}>
                <Met label="Tickets"     value={tickets.length} color={C.t1}/>
                <Met label="Open"        value={stats.open}     color={stats.open>5?C.red:C.grn}/>
                <Met label="SLA adherence" value={slaAdh+"%"}   color={slaAdh>85?C.grn:C.yel}/>
                <Met label="Teams queue" value={queued}         color={queued>3?C.yel:C.grn}/>
                <Met label="Unassigned"  value={stats.unassigned} color={stats.unassigned>0?C.yel:C.grn}/>
                <Met label="KB articles" value={kb.filter(a=>!a.excluded).length} color={C.blu}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
                <Crd>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>SLA breakdown</div>
                  {["On track","At risk","Breached","Resolved"].map(lbl=>{
                    const count=tickets.filter(t=>{const s=getSla(t);return s&&s.label===lbl;}).length;
                    const color=lbl==="On track"?C.grn:lbl==="At risk"?C.yel:lbl==="Breached"?C.red:C.t3;
                    return(<div key={lbl} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid "+C.border}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:color}}/><span style={{fontSize:13}}>{lbl}</span></div><span style={{fontWeight:600,color}}>{count}</span></div>);
                  })}
                </Crd>
                <Crd>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Tech workload</div>
                  {techs.map(t=>{
                    const open=tickets.filter(x=>x.asgn===t.name&&["Open","In Progress"].includes(x.st)).length;
                    const max=t.maxTix||cfg.maxTix; const pct=Math.round(open/max*100);
                    return(<div key={t.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>{t.name}</span><span style={{fontWeight:600,color:pct>=100?C.red:pct>=75?C.yel:C.grn}}>{open}/{max}</span></div><Bar pct={Math.min(100,pct)} color={pct>=100?C.red:pct>=75?C.yel:C.grn}/></div>);
                  })}
                </Crd>
              </div>
              {assignLog.length>0 && <Crd xstyle={{marginBottom:20}}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Auto-assignment log</div>{assignLog.slice(0,8).map((l,i)=><div key={i} style={{fontSize:12,color:C.t2,padding:"4px 0",borderBottom:"1px solid "+C.border}}><span style={{color:C.t3,marginRight:8}}>{l.ts}</span>{l.msg}</div>)}</Crd>}
              <div className="sec">Simulated Platform Monitors <Bdg label="Simulated" bg={C.yelBg} fg={C.yelT} xstyle={{marginLeft:6,fontSize:10}}/></div>
              {ERRS.filter(e=>e.sev==="critical").length>0 && (
                <Crd xstyle={{marginBottom:12,borderLeft:"4px solid "+C.red,borderRadius:"0 12px 12px 0"}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.redT,marginBottom:8}}>Intervention required (simulated)</div>
                  {ERRS.filter(e=>e.sev==="critical").map(e=>(
                    <div key={e.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 0",borderBottom:"1px solid "+C.border}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:C.red,marginTop:4,flexShrink:0}}/>
                      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{e.msg}</div><div style={{fontSize:11,color:C.t3,marginTop:2}}>Detected {e.ts}</div></div>
                      <button className="btn sm btd">Raise ticket</button>
                    </div>
                  ))}
                </Crd>
              )}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10,marginBottom:20}}>
                {SVCS.map(s=>{
                  const sc=scCol(s.st);
                  return(
                    <Crd key={s.name} xstyle={{borderLeft:"3px solid "+sc,position:"relative"}}>
                      <div style={{position:"absolute",top:8,right:8}}><Bdg label="Simulated" bg={C.neu} fg={C.t3} xstyle={{fontSize:10}}/></div>
                      <div style={{fontWeight:600,fontSize:13,marginBottom:4,paddingRight:72}}>{s.name}</div>
                      <div style={{display:"flex",gap:12,fontSize:12,color:C.t2}}><span>Uptime: <strong style={{color:C.t1}}>{s.up}</strong></span><span>{s.ago}</span></div>
                      {s.msg && <div style={{marginTop:8,fontSize:12,color:s.st==="error"?C.redT:C.yelT,background:s.st==="error"?C.redBg:C.yelBg,padding:"5px 8px",borderRadius:6}}>{s.msg}</div>}
                    </Crd>
                  );
                })}
              </div>
              <div className="sec" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span>Configurable Monitors <Bdg label="Real checks" bg={C.bluBg} fg={C.bluT} xstyle={{marginLeft:6,fontSize:10}}/></span>
                <button className="btn btp sm" onClick={()=>{setAddMon(true);setEMon(null);setMonF({name:"",type:"http",target:""});}}>+ Add monitor</button>
              </div>
              {(addMon||eMon) && (
                <Crd xstyle={{marginBottom:12,borderTop:"3px solid "+C.orange}}>
                  <div style={{fontWeight:600,marginBottom:12}}>{eMon?"Edit":"New"} monitor</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 140px 1fr",gap:10,marginBottom:10}}>
                    <div><Lbl text="Name"/><input value={monF.name} onChange={e=>setMonF(p=>({...p,name:e.target.value}))}/></div>
                    <div><Lbl text="Type"/><select value={monF.type} onChange={e=>setMonF(p=>({...p,type:e.target.value}))}><option value="http">HTTP URL</option><option value="host">Host / IP</option></select></div>
                    <div><Lbl text={monF.type==="http"?"URL":"Hostname"}/><input value={monF.target} onChange={e=>setMonF(p=>({...p,target:e.target.value}))}/></div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btp sm" onClick={()=>{if(!monF.name||!monF.target)return;if(eMon){setMons(p=>p.map(m=>m.id===eMon?{...m,...monF}:m));setEMon(null);}else{setMons(p=>[...p,{id:"m"+Date.now(),...monF,st:"unknown",ms:null,checked:null}]);setAddMon(false);}setMonF({name:"",type:"http",target:""});}}>Save</button>
                    <button className="btn sm" onClick={()=>{setAddMon(false);setEMon(null);}}>Cancel</button>
                  </div>
                </Crd>
              )}
              <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:20}}>
                {mons.map(m=>{
                  const sc=m.st==="healthy"?C.grn:m.st==="error"?C.red:C.t3; const ck=chkId===m.id;
                  return(
                    <div key={m.id} style={{minWidth:300,maxWidth:400,flex:"1 1 300px"}}>
                      <Crd xstyle={{borderLeft:"3px solid "+sc,height:"100%"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div><div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{m.name}</div><div style={{fontSize:11,color:C.t3,fontFamily:"monospace",wordBreak:"break-all"}}>{m.target}</div></div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:8}}><Bdg label={m.type==="http"?"HTTP":"Host"} bg={C.neu} fg={C.t2} xstyle={{fontSize:10}}/><div style={{width:8,height:8,borderRadius:"50%",background:sc}}/></div>
                        </div>
                        <div style={{fontSize:12,color:C.t2,marginBottom:8}}>
                          {m.st==="unknown"&&"Not checked yet"}{m.st==="healthy"&&<span style={{color:C.grn}}>Online{m.ms?" \u00B7 "+m.ms+"ms":""}</span>}{m.st==="error"&&<span style={{color:C.red}}>Unreachable</span>}{m.checked&&<span style={{color:C.t3}}> \u00B7 {m.checked}</span>}
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <button className="btn sm bti" onClick={()=>checkMon(m)} disabled={ck}>{ck?"Checking\u2026":"Check now"}</button>
                          <button className="btn sm" onClick={()=>{setEMon(m.id);setMonF({name:m.name,type:m.type,target:m.target});setAddMon(false);}}>Edit</button>
                          <button className="btn sm btd" onClick={()=>setMons(p=>p.filter(x=>x.id!==m.id))}>Remove</button>
                        </div>
                      </Crd>
                    </div>
                  );
                })}
                {mons.length===0 && <div style={{fontSize:13,color:C.t3}}>No monitors configured.</div>}
              </div>
              <div className="sec">Error & Event Log <Bdg label="Simulated" bg={C.neu} fg={C.t3} xstyle={{marginLeft:6,fontSize:10}}/></div>
              <Crd>
                {ERRS.map(e=>(
                  <div key={e.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 0",borderBottom:"1px solid "+C.border}}>
                    <Bdg label={e.sev} bg={sevBg(e.sev)} fg={sevFg(e.sev)}/><div style={{flex:1,fontSize:13}}>{e.msg}</div><span style={{fontSize:11,color:C.t3,flexShrink:0}}>{e.ts}</span>
                  </div>
                ))}
              </Crd>
            </div>
          )}

          {/* ── LOG ANALYSER ── */}
          {!loading && tab==="logs" && (
            <div style={{maxWidth:800}}>
              <Crd>
                <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>Endpoint log analyser</div>
                <div style={{fontSize:13,color:C.t2,marginBottom:16}}>Paste Windows Event logs or error output. AI identifies anomalies and recommends remediation.</div>
                <textarea style={{minHeight:180,fontFamily:"monospace",fontSize:12}} placeholder="Paste logs here\u2026" value={logIn} onChange={e=>setLogIn(e.target.value)}/>
                <button className="btn btp sm" style={{marginTop:10}} onClick={runLog} disabled={logLoad}>{logLoad?"Analysing\u2026":"Analyse logs"}</button>
                {logOut && <div style={{marginTop:16,padding:16,background:C.bg,borderRadius:10,fontSize:13,lineHeight:1.8,whiteSpace:"pre-wrap",border:"1px solid "+C.border}}><div style={{fontWeight:700,marginBottom:8,color:C.orange}}>AI Analysis</div>{logOut}</div>}
              </Crd>
            </div>
          )}

          {/* ── SCRIPTS ── */}
          {!loading && tab==="scripts" && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div><div style={{fontWeight:700,fontSize:16,marginBottom:4}}>Self-heal scripts</div><div style={{fontSize:13,color:C.t2}}>Automation scripts for remote remediation. AI can use these in automated workflows.</div></div>
                <button className="btn btp" onClick={()=>{setAddScript(true);setScriptForm({name:"",cmd:"",desc:""});}}>+ Add Script</button>
              </div>
              {addScript && <Crd xstyle={{marginBottom:16,borderTop:"3px solid "+C.orange}}>
                <div style={{fontWeight:600,marginBottom:12}}>New Automation Script</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <div><Lbl text="Script Name"/><input value={scriptForm.name} onChange={e=>setScriptForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Clear Print Queue"/></div>
                  <div><Lbl text="Command"/><input value={scriptForm.cmd} onChange={e=>setScriptForm(p=>({...p,cmd:e.target.value}))} placeholder="e.g. net stop spooler && del /q %systemroot%\system32\spool\printers\* && net start spooler"/></div>
                </div>
                <div style={{marginBottom:12}}><Lbl text="Description (what it does — used by AI for automation decisions)"/><textarea style={{minHeight:60}} value={scriptForm.desc} onChange={e=>setScriptForm(p=>({...p,desc:e.target.value}))} placeholder="Describe what this script does, when to use it, and any risks or prerequisites..."/></div>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btp sm" disabled={!scriptForm.name||!scriptForm.cmd} onClick={()=>{setScripts(p=>[...p,{id:Date.now(),name:scriptForm.name,cmd:scriptForm.cmd,desc:scriptForm.desc}]);setAddScript(false);}}>Save Script</button>
                  <button className="btn sm" onClick={()=>setAddScript(false)}>Cancel</button>
                </div>
              </Crd>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
                {scripts.map(sc=>(
                  <Crd key={sc.id} xstyle={{borderTop:"3px solid "+C.orange}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                      <div style={{fontWeight:600}}>{sc.name}</div>
                      <button className="btn sm" style={{fontSize:11,padding:"2px 8px"}} onClick={()=>setScriptDetail(scriptDetail===sc.id?null:sc.id)}>{scriptDetail===sc.id?"Hide":"Details"}</button>
                    </div>
                    <div style={{fontSize:13,color:C.t2,marginBottom:8}}>{sc.desc}</div>
                    {scriptDetail===sc.id && <>
                      <div style={{fontSize:11,fontWeight:600,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Command</div>
                      <pre style={{fontSize:11,background:C.navy,color:"#7dd3b0",padding:"10px 12px",borderRadius:8,overflow:"auto",whiteSpace:"pre-wrap",marginBottom:8,fontFamily:"monospace"}}>{sc.cmd}</pre>
                      <div style={{fontSize:11,fontWeight:600,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>AI Context</div>
                      <div style={{fontSize:12,color:C.t2,background:C.bg,padding:"8px 12px",borderRadius:8,marginBottom:8}}>{sc.desc||"No description provided."}</div>
                    </>}
                    <div style={{display:"flex",gap:8,marginTop:4}}>
                      <button className="btn btp sm">Push to machine</button>
                      <button className="btn sm" onClick={()=>{navigator.clipboard.writeText(sc.cmd);}}>Copy</button>
                      {!SCRIPTS.find(s=>s.id===sc.id) && <button className="btn sm btd" onClick={()=>setScripts(p=>p.filter(s=>s.id!==sc.id))}>Remove</button>}
                    </div>
                  </Crd>
                ))}
              </div>
            </div>
          )}

          {/* ── KNOWLEDGE BASE ── */}
          {!loading && tab==="kb" && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div><div style={{fontWeight:700,fontSize:16,marginBottom:4}}>Knowledge Base</div><div style={{fontSize:13,color:C.t2}}>Structured articles by techs and admins. AI refines drafts before publishing.</div></div>
                {kbMode==="list" ? <button className="btn btp" onClick={()=>{setKbMode("add");setKbRef(null);setKbDraft({title:"",body:"",tags:""});}}>+ Add article</button> : <button className="btn" onClick={()=>{setKbMode("list");setKbRef(null);}}>Back</button>}
              </div>
              {kbMode==="list" && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {kb.filter(a=>!a.excluded).map(a=>(
                    <Crd key={a.id}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{a.title}</div><div style={{fontSize:13,color:C.t2,marginBottom:8}}>{a.summary}</div><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{(a.tags||[]).map(t=><span key={t} className="tag">{t}</span>)}</div></div>
                        <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:12}}><button className="btn sm" onClick={()=>{setKbDraft({title:a.title,body:(a.steps||[]).join("\n"),tags:(a.tags||[]).join(", ")});setKbMode("edit");}}>Edit</button><button className="btn sm btd" onClick={()=>setKb(p=>p.map(x=>x.id===a.id?{...x,excluded:true}:x))}>Remove</button></div>
                      </div>
                      {a.steps&&a.steps.length>0 && <div style={{background:C.bg,borderRadius:8,padding:"10px 14px"}}><div className="sec" style={{marginBottom:6}}>Steps</div><ol style={{paddingLeft:18,fontSize:13,color:C.t2,lineHeight:1.8}}>{a.steps.map((s,i)=><li key={i}>{s}</li>)}</ol></div>}
                      <div style={{marginTop:8,fontSize:11,color:C.t3}}>Added by {a.author} \u00B7 {a.created}</div>
                    </Crd>
                  ))}
                  {kb.filter(a=>!a.excluded).length===0 && <Crd xstyle={{textAlign:"center",padding:"2.5rem",color:C.t3}}>No articles yet.</Crd>}
                </div>
              )}
              {(kbMode==="add"||kbMode==="edit") && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <Crd>
                    <div style={{fontWeight:600,fontSize:14,marginBottom:16}}>Draft article</div>
                    <div style={{marginBottom:10}}><Lbl text="Title"/><input value={kbDraft.title} onChange={e=>setKbDraft(p=>({...p,title:e.target.value}))}/></div>
                    <div style={{marginBottom:10}}><Lbl text="Content / steps"/><textarea style={{minHeight:180}} value={kbDraft.body} onChange={e=>setKbDraft(p=>({...p,body:e.target.value}))}/></div>
                    <div style={{marginBottom:16}}><Lbl text="Tags (comma separated)"/><input value={kbDraft.tags} onChange={e=>setKbDraft(p=>({...p,tags:e.target.value}))}/></div>
                    <button className="btn btp" onClick={runKbRefine} disabled={kbLoad||!kbDraft.body}>{kbLoad?"Refining\u2026":"Refine with AI"}</button>
                  </Crd>
                  <Crd xstyle={{borderTop:"3px solid "+C.orange}}>
                    <div style={{fontWeight:600,fontSize:14,marginBottom:16}}>AI-refined article</div>
                    {!kbRef && <div style={{color:C.t3,fontSize:13,textAlign:"center",padding:"20px 0"}}>{kbLoad?"Refining\u2026":"AI output will appear here."}</div>}
                    {kbRef && (
                      <div>
                        <div style={{marginBottom:12}}><div className="sec">Title</div><div style={{fontWeight:700,fontSize:15}}>{kbRef.title}</div></div>
                        <div style={{marginBottom:12}}><div className="sec">Summary</div><div style={{fontSize:13,color:C.t2}}>{kbRef.summary}</div></div>
                        <div style={{marginBottom:12}}><div className="sec">Steps</div><ol style={{paddingLeft:18,fontSize:13,color:C.t2,lineHeight:1.8}}>{(kbRef.steps||[]).map((s,i)=><li key={i}>{s}</li>)}</ol></div>
                        <div style={{marginBottom:16}}><div className="sec">Tags</div>{(kbRef.tags||[]).map(t=><span key={t} className="tag">{t}</span>)}</div>
                        <div style={{display:"flex",gap:8}}><button className="btn btp" onClick={approveKb}>Approve & publish</button><button className="btn" onClick={()=>setKbRef(null)}>Reject</button></div>
                      </div>
                    )}
                  </Crd>
                </div>
              )}
            </div>
          )}

          {/* ── USERS (Requesters) ── */}
          {!loading && tab==="users" && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <input placeholder="Search users\u2026" value={reqQ} onChange={e=>setReqQ(e.target.value)} style={{width:260}}/>
                <button className="btn btp" onClick={()=>setAddReq(true)}>+ Add requester</button>
              </div>

              {addReq && (
                <Crd xstyle={{marginBottom:16}}>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>New requester</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div><Lbl text="Full name"/><input value={reqForm.name} onChange={e=>setReqForm(p=>({...p,name:e.target.value}))}/></div>
                    <div><Lbl text="Email"/><input type="email" value={reqForm.email} onChange={e=>setReqForm(p=>({...p,email:e.target.value}))}/></div>
                    <div><Lbl text="Department"/><input value={reqForm.department} onChange={e=>setReqForm(p=>({...p,department:e.target.value}))}/></div>
                    <div><Lbl text="Phone"/><input value={reqForm.phone} onChange={e=>setReqForm(p=>({...p,phone:e.target.value}))}/></div>
                    <div><Lbl text="Temporary password"/><input type="password" value={reqForm.password} onChange={e=>setReqForm(p=>({...p,password:e.target.value}))}/></div>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:12}}><button className="btn btp" onClick={handleCreateRequester}>Create</button><button className="btn" onClick={()=>setAddReq(false)}>Cancel</button></div>
                </Crd>
              )}

              {reqLoading ? <Spinner/> : (
                <Crd>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead><tr style={{textAlign:"left",borderBottom:"2px solid "+C.border}}>
                      <th style={{padding:"8px 10px"}}>Name</th><th style={{padding:"8px 10px"}}>Email</th><th style={{padding:"8px 10px"}}>Department</th><th style={{padding:"8px 10px"}}>Phone</th><th style={{padding:"8px 10px"}}>Status</th><th style={{padding:"8px 10px"}}></th>
                    </tr></thead>
                    <tbody>
                      {requesters.filter(r => {
                        if (!reqQ) return true;
                        const q = reqQ.toLowerCase();
                        return (r.name||"").toLowerCase().includes(q) || (r.email||"").toLowerCase().includes(q) || (r.department||"").toLowerCase().includes(q);
                      }).map(r=>(
                        <tr key={r.id} style={{borderBottom:"1px solid "+C.border}}>
                          <td style={{padding:"8px 10px",fontWeight:500}}>{r.name}</td>
                          <td style={{padding:"8px 10px",color:C.t2}}>{r.email}</td>
                          <td style={{padding:"8px 10px"}}>{r.department||"\u2014"}</td>
                          <td style={{padding:"8px 10px"}}>{r.phone||"\u2014"}</td>
                          <td style={{padding:"8px 10px"}}><Bdg label={r.active!==false?"Active":"Inactive"} bg={r.active!==false?C.grnBg:C.redBg} fg={r.active!==false?C.grnT:C.redT}/></td>
                          <td style={{padding:"8px 10px",display:"flex",gap:4}}>
                            <button className="btn sm" onClick={()=>setEditReq(r)}>Edit</button>
                            {r.active!==false && <button className="btn sm" style={{color:C.red}} onClick={()=>handleDeactivateRequester(r.id)}>Deactivate</button>}
                          </td>
                        </tr>
                      ))}
                      {requesters.length===0 && <tr><td colSpan={6} style={{padding:20,textAlign:"center",color:C.t3}}>No requesters yet</td></tr>}
                    </tbody>
                  </table>
                </Crd>
              )}

              {editReq && (
                <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setEditReq(null)}>
                  <div style={{background:"#fff",borderRadius:12,padding:24,width:420,maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>Edit requester</div>
                    <Lbl text="Name"/><input value={editReq.name} onChange={e=>setEditReq(p=>({...p,name:e.target.value}))} style={{marginBottom:8}}/>
                    <Lbl text="Department"/><input value={editReq.department||""} onChange={e=>setEditReq(p=>({...p,department:e.target.value}))} style={{marginBottom:8}}/>
                    <Lbl text="Phone"/><input value={editReq.phone||""} onChange={e=>setEditReq(p=>({...p,phone:e.target.value}))} style={{marginBottom:12}}/>
                    <div style={{display:"flex",gap:8}}><button className="btn btp" onClick={()=>handleUpdateRequester(editReq.id,{name:editReq.name,department:editReq.department,phone:editReq.phone})}>Save</button><button className="btn" onClick={()=>setEditReq(null)}>Cancel</button></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SETTINGS ── */}
          {!loading && tab==="settings" && (
            <div style={{display:"grid",gridTemplateColumns:"190px 1fr",gap:16}}>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                {[["m365","Integration"],["email","Email Config"],["templates","Email Templates"],["emaillog","Email Log"],["apiconfig","API Config"],["cls","Classifications"],["prio","Priority Types & SLA"],["status","Ticket Statuses"],["bh","Business Hours"],["assign","Auto-Assignment"],["roles","Roles"],["techs","Technicians"]].map(r=>(
                  <button key={r[0]} className={"stb"+(stab===r[0]?" on":"")} onClick={()=>setStab(r[0])}>{r[1]}</button>
                ))}
              </div>
              <div>

                {/* Integration */}
                {stab==="m365" && (
                  <Crd>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Microsoft 365 / Teams</div>
                    <div style={{fontSize:13,color:C.t2,marginBottom:16}}>Configure your Teams bot account and automation.</div>
                    <Lbl text="Active account"/>
                    <select style={{marginBottom:12}} value={cfg.m365} onChange={e=>setCfg(p=>({...p,m365:e.target.value}))}><option value="personal">Personal account (current)</option><option value="service">Service account</option></select>
                    <Lbl text={cfg.m365==="personal"?"Personal M365 email":"Service account email"}/>
                    <input style={{marginBottom:12}} value={cfg.m365==="personal"?cfg.pe:cfg.se} onChange={e=>{const v=e.target.value;setCfg(p=>({...p,[p.m365==="personal"?"pe":"se"]:v}));}}/>
                    <div style={{fontSize:12,padding:"10px 14px",borderRadius:8,marginBottom:16,background:cfg.m365==="personal"?C.yelBg:C.grnBg,color:cfg.m365==="personal"?C.yelT:C.grnT}}>{cfg.m365==="personal"?"Using personal account \u2014 switch to service account for production.":"Service account active \u2014 ready for production."}</div>
                    <Lbl text="Bot display name"/>
                    <input style={{marginBottom:16}} value={cfg.bot} onChange={e=>setCfg(p=>({...p,bot:e.target.value}))}/>
                    {[["AI auto-triage","at","Automatically assign priority, classification and category"],["AI auto-routing","ar","Assign tickets to best available tech by category match"]].map(row=>(
                      <div key={row[1]} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid "+C.border}}>
                        <div><div style={{fontWeight:600,fontSize:13}}>{row[0]}</div><div style={{fontSize:12,color:C.t2}}>{row[2]}</div></div>
                        <button className="btn sm" style={{background:cfg[row[1]]?C.orange:"transparent",color:cfg[row[1]]?"#fff":C.t2,borderColor:cfg[row[1]]?C.orange:C.border,minWidth:46}} onClick={()=>setCfg(p=>({...p,[row[1]]:!p[row[1]]}))}>{cfg[row[1]]?"On":"Off"}</button>
                      </div>
                    ))}
                  </Crd>
                )}

                {/* Email Config */}
                {stab==="email" && (
                  <Crd>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Email Configuration</div>
                    <div style={{fontSize:13,color:C.t2,marginBottom:16}}>Configure inbound/outbound email for ticket creation and notifications.</div>
                    {emailCfgLoading ? <Spinner/> : (()=>{
                      const ec = emailCfg || {};
                      const setEc = (k,v) => setEmailCfg(p=>({...p,[k]:v}));
                      return (<div>
                        <Lbl text="Provider"/>
                        <select style={{marginBottom:12}} value={ec.provider||"smtp_imap"} onChange={e=>setEc("provider",e.target.value)}>
                          <option value="smtp_imap">SMTP / IMAP</option><option value="microsoft365">Microsoft 365 (Graph API)</option>
                        </select>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                          <Lbl text="Active"/><button className="btn sm" style={{background:ec.active?C.orange:"transparent",color:ec.active?"#fff":C.t2,borderColor:ec.active?C.orange:C.border}} onClick={()=>setEc("active",!ec.active)}>{ec.active?"On":"Off"}</button>
                        </div>
                        <Lbl text="Polling interval (minutes)"/>
                        <input type="number" style={{marginBottom:16,width:100}} value={ec.polling_interval_minutes||5} onChange={e=>setEc("polling_interval_minutes",parseInt(e.target.value)||5)}/>

                        {ec.provider==="microsoft365" ? (<div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <div style={{fontWeight:600,fontSize:13,color:C.orange}}>Office 365 Settings (ROPC — Service Account)</div>
                            <button className="btn sm" style={{fontSize:11}} onClick={()=>setShowM365Guide(p=>!p)}>{showM365Guide?"Hide":"Setup Guide"}</button>
                          </div>
                          {showM365Guide && (
                            <div style={{padding:16,background:C.bg,borderRadius:8,marginBottom:16,fontSize:12,lineHeight:1.8,border:"1px solid "+C.border}}>
                              <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>Microsoft 365 Email Setup Guide</div>
                              <div style={{fontWeight:600,marginBottom:4}}>Step 1: Create App Registration</div>
                              <div>1. Go to <b>portal.azure.com</b> &rarr; Entra ID &rarr; App registrations &rarr; New registration</div>
                              <div>2. Name: <code>ITSM Email Integration</code> &middot; Single tenant &middot; No redirect URI</div>
                              <div style={{fontWeight:600,marginTop:8,marginBottom:4}}>Step 2: Enable ROPC Flow</div>
                              <div>1. In the app &rarr; <b>Authentication</b> &rarr; Advanced settings &rarr; <b>Allow public client flows = Yes</b></div>
                              <div style={{fontWeight:600,marginTop:8,marginBottom:4}}>Step 3: API Permissions (Delegated only)</div>
                              <div>1. API permissions &rarr; Add &rarr; Microsoft Graph &rarr; <b>Delegated</b> permissions</div>
                              <div>2. Add: <code>Mail.Read</code>, <code>Mail.ReadWrite</code>, <code>Mail.Send</code>, <code>User.Read</code></div>
                              <div>3. Click <b>Grant admin consent</b></div>
                              <div style={{fontWeight:600,marginTop:8,marginBottom:4}}>Step 4: Client Secret</div>
                              <div>1. Certificates &amp; secrets &rarr; New client secret &rarr; Copy value immediately</div>
                              <div style={{fontWeight:600,marginTop:8,marginBottom:4}}>Step 5: Create Service Account</div>
                              <div>1. M365 Admin Centre &rarr; Users &rarr; Add user (e.g. <code>itsm-service@yourcompany.com</code>)</div>
                              <div>2. Assign a basic license (Exchange Online). Disable MFA for this account.</div>
                              <div style={{fontWeight:600,marginTop:8,marginBottom:4}}>Step 6: Grant Shared Mailbox Access</div>
                              <div>1. Exchange Admin &rarr; Shared mailbox &rarr; Mailbox delegation</div>
                              <div>2. Add service account as <b>Full Access</b> + <b>Send As</b></div>
                              <div style={{marginTop:8,padding:"8px 12px",background:"#fff3cd",borderRadius:6,color:"#856404"}}>
                                <b>Security:</b> This approach uses delegated permissions. The service account can ONLY access the one shared mailbox it has been granted access to. No tenant-wide mail access.
                              </div>
                            </div>
                          )}
                          <Lbl text="Tenant ID"/><input style={{marginBottom:8}} value={ec.m365_tenant_id||""} onChange={e=>setEc("m365_tenant_id",e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
                          <Lbl text="Client ID (App Registration)"/><input style={{marginBottom:8}} value={ec.m365_client_id||""} onChange={e=>setEc("m365_client_id",e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
                          <Lbl text="Client Secret"/><input type="password" style={{marginBottom:8}} value={ec.m365_client_secret||""} onChange={e=>setEc("m365_client_secret",e.target.value)}/>
                          <div style={{fontWeight:600,fontSize:12,marginTop:8,marginBottom:6,color:C.t2}}>Service Account Credentials</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                            <div><Lbl text="Service account email"/><input value={ec.m365_service_email||""} onChange={e=>setEc("m365_service_email",e.target.value)} placeholder="itsm-service@yourcompany.com"/></div>
                            <div><Lbl text="Service account password"/><input type="password" value={ec.m365_service_password||""} onChange={e=>setEc("m365_service_password",e.target.value)}/></div>
                          </div>
                          <Lbl text="Shared mailbox address"/><input style={{marginBottom:12}} value={ec.m365_mailbox||""} onChange={e=>setEc("m365_mailbox",e.target.value)} placeholder="itsupport@yourcompany.com"/>
                        </div>) : (<div>
                          <div style={{fontWeight:600,fontSize:13,marginBottom:8,color:C.orange}}>IMAP Settings (Inbound)</div>
                          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
                            <div><Lbl text="IMAP Host"/><input value={ec.imap_host||""} onChange={e=>setEc("imap_host",e.target.value)}/></div>
                            <div><Lbl text="Port"/><input type="number" value={ec.imap_port||993} onChange={e=>setEc("imap_port",parseInt(e.target.value))}/></div>
                            <div><Lbl text="SSL"/><button className="btn sm" style={{marginTop:4,background:ec.imap_ssl!==false?C.grn:"transparent",color:ec.imap_ssl!==false?"#fff":C.t2}} onClick={()=>setEc("imap_ssl",!ec.imap_ssl)}>{ec.imap_ssl!==false?"Yes":"No"}</button></div>
                          </div>
                          <div style={{fontWeight:600,fontSize:13,marginBottom:8,marginTop:12,color:C.orange}}>SMTP Settings (Outbound)</div>
                          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
                            <div><Lbl text="SMTP Host"/><input value={ec.smtp_host||""} onChange={e=>setEc("smtp_host",e.target.value)}/></div>
                            <div><Lbl text="Port"/><input type="number" value={ec.smtp_port||587} onChange={e=>setEc("smtp_port",parseInt(e.target.value))}/></div>
                            <div><Lbl text="TLS"/><button className="btn sm" style={{marginTop:4,background:ec.smtp_tls!==false?C.grn:"transparent",color:ec.smtp_tls!==false?"#fff":C.t2}} onClick={()=>setEc("smtp_tls",!ec.smtp_tls)}>{ec.smtp_tls!==false?"Yes":"No"}</button></div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                            <div><Lbl text="Username"/><input value={ec.smtp_username||""} onChange={e=>setEc("smtp_username",e.target.value)}/></div>
                            <div><Lbl text="Password"/><input type="password" value={ec.smtp_password||""} onChange={e=>setEc("smtp_password",e.target.value)}/></div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                            <div><Lbl text="From name"/><input value={ec.smtp_from_name||""} onChange={e=>setEc("smtp_from_name",e.target.value)}/></div>
                            <div><Lbl text="From email"/><input value={ec.smtp_from_email||""} onChange={e=>setEc("smtp_from_email",e.target.value)}/></div>
                          </div>
                        </div>)}
                        <div style={{display:"flex",gap:8,marginTop:8}}>
                          <button className="btn btp" disabled={emailCfgSaving} onClick={()=>handleSaveEmailConfig(ec)}>{emailCfgSaving?"Saving\u2026":"Save config"}</button>
                          <button className="btn" onClick={handleTestEmail}>Send test email</button>
                        </div>
                        {emailTestResult && <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,fontSize:13,background:emailTestResult.ok?C.grnBg:C.redBg,color:emailTestResult.ok?C.grnT:C.redT}}>{emailTestResult.msg}</div>}
                      </div>);
                    })()}
                  </Crd>
                )}

                {/* Email Templates */}
                {stab==="templates" && (
                  <Crd>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Auto-Reply Email Templates</div>
                    <div style={{fontSize:13,color:C.t2,marginBottom:16}}>Configure automatic email responses sent when tickets are created, updated, or resolved.</div>
                    {emailTplLoading ? <Spinner/> : (
                      <div>
                        <div style={{fontSize:12,color:C.t3,marginBottom:12,padding:"8px 12px",background:C.bg,borderRadius:8}}>
                          <strong>Available variables:</strong> {"{{ticket_id}}, {{title}}, {{classification}}, {{category}}, {{priority}}, {{status}}, {{sla_resolve_time}}, {{sla_response_time}}, {{requester_name}}, {{assignee}}, {{created_at}}, {{portal_url}}"}
                        </div>
                        {emailTemplates.map(tpl=>(
                          <div key={tpl.id} style={{marginBottom:16,padding:16,border:"1px solid "+C.border,borderRadius:8}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              <div style={{fontWeight:600,fontSize:14}}>{tpl.name}</div>
                              <Bdg label={tpl.active?"Active":"Inactive"} bg={tpl.active?C.grnBg:C.redBg} fg={tpl.active?C.grnT:C.redT}/>
                            </div>
                            {editTpl?.id===tpl.id ? (
                              <div>
                                <Lbl text="Subject"/><input style={{marginBottom:8}} value={editTpl.subject||""} onChange={e=>setEditTpl(p=>({...p,subject:e.target.value}))}/>
                                <Lbl text="Body (HTML)"/><textarea style={{minHeight:120,marginBottom:8,fontFamily:"monospace",fontSize:12}} value={editTpl.body_html||""} onChange={e=>setEditTpl(p=>({...p,body_html:e.target.value}))}/>
                                <div style={{display:"flex",gap:8}}>
                                  <button className="btn btp" onClick={()=>{handleUpdateTemplate(editTpl.id,{subject:editTpl.subject,body_html:editTpl.body_html,active:editTpl.active});setEditTpl(null);}}>Save</button>
                                  <button className="btn" onClick={()=>setEditTpl(null)}>Cancel</button>
                                  <button className="btn sm" onClick={()=>setEditTpl(p=>({...p,active:!p.active}))}>{editTpl.active?"Disable":"Enable"}</button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{fontSize:12,color:C.t3,marginBottom:4}}>Subject: <span style={{color:C.t1}}>{tpl.subject}</span></div>
                                <div style={{fontSize:12,color:C.t3,marginBottom:8}}>Body preview: <span style={{color:C.t2}}>{(tpl.body_html||"").replace(/<[^>]*>/g,"").slice(0,100)}\u2026</span></div>
                                <button className="btn sm" onClick={()=>setEditTpl({...tpl})}>Edit</button>
                              </div>
                            )}
                          </div>
                        ))}
                        {emailTemplates.length===0 && <div style={{padding:16,textAlign:"center",color:C.t3}}>No templates found. Seed them in Supabase first.</div>}
                      </div>
                    )}
                  </Crd>
                )}

                {/* Email Log */}
                {stab==="emaillog" && (
                  <Crd>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>Email Audit Log</div><div style={{fontSize:13,color:C.t2}}>Recent inbound and outbound emails processed by the system.</div></div>
                      <button className="btn sm" onClick={loadEmailLog}>Refresh</button>
                    </div>
                    {emailLogLoading ? <Spinner/> : (
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                        <thead><tr style={{textAlign:"left",borderBottom:"2px solid "+C.border}}>
                          <th style={{padding:"6px 8px"}}>Direction</th><th style={{padding:"6px 8px"}}>Ticket</th><th style={{padding:"6px 8px"}}>From</th><th style={{padding:"6px 8px"}}>To</th><th style={{padding:"6px 8px"}}>Subject</th><th style={{padding:"6px 8px"}}>Date</th>
                        </tr></thead>
                        <tbody>
                          {emailLogs.map(l=>(
                            <tr key={l.id} style={{borderBottom:"1px solid "+C.border}}>
                              <td style={{padding:"6px 8px"}}><Bdg label={l.direction} bg={l.direction==="inbound"?C.bluBg:C.grnBg} fg={l.direction==="inbound"?C.bluT:C.grnT}/></td>
                              <td style={{padding:"6px 8px",fontWeight:500,color:C.orange}}>{l.ticket_id||"\u2014"}</td>
                              <td style={{padding:"6px 8px",color:C.t2}}>{l.from_email}</td>
                              <td style={{padding:"6px 8px",color:C.t2}}>{l.to_email}</td>
                              <td style={{padding:"6px 8px",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.subject}</td>
                              <td style={{padding:"6px 8px",color:C.t3}}>{l.created_at?new Date(l.created_at).toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"\u2014"}</td>
                            </tr>
                          ))}
                          {emailLogs.length===0 && <tr><td colSpan={6} style={{padding:16,textAlign:"center",color:C.t3}}>No email logs yet</td></tr>}
                        </tbody>
                      </table>
                    )}
                  </Crd>
                )}

                {/* API Config */}
                {stab==="apiconfig" && (
                  <Crd>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>API Configuration</div>
                    <div style={{fontSize:13,color:C.t2,marginBottom:16}}>Configure the connection to the ITSM backend API.</div>
                    <div style={{marginBottom:12}}>
                      <Lbl text="Backend URL"/>
                      <input value={apiCfg.baseUrl} onChange={e=>setApiCfg(p=>({...p,baseUrl:e.target.value}))}/>
                    </div>
                    <div style={{marginBottom:16}}>
                      <Lbl text="API Key"/>
                      <div style={{display:"flex",gap:8}}>
                        <input type={showApiKey?"text":"password"} value={apiCfg.apiKey} onChange={e=>setApiCfg(p=>({...p,apiKey:e.target.value}))}/>
                        <button className="btn sm" onClick={()=>setShowApiKey(p=>!p)}>{showApiKey?"Hide":"Show"}</button>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom:16}}>
                      <button className="btn btp sm" onClick={()=>{saveConfig(apiCfg);showError(null);setApiError(null);/* show success inline */setApiTestResult({ok:true,data:{message:"Config saved to localStorage"}});}}>Save</button>
                      <button className="btn sm bti" onClick={testApiConnection} disabled={apiTesting}>{apiTesting?"Testing\u2026":"Test connection"}</button>
                    </div>
                    {apiTestResult && (
                      <div style={{padding:"10px 14px",borderRadius:8,background:apiTestResult.ok?C.grnBg:C.redBg,color:apiTestResult.ok?C.grnT:C.redT,fontSize:13}}>
                        {apiTestResult.ok ? "Connected successfully" + (apiTestResult.data?.status ? " \u2014 status: "+apiTestResult.data.status : "") : "Connection failed: "+apiTestResult.error}
                      </div>
                    )}
                  </Crd>
                )}

                {/* Classifications */}
                {stab==="cls" && (
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>Classifications</div><div style={{fontSize:13,color:C.t2}}>Each classification has its own Response and Resolve SLA. Priority type overrides these.</div></div>
                      <button className="btn btp sm" onClick={()=>{setAddCls(true);setECls(null);setClsF({name:"",group:"Incident",cat:"Software",responseMin:60,resolveMin:240});}}>+ Add</button>
                    </div>
                    {(addCls||eCls) && (
                      <Crd xstyle={{marginBottom:16,borderTop:"3px solid "+C.orange}}>
                        <div style={{fontWeight:600,marginBottom:12}}>{eCls?"Edit":"New"} classification</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                          <div><Lbl text="Name"/><input value={clsF.name} onChange={e=>setClsF(p=>({...p,name:e.target.value}))}/></div>
                          <div><Lbl text="Group"/><select value={clsF.group} onChange={e=>setClsF(p=>({...p,group:e.target.value}))}><option>Incident</option><option>Request</option></select></div>
                          <div><Lbl text="Category"/><select value={clsF.cat} onChange={e=>setClsF(p=>({...p,cat:e.target.value}))}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                          <MinSelect label="Response SLA" value={clsF.responseMin} onChange={v=>setClsF(p=>({...p,responseMin:v}))}/>
                          <MinSelect label="Resolve SLA"  value={clsF.resolveMin}  onChange={v=>setClsF(p=>({...p,resolveMin:v}))}/>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button className="btn btp sm" onClick={()=>{if(!clsF.name)return;if(eCls){setCls(p=>p.map(x=>x.id===eCls?{...x,...clsF}:x));setECls(null);}else{setCls(p=>[...p,{...clsF,id:"c"+Date.now()}]);setAddCls(false);}setClsF({name:"",group:"Incident",cat:"Software",responseMin:60,resolveMin:240});}}>Save</button>
                          <button className="btn sm" onClick={()=>{setAddCls(false);setECls(null);}}>Cancel</button>
                        </div>
                      </Crd>
                    )}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {["Incident","Request"].map(grp=>(
                        <div key={grp}>
                          <div style={{fontSize:12,fontWeight:700,color:grp==="Incident"?C.redT:C.bluT,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:8}}>{grp}s</div>
                          {cls.filter(c=>c.group===grp).map(c=>(
                            <Crd key={c.id} xstyle={{marginBottom:8,padding:12}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{c.name}</div>
                                  <div style={{fontSize:12,color:C.t2}}>{c.cat}</div>
                                  <div style={{fontSize:12,color:C.t3,marginTop:4,display:"flex",gap:12}}><span>Response: <strong>{fmtMin(c.responseMin)}</strong></span><span>Resolve: <strong>{fmtMin(c.resolveMin)}</strong></span></div>
                                </div>
                                <div style={{display:"flex",gap:6,marginLeft:8}}>
                                  <button className="btn sm" onClick={()=>{setECls(c.id);setClsF({name:c.name,group:c.group,cat:c.cat,responseMin:c.responseMin,resolveMin:c.resolveMin});setAddCls(false);}}>Edit</button>
                                  <button className="btn sm btd" onClick={()=>setCls(p=>p.filter(x=>x.id!==c.id))}>Remove</button>
                                </div>
                              </div>
                            </Crd>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Priority Types */}
                {stab==="prio" && (
                  <div>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Priority Types & SLA</div>
                    <div style={{fontSize:13,color:C.t2,marginBottom:16}}>When a ticket has a priority set, these SLA times override the classification SLA.</div>
                    {prios.map(p=>(
                      <Crd key={p.id} xstyle={{marginBottom:12,borderLeft:"3px solid "+p.color}}>
                        {ePrio===p.id ? (
                          <div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                              <div><Lbl text="Label"/><input value={priF.label} onChange={e=>setPriF(x=>({...x,label:e.target.value}))}/></div>
                              <div><Lbl text="Colour (hex)"/><div style={{display:"flex",gap:8,alignItems:"center"}}><input value={priF.color} onChange={e=>setPriF(x=>({...x,color:e.target.value}))}/><div style={{width:28,height:28,borderRadius:6,background:priF.color,flexShrink:0}}/></div></div>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                              <MinSelect label="Response SLA" value={priF.responseMin} onChange={v=>setPriF(x=>({...x,responseMin:v}))}/>
                              <MinSelect label="Resolve SLA"  value={priF.resolveMin}  onChange={v=>setPriF(x=>({...x,resolveMin:v}))}/>
                            </div>
                            <div style={{display:"flex",gap:8}}>
                              <button className="btn btp sm" onClick={()=>{setPrios(x=>x.map(q=>q.id===p.id?{...q,...priF}:q));setEPrio(null);}}>Save</button>
                              <button className="btn sm" onClick={()=>setEPrio(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div>
                              <div style={{fontWeight:700,fontSize:14,marginBottom:4,color:p.color}}>{p.label}</div>
                              <div style={{fontSize:12,color:C.t2,display:"flex",gap:16}}><span>Response: <strong>{fmtMin(p.responseMin)}</strong></span><span>Resolve: <strong>{fmtMin(p.resolveMin)}</strong></span></div>
                            </div>
                            <button className="btn sm" onClick={()=>{setEPrio(p.id);setPriF({label:p.label,color:p.color,responseMin:p.responseMin,resolveMin:p.resolveMin});}}>Edit</button>
                          </div>
                        )}
                      </Crd>
                    ))}
                    <Crd xstyle={{marginTop:20,borderLeft:"4px solid "+C.blu,background:C.bluBg}}>
                      <div style={{fontWeight:700,fontSize:14,color:C.bluT,marginBottom:10}}>SLA Calculation Rules</div>
                      <div style={{fontSize:13,color:C.t1,lineHeight:1.8}}>
                        <div style={{fontWeight:600,marginBottom:4}}>How SLA is measured:</div>
                        <ul style={{paddingLeft:18,marginBottom:12}}>
                          <li>SLA timer <strong>starts</strong> when a ticket is created (status: Open)</li>
                          <li>SLA timer <strong>runs</strong> through: Open, In Progress, User Feedback Received, Reopened</li>
                          <li>SLA timer <strong>pauses</strong> when status is set to "Pending User Feedback"</li>
                          <li>SLA timer <strong>resumes</strong> when status changes from "Pending User Feedback" to any active status</li>
                          <li>SLA timer <strong>stops</strong> when ticket is marked as "Resolved"</li>
                          <li><strong>Total SLA</strong> = (Resolved time - Created time) - Total paused time</li>
                        </ul>
                        <div style={{fontWeight:600,marginBottom:4}}>Status transitions:</div>
                        <ul style={{paddingLeft:18,marginBottom:12}}>
                          <li>Open &rarr; In Progress &rarr; Resolved <em>(standard flow)</em></li>
                          <li>Any status &rarr; Pending User Feedback <em>(SLA pauses)</em></li>
                          <li>Pending User Feedback &rarr; User Feedback Received <em>(SLA resumes)</em></li>
                          <li>Resolved &rarr; Reopened <em>(new SLA cycle, timer resets)</em></li>
                          <li>Resolved &rarr; Closed <em>(auto after 24h with no user response)</em></li>
                        </ul>
                        <div style={{fontWeight:600,marginBottom:4}}>SLA targets determined by:</div>
                        <ol style={{paddingLeft:18}}>
                          <li><strong>Priority level</strong> (if set) &mdash; takes precedence</li>
                          <li><strong>Classification type</strong> (fallback if no priority set)</li>
                        </ol>
                      </div>
                    </Crd>
                  </div>
                )}

                {/* Ticket Statuses */}
                {stab==="status" && (
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>Ticket Statuses</div><div style={{fontSize:13,color:C.t2}}>Customise the statuses available on tickets.</div></div>
                      <button className="btn btp sm" onClick={()=>{setAddSt(true);setESt(null);setStF({label:"",color:"#1D6FAF",bg:"#EFF6FF"});}}>+ Add status</button>
                    </div>
                    {(addSt||eSt) && (
                      <Crd xstyle={{marginBottom:16,borderTop:"3px solid "+C.orange}}>
                        <div style={{fontWeight:600,marginBottom:12}}>{eSt?"Edit":"New"} status</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
                          <div><Lbl text="Label"/><input value={stF.label} onChange={e=>setStF(p=>({...p,label:e.target.value}))}/></div>
                          <div><Lbl text="Text colour"/><div style={{display:"flex",gap:6,alignItems:"center"}}><input value={stF.color} onChange={e=>setStF(p=>({...p,color:e.target.value}))}/><div style={{width:28,height:28,borderRadius:6,background:stF.color,flexShrink:0}}/></div></div>
                          <div><Lbl text="Badge background"/><div style={{display:"flex",gap:6,alignItems:"center"}}><input value={stF.bg} onChange={e=>setStF(p=>({...p,bg:e.target.value}))}/><div style={{width:28,height:28,borderRadius:6,background:stF.bg,border:"1px solid "+C.border,flexShrink:0}}/></div></div>
                        </div>
                        <div style={{marginBottom:12}}><Lbl text="Preview"/><Bdg label={stF.label||"Status"} bg={stF.bg} fg={stF.color}/></div>
                        <div style={{display:"flex",gap:8}}>
                          <button className="btn btp sm" onClick={()=>{if(!stF.label)return;if(eSt){setStatuses(p=>p.map(x=>x.id===eSt?{...x,...stF}:x));setESt(null);}else{setStatuses(p=>[...p,{...stF,id:"s"+Date.now()}]);setAddSt(false);}setStF({label:"",color:"#1D6FAF",bg:"#EFF6FF"});}}>Save</button>
                          <button className="btn sm" onClick={()=>{setAddSt(false);setESt(null);}}>Cancel</button>
                        </div>
                      </Crd>
                    )}
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {statuses.map(s=>(
                        <Crd key={s.id} xstyle={{padding:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}><Bdg label={s.label} bg={s.bg} fg={s.color}/><div style={{fontSize:12,color:C.t3}}>{s.color}</div></div>
                            <div style={{display:"flex",gap:6}}>
                              <button className="btn sm" onClick={()=>{setESt(s.id);setStF({label:s.label,color:s.color,bg:s.bg});setAddSt(false);}}>Edit</button>
                              <button className="btn sm btd" onClick={()=>setStatuses(p=>p.filter(x=>x.id!==s.id))}>Remove</button>
                            </div>
                          </div>
                        </Crd>
                      ))}
                    </div>
                  </div>
                )}

                {/* Business Hours */}
                {stab==="bh" && (
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>Business Hours</div><div style={{fontSize:13,color:C.t2}}>Named schedules used by SLA policies.</div></div>
                      <button className="btn btp sm" onClick={()=>{setAddBh(true);setEBh(null);setBhF({name:"",start:"08:00",end:"17:30",days:["Mon","Tue","Wed","Thu","Fri"]});}}>+ Add schedule</button>
                    </div>
                    {(addBh||eBh) && (
                      <Crd xstyle={{marginBottom:16,borderTop:"3px solid "+C.orange}}>
                        <div style={{fontWeight:600,marginBottom:12}}>{eBh?"Edit":"New"} schedule</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                          <div><Lbl text="Name"/><input value={bhF.name} onChange={e=>setBhF(p=>({...p,name:e.target.value}))}/></div>
                          <div><Lbl text="Start"/><input type="time" value={bhF.start} onChange={e=>setBhF(p=>({...p,start:e.target.value}))}/></div>
                          <div><Lbl text="End"/><input type="time" value={bhF.end} onChange={e=>setBhF(p=>({...p,end:e.target.value}))}/></div>
                        </div>
                        <div style={{marginBottom:12}}><Lbl text="Days active"/><DayPicker days={bhF.days} onChange={days=>setBhF(p=>({...p,days}))}/></div>
                        <div style={{display:"flex",gap:8}}>
                          <button className="btn btp sm" onClick={()=>{if(!bhF.name)return;if(eBh){setBh(p=>p.map(x=>x.id===eBh?{...x,...bhF}:x));setEBh(null);}else{setBh(p=>[...p,{...bhF,id:"bh"+Date.now()}]);setAddBh(false);}setBhF({name:"",start:"08:00",end:"17:30",days:["Mon","Tue","Wed","Thu","Fri"]});}}>Save</button>
                          <button className="btn sm" onClick={()=>{setAddBh(false);setEBh(null);}}>Cancel</button>
                        </div>
                      </Crd>
                    )}
                    {bh.map(b=>(
                      <Crd key={b.id} xstyle={{marginBottom:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div><div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{b.name}</div><div style={{fontSize:13,color:C.t2}}>{b.start} \u2013 {b.end}</div><div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{b.days.map(d=><Bdg key={d} label={d} bg={C.neu} fg={C.t2}/>)}</div></div>
                          <div style={{display:"flex",gap:6}}>
                            <button className="btn sm" onClick={()=>{setEBh(b.id);setBhF({name:b.name,start:b.start,end:b.end,days:[...b.days]});setAddBh(false);}}>Edit</button>
                            <button className="btn sm btd" onClick={()=>setBh(p=>p.filter(x=>x.id!==b.id))}>Remove</button>
                          </div>
                        </div>
                      </Crd>
                    ))}
                  </div>
                )}

                {/* Auto-Assignment */}
                {stab==="assign" && (
                  <Crd>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Auto-Assignment Configuration</div>
                    <div style={{fontSize:13,color:C.t2,marginBottom:20}}>Runs every 5 minutes. Assigns oldest unassigned Open tickets to the eligible tech with fewest current tickets.</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid "+C.border,marginBottom:16}}>
                      <div><div style={{fontWeight:600,fontSize:13}}>Auto-assignment enabled</div><div style={{fontSize:12,color:C.t2}}>Automatically assign unassigned tickets on a 5-minute interval</div></div>
                      <button className="btn sm" style={{background:cfg.autoAssign?C.orange:"transparent",color:cfg.autoAssign?"#fff":C.t2,borderColor:cfg.autoAssign?C.orange:C.border,minWidth:46}} onClick={()=>setCfg(p=>({...p,autoAssign:!p.autoAssign}))}>{cfg.autoAssign?"On":"Off"}</button>
                    </div>
                    <div style={{marginBottom:20}}>
                      <Lbl text="Default max open + in-progress tickets per tech"/>
                      <div style={{display:"flex",gap:12,alignItems:"center"}}><input type="number" style={{width:80}} value={cfg.maxTix} min={1} max={50} onChange={e=>setCfg(p=>({...p,maxTix:+e.target.value}))}/><span style={{fontSize:13,color:C.t2}}>tickets before tech is considered at capacity</span></div>
                    </div>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Tech capacity overview</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:C.bg}}>{["Technician","Role","Open tickets","Capacity","Auto-assign"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:600,color:C.t2,fontSize:11,textTransform:"uppercase",letterSpacing:"0.4px"}}>{h}</th>)}</tr></thead>
                      <tbody>
                        {techs.map(t=>{
                          const open=tickets.filter(x=>x.asgn===t.name&&["Open","In Progress"].includes(x.st)).length;
                          const max=t.maxTix||cfg.maxTix; const pct=Math.round(open/max*100);
                          return(
                            <tr key={t.id} style={{borderTop:"1px solid "+C.border}}>
                              <td style={{padding:"10px 12px",fontWeight:500}}>{t.name}</td>
                              <td style={{padding:"10px 12px",color:C.t2,fontSize:12}}>{(roles.find(r=>r.id===t.roleId)||{}).name||"\u2014"}</td>
                              <td style={{padding:"10px 12px"}}><span style={{fontWeight:600,color:pct>=100?C.red:pct>=75?C.yel:C.grn}}>{open}</span></td>
                              <td style={{padding:"10px 12px",minWidth:120}}><div style={{display:"flex",alignItems:"center",gap:8}}><Bar pct={Math.min(100,pct)} color={pct>=100?C.red:pct>=75?C.yel:C.grn}/><span style={{fontSize:12,color:C.t3,flexShrink:0}}>{max}</span></div></td>
                              <td style={{padding:"10px 12px"}}><button className="btn sm" style={{background:t.autoAssign?C.grnBg:C.neu,color:t.autoAssign?C.grnT:C.t3,border:"none",fontSize:11}} onClick={()=>setTechs(p=>p.map(x=>x.id===t.id?{...x,autoAssign:!x.autoAssign}:x))}>{t.autoAssign?"Included":"Excluded"}</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {assignLog.length>0 && <div style={{marginTop:16}}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Recent assignment log</div>{assignLog.slice(0,10).map((l,i)=><div key={i} style={{fontSize:12,color:C.t2,padding:"4px 0",borderBottom:"1px solid "+C.border}}><span style={{color:C.t3,marginRight:8}}>{l.ts}</span>{l.msg}</div>)}</div>}
                    <div style={{marginTop:16}}><button className="btn btp sm" onClick={runAutoAssign}>Run auto-assign now</button></div>
                  </Crd>
                )}

                {/* Roles */}
                {stab==="roles" && (
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>Roles</div><div style={{fontSize:13,color:C.t2}}>Roles define skill categories. Technicians inherit their role&apos;s categories by default.</div></div>
                      <button className="btn btp sm" onClick={()=>{setAddRole(true);setERole(null);setRoleF({name:"",level:"L1",cats:[]});}}>+ Add role</button>
                    </div>
                    {(addRole||eRole) && (
                      <Crd xstyle={{marginBottom:16,borderTop:"3px solid "+C.orange}}>
                        <div style={{fontWeight:600,marginBottom:12}}>{eRole?"Edit":"New"} role</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                          <div><Lbl text="Role name"/><input value={roleF.name} onChange={e=>setRoleF(p=>({...p,name:e.target.value}))}/></div>
                          <div><Lbl text="Level"/><select value={roleF.level} onChange={e=>setRoleF(p=>({...p,level:e.target.value}))}><option value="L1">L1 \u2014 First line</option><option value="L2">L2 \u2014 Second line</option><option value="Admin">Admin</option></select></div>
                        </div>
                        <div style={{marginBottom:12}}><Lbl text="Skill categories"/><CatPicker selected={roleF.cats} onChange={cats=>setRoleF(p=>({...p,cats}))}/></div>
                        <div style={{display:"flex",gap:8}}>
                          <button className="btn btp sm" onClick={()=>{if(!roleF.name)return;if(eRole){setRoles(p=>p.map(x=>x.id===eRole?{...x,...roleF}:x));setERole(null);}else{setRoles(p=>[...p,{...roleF,id:"r"+Date.now()}]);setAddRole(false);}setRoleF({name:"",level:"L1",cats:[]});}}>Save</button>
                          <button className="btn sm" onClick={()=>{setAddRole(false);setERole(null);}}>Cancel</button>
                        </div>
                      </Crd>
                    )}
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {roles.map(r=>{
                        const tc=techs.filter(t=>t.roleId===r.id).length;
                        return(
                          <Crd key={r.id}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                              <div style={{flex:1}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><div style={{fontWeight:700,fontSize:14}}>{r.name}</div><Bdg label={r.level} bg={lvlBg(r.level)} fg={lvlFg(r.level)}/><span style={{fontSize:12,color:C.t3}}>{tc} tech{tc!==1?"s":""}</span></div>
                                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{(r.cats||[]).map(c=><span key={c} className="tag">{c}</span>)}</div>
                              </div>
                              <div style={{display:"flex",gap:6,marginLeft:12}}>
                                <button className="btn sm" onClick={()=>{setERole(r.id);setRoleF({name:r.name,level:r.level,cats:[...r.cats]});setAddRole(false);}}>Edit</button>
                                <button className="btn sm btd" onClick={()=>{if(techs.some(t=>t.roleId===r.id)){alert("Reassign techs from this role first.");return;}setRoles(p=>p.filter(x=>x.id!==r.id));}}>Remove</button>
                              </div>
                            </div>
                          </Crd>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Technicians */}
                {stab==="techs" && (
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>Technicians</div><div style={{fontSize:13,color:C.t2}}>Categories inherited from role. Override per-tech if needed.</div></div>
                      <button className="btn btp sm" onClick={()=>{setAddTech(true);setETech(null);setTechF({name:"",roleId:roles[0]?roles[0].id:"r1",email:"",catsOverride:null,maxTix:cfg.maxTix,autoAssign:true});}}>+ Add technician</button>
                    </div>
                    {(addTech||eTech) && (() => {
                      const selRole = roles.find(r=>r.id===techF.roleId)||{cats:[],name:"\u2014",level:"L1"};
                      const effCats = techF.catsOverride||selRole.cats||[];
                      return (
                        <Crd xstyle={{marginBottom:16,borderTop:"3px solid "+C.orange}}>
                          <div style={{fontWeight:600,marginBottom:12}}>{eTech?"Edit":"New"} technician</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                            <div><Lbl text="Name"/><input value={techF.name} onChange={e=>setTechF(p=>({...p,name:e.target.value}))}/></div>
                            <div><Lbl text="Email"/><input value={techF.email} onChange={e=>setTechF(p=>({...p,email:e.target.value}))}/></div>
                            <div style={{gridColumn:"1/-1"}}><Lbl text="Role"/><select value={techF.roleId} onChange={e=>setTechF(p=>({...p,roleId:e.target.value,catsOverride:null}))}>{roles.map(r=><option key={r.id} value={r.id}>{r.name} ({r.level})</option>)}</select></div>
                          </div>
                          <div style={{marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <Lbl text="Skill categories"/>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              {techF.catsOverride ? <span style={{fontSize:12,color:C.yelT,background:C.yelBg,padding:"2px 8px",borderRadius:12}}>Overridden</span> : <span style={{fontSize:12,color:C.grnT,background:C.grnBg,padding:"2px 8px",borderRadius:12}}>Inherited from role</span>}
                              {techF.catsOverride && <button className="btn sm" style={{fontSize:11,padding:"2px 8px"}} onClick={()=>setTechF(p=>({...p,catsOverride:null}))}>Reset to role</button>}
                            </div>
                          </div>
                          <CatPicker selected={effCats} onChange={cats=>{const rc=selRole.cats||[];const same=cats.length===rc.length&&cats.every(c=>rc.includes(c));setTechF(p=>({...p,catsOverride:same?null:cats}));}}/>
                          <div style={{display:"flex",gap:8,marginTop:16}}>
                            <button className="btn btp sm" onClick={()=>{if(!techF.name)return;if(eTech){setTechs(p=>p.map(x=>x.id===eTech?{...x,...techF}:x));setETech(null);}else{setTechs(p=>[...p,{...techF,id:"t"+Date.now()}]);setAddTech(false);}setTechF({name:"",roleId:roles[0]?roles[0].id:"r1",email:"",catsOverride:null,maxTix:cfg.maxTix,autoAssign:true});}}>Save</button>
                            <button className="btn sm" onClick={()=>{setAddTech(false);setETech(null);}}>Cancel</button>
                          </div>
                        </Crd>
                      );
                    })()}
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {techs.map(t=>{
                        const role=techRole(t); const cats=techCats(t); const ov=!!t.catsOverride;
                        const open=tickets.filter(x=>x.asgn===t.name&&["Open","In Progress"].includes(x.st)).length;
                        return(
                          <Crd key={t.id}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                                <div style={{width:38,height:38,borderRadius:"50%",background:C.orange,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>{t.name.split(" ").map(n=>n[0]).join("")}</div>
                                <div>
                                  <div style={{fontWeight:700,fontSize:14,marginBottom:3,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                    {t.name}
                                    <Bdg label={role.name} bg={lvlBg(role.level)} fg={lvlFg(role.level)}/>
                                    <Bdg label={role.level} bg={C.neu} fg={C.t2}/>
                                    <Bdg label={open+" tickets"} bg={open>=(t.maxTix||cfg.maxTix)?C.redBg:C.neu} fg={open>=(t.maxTix||cfg.maxTix)?C.redT:C.t2}/>
                                  </div>
                                  <div style={{fontSize:12,color:C.t2,marginBottom:8}}>{t.email}</div>
                                  <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                                    {cats.map(c=><span key={c} className="tag">{c}</span>)}
                                    {ov && <span style={{fontSize:11,color:C.yelT,background:C.yelBg,padding:"2px 8px",borderRadius:12,marginLeft:4}}>overridden</span>}
                                  </div>
                                </div>
                              </div>
                              <div style={{display:"flex",gap:6}}>
                                <button className="btn sm" onClick={()=>{setETech(t.id);setTechF({name:t.name,roleId:t.roleId,email:t.email,catsOverride:t.catsOverride?[...t.catsOverride]:null,maxTix:t.maxTix||cfg.maxTix,autoAssign:t.autoAssign});setAddTech(false);}}>Edit</button>
                                <button className="btn sm btd" onClick={()=>setTechs(p=>p.filter(x=>x.id!==t.id))}>Remove</button>
                              </div>
                            </div>
                          </Crd>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
