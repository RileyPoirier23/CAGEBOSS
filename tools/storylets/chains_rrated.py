"""The R-rated drawer: crude, profane, morally bankrupt promoter life.
Anything involving drugs or crimes is tagged 'serious' (never casts a parody fighter)."""
from dsl import *

FILE = 'chains_rrated'
OURS = "f.ours"
SUBJ = {"subject": F(OURS)}
SER = ['serious']


def CH(cid, steps, roles=None, cat='fighter', cond=None, cd=104, weight=6, tags=None, acts=None, vars=None):
    for i, (sid, title, scenes, choices) in enumerate(steps):
        S(FILE, sid, title, cat, scenes, choices, roles=roles, cond=cond if i == 0 else None, cd=cd, weight=weight,
          chain=cid, fu=i > 0, tags=tags, acts=acts if i == 0 else None, vars=vars)


def ONE(sid, title, cat, scenes, choices, **kw):
    kw.setdefault('cd', 104)
    kw.setdefault('weight', 6)
    S(FILE, sid, title, cat, scenes, choices, **kw)


# ------------------------------------------------------------------ bodily functions & weight cuts
CH('rr_shart', [
    ('rr_shart_cage', 'Code Brown', [sc('fightnight', "Mid-way through round two, it becomes clear to everyone in the front three rows that {subject.first} has shit {him}self. The cameras haven't noticed yet. Blow Hogan has. Blow Hogan is gagging on air.")],
     [C("Tell production to stay on the wide shot", "media += 1", "subject.morale -= 3", result="The wide shot holds. Twitter does not. #CodeBrown trends in four countries.", default=True, ethics=1),
      C("Let the cameras get it. It's content.", "fans += 3", "subject.morale -= 10", "subject.loyalty -= 8", "follow('rr_shart_after', 2)", result="Lon Anik, live: 'That is... that is a man fighting through something.' Blow Hogan, live: 'HE SHIT HIS SHORTS, LON.'", bot=2, ethics=-2)]),
    ('rr_shart_after', 'The Shorts', [phone("A memorabilia dealer wants to buy {subject.first}'s fight shorts. Unwashed. He's offering {$fee}. He says he has 'a buyer in Dubai who is very specific.'", "a man named Glen")],
     [C("Sell the fucking shorts", "earn('merch', vars.fee)", "subject.loyalty -= 6", result="The shorts sell. {subject.first} finds out from a TikTok. {He} has questions. You have no answers.", bot=2, ethics=-2),
      C("Hell no. Burn them.", "subject.loyalty += 4", result="You burn them in the parking lot. The smell is biblical. {subject.first} salutes.", default=True, ethics=1)])],
    roles={"subject": F(OURS + " && f.booked")}, vars={"fee": money(8, 25)}, cd=208)

ONE('rr_weightcut_toilet', 'The Final Pound', 'fighter',
    [visit("{subject.first} is 1.4 pounds over with forty minutes to go. {His} cutman has a plan: 'Spit, sweat, shit. In that order.' {subject.first} is crying. The hotel toilet is crying.", "the hotel bathroom")],
    [C("Strip naked, towel up, try again", "subject.morale -= 2", "commission += 1", result="{He} makes it on the nose, buck naked, behind a towel held by two very unhappy interns.", default=True),
     C("Bribe the guy holding the scale ({$fee})", "spend('misc', vars.fee)", "heat += 3", "commission -= 2", result="The scale reads 'on weight.' It also reads 'on weight' when you step on it. Concerning.", bot=2, ethics=-2)],
    roles={"subject": F(OURS + " && f.booked")}, vars={"fee": money(2, 6)}, cd=78)

# ------------------------------------------------------------------ sex, lies & subscription platforms
CH('rr_onlyfans', [
    ('rr_of_launch', 'Exclusive Content', [sc('social', "{subject.first} has launched a subscription page. The bio reads: 'Uncensored training. Uncensored recovery. Uncensored everything. You know what the fuck this is.' It has 9,000 subscribers in a day.")],
     [C("Demand a cut. It's your brand.", "earn('licensing', vars.fee)", "subject.loyalty -= 5", "follow('rr_of_leak', 6)", result="Legal drafts a revenue share agreement. Legal does not make eye contact with anyone for a week.", bot=2, ethics=-1),
      C("It's {his} body, {his} business", "subject.loyalty += 4", "sponsors -= 1", "follow('rr_of_leak', 6)", result="One sponsor pulls out. Wrong choice of words. One sponsor leaves.", default=True, ethics=1)]),
    ('rr_of_leak', 'The Leak', [sc('headline', "A clip from {subject.first}'s page has leaked to every group chat in the sport. It's just {him} doing an ice bath while reading the promotion's pay scale out loud and laughing.")],
     [C("Give {him} a raise. Quietly.", "spend('purses', vars.fee)", "fighters += 2", "media += 1", result="The laughing stops. The page posts a thank-you video. Fully clothed. Weirdly more threatening.", default=True, ethics=1),
      C("Go on a podcast and call it fake", "media -= 2", "heat += 2", result="It is not fake. The podcast host plays it back to you. On air.", bot=1)])],
    roles={"subject": F(OURS + " && (f.traits.has('Clout Chaser') || f.traits.has('Streamer') || f.traits.has('Showman'))")}, vars={"fee": money(10, 30)}, cd=260)

ONE('rr_ring_girl_sue', 'The Ring Girl Ultimatum', 'business',
    [visit("Your ring card girls have unionized. Their spokesperson, Destiny, drops a list on your desk: 'Pay, a heated dressing room, and if one more drunk motherfucker in row two grabs my ass, I'm walking the card into the cage and hitting him with it.'", "Destiny, Ring Card Union Local 1")],
     [C("Agree to everything ({$fee})", "spend('staff', vars.fee)", "media += 2", "fans += 1", result="Security gets a new policy: 'Grab, and you get grabbed.' Row two behaves for the first time in history.", default=True, ethics=2),
      C("Replace them with the interns in bikinis", "media -= 4", "heat += 2", "sponsors -= 2", result="The interns are a disaster. One trips into the cage. One quits mid-walk. One is now dating the heavyweight champion.", bot=1, ethics=-2)],
    vars={"fee": money(6, 18)}, cd=156)

ONE('rr_sponsor_condoms', 'Sponsor: Rubber Ducky', 'business',
    [phone("A condom brand called Rubber Ducky Extra Large wants the center of the octagon. Their tagline: 'For when you're the main event.' They're offering {$fee} and want the ring girls to throw samples into the crowd.", "Rubber Ducky marketing")],
     [C("Take the fucking money", "earn('sponsors', vars.fee)", "sponsors += 2", "network -= 1", result="The canvas logo is a giant winking duck. A fighter gets knocked out face-first directly on the duck. It becomes the photo of the year.", bot=2),
      C("Family-friendly brand, mate", "network += 1", result="Your network calls to say thanks. Then calls back to ask if the duck people have a number.", default=True)],
    vars={"fee": money(25, 60)}, cd=208)

# ------------------------------------------------------------------ drugs, debt & bad decisions (serious: never parodies)
CH('rr_bag', [
    ('rr_bag_found', 'Somebody Left Their Snow Globe', [doc("Cleaning crew found a bag of white powder in {subject.first}'s locker. Taped to it: a note that says 'PRE-WORKOUT (SPECIAL)'. The commission's surprise testing team arrives tomorrow.")],
     [C("Flush it and say nothing", "heat += 2", "subject.loyalty += 4", "follow('rr_bag_test', 1)", result="The toilet clogs. The plumber finds it. The plumber now has leverage.", bot=2, ethics=-2),
      C("Hand it to the commission", "commission += 3", "subject.loyalty -= 10", "subject.morale -= 6", result="The commission thanks you for your integrity and opens an investigation into your integrity.", default=True, ethics=2)]),
    ('rr_bag_test', 'Fucking Plumber', [phone("The plumber, Rick, would like {$fee}, two cageside seats and 'a picture with the bald guy who screams.' Otherwise he'd like to talk to a reporter.", "Rick (plumbing, extortion)")],
     [C("Pay Rick", "spend('misc', vars.fee)", "heat += 1", result="Rick gets his picture with Blow Hogan. Blow Hogan talks to him about elk for forty minutes. Rick considers this a fair trade.", default=True, ethics=-1),
      C("Tell Rick to go fuck himself", "media -= 3", "commission -= 2", "heat += 3", result="Rick goes to a reporter. The headline is 'PLUMBER BLOWS LID OFF PROMOTION'S PIPES.' You hate how good that headline is.", bot=1)])],
    cat='doping', roles=SUBJ, vars={"fee": money(4, 12)}, cd=260, tags=SER)

ONE('rr_bookie', 'A Friendly Visit', 'legal',
    [visit("Two very large men in very small tracksuits are in your office. They represent a 'sports investment collective' to whom {subject.first} owes {$fee}. They'd like {him} to lose on Saturday. 'Round two would be nice. We're not animals.'", "the Tracksuit Brothers")],
    [C("Call the commission", "commission += 3", "subject.morale -= 4", "heat += 2", result="The Tracksuit Brothers leave politely. Your car is egged that night. With ostrich eggs. That's a message.", default=True, ethics=2),
     C("Pay the debt from {his} purse", "spend('purses', vars.fee)", "subject.loyalty += 6", result="Debt cleared. {subject.first} hugs you and whispers 'I owe other guys too.' Fuck.", ethics=0),
     C("Say nothing. Book the fight. Bet on round two.", "earn('misc', vars.fee * 2)", "heat += 6", "chaos += 3", result="Round two. On the nose. You feel nothing. Then you feel everything at 3 a.m.", bot=2, ethics=-3)],
    roles={"subject": F(OURS + " && f.booked && f.traits.has('Gambler')")}, vars={"fee": money(15, 40)}, cd=208, tags=SER)

ONE('rr_president_bender', 'The Bender', 'president',
    [sc('narration', "You wake up in a hotel suite in a city you don't remember flying to. There is a tiger cub in the bathtub, a signed contract for a fight in Turkmenistan on the nightstand, and a woman named Crystal asleep on the championship belt. Your phone has 41 missed calls from the owner.")],
    [C("Honour the Turkmenistan contract", "earn('broadcast', vars.fee)", "patience -= 4", "chaos += 4", result="The event happens. The president of Turkmenistan fights on the undercard. He wins. He was always going to win.", bot=2, ethics=-1),
     C("Rip it up, return the tiger, call the owner", "patience += 2", "wealth -= 3", result="The tiger goes back to a man named Doug. You do not ask how Doug got a tiger. Crystal keeps the belt for a week.", default=True, ethics=1)],
    vars={"fee": money(40, 120)}, cd=312, tags=SER)

# ------------------------------------------------------------------ fucked-up promotion
ONE('rr_funeral_weighin', 'Weigh-In Venue Problem', 'business',
    [phone("The ceremonial weigh-in venue fell through. The only room available on Friday is a funeral home. There is a viewing in the next room. 'Very quiet family,' says the director. 'They won't mind if you keep it down.'", "Peaceful Pines Funeral Home")],
    [C("Book it. Ask the fighters to keep it down.", "fans += 2", "media += 2", "chaos += 2", result="The fighters do not keep it down. A heavyweight screams 'I'M GONNA PUT YOU IN THE GROUND' and a very old man in the next room gives a thumbs up.", bot=2, ethics=-1),
     C("Do it in the hotel parking lot instead", result="It rains. Everyone weighs in wet. Three fighters miss weight because of their soaked underwear.", default=True)],
    cd=208)

ONE('rr_mom_fight', 'Moms Gone Wild', 'fighter',
    [sc('fightnight', "Cageside, {subject.first}'s mother and {other.first}'s mother are fighting. Real punches. Earrings off. Someone's wig is in the cage. Security is losing. The crowd is chanting 'MOM! MOM! MOM!'")],
    [C("Book the moms on the next card", "fans += 4", "network += 2", "commission -= 3", "chaos += 3", result="The commission says 'absolutely fucking not'. The moms do it at the after-party anyway. Bigger gate than your co-main.", bot=2, ethics=-2),
     C("Separate them and comp their tickets for life", "fans += 1", "subject.loyalty += 3", "other.loyalty += 3", result="Both moms send you a fruit basket. Both baskets contain a threat.", default=True, ethics=1)],
    roles={"subject": F(OURS + " && f.booked"), "other": F(OURS + " && f.booked")}, cd=260)

ONE('rr_cutman_ebay', 'Authentic Fight Blood', 'business',
    [doc("Your cutman Eddie has been selling bloody gauze from fights on eBay. 'AUTHENTIC MAIN EVENT BLOOD, CERTIFICATE INCLUDED.' Four-thousand five-star reviews. One review says 'tastes legit.'")],
    [C("Fire Eddie", "fighters += 1", "media += 1", result="Eddie opens a competing store. 'BLOOD THE PROMOTION DOESN'T WANT YOU TO SEE.' It sells better.", default=True, ethics=1),
     C("Take it in-house. Official merch.", "earn('merch', vars.fee)", "fighters -= 3", "media -= 2", "sponsors -= 1", result="'Officially licensed blood' is a sentence you have now said in a board meeting. The board loved it.", bot=2, ethics=-3)],
    vars={"fee": money(10, 30)}, cd=312)

ONE('rr_owner_dinner', 'Dinner With The Owner', 'owner',
    [visit("The owner takes you to a steakhouse, orders for both of you, and says: 'Fighters are like steaks. You beat the shit out of them until they're tender and then you charge whatever the fuck you want.' He's waiting for you to laugh.", "the owner")],
    [C("Laugh. Loudly. Toast to it.", "patience += 4", "fighters -= 2", result="You laugh. He laughs. The waiter, a former amateur fighter, spits in your steak. You deserve it.", bot=2, ethics=-2),
     C("'They're people, sir.'", "patience -= 3", "fighters += 2", result="He stares at you for nine seconds. 'People are also steaks.' He picks up the check. You are not sure if that's a threat.", default=True, ethics=2)],
    cd=208)

ONE('rr_mascot', 'The Mascot', 'media',
    [visit("Marketing has made a mascot: 'Knuckles the Concussed Kangaroo.' It wobbles around, falls down, and asks fans what year it is. Kids love it. Neurologists have sent a letter. A long letter. With diagrams.", "the marketing department")],
    [C("Keep Knuckles", "fans += 3", "media -= 2", "commission -= 1", result="Knuckles merch outsells three of your champions. The neurologists' letter is framed in the break room.", bot=2, ethics=-2),
     C("Retire Knuckles", "media += 1", result="Knuckles' final appearance is a slow, dignified walk into a dumpster. A child cries. Marketing cries harder.", default=True, ethics=1)],
    cd=312)

ONE('rr_reporter_roast', 'The Disrespect', 'media',
    [sc('presser', "{reporter.name} asks if your promotion is 'a legitimate sport or just a really violent pyramid scheme.' The room goes silent. Your fighters are looking at you. The live stream has 80,000 people on it.")],
    [C("'Go fuck yourself, next question.'", "fans += 3", "media -= 3", "heat += 1", result="It becomes the most-quoted line in the history of the sport. A sponsor puts it on a T-shirt. Without asking. You sue. You lose. You buy the shirt.", bot=2),
     C("Answer seriously and calmly", "media += 2", result="It is a calm, measured answer. Nobody clips it. The clip of the reporter's question gets 4 million views.", default=True, ethics=1)],
    roles={"reporter": R()}, cd=156)

ONE('rr_heckler', 'Row Two', 'fighter',
    [sc('fightnight', "A heckler in row two has spent the whole night yelling things at {subject.first} about {his} mother, {his} hairline and {his} 'little baby wrestler ankles.' {subject.first} just won by knockout and is now climbing the cage. Toward row two.")],
    [C("Let {him} go. The crowd's earned it.", "fans += 4", "commission -= 3", "subject.hype += 10", "heat += 2", result="{subject.first} doesn't hit him. {He} just stands over him, takes his nachos, and eats them while staring. The heckler has never been so afraid.", bot=2, ethics=-1),
     C("Security! Grab {him}!", "commission += 1", "subject.morale -= 3", result="It takes six security guards and the referee. The heckler is escorted out for his own protection. He's crying. He's still heckling.", default=True)],
    roles={"subject": F(OURS + " && f.traits.has('Hothead')")}, cd=156)

ONE('rr_vasectomy', 'Sponsored Procedure', 'business',
    [phone("A men's health clinic will sponsor your entire prelim card if one fighter gets a vasectomy live on the pre-show. 'Snip City.' They offer {$fee}. They've already built the set.", "Snip City Men's Clinic")],
    [C("Find a volunteer", "earn('sponsors', vars.fee)", "network += 2", "commission -= 2", "chaos += 2", result="A journeyman with eleven kids volunteers before you finish the sentence. The pre-show does a 2.1 rating. 'Snip City' becomes a chant.", bot=2, ethics=-2),
     C("No. Just no.", result="They take the deal to your rival. Your rival's prelim fighter screams so loud the network cuts to an infomercial.", default=True)],
    vars={"fee": money(20, 50)}, cd=312)

ONE('rr_group_chat', 'The Group Chat Leak', 'president',
    [doc("Someone leaked the executive group chat. Highlights include you calling the commission 'a bunch of clipboard-sucking fucks', the owner calling the fans 'wallets with feelings', and someone in marketing posting a photo of their ass with the caption 'Q3 projections.'")],
    [C("Deny everything. Blame Russian hackers.", "media -= 2", "patience -= 2", "heat += 2", result="The Russian hackers issue a statement denying it. It's somehow the most embarrassing part.", bot=1),
     C("Own it. Apologise. Fire marketing.", "commission += 2", "media += 1", "patience -= 1", result="Marketing's ass becomes a meme. Marketing gets hired by your rival. Marketing is thriving.", default=True, ethics=1)],
    cd=260)

ONE('rr_drunk_ref', 'Ref Smells Like a Distillery', 'commission',
    [phone("Your matchmaker says the referee assigned to the main event is 'absolutely shitfaced' in the hotel bar and is currently trying to fight a ficus. The commission can't send a replacement in time.", "your matchmaker")],
    [C("Black coffee, cold shower, pray", "commission -= 1", "chaos += 2", result="He refs the main event with sunglasses on. He stops the fight perfectly. He then falls out of the cage. Somehow it's the best officiated fight of the year.", default=True),
     C("Complain to the commission", "commission += 2", "network -= 1", result="They send a backup ref: a 74-year-old who last reffed in 1996. The fight goes the distance. So does his nap.", ethics=1)],
    cd=208, tags=SER)

ONE('rr_wrong_anthem', 'Anthem Malfunction', 'media',
    [sc('fightnight', "The singer hired for the anthem is drunk. She's halfway through a version that's mostly moaning and the word 'freedom' four times. Then she says 'fuck yeah, America' into the mic and drops it. The crowd is going nuts.")],
    [C("Book her for every event", "fans += 3", "network -= 1", "media += 2", result="'Fuck Yeah America Lady' becomes a recurring segment. She has an agent now. Her rider demands a bottle of Fireball and a stool.", bot=2),
     C("Apologise to the network", "network += 1", result="The network accepts. Privately, the network says it was the best ratings minute of the night.", default=True)],
    cd=260)

ONE('rr_trashtalk_line', 'The Line', 'fighter',
    [sc('presser', "At the face-off, {subject.first} leans in and tells {other.first} something nobody hears. {other.first} goes white, then red, then throws a chair, a water bottle and a smaller fighter. Later, the mic reveals what was said: '{other.first}, your wife says hi. She says hi a lot.'")],
    [C("Run it in every promo", "fans += 4", "subject.hype += 8", "other.hype += 8", "rivalry(subject, other)", result="The PPV sells like fucking crack. {other.first}'s wife posts a statement: 'I do say hi a lot. I'm friendly.' It doesn't help.", bot=2, ethics=-2),
     C("Fine {subject.first} and cut the audio", "subject.morale -= 3", "media += 1", result="The audio leaks anyway. Lip readers on Reddit reconstruct it in eleven minutes.", default=True, ethics=1)],
    roles={"subject": F(OURS + " && f.booked && f.traits.has('Trash Talker')"), "other": F(OURS + " && f.booked")}, cd=156)

ONE('rr_pee_test', 'Somebody Else\'s Piss', 'doping',
    [doc("{subject.first}'s urine sample came back... pregnant. The commission would like to know whose piss this is. {subject.first} says, and this is a direct quote, 'I don't know, my cousin's?'")],
    [C("Back {his} story. Somehow.", "commission -= 4", "heat += 3", "subject.loyalty += 4", result="The cousin is subpoenaed. The cousin is very pregnant and very angry.", bot=2, ethics=-2),
     C("Cooperate fully", "commission += 2", "subject.morale -= 6", result="{subject.first} is suspended. {His} cousin sends you a baby shower invitation. You go. It's awkward.", default=True, ethics=2)],
    roles=SUBJ, cd=312, tags=SER)
