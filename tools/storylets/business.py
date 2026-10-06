from dsl import *

FILE = 'business'

# ---------------------------------------------------------------- Union drive (multi-step)
S(FILE, 'union_whispers', 'Whispers in the Locker Room', 'business',
  [visit("{subject.first} closes your door. \"Boss, I'm telling you as a friend: guys are talking. About a union. Somebody's passing around a printout of what boxers make. It's highlighted. In several colors.\"", "{subject.first} {subject.last}")],
  [C("Announce a pay review", "fighters += 4", "flag.union -= 1", "patience -= 2", "allFighters('morale', 3)", result="A pay review. Nobody believes it, but they like that you said it.", ethics=1),
   C("Find out who's organizing", "flag.union_hunt = 1", "fighters -= 2", "heat += 1", "follow('union_organizer', 3)", result="You start asking questions. Everyone suddenly gets very busy stretching.", bot=1),
   C("Laugh it off", "flag.union += 1", "follow('union_meeting', 6)", result="You laugh. {subject.first} doesn't.", default=True)],
  roles={"subject": F("f.ours && f.loyalty > 55")}, cond="act >= 2 && meters.fighters < 55", cd=40, chain='union')

S(FILE, 'union_organizer', 'The Organizer', 'business',
  [visit("The organizer turns out to be {subject.first} {subject.last}. {He} doesn't deny it. {He} slides a document across your desk: 'Proposed Collective Bargaining Agreement - Draft 1'. It asks for 48% of revenue, health insurance and 'no more Thursday weigh-ins'.", "{subject.first} {subject.last}")],
  [C("Negotiate in good faith", "flag.union_talks = 1", "fighters += 6", "patience -= 6", "flag.fairpay += 2", "follow('union_deal', 10)", result="Talks begin. The board sends you a memo with the word 'disappointed' in bold.", ethics=2),
   C("Cut {him}", "release(subject)", "fighters -= 8", "flag.union += 2", "news('union', -0.5, 7)", "follow('union_strike_vote', 8)", result="Cutting the organizer turns the organizer into a martyr. You have created a saint.", bot=1, ethics=-3),
   C("Promote {him} to a 'fighter relations' role", "subject.loyalty += 10", "fighters += 2", "flag.union -= 1", result="Co-opted. {He} gets an office. {He} still has the highlighted printout.", default=True)],
  roles={"subject": F("f.ours && (f.traits.has('Business Savvy') || f.archetype == 'The Pay Protester' || f.traits.has('Mentor'))")}, fu=True, chain='union')

S(FILE, 'union_meeting', 'The Meeting', 'business',
  [doc("Leaked minutes from a fighters' meeting in a hotel conference room. Attendance: 41 fighters. Motion to form a union: passed 39-2. The 2 'no' votes were both your relatives.", "MEETING MINUTES (LEAKED)")],
  [C("Recognize the union", "flag.union_recognized = 1", "fighters += 10", "patience -= 10", "flag.fairpay += 3", "news('union', -0.3, 8)", result="History. The board is apoplectic. The fighters throw you a surprisingly nice party.", ethics=3),
   C("Refuse to recognize it", "fighters -= 6", "flag.union += 2", "follow('union_strike_vote', 6)", result="Refused. The fighters start wearing matching T-shirts.", default=True, bot=1)],
  fu=True, chain='union')

S(FILE, 'union_strike_vote', 'Strike Vote', 'business',
  [phone("The fighters voted to strike. Nobody fights on the next card unless revenue split is discussed. Your next event is in two weeks and the network has already sold the ads.", "Network exec, screaming")],
  [C("Cave: open negotiations", "fighters += 8", "patience -= 8", "flag.fairpay += 3", "follow('union_deal', 4)", result="The strike is called off. The fighters go back to punching each other, which is what they wanted all along.", ethics=2, default=True),
   C("Run the card with replacement fighters from regional leagues", "fans -= 10", "network -= 10", "fighters -= 12", "media -= 6", "heat += 3", result="The replacement card features a man named 'Tank' who is 0-7 and a bouncer who has never fought. The ratings are a crime scene.", bot=1, ethics=-3),
   C("Lock them out", "fighters -= 20", "fans -= 6", "patience += 4", "chaos += 6", result="Lockout. Every rival promotion sends you a thank-you note.", bot=1, ethics=-3)],
  fu=True, chain='union')

S(FILE, 'union_deal', 'Collective Bargaining Agreement', 'business',
  [doc("Final CBA terms: minimum purses up 40%, health insurance for active fighters, a retirement fund, and Thursday weigh-ins abolished forever. The fighters' side has signed. Your pen is the last one.", "COLLECTIVE BARGAINING AGREEMENT")],
  [C("Sign it", "flag.cba = 1", "fighters += 15", "allFighters('loyalty', 10)", "promotion.staff += 3000 * scale", "patience -= 6", "flag.fairpay += 5", "news('union', 0.4, 8)", result="Signed. A historic day. The board's lawyer cries in the bathroom.", ethics=3, default=True),
   C("Water it down", "fighters += 4", "patience += 2", "flag.union += 1", result="You get the insurance dropped to 'dental only'. Everyone's teeth will be fine.", bot=1)],
  fu=True, chain='union')

# ---------------------------------------------------------------- Antitrust (multi-year)
S(FILE, 'antitrust_filed', 'The Lawsuit', 'business',
  [doc("CLASS ACTION COMPLAINT. A group of former fighters alleges that {promotion} has illegally suppressed fighter pay through exclusive contracts, monopsony power and 'vibes'. Damages sought: {$damages}.", "COMPLAINT, U.S. DISTRICT COURT")],
  [C("Hire the most expensive firm in the country ({$fee})", "spend('legal', vars.fee)", "follow('antitrust_discovery', 26)", "flag.antitrust = 1", result="The firm sends a 300-page engagement letter. Page 4 is just their hourly rate. It's in bold.", default=True),
   C("Settle early ({$settle})", "spend('settlements', vars.settle)", "fighters += 5", "patience -= 6", "flag.antitrust_settled = 1", result="Settled. The press calls it 'an admission'. Your lawyers call it 'a bargain'.", ethics=1)],
  cond="act >= 3 && (flag('underpay') > 3 || meters.fighters < 40)", vars={"damages": money(5000, 20000), "fee": money(400, 900), "settle": money(1500, 4000)}, once=True, chain='antitrust')

S(FILE, 'antitrust_discovery', 'Discovery', 'business',
  [doc("The plaintiffs have requested every internal email containing the words 'pay', 'purse', 'cheap', 'peasants', or 'lol'. Your IT department has found 11,402 emails. Including several from you.", "DISCOVERY REQUEST")],
  [C("Hand them over", "heat += 4", "media -= 3", "follow('antitrust_trial', 30)", result="The emails go out. One is titled 'RE: RE: RE: how little can we pay these guys'. You don't remember writing it. You did.", ethics=1, default=True),
   C("'Lose' some of them", "heat += 12", "chaos += 4", "follow('antitrust_trial', 30)", "flag.spoliation = 1", result="An 'accidental' server wipe. The judge is not born yesterday.", bot=1, ethics=-3)],
  fu=True, chain='antitrust')

S(FILE, 'antitrust_trial', 'The Verdict', 'business',
  [doc("After years of litigation, the jury has reached a verdict in Fighters v. {promotion}.", "VERDICT")],
  [C("Read it", "chance(flag('spoliation') ? 0.85 : 0.5) ? setFlag('antitrust_lost', 1) : setFlag('antitrust_won', 1)", "spend('legal judgments', flag('antitrust_lost') ? 3000000 * scale : 0)", "fighters += flag('antitrust_lost') ? 10 : -5", "patience -= flag('antitrust_lost') ? 15 : 0", "news('lawsuit', -0.6, 9)", result="The verdict is in. Check the ledger. Then check your blood pressure.", default=True)],
  fu=True, chain='antitrust')

# ---------------------------------------------------------------- pay leaks & disputes
S(FILE, 'pay_leak', 'Purse Leak', 'business',
  [sc('social', "The Purse Report published every purse from last month's card. {subject.first} {subject.last}, who headlined, made less than the promotion spent on fireworks for {his} walkout. The fireworks have their own Instagram.")],
  [C("Pay {subject.first} a 'discretionary bonus' ({$fee})", "spend('bonuses', vars.fee)", "subject.loyalty += 10", "fighters += 2", "media += 1", result="Quietly fixed. The fireworks guy is livid.", ethics=1),
   C("Call it 'fake news'", "media -= 3", "fighters -= 3", "news('pay', -0.5, 5)", result="The numbers are real. You know it. They know it. The fireworks know it.", bot=1, default=True)],
  roles={"subject": F("f.ours && f.star > 35")}, vars={"fee": money(10, 40)}, cd=26, chain='pay')

S(FILE, 'pay_bonus_dispute', 'Where\'s My Bonus?', 'business',
  [visit("{subject.first} won a fight-of-the-night slugfest and didn't get a bonus. {He} has printed out a still of {his} own face mid-punch and is holding it up like evidence.", "{subject.first} {subject.last}")],
  [C("Pay the bonus retroactively ({$fee})", "spend('bonuses', vars.fee)", "subject.loyalty += 8", "fighters += 1", result="{He} frames the check next to the picture of {his} face.", ethics=1),
   C("Bonuses are discretionary", "subject.morale -= 6", "subject.beef += 6", result="{He} starts referring to you as 'Discretionary' in interviews.", default=True, bot=1)],
  roles={"subject": F("f.ours && f.weeksSinceFight < 4")}, vars={"fee": money(5, 10)}, cd=20)

# ---------------------------------------------------------------- Piracy, broadcast, sponsors
S(FILE, 'piracy', 'PPV Piracy', 'business',
  [doc("Your last pay-per-view was illegally streamed by an estimated 2.4 million people. One pirate stream had better commentary than yours. The top streamer has a donation link.", "BROADCAST SECURITY REPORT")],
  [C("Sue the pirates ({$fee})", "spend('legal', vars.fee)", "network += 2", "fans -= 2", "media += 1", result="You sue a 19-year-old in Ohio. He gets a GoFundMe. It raises more than your lawsuit.", bot=1),
   C("Hire the pirate commentators", "fans += 3", "media += 1", result="The pirate commentators are funnier than anyone on your broadcast. Ratings tick up.", default=True),
   C("Lower PPV prices", "earn('ppv', -50000 * scale)", "fans += 4", "network -= 2", result="Cheaper PPV. Fewer pirates. The network is concerned about 'brand value'.", ethics=1)],
  cond="ppv && act >= 2", vars={"fee": money(50, 150)}, cd=40)

S(FILE, 'broadcast_renegotiate', 'The Network Wants Changes', 'business',
  [phone("Network here. Love the product. Love it. Couple of notes: we want shorter fights, five-minute 'hype breaks' between rounds, a commentator who's 'more relatable to the 18-34 demo', and a mid-fight sponsored 'Punch of the Round'.", "Network exec Chad Brandsworth")],
  [C("Agree to everything", "network += 8", "fans -= 6", "fighters -= 2", "earn('broadcast', 200000 * scale)", result="The 'Punch of the Round' is sponsored by a car insurance company. The fans revolt in the comments.", bot=2),
   C("Agree to the sponsored segment only", "network += 3", "fans -= 1", "earn('broadcast', 80000 * scale)", result="Compromise. Everybody is mildly annoyed. That's a good deal.", default=True),
   C("Tell them no", "network -= 6", "fans += 3", "fighters += 1", result="The network says 'we'll circle back'. They will not circle back nicely.", ethics=1)],
  cond="tv >= 1", cd=52)

S(FILE, 'sponsor_offer_shady', 'A Sponsor With Questions', 'business',
  [phone("{sponsor.name} wants to be your 'official partner' for {$fee} a year. Their product: '{sponsor.blurb}' Their legal team has asked that you not look them up.", "{sponsor.name} rep")],
  [C("Take the money", "earn('sponsors', vars.fee)", "sponsorDeal(sponsor, 52)", "sponsors += 3", "heat += 1", "chaos += 1", result="Your cage now has their logo. Your lawyers have a new folder.", bot=2, ethics=-1),
   C("Pass", "sponsors -= 1", result="They sign with a rival the next day.", default=True)],
  roles={"sponsor": SP("f.tier >= 2 && (f.category == 'crypto' || f.category == 'betting' || f.category == 'adult' || f.category == 'supplement')")}, vars={"fee": money(80, 300)}, cd=26)

S(FILE, 'sponsor_offer_clean', 'A Real Sponsor', 'business',
  [phone("Good news: {sponsor.name} wants to sponsor your events. '{sponsor.blurb}' They're offering {$fee}. The only catch: they want a family-friendly event with no bloody close-ups.", "{sponsor.name} rep")],
  [C("Take the deal", "earn('sponsors', vars.fee)", "sponsorDeal(sponsor, 52)", "sponsors += 4", "fans -= 1", result="No bloody close-ups. The cameraman learns to film around the blood like a nature documentary.", default=True, bot=1),
   C("Counter for more money", "chance(0.5) ? earn('sponsors', vars.fee * 1.4) : meter('sponsors', -2)", "sponsorDeal(sponsor, 52)", result="You push. Sometimes it works.")],
  roles={"sponsor": SP("f.category == 'apparel' || f.category == 'energy' || f.category == 'auto' || f.category == 'fastfood' || f.category == 'tech'")}, vars={"fee": money(40, 160)}, cd=20, weight=12)

S(FILE, 'sponsor_pullout', 'Sponsor Pullout', 'business',
  [phone("{sponsor.name} is pulling out of their deal after 'recent events'. They used air quotes. You could hear the air quotes.", "{sponsor.name} rep")],
  [C("Beg", "sponsors += 1", "chance(0.4) ? meter('sponsors', 2) : dropSponsor(sponsor)", result="You beg. It's undignified. It sometimes works.", default=True),
   C("Let them go", "dropSponsor(sponsor)", "sponsors -= 3", result="Gone. Their logo is painted over before the next event. Badly.")],
  roles={"sponsor": SP("true")}, cond="meters.sponsors < 45 && (heat > 30 || chaos > 40)", cd=20)

S(FILE, 'merch_scandal', 'The T-Shirt Problem', 'business',
  [doc("A reporter discovered that your official event T-shirts are made in a factory that also makes counterfeit versions of your event T-shirts. The counterfeits are higher quality.", "PRESS INQUIRY")],
  [C("Switch to a pricier ethical supplier", "spend('merch costs', 40000 * scale)", "media += 3", result="Ethical shirts. They fall apart after two washes. But ethically.", ethics=1),
   C("Partner with the counterfeiters", "earn('merch', 30000 * scale)", "media -= 2", "heat += 1", result="If you can't beat them, license them.", bot=2, default=True)],
  cond="act >= 2", cd=104)

# ---------------------------------------------------------------- Rivals & poaching
S(FILE, 'rival_poach_offer', 'Poaching Attempt', 'rival',
  [phone("{rival.name} offered {subject.first} {subject.last} double {his} purse to break {his} contract. {His} manager says {he}'s 'listening'. {His} manager is also 'listening' to a smoothie blender, so it's hard to tell.", "{subject.manager}")],
  [C("Match the offer", "raise(subject, 50)", "subject.loyalty += 10", "subject.morale += 6", result="{He} stays. {His} manager gets a new blender.", default=True),
   C("Threaten to sue {rival.name}", "spend('legal', 40000 * scale)", "rival.relationship -= 20", "subject.morale -= 4", result="Lawyers exchange letters. The letters are rude.", bot=1),
   C("Let {him} go", "toRival(subject, rival)", "fans -= 2", result="{He} goes. {He} loses {his} first fight there. You don't smile. (You smile.)")],
  roles={"subject": F("f.ours && f.star > 35 && f.loyalty < 60"), "rival": RIV()}, cd=20, chain='rivalwar')

S(FILE, 'rival_counter_program', 'Counter-Programming', 'rival',
  [doc("{rival.name} has scheduled their biggest event of the year on the exact same night as your next card. Their main event features two guys who have never heard of each other. Their poster is just their logo, but bigger.", "COMPETITOR INTEL")],
  [C("Move your event a week", "fans -= 1", "network -= 1", result="You move. They move too. This happens three times before someone's assistant gets fired.", default=True),
   C("Stack your card even harder", "fans += 3", "spend('production', 60000 * scale)", "rival.strength -= 4", result="You win the night. They release a statement about 'sportsmanship'.", bot=1),
   C("Book a celebrity guest fighter", "network += 3", "fans -= 1", "earn('ppv', 40000 * scale)", result="A rapper fights a YouTuber on your undercard. It's terrible. It wins the night.")],
  roles={"rival": RIV()}, cd=26, chain='rivalwar')

S(FILE, 'rival_merger_offer', 'Merger Talk', 'rival',
  [phone("{rival.owner} from {rival.name} is on the line. 'Let's stop fighting and start fighting together. Merger. Your brand, my money, our lawyers.'", "{rival.owner}")],
  [C("Accept: absorb them", "rival.alive = false", "earn('acquisitions', -2000000 * scale)", "fans += 4", "fighters += 2", "news('rival_merger', 0.3, 7)", result="You absorb {rival.name}. Their fighters become your fighters. Their lawsuits become your lawsuits.", bot=1),
   C("Decline", "rival.relationship -= 10", result="'You'll regret this.' (You will not.)", default=True)],
  roles={"rival": RIV("f.strength < 40")}, cond="act >= 3 && cash > 3000000 * scale", cd=104, once=True, chain='rivalwar')

S(FILE, 'rival_spy', 'The Spy', 'rival',
  [visit("A {rival.name} employee wants to defect to you. She's bringing their fighter contracts, their PPV numbers and a USB stick labeled 'DO NOT LOOK'. She wants a job and a parking space.", "Rival defector")],
  [C("Hire her and use everything", "rival.strength -= 8", "heat += 3", "chaos += 2", "spend('staff', 20000 * scale)", result="Their PPV numbers are worse than you thought. Their USB stick is just vacation photos. Weird ones.", bot=2, ethics=-2),
   C("Hire her, ignore the USB", "spend('staff', 15000 * scale)", "rival.relationship += 5", result="She's great at her job. She does not mention the USB again.", default=True),
   C("Call {rival.owner} and return the USB", "rival.relationship += 15", "media += 1", result="{rival.owner} sends flowers. And a cease and desist. Both lovely.", ethics=2)],
  roles={"rival": RIV()}, cd=104, chain='rivalwar')

S(FILE, 'rival_free_agent_war', 'Bidding War', 'rival',
  [phone("{subject.first} {subject.last} is the hottest free agent on the market. {rival.name} has offered {$offer} a fight. {His} manager wants to know if you'll beat it.", "{subject.manager}")],
  [C("Beat it", "sign(subject)", "raise(subject, 40)", "spend('signing bonuses', vars.offer * 0.5)", "fans += 2", result="Signed. {rival.name}'s owner posts a single sad emoji.", bot=1),
   C("Let them have {him}", "toRival(subject, rival)", result="{rival.name} signs {him}. You will be fighting {him} for the rest of the decade.", default=True)],
  roles={"subject": FA("f.star > 30 || f.skills.striking + f.skills.wrestling > 150", "f.star + 1"), "rival": RIV()}, vars={"offer": money(20, 80)}, cd=12, weight=12, chain='rivalwar')

# ---------------------------------------------------------------- the conglomerate merger (act 4)
S(FILE, 'merger_rumor', 'Merger Rumors', 'owner',
  [memo("The new owners are 'exploring a strategic combination' with a pro wrestling company. You would become 'co-president of combat entertainment'. They'd like your thoughts on scripted endings 'for marquee events only'.", "MEMO: STRATEGIC SYNERGIES")],
  [C("Absolutely not. Fights are real.", "patience -= 6", "fans += 4", "fighters += 2", result="The suits write 'not a team player' on a whiteboard. Fans would carry you on their shoulders if they knew.", ethics=2, default=True),
   C("Maybe just one scripted ending...", "patience += 6", "heat += 5", "flag.scripted = 1", "chaos += 4", result="One scripted ending. It's a disaster. A fighter refuses to take the dive and knocks out the guy who was supposed to win. It's the best fight of the year.", bot=2, ethics=-3)],
  cond="act >= 4 && sold", once=True, chain='merger')
