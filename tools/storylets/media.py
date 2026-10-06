from dsl import *

FILE = 'media'
HELL = "f.id == 'ariel_hellwani'"
BRAILLE = "f.id == 'braille_sonnen'"

# ---------------------------------------------------------------- The insider nemesis
S(FILE, 'insider_scoop', 'Scooped Again', 'media',
  [sc('social', "{reporter.name}: 'Sources tell me {promotion} is finalizing {subject.first} {subject.last} vs. a top contender for next month.' You haven't even called {subject.first}'s manager yet. You were going to do that after lunch.", "{reporter.name}", "reporter")],
  [C("Confirm it to save face", "media += 1", "reporter.rel += 5", "subject.hype += 4", result="You confirm. He thanks you for confirming. He already knew.", default=True),
   C("Change the fight just to make him wrong", "reporter.rel -= 10", "fans -= 1", "subject.morale -= 3", result="You book something else entirely. He tweets 'Plans changed. Sources tell me it's because I reported it.' He's right.", bot=1),
   C("Ban him", "ban(reporter)", "media -= 5", "reporter.rel -= 30", "follow('insider_ban_backfire', 3)", result="Banned. You feel great for about four minutes.")],
  roles={"reporter": R(HELL + " && !f.banned"), "subject": F("f.ours && f.star > 30")}, cd=12, weight=14, chain='insider')

S(FILE, 'insider_ban_backfire', 'The Ban Backfires', 'media',
  [sc('headline', "THE PRESIDENT BANNED A REPORTER FOR REPORTING. Every outlet, including the ones that hate {reporter.name}, runs it. Three fighters post 'Free {reporter.last}' T-shirts. Somebody is selling the T-shirts.")],
  [C("Unban him and pretend it never happened", "unban(reporter)", "media += 2", "reporter.rel += 5", result="Unbanned. He tweets a single word: 'Sources.'", default=True),
   C("Keep the ban", "media -= 6", "heat += 2", "follow('media_mole_hunt', 2)", result="You keep the ban. His scoops get MORE accurate. Someone inside is feeding him.", bot=1)],
  roles={"reporter": R(HELL)}, fu=True, chain='insider')

S(FILE, 'insider_feed_leak', 'Feed Him a Leak', 'media',
  [phone("{reporter.name} on the line, unusually polite. 'Hey, I'd love to get something before anyone else this week. Off the record, anything you can give me?'", "{reporter.name}", "reporter")],
  [C("Feed him a real exclusive", "reporter.rel += 15", "media += 3", "fans += 1", result="He breaks it with 'I'm told by a source with direct knowledge'. You are the direct knowledge. It feels weirdly great.", default=True),
   C("Feed him a fake story to burn him", "reporter.rel -= 20", "media -= 2", "chaos += 2", result="He reports a fight that doesn't exist. He finds out within hours. He will never forget.", bot=1, ethics=-1),
   C("Nothing today", "reporter.rel -= 3", result="'Understood.' He'll get it from someone else.")],
  roles={"reporter": R(HELL)}, cd=20, chain='insider')

S(FILE, 'media_mole_hunt', 'The Mole Hunt', 'media',
  [memo("Every confidential decision this month has leaked within an hour. Legal recommends an internal investigation. Suspects: the matchmaker, your assistant, the cutman coordinator, and a guy named Rick nobody remembers hiring.", "MEMO: CONFIDENTIAL (LOL)")],
  [C("Plant different fake info with each suspect", "follow('media_mole_reveal', 3)", "heat += 1", result="The canary trap is set. Four suspects, four different fake stories about a fight with a bear.", bot=1, default=True),
   C("Drop it", "media -= 1", result="The leaks continue. Rick gets a promotion.")],
  fu=True, chain='insider')

S(FILE, 'media_mole_reveal', 'The Mole Revealed', 'media',
  [doc("{reporter.name} has reported that 'the promotion is negotiating a fight with a bear'. Only one person was told the bear story: Rick. Nobody remembers hiring Rick. Rick, it turns out, is {reporter.name}'s cousin.", "INTERNAL INVESTIGATION REPORT")],
  [C("Fire Rick", "media += 1", "reporter.rel -= 10", "flag.mole_caught = 1", result="Rick is escorted out. He takes a stapler and a framed photo of you that he apparently kept on his desk.", default=True),
   C("Keep Rick and use him to feed stories", "reporter.rel += 5", "media += 3", "chaos += 1", "flag.mole_turned = 1", result="Rick becomes a double agent. He's surprisingly good at it. He asks for a raise.", bot=1)],
  roles={"reporter": R(HELL)}, fu=True, chain='insider')

# ---------------------------------------------------------------- Investigative series (multi-part)
S(FILE, 'expose_inquiry', 'A Polite Email', 'media',
  [doc("Dear {president}: I'm {reporter.name} from {reporter.outlet}. I'm working on a story about {promotion}'s treatment of fighters, its finances, and several 'buried' documents. I'd welcome your comment. I have 48 hours of questions. Kind regards.", "EMAIL")],
  [C("Sit down for a full interview", "reporter.rel += 15", "follow('expose_part1', 6)", "flag.expose_cooperated = 1", result="You talk for two hours. You say 'off the record' nine times. It is not off the record.", ethics=1),
   C("'No comment'", "follow('expose_part1', 6)", result="'{promotion} declined to comment.' The classic.", default=True),
   C("Threaten to sue", "spend('legal', 50000 * scale)", "reporter.rel -= 25", "heat += 2", "follow('expose_part1', 4)", result="The legal threat becomes paragraph one of the story.", bot=1)],
  roles={"reporter": R("f.outletType == 'serious'")}, cond="act >= 3 && (heat > 25 || flag('buried') > 2 || flag('underpay') > 4)", once=True, chain='expose')

S(FILE, 'expose_part1', 'Part One: The Desk', 'media',
  [sc('headline', "INVESTIGATION, PART 1 OF 4: Inside {promotion}, where paperwork goes to die. Former staff describe a filing system of 'shredder, drawer, or the President's car'. Twelve sources. Photographs. A diagram.")],
  [C("Release a rebuttal", "media -= 2", "heat += 2", "follow('expose_part2', 3)", result="Your rebuttal has eleven typos. They screenshot every one.", default=True),
   C("Announce an independent compliance review", "spend('consulting', 100000 * scale)", "media += 2", "heat -= 3", "commission += 2", "follow('expose_part2', 3)", result="A compliance firm arrives. They wear identical blue suits. They find more than you hoped.", ethics=2)],
  fu=True, chain='expose')

S(FILE, 'expose_part2', 'Part Two: The Money', 'media',
  [sc('headline', "INVESTIGATION, PART 2 OF 4: The Money. How {promotion} pays fighters 15% of revenue while the President's lifestyle includes, per receipts, 'a jet ski, a second jet ski, and a jet ski for the jet ski'.")],
  [C("Raise minimum purses immediately", "allFighters('morale', 6)", "fighters += 6", "patience -= 5", "flag.fairpay += 3", "follow('expose_part3', 3)", result="You raise minimum purses before Part 3. The reporter notes this in Part 3, generously.", ethics=2),
   C("Ride it out", "fighters -= 4", "media -= 3", "follow('expose_part3', 3)", result="Two more parts. Deep breaths.", default=True)],
  fu=True, chain='expose')

S(FILE, 'expose_part3', 'Part Three: The Bodies', 'media',
  [sc('headline', "INVESTIGATION, PART 3 OF 4: The Damage. Former fighters describe memory loss, unpaid medical bills, and a promotion that 'treated brain scans like optional paperwork'. This part is not funny. It isn't meant to be.")],
  [C("Fund a retired fighters' health program", "spend('fighter health fund', 500000 * scale)", "media += 6", "fighters += 8", "heat -= 6", "follow('expose_part4', 3)", result="You fund it. Fully. Some things are just right.", ethics=3),
   C("Issue a statement about 'risk being inherent'", "media -= 6", "fighters -= 5", "heat += 4", "follow('expose_part4', 3)", result="The statement is accurate and terrible.", default=True, bot=1)],
  fu=True, chain='expose')

S(FILE, 'expose_part4', 'Part Four: The Boss', 'media',
  [sc('headline', "INVESTIGATION, PART 4 OF 4: The Boss. A portrait of {president}. Loud, chaotic, occasionally generous, frequently reckless. 'He's not evil,' one source says. 'He's just never once read a document.'")],
  [C("Frame it and hang it in the office", "fans += 2", "media += 1", result="'Never once read a document' is now printed on a T-shirt you wear to weigh-ins.", default=True),
   C("Sue for defamation", "spend('legal', 300000 * scale)", "heat += 5", "media -= 4", result="It goes nowhere. Truth is a defense. Many things in the article are true.", bot=1)],
  fu=True, chain='expose')

# ---------------------------------------------------------------- Podcasts, Braille Sonnen, tabloids
S(FILE, 'brogan_invite', 'The Joe Brogan Experience', 'media',
  [phone("Joe Brogan wants you on the podcast. 'Four hours, man, totally relaxed. We'll talk fights, elk meat, the pyramids, it's entirely possible we talk about DMT.'", "Joe Brogan's producer")],
  [C("Do the podcast", "fans += 3", "media += 2", "heat += 1", result="You say something you shouldn't around hour three. Nobody notices because Joe is showing a picture of a chimpanzee ripping a guy's face off.", default=True),
   C("Send your best fighter instead", "fans += 2", "subject.hype += 10", "subject.followers *= 1.15", result="{subject.first} goes on for three hours and becomes a mainstream celebrity overnight.", bot=1)],
  roles={"subject": F("f.ours && f.star > 30")}, cd=26)

S(FILE, 'braille_breakdown', "Braille's Breakdown", 'media',
  [sc('social', "Braille Sonnen posted a 40-minute video breaking down {subject.first} {subject.last}'s last fight. He describes '{subject.last}'s beautiful southpaw stance' ({subject.last} is orthodox) and the 'gorgeous blue shorts' (they were red). At the end, he leans into the camera and says: 'I don't actually know what I'm talking about. I can't see shit.' 3 million views.", "Braille Sonnen", "reporter")],
  [C("Share it on the official account", "fans += 2", "subject.hype += 4", "reporter.rel += 10", result="The official account shares it with the caption 'he's not wrong (he is wrong)'. Engagement goes through the roof.", default=True),
   C("Hire Braille for the broadcast team", "network += 2", "fans += 3", "media -= 1", "reporter.rel += 25", "setFlag('braille_on_broadcast', 1)", result="Braille joins the booth. His first call: 'And THAT is a beautiful left hook' during a takedown. He's an instant cult hero.", bot=1)],
  roles={"reporter": R(BRAILLE), "subject": F("f.ours && f.weeksSinceFight < 3")}, cd=16, weight=12, chain='braille')

S(FILE, 'braille_prediction', "Braille's Big Prediction", 'media',
  [phone("Braille Sonnen is live on air predicting your next main event. 'I've studied the tape. Well, I've listened to the tape. {subject.last} wins by flying knee in round one, then retires to raise llamas. Mark it down.' Betting lines are moving because of this.", "Braille Sonnen", "reporter")],
  [C("Call in live and play along", "fans += 2", "reporter.rel += 5", result="You call in. Braille says 'Who's this? Sounds bald.' Iconic.", default=True),
   C("Ask the betting sites to ignore him", "media -= 1", "reporter.rel -= 5", result="They don't. Braille is now the most influential handicapper in the sport.", bot=1)],
  roles={"reporter": R(BRAILLE), "subject": F("f.ours && f.booked && f.star > 25")}, cd=16, weight=10, chain='braille')

S(FILE, 'braille_interview_fail', 'Braille Interviews The Wrong Guy', 'media',
  [sc('social', "Braille Sonnen did a 12-minute backstage interview with {subject.first} {subject.last}. It was a janitor. The janitor answered every question and announced he wants a title shot. The clip is the most-viewed thing your promotion posted all year.", "Braille Sonnen", "reporter")],
  [C("Give the janitor a prelim fight", "fans += 4", "commission -= 2", "media += 1", result="The janitor loses in 40 seconds and gets a fight-night bonus anyway, from the fans, via GoFundMe.", bot=1),
   C("Just enjoy it", "fans += 2", result="Pure content.", default=True)],
  roles={"reporter": R(BRAILLE), "subject": F("f.ours")}, cd=26, weight=8, chain='braille')

S(FILE, 'tmz_ambush', 'Camera Guy Dave', 'media',
  [sc('visit', "Camera Guy Dave from TMZee is outside the steakhouse as you leave. 'YO PREZ! Quick question! Is it true {subject.first} {subject.last} cried during weigh-ins? Do YOU cry? When did you last cry? Can you cry now?'", "Camera Guy Dave")],
  [C("'Everybody cries, Dave.'", "media += 2", "fans += 1", result="'Everybody cries, Dave' becomes a meme and a T-shirt.", default=True),
   C("Push past him", "media -= 1", result="The push is captioned 'PREZ GETS PHYSICAL'. It was a shoulder brush.", bot=1)],
  roles={"subject": F("f.ours && f.star > 30")}, cd=20)

S(FILE, 'conspiracy_stream', 'TruthBomb Live Says It Was Rigged', 'media',
  [sc('social', "Rex Bunkerman of TruthBomb Live is streaming a frame-by-frame 'investigation' proving your last main event was scripted. His evidence: 'Why would a guy fall down if he wasn't paid to?' 400,000 people are watching.")],
  [C("Ignore him", result="He streams for 9 hours. Ad revenue: impressive.", default=True),
   C("Invite him to the next event", "media -= 1", "fans += 1", "chaos += 1", result="He attends wearing a tinfoil lanyard. He watches a KO from cageside, goes pale, and admits 'that one seemed real'.", bot=1)],
  cd=40)

S(FILE, 'forum_rumor', 'The Forum Rumor', 'media',
  [sc('social', "An anonymous Undergrowth forum post claims {subject.first} {subject.last} is 'secretly retiring to become a professional bowler'. It has 900 replies. {subject.last}'s mother called {his} coach to ask about bowling.")],
  [C("Deny it", "media += 1", result="You deny it. The forum now believes it more.", default=True),
   C("Book {him} a bowling sponsorship", "earn('sponsors', 10000 * scale)", "subject.followers *= 1.05", result="{He} bowls a 74 on a sponsored stream. The rumor is now partially true.", bot=1)],
  roles={"subject": F("f.ours && f.star > 20")}, cd=30)

S(FILE, 'reporter_fighter_beef', 'Reporter vs. Fighter', 'media',
  [sc('social', "{subject.first} {subject.last} called {reporter.name} 'a fat nerd with a lanyard' after a mildly critical article. {reporter.name} responded with {subject.last}'s full record against southpaws. It's brutal. {subject.last} has gone very quiet.")],
  [C("Make {subject.first} apologize", "subject.morale -= 3", "reporter.rel += 8", "media += 2", result="The apology is three words long. Two of them are 'my bad'.", default=True, ethics=1),
   C("Book {subject.first} on a podcast to respond", "subject.hype += 5", "reporter.rel -= 10", "media -= 2", result="The response podcast is two hours of {subject.first} reading the article aloud and saying 'nah'.", bot=1)],
  roles={"subject": F("f.ours && (f.traits.has('Hothead') || f.traits.has('Trash Talker'))"), "reporter": R("!f.banned")}, cd=20)

S(FILE, 'purse_report_leak', 'The Purse Report Strikes', 'media',
  [sc('headline', "The Purse Report has published your entire roster's salaries in a sortable spreadsheet. Column H is labelled 'what they should be paid'. Column I is labelled 'what the President's boat cost'.")],
  [C("Commission an independent pay study", "spend('consulting', 50000 * scale)", "fighters += 3", "media += 1", result="The study concludes you should pay fighters more. You knew. You paid for the knowing.", ethics=1),
   C("Call it fake news", "fighters -= 4", "media -= 2", "news('pay', -0.5, 6)", result="It isn't fake. Column I is especially not fake.", default=True, bot=1)],
  cond="act >= 2 && flag('underpay') > 1", cd=40)
