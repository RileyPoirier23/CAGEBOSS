"""Career-mode text: the owner's check-ins, the reporter 1ton, and the weekly
front-page headline bank (MMA meme culture, shitposting, your roster's drama).

Run: python3 tools/career_src.py   (writes data/career/owner.json, oneton.json, frontpage.json)

Rules of the house: R-rated is fine, slurs never. Crime / doping / DUI / bar-fight
headlines only ever get GENERATED fighters (the game never casts the parodies of
real people in that stuff) - the code enforces that, the slots below say which
kind of fighter each template takes.

Front-page slots
  {a} {b}         two different fighters on your roster (anyone, harmless jokes only)
  {g}             a generated (non-parody) fighter on your roster (edgier jokes)
  {winner} {loser} {method} {event} {round}   last event's notable result
  {belt}          title name
  {fighter} {rank} {old} {div}                 a rankings mover
  {charge} {city} {weeks}                      controversies (generated fighters only)
  {owner} {company} {president} {promotion}    the people in charge
  {mex}           a Mexican fighter (1ton headlines)
  {pop_movie} {pop_celeb} ... any pop-culture parody kind
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'data', 'career')

# ------------------------------------------------------------------ owner

OWNER = {
  # first visit ever
  'beat_intro': [
    "So you're {president}. I'm {owner}. Zenith Holdings bought this league as a tax write-off, but my therapist says I need a hobby that isn't yelling at caddies. So: you. Here's how this works. I come by every few weeks, I tell you what I want, you do it, I give you money and toys. You don't do it, I give you a look. You don't want the look.",
    "{president}! {owner}. I own the thing you run. Don't get up. Actually, get up, that's my chair. Listen: right now {promotion} is a {tier}. I want it on television, I want it in arenas, I want it on the side of a blimp. Every few weeks I'll swing by with goals. Hit them and the budget grows. Miss them and I start 'exploring options'.",
  ],
  'greet_pleased': [
    "{presidentLast}! My guy! The board used the word 'momentum' in a sentence about us. Unprompted.",
    "There he is. The man, the myth, the forehead. Things are good, {presidentLast}. Don't touch anything.",
    "{presidentLast}, I brought cigars. Not for you, I just like holding them in your office. Good work lately.",
    "My accountant smiled yesterday. He hasn't smiled since 2009. Whatever you're doing, keep doing it.",
    "My wife asked me what you do. I said 'he makes money appear'. She asked if you're single. You're not. Moving on.",
  ],
  'greet_neutral': [
    "{presidentLast}. Sit. We need to talk about my expectations, which are high, and your results, which are... present.",
    "Morning. I've got a tee time in forty minutes, so let's make this quick and profitable.",
    "{presidentLast}. I read the numbers on the toilet this morning. Appropriate venue for them.",
    "Hey, {presidentLast}. You look tired. Good. Tired means working. Let's talk.",
    "I'm going to be honest with you, {presidentLast}, because my life coach says I should practice. It's fine. It's FINE. It could be better.",
  ],
  'greet_furious': [
    "{presidentLast}. Close the door. Close it harder. I want the hinges to feel what I feel.",
    "Do you know what the board called {promotion} on Thursday? A 'distressed asset'. I had to Google it. Then I had to lie down.",
    "I'm not mad. I'm DISAPPOINTED. No, I'm mad. Both. I'm madappointed.",
    "{presidentLast}, my yacht has a smaller budget than you and it has never once embarrassed me on the news.",
    "I've got a guy. A replacement guy. He's waiting in the lobby. He's eating your granola bar. Convince me not to call him in.",
  ],
  'greet_pleased_corp': [
    "{presidentLast}. Brynn Kessler-Vance, OmniVore. Your quarter is tracking 'above vibes'. That's our highest internal rating.",
    "Good morning. Leadership loves the content velocity. I'm told that means the fights.",
  ],
  'greet_neutral_corp': [
    "{presidentLast}. I have nine minutes and a synergy deck. Let's align.",
    "Hi. We're going to do a quick check-in. Think of me as a friend who can fire you.",
  ],
  'greet_furious_corp': [
    "{presidentLast}. Leadership has flagged {promotion} as 'a learning opportunity'. Nobody wants to be a learning opportunity.",
    "I'm going to be direct, which at OmniVore is a disciplinary offense: this is bad.",
  ],
  'met': [
    "You did it: {obj}. Look at you. I'm wiring the bonus before I change my mind.",
    "\"{obj}\" - done. Check your budget, there's a little something in there. Don't tell the fighters.",
    "{obj}? Nailed it. I told the board you were a genius. I also told them I could dunk. One of those was true.",
    "I asked you to {obj}, and you did. Do you know how rare that is? My kids can't even load a dishwasher.",
  ],
  'failed': [
    "I asked for one thing: {obj}. ONE. You gave me zero. That's not even a number, {presidentLast}, that's a hole.",
    "\"{obj}.\" That was the assignment. What happened? Don't answer. I can smell the excuse from here.",
    "{obj} - missed. I'm writing it in my little book. You don't want to be in the little book.",
    "We said {obj}. You said 'sure thing, boss'. I say: where's my thing, {presidentLast}?",
  ],
  'met_corp': [
    "{obj}: complete. Leadership will send a celebratory email with no attachments. Budget transfer incoming.",
  ],
  'failed_corp': [
    "{obj}: not achieved. I've scheduled a post-mortem. You are the mortem.",
  ],
  'no_results': [
    "Nothing came due since last time, so I'll just stand here and judge your office decor. That poster is crooked.",
    "No report card this week. Use the time wisely. Or at least look busy when I walk by.",
  ],
  'warning': [
    "Between us: the board is talking about you. Not the fun kind of talking. The kind with lawyers in the room.",
    "My patience is a fuel tank, {presidentLast}, and the little light is ON.",
  ],
  'assign': [
    "Here's what I want next. I wrote it on a napkin so you know it's serious.",
    "New homework. Do it and the money keeps coming. Do it well and I'll unlock the good toys.",
    "Next goals. My consultant charged me six figures for these, so treat them like scripture.",
  ],
  'assign_corp': [
    "Here are your KPIs. I've bolded the ones that decide whether you have a parking space.",
  ],
  'signoff': [
    "Alright. I've got a lunch with a senator and a sea bass. Make me proud.",
    "Gotta go. My driver is double-parked on a fire hydrant. It's his third this week. Legend.",
    "That's all. Hit your numbers and the {nexttier} life is right around the corner.",
    "I'm off. Don't screw this up. Or do, and make it entertaining.",
    "Love you, {presidentLast}. Platonically. Professionally. Financially, mostly.",
  ],
  'signoff_corp': [
    "Thanks for your time. This meeting could have been an email, and next time it will be.",
    "Great sync. Leadership will be in touch. Leadership is always in touch.",
  ],
  'gift_prospect': [
    "One more thing. Kid from my cousin's gym. {fighter}. Twenty-something, hits like a car accident, scouts are drooling. He wants in. Cheap, too.",
    "I found you a fighter. {fighter}. My guy in the amateur scene says he's the next big thing. I've never heard my guy say that. My guy usually says 'no comment'.",
  ],
  'gift_nephew': [
    "Now. Family business. My sister's kid, {fighter}. He's 'into MMA'. He's done a lot of 'cardio'. I need you to sign him. I'm not asking. I'm asking in a way that isn't asking.",
    "My nephew {first} wants to be a fighter. He has a ring light, a podcast and a black belt from a strip mall. You're going to sign him. It'll make Thanksgiving bearable.",
  ],
  'gift_vet': [
    "My golf buddy swears by {fighter}. Says he was 'unbelievable in 2011'. It's not 2011, but he's cheap and he owns a boat. Want him?",
    "Here's a veteran. {fighter}. Seen it all, felt most of it. Good for the locker room, they tell me. Your call.",
  ],
  'gift_prospect_yes': ["Smart. That's why I keep you around. Well, that and the forehead.", "Good. If he turns into a champion I'm taking full credit at the club."],
  'gift_prospect_no': ["Your loss. Probably my loss. Definitely somebody's loss.", "Fine. When he's a champion somewhere else I'm going to frame his poster and hang it in your office."],
  'gift_nephew_yes': ["Wonderful. My sister will stop calling me. You're a hero, {presidentLast}. Don't let him get hurt. Let him get a LITTLE hurt. Character.", "Beautiful. He's going to be a star. He already has the merch. He made it before he signed."],
  'gift_nephew_no': ["You said no to my NEPHEW? To family? I'm going to remember this at the next budget meeting.", "Okay. Okay. I'll tell my sister you said no. In person. At your house, probably."],
  'gift_vet_yes': ["Great, my buddy's thrilled. He's going to tell everyone at the club he 'made a call'.", "Good man. Respect your elders. Punch them too, but respect them."],
  'gift_vet_no': ["Fair. He's old. I'm old. We're all old. Pass.", "No? Fine, I'll tell my buddy you said he was 'past it'. He'll cry on the boat."],
  'gift_prospect_corp': ["OmniVore Analytics flagged a prospect: {fighter}. The model gives him a 'synergy score' of 94. I don't know what that means either. Sign him?"],
  'gift_vet_corp': ["Brand partnerships wants {fighter} on the roster. He has 'legacy equity'. He also has two bad knees. Your call."],
  'gift_prospect_yes_corp': ["Great. I'll tell the model it was right. It gets insufferable."],
  'gift_prospect_no_corp': ["Noted. I'll log it as 'human override'. Those get reviewed."],
  'gift_vet_yes_corp': ["Wonderful. Brand partnerships will send a fruit basket. To him, not you."],
  'gift_vet_no_corp': ["Fine. Brand partnerships will be sad in a very professional way."],
  'warning_corp': ["You're on a performance improvement plan now. It's a PDF. The PDF is long."],
  'no_results_corp': ["No deliverables came due. I'll use the time to look disappointed in a general sense."],
  # story beats
  'beat_contender': [
    "Big idea. MY big idea, I want that clear. A show for nobodies. Hungry kids, one night, win and you get a contract. Tuesday nights. Cheap studio. Television eats it up. You run it, I take credit.",
  ],
  'beat_tier_1': [
    "{promotion} is officially a {tier}. Three counties know our name. One of them thinks we're a lawn service, but still. Next stop: {nexttier}.",
  ],
  'beat_tier_2': [
    "We're a {tier} now. National, {presidentLast}! A guy recognized our logo at the airport. He was a TSA agent and he was confiscating it, but he RECOGNIZED it.",
  ],
  'beat_tier_3': [
    "{tier}. Our logo is on a bus, a billboard, and a stripper's lower back in Tampa. That's brand awareness. The board wants {nexttier} and so do I.",
  ],
  'beat_tier_4': [
    "{tier}. Foreign governments are calling. A prince asked if we do 'private events'. I said we'd 'circle back'. I've never circled back in my life.",
  ],
  'beat_tier_5': [
    "{tier}. That's the top of the mountain, {presidentLast}. Nothing left to climb. So now we defend it. From everyone. Forever. Sleep is for boxing promoters.",
  ],
  'beat_act_2': [
    "A fight went viral. My grandmother sent me the clip. My GRANDMOTHER. People care now, {presidentLast}. Which means people are watching. Which means you can't screw up quietly anymore.",
  ],
  'beat_act_3': [
    "The board wants international. Visas, foreign commissions, women's divisions, a fighter who wants to box. I want it all and I want it cheap. Welcome to the empire years.",
  ],
  'beat_act_4': [
    "It's done. I sold. Billions, {presidentLast}. You're still the president, you just have a new boss now, and her calendar has fifteen-minute increments. Be nice to her. Actually, be afraid of her.",
  ],
  'beat_act_5': [
    "This is the last chapter, {presidentLast}. Legacy time. Whatever you do from here is what they'll write on your tombstone. Make it a good one. Make it a sponsored one.",
  ],
  'beat_sale_rumor': [
    "Between us: there are people sniffing around. Big people. Conglomerate people. If they make the right offer, I'm out. Keep the numbers pretty. Pretty numbers make pretty offers.",
  ],
  'beat_sold': [
    "Hi, {presidentLast}. Brynn Kessler-Vance, Executive VP of Synergy at OmniVore Global Entertainment & Defense. Chet sends his regards from a yacht. I'll be doing the check-ins now. I don't play golf. I play to win.",
  ],
  'beat_nephew_won': [
    "My nephew WON a fight. In a cage! My sister cried. I cried. The other guy cried, I think, his face was hard to read. Whatever you're doing, keep the matchmaking 'gentle'.",
  ],
  'beat_nephew_lost': [
    "So my nephew lost. My sister isn't speaking to me, which is a gift, but she's speaking to her LAWYER, which is not. Find him a softer opponent. A much softer opponent. A pillow with arms.",
  ],
}

# ------------------------------------------------------------------ 1ton

ONETON = {
  # presser: a Mexican fighter is on this card ({f} = the fighter, {opp} = opponent)
  'ask_card': [
    "1ton, the Lucha Lowdown. Question for {f}: when do you headline? Because Mexico has been watching and Mexico is ready to riot. Politely.",
    "Big guy in the back, it's me, 1ton. {f}, real talk: is it true you trained for this camp in the mountains outside Guadalajara and fought a bull? My sources say yes. My sources are me.",
    "1ton. Only one question tonight, and it's for {f}. Is {opp} aware of what's about to happen to him? Is he aware of Mexican cardio? Has anyone warned him?",
    "1ton here. {presidentLast}, why is {f} not the main event? I've done the math. The math says main event. The math is Mexican.",
    "{f}! 1ton! Is it true your abuela is flying in? Because if she's in the building, I'm calling it now: knockout, round one.",
  ],
  # presser: Mexican fighters on the roster but not on this card
  'ask_roster': [
    "1ton. Where is {f}? Why is {f} not on this card? I flew here. I paid for parking. I'm asking about {f}.",
    "1ton, the Lucha Lowdown. I have one question and it's the same question as last time: when does {f} fight again, and can it be in Mexico City, and can I have front row?",
    "Hi, 1ton. Great event. Anyway. {f}. When? Where? Against who? Can it be a five-rounder? Asking for 130 million people.",
  ],
  # presser: none on the roster
  'ask_none': [
    "1ton. I counted the card twice. Zero Mexican fighters. Zero. Do you hate tacos, {presidentLast}? Do you hate joy? Explain yourself.",
    "1ton, the Lucha Lowdown. No Mexican fighters on this roster. None. I'm not even mad, I'm just going to sit here and breathe loudly until you fix it.",
    "Question from 1ton: is {promotion} aware Mexico exists? It's right there. Under Texas. You can drive to it.",
  ],
  # presser: pitching a Mexican fighter from elsewhere ({f} = free agent or rival fighter, {where})
  'ask_other': [
    "1ton. Have you heard of {f}? {where}. Undefeated in my heart. Sign him. I'll carry his bags. I'll carry HIM.",
    "1ton here. There's a kid named {f}, {where}, and he's better than half your roster. I'm not saying which half. I'm saying it with my eyes.",
  ],
  # president's possible answers
  'answer_promise': ["Main event. Soon. I promise.", "You'll get your Mexican fighter in a main event, 1ton.", "Mexico City show. I'm working on it."],
  'answer_deflect': ["Next question.", "Anybody else? Anybody? Not you, 1ton.", "We'll see, 1ton. We'll see."],
  'answer_joke': ["1ton, do you have a question that isn't about Mexican fighters?", "Is there a version of you that asks about anyone else?"],
  # 1ton's comebacks
  'react_promise': [
    "1ton writes PROMISE in capital letters, underlines it three times, and shows it to the camera.",
    "\"I'm holding you to that,\" says 1ton, stroking a beard you could lose a set of keys in.",
    "1ton nods slowly, like a man who has been lied to before and has a long memory and a longer beard.",
  ],
  'react_deflect': [
    "1ton keeps his hand up. He keeps it up for the rest of the press conference. He keeps it up in the parking lot.",
    "\"That's not an answer,\" says 1ton. \"That's a Wikipedia article about not answering.\"",
    "1ton sighs so hard the mic stands sway.",
  ],
  'react_joke': [
    "\"Yes,\" says 1ton. \"Here it is: what about the Mexican fighters?\" The room applauds.",
    "1ton considers it. \"No,\" he says, with enormous dignity.",
    "\"I asked about the weather once,\" says 1ton. \"It was in Monterrey.\"",
  ],
  # live bleets during fights
  'bleet_mex': [
    "{x} IS THE REAL DEAL. VIVA MEXICO. I SAID THIS IN 2019.",
    "Mexican cardio is not a meme. It's a law of physics. Look at {x}.",
    "My beard just stood up. {x} is cooking.",
    "{x} fighting like rent is due in pesos. Beautiful.",
    "Somebody check on {y}. Actually don't. Let {x} cook.",
    "Abuela is watching, {x}. Make her proud. (You are making her proud.)",
    "THIS is why I only ask about Mexican fighters. Look at {x}. LOOK AT HIM.",
  ],
  'bleet_non': [
    "Neither of these guys would last a round in a Tijuana parking lot.",
    "Wake me up when a Mexican fighter is on.",
    "{x} and {y} fighting like two guys arguing over a parking spot. Where's the heart? Where's the Mexico?",
    "This fight has the energy of decaf. Put a Mexican fighter on this card, cowards.",
    "{x} is okay. {x} is not Mexican, but okay.",
    "Still no Mexican fighters on this card. I'll keep bleeting until it changes. I have time. I have a big phone.",
    "{y} fighting like he's never had a real torta. You can tell.",
    "My nephew could beat both of these men and he's eleven and from Puebla.",
  ],
  # paper feed posts
  'feed': [
    "Reminder: {promotion} has {n} Mexican fighters on the roster. I'll be asking about every single one at the presser.",
    "I've asked about Mexican fighters at 40 straight press conferences. Going for 41.",
    "If {promotion} doesn't do a Mexico City card this year I'm shaving my beard. (I'm not. But think about how serious that sounds.)",
    "Ranking every fighter on the {promotion} roster by how Mexican they are. Thread. 1/1.",
    "People say I only care about Mexican fighters. That's not true. I also care about their opponents, a little, as obstacles.",
  ],
}

# ------------------------------------------------------------------ front page

FP = []

def add(kind, items, tone=0.0):
    for i, it in enumerate(items):
        if isinstance(it, tuple):
            text, body = it
        else:
            text, body = it, ''
        FP.append({'id': f'fp_{kind}_{i}', 'kind': kind, 'text': text, **({'body': body} if body else {}), 'tone': tone})

# MMA meme culture & shitposting (any roster fighter, harmless)
add('meme', [
  ("{a} AND {b} TOUCH GLOVES; INTERNET DECLARES IT A WEDDING", "Registry is at a supplement store. Bridesmaids will be cornermen. The officiant is the referee, who has asked everyone to 'keep it clean'."),
  ("\"WHO'S YOUR GOAT?\" DEBATE ENTERS 400TH HOUR; MAN IN COMMENTS STILL SAYS {a}", "Historians, statisticians and a guy named Brayden have weighed in. Brayden's argument is 'vibes'. Brayden is winning."),
  ("BUM FIGHTS BUM, BUM OF THE NIGHT AWARDED TO BUM", "Fans are calling the performance 'a fight between two men'. Bonus checks were written in crayon."),
  ("{a} HASN'T BEEN THE SAME SINCE {b} LOOKED AT HIM FUNNY AT A WEIGH-IN", "Sources close to {a} say he still flinches at eye contact and has switched to sunglasses indoors."),
  ("LOCAL MAN WATCHES ONE FIGHT, NOW EXPERT ON THE CALF KICK", "He has kicked his own calf eleven times to 'feel the science'. He walks with a cane now. He calls it research."),
  ("\"I'D LAST A ROUND\": 4 MILLION MEN SAY IT ON {pop_app}; ZERO VOLUNTEER", "{promotion} has offered any of them a three-round fight. The comments section went quiet for the first time in recorded history."),
  ("{a} POSTS 'HUMBLE' TRAINING VIDEO; IT IS 9 MINUTES OF HIM HITTING PADS IN SLOW MOTION TO {pop_musician}", ""),
  ("FANS CONVINCED {a} AND {b} ARE THE SAME PERSON; NEVER SEEN IN THE SAME ROOM", "Both men deny it in identical statements, posted at the same time, from the same phone."),
  ("\"HE'S NEVER BEEN THE SAME SINCE...\" TRENDS AGAIN; THIS TIME ABOUT A GUY WHO STUBBED HIS TOE", ""),
  ("THE PEOPLE'S CHAMP CONTROVERSY: FANS DEMAND {a} BE GIVEN A BELT FOR 'AURA'", "A petition has 80,000 signatures. Thirty thousand of them are {a}."),
  ("RINGSIDE FAN'S FACIAL EXPRESSION BECOMES THE MEME OF THE YEAR; FAN SIGNS WITH {promotion} AS 'REACTION GUY'", ""),
  ("STUDY: 98% OF MMA COMMENTS ARE 'SKILL ISSUE'; REMAINING 2% ARE 'LMAO'", ""),
  ("{a} SAYS HE 'DIDN'T FEEL A THING' AFTER FIGHT IN WHICH HE VISIBLY FELT EVERY THING", ""),
  ("JOE BROGAN EXPERIENCE GUEST SAYS ELK MEAT CURES KNOCKOUTS; DOCTORS: 'NO'", "Brogan asked a follow-up question about a chimpanzee and the conversation never recovered."),
  ("'TOUCH OF DEATH' MASTER CHALLENGES {a}; MASTER TOUCHED, IS FINE, {a} BORED", ""),
  ("FIGHTER SAYS HE'S 'IN THE BEST SHAPE OF HIS LIFE' FOR 40TH CONSECUTIVE CAMP; LIFE NOW MOSTLY SHAPE", ""),
  ("{a} WALKOUT SONG LEAKED; IT'S THE {pop_show} THEME, AND IT'S FIRE", ""),
  ("INTERNET DEMANDS 'RUN IT BACK' ON FIGHT NOBODY WATCHED THE FIRST TIME", ""),
  ("{b} RESPONDS TO CRITICS WITH 14-PARAGRAPH NOTES APP SCREENSHOT; CRITICS READ FIRST LINE", ""),
  ("THE 'DANA-STYLE' PRESS CONFERENCE SHRUG IS NOW A SANCTIONED SPORT IN 3 STATES", ""),
  ("MAN WHO SAYS 'MMA MATH' AT PARTIES STILL NOT INVITED TO PARTIES", ""),
  ("{a} VS. A GORILLA POLL: 61% PICK THE GORILLA; {a} 'HURT BUT NOT SURPRISED'", "The gorilla has not responded to the callout. The gorilla's team says he 'doesn't do social media'."),
  ("FANS AT {promotion} EVENT START 'BORING' CHANT DURING NATIONAL ANTHEM", ""),
  ("{a} GOES VIRAL FOR STARING CONTEST WITH A SEAGULL; SEAGULL WINS BY DECISION", ""),
  ("BREAKING: GUY WHO 'TRAINED BJJ FOR A MONTH IN 2014' WILL BE REACHING OUT TO {promotion} MATCHMAKERS", ""),
  ("{a}'S CORNER ADVICE 'JUST WIN THE ROUND' NOMINATED FOR COACHING AWARD", ""),
  ("{a} AND {b} SHARE AN ELEVATOR; WITNESSES DESCRIBE 'THE LONGEST NINE FLOORS OF THEIR LIVES'", ""),
  ("JUDGES SCORE BOUT 30-27, 30-27, 'VIBES'; COMMISSION REVIEWING THIRD CARD", ""),
  ("FIGHT FANS DISCOVER {pop_movie}; REVIEW BOMB IT FOR 'NOT ENOUGH CALF KICKS'", ""),
  ("{a} SPOTTED READING A BOOK; FANBASE SPLITS INTO 'INTELLECTUAL ERA' AND 'FAKE, IT'S UPSIDE DOWN' CAMPS", ""),
  ("{pop_celeb} SITS CAGESIDE, ASKS WHEN THE 'FOOTBALL PART' STARTS", ""),
  ("UNDERRATED/OVERRATED: {a} NOW BOTH, SIMULTANEOUSLY, DEPENDING ON THREAD", ""),
  ("{a} TRASH TALK 'TOO WHOLESOME', SAYS {b}; {a} RESPONDS 'HAVE A BLESSED DAY, YOU FIEND'", ""),
  ("FANS COMPLAIN FIGHT ENDED TOO FAST; SAME FANS COMPLAINED LAST WEEK IT WENT TOO LONG", ""),
  ("NEW STRAWWEIGHT DISCOURSE: 'WOULD YOU FIGHT 100 FLYWEIGHTS OR ONE HEAVYWEIGHT?'", "A survey of {promotion} fighters found the flyweights 'insulted' and the heavyweights 'hungry'."),
  ("'HE GOT THAT DAWG IN HIM' NOW OFFICIAL SCORING CRITERIA, CONFIRMS NOBODY", ""),
  ("FIGHTER'S ENTIRE PERSONALITY IS ONE (1) SPINNING BACK FIST HE LANDED IN 2021", ""),
  ("{a} BECOMES {pop_food} BRAND AMBASSADOR; HAS NEVER EATEN {pop_food}", ""),
  ("THE 'CHIN CHECK' CHALLENGE IS SWEEPING {pop_app}; HOSPITALS ASK IT TO STOP SWEEPING", ""),
  ("{a} STARES DOWN HIS OWN REFLECTION AT WEIGH-INS; REFLECTION BLINKS FIRST", ""),
  ("FANS ANALYZE {a}'S INSTAGRAM STORY FRAME BY FRAME, CONCLUDE HE 'LOOKS SAD AROUND THE EYES'", "He was squinting. It was sunny."),
  ("TIKTOK BJJ GUY EXPLAINS WHY {a} 'SHOULD HAVE JUST TAKEN THE BACK'; TIKTOK BJJ GUY HAS NEVER TAKEN A BACK", ""),
  ("'NEVER BACK DOWN' BECOMES 'NEVER BACK UP': {a} HAS NOT TAKEN A STEP BACKWARD SINCE 2019", ""),
  ("{a} THREATENS TO 'RETIRE {b}'; {b} ALREADY HAS A 401K", ""),
  ("BREAKING: GUY WHO PICKED EVERY FAVORITE TO WIN CALLS HIMSELF 'SHARP'", ""),
  ("RINGSIDE DOCTOR GOES VIRAL FOR LOOKING INTO {a}'S EYES 'LIKE A ROMANCE NOVEL'", ""),
  ("FAN TATTOOS {a}'S FACE ON HIS BACK; {a} LOSES; FAN NOW HAS 'A COMPLICATED BACK'", ""),
  ("{a} CLAIMS HE KNOCKED OUT A HORSE; HORSE'S REPRESENTATIVES DENY", ""),
  ("CONSPIRACY THEORISTS SURE {a}'S LAST FIGHT WAS 'SCRIPTED'; SCRIPT WOULD HAVE BEEN BETTER", ""),
  ("MMA TWITTER SPENDS 11 HOURS ARGUING ABOUT WHETHER A HEADBUTT IS 'TECHNICALLY A HUG'", ""),
  ("{a} DOES 'FIRST TIME TRYING' VIDEO WITH {pop_food}; COMMENTS ONLY ASK ABOUT HIS EARS", ""),
  ("THE FAMOUS 'I'M NOT SURPRISED, MOTHERF-' CLIP TURNS 10; STILL NOT SURPRISED", ""),
  ("FLYWEIGHT FIGHTS NOW LEGALLY REQUIRED TO BE CALLED 'CRIMINALLY UNDERRATED'", ""),
  ("{a} BUYS A LAMBORGHINI; PARALLEL PARKS IT LIKE A HEAVY BAG", ""),
  ("'FIGHT WEEK' NOW LONGER THAN THE ACTUAL WEEK, SAYS {promotion} CALENDAR", ""),
  ("ARMCHAIR EXPERT RANKS ALL 11 DIVISIONS BY 'DAWG LEVEL'; DOCTORAL THESIS PENDING", ""),
  ("FIGHTER CALLS OUT 'EVERYBODY'; EVERYBODY BUSY", ""),
  ("{a} SPENDS ENTIRE CAMP 'WORKING ON THE MENTAL'; LOSES TO A PHYSICAL", ""),
  ("FANS VOTE {a}'S WALKOUT 'MORE EXCITING THAN THE FIGHT, THE CARD, AND THEIR MARRIAGE'", ""),
  ("'MMA IS THE FASTEST GROWING SPORT', SAY MMA PEOPLE, FOR 20TH YEAR IN A ROW", ""),
  ("{a} SAYS HE'S 'NOT HERE TO MAKE FRIENDS'; HAS 41 FRIENDS ON THE ROSTER", ""),
  ("{a} SEEN EATING SALAD; INTERNET ASSUMES INJURY", ""),
  ("THE SPRAWL-AND-BRAWL VS. LAY-AND-PRAY WAR CLAIMS ANOTHER FAMILY THANKSGIVING", ""),
  ("{a} REFUSES TO TOUCH GLOVES; {b} REFUSES TO TOUCH GRASS; BOTH SUSPENDED FROM THE INTERNET", ""),
  ("MAN AT BAR EXPLAINS GUARD PASSING TO BARTENDER WHO IS A BLACK BELT", "She let him finish. Then she passed his guard. It was a metaphor. It was also not a metaphor."),
  ("{a} SAYS HIS FIGHT IQ IS 'CHAMPIONSHIP LEVEL'; MENSA DECLINES COMMENT", ""),
  ("CAGE DOOR GETS STUCK, LONGEST 'MAIN EVENT' OF THE NIGHT", ""),
  ("{a} 'WOULD SMOKE' {pop_athlete}, CLAIMS MAN IN {pop_app} COMMENTS WHO HAS NOT MET EITHER", ""),
  ("FAN JUDGE SCORECARDS ARE IN: {a} WON EVERY ROUND, INCLUDING THE ONES HE WAS ASLEEP IN", ""),
  ("BREAKING: {a} HAS A PODCAST NOW", "It is two hours long. Ninety minutes are about protein. Episode one has eleven listeners. Ten are {a}'s cousins."),
  ("{b} SAYS {a} 'FIGHTS SCARED'; {a} SAYS {b} 'TALKS SCARED'; LINGUISTS CONFUSED", ""),
  ("THE 'NOT MY CHAMP' DISCOURSE RETURNS, THIS TIME ABOUT A BELT THAT IS VACANT", ""),
  ("PEOPLE ARE SAYING {a} HAS 'THAT ONE PUNCH' AND {b} HAS 'THAT ONE PUNCH FACE'", ""),
  ("FIGHTER WALKS OUT TO SILENCE AS PROTEST; CROWD ALSO PROTESTS WITH SILENCE; NOBODY SURE WHO WON", ""),
  ("WORLD'S MOST CONFIDENT MAN PREDICTS FIRST-ROUND KO 'BY VIBES' FOR 112TH STRAIGHT FIGHT; RECORD: 3-109", ""),
  ("{a} FACE-OFF LASTS 7 MINUTES; SECURITY CALLS IT A 'STALEMATE' AND ORDERS PIZZA", ""),
  ("'THE BELT IS JUST A PROP' SAYS FIGHTER WHO HAS NEVER HELD A BELT", ""),
  ("{a} WORE SUNGLASSES TO THE PRESSER; FANS SPLIT ON WHETHER IT'S 'SWAG' OR 'THE BLACK EYE'", ""),
  ("NEW STUDY CONFIRMS THE 'PEOPLE'S MAIN EVENT' IS ALWAYS THE ONE RIGHT BEFORE THE MAIN EVENT", ""),
  ("FIGHTER REVEALS HE PREPARES BY WATCHING {pop_movie} 'FOR THE TRAINING MONTAGES'", ""),
  ("ONLINE POLL: WHO WOULD WIN, {a} OR A VERY ANGRY GOOSE? GOOSE LEADS 54-46", ""),
  ("CAGE CLEANING CREW RATES THE NIGHT 'A 7 ON THE MOP SCALE'", ""),
  ("FANS ROAST {a} FOR WEARING SOCKS WITH SANDALS TO A PRESS CONFERENCE; {a} 'DOESN'T CARE, FEET ARE WARM'", ""),
  ("FIGHTER BLAMES LOSS ON 'BAD ENERGY' FROM A HOTEL CARPET", ""),
  ("{a} DECLARES HIMSELF 'THE FACE OF THE DIVISION'; DIVISION HAS NOT BEEN CONSULTED", ""),
  ("NEW TREND: FIGHTERS CELEBRATING WITH THE GRIDDY; THE GRIDDY ASKS TO BE LEFT OUT OF IT", ""),
  ("ANALYST'S 'KEYS TO VICTORY' FOR {a}: 'HIT HIM, DON'T GET HIT'", ""),
  ("{a} SAYS {b} HAS 'GLASS CHIN'; {b} SAYS {a} HAS 'GLASS EVERYTHING'", ""),
  ("UFC-STYLE SLOW MOTION REPLAY OF A JAB LASTS FOUR MINUTES; JAB DID NOTHING", ""),
  ("FIGHTER PROMISES TO 'SHOCK THE WORLD'; WORLD SCHEDULES IT FOR SATURDAY", ""),
  ("{a} BLAMES WEIGHT CUT ON 'A BIG BREAKFAST'; BREAKFAST WAS 14 PANCAKES", ""),
  ("'IT'S ALWAYS THE QUIET ONES', SAYS FAN ABOUT {a}, WHO HAS NEVER ONCE BEEN QUIET", ""),
  ("{a}'S COACH SAYS 'WE'RE GOING TO SURPRISE SOME PEOPLE'; PEOPLE, SO FAR, UNSURPRISED", ""),
  ("RINGSIDE BEER VENDOR MORE ACCURATE THAN EVERY JUDGE, CLAIMS RINGSIDE BEER VENDOR", ""),
  ("BREAKING: FIGHTER'S MOM HAS BEEN SCORING HIS FIGHTS 10-8 SINCE THE AMATEURS", ""),
  ("{a} DOES A BACKFLIP AFTER A DECISION LOSS; JUDGES 'RECONSIDER NOTHING'", ""),
  ("FANS NOTICE {a} AND {b} WEAR THE SAME SHOES; FEUD RECLASSIFIED AS 'COLLAB'", ""),
  ("THE {pop_meme} MEME RETURNS, NOW WITH {a}'S FACE PHOTOSHOPPED ON IT", ""),
  ("{a} SAYS HE'D 'RATHER DIE' THAN TAP; DOCTORS AND MOTHER REQUEST HE TAP", ""),
  ("FIGHT FAN DOWNLOADS 47 FREE STREAMS, ALL OF {pop_show}; 'CLOSE ENOUGH'", ""),
  ("NOBODY KNOWS WHO {b} IS, ADMITS {b}", ""),
  ("{a} HOLDS 'POST-FIGHT ANALYSIS' AT A WAFFLE HOUSE; 3 HOURS, 1 WAFFLE, 0 ANALYSIS", ""),
  ("THE 'DAD STRENGTH VS. GYM STRENGTH' DEBATE GETS ITS OWN DOCUMENTARY", ""),
  ("FIGHTER VOWS TO 'TAKE IT ONE FIGHT AT A TIME', CONFIRMING HE CANNOT FIGHT TWO AT ONCE", ""),
  ("{a} GETS NEW NICKNAME FROM FANS; IT IS NOT FLATTERING; IT IS STICKING", ""),
  ("'IF YOU DON'T LIKE THIS FIGHT YOU DON'T LIKE FIGHTS', SAYS MAN ABOUT EVERY FIGHT", ""),
  ("{promotion} FAN CAM CATCHES GROWN MAN CRYING DURING ANTHEM, WALKOUT, FIGHT, AND HOT DOG LINE", ""),
  ("{a} HIRES A HYPNOTIST FOR CONFIDENCE; NOW BELIEVES HE IS A DIFFERENT, BETTER FIGHTER", ""),
  ("{a} BLOCKS {b} ON {pop_app}; {b} BLOCKS {a} IN REAL LIFE, STANDS IN FRONT OF HIS CAR", ""),
  ("STATS SITE CONFIRMS {a} LANDS 41% OF STRIKES AND 100% OF TWEETS", ""),
  ("FANS DEBATE WHETHER {a}'S TAUNT WAS 'DISRESPECTFUL' OR 'A LEG CRAMP'", ""),
  ("FIGHTERS REPORT RINGSIDE SEATS NOW 'MOSTLY INFLUENCERS AND ONE CONFUSED GRANDMA'", ""),
  ("MATCHMAKER ADMITS HE BOOKED {a} VS {b} 'BECAUSE THE NAMES SOUND COOL TOGETHER'", ""),
  ("{a} CLAIMS 'STYLES MAKE FIGHTS'; HIS STYLE IS 'WALKING FORWARD'", ""),
  ("THE {pop_celeb}-SITTING-CAGESIDE CAMERA SHOT NOW HAS ITS OWN SPONSOR", ""),
  ("VETERAN SAYS 'BACK IN MY DAY WE FOUGHT FOR CHICKEN WINGS'; WINGS NOW $19", ""),
  ("FIGHT WEEK CONTENT INCLUDES 20-MINUTE VIDEO OF {a} SITTING IN A SAUNA SAYING 'YEAH'", ""),
  ("FANS ASK FOR 'MORE VIOLENCE', THEN CLUTCH PEARLS AT THE VIOLENCE", ""),
  ("{a} INSISTS HE 'WON EVERY ROUND IN MY HEAD'; HEAD UNAVAILABLE FOR COMMENT", ""),
  ("WEIGH-IN SCALE ACCUSED OF BEING 'A HATER'", ""),
  ("BREAKING: A HEAVYWEIGHT FIGHT GOES THE DISTANCE; CARDIOLOGISTS PUT ON ALERT", ""),
  ("{a}'S CORNER CALLS FOR 'MORE JAB'; {a} RESPONDS WITH 'MORE CHAOS'; IT WORKS", ""),
  ("'I RESPECT HIM AS A MARTIAL ARTIST' SAYS FIGHTER, TRANSLATION: 'I HATE HIM AS A PERSON'", ""),
  ("BRAILLE SONNEN BREAKS DOWN A FIGHT HE DIDN'T SEE; ANALYSIS RATED 'WEIRDLY CORRECT'", ""),
  ("{promotion} FANS VOTE THE BLOOD-SOAKED REFEREE SHIRT THEIR 'FIGHT OF THE NIGHT'", ""),
  ("{a} WALKS OUT IN A CAPE; TRIPS ON CAPE; CAPE FINALLY RETIRED", ""),
  ("{a} CHALLENGES {b} TO A 'CHESS MATCH, THEN A FIGHT'; {b}: 'WHAT'S CHESS'", ""),
  ("REPORT: 70% OF FIGHT FANS HAVE NEVER BEEN PUNCHED; 30% WON'T SHUT UP ABOUT IT", ""),
  ("{a} SAYS HE WAS 'BUILT DIFFERENT'; MEDICAL TEAM CONFIRMS 'SLIGHTLY, YES'", ""),
  ("THE BUM-WATCH ACCOUNT HAS ITS LONGEST THREAD EVER AND THE MAIN EVENT ISN'T EVEN IN IT", ""),
  ("FIGHTER DEMANDS RESPECT; RECEIVES MEME", ""),
  ("{a} TAKES 30-SECOND SHOWER, CALLS IT 'ICE BATH PROTOCOL'", ""),
  ("SUPERFIGHT DREAM BOOKING: {a} VS {pop_athlete}; BOOKMAKERS LIST IT AS 'WHY'", ""),
  ("'LEG DAY DOESN'T EXIST IN THE CAGE', SAYS MAN WHO HAS NEVER SURVIVED A LEG KICK", ""),
  ("{a} REVEALS PRE-FIGHT RITUAL: 3 PRAYERS, 2 ENERGY DRINKS, 1 {pop_show} EPISODE", ""),
  ("FANS ON THE FENCE ABOUT {a}'S HAIRCUT; FENCE ALSO ON THE FENCE", ""),
  ("{b} VOWS TO 'EXPOSE' {a}; MOSTLY EXPOSES HIS OWN SEARCH HISTORY", ""),
  ("RINGSIDE COMMISSIONER FALLS ASLEEP DURING DECISION; SCORES 'ZZZ-27'", ""),
  ("{a} INTRODUCED BY ANNOUNCER WITH ALL FOUR MIDDLE NAMES; FIGHT DELAYED 3 MINUTES", ""),
  ("EXPERT: 'THE GROUND GAME IS ON THE GROUND'", ""),
  ("{a} GETS RECOGNIZED AT THE GROCERY STORE; FAN ASKS WHERE THE CEREAL IS", ""),
  ("'I'LL FIGHT ANYONE' SAYS FIGHTER; {promotion} MATCHMAKERS, IN UNISON: 'OK'", ""),
  ("BREAKING: GUY WHO SAID {a} WAS 'FINISHED' NOW SAYS HE WAS 'ALWAYS A FAN'", ""),
  ("FIGHTERS PLAY {pop_game} ONLINE; {a} TEABAGS {b}; BAD BLOOD NOW 'REAL'", ""),
  ("{a} BLAMES THE LOSS ON MERCURY BEING IN RETROGRADE AND HIS CHIN BEING IN THE WAY", ""),
  ("CROWD BOOS DURING A GRAPPLING EXCHANGE; GRAPPLING EXCHANGE BOOS BACK", ""),
  ("FAN WHO PREDICTED 'R1 KO' TAKES VICTORY LAP AFTER 'R3 DECISION'", ""),
  ("{promotion} INTRODUCES 'SNACK OF THE NIGHT' BONUS; NACHO GUY WINS AGAIN", ""),
  ("{a} SAYS HE'S 'BORN FOR THIS'; BIRTH CERTIFICATE SAYS 'ACCOUNTANT'S SON'", ""),
  ("'HE'S A DIFFERENT ANIMAL' SAYS COACH ABOUT FIGHTER WHO IS, IN FACT, A HUMAN", ""),
  ("TOP 10 'HE TOOK THAT LIKE A CHAMP' MOMENTS, NUMBER 1 WILL MAKE YOUR NECK HURT", ""),
  ("{a} AND {b} BOTH CLAIM THE SAME HOMETOWN; TOWN REFUSES TO PICK", ""),
  ("FANS DECLARE {a}'S MOUSTACHE 'PROBLEMATIC'; MOUSTACHE UNBOTHERED", ""),
  ("THE PEOPLE HAVE SPOKEN: THEY WANT {a} VS {b}; THE PEOPLE WILL NOT BE BUYING THE PAY-PER-VIEW", ""),
  ("FIGHT WEEK GIVEAWAY: 'WIN A DATE WITH A CUTMAN'; RESPONSE 'OVERWHELMING'", ""),
  ("'RESPECT THE GRIND' POSTED 4,000 TIMES THIS WEEK; GRIND UNMOVED", ""),
  ("{a} SAYS 'IT'S NOT PERSONAL'; CALLS {b}'S MOM DURING PRESSER", ""),
  ("NEW BETTING MARKET: WILL {president} SAY 'FIGHT OF THE YEAR' BEFORE THE FIGHT STARTS? (-900)", ""),
])

# memes that need a GENERATED fighter (weigh-in towels, sketchy stuff, 'never the same')
add('meme_g', [
  ("WEIGH-IN TOWEL CONSPIRACY: FANS SWEAR {g} 'TOUCHED THE TOWEL'; TOWEL RETAINS LAWYER", "Slow-motion footage has been analyzed by 300,000 amateur physicists. The towel maintains it did nothing wrong."),
  ("{g} MAKES WEIGHT ON SECOND TRY AFTER 'REMOVING HIS SOUL' AND ONE SOCK", ""),
  ("{g} SAYS SECRET TO HIS CHIN IS 'NEVER GOING TO THE DOCTOR'", ""),
  ("{g} HAS NOT BEEN THE SAME SINCE THE HEAD KICK; NOW REFERS TO HIMSELF IN THE THIRD PERSON AND THE FOURTH", ""),
  ("{g}'S 'ALL-NATURAL' PHYSIQUE QUESTIONED BY FANS; {g} RESPONDS 'IT'S THE BEEF LIVER'", ""),
  ("{g} BLAMES LOSS ON 'BAD SEAFOOD'; SEAFOOD RESTAURANT RELEASES CCTV OF HIM ORDERING 'ALL OF IT'", ""),
  ("{g} INSISTS THE SCALE WAS 'NOT CALIBRATED'; SCALE PASSES THREE CALIBRATIONS AND A POLYGRAPH", ""),
  ("{g} WALKS INTO WRONG CAGE AT {promotion} EVENT; IT WAS A DOG KENNEL; WINS ANYWAY", ""),
  ("{g} CLAIMS HE TRAINED WITH 'A NAVY SEAL'; SEAL WAS AN ACTUAL SEAL, AT AN AQUARIUM", ""),
  ("{g} PROMISES TO 'BRING THE SMOKE'; SETS OFF HOTEL FIRE ALARM WITH A VAPE", ""),
  ("{g}'S MANAGER SAYS HIS CLIENT IS 'UNDERPAID, UNDERRATED, AND UNDER INVESTIGATION (UNRELATED)'", ""),
  ("{g} DOES SAUNA CUT IN A HOT CAR; PARKING TICKET MAKES WEIGHT FIRST", ""),
  ("{g} ACCUSED OF 'GREASING'; HE SAYS IT WAS 'A SKINCARE ROUTINE'", ""),
  ("{g} SELLS HIS FIGHT SHORTS ON AN AUCTION SITE; BLOOD STAINS ADDED 'FOR AUTHENTICITY'", ""),
  ("{g} INSISTS HE IS 'TOTALLY FINE' AFTER KO; ASKS REPORTER WHAT YEAR IT IS, TWICE", ""),
])

add('result', [
  ("{winner} DOES IT: {method} WIN OVER {loser} AT {event}", "{winner} got the job done in round {round}. {loser} was last seen asking a cutman for directions to his own face."),
  ("{loser} PUT TO SLEEP BY {winner}; WAKES UP TO 1,400 MEMES", ""),
  ("{winner} BEATS {loser}; INTERNET IMMEDIATELY DEMANDS HE FIGHT SOMEONE MUCH BETTER", ""),
  ("{winner} CALLS OUT 'THE WHOLE DIVISION' AFTER BEATING {loser}; DIVISION SCHEDULES A MEETING", ""),
  ("'I TOLD YOU SO,' SAYS {winner} AFTER {method} OF {loser}; NOBODY REMEMBERS HIM TELLING ANYBODY", ""),
  ("{loser} SAYS HE 'WAS WINNING UNTIL HE WASN'T'; EXPERTS AGREE", ""),
  ("{winner} DEF. {loser}: THE REMATCH NOBODY ASKED FOR IS ALREADY TRENDING", ""),
  ("{event} RECAP: {winner} WINS, {loser} LEARNS, FANS LIE ABOUT HAVING CALLED IT", ""),
  ("{loser}'S CORNER STILL YELLING 'HANDS UP' THREE DAYS AFTER {event}", ""),
  ("{winner} CELEBRATES {method} WIN BY DOING THE WORM ACROSS THE CAGE; {loser} ALSO HORIZONTAL", ""),
  ("BUM? NOT TODAY: {winner} SILENCES HATERS WITH {method} OF {loser}", ""),
  ("{winner} ON {loser}: 'GREAT GUY, GREAT FAMILY, GREAT NAP'", ""),
  ("{loser} BLAMES THE LOSS ON THE LIGHTING, THE CAGE, THE MOON, AND {winner}", ""),
  ("{winner} THANKS GOD, HIS COACH, AND 'THE GUY WHO SOLD ME THAT PRE-WORKOUT' AFTER {event}", ""),
  ("{event}: {winner} BY {method}; {loser} BY 'EMOTIONAL DAMAGE'", ""),
  ("THE {method} HEARD ROUND THE WORLD: {winner} STOPS {loser}", ""),
  ("{loser} ASKS FOR IMMEDIATE REMATCH WITH {winner}; DOCTORS ASK FOR IMMEDIATE NAP", ""),
  ("{winner} PROVES DOUBTERS WRONG, ESPECIALLY THE DOUBTER WHO WAS {loser}", ""),
  ("{winner}'S MOM: 'I KNEW HE'D WIN.' {winner}'S MOM, LAST WEEK: 'PLEASE QUIT'", ""),
  ("{winner} STOPS {loser} IN ROUND {round}; CROWD DEMANDS ROUND {round} BE DECLARED A NATIONAL HOLIDAY", ""),
], 0.3)

add('upset', [
  ("UPSET! {winner} SHOCKS {loser}; BOOKIES WEEP INTO LEATHER CHAIRS", "Nobody had {winner}. Not the odds, not the analysts, not {winner}'s own Wikipedia page, which still said 'journeyman'."),
  ("NOBODY GAVE {winner} A CHANCE. {winner} TOOK ONE ANYWAY.", ""),
  ("{loser} WAS 'TOO GOOD TO LOSE'. HE LOST. TO {winner}.", ""),
  ("BETTING APP CRASHES AFTER {winner} UPSETS {loser}; ONE GUY IN OHIO NOW OWNS A BOAT", ""),
  ("{winner} RUINS EVERYONE'S PARLAY, SAYS SORRY, DOESN'T MEAN IT", ""),
  ("HUGE UPSET AT {event}: {winner} OVER {loser}; ANALYSTS 'NEVER DOUBTED' (DOUBTED)", ""),
  ("THE UNDERDOG BITES: {winner} STUNS {loser} BY {method}", ""),
  ("{loser} TRAINED FOR {winner}'S 'LIMITED SKILLSET'; SKILLSET WAS NOT LIMITED", ""),
  ("'I LOVE BEING THE UNDERDOG', SAYS {winner}, WHO WILL NOW NEVER BE ONE AGAIN", ""),
  ("FANS RUSH TO DELETE TWEETS ABOUT {winner} AFTER STUNNING WIN OVER {loser}", ""),
], 0.3)

add('title', [
  ("NEW CHAMP! {winner} TAKES THE {belt} FROM {loser}", "{winner} slept with the belt. Then showered with the belt. The belt has asked for some personal space."),
  ("AND NEWWWW: {winner} DETHRONES {loser}; PARTY ENDS AT 6 AM; BELT STILL MISSING", ""),
  ("{winner} IS THE {belt} HOLDER; {loser} IS NOW 'A FORMER CHAMP AND CURRENT SNACK'", ""),
  ("THE KING IS DEAD: {winner} TAKES {loser}'S GOLD", ""),
  ("{winner} WINS GOLD; IMMEDIATELY CALLS OUT A GUY TWO WEIGHT CLASSES UP", ""),
  ("{winner} CROWNED; FIRST ACT AS CHAMP IS DEMANDING A PAY RAISE ON LIVE TV", ""),
], 0.5)

add('defense', [
  ("{winner} DEFENDS THE {belt} AGAINST {loser}; 'THE BELT STAYS HOME'", ""),
  ("STILL CHAMP: {winner} TURNS AWAY {loser}; CHALLENGER QUEUE NOW 'MOSTLY CRYING'", ""),
  ("{winner} RETAINS; {loser} 'LEARNED A LOT', MOSTLY ABOUT THE CEILING LIGHTS", ""),
  ("'AND STILLLLL': {winner} KEEPS THE {belt}; ANNOUNCER HOLDS THE L FOR 11 SECONDS", ""),
  ("{winner} DEFENDS AGAIN; DIVISION RUNNING OUT OF PEOPLE TO FEED HIM", ""),
], 0.4)

add('rank_up', [
  ("{fighter} ROCKETS TO #{rank} AT {div}; MOM UPDATES HER FACEBOOK BIO", ""),
  ("{fighter} CLIMBS FROM #{old} TO #{rank}; 'I'M COMING FOR EVERYBODY', SAYS EVERYBODY", ""),
  ("RANKINGS SHAKE-UP: {fighter} NOW #{rank} IN THE {div} DIVISION", "The media panel voted {fighter} up the ladder after a statement win. One panelist voted for himself. He has been removed from the panel."),
  ("#{rank} AND RISING: {fighter} IS THE {div} DIVISION'S NEW PROBLEM", ""),
  ("{fighter} ENTERS THE TOP 10; CELEBRATES BY BUYING A 'TOP 10' CHAIN", ""),
  ("{fighter} SAYS #{rank} IS 'DISRESPECTFUL' AND HE SHOULD BE #1; SAID SAME THING AT #{old}", ""),
  ("{fighter}'S RANKING JUMP TO #{rank} BREAKS THE RANKINGS WEBSITE; WEBSITE WAS A SPREADSHEET", ""),
  ("FROM #{old} TO #{rank}: {fighter} IS THE {div} STORY OF THE WEEK", ""),
  ("{fighter} NOW #{rank}; GYM INSTALLS A SECOND 'WALL OF FAME' JUST FOR HIM", ""),
  ("RANKINGS UPDATE: {fighter} LEAPFROGS INTO #{rank}; THE FROG IS HUMILIATED", ""),
], 0.2)

add('rank_drop', [
  ("{fighter} SLIDES TO #{rank}; SAYS RANKINGS ARE 'A SOCIAL CONSTRUCT'", ""),
  ("{fighter} FALLS FROM #{old} TO #{rank}; BLAMES 'THE ALGORITHM'", ""),
  ("RANKINGS: {fighter} DROPS TO #{rank}; WILL 'GO BACK TO THE LAB', WHICH IS A GARAGE", ""),
  ("{fighter} OUT OF THE TOP 10 FOR THE FIRST TIME IN YEARS; FANS SAY 'HE'S NEVER BEEN THE SAME'", ""),
  ("{fighter}'S RANKING TAKES A HIT; SO DID {fighter}", ""),
], -0.1)

add('p4p', [
  ("POUND-FOR-POUND: {fighter} NAMED #1; EVERY OTHER FIGHTER 'RESPECTFULLY DISAGREES'", ""),
  ("WHO'S YOUR GOAT? {promotion} P4P LIST SAYS {fighter}; THE COMMENTS SAY {a}", ""),
  ("THE P4P LIST IS OUT AND {a} IS 'ROBBED' AGAIN, ACCORDING TO {a}", ""),
  ("{fighter} TOPS P4P; CELEBRATES BY ARGUING WITH STRANGERS ABOUT IT ONLINE", ""),
  ("'P4P IS MADE UP', SAYS FIGHTER NOT ON THE P4P LIST", ""),
], 0.2)

# controversies: generated fighters only (the code checks)
add('arrest', [
  ("{fighter} ARRESTED: {charge}; LAWYER SAYS IT WAS 'A MISUNDERSTANDING WITH A VENDING MACHINE'", "{fighter} was booked in {city}. His mugshot is already a t-shirt. The t-shirt is already sold out."),
  ("{fighter} IN CUSTODY ON {charge}; MUGSHOT 'HONESTLY FIRE', SAY FANS", ""),
  ("{fighter} PICKED UP FOR {charge}; COACH: 'HE'S A GOOD KID, MOSTLY, ON WEEKDAYS'", ""),
  ("{charge}: {fighter}'S WEEK GOES SIDEWAYS IN {city}", ""),
  ("{fighter} ARRESTED, ASKS IF JAIL HAS A SAUNA FOR HIS WEIGHT CUT", ""),
  ("{fighter} BOOKED ON {charge}; {promotion} ISSUES STATEMENT CONTAINING WORD 'DISAPPOINTED' 6 TIMES", ""),
], -0.5)
add('dui', [
  ("{fighter} ARRESTED FOR DUI IN {city}; TELLS COPS HE WAS 'CUTTING WEIGHT WITH THE WINDOWS UP'", "Police say {fighter} attempted to field-sobriety-test the officer instead. The officer scored it 10-8."),
  ("{fighter} DUI: CRASHES INTO A CHURCH'S 'HONK IF YOU LOVE JESUS' SIGN WHILE HONKING", ""),
  ("{fighter} PULLED OVER, FAILS ALPHABET, PASSES 'NAME EVERY FLYWEIGHT CHAMP'", ""),
  ("{fighter} CHARGED WITH DUI; ASKS ARRESTING OFFICER FOR 'A ROUND OF SPARRING TO SETTLE IT'", ""),
], -0.5)
add('bar_fight', [
  ("{fighter} IN BAR SCUFFLE IN {city}; WITNESSES SAY BOUNCER 'TOOK HIS BACK'", "Charges, if any, will depend on whether karaoke counts as provocation. It was 'Total Eclipse of the Heart'. It might."),
  ("{fighter} GETS INTO IT WITH A MAN DRESSED AS {pop_celeb} AT A {city} BAR; ONLY THE COSTUME WAS HURT", ""),
  ("BAR BRAWL: {fighter} VS. A BACHELORETTE PARTY; BACHELORETTE PARTY WINS ON THE SCORECARDS", ""),
  ("{fighter} THROWN OUT OF {city} BAR FOR 'DEMONSTRATING A GUILLOTINE' ON A STRANGER WITHOUT CONSENT", ""),
  ("{fighter} EXPLAINS BAR FIGHT: 'HE SAID THE FLYWEIGHTS ARE BORING'", ""),
  ("{fighter} CHALLENGES ENTIRE {city} SPORTS BAR TO A FIGHT; SPORTS BAR CHOOSES TRIVIA NIGHT INSTEAD", ""),
], -0.3)
add('weight_miss', [
  ("{fighter} MISSES WEIGHT; BLAMES 'A SINGLE GRAPE'", "The grape has declined to comment. Commission officials say the grape weighed several pounds and was, in fact, a pizza."),
  ("{fighter} HEAVY AT THE SCALE; 'MY BONES ARE DENSE WITH CONFIDENCE'", ""),
  ("{fighter} MISSES WEIGHT, IMMEDIATELY EATS A CAKE SHAPED LIKE THE SCALE", ""),
  ("WEIGH-IN DRAMA: {fighter} OVER THE LIMIT; THE TOWEL WAS RIGHT THERE, BRO", ""),
  ("{fighter} MISSES WEIGHT AGAIN; DIVISION CONSIDERS NAMING A NEW WEIGHT CLASS AFTER HIM", ""),
], -0.3)
add('failed_test', [
  ("{fighter} FLAGGED BY DRUG TEST; BLAMES 'CONTAMINATED STEAK', 'CONTAMINATED TOOTHPASTE', 'CONTAMINATED VIBES'", "{fighter} faces {weeks} weeks on the shelf. His supplement guy has deleted his phone number and possibly his face."),
  ("{fighter} POPS FOR SOMETHING WITH 19 LETTERS; CAN'T PRONOUNCE IT; 'HOW COULD I TAKE IT, I CAN'T EVEN SAY IT'", ""),
  ("{fighter} SUSPENDED {weeks} WEEKS; SAYS HE'LL 'COME BACK CLEANER THAN EVER', CLARIFIES 'MOSTLY'", ""),
  ("FAILED TEST: {fighter} BLAMES HIS COUSIN'S 'ENERGY GUMMIES'", ""),
], -0.5)
add('tabloid', [
  ("{fighter} BANNED FROM {city} WAFFLE HOUSE FOR 'EXCESSIVE HASH BROWN TECHNIQUE'", ""),
  ("{fighter} GOES VIRAL FOR 40-MINUTE RANT ABOUT A PARKING TICKET; TICKET WAS $12", ""),
  ("{fighter} PICKS A FIGHT WITH A MASCOT AT A {city} MINOR LEAGUE GAME; MASCOT WINS ON THE CARDS", ""),
  ("{fighter} RESPONDS TO HATERS BY BUYING A BILLBOARD THAT SAYS 'NO'", ""),
  ("{fighter} CAUGHT ON CAMERA CRYING AT {pop_movie}; RESPECT IN THE LOCKER ROOM 'UP, ACTUALLY'", ""),
  ("{fighter}'S EX POSTS 3-HOUR {pop_app} LIVE ABOUT HIS 'BAD ENERGY AND WORSE CARDIO'", ""),
  ("{fighter} SPOTTED LEAVING {city} CASINO WITH A GIANT NOVELTY CHECK THAT SAYS 'I OWE YOU'", ""),
  ("{fighter} STARTS ONLINE FEUD WITH A MEAL-KIT COMPANY; MEAL-KIT COMPANY IS WINNING", ""),
  ("{fighter} REFUSES TO LEAVE A {city} GOLF COURSE AFTER BEING TOLD HE 'CAN'T HIT THE BALL WITH HIS SHIN'", ""),
  ("{fighter} ANNOUNCES HIS OWN 'RETIREMENT' ON {pop_app} AFTER A BAD SPARRING DAY; UNRETIRES BY LUNCH", ""),
  ("{fighter} BOOTED FROM FLIGHT FOR SHADOWBOXING IN THE AISLE; 'I HAD A CAMP TO FINISH'", ""),
  ("{fighter}'S PET TIGER 'DEFINITELY LEGAL', SAYS {fighter}, WHO IS ALSO DEFINITELY NOT A ZOO", ""),
], -0.2)

add('contender', [
  ("CONTENDER SERIES: {fighter} GETS THE CONTRACT; CALLS MOM; MOM ASKS IF IT'S 'THE ONE WITH THE CAGE'", ""),
  ("TUESDAY NIGHT MIRACLE: {fighter} WINS AND SIGNS; PRESIDENT SAYS 'HE'S GOT IT' WITHOUT SAYING WHAT 'IT' IS", ""),
  ("{fighter} FROM CONTENDER SERIES TO THE BIG SHOW; FORMER JOB AT TIRE SHOP 'KEEPING HIS SPOT WARM'", ""),
  ("{fighter} CRIES ON CAMERA AFTER GETTING SIGNED; INTERNET CRIES TOO; CUTMEN STAY STRONG", ""),
  ("CONTENDER SERIES SIGNEE {fighter} ALREADY CALLING OUT THE CHAMP; HAS ONE PRO WIN IN THE PROMOTION (ZERO)", ""),
], 0.3)

add('owner', [
  ("OWNER {owner} SPOTTED AT {promotion} EVENT, CHEERS FOR WRONG FIGHTER ALL NIGHT", ""),
  ("{company} 'PLEASED, MOSTLY' WITH {promotion}; SOURCES SAY 'MOSTLY' DOING A LOT OF WORK", ""),
  ("{owner} SAYS {president} IS 'LIKE A SON TO ME, IF MY SON COST THIS MUCH'", ""),
  ("{owner} BUYS A YACHT NAMED 'THE MAIN EVENT'; IT SINKS IN THE FIRST ROUND", ""),
  ("{company} BOARD MEETING ON {promotion} LASTS 9 MINUTES; 7 ARE ABOUT LUNCH", ""),
  ("REPORT: {owner} HAS NEVER WATCHED A FULL FIGHT; 'I WATCH THE MONEY PART'", ""),
], 0.0)

add('oneton', [
  ("@1TON ASKS ABOUT MEXICAN FIGHTERS AT 30TH STRAIGHT PRESS CONFERENCE; STREAK NOW 'OLYMPIC'", "Asked whether he would ever ask about anyone else, 1ton said 'only if they're from Mexico'. His beard nodded."),
  ("1TON DEMANDS {mex} HEADLINE A CARD; 'I'LL CARRY THE BELT TO THE CAGE MYSELF'", ""),
  ("1TON'S BEARD NOW HAS ITS OWN PRESS CREDENTIAL", ""),
  ("1TON REVIEWS {promotion} CARD: 'NOT ENOUGH MEXICO. 2/10. THE 2 IS FOR THE TACOS AT THE VENUE'", ""),
  ("1TON LAUNCHES PETITION FOR {promotion} MEXICO CITY SHOW; 200,000 SIGNATURES, ALL IN THE SAME HANDWRITING", ""),
  ("1TON SAYS {mex} IS 'THE GREATEST FIGHTER WHO EVER LIVED'; {mex} HAS SIX PRO FIGHTS", ""),
  ("PRESSER ATTENDEES REPORT 1TON'S HAND WAS UP 'BEFORE THE PRESS CONFERENCE STARTED'", ""),
  ("1TON TOLD THERE ARE NO MORE QUESTIONS; ASKS ABOUT MEXICAN FIGHTERS ANYWAY", ""),
], 0.1)

# more 1ton
ONETON['bleet_mex'] += [
    "{x} just threw a combination I can only describe as 'Sunday at my tío's house'. VIVA.",
    "Every time {x} lands, a mariachi band somewhere gets its wings.",
    "{y} is learning about Mexico in real time. Lesson one: we don't stop coming.",
    "Main event {x}. Next card. I'm not asking. (I'm asking. Loudly. At the presser.)",
    "{x} has the chin of a man raised on menudo and bad decisions. Respect.",
    "I would die for {x}. I would also ask about {x} at the presser, which is worse for {presidentLast}.",
]
ONETON['bleet_non'] += [
    "Two non-Mexican guys hugging for three rounds. Riveting. Truly the sport of kings.",
    "{x} just threw a jab that couldn't break a piñata. A small piñata. A sad one.",
    "This is the part of the card where I go get tacos. Text me if a Mexican fighter shows up.",
    "Unpopular opinion: this fight would be better if both guys were from Sinaloa.",
    "{y} has the cardio of a guy who thinks salsa is spicy.",
    "Respectfully, who are these men and why aren't they Mexican.",
    "Judges, score this one 10-9 for the guy who looks most likely to have an abuela in Guadalajara.",
    "I asked {x}'s corner if he has Mexican heritage. Security asked me to leave the corner.",
]
ONETON['ask_none'] += [
    "1ton. {presidentLast}, I'll make this simple. One Mexican fighter. One. I'll even find him for you. He's in my car right now.",
    "1ton, the Lucha Lowdown. My question is a silence. (He stands there. He stares. Nobody moves.)",
]
ONETON['answer_joke'] += ["1ton, I'm starting to think you might be Mexican.", "Let's go to someone without a beard this time."]
ONETON['feed'] += [
    "Counted the {promotion} roster again. Still not enough Mexico. Morale low. Beard high.",
    "New episode of the Lucha Lowdown: 3 hours, 1 topic. You know the topic.",
]

# ---------------------------------------------------------------- 1ton: more of everything (v1.4.1)
ONETON['ask_card'] += [
    "1ton, Lucha Lowdown. {f}, when you beat {opp}, and you will, are you dedicating it to Mexico, to your mother, or to me? I'll accept any of the three. Ideally me.",
    "1ton here. {presidentLast}, I counted. {f} has the best walkout on this card. The best hair. The best abuela in the building. Why is he not fighting last?",
    "{f}, 1ton. I'm not going to ask about {opp}. Nobody in Mexico is going to ask about {opp}. Tell me about your corner. Is it all cousins? It should be all cousins.",
    "1ton, the beard in the third row. {f}, I brought a flag the size of a parking space. Will you wear it out of the cage or should I just throw it in?",
    "1ton. Quick one. {presidentLast}, if {f} wins tonight, title shot? Yes or yes?",
    "1ton, Lucha Lowdown, live. {f}, my viewers want to know: how many tacos did you eat on fight week, and was it enough? It was not enough. Eat more.",
    "{f}! It's 1ton! The pozole I made you is in the green room! Don't let {opp} eat it! That's the whole question!",
    "1ton. {presidentLast}, explain to Mexico why {f} is on a {promotion} card and not on every {promotion} card.",
    "1ton here. {f}, is it true {opp} said Mexican cardio is 'overrated'? He didn't? Well, someone said it. Respond.",
    "1ton. {f}, the whole of Guadalajara is staying up to watch this. Some of them are four years old. Do it for the kids.",
]
ONETON['ask_roster'] += [
    "1ton, Lucha Lowdown. Is {f} injured? Because if {f} isn't injured, I don't understand why I'm watching this card without {f} on it.",
    "1ton. {presidentLast}, I have a petition here with 40,000 signatures asking for {f} on the next card. 39,000 of them are me. Still counts.",
    "1ton here. Respectfully, {f} should be fighting tonight, tomorrow, and on Christmas. When?",
    "1ton. Simple question. {f}. Main event. Mexico City. Day of the Dead. Yes?",
    "1ton, the beard. Has anybody at {promotion} called {f} this month? I have. Twice. He's lovely. Book him.",
    "1ton. {f} posted a training video at 4am. That's dedication. When does dedication get a fight date, {presidentLast}?",
    "1ton here. If {f} isn't on the next card, I'm doing a hunger strike. It starts after dinner.",
    "1ton, Lucha Lowdown. {f} versus anybody. I'll even let you pick the anybody. Date?",
]
ONETON['ask_other'] += [
    "1ton. {f}, {where}. Sixteen wins, fourteen by knockout, two by 'his opponent saw him and left'. Sign him.",
    "1ton here. I'm putting {f} in front of you right now, {presidentLast}. {where}. If you don't sign him, a rival will, and I'll ask THEM about him instead. You'll hate that.",
    "1ton, Lucha Lowdown. Have your scouts looked at {f}? {where}. Your scouts should be fired. Except the one who's Mexican. Keep him.",
    "1ton. {f} is {where}. I have his number. I have his mom's number. I have his barber's number. Pick one.",
    "1ton here. A man named {f}, {where}, just knocked out a guy so hard the guy's family felt it. Contract. Tonight.",
    "1ton. You keep saying the roster is full. Of what? Not {f}. {where}.",
]
ONETON['ask_none'] += [
    "1ton. Your card has zero Mexican fighters. Zero. That's not a number, {presidentLast}. That's a cry for help.",
    "1ton, Lucha Lowdown. I looked at the card. I looked at it again. I asked my wife to look at it. No Mexicans. Explain.",
    "1ton here. If I find a Mexican fighter in this building tonight, can I put him on the card? I'll check the parking lot.",
    "1ton. I'm not asking a question. I'm holding up a picture of the Mexican flag until somebody answers one.",
    "1ton, the beard, the legend. {presidentLast}, do you even like tacos? Because this card says no.",
    "1ton. This is a card with no Mexicans on it. In my country we call that a 'prelim'.",
]
ONETON['ask_broken'] = [
    "1ton. {presidentLast}. You promised me a Mexican main event {n} times. I wrote them all down. I have them laminated. Where is it?",
    "1ton here. Last time you said 'soon'. The time before that, 'soon'. {n} promises. Soon is not a date.",
    "1ton, Lucha Lowdown. {n} promises, zero Mexican main events. My viewers have started calling you 'El Mentiroso'. I told them to stop. I didn't mean it.",
    "1ton. I brought a calendar. Point to the day you keep your promise. Any day. I'll wait. I've been waiting {n} pressers.",
]
ONETON['answer_promise'] += [
    "Next big card, 1ton. Mexican fighter, main event. Write it down.",
    "Mexico City. Bullring. Main event. I mean it this time.",
    "1ton, you'll get your main event. Bring the flag.",
    "We're working on a Mexican Independence Day card. Don't tell anyone. Except everyone.",
    "Next card. Top of it. Mexican fighter. Done. Can I go now?",
    "If I don't deliver, you can have my parking spot.",
]
ONETON['answer_deflect'] += [
    "Great question, 1ton. Let's move on to a different, worse question.",
    "We'll discuss the roster another time. Somebody who isn't 1ton?",
    "I'm not here to talk about the roster, I'm here to talk about tonight.",
    "1ton, we've talked about this. Many times. Next.",
    "Matchmaking's handling it. I don't talk matchmaking at pressers. Except when I do.",
    "Let's keep it to tonight's card, guys. Tonight's card. Please.",
]
ONETON['answer_joke'] += [
    "1ton, if I put a Mexican fighter in every main event, will you ask about anything else? (1ton: 'No.')",
    "I'll sign the next Mexican fighter who can grow a beard like yours. So, no one.",
    "1ton, I've started seeing you in my dreams. You're always asking about Mexican fighters.",
    "Is the beard Mexican? Can the beard fight? Sign the beard.",
    "I thought you were going to ask about the weather. Silly me.",
]
ONETON['answer_honest'] = [
    "Honestly, 1ton? We don't have enough Mexican fighters. That's on us. We're scouting.",
    "The truth: the Mexican guys I want are under contract elsewhere. I'm trying.",
    "Real answer: I don't have one ready for a main event yet. Give me six months.",
    "I'll be straight with you. We dropped the ball. We'll fix it.",
    "Honestly, the money in Mexico City hasn't worked yet. It will.",
]
ONETON['answer_roast'] = [
    "1ton, with all due respect, ask a different question or go back to your car.",
    "You know there are other countries, right? You've heard? There's a whole map.",
    "1ton, I've answered this forty times. The forty-first answer is: sit down.",
    "Security, can we get 1ton a sandwich? He gets like this when he's hungry.",
    "Does anyone else have a question that isn't the same question? Anyone? Not the beard.",
]
ONETON['react_promise'] += [
    "1ton stands, salutes, and sits back down. The salute was in the colours of the Mexican flag. You don't know how.",
    "\"I'm putting it on the show tonight,\" says 1ton. \"Three hours. Just your promise. On a loop.\"",
    "1ton takes a photo of you mid-sentence. It will be his profile picture until you deliver.",
    "1ton writes it in his notebook, then on his hand, then on the reporter next to him's hand.",
    "\"Viva {presidentLast},\" says 1ton, for the first and maybe last time.",
]
ONETON['react_deflect'] += [
    "1ton stares at you for eleven full seconds. Nobody breathes. Then he raises his hand again.",
    "\"Mexico heard that,\" says 1ton quietly. \"Mexico will remember.\"",
    "1ton puts his hand down, slowly, the way a man sheathes a sword.",
    "1ton bleets, live, from the front row: \"{presidentLast} JUST DEFLECTED. AGAIN. CLIP IT.\"",
    "1ton opens a bag of chips with real menace.",
]
ONETON['react_joke'] += [
    "1ton does not laugh. His beard laughs, a little. He'll deny it.",
    "\"Funny,\" says 1ton. \"You know what else is funny? Zero Mexican main events.\"",
    "1ton laughs once, sharply, like a bark. Then the hand goes back up.",
    "Half the room laughs. 1ton writes down the names of the people who laughed.",
    "\"Save the jokes for the prelims,\" says 1ton. \"Like your Mexican fighters.\"",
]
ONETON['react_honest'] = [
    "1ton blinks. Nobody has ever answered him honestly. He doesn't know what to do with his hand.",
    "\"Thank you,\" says 1ton, genuinely moved. \"Now book one.\"",
    "1ton nods slowly. \"Honesty. Respect. I'll only ask about it twice more tonight.\"",
    "1ton bleets: \"{presidentLast} told the TRUTH at a presser. Mark the date. Mexico salutes you (a little).\"",
]
ONETON['react_roast'] = [
    "1ton smiles. It's worse than anger. You'll be on the Lucha Lowdown for a month.",
    "\"Noted,\" says 1ton, and bleets a photo of your bald spot from the front row.",
    "The room goes \"ooooh\". 1ton just raises his hand again. He has done this for years. He has more years than you.",
    "1ton stands up, walks out, and comes back in through a different door with his hand already up.",
]

def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'owner.json'), 'w') as f:
        json.dump(OWNER, f, indent=1, ensure_ascii=False)
    with open(os.path.join(OUT, 'oneton.json'), 'w') as f:
        json.dump(ONETON, f, indent=1, ensure_ascii=False)
    ids = [x['id'] for x in FP]
    assert len(ids) == len(set(ids))
    with open(os.path.join(OUT, 'frontpage.json'), 'w') as f:
        json.dump(FP, f, indent=1, ensure_ascii=False)
    kinds = {}
    for x in FP:
        kinds[x['kind']] = kinds.get(x['kind'], 0) + 1
    print('front page templates:', len(FP), kinds)

if __name__ == '__main__':
    main()
