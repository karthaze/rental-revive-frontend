/* ============================================================
   THE EIGHT YARDS
   ------------------------------------------------------------
   Heavy equipment rental is not one market. A crane company
   quoting an operated lift and a tool yard renting a plate
   compactor to a homeowner have almost nothing in common:
   different tickets, different intake questions, different
   reasons a rental walks out the door.

   Every segment below carries its own vocabulary, fleet list,
   ticket bands and leak framing. The diagnostic asks the same
   *shape* of question to all eight, but never the same words
   and never the same math. That is what makes the reveal land:
   the owner hears his own yard described back to him.
   ============================================================ */

/* Icons are inline stroke SVG paths, drawn in the same 24x24
   line style the landing page already uses. */
const ico = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

export const SEGMENTS = [
  {
    id: 'cranes',
    name: 'Cranes & Lifting',
    short: 'Cranes',
    blurb: 'Mobile cranes, boom trucks, crawlers, carry decks, rigging',
    icon: ico('<path d="M3 21h18"/><path d="M6 21V4h2"/><path d="M6 4h13l-2.5 4H6"/><path d="M16.5 8v3"/><path d="M15 11h3l-1.5 3.5z"/><path d="M8 21v-4h4v4"/>'),
    unit: 'crane', units: 'cranes', job: 'lift', jobs: 'lifts',
    customer: 'contractor', customers: 'contractors',
    /* Operated rental. The quote is an engineering conversation, so the
       intake is long and the response lag is where the job dies. */
    fleet: [
      'Mobile / all-terrain cranes', 'Boom trucks', 'Carry deck & industrial',
      'Crawler cranes', 'Tower cranes', 'Rigging & lift gear',
      'Operated & maintained crews', 'Machinery moving',
    ],
    ticketBands: [
      { label: 'Under $2,000', mid: 1400 },
      { label: '$2,000 – $5,000', mid: 3300 },
      { label: '$5,000 – $12,000', mid: 8000 },
      { label: '$12,000+', mid: 18000 },
    ],
    defaultClose: 30,
    intake: [
      'Load weight', 'Pick & set height', 'Lift radius', 'Site access',
      'Ground conditions', 'Rigging & signal person', 'Permits & traffic control',
    ],
    signals: [
      'Structural steel erection', 'HVAC rooftop units', 'Precast placement',
      'Plant shutdowns & turnarounds', 'Cell tower work', 'Bridge & utility work',
    ],
    hook: 'Operated lifts. Highest ticket in the business, and the slowest quote path — which is exactly why a day of silence costs you the whole job.',
    frames: {
      calls: 'A contractor with a Tuesday lift does not leave a second voicemail. He calls the next crane on the list.',
      quotes: 'Nobody rents a crane on price alone. They rent it from whoever answered while the schedule was still soft.',
      pile: 'A quoted lift that went quiet is not a dead lead. It is a job someone else is doing next month.',
      quiet: 'Steel erectors and mechanical contractors rent on repeat. When one stops calling, nobody notices for two quarters.',
      outbound: 'Every rooftop unit, every steel package, every precast pour in your radius is a lift. Somebody is quoting them.',
    },
  },

  {
    id: 'earthmoving',
    name: 'Earthmoving & Excavation',
    short: 'Earthmoving',
    blurb: 'Excavators, dozers, loaders, backhoes, graders, scrapers',
    icon: ico('<path d="M2 20h20"/><path d="M4 20v-3h6v3"/><circle cx="6" cy="20" r="1.6"/><circle cx="11" cy="20" r="1.6"/><path d="M10 17V9h4"/><path d="M14 9l5 4"/><path d="M19 13l-1 3h5l-1-3z"/>'),
    unit: 'machine', units: 'machines', job: 'rental', jobs: 'rentals',
    customer: 'contractor', customers: 'contractors',
    /* Dry rental on weekly/monthly terms. Volume is moderate, ticket is
       solid, and transport logistics make the first answer decisive. */
    fleet: [
      'Excavators (standard)', 'Mini & compact excavators', 'Dozers',
      'Wheel loaders', 'Backhoes', 'Motor graders',
      'Articulated haulers & scrapers', 'Attachments & buckets',
    ],
    ticketBands: [
      { label: 'Under $2,000', mid: 1300 },
      { label: '$2,000 – $5,000', mid: 3300 },
      { label: '$5,000 – $12,000', mid: 7800 },
      { label: '$12,000+', mid: 16000 },
    ],
    defaultClose: 35,
    intake: [
      'Machine class & size', 'Dig depth / reach', 'Rental duration',
      'Delivery address & access', 'Attachments needed', 'Operator or dry',
      'Insurance & damage waiver',
    ],
    signals: [
      'Site development & grading', 'Underground utility work', 'Subdivision starts',
      'Pond & drainage work', 'Demolition permits', 'Highway & DOT lettings',
    ],
    hook: 'Dry rental on weekly and monthly terms. The dirt moves on schedule, so the quote that lands first usually wins the whole duration.',
    frames: {
      calls: 'He needs a machine Monday. If your phone rings out Friday afternoon, the machine he rents Monday is not yours.',
      quotes: 'Dirt work is scheduled in weeks, not months. A quote that takes a day to come back arrives after the decision.',
      pile: 'Every quote you sent that never came back was a machine that could have been earning instead of sitting.',
      quiet: 'Excavation outfits rent seasonally. A GC who skipped a season rarely comes back on his own.',
      outbound: 'Grading permits and utility lettings in your radius tell you who needs iron before they start calling around.',
    },
  },

  {
    id: 'aerial',
    name: 'Aerial & Access',
    short: 'Aerial',
    blurb: 'Boom lifts, scissor lifts, telehandlers, mast & personnel lifts',
    icon: ico('<path d="M2 20h20"/><path d="M5 20v-2h6v2"/><circle cx="6.5" cy="20" r="1.4"/><circle cx="10" cy="20" r="1.4"/><path d="M8 18V8"/><path d="M8 8h5V4h5"/><path d="M16 4v3"/><rect x="15" y="2" width="5" height="3" rx="0.6"/>'),
    unit: 'unit', units: 'units', job: 'rental', jobs: 'rentals',
    customer: 'contractor', customers: 'contractors',
    /* High volume, lower ticket, long site durations. The leak here is
       throughput: a lot of small conversations, each easy to drop. */
    fleet: [
      'Scissor lifts (electric)', 'Rough terrain scissors', 'Articulating boom lifts',
      'Telescopic boom lifts', 'Telehandlers', 'Mast & personnel lifts',
      'Towable boom lifts', 'Push-around & vertical lifts',
    ],
    ticketBands: [
      { label: 'Under $750', mid: 520 },
      { label: '$750 – $2,000', mid: 1300 },
      { label: '$2,000 – $5,000', mid: 3200 },
      { label: '$5,000+', mid: 8000 },
    ],
    defaultClose: 45,
    intake: [
      'Working height', 'Indoor or outdoor', 'Surface & terrain',
      'Power type (electric / diesel)', 'Rental duration', 'Delivery window',
      'Familiarization & training',
    ],
    signals: [
      'Interior fit-out & drywall', 'Warehouse & distribution builds', 'Electrical & MEP rough-in',
      'Facade & glazing work', 'Signage & lighting', 'Data centre construction',
    ],
    hook: 'High volume, long durations, small tickets. One dropped call barely stings — but you drop dozens a month, and that adds up faster than any other segment.',
    frames: {
      calls: 'Access rentals are a numbers game. Every unanswered call is a whole month of utilization walking to the branch down the road.',
      quotes: 'A scissor lift is a commodity. The only real differentiator you have left is who answers first.',
      pile: 'Small quotes go stale fastest because nobody thinks they are worth chasing. There are more of them than anything else in your pile.',
      quiet: 'Fit-out contractors move site to site. When a regular goes quiet it usually means he found a yard closer to the new job.',
      outbound: 'Every interior fit-out and warehouse build in your radius needs weeks of lift time. That is scheduled work you can quote early.',
    },
  },

  {
    id: 'compact',
    name: 'Compact & Small Machinery',
    short: 'Compact',
    blurb: 'Skid steers, mini excavators, trenchers, compaction, tools',
    icon: ico('<path d="M2 20h20"/><circle cx="7" cy="18.5" r="2.2"/><circle cx="14" cy="18.5" r="2.2"/><path d="M5 16v-4h6l2 4"/><path d="M11 12V9h3l3 4v3"/><path d="M17 13h4"/>'),
    unit: 'unit', units: 'units', job: 'rental', jobs: 'rentals',
    customer: 'customer', customers: 'customers',
    /* Contractor + homeowner mix. Day rates, walk-ins, weekend spikes.
       The phone IS the counter here. */
    fleet: [
      'Skid steers & track loaders', 'Mini excavators', 'Trenchers',
      'Compaction & plate tampers', 'Augers & attachments', 'Chippers & stump grinders',
      'Concrete & masonry tools', 'General tool rental',
    ],
    ticketBands: [
      { label: 'Under $500', mid: 340 },
      { label: '$500 – $1,500', mid: 950 },
      { label: '$1,500 – $4,000', mid: 2500 },
      { label: '$4,000+', mid: 6000 },
    ],
    defaultClose: 50,
    intake: [
      'What the job actually is', 'Day / week / month', 'Pickup or delivery',
      'Attachments needed', 'Trailer & towing capability', 'Operator experience',
      'Deposit & ID',
    ],
    signals: [
      'Residential remodels', 'Landscape & hardscape work', 'Fence & deck permits',
      'Small site prep', 'Storm & cleanup work', 'Municipal small works',
    ],
    hook: 'Day rates, walk-ins and weekend spikes. Your phone is your counter — and a Saturday morning that rings out is a rental you never even hear about.',
    frames: {
      calls: 'Half your customers are calling from a truck with a trailer already hitched. He is renting from whoever picks up.',
      quotes: 'At this ticket nobody waits for a written quote. They want a price on the phone or they hang up and dial the next yard.',
      pile: 'Small-ticket quotes never get chased because each one looks too small to bother with. Together they are your biggest pile.',
      quiet: 'Landscapers and remodelers rent constantly and switch yards silently. A quiet regular is a lost regular.',
      outbound: 'Deck, fence and remodel permits pulled in your zip codes are all compact rentals waiting to happen.',
    },
  },

  {
    id: 'material',
    name: 'Material Handling & Forklifts',
    short: 'Forklifts',
    blurb: 'Industrial & rough terrain forklifts, warehouse, telehandlers',
    icon: ico('<path d="M2 20h20"/><circle cx="6" cy="18.6" r="2"/><circle cx="12.5" cy="18.6" r="2"/><path d="M4 16.6V9h5v7.6"/><path d="M9 11h3"/><path d="M15 16.6V5"/><path d="M15 16.6h5"/><path d="M15 9h4"/>'),
    unit: 'truck', units: 'trucks', job: 'rental', jobs: 'rentals',
    customer: 'customer', customers: 'customers',
    /* Industrial accounts, long-term contracts, service attached.
       Losing an account here is losing years of revenue, not one rental. */
    fleet: [
      'Warehouse forklifts (electric)', 'IC / propane forklifts', 'Rough terrain forklifts',
      'Telehandlers', 'Reach trucks & order pickers', 'Pallet jacks & walkies',
      'Industrial sweepers & scrubbers', 'Yard trucks & spotters',
    ],
    ticketBands: [
      { label: 'Under $1,000', mid: 700 },
      { label: '$1,000 – $3,000', mid: 1900 },
      { label: '$3,000 – $8,000', mid: 5200 },
      { label: '$8,000+', mid: 13000 },
    ],
    defaultClose: 40,
    intake: [
      'Capacity & lift height', 'Fuel type & indoor use', 'Mast & attachment config',
      'Term (short vs long)', 'Site & dock conditions', 'Service & PM coverage',
      'Operator certification',
    ],
    signals: [
      'Warehouse & 3PL expansion', 'Manufacturing line changes', 'Seasonal peak staffing',
      'Plant maintenance shutdowns', 'Distribution centre openings', 'Cold storage builds',
    ],
    hook: 'Industrial accounts on long terms with service attached. One lost account here is not one rental — it is a contract you were going to renew for years.',
    frames: {
      calls: 'A plant with a truck down calls three suppliers in ten minutes. Position two never gets the order.',
      quotes: 'Long-term forklift deals stall in procurement. The supplier who follows up is the one who gets signed.',
      pile: 'Every unclosed forklift quote in your pile is a multi-month contract you priced and then let go quiet.',
      quiet: 'Industrial accounts do not complain. They just quietly move the fleet to whoever showed up at renewal.',
      outbound: 'Warehouse expansions and line changes in your radius are fleet decisions being made without you in the room.',
    },
  },

  {
    id: 'road',
    name: 'Road, Concrete & Compaction',
    short: 'Road & Concrete',
    blurb: 'Rollers, pavers, milling, concrete pumps, mixers, screeds',
    icon: ico('<path d="M2 20h20"/><rect x="4" y="12" width="8" height="5" rx="1"/><circle cx="7" cy="19" r="1.4"/><circle cx="15" cy="19" r="1.4"/><path d="M12 17V9h4l3 4v4"/><path d="M12 9V6"/><path d="M9 6h6"/>'),
    unit: 'machine', units: 'machines', job: 'job', jobs: 'jobs',
    customer: 'contractor', customers: 'contractors',
    /* Seasonal, bid-driven, municipal and DOT heavy. Demand is
       forecastable months ahead if anyone is watching the lettings. */
    fleet: [
      'Smooth drum rollers', 'Padfoot & soil compactors', 'Asphalt pavers',
      'Milling machines', 'Concrete pumps', 'Mixers & batch equipment',
      'Screeds & power trowels', 'Sweepers & distributors',
    ],
    ticketBands: [
      { label: 'Under $1,500', mid: 1000 },
      { label: '$1,500 – $4,000', mid: 2600 },
      { label: '$4,000 – $10,000', mid: 6800 },
      { label: '$10,000+', mid: 16000 },
    ],
    defaultClose: 35,
    intake: [
      'Job type & spec', 'Lift thickness / width', 'Schedule window',
      'Mobilization & transport', 'Operator or dry', 'Prevailing wage / certified payroll',
      'Bid or spot rental',
    ],
    signals: [
      'DOT & state lettings', 'Municipal paving contracts', 'Parking lot rehab',
      'Subdivision road work', 'Airport & port projects', 'Utility trench restoration',
    ],
    hook: 'Seasonal and bid-driven. Demand is on a public calendar months in advance — which means the yard watching the lettings quotes the job before you hear about it.',
    frames: {
      calls: 'Paving crews call the morning the weather turns. If you miss that window the machine sits until the next dry stretch.',
      quotes: 'Bid work has a deadline. A quote that arrives after the bid closed was free work you did for nobody.',
      pile: 'Quotes attached to bids that were never followed up are the cleanest revenue in your business — you already priced them.',
      quiet: 'Paving contractors run a short season. Miss one season with an account and you have missed a year.',
      outbound: 'Lettings and municipal awards are published. Every one is a schedule of equipment somebody has to rent.',
    },
  },

  {
    id: 'power',
    name: 'Power, Climate & Site Services',
    short: 'Power & Site',
    blurb: 'Generators, light towers, pumps, HVAC, containers, fencing',
    icon: ico('<path d="M2 20h20"/><rect x="3" y="11" width="9" height="7" rx="1"/><path d="M5.5 11V8.5h4V11"/><path d="M15 18V7"/><path d="M13 7h4l-2-4z"/><path d="M6 14.5h3"/>'),
    unit: 'unit', units: 'units', job: 'rental', jobs: 'rentals',
    customer: 'customer', customers: 'customers',
    /* 24/7 emergency demand + long-term project placements. The
       after-hours call is not a nuisance here, it is the business. */
    fleet: [
      'Portable generators', 'Large power / prime gensets', 'Light towers',
      'Pumps & dewatering', 'Temporary HVAC & climate', 'Power distribution & cable',
      'Storage containers & offices', 'Temporary fencing & barriers',
    ],
    ticketBands: [
      { label: 'Under $1,000', mid: 700 },
      { label: '$1,000 – $3,500', mid: 2100 },
      { label: '$3,500 – $10,000', mid: 6400 },
      { label: '$10,000+', mid: 18000 },
    ],
    defaultClose: 45,
    intake: [
      'kW / capacity required', 'Voltage & phase', 'Fuel & runtime',
      'Duration (emergency vs project)', 'Site access & placement', 'Distribution & cable runs',
      'Service & refueling',
    ],
    signals: [
      'Storm & outage response', 'Planned plant shutdowns', 'Events & festivals',
      'Data centre & hospital projects', 'Construction site setups', 'Municipal emergency contracts',
    ],
    hook: 'Emergency demand and long project placements. Half your best money arrives outside business hours — so voicemail is not an inconvenience here, it is the leak.',
    frames: {
      calls: 'Nobody needs a generator at 2pm on a Tuesday. They need it when the power is out, and they call until someone answers.',
      quotes: 'Emergency work is won in minutes. A next-day quote in this segment is a quote for a job already covered.',
      pile: 'Project placements get quoted and then sit while the schedule shifts. Nobody circles back, so nobody wins it.',
      quiet: 'Facilities and plant managers renew standby contracts quietly. Miss the window, lose the site.',
      outbound: 'Shutdown calendars, event permits and storm season are all forecastable demand you could be booked for in advance.',
    },
  },

  {
    id: 'specialty',
    name: 'Heavy Haul, Rigging & Specialty',
    short: 'Specialty',
    blurb: 'Machinery moving, heavy transport, foundation, demolition',
    icon: ico('<path d="M2 20h20"/><circle cx="5.5" cy="18.6" r="1.6"/><circle cx="9" cy="18.6" r="1.6"/><circle cx="17" cy="18.6" r="1.6"/><path d="M3 17V13h10v4"/><path d="M13 15h3l3 2"/><rect x="5" y="8" width="7" height="5" rx="0.6"/>'),
    unit: 'asset', units: 'assets', job: 'project', jobs: 'projects',
    customer: 'client', customers: 'clients',
    /* Project-based, engineered, enormous tickets, long sales cycles.
       Volume is low so every single lost conversation is material. */
    fleet: [
      'Machinery moving & millwright', 'Heavy haul trailers & transport',
      'Hydraulic gantries & jacking', 'Foundation & drilling rigs',
      'Demolition equipment & attachments', 'Industrial plant services',
      'Specialized rigging gear', 'Engineering & lift planning',
    ],
    ticketBands: [
      { label: 'Under $5,000', mid: 3200 },
      { label: '$5,000 – $15,000', mid: 9500 },
      { label: '$15,000 – $40,000', mid: 25000 },
      { label: '$40,000+', mid: 60000 },
    ],
    defaultClose: 25,
    intake: [
      'Scope & scale of move', 'Weights & dimensions', 'Route & permit survey',
      'Site conditions both ends', 'Schedule & shutdown window', 'Engineering requirements',
      'Insurance & liability limits',
    ],
    signals: [
      'Plant relocations', 'Equipment installs & retrofits', 'Turnaround & shutdown schedules',
      'Industrial demolition', 'Wind & energy projects', 'Port & rail infrastructure',
    ],
    hook: 'Project work at the highest tickets in the industry, with the longest sales cycles. You do not do many of these — which is exactly why losing one hurts so much.',
    frames: {
      calls: 'You do not get many of these calls. Missing one is not a bad week, it is a bad quarter.',
      quotes: 'Engineered work stalls between the estimate and the go-ahead. Whoever keeps the conversation alive gets the award.',
      pile: 'One revived project quote in this segment pays for a year of anything else you could spend the money on.',
      quiet: 'Plants and industrial clients only move machinery every few years. Miss the cycle and you wait for the next one.',
      outbound: 'Turnaround calendars and capital projects are planned a year out. That is a year you could be in the conversation.',
    },
  },
]

export const segmentById = (id) => SEGMENTS.find((s) => s.id === id) || SEGMENTS[0]
