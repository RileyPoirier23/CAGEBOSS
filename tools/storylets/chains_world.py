"""World arcs: commission, rivals, legends, the president's personal life, owners, weird stuff."""
from dsl import *

FILE = 'chains_world'
OURS = "f.ours"


def CH(cid, steps, roles=None, cat='misc', cond=None, cd=104, weight=8, tags=None, acts=None, vars=None):
    for i, (sid, title, scenes, choices) in enumerate(steps):
        S(FILE, sid, title, cat, scenes, choices, roles=roles, cond=cond if i == 0 else None, cd=cd, weight=weight,
          chain=cid, fu=i > 0, tags=tags, acts=acts if i == 0 else None, vars=vars)


# ---------------------------------------------------------------- the president's life
CH('ch_midlife', [
    ('ml_car', 'The Midlife Car', [visit("A car dealer named Rick is in your office with a brochure for a {pop_car} in 'Champion Gold'. 'You've earned it,' he says. You have not earned it. You want it anyway.", "Rick from the dealership")],
     [C("Buy it ({$fee})", "wealth -= vars.fee", "follow('ml_crash', 6)", "fans += 1", result="It's gold. It's loud. It does not fit in your parking space.", bot=2),
      C("Lease something sensible", "wealth -= vars.fee * 0.1", result="A sedan. Beige. The fighters make fun of you for a month.", default=True)]),
    ('ml_crash', 'The Gold Car Incident', [sc('headline', "{president}'S GOLD SUPERCAR SPOTTED PARKED ACROSS FOUR DISABLED SPACES OUTSIDE {pop_food}; INTERNET FURIOUS")],
     [C("Apologize and donate the car to charity", "media += 2", result="The charity auctions it to a fighter. The fighter parks it worse.", default=True, ethics=1),
      C("'I was getting nuggets, sue me'", "media -= 3", "fans += 1", result="Some people respect it. The disability advocates do not.", bot=1, ethics=-1)]),
], cat='president', vars={"fee": "rand(150, 400) * 1000"}, cd=208)

CH('ch_marriage', [
    ('mr_anniv', 'The Anniversary', [phone("It's your anniversary. You're at a weigh-in. Your spouse has called four times. The fifth call is a voicemail that just says your full name, slowly.", "Your spouse")],
     [C("Leave the weigh-in and go home", "media -= 1", "follow('mr_home', 2)", result="You hand the weigh-in to your matchmaker. He weighs himself by accident.", default=True, ethics=1),
      C("Send flowers and stay", "follow('mr_cold', 3)", result="Flowers. Expensive flowers. The card says 'sorry, weigh-in'.", bot=2)]),
    ('mr_home', 'Dinner', [sc('narration', "Dinner at home. Your phone buzzes 41 times. You don't look at it once. Your spouse notices. It's the best night you've had in months.")],
     [C("Promise more nights like this", "patience -= 1", "fighters += 1", result="You mean it. You'll try. The phone will win sometimes.", default=True, ethics=1)]),
    ('mr_cold', 'The Cold Shoulder', [sc('narration', "Your spouse has moved into the guest room 'temporarily'. The dog has picked a side. It isn't yours.")],
     [C("Book couples therapy", "wealth -= 8000", "setFlag('therapy', 1)", result="The therapist asks what you do. You explain. She asks if you've considered not doing that.", default=True, ethics=1),
      C("Throw yourself into work", "patience += 3", "president.marriage = 'separated'", result="The promotion has never run better. Your house has never been quieter.", bot=1)]),
], cat='president', cond="president.marriage == 'married'", cd=104)

CH('ch_vegas', [
    ('vg_whale', 'The Whale Table', [visit("A casino host has comped you a suite, a table, and 'unlimited markers'. 'High rollers like you deserve high limits,' she says. You are not a high roller. You are a guy with a promotion.", "Casino host Destiny")],
     [C("Play", "follow('vg_morning', 1)", "chance(0.4) ? meter('fans', 0) : setFlag('vegas_loss', 1)", result="You play blackjack until the sun comes up. You don't remember the last six hands.", bot=2),
      C("Go to bed", result="Asleep by 11. You've never felt older or wiser.", default=True, ethics=1)]),
    ('vg_morning', 'The Morning After', [sc('narration', "You wake up in the suite. There's a marker on the nightstand. It's for {$fee}. There's also a parrot. Nobody knows where the parrot came from.")],
     [C("Pay the marker", "wealth -= vars.fee", result="Paid. The parrot is coming home with you, apparently.", default=True),
      C("Negotiate it down", "wealth -= vars.fee * 0.6", "heat += 1", result="Destiny is disappointed in you. The parrot is too.", bot=1)]),
], cat='president', vars={"fee": "rand(40, 160) * 1000"}, cd=156)

CH('ch_podcast', [
    ('pc_invite', 'Your Own Podcast', [phone("A network wants you to host a weekly podcast called 'Boss Talk'. You'd talk about the fights, the business, and 'your vibe'. They promise it'll be 'just two hours, max'.", "Podcast producer")],
     [C("Do it", "media += 2", "follow('pc_ep', 6)", result="Episode one is four hours long. You talk about elk for some reason.", bot=2),
      C("Pass", result="Your rival gets a podcast instead. It's bad. It's very popular.", default=True)]),
    ('pc_ep', 'The Episode', [sc('headline', "{president}'S PODCAST CAUSES STORM AFTER HE SAYS JUDGES SHOULD 'BE REPLACED BY THREE DOGS AND A COIN'")],
     [C("Stand by it", "fans += 3", "commission -= 3", result="'Three Dogs and a Coin' becomes a fan chant.", bot=2, default=True),
      C("Apologize to the commission", "commission += 2", "fans -= 1", result="The commission accepts your apology. One commissioner asks if he can be one of the dogs.", ethics=1)]),
], cat='president', cd=208)

# ---------------------------------------------------------------- commission & refs
CH('ch_ref_review', [
    ('rr_bad', 'The Ref Review', [sc('headline', "{ref} UNDER FIRE: fans compile a 14-minute video of every late stoppage in his career. It's set to sad music. It has 6 million views.")],
     [C("Demand a ref review from the commission", "commission -= 2", "fans += 2", "follow('rr_hearing', 4)", result="The commission schedules a hearing. The ref schedules a podcast appearance.", default=True),
      C("Defend the ref publicly", "commission += 2", "fans -= 2", result="The video gets a sequel. Now it's 22 minutes.", bot=1)]),
    ('rr_hearing', 'The Ref Hearing', [sc('boardroom', "At the hearing, {ref} defends himself with a 40-slide presentation titled 'Let Them Fight: A Philosophy'. Slide 31 is just a picture of a lion.")],
     [C("Accept his explanation", "commission += 2", result="He keeps his job. He stops one fight early the next week out of spite.", default=True),
      C("Push for retraining", "commission -= 1", "fighters += 2", result="He's sent to a seminar. He comes back with a certificate and the same philosophy.", ethics=1)]),
], vars={"ref": "'Nerm Bean'"}, cat='commission', cd=156)

CH('ch_new_judge', [
    ('nj_appoint', 'The New Judge', [phone("The commission has appointed a new judge: a retired accountant who has never watched MMA. 'I'll learn on the job,' he says. His first assignment is your main event.", "Commission office")],
     [C("Request a different judge", "commission -= 2", result="Request denied. He bought a book about MMA. He's on chapter one.", default=True),
      C("Send him a training package", "spend('misc', 2000 * scale)", "follow('nj_scores', 3)", result="DVDs, a rulebook, and a box of chocolates. He sends a thank-you note.", ethics=1)]),
    ('nj_scores', 'The Accountant Judges', [sc('fightnight', "The accountant judge scores your main event... correctly. Every round. The crowd is so stunned they boo out of habit. Then cheer. Then boo again.")],
     [C("Send him a thank-you card", "commission += 3", result="He's assigned to every big fight from now on. Fighters start sending him chocolates. That's probably a problem.", default=True)]),
], cat='commission', cd=208)

CH('ch_drug_policy', [
    ('dp_new', 'The New Testing Partner', [memo("A new anti-doping agency is offering to run your testing program. They're strict. Very strict. They test for things that haven't been invented yet.", "MEMO: ANTI-DOPING")],
     [C("Sign up", "commission += 6", "spend('testing', 60000 * scale)", "follow('dp_result', 10)", result="Your fighters receive welcome packets. Several fighters 'retire' immediately.", ethics=2),
      C("Keep the old lax system", "commission -= 2", result="The old system tests for 'vibes'.", default=True)]),
    ('dp_result', 'Testing Results', [memo("First quarter of the new program: 3 positive tests, 1 fighter claiming his 'twin' took the test, and 1 fighter who tested positive for an elk supplement recommended by Blow Hogan on air.", "TESTING REPORT")],
     [C("Publish the results", "commission += 3", "media += 2", "fighters -= 2", result="The sport respects you more. The roster respects you less.", default=True, ethics=1),
      C("Handle it quietly", "heat += 2", "commission -= 1", result="Quiet. For now.", ethics=-1)]),
], cat='doping', cd=208, acts=[2, 3, 4, 5])

# ---------------------------------------------------------------- rivals
CH('ch_rival_ceo', [
    ('rc_insult', 'Rival CEO Insult', [sc('social', "The CEO of {rival.name} posted: '{promotion} is a minor league with a major ego. Their champion couldn't win our prelims.' The post has 400,000 likes.")],
     [C("Clap back publicly", "fans += 3", "media += 1", "follow('rc_challenge', 3)", result="Your response is one word and a picture of your belt. It does numbers.", bot=2),
      C("Ignore it", "fans -= 1", result="Ignoring it is classy. Classy doesn't trend.", default=True)]),
    ('rc_challenge', 'The Champion vs Champion Challenge', [phone("The rival CEO calls: 'Fine. Your champ vs our champ. Co-promoted. 50/50 split. Unless you're scared.'", "Rival CEO")],
     [C("Accept the super fight", "network += 4", "fans += 4", "earn('ppv', 300000 * scale)", result="Champion vs champion. The biggest fight either promotion has ever made.", bot=2, default=True),
      C("Decline: 'come to our house'", "fans += 1", result="He calls you a coward. You call him a coward. Nobody fights.")]),
], roles={"rival": RIV()}, cat='rival', cd=156)

CH('ch_rival_collapse', [
    ('rcl_rumor', 'Rival in Trouble', [phone("Word is {rival.name} can't make payroll. Fighters are calling around. Half their roster could be free agents in a month.", "Industry insider")],
     [C("Quietly reach out to their best fighters", "follow('rcl_poach', 4)", "chaos += 1", result="Your phone is very busy this week.", bot=2),
      C("Offer them a loan", "spend('loan', 200000 * scale)", "media += 2", result="Gracious. Possibly stupid.", ethics=2, default=True)]),
    ('rcl_poach', 'The Exodus', [sc('headline', "EXODUS: TOP FIGHTERS FLEE {rival.name} AMID PAYROLL CRISIS; SEVERAL SPOTTED ENTERING {promotion} HQ WITH GYM BAGS")],
     [C("Sign the best of them", "fans += 3", "fighters -= 1", "spend('signings', 150000 * scale)", result="Your roster just got a lot deeper. Your existing fighters just got a lot nervous.", default=True, bot=2)]),
], roles={"rival": RIV("r.cash < 500000")}, cat='rival', cd=208)

CH('ch_crossover', [
    ('cx_boxing', 'The Boxing Crossover', [phone("A boxing promoter wants your biggest star to box his biggest star. Boxing rules. Their gloves, their ring, their judges. 'It'll be the biggest event in history,' he promises, 'for us.'", "Boxing promoter")],
     [C("Agree to a 60/40 split", "follow('cx_fight', 8)", "network += 3", result="Your fighter starts boxing training. Their footwork is 'a work in progress'.", bot=2),
      C("Only if it's MMA rules", result="He laughs for a full minute. Then hangs up.", default=True)]),
    ('cx_fight', 'Boxing Night', [sc('headline', "THE CROSSOVER: record-breaking PPV numbers for {promotion} star's boxing debut. Result is controversial. Boxing fans furious. MMA fans furious. Everyone paid.")],
     [C("Demand a rematch under MMA rules", "fans += 3", "earn('ppv', 400000 * scale)", result="The boxer suddenly has a very bad back.", default=True, bot=2),
      C("Take the money and move on", "earn('ppv', 600000 * scale)", "fans -= 1", result="You count the money. It counts back.")]),
], cat='business', cond="act >= 3", cd=208)

# ---------------------------------------------------------------- legends
CH('ch_legend_coach', [
    ('lc_offer', 'Legend Wants to Coach', [visit("{subject.first} {subject.last} wants to open a gym and coach your fighters. 'I know things,' {he} says. {He} knows things. {He} also wants a percentage.", "{subject.first} {subject.last}")],
     [C("Partner with {him}", "spend('gym', 80000 * scale)", "follow('lc_results', 12)", "fighters += 2", result="The gym opens with a ribbon cutting. {He} cuts it with a spinning back kick.", default=True),
      C("Pass", result="{He} opens the gym anyway, across from your HQ. With a bigger sign.")]),
    ('lc_results', 'The Legend Effect', [sc('narration', "Fighters training under {subject.first} {subject.last} are winning more, finishing more, and swearing more. {He} has taught them 'the dark arts'. You don't ask.")],
     [C("Expand the program", "allFighters('morale', 3)", "fighters += 2", "spend('gym', 40000 * scale)", result="A second location. A merch line. {He}'s happier than {he} was as champion.", default=True)]),
], roles={"subject": LEG("f.age < 60")}, cat='legend', cd=208)

CH('ch_legend_feud', [
    ('lf_trash', 'Legend Trash Talk', [sc('social', "Legend {subject.first} {subject.last} says your current champion 'wouldn't have made it to the prelims in my era'. Your champion replied 'ok grandpa'. Legends worldwide are offended.")],
     [C("Set up an exhibition", "comeback(subject)", "follow('lf_exhib', 8)", "fans += 3", result="Grandpa wants the smoke.", bot=2),
      C("Let them argue online", "fans += 1", result="It lasts a week. Everyone sells T-shirts.", default=True)]),
    ('lf_exhib', 'Grandpa Wants the Smoke', [sc('fightnight', "The legend exhibition is three two-minute rounds with big gloves. The legend gets the champ in a headlock for 40 seconds and refuses to let go. The crowd chants 'OK GRANDPA' lovingly.")],
     [C("Book a sequel", "fans += 2", "commission -= 1", result="Everyone wants a sequel. Everyone's doctors don't.", bot=1),
      C("Retire the legend for good, with honors", "fans += 2", "media += 2", result="The legend retires with a standing ovation and a hip replacement scheduled.", default=True, ethics=1)]),
], roles={"subject": LEG("f.age < 56")}, cat='legend', cond="act >= 2", cd=208)

# ---------------------------------------------------------------- weird world
CH('ch_haunted_arena', [
    ('ha_ghost', 'The Haunted Arena', [phone("Staff at the arena for your next event report 'cold spots', a disembodied voice yelling 'STAND THEM UP', and a mop that moves by itself. A paranormal TV show wants to film there during your event.", "Arena manager")],
     [C("Let them film", "network += 2", "follow('ha_night', 4)", result="A ghost hunter with a meter is coming to fight night.", bot=2),
      C("No ghosts on my broadcast", result="The ghost is disappointed. Probably.", default=True)]),
    ('ha_night', 'Ghost Night', [sc('fightnight', "During the co-main, the lights flicker, the ghost hunter's meter spikes, and a ring card girl swears she saw a referee in 1990s clothing standing in the corner. The broadcast replays it 30 times.")],
     [C("'The Ghost Ref' becomes a mascot", "fans += 3", "media += 1", result="Ghost Ref merch outsells real ref merch. That's not hard.", default=True)]),
], cat='weird', cd=208)

CH('ch_alien', [
    ('ufo_sighting', 'UFO Over the Arena', [sc('social', "Dozens of fans posted videos of 'lights' over the arena during your last event. Blow Hogan has done three podcast episodes about it. The FAA says it was a drone delivering {pop_food}.")],
     [C("Lean into it: 'ALIEN NIGHT'", "fans += 2", "follow('ufo_event', 6)", result="Next event: green lights, a fog machine, and a fighter walking out in a tinfoil hat.", bot=2),
      C("Ignore it", result="The truth is out there. Nobody at {promotion} is looking for it.", default=True)]),
    ('ufo_event', 'Alien Night', [sc('fightnight', "ALIEN NIGHT is a huge hit. A fighter walks out in a full alien costume, takes it off mid-walk, and is still the weirdest thing in the arena: Blow Hogan wore an antenna headband all broadcast.")],
     [C("Make it annual", "fans += 2", "network += 1", result="Every year. Same night. Same Blow.", default=True)]),
], cat='weird', cd=208)

CH('ch_bear_fight', [
    ('bf_offer', 'The Bear Promoter', [phone("A traveling circus promoter is offering a 'Man vs Bear' exhibition. The bear is 'very friendly, mostly'. The man is your heavyweight, if he agrees. He hasn't been asked.", "Circus promoter Lou")],
     [C("Absolutely not", "commission += 2", "media += 1", result="Lou is crestfallen. The bear is relieved.", default=True, ethics=2),
      C("Ask the heavyweight (as a joke)", "follow('bf_heavy', 1)", result="You ask. He doesn't laugh. He asks how big.", bot=1)]),
    ('bf_heavy', 'He Wants the Bear', [visit("Your heavyweight is in your office in a bear-print robe. 'I've been training for this my whole life. Every sparring session. Every hug.' He is serious.", "Your heavyweight")],
     [C("Shut it down for good", "commission += 2", "fighters += 1", result="He's disappointed. He gets a bear tattoo instead.", default=True, ethics=2),
      C("Arrange a 'meeting' with the bear (supervised)", "media += 2", "fans += 2", "commission -= 2", result="The bear and the heavyweight hug for the cameras. Both seem to enjoy it. Nobody fights. Everyone wins.", bot=2)]),
], cat='weird', cd=312)

CH('ch_time_capsule', [
    ('tc_found', 'The Time Capsule', [sc('narration', "Renovations at HQ uncover a time capsule buried by the promotion's founder. Inside: a VHS tape, a cassette labelled 'NEVER PLAY THIS', and a letter addressed 'to whoever runs this place in the future'.")],
     [C("Read the letter on stream", "fans += 2", "follow('tc_tape', 2)", result="The letter says 'Dear future boss: sorry about the roof.' The roof has been leaking for 30 years.", default=True),
      C("Rebury it", result="Some things are better left buried. Like the cassette.")]),
    ('tc_tape', 'NEVER PLAY THIS', [sc('narration', "Against all advice, you play the cassette. It's the founder, singing a power ballad called 'Octagon of My Heart'. It's terrible. It's beautiful. The fighters demand it as a walkout song.")],
     [C("Release it", "fans += 3", "earn('licensing', 20000 * scale)", result="'Octagon of My Heart' hits number one on the novelty charts.", default=True, bot=2)]),
], cat='weird', cd=312)

# ---------------------------------------------------------------- owners
CH('ch_owner_nephew', [
    ('on_hire', "The Owner's Nephew", [memo("The Owner's nephew, Brayden, needs 'real world experience'. He'll be your new Head of Matchmaking. He's 19. His qualifications include 'watching a lot of fights on TikTok'.", "MEMO: STAFFING")],
     [C("Give him the job (on paper)", "patience += 5", "follow('on_book', 4)", result="Brayden has a business card. It's laminated. He hands it to everyone.", default=True),
      C("Push back", "patience -= 6", result="The Owner asks if you have 'a problem with family'.", bot=1)]),
    ('on_book', 'Brayden Books a Fight', [sc('narration', "Brayden has booked a flyweight against a heavyweight because 'it would be crazy'. He's already announced it on his personal account. It has 2 million views.")],
     [C("Cancel it and explain weight classes", "patience -= 2", "fans -= 1", result="Brayden is devastated. He makes a video about it. More views.", default=True, ethics=1),
      C("Turn it into a grappling exhibition", "fans += 3", "commission -= 2", "patience += 2", result="The flyweight wins by heel hook in 40 seconds. Brayden is a genius now, according to Brayden.", bot=2)]),
], cat='owner', cd=312)

CH('ch_owner_sale_rumor', [
    ('osr_rumor', 'Sale Rumors', [sc('headline', "REPORT: {owner} EXPLORING SALE OF {promotion}; BUYERS RUMOURED TO INCLUDE A SOVEREIGN WEALTH FUND, A STREAMING GIANT AND {pop_celeb}")],
     [C("Reassure the staff", "fighters += 2", "patience -= 1", "follow('osr_truth', 6)", result="You hold an all-hands meeting. Somebody asks if they'll keep their dental.", default=True),
      C("Ask the Owner directly", "follow('osr_truth', 2)", "patience -= 2", result="The Owner says 'no comment'. To you. His own president.", bot=1)]),
    ('osr_truth', 'The Truth', [memo("The Owner confirms: 'We are always listening to offers.' Then he adds: 'Make the number go up and nobody has to listen too hard.'", "MEMO FROM THE OWNER")],
     [C("Make the number go up", "patience += 4", "fighters -= 1", result="Austerity mode. The catering is now sandwiches. Sad sandwiches.", default=True, bot=2),
      C("Make the product better instead", "fans += 2", "fighters += 1", "patience -= 2", result="You put money into the fights. The fights get better. The number takes longer.", ethics=1)]),
], cat='owner', cond="!sold && act >= 3", cd=312)
