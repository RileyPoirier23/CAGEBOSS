from dsl import *

FILE = 'fighter'
OURS = "f.ours"

# ---------------------------------------------------------------- Streaming
S(FILE, 'stream_beef', 'Stream Beef', 'fighter',
  [sc('social', "{subject.first} went live for nine hours and spent seven of them roasting {other.first} {other.last}'s haircut, cardio and 'weird little calves'. {other.last} responded with a 40-minute video titled 'RESPONDING TO A CLOWN'. Both have more followers than yesterday.")],
  [C("Book the fight. Strike while the beef is hot.", "rivalry(subject, other)", "subject.hype += 8", "other.hype += 8", "news('feud', 0.3, 5)", result="Two streamers, one cage, zero chill. Pre-sales are up 30%.", bot=2),
   C("Tell them both to knock it off", "subject.morale -= 3", "other.morale -= 3", "media += 1", result="They both go live to talk about how you told them to knock it off.", default=True),
   C("Co-host a 'peace summit' stream yourself", "fans += 2", "media -= 1", "subject.hype += 5", "other.hype += 5", "rivalry(subject, other)", result="The peace summit lasts 11 minutes before someone throws a protein shake. 2.3 million viewers.")],
  roles={"subject": F(OURS + " && f.streaming"), "other": F(OURS + " && f.id != subject.id && f.division == subject.division")}, cd=26, chain='streamers')

S(FILE, 'stream_meltdown', 'Live Meltdown', 'fighter',
  [sc('social', "Mid-stream, {subject.first} read a comment calling {him} 'a bum with a ring light' and lost it for 45 minutes, live, to 80,000 people. {He} threw a chair at the monitor. The monitor won.")],
  [C("Make {him} take a social media break", "subject.followers *= 0.95", "subject.morale -= 4", "media += 1", result="{He} lasts 36 hours, then posts 'I'M BACK' at 4am.", default=True),
   C("Clip it and sell it as fight promo", "subject.hype += 8", "fans += 1", "media -= 2", result="The promo spot is just the chair. It's the best ad you've ever run.", bot=2),
   C("Sign {him} up for a sports psychologist ({$fee})", "spend('wellness', vars.fee)", "subject.morale += 6", "subject.addiction -= 5", result="The psychologist asks how {he} feels. {He} says 'like throwing a chair'. Progress.", ethics=1)],
  roles={"subject": F(OURS + " && f.streaming")}, vars={"fee": money(2, 5)}, cd=30, chain='streamers')

S(FILE, 'stream_deal', 'The Streaming Platform Offer', 'business',
  [phone("A streaming platform wants to sign {subject.first} to an exclusive deal: {$fee} for {him}, and they'll throw your promotion a sponsorship if {he} streams training camp. Catch: {he} streams training camp. Everything. Game plans included.", "Kayden Klout, Klout House Agency")],
  [C("Approve it and take the sponsorship", "earn('sponsors', vars.fee * 0.4)", "subject.followers *= 1.5", "subject.morale += 8", "subject.skills.fightIQ -= 2", result="{His} opponent's coaches watch every minute. They take notes. Big notes.", bot=2),
   C("Approve it, but no game-plan footage", "earn('sponsors', vars.fee * 0.2)", "subject.followers *= 1.3", "subject.morale += 5", result="{He} streams cooking and sparring. The cooking content does better.", default=True),
   C("Veto it", "subject.morale -= 8", "subject.beef += 6", result="{He} streams about how you vetoed it.")],
  roles={"subject": F(OURS + " && f.followers > 200000")}, vars={"fee": money(40, 200)}, cd=52)

S(FILE, 'stream_swatted', 'Swatted', 'weird',
  [phone("Someone swatted {subject.first} live on stream. SWAT team kicked in the door during a sparring session. {His} training partner tried to 'take the back' of an officer. Everyone is fine. The stream got 4 million views.", "{subject.manager}")],
  [C("Pay for {his} security upgrades ({$fee})", "spend('security', vars.fee)", "subject.loyalty += 6", result="New locks, cameras, and a very large dog named Cutman.", ethics=1),
   C("Use the clip in the promo", "subject.hype += 6", "media -= 2", result="Tasteless. Effective.", bot=1, default=True)],
  roles={"subject": F(OURS + " && f.streaming")}, vars={"fee": money(3, 8)}, cd=104, chain='streamers')

S(FILE, 'stream_gambling', 'Gambling Stream Sponsor', 'fighter',
  [sc('social', "{subject.first} has started streaming slot machines for a sketchy online casino. {He}'s up 'six figures' on stream. Off stream, {his} manager says {he}'s down 'mortgage figures'.")],
  [C("Order {him} to stop", "subject.morale -= 5", "subject.debt -= 0", "media += 1", result="{He} stops. For a week.", default=True),
   C("Let it ride, the casino pays well", "earn('sponsors', 10000 * scale)", "subject.debt += 40000 * scale", "addTrait(subject, 'Gambler')", "chaos += 2", result="The casino sends a gift basket. {His} accountant sends a resignation letter.", bot=2, ethics=-2)],
  roles={"subject": F(OURS + " && f.streaming && !f.parody")}, cd=52, chain='streamers')

# ---------------------------------------------------------------- Addiction spiral
S(FILE, 'addiction_signs', 'The Signs', 'fighter',
  [visit("{subject.coach} closes the door behind {him}self. \"{subject.first} missed four sessions this week. Shows up glassy-eyed. Sweats through {his} shirt before warm-ups. I've seen this before, boss. I don't want to see it again.\"", "{subject.coach}")],
  [C("Quietly pay for treatment ({$fee})", "spend('medical', vars.fee)", "subject.addiction -= 35", "injure(subject, 8, 'treatment')", "subject.loyalty += 15", "reveal(subject)", "follow('addiction_recovery', 10)", result="{subject.first} goes to treatment under a fake name: 'Kevin Smith'. Nobody notices. There are a lot of Kevin Smiths.", ethics=3),
   C("Stage an intervention with the team", "subject.addiction -= 15", "subject.morale -= 5", "reveal(subject)", "follow('addiction_relapse_check', 8)", result="Tears, hugs, a PowerPoint. {He} promises to get better. It's a start.", ethics=2, default=True),
   C("As long as {he} makes weight, it's not your business", "subject.addiction += 10", "heat += 2", "follow('addiction_rock_bottom', 6)", result="It becomes your business.", bot=1, ethics=-3)],
  roles={"subject": F(OURS + " && f.addiction > 45")}, vars={"fee": money(20, 45)}, cd=40, chain='addiction')

S(FILE, 'addiction_recovery', 'Out of Treatment', 'fighter',
  [visit("{subject.first} looks different: clear skin, steady hands, a 30-day chip on a chain around {his} neck. {He} wants to talk about speaking publicly about {his} recovery.", "{subject.first} {subject.last}")],
  [C("Support {him} going public", "media += 4", "fans += 2", "subject.hype += 6", "addTrait(subject, 'Sober')", "news('addiction', 0.3, 4)", result="{His} interview is raw and honest. Three other fighters call you that week asking for help. You help them.", ethics=2, default=True),
   C("Keep it private", "addTrait(subject, 'Sober')", "subject.morale += 4", result="Private recovery. {He} thanks you for not making it a storyline. You thank {him} for not making it a lawsuit.")],
  roles={"subject": F("true")}, fu=True, chain='addiction')

S(FILE, 'addiction_relapse_check', 'Relapse', 'fighter',
  [phone("It's {subject.first}'s spouse. {He} relapsed. {He} hasn't been home in two days. The last place anyone saw {him} was a casino buffet at 5am.", "{subject.first}'s family")],
  [C("Send security to find {him} and get {him} to treatment ({$fee})", "spend('medical', vars.fee)", "subject.addiction -= 30", "injure(subject, 8, 'treatment')", "subject.loyalty += 10", "follow('addiction_recovery', 10)", result="They find {him} at the casino, winning, which is somehow the saddest part.", ethics=2),
   C("Pull {him} from all events", "subject.morale -= 10", "follow('addiction_rock_bottom', 4)", result="Pulled. {He} reads about it on {his} phone at the buffet.", default=True)],
  roles={"subject": F("true")}, vars={"fee": money(20, 45)}, fu=True, chain='addiction')

S(FILE, 'addiction_rock_bottom', 'Rock Bottom', 'fighter',
  [phone("{subject.first} showed up to {his} weigh-in so high {he} tried to fight the scale. Commission officials had to escort {him} out. There are 300 phones in the room.", "Your event manager")],
  [C("Suspend {him} and mandate treatment", "suspend(subject, 26)", "subject.addiction -= 30", "commission += 2", "media += 1", "follow('addiction_recovery', 14)", result="It's the right call. {He} hates you for it now. {He} won't later.", ethics=2, default=True),
   C("Cut {him}", "release(subject)", "fighters -= 2", "media -= 1", result="{He}'s gone. The locker room notices how fast it happened.")],
  roles={"subject": F("true")}, fu=True, chain='addiction')

# ---------------------------------------------------------------- Money: trustworthy or not
S(FILE, 'money_advance', 'The Advance', 'fighter',
  [visit("{subject.first} wants an advance on {his} next two purses: {$amount}. Reason given: 'investment opportunity'. When pressed: 'it's a Lamborghini'. When pressed harder: 'it's a down payment on a Lamborghini'.", "{subject.first} {subject.last}")],
  [C("Give {him} the advance", "spend('fighter advances', vars.amount)", "subject.debt += vars.amount", "subject.loyalty += 6", "subject.morale += 5", "follow('money_advance_bust', 10)", result="{He} sends you a picture of the Lambo. It's leased. The advance was for the down payment on the lease.", bot=-1),
   C("Say no", "subject.morale -= 4", result="{He} storms out, then comes back to ask if the gym has free protein bars.", default=True),
   C("Offer a financial advisor instead ({$fee})", "spend('wellness', vars.fee)", "subject.moneyIQ += 15", "subject.morale -= 1", result="The advisor shows {him} a spreadsheet. {He} has never seen a spreadsheet. {He} is moved.", ethics=1)],
  roles={"subject": F(OURS + " && f.moneyIQ < 45")}, vars={"amount": money(10, 40), "fee": money(1, 3)}, cd=26, chain='money')

S(FILE, 'money_advance_bust', 'Repossessed', 'fighter',
  [sc('social', "VIDEO: A tow truck repossesses a matte black Lamborghini from outside {subject.last}'s apartment while {he} chases it in slides yelling 'I'M A PROFESSIONAL ATHLETE'.")],
  [C("Garnish {his} next purse", "earn('loan repayments', vars.amount * 0.5)", "subject.morale -= 6", result="You get some money back. {He} gets a bus pass.", default=True),
   C("Write it off", "subject.loyalty += 8", result="{He} promises never to buy a Lamborghini again. {He} buys a McLaren.", ethics=1)],
  roles={"subject": F("true")}, vars={"amount": money(10, 40)}, fu=True, chain='money')

S(FILE, 'money_savvy', 'The Investor', 'fighter',
  [visit("{subject.first} has been quietly investing {his} purses. {He} owns three laundromats, a storage facility and a small stake in a regional sushi chain. {He}'d like to discuss buying advertising space on your cage.", "{subject.first} {subject.last}")],
  [C("Sell {him} the cage ad ({$amount})", "earn('sponsors', vars.amount)", "subject.loyalty += 5", "subject.star += 2", result="The cage now says 'SUDS & SUSHI'. Nobody understands it. Everyone remembers it.", bot=1),
   C("Ask {him} for investment advice", "wealth += vars.amount * 0.5", "subject.loyalty += 8", result="{He} puts you onto a storage unit REIT. You quietly make money. {He} quietly respects you.", default=True)],
  roles={"subject": F(OURS + " && f.moneyIQ > 70")}, vars={"amount": money(8, 25)}, cd=52, chain='money')

S(FILE, 'money_broke_star', 'Secretly Broke', 'fighter',
  [phone("{subject.first}'s manager, quietly: '{He}'s broke. Like, borrow-money-from-the-cutman broke. {His} family thinks {he}'s a millionaire. If anyone finds out, {he}'ll walk to whoever pays first.'", "{subject.manager}")],
  [C("Restructure {his} deal with a signing bonus ({$amount})", "spend('signing bonuses', vars.amount)", "subject.loyalty += 15", "subject.debt -= vars.amount", "subject.morale += 10", result="{He} pays off {his} debts and sends you a fruit basket. The fruit is a bit sad. The gesture isn't.", ethics=2),
   C("Use it: offer a long, cheap extension", "subject.purse *= 0.85", "subject.loyalty -= 10", "subject.beef += 10", "fighters -= 1", result="{He} signs, because {he} has to. {He} will remember.", bot=2, ethics=-2),
   C("Do nothing", result="{He} keeps pretending. You keep pretending you don't know.", default=True)],
  roles={"subject": F(OURS + " && f.debt > 30000 && f.star > 25")}, vars={"amount": money(20, 60)}, cd=52, chain='money')

S(FILE, 'money_family_leech', 'The Entourage', 'fighter',
  [visit("{subject.first}'s entourage has grown to 14 people, including two cousins, an 'energy healer', and a guy named Spider whose job is 'vibes'. They all want credentials, hotel rooms, and per diems.", "Spider")],
  [C("Pay for the entourage ({$fee})", "spend('travel', vars.fee)", "subject.morale += 8", result="Spider sends you a thank-you voice note. It's eleven minutes long and mostly breathing.", bot=-1),
   C("Two guests max", "subject.morale -= 6", "subject.beef += 4", result="The energy healer puts a hex on you. You feel fine. Mostly.", default=True)],
  roles={"subject": F(OURS + " && f.star > 40")}, vars={"fee": money(5, 15)}, cd=40)

# ---------------------------------------------------------------- Camp & training
S(FILE, 'camp_coach_fight', 'The Coach Fight', 'fighter',
  [visit("{subject.first} fired {his} head coach via text, rehired him via voice note, fired him again via Instagram story, and now wants you to pay for a new coach from Thailand who doesn't speak English or have a visa.", "{subject.first} {subject.last}")],
  [C("Pay for the Thai coach ({$fee})", "spend('training', vars.fee)", "subject.skills.striking += 3", "subject.morale += 5", result="Coach Somchai arrives. He communicates only with kicks. {subject.first}'s striking improves dramatically.", bot=-1),
   C("Make {him} patch it up with {his} old coach", "subject.morale -= 3", "subject.loyalty += 2", result="They hug it out. It's awkward. {His} coach immediately bills {him} for the time spent being fired.", default=True)],
  roles={"subject": F(OURS + " && (f.traits.has('Diva') || f.traits.has('Hothead') || f.traits.has('Perfectionist'))")}, vars={"fee": money(5, 15)}, cd=40)

S(FILE, 'camp_altitude', 'Altitude Camp', 'fighter',
  [visit("{subject.first} wants to move {his} camp to a mountain in Colorado to train at altitude. {He} has found a cabin, a shaman and a goat that {he} says 'will push {him} on runs'.", "{subject.first} {subject.last}")],
  [C("Fund the mountain camp ({$fee})", "spend('training', vars.fee)", "subject.skills.cardio += 4", "subject.morale += 6", result="The goat is the real coach. {His} cardio has never been better.", bot=-1),
   C("Training at sea level is fine", "subject.morale -= 2", result="{He} runs up the stairs of a parking garage instead. Same thing, says nobody.", default=True)],
  roles={"subject": F(OURS + " && (f.traits.has('Gym Rat') || f.traits.has('Perfectionist'))")}, vars={"fee": money(4, 10)}, cd=40)

S(FILE, 'camp_sparring_injury', 'Sparring Accident', 'fighter',
  [phone("{subject.first} got clipped in hard sparring by a 19-year-old nobody. Orbital might be cracked. {His} coach wants to pull {him} from {his} next fight. {subject.first} wants to fight with one eye 'like a pirate'.", "{subject.coach}")],
  [C("Pull {him} and send {him} to a specialist", "injure(subject, 8, 'cracked orbital (sparring)')", "subject.loyalty += 5", "spend('medical', 4000 * scale)", result="Specialist confirms the crack. Six weeks. {He} sulks. Correctly treated sulking.", ethics=1, default=True),
   C("Let {him} fight like a pirate", "subject.damage += 6", "commission -= 2", "heat += 1", result="{He} buys an eyepatch for the weigh-ins. The commission does not find it funny.", bot=1, ethics=-2)],
  roles={"subject": F(OURS + " && f.booked")}, cd=20)

S(FILE, 'camp_sparring_leak', 'Sparring Footage Leaks', 'fighter',
  [sc('social', "Sparring footage leaked: {subject.last} getting dropped by a 135-pound teenager. 6 million views. Comments are mostly crying-laughing emojis. One comment just says 'the chin is gone'.")],
  [C("Release footage of {him} winning other rounds", "subject.hype += 2", "media -= 1", result="It helps a little. The teenager starts a YouTube channel.", default=True),
   C("Sign the teenager", "subject.morale -= 6", "fans += 1", result="The teenager is 4-0 by the end of the year. {subject.first} has never forgiven you.", bot=1)],
  roles={"subject": F(OURS + " && f.star > 20")}, cd=40)

S(FILE, 'camp_bad_cut', 'The Weight Cut From Hell', 'fighter',
  [phone("{subject.first} is 18 pounds over with four days to go. {He}'s in a sauna suit inside a sauna, wrapped in a garbage bag, eating ice chips one at a time. {His} nutritionist quit and took the scale.", "{subject.coach}")],
  [C("Move {him} up a division permanently", "subject.morale += 5", "subject.weightMisses -= 1", result="{He} moves up. {He}'s happier, stronger and immediately eats a lasagna.", ethics=1),
   C("Keep the cut going", "subject.damage += 3", "subject.weightMisses += 1", result="{He} makes weight. {He} looks like a raisin that has seen things.", bot=1, default=True),
   C("Hire a celebrity nutritionist ({$fee})", "spend('training', vars.fee)", "subject.skills.weightCut -= 10", result="The nutritionist uses words like 'macros' and 'water loading'. It works. Science.")],
  roles={"subject": F(OURS + " && f.skills.weightCut > 60")}, vars={"fee": money(3, 8)}, cd=26, chain='weightmiss')

S(FILE, 'camp_gym_switch', 'Gym Switch', 'fighter',
  [visit("{subject.first} wants to leave {subject.gym} for a fancier super-gym in Florida. {His} old gym says {he}'s a traitor. {His} new gym says {he}'s 'family'. Both gyms have opinions about you.", "{subject.first} {subject.last}")],
  [C("Support the move", "subject.skills.fightIQ += 2", "subject.morale += 5", "subject.loyalty += 3", result="{He} posts a picture with new teammates captioned 'new chapter'. {His} old coach posts a picture of a snake.", default=True),
   C("Tell {him} loyalty matters", "subject.morale -= 4", "subject.loyalty -= 3", result="{He} stays, sulking. The gym throws {him} a 'thank you for staying' party. It's tense.")],
  roles={"subject": F(OURS + " && f.age < 31")}, cd=52)

# ---------------------------------------------------------------- Trash talk & rivalries
S(FILE, 'trash_talk_line', 'Crossed the Line', 'fighter',
  [sc('social', "{subject.first} posted that {other.first} {other.last}'s 'whole family taps to strikes'. {other.last}'s mother responded. Her response was better. It's now the most-liked post in the history of the sport.")],
  [C("Book them. Mom gets a ringside seat.", "rivalry(subject, other)", "subject.hype += 8", "other.hype += 10", "fans += 2", "news('feud', 0.3, 5)", result="Mom is now the most famous person on the card.", bot=2),
   C("Fine {subject.first} for unprofessional conduct", "subject.morale -= 6", "media += 1", "subject.beef += 5", result="{He} pays the fine in pennies, delivered by wheelbarrow.", default=True)],
  roles={"subject": F(OURS + " && f.traits.has('Trash Talker')"), "other": F(OURS + " && f.id != subject.id && f.division == subject.division")}, cd=20)

S(FILE, 'rivalry_hotel_lobby', 'Hotel Lobby Brawl', 'fighter',
  [phone("{subject.first} and {other.first} ran into each other in the hotel lobby during fight week. Words were exchanged. Then a potted plant was exchanged. Hotel security has both of them on separate floors.", "Your event manager")],
  [C("Pay for the plant and leak the footage", "spend('damages', 3000 * scale)", "rivalry(subject, other)", "subject.hype += 8", "other.hype += 8", "commission -= 1", result="The footage is grainy and incredible. The plant gets its own fan account.", bot=2),
   C("Fine both of them", "subject.morale -= 4", "other.morale -= 4", "commission += 1", result="Both fined. Both furious. Both, secretly, delighted.", default=True)],
  roles={"subject": F(OURS + " && f.rivals.length > 0"), "other": F("f.ours && subject.rivals.has(f.id)")}, cd=20)

S(FILE, 'rivalry_diss_track', 'The Diss Track', 'weird',
  [sc('social', "{subject.first} released a diss track about {other.first} called '{other.last} Got Cardio Like A Space Heater'. It has a music video. {He} is wearing a fur coat in a pool.")],
  [C("Play it at the next event", "subject.hype += 6", "other.hype += 4", "rivalry(subject, other)", "fans += 1", result="The crowd sings along. {other.last}'s corner does not.", bot=1),
   C("Ignore it", result="Two weeks later {other.last} releases a response track. It's better.", default=True)],
  roles={"subject": F(OURS + " && (f.traits.has('Showman') || f.traits.has('Clout Chaser'))"), "other": F(OURS + " && f.id != subject.id && f.division == subject.division")}, cd=52)

S(FILE, 'rivalry_teammates', 'Teammates No More', 'fighter',
  [visit("{subject.first} and {other.first} train at the same gym and have refused to fight each other for years. Now {subject.first} says {other.first} 'stole {his} parking spot'. {He}'s ready to fight {his} friend.", "{subject.first} {subject.last}")],
  [C("Book the grudge match", "rivalry(subject, other)", "subject.hype += 10", "other.hype += 10", "subject.loyalty -= 3", "news('feud', 0.3, 6)", result="Their coach has to pick a corner. He picks neither. He watches from the bar.", bot=2),
   C("Mediate", "subject.morale -= 2", "other.morale += 2", result="They hug. Next week the parking spot thing happens again.", default=True)],
  roles={"subject": F(OURS), "other": F(OURS + " && f.id != subject.id && f.gym == subject.gym && f.division == subject.division")}, cd=52)

# ---------------------------------------------------------------- Hype & prospects
S(FILE, 'hype_viral_moment', 'Viral Moment', 'fighter',
  [sc('social', "{subject.first} saved a cat from a tree in {his} hometown, then knocked out a guy who was trying to steal the cat. Both acts were filmed. {He} is the most popular person in the country for 72 hours.")],
  [C("Push {him} to a main event slot", "subject.hype += 15", "subject.star += 5", "fans += 2", "news('hype', 0.4, 5)", result="Strike while the cat is hot.", bot=2),
   C("Give the cat a sponsorship", "earn('sponsors', 8000 * scale)", "subject.hype += 8", result="The cat is now sponsored by a cat food company. It makes more than most of your prelim fighters.", default=True)],
  roles={"subject": F(OURS + " && f.hype < 60")}, cd=52)

S(FILE, 'prospect_tip', 'A Tip From the Regional Scene', 'fighter',
  [phone("Old friend of yours runs a regional league out in the sticks. Says he's got a kid, {subject.first} {subject.last}, 'meaner than a raccoon in a dumpster'. Says you should look before someone else does.", "Regional promoter Earl")],
  [C("Send a scout ({$fee})", "spend('scouting', vars.fee)", "scout(subject, 2)", result="The report comes back: real potential. Also real raccoon energy.", default=True, bot=1),
   C("Sign {him} sight unseen", "sign(subject)", "scout(subject, 1)", result="You sign {him}. Earl sends you a fruit basket and an invoice.", bot=1),
   C("Pass", result="Earl calls someone else.")],
  roles={"subject": FA("f.age < 25 && f.status == 'free-agent'", "f.skills.power + f.skills.striking")}, vars={"fee": money(2, 4)}, cd=8, weight=14)

S(FILE, 'prospect_hidden_gem', 'The Hidden Gem', 'fighter',
  [doc("SCOUTING REPORT (handwritten, smells like Copenhagen): '{subject.first} {subject.last}. Raw as a steak tartare. Hands are fast, takedown defense nonexistent. Bit of a weirdo. Could be something.'", "SCOUT REPORT")],
  [C("Sign {him}", "sign(subject)", "scout(subject, 2)", result="Signed. {He} celebrates by eating an entire rotisserie chicken in the parking lot.", bot=1, default=True),
   C("Pay for a full workup first ({$fee})", "spend('scouting', vars.fee)", "scout(subject, 3)", result="The full workup reveals everything. Including the weird stuff.")],
  roles={"subject": FA("f.age < 26", "f.skills.fightIQ + f.skills.cardio")}, vars={"fee": money(8, 15)}, cd=10, weight=12)

# ---------------------------------------------------------------- Family & life
S(FILE, 'family_baby', 'New Baby', 'fighter',
  [visit("{subject.first} is holding a newborn in a tiny pair of fight shorts. {He} wants to miss {his} next fight to be with the family. {He}'s also asking if the baby can walk out with {him} 'someday'.", "{subject.first} {subject.last}")],
  [C("Give {him} paternity leave", "injure(subject, 8, 'paternity leave')", "subject.loyalty += 12", "subject.morale += 10", "fighters += 1", "media += 1", result="{He} sends you a picture of the baby in a tiny promotion T-shirt. The internet adores it.", ethics=2, default=True),
   C("The card needs {him}", "subject.morale -= 10", "subject.beef += 8", "fighters -= 1", result="{He} fights. {He} thinks about the baby the whole time. {He} loses a round to it.", bot=1, ethics=-1)],
  roles={"subject": F(OURS + " && f.kids > 0")}, cd=52)

S(FILE, 'family_divorce', 'The Divorce', 'fighter',
  [phone("{subject.first}'s spouse filed for divorce. The filing lists 'cage fighting' under 'irreconcilable differences' and asks for half of all future purses. {He}'s taking it badly. {He}'s taking it at the gym, very loudly, on a heavy bag.", "{subject.coach}")],
  [C("Give {him} time off and a therapist ({$fee})", "spend('wellness', vars.fee)", "subject.morale += 5", "injure(subject, 4, 'personal leave')", result="Time off and a therapist. {He} says the therapist is 'the toughest opponent' {he}'s faced. Probably true.", ethics=1),
   C("Rage is fuel. Book {him}.", "subject.hype += 6", "subject.morale -= 5", "subject.skills.power += 1", result="{He} fights like a man splitting assets.", bot=1, default=True)],
  roles={"subject": F(OURS + " && f.married")}, vars={"fee": money(2, 5)}, cd=104)

S(FILE, 'family_dad_coach', 'Dad Says...', 'fighter',
  [visit("Kevin Hargrove Sr. is in your office uninvited, wearing a visor and a whistle. \"My boy needs a title shot. Now. He's ready. I've been ready since 1994. Also, I'm his manager now, here's my card, I printed it at Staples.\"", "Kevin Hargrove Sr.")],
  [C("Give the kid a step-up fight", "subject.hype += 4", "subject.morale += 2", result="Sr. calls it 'disrespectful'. Jr. quietly thanks you.", default=True),
   C("Banish Dad from the building", "subject.morale += 8", "subject.loyalty += 10", "subject.beef -= 5", result="Security escorts Sr. out. Jr. smiles for the first time in two years.", ethics=1),
   C("Give Dad the title shot he wants", "subject.hype += 10", "subject.damage += 4", result="Sr. is thrilled. Jr. is terrified. The opponent is a monster.", bot=1, ethics=-1)],
  roles={"subject": F("f.ours && f.id == 'kevin_hargrove_jr'")}, cd=26, chain='dad')

# ---------------------------------------------------------------- Archetype arcs (marquee)
S(FILE, 'goat_crisis', 'The GOAT Problem', 'fighter',
  [phone("It's 4am. {subject.first} {subject.last}'s security guy is calling from a gas station parking lot. '{He}'s fine, boss. {He}'s just... {he} wants to know if you can come get {him}. {He}'s on the roof of the gas station.'", "Big Mike, security")],
  [C("Drive out there yourself", "subject.loyalty += 15", "subject.morale += 5", "wealth -= 0", "follow('goat_crisis_talk', 2)", result="You drive out. {He} climbs down. You eat gas station burritos on the hood of your car at 5am and {he} tells you {he}'s scared of not being the best. It's the realest conversation you've had in years.", ethics=2),
   C("Send security and a lawyer", "spend('legal', 3000 * scale)", "follow('goat_crisis_talk', 3)", result="Handled. Professionally. Coldly.", default=True),
   C("It's {his} life", "subject.beef += 10", "chaos += 3", "follow('goat_crisis_talk', 2)", result="By sunrise, there's a video. By noon, there's a hashtag.", bot=1)],
  roles={"subject": F("f.ours && f.archetype == 'The Troubled GOAT'")}, cd=30, chain='goat')

S(FILE, 'goat_crisis_talk', 'Do We Keep Him?', 'fighter',
  [memo("The board has asked: is {subject.last} worth it? Revenue from {his} fights: enormous. Legal bills, PR crises and sponsor apologies: also enormous. They want a recommendation by Friday.", "MEMO: RE: {subject.last}")],
  [C("He's the GOAT. We keep him.", "patience -= 4", "subject.loyalty += 10", "chaos += 2", result="The board grumbles. The PPV buys continue.", bot=2, default=True),
   C("One more incident and he's gone", "subject.morale -= 4", "patience += 3", "flag.goat_last_chance = 1", result="You draw a line. {He} says {he} understands. {He} doesn't.", ethics=1),
   C("Trade him to a rival for cash", "toRival(subject, rival)", "earn('transfer fees', 400000 * scale)", "fans -= 6", "patience += 5", result="{He} leaves. The rival celebrates. You check your bank account and feel weird.")],
  roles={"subject": F("true"), "rival": RIV()}, fu=True, chain='goat')

S(FILE, 'superstar_equity', 'The Equity Demand', 'business',
  [visit("{subject.first} strolls in wearing a suit that costs more than your car, followed by a lawyer, a business manager and a whiskey sommelier. \"I want equity. A piece of the company. I built this place.\" (He did not build this place.)", "{subject.first} {subject.last}")],
  [C("Give {him} 2% equity", "subject.loyalty += 25", "subject.morale += 15", "patience -= 10", "flag.superstar_equity = 1", result="{He} posts a picture of the contract. Every other fighter on the roster sees it.", ethics=1),
   C("Offer a huge PPV-points deal instead", "raise(subject, 40)", "subject.loyalty += 10", "subject.morale += 8", result="Points, not equity. {He} accepts after pretending to think for four hours.", default=True, bot=1),
   C("Laugh {him} out of the room", "subject.beef += 20", "subject.morale -= 10", "follow('superstar_boxing', 6)", result="{He} laughs back. {His} lawyer does not.", bot=1)],
  roles={"subject": F("f.ours && f.archetype == 'The Loudmouth Superstar'")}, cd=60, chain='superstar')

S(FILE, 'superstar_boxing', 'The Boxing Temptation', 'business',
  [phone("{subject.first} has announced a boxing match against a world champion. Nine figures. {He}'s still under contract with you. {His} lawyer says the contract 'only covers cage fighting, technically'.", "Your general counsel")],
  [C("Co-promote the boxing match and take a cut", "earn('co-promotion', 900000 * scale)", "subject.loyalty += 10", "fans += 3", "injure(subject, 12, 'boxing camp')", result="{He} loses on points in a fun fight. You make an obscene amount of money. Boxing purists weep.", bot=2),
   C("Sue to stop it", "spend('legal', 200000 * scale)", "subject.beef += 25", "subject.loyalty -= 20", "media -= 2", result="The lawsuit drags. {He} posts boxing gloves with your face on them.", default=True),
   C("Let {him} go", "release(subject)", "fans -= 5", "fighters += 1", result="{He} leaves for boxing. {He}'s back within two years. They always come back.")],
  roles={"subject": F("true")}, cd=104, fu=True, chain='superstar', acts=[2, 3, 4, 5])

S(FILE, 'pious_retirement', 'Hanging Up The Gloves', 'fighter',
  [visit("{subject.first} sits down quietly. \"I promised my father I would stop at the top. I am at the top. I will fight once more, or never again. You decide what is respectful.\"", "{subject.first} {subject.last}")],
  [C("Honor {his} wishes: retire undefeated", "retire(subject)", "media += 5", "fans += 3", "fighters += 2", "news('retirement', 0.3, 7)", result="{He} leaves {his} gloves in the center of the cage. The arena is silent. Then it explodes.", ethics=2, default=True),
   C("Offer a historic purse for one last fight", "raise(subject, 80)", "subject.morale -= 3", "follow('pious_last_fight', 1)", result="{He} agrees, out of respect for the fans. {His} father does not answer your calls.", bot=2)],
  roles={"subject": F("f.ours && f.archetype == 'The Pious Grappler' && f.champ")}, cd=200, once=True, chain='pious')

S(FILE, 'pious_last_fight', 'One Last Time', 'fighter',
  [sc('narration', "The whole world is watching {subject.first}'s final fight announcement. Every outlet carries it. Ticket resale prices hit four figures.")],
  [C("Make it the main event of the year", "subject.hype += 25", "fans += 4", "network += 4", result="The biggest gate in your history is guaranteed.", default=True)],
  roles={"subject": F("true")}, fu=True, chain='pious')

S(FILE, 'payprotest_public', 'Pay Me Publicly', 'business',
  [sc('social', "{subject.first} posted a 14-slide carousel comparing {his} purse to the promotion's revenue. Slide 9 is a pie chart. Slide 12 is a picture of your boat. Slide 14 says 'fighters deserve better'. It has a million likes.")],
  [C("Give {him} a big raise publicly", "raise(subject, 40)", "fighters += 4", "media += 3", "subject.loyalty += 10", "flag.fairpay += 2", result="{He} thanks you publicly. Thirty other fighters immediately call you.", ethics=2),
   C("Respond with your own carousel", "media -= 3", "fighters -= 3", "subject.beef += 15", "news('pay', -0.5, 6)", result="Your carousel has a pie chart too. Your pie chart is worse.", bot=1, default=True),
   C("Freeze {him} out of title fights", "subject.hype -= 10", "fighters -= 5", "subject.beef += 25", "flag.underpay += 2", "follow('payprotest_leaves', 12)", result="{He} sits out. The union drive gains a mascot.", bot=1, ethics=-2)],
  roles={"subject": F("f.ours && (f.archetype == 'The Pay Protester' || (f.traits.has('Business Savvy') && f.star > 50))")}, cd=52, chain='pay')

S(FILE, 'payprotest_leaves', 'Free Agent Bet', 'business',
  [phone("{subject.first} is letting {his} contract run out to 'bet on {him}self'. Rival promotions are lining up. So is a boxing promoter. So is a slap league, inexplicably.", "{subject.manager}")],
  [C("Make a record offer", "raise(subject, 60)", "subject.loyalty += 15", "flag.fairpay += 1", result="{He} stays, at a price. The price is a lot.", default=True),
   C("Let {him} walk", "toRival(subject, rival)", "fans -= 4", "fighters -= 2", result="{He} leaves and becomes the face of a rival. Every interview mentions you.")],
  roles={"subject": F("true"), "rival": RIV()}, fu=True, chain='pay')

S(FILE, 'wholesome_too_nice', 'Too Nice to Sell', 'fighter',
  [memo("Marketing note: {subject.first} {subject.last} is the most beloved fighter on the roster and the worst at selling fights. In a recent press conference {he} complimented {his} opponent's shoes for six minutes. Ticket sales dipped 8%.", "MARKETING MEMO")],
  [C("Pair {him} with a trash talker", "subject.hype += 6", "fans += 1", result="The trash talker calls {him} soft. {He} sends the trash talker a gift basket. The fight sells out because the internet ships them.", bot=1, default=True),
   C("Lean into it: 'The Nicest Man in Fighting' campaign", "subject.star += 4", "sponsors += 3", "media += 2", result="Family brands line up. A cereal company puts {him} on a box.", ethics=1)],
  roles={"subject": F(OURS + " && f.traits.has('Wholesome') && f.star > 30")}, cd=52)

S(FILE, 'gatekeeper_toll', 'Nobody Wants The Toll Booth', 'fighter',
  [visit("{subject.first} {subject.last} hasn't had a fight booked in four months because every prospect's manager turns the fight down. {He}'s sitting in your office eating a sandwich {he} brought from home.", "{subject.first} {subject.last}")],
  [C("Make it mandatory: beat the Toll Booth to get ranked", "subject.morale += 10", "subject.loyalty += 8", "fighters -= 1", result="The prospects complain. Then they lose. The Toll Booth is open for business.", bot=1),
   C("Pay {him} a 'show up' bonus to stay patient ({$fee})", "spend('bonuses', vars.fee)", "subject.morale += 6", result="{He} buys a new sandwich. A premium one.", default=True)],
  roles={"subject": F("f.ours && f.archetype == 'The Moneyweight Gatekeeper'")}, vars={"fee": money(3, 6)}, cd=26)

S(FILE, 'weightmiss_again', 'Buffet Killer Strikes Again', 'fighter',
  [sc('social', "{subject.first} posted a story from a Brazilian steakhouse with the caption 'cutting season starts tomorrow'. {He} is fighting in nine days. {He} is 27 pounds over.")],
  [C("Move {him} to catchweight now and fine {him}", "subject.purse *= 0.8", "subject.morale -= 4", result="{He} accepts the fine and orders dessert.", default=True),
   C("Fly in a chef to babysit {his} diet ({$fee})", "spend('training', vars.fee)", "subject.skills.weightCut -= 6", result="The chef hides the snacks. {He} finds them.", ethics=1),
   C("Sponsor deal with the steakhouse", "earn('sponsors', 15000 * scale)", "subject.weightMisses += 1", result="The steakhouse is thrilled. The commission is not.", bot=2)],
  roles={"subject": F(OURS + " && (f.archetype == 'The Weight-Miss Repeat Offender' || f.weightMisses >= 2)")}, vars={"fee": money(3, 7)}, cd=20, chain='weightmiss')

S(FILE, 'memekid_viral', 'Meme Kid Problems', 'fighter',
  [visit("{subject.first} wants a main event slot because {his} last TikTok got 40 million views. {His} record is {subject.wins}-{subject.losses}. {His} wrestling is 'theoretical'. {His} manager is {his} roommate, who is holding a ring light.", "{subject.first} {subject.last}")],
  [C("Give {him} the main event", "subject.hype += 15", "subject.followers *= 1.3", "fans += 2", "media -= 2", "subject.damage += 3", result="It sells. {He} either becomes a star or gets folded like laundry. Content either way.", bot=2),
   C("Develop {him} slowly", "subject.skills.wrestling += 4", "subject.morale -= 4", result="{He} posts about 'the system' keeping {him} down. From a gym. Training. Getting better.", default=True, ethics=1)],
  roles={"subject": F(OURS + " && (f.archetype == 'The Meme Kid' || (f.followers > 1000000 && f.wins < 10))")}, cd=40)

S(FILE, 'influencer_wants_in', 'The Influencer Wants In', 'business',
  [phone("The {subject.first} {subject.last} camp wants an MMA debut in your cage. 30 million followers, an energy drink, and a lawyer for every possible outcome. Their only condition: hand-picked opponent. Preferably 'retired, old, or a dentist'.", "{subject.manager}")],
  [C("Sign {him} for a circus fight", "sign(subject)", "fans -= 2", "network += 5", "sponsors += 4", "media -= 2", result="The purists scream. The network cries tears of joy. The buys are absurd.", bot=2),
   C("Sign {him}, but {he} fights a real opponent", "sign(subject)", "fans += 2", "media += 2", "subject.morale -= 6", result="'Real opponent' is the scariest phrase {his} camp has ever heard.", ethics=1),
   C("Not in my cage", "fans += 2", "network -= 3", result="{He} signs with a rival and outsells your next two events. Still, integrity.", default=True)],
  roles={"subject": FA("f.archetype == 'The Influencer Crossover'")}, cd=104, once=True, acts=[2, 3, 4, 5])

S(FILE, 'podcaster_says_something', 'He Said What On The Podcast', 'speech',
  [sc('social', "On {his} four-hour stream, {subject.first} said something so offensive that three sponsors pulled out before the clip finished loading. Half the comments are furious. The other half are a problem in their own right.")],
  [C("Suspend {him}", "suspend(subject, 8)", "sponsors += 2", "media += 3", "fans -= 2", "addTrait(subject, 'Martyr Complex')", result="{He} streams about the suspension. {His} viewership doubles.", ethics=1),
   C("Force an apology video", "media += 1", "fans -= 1", "subject.morale -= 6", "follow('podcaster_apology', 1)", result="Filming begins in a car, as is tradition.", default=True),
   C("'Free speech.' Do nothing.", "sponsors -= 6", "dropSponsors(1)", "fans += 2", "media -= 5", "heat += 2", "news('speech', -0.6, 7)", result="Sponsors flee. A segment of fans rallies. It's a mess either way.", bot=1, ethics=-2),
   C("Cut {him}", "release(subject)", "sponsors += 3", "media += 2", "fans -= 3", "fighters -= 1", result="{He} launches 'The Uncancellable Podcast' within the hour.")],
  roles={"subject": F(OURS + " && !f.parody && (f.archetype == 'The Unfiltered Podcaster' || (f.streaming && f.traits.has('Political')) || f.traits.has('Conspiracy Poster'))")}, cd=26, chain='speech')

S(FILE, 'podcaster_apology', 'The Apology Video', 'speech',
  [sc('social', "{subject.first}'s apology video: filmed in a car, white T-shirt, long pauses. 'If anyone was offended...' The internet rates it 2/10. A body-language expert rates it 'hostage video'.")],
  [C("Accept it and move on", "media += 1", "subject.morale += 2", result="Moved on. For now.", default=True),
   C("Make {him} do community service with the people {he} insulted", "media += 4", "subject.morale -= 4", "addTrait(subject, 'Reformed')", result="Genuinely awkward. Genuinely helpful. {He} learns something, possibly.", ethics=2)],
  roles={"subject": F("true")}, fu=True, chain='speech')
