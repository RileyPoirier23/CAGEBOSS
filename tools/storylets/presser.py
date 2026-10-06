from dsl import *

FILE = 'presser'
REP = lambda w='true': R(w)


def Q(id, title, question, choices, where='true', cond=None, cd=8, weight=10, speaker=True, extra_roles=None):
    roles = {"reporter": REP(where)}
    if extra_roles:
        roles.update(extra_roles)
    S(FILE, id, title, 'presser', [sc('presser', question, "{reporter.name}, {reporter.outlet}", "reporter")], choices, roles=roles, cond=cond, cd=cd, weight=weight)


def tones(deflect=None, attack=None, joke=None, truth=None, wwsh=None, storm=None):
    out = []
    if deflect: out.append(C(deflect[0], *deflect[1], result=deflect[2], tone='deflect', default=True))
    if attack: out.append(C(attack[0], *attack[1], result=attack[2], tone='attack', bot=1))
    if joke: out.append(C(joke[0], *joke[1], result=joke[2], tone='joke'))
    if truth: out.append(C(truth[0], *truth[1], result=truth[2], tone='truth', ethics=1))
    if wwsh: out.append(C(wwsh[0], *wwsh[1], result=wwsh[2], tone='wwsh'))
    if storm: out.append(C(storm[0], *storm[1], result=storm[2], tone='storm'))
    return out


STD_WWSH = ("\"We'll see what happens.\"", ["media -= 0", "reporter.rel -= 1"], "The most famous non-answer in combat sports. It works, sort of.")
STD_STORM = ("Get up and leave", ["media -= 3", "fans += 1", "reporter.rel -= 8", "news('presser', -0.3, 4)"], "You walk out. The headline writes itself.")

Q('pq_pay', 'The Pay Question', "Fighter pay. Your fighters get a fraction of what boxers get. A fraction of a fraction. When does that change?", tones(
    deflect=("\"Our fighters are paid very well, and they all have incredible opportunities.\"", ["media -= 1", "fighters -= 1"], "Nobody in the room believes it, including the microphone."),
    attack=("\"Go fight then, if you know so much about it.\"", ["media -= 3", "fans += 1", "reporter.rel -= 10", "news('presser', -0.4, 4)"], "It plays great on social media. It plays terribly in the locker room."),
    truth=("\"You're right. We're going to do better. It starts with minimum purses.\"", ["fighters += 4", "media += 3", "patience -= 3", "addFlag('fairpay', 1)"], "Gasps in the room. The board's lawyer is already typing."),
    wwsh=STD_WWSH, storm=STD_STORM), where="f.traits.has('Pay Hawk')", weight=14)

Q('pq_union', 'Union Talk', "Reports say fighters are organizing. Will you recognize a union?", tones(
    deflect=("\"Our fighters can always come to me directly. My door is always open.\"", ["fighters -= 1"], "Your door has been locked since 2019."),
    attack=("\"Unions are for people who can't fight their own battles.\"", ["fighters -= 4", "media -= 2", "addFlag('union', 1)"], "The fighters print that quote on a banner."),
    truth=("\"If that's what they want, we'll sit down with them.\"", ["fighters += 5", "patience -= 5", "media += 2"], "Historic. The room goes quiet. Then everybody starts typing."),
    wwsh=STD_WWSH), cond="act >= 2", where="f.traits.has('Pay Hawk') || f.traits.has('Activist')")

Q('pq_main_event', 'Main Event Breakdown', "Who wins the main event tonight, in your opinion?", tones(
    deflect=("\"Both guys are killers. Should be a great fight.\"", ["media += 1"], "Safe. Boring. Correct."),
    joke=("\"Whoever's mom is louder in the crowd.\"", ["fans += 2", "media += 1"], "The room laughs. Somebody's mom, somewhere, gets louder."),
    truth=("Give an honest breakdown of both fighters", ["media += 2", "reporter.rel += 4"], "You actually break the fight down. People forget you used to know things."),
    wwsh=STD_WWSH), cond="!postFight", weight=12)

Q('pq_judging', 'Judging Controversy', "Fans are outraged about the scoring tonight. One judge had it 30-27 the other way. Will anything change about judging?", tones(
    deflect=("\"The commission appoints the judges. Take it up with them.\"", ["commission -= 1", "media += 0"], "Technically correct. Spiritually cowardly."),
    attack=("\"Judging is a joke. The commission is a joke. Next question.\"", ["commission -= 5", "fans += 3", "media += 1"], "The fans love it. The commission files it away for later."),
    truth=("\"We're going to push for open scoring and better training.\"", ["commission += 2", "media += 3"], "Reasonable. Nobody claps, because reasonable never gets claps."),
    wwsh=STD_WWSH), cond="postFight", weight=14)

Q('pq_arrest', 'About The Arrest', "One of your fighters was arrested this month. What's the promotion's position?", tones(
    deflect=("\"We're aware of the situation and gathering information.\"", ["media += 0"], "The sentence every PR team writes on day one."),
    attack=("\"Ask me about the fights.\"", ["media -= 2", "reporter.rel -= 5"], "She asks about the fights. Then about the arrest again."),
    truth=("\"It's serious and we're treating it seriously.\"", ["media += 3", "commission += 1"], "A grown-up answer. Unusual. Effective."),
    wwsh=STD_WWSH, storm=STD_STORM), cond="openCases > 0", weight=14)

Q('pq_doping', 'The Drug Testing Question', "Is your anti-doping program real, or is it a press release?", tones(
    deflect=("\"We have the most comprehensive program in combat sports.\"", ["media -= 0"], "You've said 'comprehensive' so many times it no longer means anything."),
    attack=("\"If you have proof, publish it.\"", ["media -= 2", "reporter.rel -= 8", "heat += 1"], "She might."),
    truth=("\"It's real, it's not perfect, and we're adding more random testing.\"", ["commission += 2", "media += 2", "heat -= 1"], "An admission of imperfection. The room is confused."),
    wwsh=STD_WWSH), cond="ruleActive('drug_program')")

Q('pq_braille', 'Braille Asks a Question', "Braille Sonnen stands up, facing slightly the wrong direction. \"Mr. President. I watched the fight tonight. Well. I 'watched' it. Let me ask you: was that a left hook or a takedown? Because it sounded like a takedown. Smelled like a left hook.\"", tones(
    deflect=("\"Great question, Braille.\"", ["fans += 1", "reporter.rel += 3"], "\"Thank you. I don't actually know what I'm talking about. I can't see shit.\" The room loses it."),
    joke=("\"It was both, Braille. It was a left takedown.\"", ["fans += 3", "media += 1", "reporter.rel += 5"], "Braille nods gravely. \"A left takedown. I knew it.\" It trends for 12 hours."),
    truth=("Patiently describe the finish to him", ["media += 2", "reporter.rel += 10"], "He listens closely, then predicts the rematch result with total confidence. He is wrong about who was in the fight."),
    wwsh=STD_WWSH), where="f.id == 'braille_sonnen'", weight=20, cd=4)

Q('pq_braille_rankings', "Braille's Rankings", "Braille Sonnen: \"I've got my own pound-for-pound list. Number one is a fighter I've only ever heard breathing. Number two is my dog. Who's on yours?\"", tones(
    joke=("\"Your dog is a good pick.\"", ["fans += 2", "reporter.rel += 5"], "The dog becomes a mascot. He has a lanyard now."),
    deflect=("\"I don't do pound-for-pound lists.\"", ["media += 0"], "\"Smart. Me neither. I can't see shit.\""),
    attack=("\"Braille, you've never seen a fight in your life.\"", ["fans -= 1", "reporter.rel -= 10", "media -= 2"], "The room boos you. Defending Braille is the one thing everyone agrees on.")), where="f.id == 'braille_sonnen'", weight=14, cd=6)

Q('pq_hellwani', 'The Insider Knows', "Ariel Hellwani: \"Sources tell me you're finalizing a deal tonight that you haven't told your own matchmakers about. Care to confirm?\"", tones(
    deflect=("\"Your sources should get better sources.\"", ["reporter.rel -= 3"], "He smiles. He knows. You know he knows."),
    attack=("\"How about you stop paying my employees for gossip?\"", ["reporter.rel -= 12", "media -= 2", "heat += 1"], "He tweets 'I've never paid a source' with a winking emoji."),
    truth=("\"...Yeah. Fine. It's real.\"", ["reporter.rel += 15", "media += 2"], "The scoop is officially his. Again."),
    wwsh=STD_WWSH, storm=STD_STORM), where="f.id == 'ariel_hellwani'", weight=16)

Q('pq_brogan', 'Brogan Goes Off-Topic', "Joe Brogan: \"Tonight was insane, man. Insane. But real quick, have you ever thought about how the pyramids were built? Like, how did they move those rocks? It's entirely possible they had help.\"", tones(
    joke=("\"It was wrestlers, Joe. Pyramid-building is just top control.\"", ["fans += 3", "reporter.rel += 8"], "Joe laughs so hard he has to leave the room. The clip goes viral."),
    deflect=("\"Let's keep it to the fights, Joe.\"", ["media += 1"], "\"Totally, totally.\" He asks about elk meat next."),
    truth=("\"I genuinely have no idea, Joe.\"", ["fans += 1", "reporter.rel += 3"], "\"Nobody does, man. NOBODY does.\" He's thrilled.")), where="f.id == 'joe_brogan'", weight=14)

Q('pq_tabloid', 'Tabloid Question', "\"Is it true one of your fighters is dating a reality TV star who used to date another one of your fighters?\"", tones(
    deflect=("\"I don't follow my fighters' love lives.\"", ["media += 0"], "You follow them closely. Everyone does."),
    joke=("\"I can't confirm or deny the love triangle. But I can confirm it would sell.\"", ["fans += 2", "media += 1"], "The tabloid runs: 'PREZ CONFIRMS LOVE TRIANGLE SELLS'."),
    storm=STD_STORM), where="f.traits.has('Tabloid')")

Q('pq_conspiracy', 'The Conspiracy Question', "\"Is it true that the last knockout was paid for by the government to distract from the moon landing hearings?\"", tones(
    joke=("\"Yes. And the referee is a lizard.\"", ["fans += 2", "media -= 1", "chaos += 1"], "TruthBomb Live posts the clip with the caption 'HE ADMITTED IT'."),
    deflect=("\"Next question.\"", ["media += 1"], "Next question."),
    attack=("\"Get this guy out of here.\"", ["media -= 1", "reporter.rel -= 15"], "He is escorted out livestreaming the whole thing.")), where="f.traits.has('Conspiracy')")

Q('pq_rival', 'The Rival League', "The other league says they pay better and have better fighters. Your response?", tones(
    attack=("\"They're a minor league. Their best fighter is our worst fighter's sparring partner.\"", ["fans += 2", "media -= 1"], "The rival posts a 9-slide response. It has a pie chart."),
    deflect=("\"Competition is good for the sport.\"", ["media += 1"], "Mature, boring, effective."),
    joke=("\"They pay better? Great. Send me their number.\"", ["fans += 2", "media += 1"], "Their president calls you the next day. You don't answer."),
    wwsh=STD_WWSH), cond="rivalsAlive > 0")

Q('pq_slap', 'About The Slap League', "Doctors call your slap league 'barbaric'. Is it?", tones(
    deflect=("\"It's a sport with medical oversight.\"", ["media -= 1"], "The medical oversight is one guy named Gary with a flashlight."),
    joke=("\"Barbaric? Have you seen a Wednesday at Applebee's?\"", ["fans += 2", "media -= 2"], "The comparison makes no sense. It trends anyway."),
    truth=("\"It's a spectacle. We're adding more safety rules.\"", ["commission += 2", "media += 2"], "Reasonable. The slap fighters are disappointed.")), cond="venture == 'slap'")

Q('pq_brain', 'Brain Injuries', "Studies show repeated head trauma causes long-term damage. What is the promotion doing to protect fighters' brains?", tones(
    deflect=("\"Safety is our number one priority.\"", ["media -= 1"], "The phrase every promoter says while standing next to a cage."),
    truth=("\"Not enough. We're funding neurological care for retired fighters.\"", ["spend('fighter health fund', 100000 * scale)", "media += 4", "fighters += 3"], "A real answer with real money. The room is genuinely surprised."),
    attack=("\"Everybody knows the risks.\"", ["media -= 3", "fighters -= 2"], "True and cold. It plays badly.")), where="f.outletType == 'serious' || f.traits.has('Investigator')", cd=26)

Q('pq_women', "Women's Divisions", "Will women headline your biggest events?", tones(
    truth=("\"They already sell better than half my men's cards. Yes.\"", ["fans += 2", "media += 3"], "A compliment that is also a business plan."),
    deflect=("\"The fans will decide.\"", ["media -= 1"], "Weak. Everybody notices."),
    joke=("\"They're scarier than the men. I'm scared of most of them.\"", ["fans += 2", "media += 1"], "It lands. Mostly because it's true.")), cond="womenOpen")

Q('pq_ppv_price', 'PPV Prices', "Your pay-per-view costs $89.99. Fans call it a robbery. Why so expensive?", tones(
    deflect=("\"Production costs are very high.\"", ["fans -= 1"], "So is your boat."),
    joke=("\"It's cheaper than therapy and you get to see more crying.\"", ["fans += 2", "media += 1"], "Fans still complain. They still buy."),
    truth=("\"You're right. We're dropping the price.\"", ["fans += 4", "network -= 2", "earn('ppv', -30000 * scale)"], "The network calls you during the presser.")), cond="ppv")

Q('pq_retirement', 'Is He Retiring?', "{subject.first} {subject.last} looked old tonight. Should {he} retire?", tones(
    deflect=("\"That's between {him} and {his} family.\"", ["media += 1"], "Graceful. Correct."),
    truth=("\"I think it's time. I'll talk to {him}.\"", ["media += 2", "subject.morale -= 6"], "{subject.last} hears about it on Twitter. Awkward."),
    attack=("\"{He}'s got plenty left. Next question.\"", ["media -= 1", "subject.loyalty += 4"], "{He} appreciates the loyalty. {His} knees do not.")), extra_roles={"subject": F("f.ours && f.age >= 36")})

Q('pq_goat', 'The GOAT Debate', "Who's the greatest of all time?", tones(
    joke=("\"Me. I'm undefeated in this chair.\"", ["fans += 2", "media += 1"], "The chair creaks in agreement."),
    deflect=("\"Every era has its kings.\"", ["media += 1"], "Diplomatic. Nobody is satisfied."),
    attack=("\"Anybody who says it's not someone on my roster is an idiot.\"", ["fans += 1", "fighters += 1", "media -= 1"], "Your roster loves it. Every other roster screenshots it.")), weight=8)

Q('pq_sponsor', 'The Sponsor Question', "One of your sponsors was just accused of being a Ponzi scheme. Thoughts?", tones(
    deflect=("\"We're reviewing all partnerships.\"", ["sponsors -= 1"], "You are not reviewing anything. You're googling 'Ponzi scheme'."),
    truth=("\"We're ending that partnership today.\"", ["dropSponsors(1)", "media += 3", "sponsors -= 2"], "The right call and an expensive one."),
    joke=("\"I thought Ponzi was a fighter.\"", ["fans += 1", "media -= 2"], "It isn't the time. The clip is everywhere.")), cond="meters.sponsors > 20 && act >= 2", cd=40)

Q('pq_streamer', 'Streamer Chaos', "One of your fighters streamed for 9 hours yesterday attacking another fighter's family. Is that acceptable?", tones(
    deflect=("\"We'll be speaking to them privately.\"", ["media += 1"], "Privately means 'never'."),
    truth=("\"It's not. There will be consequences.\"", ["media += 2", "fans -= 1"], "The streamer reacts live. On stream."),
    joke=("\"Nine hours? That's better cardio than half my roster.\"", ["fans += 2", "media -= 2"], "The joke lands with fans. Less so with everyone else.")), cond="countTrait('Streamer') > 0", weight=8)

Q('pq_owner', 'Corporate Masters', "Your new corporate owners reportedly want more events and fewer expenses. Are you still in charge?", tones(
    attack=("\"I'm in charge. The suits sign the checks, I sign the fights.\"", ["fans += 2", "patience -= 4", "media += 1"], "The suits watch the clip in a conference room. Silently."),
    deflect=("\"We're aligned on our vision for the company.\"", ["patience += 2", "fans -= 1"], "Corporate speak. The fans can smell it."),
    wwsh=STD_WWSH), cond="sold")

Q('pq_short_notice', 'Short Notice', "A fighter on the card stepped in on two days' notice. Is that safe?", tones(
    deflect=("\"He passed every medical. He wanted the fight.\"", ["media += 0"], "He also ate a gas station burrito at the weigh-ins."),
    truth=("\"It's risky. We're paying him a premium for taking it.\"", ["fighters += 2", "spend('bonuses', 5000 * scale)"], "The fighter gets a raise. The room nods."),
    joke=("\"Two days is plenty. I prepared for this press conference in two minutes.\"", ["fans += 1"], "It shows.")), cond="eventThisWeek || postFight")

Q('pq_belt', 'Too Many Belts', "Interim belts, symbolic belts, 'BMF' belts... is your title picture a joke?", tones(
    attack=("\"Belts sell. You buy them. Don't you?\"", ["fans -= 1", "network += 1"], "Purists sigh. Merch sells."),
    joke=("\"We're introducing a belt for the best press conference question. You won't win it.\"", ["fans += 2", "reporter.rel -= 3"], "The 'best question' belt becomes a real thing. It's mostly given to Braille."),
    truth=("\"Fair. We'll clean it up.\"", ["fans += 2", "media += 2"], "Purists rejoice. Merch department weeps.")), weight=7)

Q('pq_kid_journalist', 'The Kid With A Ring Light', "Tyler Contentson: \"Yo, bro. Real quick. On a scale of 1 to 10, how cracked is the main event? Also can I get a picture?\"", tones(
    joke=("\"Eleven, bro. Cracked.\"", ["fans += 2", "reporter.rel += 10"], "Gen Z adores you for one news cycle."),
    deflect=("\"Next question.\"", ["media += 0"], "He takes the picture anyway."),
    attack=("\"Who let this kid in?\"", ["fans -= 1", "reporter.rel -= 10"], "His followers do not like that.")), where="f.id == 'junkyard_kid'")

Q('pq_stephen', 'Loud Network Guy', "Stephen A. Shouty, at maximum volume: \"WHERE ARE THE STARS? WHERE ARE THEY? I CAN'T NAME A SINGLE FIGHTER ON THIS CARD! NOT ONE!\"", tones(
    attack=("\"That's because you don't watch, Stephen.\"", ["fans += 3", "reporter.rel -= 5"], "\"THAT IS... ACTUALLY A FAIR POINT.\" The room claps."),
    joke=("\"Name your own cohost.\"", ["fans += 2"], "He can't. Nobody can."),
    deflect=("\"Plenty of stars, Stephen.\"", ["media += 0"], "\"NAME ONE.\" You name one. He's never heard of them.")), where="f.id == 'wspn_stephen'")

Q('pq_rights', 'The Retirement Fund', "Former fighters say they have no pension, no health care, nothing. Is that acceptable?", tones(
    truth=("\"No. We're starting a retirement fund.\"", ["spend('fighter health fund', 200000 * scale)", "fighters += 5", "media += 3", "addFlag('fairpay', 2)"], "Sustained applause. Your CFO faints, gently."),
    deflect=("\"Fighters are independent contractors.\"", ["fighters -= 3", "media -= 2"], "The legally correct answer is also the worst possible answer."),
    storm=STD_STORM), where="f.traits.has('Pay Hawk')", cond="act >= 3")

Q('pq_rogan_dmt', 'Brogan on DMT', "Joe Brogan: \"Real talk though. Have you ever done DMT? Because I'm telling you, the machine elves have opinions about your matchmaking.\"", tones(
    joke=("\"The machine elves want a rematch.\"", ["fans += 3", "reporter.rel += 8"], "He nearly falls off his chair."),
    deflect=("\"No comment, Joe.\"", ["media += 0"], "\"That's a yes. That's totally a yes.\""),
    truth=("\"Joe, I've never even had a beer at work.\"", ["media += 1"], "\"Respect, man. Respect.\"")), where="f.id == 'joe_brogan'", cd=10)

Q('pq_card_quality', 'Weak Card', "Fans are calling this card the worst of the year. Thoughts?", tones(
    attack=("\"Then don't watch it.\"", ["fans -= 2", "media -= 1"], "They don't. Your numbers agree."),
    joke=("\"Every card is the worst card until somebody gets knocked into the third row.\"", ["fans += 2"], "Fair."),
    truth=("\"We lost three fights to injury. It happens. Next card is stacked.\"", ["media += 2"], "Honesty, with a promise attached. Risky.")), cond="!postFight")

Q('pq_fighter_behavior', 'The Brawl', "Two of your fighters brawled at the hotel this week. Are you rewarding bad behavior by promoting it?", tones(
    deflect=("\"We don't condone that behavior.\"", ["media += 0"], "You have already put the brawl in the promo."),
    joke=("\"Rewarding? They're getting paid the same. It's the plant I feel bad for.\"", ["fans += 2", "media -= 1"], "The plant's fan account thanks you."),
    truth=("\"We probably are. That's on me.\"", ["media += 3", "commission += 1"], "Self-awareness. Rare. Valuable.")), cond="since('rivalry_hotel_lobby') < 6")

Q('pq_biscuit', 'Biscuit Tells a Story', "Michael Biscuit: \"Bloody hell, what a night. Reminds me of when I fought with one eye, actually, in Manchester in 2009, against a man who-- right, sorry, the question. Who's next for the champ?\"", tones(
    joke=("\"Michael, you are. One eye, one more fight.\"", ["fans += 3", "reporter.rel += 6"], "\"Don't tempt me, mate. Don't. Tempt. Me.\""),
    deflect=("\"Whoever the rankings say.\"", ["media += 1"], "He tells another story anyway."),
    truth=("\"The number one contender. Obviously.\"", ["media += 1"], "\"Obviously! Proper answer, that.\"")), where="f.id == 'wspn_mike'")

Q('pq_kenji', 'The Polite Destroyer', "Kenji Shimbun bows. \"Thank you for your time. Is it true that the promotion's medical suspensions are decided by, as one doctor says, 'vibes'?\"", tones(
    truth=("\"We're tightening the protocols.\"", ["commission += 3", "media += 2"], "He bows again. You feel like you lost a fight."),
    deflect=("\"Our doctors are the best in the business.\"", ["media -= 1"], "He bows. You somehow feel worse."),
    attack=("\"Who told you that?\"", ["media -= 2", "heat += 1"], "He bows a third time. You have lost.")), where="f.id == 'international_kenji'")
