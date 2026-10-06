from dsl import *

FILE = 'world'

# ---------------------------------------------------------------- Owner / boardroom
S(FILE, 'owner_memo_costs', 'Cost-Cutting Memo', 'owner',
  [memo("The Board has identified savings: (1) replace bottled water at events with 'tap water in nice cups'; (2) one cutman per two corners; (3) reduce the President's energy drink allowance by 40%.", "MEMO: EFFICIENCY INITIATIVES")],
  [C("Implement all three", "promotion.staff -= 1000 * scale", "fighters -= 3", "patience += 5", result="The fighters notice the cups. They notice the cutman sprinting between corners.", bot=2),
   C("Implement only the energy drink cut", "patience += 2", "president.lifestyle = 0", result="You suffer alone. Nobly. Jittery.", default=True, ethics=1),
   C("Reject them", "patience -= 5", "fighters += 1", result="The Board writes 'not aligned' in your file.")],
  cond="patience < 60 && !(mode == 'sandbox')", cd=52)

S(FILE, 'owner_audit', 'The Auditors Arrive', 'owner',
  [visit("Two auditors in identical grey suits have taken over the conference room. They've asked for 'every receipt since inception'. One of them has already found the jet ski.", "Auditor Brent")],
  [C("Cooperate fully", "patience += 4", "heat -= 2", "media += 0", result="They find a lot. They write it all down. The Board is 'concerned' but 'appreciative'.", ethics=2, default=True),
   C("Hide the worst receipts", "heat += 5", "patience += 1", "chaos += 2", result="You hide the jet ski receipts in the jet ski. They find the jet ski.", bot=1, ethics=-2)],
  cond="audit >= 1", cd=26)

S(FILE, 'owner_boardroom', 'The Boardroom', 'owner',
  [sc('boardroom', "Twelve executives around a table the length of a bowling lane. The chair taps a remote: a slide reading 'PRESIDENT: PERFORMANCE REVIEW' appears. 'We'll be brief. We are disappointed. Convince us not to be.'", "The Chairman")],
  [C("Promise to hit the next target, no excuses", "patience += 12", "flag.boardroom_promise = 1", result="The chairman nods slowly. 'One quarter.' One quarter.", default=True),
   C("Flip the table (figuratively): 'You don't understand this business'", "patience -= 6", "fans += 2", "fighters += 2", result="A long silence. Then the youngest exec says 'he's kind of right'. He's fired immediately.", bot=1),
   C("Offer to take a pay cut", "patience += 8", "wealth -= 200000", "promotion.staff -= 500 * scale", result="Personal sacrifice. They love it. They don't love you, but they love it.", ethics=1)],
  cond="patience < 30 && !(mode == 'sandbox')", cd=26)

S(FILE, 'owner_new_bosses', 'Meet The New Bosses', 'owner',
  [sc('boardroom', "The new owners from OmniVore introduce themselves. A man in a quarter-zip says 'synergy' four times in his first sentence. They want a 'content strategy', a 'fan engagement roadmap' and for you to stop swearing in press conferences.", "OmniVore VP of Synergy")],
  [C("'Absolutely. Synergy.'", "patience += 8", "fans -= 1", result="You say synergy. It tastes like cardboard.", default=True, bot=1),
   C("Swear immediately", "patience -= 6", "fans += 3", result="They write it down. They write everything down.")],
  cond="sold", once=True, acts=[4, 5])

S(FILE, 'owner_target_bonus', 'Hit The Number', 'owner',
  [memo("Good news: last quarter's revenue beat target. The Board has authorized a bonus for the President, or alternatively, 'a reinvestment in the athletes'.", "MEMO: BONUS AUTHORIZATION")],
  [C("Take the bonus", "wealth += 250000 * scale", result="You buy something with a motor.", default=True, bot=2),
   C("Give it to the fighters as bonuses", "spend('bonuses', 0)", "allFighters('morale', 5)", "fighters += 5", "addFlag('fairpay', 2)", result="Every fighter on the roster gets an envelope. Some cry. Some immediately buy motors.", ethics=2)],
  cond="patience > 70", cd=52)

# ---------------------------------------------------------------- Commission
S(FILE, 'commission_inspection', 'Surprise Inspection', 'commission',
  [visit("A commission inspector named Doreen arrives unannounced with a clipboard, a flashlight and the energy of a woman who has seen every trick. 'Your cage padding is 1.5 inches. Regulation is 2. Explain.'", "Inspector Doreen")],
  [C("Replace the padding immediately ({$fee})", "spend('equipment', vars.fee)", "commission += 3", result="New padding. Doreen nods once. That's the highest honor Doreen gives.", default=True, ethics=1),
   C("Offer Doreen ringside seats", "commission -= 4", "heat += 2", result="Doreen writes 'ATTEMPTED BRIBE' in very neat handwriting.", bot=1, ethics=-2)],
  vars={"fee": money(5, 15)}, cd=40)

S(FILE, 'commission_fine', 'Commission Fine', 'commission',
  [doc("The Athletic Commission has fined {promotion} {$fine} for 'repeated violations of weigh-in protocols, including the use of a scale described by witnesses as \"a bathroom scale with a sticker on it\"'.", "COMMISSION RULING")],
  [C("Pay the fine", "spend('fines', vars.fine)", "commission += 2", result="Paid. The bathroom scale is retired with honors.", default=True),
   C("Appeal", "spend('legal', vars.fine * 0.5)", "chance(0.4) ? earn('refunds', vars.fine) : meter('commission', -3)", result="You appeal. Sometimes appeals work. Sometimes they make it worse.", bot=1)],
  cond="meters.commission < 40", vars={"fine": money(20, 60)}, cd=26)

S(FILE, 'commission_new_rule', 'New Commission Rule', 'commission',
  [doc("Effective immediately: all fighters must submit to hydration testing at weigh-ins. Fighters found 'dangerously dehydrated' will not be cleared. Several of your fighters are dangerously dehydrated right now, reading this.", "COMMISSION NOTICE")],
  [C("Comply and educate fighters", "commission += 4", "fighters -= 1", result="Seminars about water. The fighters are confused by water.", default=True, ethics=1),
   C("Lobby against it", "commission -= 4", "spend('lobbying', 30000 * scale)", result="The lobbyist is very expensive and very bad at his job.", bot=1)],
  cond="act >= 2", cd=104, once=True)

S(FILE, 'commission_license_hearing', 'License Hearing', 'commission',
  [sc('boardroom', "The commission has summoned you to a hearing about your promotion's license after 'a pattern of incidents'. Seven commissioners. One of them is asleep. One of them is Doreen.", "Commission chair")],
  [C("Present a compliance plan", "commission += 8", "spend('consulting', 50000 * scale)", "heat -= 2", result="Your plan has tabs. Color-coded tabs. Doreen almost smiles.", ethics=1, default=True),
   C("Argue that the sport needs you", "commission -= 3", "fans += 1", result="The sleeping commissioner wakes up just to vote against you.", bot=1)],
  cond="meters.commission < 25", cd=52)

S(FILE, 'commission_ref_grudge', 'The Ref With A Grudge', 'commission',
  [phone("Referee Nerm Bean has heard you criticized his stoppage on a podcast. He'd like you to know he's 'not mad', and that he's been assigned to your next three main events.", "Commission office")],
  [C("Apologize to Nerm", "commission += 2", result="Nerm accepts. He'll still let the next fight go too long. But nicely.", default=True),
   C("Request a different referee", "commission -= 3", result="Request denied. Nerm sends you a thumbs-up emoji. It feels threatening.", bot=1)],
  cd=52)

# ---------------------------------------------------------------- Act I: the TV deal hunt
S(FILE, 'act1_cable_pitch', 'The Cable Pitch', 'business',
  [sc('boardroom', "SPLAT TV executives agree to watch your highlight reel in a conference room that smells like cargo shorts. 'We need stars, we need violence, we need it under 22 minutes per hour. Convince us.'", "SPLAT TV exec")],
  [C("Show the bloodiest highlight reel ever assembled", "network += 8", "commission -= 2", "tvOffer('spike_ish', 0, 104)", result="One exec faints. Another says 'we'll be in touch' in a voice that means yes.", bot=2),
   C("Pitch the personalities and drama", "network += 6", "fans += 1", "tvOffer('spike_ish', 0, 104)", result="You pitch the tiger, the mom, the bar fight. They want a reality show. They'll settle for fights.", default=True),
   C("Pitch it as 'the future of sport'", "network += 4", "chance(0.5) ? tvOffer('spike_ish', 0, 104) : meter('network', 2)", result="Lofty. Some execs nod. Some check their phones.")],
  cond="act == 1 && tv < 1 && week > 20", cd=26, weight=20)

S(FILE, 'act1_bank_calls', 'The Bank Calls', 'business',
  [phone("First National Bank of Bad Loans. Your loan payment is late. Again. 'We'd hate to repossess the cage. It's such a nice cage.'", "Loan officer Gail")],
  [C("Pay from your personal wealth", "wealth -= 40000", "debt -= 40000", result="Gail thanks you. She also asks for ringside seats.", ethics=1),
   C("Negotiate an extension", "debt += 20000", "patience -= 2", result="An extension, with interest. So much interest.", default=True),
   C("Offer the bank a sponsorship instead", "debt -= 30000", "sponsors -= 1", "fans -= 1", result="'FIRST NATIONAL BANK OF BAD LOANS presents...' The fans boo the bank. The bank doesn't care.", bot=1)],
  cond="act == 1 && debt > 100000 && cash < 300000", cd=20, weight=14)

S(FILE, 'act1_regional_tour', 'The Bus Tour', 'business',
  [visit("Your event coordinator proposes a 'Bus Tour': six small towns in six weeks, events in VFW halls and bowling alleys. 'Cheap venues, hungry crowds, and the bus has a microwave.'", "Event coordinator Pam")],
  [C("Hit the road", "fans += 4", "earn('gate', 30000)", "fighters -= 1", result="The bus breaks down in Nebraska. A farmer fixes it. He's now your head of security.", bot=1, default=True),
   C("Stay put and save money", "fans -= 1", result="You stay home. The bus is sold for parts.")],
  acts=[1], once=True)

# ---------------------------------------------------------------- Expansion & divisions
S(FILE, 'women_launch', "Launching The Women's Divisions", 'business',
  [memo("Research is in: women's MMA bouts outdraw half your men's prelims. A rival is signing every top female fighter. The board wants women's divisions launched 'before the rival owns them'.", "STRATEGY MEMO")],
  [C("Launch all three women's divisions now", "unlockDivisions('W')", "fans += 4", "media += 3", "news('women', 0.5, 7)", result="Three divisions, three inaugural title fights. The first card sells out in an hour.", default=True, ethics=1),
   C("Launch one division as a test", "unlockDivisions('W')", "fans += 2", result="You call it a 'test'. It does not need testing. It's the best card of the year.")],
  cond="act >= 3 && !womenOpen", once=True, weight=30)

S(FILE, 'international_debut', 'Going Global', 'business',
  [memo("International expansion: the Thames Dome in Neo-Albion and Arena Carioca are available. International events need visas, foreign commissions and a 3am broadcast slot.", "EXPANSION MEMO")],
  [C("Book the international events", "unlockVenue('o2_style')", "unlockVenue('rio_arena')", "unlockVenue('ozone')", "unlockVenue('jeunesse')", "fans += 3", "network += 2", "news('international', 0.3, 5)", result="The passports are ordered. Several fighters discover they've never had one.", default=True),
   C("Stay domestic for now", "fans -= 1", result="Safe. A rival books the Thames Dome instead.")],
  cond="act >= 3", once=True, weight=20)

S(FILE, 'venue_upgrade', 'A Bigger Room', 'business',
  [phone("The Metropolitan Garden has an open date. It's the most famous arena in the world. Booking it costs a fortune. Selling it out means you've made it. Not selling it out means a hit piece.", "Arena booking agent")],
  [C("Book it", "unlockVenue('garden_arena')", "unlockVenue('msquared')", "fans += 2", result="Booked. The pressure is enormous. So is the opportunity.", bot=1, default=True),
   C("Not yet", result="Not yet.")],
  cond="act >= 3 && meters.fans > 55", once=True)

S(FILE, 'military_event', 'Fight For The Troops', 'business',
  [phone("A military base wants to host a free event for the troops. No gate, but huge PR. A colonel wants a photo op and possibly to fight someone.", "Colonel Buck Hardigan")],
  [C("Do it", "unlockVenue('military_base')", "media += 4", "fans += 3", "sponsors += 2", result="The troops go wild. The colonel challenges your heavyweight. Your heavyweight politely declines.", default=True, ethics=1),
   C("Decline", result="A rival does it. Their PR goes up.")],
  cond="act >= 2", once=True)

# ---------------------------------------------------------------- Legends
S(FILE, 'legend_comeback', 'One More Fight', 'legend',
  [visit("{subject.first} {subject.last}, {subject.age} years old, walks into your office looking like a man who has been doing push-ups in the parking lot. 'One more fight. I feel 25. I've been doing cold plunges.' {His} doctor is in the car, honking.", "{subject.first} {subject.last}")],
  [C("Sign {him} for a nostalgia superfight", "comeback(subject)", "fans += 3", "media -= 1", "commission -= 2", "news('comeback', 0.4, 6)", result="The legend returns. Ticket prices triple. Doctors brace.", bot=2),
   C("Offer a commentary job instead", "network += 2", "fans += 1", result="{He} takes the headset. {He}'s great at it. {He} still does push-ups in the parking lot.", default=True, ethics=1),
   C("Say no", result="{He} signs with a bare-knuckle league. You watch. You wince.")],
  roles={"subject": LEG("f.age < 55", "f.star + 10")}, cond="act >= 2", cd=26, chain='legends')

S(FILE, 'legend_hof_speech', 'Hall of Fame Speech', 'legend',
  [sc('narration', "{subject.first} {subject.last} is being inducted into the Hall of Fame. {His} speech is scheduled for 8 minutes. {He} has written 41 pages.")],
  [C("Let {him} speak as long as {he} wants", "fans += 2", "media += 1", result="It goes 47 minutes. {He} thanks {his} cutman, {his} third-grade teacher and a dog. Everyone cries.", default=True),
   C("Play the music at minute 8", "fans -= 1", result="Play-off music at minute 8. {He} keeps talking over it. Legend behavior.", bot=1)],
  roles={"subject": LEG("true", "f.star + 5")}, cd=52, chain='legends')

S(FILE, 'legend_podcast_beef', 'Legends Beefing', 'legend',
  [sc('social', "Two retired legends, {subject.first} {subject.last} and {other.first} {other.last}, are beefing on a podcast about who would have won in their prime. Combined age: 97. Combined pending knee surgeries: 6.")],
  [C("Book an exhibition 'grappling match'", "fans += 3", "earn('ppv', 100000 * scale)", "commission -= 1", result="It's slow, careful, and the most-watched grappling match of the decade.", bot=2),
   C("Let them argue", result="They argue for six more episodes. Both shows grow.", default=True)],
  roles={"subject": LEG(), "other": LEG("f.id != subject.id && f.division == subject.division")}, cd=52, chain='legends')

S(FILE, 'legend_broke', 'The Broke Legend', 'legend',
  [phone("{subject.first} {subject.last}, a legend of the sport, is broke. {He} is selling {his} championship belts online. A fan bought one and called you, asking if it's real.", "A worried fan")],
  [C("Buy the belts back and give them to {him}", "spend('charity', 60000 * scale)", "fighters += 3", "media += 3", "fans += 2", result="The belts go back to the legend. {He} cries on camera. Every active fighter notices.", ethics=3),
   C("Hire {him} as an ambassador", "spend('staff', 20000 * scale)", "fans += 2", "fighters += 1", result="A steady paycheck and a reason to show up. {He} becomes the best ambassador the sport has had.", default=True),
   C("Not your responsibility", "fighters -= 3", "media -= 2", result="The story runs anyway. The headline isn't kind.", bot=1)],
  roles={"subject": LEG()}, cd=52, chain='legends')

S(FILE, 'legend_commentary', 'Legend In The Booth', 'legend',
  [phone("{subject.first} {subject.last} wants a commentary job. {He} has never spoken in complete sentences on camera. {His} audition tape is just {him} yelling 'OH!' for nine minutes.", "Broadcast producer")],
  [C("Hire {him}", "network += 2", "fans += 2", result="'OH!' becomes the most beloved call in sports broadcasting.", default=True, bot=1),
   C("Pass", result="{He} starts a podcast where {he} yells 'OH!' at old fights. It has 2 million subscribers.")],
  roles={"subject": LEG()}, cd=52, chain='legends')

S(FILE, 'legend_dream_match', 'Dream Match Proposal', 'legend',
  [visit("Promoters across the world are asking about a 'dream match': {subject.first} {subject.last} (retired legend) against a current champion. The legend says 'just let me get a camp in'. The champion says 'is this a joke'.", "{subject.first} {subject.last}")],
  [C("Make the dream match", "comeback(subject)", "fans += 4", "network += 4", "commission -= 3", result="The world stops. It's the biggest event in history. Somebody is going to get hurt, and it's probably the legend.", bot=2),
   C("Keep legends as legends", "fans -= 1", result="Integrity. The fans grumble. The legend's knees thank you.", default=True, ethics=1)],
  roles={"subject": LEG("f.age < 50")}, cond="act >= 4 || flag('dreamMatches')", cd=104, chain='legends')

# ---------------------------------------------------------------- Act intros (system-triggered)
for n, title, text in [
    (2, 'Act II: The Boom', "A fight went viral. A big one. Suddenly people know your promotion's name. Kids are wearing your shirts. A drug-testing agency has emailed you 'to talk'. Your fighters are getting arrested at a professional rate. Welcome to the Boom."),
    (3, 'Act III: The Empire', "Foreign commissions, visas, women's divisions, a superstar who wants to box, and a union drive whispering in the locker room. You are no longer a regional curiosity. You are a target."),
    (4, 'Act IV: The Sale', "Your owners sold the company to OmniVore Global Entertainment & Defense for an obscene amount of money. You kept your job. You lost your parking space. There are suits in your office now, and they all have spreadsheets."),
    (5, 'Act V: The Legacy', "The mega-venue is booked. The lawsuits are reaching verdicts. The union wants an answer. Your fighters are aging, your knees hurt from standing cageside, and someone, somewhere, is writing your obituary. Make it a good one."),
]:
    S(FILE, f'act{n}_intro', title, 'misc',
      [sc('narration', text)],
      [C("Let's go", "fans += 1", result="Here we go.", default=True)],
      fu=True, once=True)
