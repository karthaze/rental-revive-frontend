import{ensureAuth as k,getAuthedConvex as C,api as $}from"./backend-CuPB6VC9.js";import{m as y}from"./onboard-ClwccWbq.js";import"./places-D2Zs4JB8.js";const i=e=>String(e??"").replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t]),A={phone:{label:"Phone probe",icon:'<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.5 2.8.7a2 2 0 0 1 1.7 2z"/></svg>'},email:{label:"Email inquiry",icon:'<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>'},form:{label:"Website form",icon:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h6"/><path d="M7 16h4"/></svg>'}},w={business:"business hours",lunch:"lunch window",after_hours:"after close",alt_day:"a different day"},x=e=>{if(e<6e4)return`${Math.max(1,Math.round(e/1e3))} seconds`;if(e<36e5)return`${Math.round(e/6e4)} minutes`;const t=e/36e5;return t>=48?`${Math.round(t/24)} days`:`${Math.round(t*10)/10} hours`},g=(e,t)=>{try{return new Intl.DateTimeFormat("en-US",{timeZone:t,weekday:"short",hour:"numeric",minute:"2-digit"}).format(e)}catch{return new Date(e).toLocaleString()}};function M(e,t,n){const s=e.metrics||{};if(e.outcome===null){if(e.dispatchedAt===null)return e.scheduledFor>n?{cls:"wait",text:`Scheduled · ${g(e.scheduledFor,t)}${e.window?` · ${w[e.window]}`:""}`}:{cls:"wait",text:"Queued…"};if(e.channel==="phone"){if(s.answeredAt)return{cls:"live",text:"Connected, on the line now"};if(s.ringStartedAt){const a=Math.max(1,Math.round((n-s.ringStartedAt)/6e3));return{cls:"live",text:`Ringing… about ${a} ring${a>1?"s":""}`}}return{cls:"live",text:"Dialling…"}}return{cls:"wait",text:s.deliveryStatus==="delivered"||s.submissionSucceeded?"Delivered · awaiting a reply, the clock is running":"Sent · confirming delivery"}}switch(e.outcome){case"responded":{if(e.channel==="phone"){const r=s.estimatedRings;return{cls:"ok",text:`Answered${r?` in about ${r} ring${r>1?"s":""}`:""}`}}const a=typeof s.msToFirstReply=="number"?` in ${x(s.msToFirstReply)}`:"",o=[s.containedPrice?"included a price":null,s.containedNextStep?"asked a next step":null].filter(Boolean).join(", ");return{cls:"ok",text:`Human reply${a}${o?` · ${o}`:""}`}}case"no_response":return e.channel==="phone"?s.answeredBy==="voicemail"?{cls:"gap",text:`Voicemail${s.voicemailBoxFull?", box full":""}, audit message left`}:{cls:"gap",text:"Rang out, nobody answered"}:{cls:"gap",text:"Delivered, no reply inside the window"};case"undeliverable_theirs":return e.channel==="phone"?{cls:"gap",text:"Number invalid or disconnected"}:e.channel==="email"?{cls:"gap",text:"Published address bounced"}:{cls:"gap",text:s.submissionSucceeded===!1&&s.fieldsFilled?"Form broke, it ate the submission":"No working inquiry form found"};case"blocked_by_target":return{cls:"gap",text:"Blocked by a captcha on your form, real customers hit it too"};case"undeliverable_ours":return{cls:"ours",text:"We couldn’t get through. Our side, not yours. Not counted against you."};default:return{cls:"wait",text:"Cancelled"}}}function T(e,t,n){const s=A[e.channel],a=M(e,t,n),o=e.dispatchedAt??e.scheduledFor;return`
    <div class="pd-row ${a.cls}">
      <span class="pd-ic">${s.icon}</span>
      <span class="pd-txt">
        <b>${s.label}${e.channel==="phone"?` · attempt ${e.sequence}`:""}</b>
        <small>${a.text}</small>
      </span>
      <span class="pd-when">${g(o,t)}</span>
    </div>`}function S(e,t,n){const s=e.find(o=>o.channel==="phone"&&o.outcome===null&&o.dispatchedAt!==null),a=e.find(o=>o.channel==="phone"&&o.outcome===null&&o.dispatchedAt===null&&o.scheduledFor>n);if(!s&&!a)return"";if(s){const o=s.metrics||{},r=o.answeredAt?"CONNECTED":o.ringStartedAt?"RINGING":"DIALLING",l=o.ringStartedAt&&!o.answeredAt?Math.max(1,Math.round((n-o.ringStartedAt)/6e3)):null;return`
      <div class="pd-live" data-phase="${r.toLowerCase()}">
        <span class="pd-pulse"></span>
        <div class="pd-live-txt">
          <b>${r}${l?` · ~${l} RING${l>1?"S":""}`:""}</b>
          <small>Calling your counter line now. Watch what your customers get.</small>
        </div>
      </div>`}return`
    <div class="pd-live" data-phase="scheduled">
      <span class="pd-pulse quiet"></span>
      <div class="pd-live-txt">
        <b>NEXT CALL · ${i(g(a.scheduledFor,t).toUpperCase())}</b>
        <small>${i(w[a.window]||"scheduled")} · attempts are spread across the day on purpose.</small>
      </div>
    </div>`}function N(e){const t=e.verdict;if(!t)return"";const n=t.counts,s=t.measured&&t.measured.substitutions||[],a=[`${n.dispatched} ${n.dispatched===1?"inquiry":"inquiries"} went out.`,n.reachedHuman?`${n.reachedHuman} reached a human.`:"None reached a human.",n.noResponse?`${n.noResponse} never got a response.`:null,n.unreachableOurs?`${n.unreachableOurs} couldn’t be delivered by our side, not counted.`:null,t.fastestResponseMs!==null?`Fastest response: ${x(t.fastestResponseMs)}.`:null].filter(Boolean).join(" ");let o="";if(t.repriced&&s.length){const r=t.repriced.monthlyCents/100,l=e.estimate?e.estimate.monthlyCents/100:null;o=`
      <div class="pd-reprice">
        <div class="pd-rp-figs">
          ${l!==null?`
          <div class="pd-rp-col">
            <span class="lab">You estimated</span>
            <b>${y(l)}<i>/mo</i></b>
            <small>from the bands you tapped</small>
          </div>
          <span class="pd-rp-arrow">→</span>`:""}
          <div class="pd-rp-col measured">
            <span class="lab">Measured</span>
            <b>${y(r)}<i>/mo</i></b>
            <small>same arithmetic, observed inputs</small>
          </div>
        </div>
        <div class="pd-subs">
          ${s.map(d=>`
            <div class="pd-sub">
              <span class="pd-sub-key">${i(d.key==="missedCalls"?"Missed calls":d.key==="quoteSpeed"?"Quote speed":"After hours")}</span>
              <span class="pd-sub-vals"><em>${i(d.from??"–")}</em> → <b>${i(d.to)}</b></span>
            </div>`).join("")}
        </div>
      </div>`}return`
    <div class="pd-verdict">
      <span class="lab">The verdict: counts and times, not a grade</span>
      <p class="pd-counts">${i(a)}</p>
      ${o}
      ${t.partial?'<p class="pd-note">Some channels couldn’t be measured this run. This verdict covers what actually landed, and claims nothing else.</p>':""}
      ${t.biasNote?'<p class="pd-note">The first call told your counter an audit was running. The email and form clocks started before it, so alerting could only have made these numbers better, never worse.</p>':""}
    </div>`}function L(e){const t=e.competitorHours;if(!t||!t.measured)return"";const n=t.openWhileYouClosedCount===null?`${t.swept} yards in your ${t.radiusMi} mi radius publish their hours. Yours aren’t published, so there’s nothing to compare against.`:t.openWhileYouClosedCount===0?`${t.swept} yards inside ${t.radiusMi} mi. None of the ${t.measured} publishing hours covers time you don’t. Your schedule holds the line.`:`${t.swept} yards inside ${t.radiusMi} mi. ${t.openWhileYouClosedCount} of them ${t.openWhileYouClosedCount===1?"is":"are"} reachable at hours you’re closed. That’s where the missed call goes next.`;return`
    <div class="pd-hours">
      <span class="lab">Where the next call goes: published hours, nobody contacted</span>
      <p class="pd-counts">${i(n)}</p>
      ${t.competitors.slice(0,3).map(s=>`
        <div class="pd-sub">
          <span class="pd-sub-key">${i(s.name)}${s.national?' <em class="pd-nat">national</em>':""}</span>
          <span class="pd-sub-vals">${s.weeklyHours}h/wk open${s.hoursWhileYouClosed!==null&&s.hoursWhileYouClosed>0?` · <b>${s.hoursWhileYouClosed}h while you’re closed</b>`:""}</span>
        </div>`).join("")}
      ${t.yardWeeklyHours!==null?`<p class="pd-note">Your published counter hours: ${t.yardWeeklyHours}h a week. ${t.unmeasured?`${t.unmeasured} nearby yard${t.unmeasured>1?"s publish":" publishes"} no hours, not counted either way.`:""}</p>`:""}
    </div>`}function _(e,t={}){var r;const n=t.now??Date.now(),s=e.run.timezone,a=document.createElement("div");a.className="probe-dash";const o=e.run.status==="active"?e.attempts.some(l=>l.outcome===null&&l.dispatchedAt!==null&&l.channel==="phone")?"LIVE":"IN FLIGHT":e.run.status==="resolved"?"VERDICT":e.run.status==="killed"?"STOPPED":"EXPIRED";return a.innerHTML=`
    <div class="pd-head">
      <span class="pd-title">
        <b>Proof load test</b>
        <small>${i(e.yardName||"your yard")} · all times ${i(s)}</small>
      </span>
      <span class="pd-status s-${o.toLowerCase().replace(" ","")}">${o}</span>
      ${e.run.status==="active"?'<button class="pd-kill" type="button" data-kill>Stop everything</button>':""}
    </div>
    ${e.run.status==="active"?S(e.attempts,s,n):""}
    ${e.run.status==="killed"?'<p class="pd-note">You pulled the switch. Every scheduled probe stood down. What landed before that is below; nothing else will fire.</p>':""}
    ${N(e)}
    ${e.verdict?L(e):""}
    <div class="pd-log">
      <span class="lab">The attempt log: every attempt, including the ones that connected</span>
      ${e.attempts.map(l=>T(l,s,n)).join("")}
    </div>
    <div class="pd-artifacts" data-artifacts></div>`,t.onKill&&((r=a.querySelector("[data-kill]"))==null||r.addEventListener("click",t.onKill)),a}function E(e){if(!e.length)return null;const t=document.createElement("div");return t.className="pd-proofs",t.innerHTML=`
    <span class="lab">Evidence</span>
    ${e.map(n=>n.expired?`<span class="pd-proof expired">${i(h(n.kind))}, expired per the retention window you were shown</span>`:n.contentType.startsWith("audio/")?`<figure class="pd-proof"><figcaption>${i(h(n.kind))}</figcaption><audio controls preload="none" src="${i(n.url)}"></audio></figure>`:n.contentType.startsWith("image/")?`<figure class="pd-proof"><figcaption>${i(h(n.kind))}</figcaption><img loading="lazy" src="${i(n.url)}" alt="${i(h(n.kind))}"></figure>`:`<a class="pd-proof" href="${i(n.url)}" target="_blank" rel="noopener">${i(h(n.kind))}</a>`).join("")}`,t}const h=e=>({call_recording:"Call recording",voicemail_recording:"The voicemail we left in your box",call_transcript:"Call transcript",email_body:"The inquiry email",form_screenshot_before:"Your form, filled in",form_screenshot_after:"Your form, after submitting"})[e]||e;async function R(e,t){const s=await k()?await C():null,a=document.createElement("div");if(a.className="probe-dash-shell",e.appendChild(a),!s)return a.innerHTML=`<div class="probe-dash"><p class="pd-note">
      The probe backend isn’t reachable from this page. Your run is safe:
      it lives server-side, but this view can’t connect. Try again from
      the link in your report email.</p></div>`,()=>a.remove();let o=null,r=null;const l=new Map,d=()=>{var u;if(!o)return;const c=_(o,{now:Date.now(),onKill:async()=>{confirm("Stop the test? Every scheduled probe stands down immediately.")&&await s.mutation($.runs.kill.killRun,{runId:t})}}),m=c.querySelector("[data-artifacts]");for(const p of o.attempts){if(!((u=p.artifactIds)!=null&&u.length))continue;const f=l.get(p.id);if(f!=null&&f.length){const v=E(f);v&&m.appendChild(v)}else l.has(p.id)||(l.set(p.id,[]),s.query($.runs.queries.attemptArtifacts,{attemptId:p.id}).then(v=>{l.set(p.id,v||[]),d()}))}a.replaceChildren(c)},b=s.onUpdate($.runs.queries.runState,{runId:t},c=>{if(o=c,!c){a.innerHTML=`<div class="probe-dash"><p class="pd-note">
        This run isn’t visible from this account. Runs are only shown to
        the owner who authorised them.</p></div>`;return}d();const m=c.run.status==="active"&&c.attempts.some(u=>u.channel==="phone"&&u.outcome===null&&u.dispatchedAt!==null);m&&!r&&(r=setInterval(d,1e3)),!m&&r&&(clearInterval(r),r=null)});return()=>{b==null||b(),r&&clearInterval(r),a.remove()}}export{R as mountDashboard};
