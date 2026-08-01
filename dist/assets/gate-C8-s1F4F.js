import{e as v,g as w,a as b}from"./backend-DfcKIe5O.js";import"./onboard-BS00hYcv.js";import"./places-D2Zs4JB8.js";const S="proof-gate-2026-07-30",k=30,A=o=>String(o??"").replace(/[&<>"]/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[a]);function T(o,a){const{state:u}=a,d=u.place||{},s=d.phone||"";if(!s)return null;const i=u.inquiryEmail||null,r=d.website||null,h=1+(i?1:0)+(r?1:0),e=document.createElement("div");e.className="proof-gate",e.id="proofGate",e.innerHTML=`
    <span class="lab panel-lab">The part you can’t argue with</span>
    <h3>Everything above is an estimate. Estimates are arguable.</h3>
    <p class="pg-lead">Your crane doesn’t get certified on an estimate — it gets proof-loaded.
      Your counter has never been tested once. Authorise it, and the first call goes out
      while you watch.</p>

    <div class="pg-disclosure">
      <span class="lab">What you’d be authorising — all of it, plainly</span>
      <ul>
        <li><b>${h} ${h>1?"inquiries":"inquiry"} to your own business, nobody else’s:</b>
          your counter line ${A(s)}${i?", your inquiry email":""}${r?", and the form on your website":""}.</li>
        <li><b>The phone:</b> up to 4 short calls over 48 hours — business hours, lunch, and after close,
          never before 8am or after 8pm your time. Calls are recorded, and whoever answers is told
          immediately it’s an authorised booking-response check, not a real rental.</li>
        <li><b>The written inquiries</b> arrive from <b>Full Circle Contractors</b> — a real, registered
          company we operate for exactly this — asking availability and rates for machines you already
          rent. No invented job, no fake delivery date, nothing a dispatcher could reserve iron against.
          Your team gets a debrief note inside 48 hours saying it was part of this check.</li>
        <li><b>Your staff aren’t warned.</b> That’s the point — but the report names <b>hours, not
          people</b>. No names, no staff audio, ever. We’re testing the system, not the people,
          and that isn’t negotiable in either direction.</li>
        <li><b>Recordings are deleted after ${k} days</b>, automatically. A kill switch
          on the dashboard stops everything mid-run, instantly.</li>
      </ul>
    </div>

    <button class="btn-commit pg-cta" type="button" data-activate>Proof-test my counter →</button>
    <p class="pg-fine">Sign in to authorise — the consent is yours to give and yours to revoke.
      If your counter is airtight, the verdict will say exactly that.</p>
    <p class="pg-status" role="status" aria-live="polite" data-status hidden></p>`;const n=e.querySelector("[data-status]"),l=e.querySelector("[data-activate]");return l.addEventListener("click",async()=>{var p;l.disabled=!0,n.hidden=!1,n.textContent="Waiting on sign-in…";try{if(!await v())throw new Error("Sign-in is not available right now.");n.textContent="Authorising and dialling…";const g=await w(),{scanId:m}=await g.mutation(b.scans.saveScan,a.buildScanPayload()),{runId:c,firstCallAt:f}=await g.mutation(b.runs.activate.activate,{scanId:m,targets:{phone:s,email:i,formUrl:r},disclosureVersion:S,userAgent:navigator.userAgent});try{localStorage.setItem("rr_probe_run",c)}catch{}const y=new URL(location.href);y.searchParams.set("run",c),history.replaceState(null,"",y),a.onActivated(c,f)}catch(t){l.disabled=!1,n.textContent=(p=t==null?void 0:t.message)!=null&&p.includes("timezone")?"We couldn’t pin your yard’s timezone, so the call windows can’t be set safely. This one needs a hand — reply to your report email.":`Couldn’t start the test: ${(t==null?void 0:t.message)||"unknown error"}. Nothing was dispatched.`}}),o.appendChild(e),requestAnimationFrame(()=>e.classList.add("in")),e}export{S as DISCLOSURE_VERSION,T as renderProofGate};
