from dsl import *

FILE = 'legal'
FREE = "f.ours && f.legal == 'free' && !f.parody"

# ---------------------------------------------------------------- Reckless driver arc
S(FILE, 'legal_speeding', 'Need for Speed', 'legal',
  [phone("Boss. It's {subject.first}'s manager. So... the cops clocked {him} doing 142 in a school zone. On a Sunday. In a borrowed Lamborghini. {He} told the officer {he} was 'cutting weight'.", "{subject.manager}")],
  [C("Pay the lawyer to make it disappear ({$fee})", "spend('legal', vars.fee)", "subject.loyalty += 5", "heat += 1", result="The ticket evaporates. {subject.first} sends you a thumbs-up emoji and a picture of a new car.", bot=1, ethics=-1),
   C("Let {him} deal with it {him}self", "subject.morale -= 4", "news('scandal', -0.2, 3)", result="{subject.first} pays the fine in rolls of quarters. The clerk posts it online.", default=True),
   C("Make {him} film a 'Drive Safe' PSA for local schools", "media += 2", "fans += 1", "subject.morale -= 2", result="The PSA is 40 seconds long. {subject.first} breaks character twice to laugh. It gets 3 million views. Mostly ironic.", ethics=1)],
  roles={"subject": F(FREE + " && f.traits.has('Reckless Driver')")}, vars={"fee": money(3, 8)}, cd=30, chain='reckless')

S(FILE, 'legal_hit_run', 'The Crash', 'legal',
  [phone("{subject.first} {subject.last} crashed into two parked cars and a third car that was not parked, then left on foot. Then came back for {his} phone. The police have {him}. Nobody was killed, but someone is in the hospital.", "Your head of security")],
  [C("Suspend {him} indefinitely, pending the investigation", "arrest(subject, 'reckless_hit_run')", "suspend(subject, 26)", "media += 3", "sponsors += 1", "fighters -= 1", "follow('legal_hit_run_court', 6)", result="You put out a short statement. No jokes. The press calls it 'unusually adult'.", ethics=2),
   C("Wait for all the facts before acting", "arrest(subject, 'reckless_hit_run')", "media -= 2", "follow('legal_hit_run_court', 6)", result="'We're waiting for the facts.' The facts arrive in the form of dashcam footage on every news channel.", default=True),
   C("Publicly back your fighter", "arrest(subject, 'reckless_hit_run')", "subject.loyalty += 15", "media -= 6", "sponsors -= 5", "heat += 4", "follow('legal_hit_run_court', 6)", result="'He's a good kid.' Three sponsors call within the hour. None of them say 'good kid'.", bot=1, ethics=-2)],
  roles={"subject": F(FREE + " && f.traits.has('Reckless Driver')")}, cond="act >= 1 && since('legal_speeding') < 60", weight=8, cd=104, chain='reckless', tags=['serious'])

S(FILE, 'legal_hit_run_court', 'Plea Deal', 'legal',
  [doc("PEOPLE v. {subject.last}. The DA offers a plea: reckless driving and leaving the scene, 18 months probation, restitution, 200 hours of community service. {He}'d be free to compete after a 6-month suspension.", "PLEA OFFER (CARBON COPY)")],
  [C("Advise {him} to take it", "subject.legal = 'probation'", "subject.morale -= 5", "media += 2", "follow('legal_hit_run_return', 26)", result="{subject.first} takes the deal. {He} does community service at an animal shelter and is somehow great at it.", ethics=1, default=True),
   C("Pay for a trial lawyer to fight it ({$fee})", "spend('legal', vars.fee)", "subject.loyalty += 10", "heat += 3", "follow('legal_hit_run_return', 30)", result="The shark lawyer gets it knocked down to a misdemeanor. The victim's family gives a press conference. It is not a good press conference for you.", bot=1, ethics=-1)],
  roles={"subject": F("true")}, vars={"fee": money(40, 90)}, fu=True, chain='reckless', tags=['serious'])

S(FILE, 'legal_hit_run_return', 'The Redemption Tour', 'legal',
  [visit("{subject.first} is back in your office, clean-shaven, carrying a book about accountability {he} has clearly not read. {He} wants to fight again.", "{subject.first} {subject.last}")],
  [C("Book {him} on a big card: redemption sells", "unsuspend(subject)", "subject.hype += 15", "fans += 2", "media -= 2", "addTrait(subject, 'Reformed')", result="The redemption arc trends for a week. The victim's lawyer trends for slightly longer.", bot=1),
   C("Bring {him} back quietly on a prelim", "unsuspend(subject)", "subject.morale += 5", "media += 1", "addTrait(subject, 'Reformed')", result="Quiet comeback. A win by decision. Nobody makes a documentary. Good.", default=True, ethics=1),
   C("Release {him}", "release(subject)", "media += 2", "fighters -= 1", result="You let {him} go. {He} signs with a bare-knuckle league within 48 hours.")],
  roles={"subject": F("true")}, fu=True, chain='reckless')

# ---------------------------------------------------------------- Bar fight arc
S(FILE, 'legal_bar_fight', 'Last Call', 'legal',
  [phone("We've got a problem. {subject.first} got into it at a bar called The Rusty Spur. Guy said he 'could take a pro fighter'. He could not. Cops are there now.", "{subject.manager}")],
  [C("Let the Bail Office handle it", "arrest(subject, 'bar_fight')", "follow('legal_bar_fight_video', 2)", result="Another ticket for the Bail Office window.", default=True),
   C("Call in a favor with the local sheriff ({$fee} 'donation')", "spend('donations', vars.fee)", "heat += 3", "subject.loyalty += 8", "flag.sheriff_favor += 1", result="The sheriff is suddenly a huge fan of the sport. Charges 'misplaced'. A deputy asks for ringside seats.", bot=1, ethics=-2)],
  roles={"subject": F(FREE + " && (f.traits.has('Hothead') || f.traits.has('Party Animal'))")}, vars={"fee": money(5, 15)}, cd=26, chain='barfight')

S(FILE, 'legal_bar_fight_video', 'The Video', 'legal',
  [sc('social', "Phone footage of {subject.last}'s bar fight is everywhere. 14 million views. The comments section has scored it 10-8 and is demanding a rematch with the bouncer.")],
  [C("Lean into it: sell 'Last Call' T-shirts", "earn('merch', 20000 * scale)", "subject.hype += 10", "fans += 2", "media -= 3", "commission -= 2", result="The shirts sell out. The commission sends a letter written entirely in capital letters.", bot=2, ethics=-1),
   C("Issue a stern statement", "media += 1", "subject.morale -= 3", result="'We do not condone violence outside of a licensed, sanctioned, pay-per-view context.'", default=True),
   C("Make {him} apologize to the guy publicly", "media += 2", "subject.morale -= 6", "subject.beef += 5", "follow('legal_bar_fight_civil', 8)", result="The apology is sincere. The guy accepts it, then hires a lawyer anyway.")],
  roles={"subject": F("true")}, fu=True, chain='barfight')

S(FILE, 'legal_bar_fight_civil', 'Civil Suit', 'legal',
  [doc("PLAINTIFF Darrel K. Mumford v. {subject.last} and {promotion}. Damages sought: {$amount} for 'emotional distress, a chipped tooth, and the loss of a lifelong belief that I could take a pro fighter'.", "SUMMONS")],
  [C("Settle ({$amount})", "spend('settlements', vars.amount)", "media += 1", result="Settled. Darrel buys a boat. He names it 'TKO'.", default=True),
   C("Fight it in court", "spend('legal', vars.amount * 0.4)", "spend('legal judgments', chance(0.5) ? vars.amount : 0)", "heat += 1", result="It goes to court. The jury is mostly people who have also thought they could take a pro fighter.", bot=1)],
  roles={"subject": F("true")}, vars={"amount": money(20, 80)}, fu=True, chain='barfight')

# ---------------------------------------------------------------- DUI arc
S(FILE, 'legal_dui', 'Blow Into This', 'legal',
  [phone("{subject.first} got pulled over at 3am with a blood alcohol level that should have killed a horse. {He} offered the officer a signed glove. The officer is a boxing fan.", "{subject.manager}")],
  [C("Send the Bail Office paperwork", "arrest(subject, 'dui')", "follow('legal_dui_rehab', 2)", result="Another mugshot for the collection.", default=True),
   C("Get ahead of it: announce {he}'s entering rehab", "arrest(subject, 'dui')", "media += 3", "sponsors += 1", "subject.addiction -= 20", "follow('legal_dui_rehab', 2)", result="You announce rehab before {he} knows about it. {He} finds out from Twitter.", ethics=1)],
  roles={"subject": F(FREE + " && (f.vices.has('booze') || f.traits.has('Party Animal') || f.addiction > 40)")}, cd=40, chain='dui')

S(FILE, 'legal_dui_rehab', 'Rehab or Rumble', 'fighter',
  [visit("{subject.first} shows up hungover, still wearing the hospital bracelet from the drunk tank. {His} coach is with {him}. The coach says {he} needs 60 days in rehab. {subject.first} says {he} needs a fight in three weeks.", "{subject.coach}")],
  [C("Pay for 60 days of rehab ({$fee})", "spend('medical', vars.fee)", "subject.addiction -= 40", "injure(subject, 9, 'rehab')", "subject.loyalty += 12", "addTrait(subject, 'Sober')", "follow('legal_dui_sober', 12)", result="{subject.first} goes to a facility in the desert with horses. {He} names one of the horses after you. It's not a compliment, but it's not not a compliment.", ethics=2),
   C("Book the fight. Work is the best rehab.", "subject.addiction += 10", "subject.morale += 5", "heat += 1", result="'Work is the best rehab,' you say, to a man currently drinking a beer at 10am.", bot=1, ethics=-2),
   C("Make it {his} problem", "subject.morale -= 5", result="{He} leaves. Unclear where to. Unclear sober.", default=True)],
  roles={"subject": F("true")}, vars={"fee": money(15, 30)}, fu=True, chain='dui')

S(FILE, 'legal_dui_sober', 'Ninety Days Sober', 'fighter',
  [visit("{subject.first} is back: clear-eyed, eight pounds of muscle heavier, and drinking sparkling water like it owes {him} money. {He} wants a main event to prove {he}'s a new person.", "{subject.first} {subject.last}")],
  [C("Give {him} the spotlight", "subject.hype += 12", "subject.morale += 10", "fans += 2", "news('rehab', 0.3, 4)", result="'The New {subject.last}.' The promo package makes the network cry.", bot=1),
   C("Ease {him} back in", "subject.morale += 4", "subject.loyalty += 5", result="A sensible fight on a sensible card. Growth.", default=True)],
  roles={"subject": F("true")}, fu=True, chain='dui')

# ---------------------------------------------------------------- Domestic incident (serious, never parody)
S(FILE, 'legal_domestic', 'A Serious Allegation', 'legal',
  [phone("Police were called to {subject.first} {subject.last}'s home last night after a domestic incident was reported. {He} has been arrested. There are no details yet beyond the police report.", "Your general counsel")],
  [C("Suspend {him} immediately and cooperate fully with authorities", "arrest(subject, 'domestic')", "suspend(subject, 52)", "media += 4", "sponsors += 2", "commission += 3", "follow('legal_domestic_outcome', 8)", result="You suspend {him} and refer the matter to the authorities. The promotion makes a donation to a domestic-violence support organisation. It is the right call.", ethics=3),
   C("Pull {him} from all events while the case proceeds", "arrest(subject, 'domestic')", "media += 1", "follow('legal_domestic_outcome', 8)", result="{He} is pulled from all events while the legal process plays out.", default=True, ethics=1),
   C("Keep {him} on the upcoming card", "arrest(subject, 'domestic')", "media -= 10", "sponsors -= 8", "commission -= 5", "heat += 6", "fans -= 3", "follow('legal_domestic_outcome', 8)", result="Keeping {him} on the card becomes the story. Sponsors, the commission and most of the internet respond in exactly the way you'd expect.", bot=1, ethics=-3)],
  roles={"subject": F(FREE + " && (f.traits.has('Hothead') || f.addiction > 50)")}, weight=4, cd=200, chain='domestic', tags=['serious'])

S(FILE, 'legal_domestic_outcome', 'The Investigation Concludes', 'legal',
  [doc("The criminal case against {subject.last} has concluded. Your general counsel recommends a decision on {his} future with the promotion.", "LEGAL MEMO")],
  [C("Release {him}", "release(subject)", "media += 3", "sponsors += 2", result="{subject.last} is released. You decline to elaborate beyond a short statement.", ethics=2, default=True),
   C("Lift the suspension, with mandatory counselling", "unsuspend(subject)", "media -= 2", "addTrait(subject, 'Reformed')", result="{He} returns with conditions. Some sponsors do not return with {him}.")],
  roles={"subject": F("true")}, fu=True, chain='domestic', tags=['serious'])

# ---------------------------------------------------------------- Tax arc
S(FILE, 'legal_tax_letter', 'A Letter From the Tax People', 'legal',
  [doc("FINAL NOTICE. The tax authority informs {subject.first} {subject.last} that {he} has not filed returns since {his} third pro fight. Amount owed including penalties: {$owed}. {He} has forwarded this letter to you with the message 'lol help'.", "OFFICIAL NOTICE")],
  [C("Lend {him} the money against future purses", "spend('fighter loans', vars.owed)", "subject.loyalty += 10", "subject.debt += vars.owed", "follow('legal_tax_repay', 26)", result="You pay the government. {subject.first} promises to pay you back. {He} immediately buys a jet ski.", ethics=1),
   C("Send {him} to your accountant", "spend('legal', vars.owed * 0.1)", "subject.moneyIQ += 10", result="Your accountant meets {subject.first} for three hours. The accountant then takes a week off.", default=True),
   C("Not your problem", "subject.morale -= 5", "follow('legal_tax_raid', 10)", result="You say 'not my problem'. That is, in fact, a famous last sentence.", bot=1)],
  roles={"subject": F(FREE + " && f.moneyIQ < 40")}, vars={"owed": money(30, 120)}, cd=60, chain='taxes')

S(FILE, 'legal_tax_repay', 'Repayment Day', 'fighter',
  [visit("{subject.first} comes in with a duffel bag. Inside: some cash, a Rolex, three NFTs printed out on paper, and a promise.", "{subject.first} {subject.last}")],
  [C("Take what's there", "earn('loan repayments', vars.owed * 0.5)", "subject.debt -= vars.owed * 0.5", result="You get half your money back and a printed NFT of a cartoon ape. You frame it.", default=True),
   C("Forgive the rest", "subject.loyalty += 15", "subject.debt -= vars.owed", "fighters += 1", result="{He} hugs you and cries. The whole gym hears about it. Good PR. Bad accounting.", ethics=2)],
  roles={"subject": F("true")}, fu=True, chain='taxes')

S(FILE, 'legal_tax_raid', 'The Raid', 'legal',
  [phone("Federal agents just searched {subject.first}'s house. They took computers, boxes of paperwork, and a gold-plated title belt replica. {He} is not under arrest. Yet.", "{subject.manager}")],
  [C("Pay for a tax lawyer ({$fee})", "spend('legal', vars.fee)", "subject.loyalty += 8", "follow('legal_tax_plea', 12)", result="The tax lawyer charges by the minute and talks very slowly.", default=True),
   C("Distance the promotion", "media += 1", "subject.loyalty -= 10", "follow('legal_tax_plea', 12)", result="'{promotion} has no involvement in Mr. {subject.last}'s personal finances,' says the statement, written on a computer {subject.last} bought with company money.")],
  roles={"subject": F("true")}, vars={"fee": money(25, 60)}, fu=True, chain='taxes')

S(FILE, 'legal_tax_plea', 'Plea Agreement', 'legal',
  [doc("{subject.last} pleads guilty to tax evasion. Sentence: repayment plan, fines, and probation. {He} can keep fighting, but every purse will now be garnished by the government.", "COURT RECORD")],
  [C("Restructure {his} contract so it's survivable", "subject.purse *= 1.1", "subject.morale += 5", "subject.legal = 'probation'", result="The tax authority is now {his} biggest fan. They attend every fight. They take 40%.", default=True),
   C("Use it as leverage: lower {his} purse", "subject.purse *= 0.8", "subject.morale -= 10", "subject.legal = 'probation'", "fighters -= 1", result="{He} signs, because what else is {he} going to do.", bot=1, ethics=-2)],
  roles={"subject": F("true")}, fu=True, chain='taxes')

# ---------------------------------------------------------------- one-shot arrests
S(FILE, 'legal_airport', 'Pre-Workout Is Not a Liquid', 'legal',
  [phone("{subject.first} fought a TSA agent at the airport over a 32-ounce jug of pre-workout. {He} called it 'a supplement, not a liquid'. The agent called it 'a liquid'. {He} is in an airport holding room.", "Your travel coordinator")],
  [C("Bail Office", "arrest(subject, 'airport_brawl')", result="Paperwork incoming.", default=True),
   C("Charter {him} a private jet next time ({$fee})", "spend('travel', vars.fee)", "subject.loyalty += 5", "arrest(subject, 'airport_brawl')", result="Private jets: the only airline with no rules and no TSA.", bot=-1)],
  roles={"subject": F(FREE + " && (f.traits.has('Hothead') || f.traits.has('Gym Rat'))")}, vars={"fee": money(8, 20)}, cd=40)

S(FILE, 'legal_phone_smash', "Applebee's Incident", 'legal',
  [sc('social', "VIDEO: {subject.last} grabs a fan's phone at Applebee's and smashes it into 30 pieces. The fan had been filming {him} eating riblets. The riblets were later described as 'excellent'.")],
  [C("Pay the fan for a new phone and a gag order ({$fee})", "spend('settlements', vars.fee)", "heat += 1", result="The fan gets a new phone, two front-row seats and a lawyer's letter. He posts about the seats.", bot=1, ethics=-1),
   C("Let the cops handle it", "arrest(subject, 'phone_smash')", result="{He} spends a night in a cell next to a man arrested for the same thing at a Chili's.", default=True),
   C("Make {him} apologize and buy the guy riblets", "media += 2", "subject.morale -= 3", result="They eat riblets together on camera. It's weirdly touching.", ethics=1)],
  roles={"subject": F(FREE + " && f.traits.has('Hothead')")}, vars={"fee": money(2, 6)}, cd=40)

S(FILE, 'legal_weapon', 'It Was For Bears', 'legal',
  [phone("Airport security found a handgun in {subject.first}'s gym bag. {He} says it was 'for bears'. {He} was flying to Miami.", "Your head of security")],
  [C("Bail Office", "arrest(subject, 'weapons')", "news('scandal', -0.4, 5)", result="It's a whole thing.", default=True),
   C("Suspend {him} for a month on top", "arrest(subject, 'weapons')", "suspend(subject, 4)", "commission += 2", "media += 1", result="The commission likes the suspension. The bears are relieved.", ethics=1)],
  roles={"subject": F(FREE + " && (f.traits.has('Paranoid') || f.traits.has('Hothead'))")}, cd=104, tags=['serious'])

S(FILE, 'legal_possession', 'The Glovebox', 'legal',
  [phone("Routine traffic stop. Officers found enough party favors in {subject.first}'s glovebox to stock a music festival. {He} says the glovebox belongs to {his} cousin. It's {his} car. {He} doesn't have a cousin.", "{subject.manager}")],
  [C("Bail Office, then mandatory rehab", "arrest(subject, 'possession')", "subject.addiction -= 15", "follow('legal_dui_rehab', 1)", result="Paperwork and a rehab brochure, together at last.", ethics=1),
   C("Bail Office and hope it goes away", "arrest(subject, 'possession')", result="It does not go away.", default=True)],
  roles={"subject": F(FREE + " && (f.addiction > 35 || f.traits.has('Party Animal'))")}, cd=60, chain='dui')

S(FILE, 'legal_fan_assault', 'Come Down Here and Say That', 'legal',
  [phone("A heckler at {subject.first}'s public workout yelled 'you're washed!'. {subject.first} went over the barricade. The heckler is fine. The barricade is not. Neither is {subject.first}'s legal situation.", "Your event manager")],
  [C("Bail Office", "arrest(subject, 'assault_fan')", "subject.hype += 5", result="Weirdly, ticket sales go up.", default=True),
   C("Pay off the heckler before charges ({$fee})", "spend('settlements', vars.fee)", "heat += 2", result="The heckler suddenly 'doesn't want to press charges'. He also suddenly owns a boat.", bot=1, ethics=-2)],
  roles={"subject": F(FREE + " && f.traits.has('Hothead')")}, vars={"fee": money(15, 40)}, cd=60)

S(FILE, 'legal_street_race', 'Fast & Furiously Stupid', 'legal',
  [phone("{subject.first} drag raced a car at a red light. The car was an unmarked police cruiser. {He} won the race. {He} lost everything else.", "{subject.manager}")],
  [C("Bail Office", "arrest(subject, 'racing')", "subject.followers *= 1.2", result="The dashcam clip is the most-watched thing {he} has ever done, including fights.", default=True),
   C("Sell the dashcam rights to a car show ({$fee})", "arrest(subject, 'racing')", "earn('licensing', vars.fee)", "commission -= 2", result="The car show buys it. The commission buys a stress ball.", bot=1, ethics=-1)],
  roles={"subject": F(FREE + " && f.traits.has('Reckless Driver')")}, vars={"fee": money(5, 15)}, cd=60, chain='reckless')

S(FILE, 'legal_trespass', 'A 3AM Visit', 'legal',
  [phone("{subject.first} showed up at {his} rival's gym at 3am 'to talk'. The rival was not there. A janitor was. {subject.first} talked to the janitor for two hours. The janitor called the police.", "{subject.manager}")],
  [C("Bail Office", "arrest(subject, 'trespass')", "subject.hype += 4", result="The janitor goes viral. He gets a podcast.", default=True),
   C("Turn it into the promo for the fight", "arrest(subject, 'trespass')", "subject.hype += 10", "commission -= 2", "media -= 1", result="'He came to MY HOUSE.' The poster writes itself.", bot=1)],
  roles={"subject": F(FREE + " && f.rivals.length > 0")}, cd=60)

S(FILE, 'legal_vandal', 'The Billboard', 'legal',
  [sc('social', "Someone spray-painted 'SOFT' and a crude anatomical drawing across a billboard of {subject.last}'s next opponent. Security cameras show it was {subject.last}. {He} also signed it.")],
  [C("Pay for the billboard ({$fee})", "spend('settlements', vars.fee)", "subject.hype += 6", result="The billboard company is paid. The drawing is now an NFT.", default=True),
   C("Let the cops have {him}", "arrest(subject, 'vandalism')", "subject.hype += 8", result="{He} gets community service cleaning billboards. {He} cleans {his} own billboard first.")],
  roles={"subject": F(FREE + " && f.traits.has('Trash Talker')")}, vars={"fee": money(3, 9)}, cd=60)

S(FILE, 'legal_gym_fraud', 'The Lifetime Membership', 'legal',
  [doc("CLASS ACTION: 400 members of '{subject.last} Elite MMA & Smoothie Bar' allege they paid for 'lifetime memberships' before the gym closed after nine days. The gym is now a vape shop. Also owned by {subject.last}.", "NOTICE OF CLASS ACTION")],
  [C("Refund the members from promotion funds ({$fee})", "spend('settlements', vars.fee)", "media += 2", "subject.loyalty += 5", "subject.debt += vars.fee", result="Members get refunds and a free ticket. Some become fans. Most remain furious.", ethics=1),
   C("Let {him} go to court", "arrest(subject, 'gym_fraud')", result="Court it is.", default=True)],
  roles={"subject": F(FREE + " && f.business.length > 0 && f.moneyIQ < 50")}, vars={"fee": money(30, 70)}, cd=104)

S(FILE, 'legal_warrant', 'Missed Court', 'legal',
  [phone("{subject.first} missed a court date because {he} was at a fight camp in Thailand. The judge has issued a bench warrant. {He} lands in four hours.", "Your general counsel")],
  [C("Have a lawyer meet {him} at the airport ({$fee})", "spend('legal', vars.fee)", "commission -= 1", result="The lawyer greets {him} with a sign reading 'YOU ARE UNDER ARREST (SORT OF)'.", default=True),
   C("Tell {him} to stay in Thailand a while", "injure(subject, 8, 'avoiding a warrant')", "heat += 4", result="{He} stays in Thailand for two months. {His} Muay Thai improves. {His} legal situation does not.", bot=1, ethics=-2)],
  roles={"subject": F("f.ours && f.legal == 'bail' && !f.parody")}, vars={"fee": money(5, 15)}, cd=40)

# ---------------------------------------------------------------- system follow-ups referenced by code
S(FILE, 'buried_doc_surfaces', 'Skeletons in the Filing Cabinet', 'legal',
  [phone("Funny story. A {doc} you buried a while back just landed on a reporter's desk. The reporter is calling everyone. Including your mother.", "Your general counsel")],
  [C("Deny everything", "heat += 6", "media -= 5", "news('investigation', -0.6, 7)", result="'I've never seen that document in my life.' Your fingerprints have.", bot=1, ethics=-2, default=True),
   C("Own it and pay the fine ({$fine})", "spend('fines', vars.fine)", "media += 1", "commission -= 3", "heat -= 2", result="You pay the fine and say 'mistakes were made'. Passive voice, the champion of executives.", ethics=1),
   C("Blame an intern", "fighters -= 1", "media -= 2", "heat += 2", result="The intern is very upset. The intern also has screenshots.")],
  vars={"fine": money(10, 40), "doc": "'document'"}, fu=True, chain='buried')

S(FILE, 'doping_whistleblower', 'The Whistleblower', 'doping',
  [phone("A lab tech says {subject.last}'s failed test was buried. She has emails, timestamps and a very calm voice. She's talking to The Pathetic tomorrow unless someone gives her a reason not to.", "Anonymous caller")],
  [C("Come clean: suspend {subject.last} now", "suspend(subject, 52)", "media += 2", "commission += 3", "heat -= 3", "news('doping', -0.3, 6)", result="It's ugly, but it's over. Mostly.", ethics=2),
   C("Offer her a 'consulting role' ({$fee})", "spend('consulting', vars.fee)", "heat += 8", "chaos += 4", "follow('doping_whistleblower_returns', 20)", result="She accepts. Her first consulting report is titled 'Why You Should Be In Prison'.", bot=1, ethics=-3),
   C("Ignore her", "heat += 5", "media -= 8", "news('investigation', -0.8, 9)", result="The Pathetic runs it on the front page. Part one of four.", default=True)],
  roles={"subject": F("f.ours")}, vars={"fee": money(30, 80)}, fu=True, chain='whistle')

S(FILE, 'doping_whistleblower_returns', 'She Kept Copies', 'doping',
  [doc("Turns out your 'consultant' kept copies of everything, including the payment. A federal prosecutor would like to discuss your 'consulting arrangements'.", "SUBPOENA")],
  [C("Lawyer up ({$fee})", "spend('legal', vars.fee)", "heat += 6", result="The lawyers lawyer. Everyone lawyers.", default=True),
   C("Cooperate fully", "heat -= 5", "patience -= 10", "media += 2", result="You cooperate. The board is livid. The prosecutor is delighted.", ethics=2)],
  vars={"fee": money(60, 150)}, fu=True, chain='whistle')

S(FILE, 'scale_scandal', 'The Broken Scale', 'commission',
  [doc("The commission has reviewed weigh-in footage showing an official's hand on the scale during {subject.last}'s weigh-in. There is a lot of finger. They want an explanation.", "COMMISSION INQUIRY")],
  [C("Blame a 'technical malfunction'", "commission -= 6", "heat += 3", result="They do not believe in technical malfunctions that wear wedding rings.", default=True),
   C("Pay the fine and fire the official ({$fine})", "spend('fines', vars.fine)", "commission -= 2", "heat -= 1", result="Someone takes the fall. It isn't you. This time.", ethics=1)],
  roles={"subject": F("true")}, vars={"fine": money(15, 40)}, fu=True)

S(FILE, 'holdout_threat', 'The Holdout', 'business',
  [visit("{subject.first} won't fight until {he} gets a raise. {He}'s posting cryptic pictures of a boxing ring and a crypto exchange logo. {His} manager says {he}'s 'exploring options'.", "{subject.manager}")],
  [C("Give {him} a 25% raise", "raise(subject, 25)", "subject.morale += 15", "subject.loyalty += 10", "fighters += 1", result="{He} posts a picture of a check with your face drawn on it. Affectionately.", ethics=1),
   C("Call {his} bluff", "subject.morale -= 10", "subject.beef += 10", "fans -= 1", result="{He} sits out. The internet takes sides. Your side is smaller.", bot=1, default=True),
   C("Strip {him} of rankings and bench {him}", "subject.hype -= 15", "fighters -= 3", "media -= 2", result="Benched. The locker room is quietly furious.", bot=1, ethics=-1)],
  roles={"subject": F("true")}, fu=True, chain='holdout')
