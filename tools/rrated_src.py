"""R-rated additions for the template banks and headlines.

Run: python3 tools/rrated_src.py   (idempotent: only adds lines that aren't there yet)

Merges into data/documents/templates.json and data/headlines/headlines_extra.json.
Same guardrails as everything else: fighter-bound lines roast fights, egos, bodies
and bank accounts; crimes, doping and abuse stay in the storylet categories that
never cast parody fighters. No slurs.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..')

TICKER = {
    'rocked': [
        "{b} is ROCKED! His legs just filed for divorce from the rest of his body!",
        "{b} is out on his feet! He's doing the drunk-uncle-at-a-wedding shuffle!",
        "{b} is fucked up! Badly! He's looking for his corner and finding the fucking concession stand!",
    ],
    'knockdown': [
        "{b} goes DOWN! Ass on the canvas! Pride somewhere in the third row!",
        "Flash knockdown! {b} hits the mat like a sack of wet laundry!",
    ],
    'ko_punch': [
        "LIGHTS OUT! {a} knocks {b} the FUCK out! He's snoring! Somebody get him a pillow and a lawyer!",
        "GOOD FUCKING NIGHT! {b} is unconscious and his mouthpiece is in row four!",
        "{a} TURNS {b}'S LIGHTS OFF! {b} is face down, ass up, and nobody's home!",
    ],
    'ko_kick': [
        "HEAD KICK! {b}'s soul just left his body and is waiting outside for an Uber!",
        "{a} kicks {b}'s head into next week! Absolutely fucking disgusting! Beautiful!",
    ],
    'tko_gnp': [
        "{a} is beating the ever-loving shit out of {b} on the ground! {ref} finally jumps in!",
        "It's a mugging! {a} is pounding {b} like a cheap steak! STOPPAGE!",
    ],
    'late_ref': [
        "{ref} is letting this go WAY too long! {b} is unconscious and {ref} is checking his fucking watch!",
        "Jesus Christ, STOP THE FIGHT! {ref} is just standing there like he's waiting for a bus!",
    ],
    'tap': [
        "{b} TAPS like his life depends on it! Because it fucking does!",
        "{b} taps! Taps so fast he might've invented Morse code! {a} wins by {hold}!",
    ],
    'wont_tap': [
        "{b} refuses to tap! Something is going to snap and it's not his fucking pride!",
    ],
    'limb_snap': [
        "OH GOD. You could hear that in the cheap seats. {b}'s arm now bends both fucking ways.",
        "That arm is BROKEN. Snapped like a breadstick. Somebody in row two just threw up.",
    ],
    'foul_groin': [
        "LOW BLOW! {a} punts {b} square in the nuts! His future children felt that!",
        "Right in the fucking cup! {b} is on his knees asking God why! {ref} calls time!",
        "{a} kicks {b} so hard in the balls that the cup is now a bowl. Time out!",
    ],
    'foul_eyepoke': [
        "EYE POKE! {a} damn near pulled {b}'s eyeball out like a fucking grape!",
    ],
    'cut': [
        "{b} is cut and pissing blood everywhere! The canvas looks like a murder scene!",
        "Nasty cut on {b}! He's leaking like a fucking juice box!",
    ],
    'crowd': [
        "The crowd is chanting 'FUCK HIM UP!' Not clear at whom. Possibly the referee.",
        "Two drunk guys in section 112 are having a better fight than this one.",
        "A fan in the front row is fully shirtless and screaming 'KILL HIM' at his own reflection on the jumbotron.",
        "The crowd boos. Someone throws a full beer. It hits the commission. Big cheer.",
        "'THIS IS BULLSHIT' chant breaks out. The arena DJ tries to drown it out with Sandstorm.",
    ],
    'coach_losing': [
        "What the fuck are you doing out there? You're fighting like he's your landlord! Hit him!",
        "Stop fucking around and throw something! I didn't drive nine hours for this shit!",
        "He's a fucking bum! You're losing to a bum! Your mother is watching! Your EX is watching!",
    ],
    'coach_winning': [
        "That's it! That's fucking it! Keep beating his ass! Don't you dare get creative!",
        "He's broken! Look at him! He wants to go home! Don't let the motherfucker go home!",
    ],
    'coach_hurt': [
        "Breathe! BREATHE! Can you see? How many fingers? ...Fuck it, that's close enough.",
        "Listen to me. LISTEN. Tie him up, hold on, and for God's sake stop bleeding on me.",
    ],
    'coach_quit': [
        "That's enough. I'm not watching him kill you on pay-per-view. Your mom would fucking kill ME.",
    ],
    'cutman_bad': [
        "The cutman is shoving Vaseline into that cut like he's caulking a fucking bathtub.",
        "Cutman: 'I've seen worse.' He has not seen worse. Nobody has seen worse.",
    ],
    'stool': [
        "{a} won't get off the stool! He's done! He's spitting blood into a bucket and quitting on camera!",
    ],
}

PRESSER = {
    'win_ko': [
        "I fucking TOLD you! I told every one of you motherfuckers! Lights OUT!",
        "I hit him so hard his family tree felt it. His cousins woke up with headaches.",
        "I want to thank God, my coach, and whatever the fuck was in that pre-workout.",
        "He said he'd knock me out. He's currently trying to remember what year it is. So.",
    ],
    'win_sub': [
        "I told him I was gonna choke him out and he didn't believe me. Now he believes in a lot of things. Like naps.",
        "He tapped like a fucking woodpecker. Respect to him, but also, ha.",
    ],
    'win_dec': [
        "Fifteen minutes of beating his ass. Judges finally got one right. Somebody check on them.",
        "I won. I'm tired. My dick hurts. I don't know why my dick hurts. Great night.",
    ],
    'loss': [
        "I got my ass beat. That's it. That's the quote. Print that.",
        "I'm gonna go home, sit in the shower with my clothes on, and think about my fucking choices.",
        "He hit me harder than my divorce lawyer. And that bitch was expensive.",
        "No excuses. I lost. Also, I had diarrhea since Tuesday. But no excuses.",
    ],
    'robbed': [
        "That's fucking bullshit and everyone in this building knows it! Those judges should be in jail! Fuck it, I said it!",
        "I got robbed in broad daylight! Somebody call the police! Actually, don't, I've got warrants. Kidding. Mostly.",
        "Those judges couldn't score in a fucking strip club with a fistful of hundreds.",
    ],
    'callout': [
        "And {opp}! I see you, you little bitch! You're next! Sign the fucking contract!",
        "{president}! Give me {opp}! I'll beat his ass for free! (Don't make me do it for free, I have a boat payment.)",
        "Hey {opp}, I'm gonna fuck you up so bad your kids will be born flinching!",
    ],
}

PRESSER_Q = {
    'to_loser': [
        "{f}, you got your ass handed to you. What the hell happened?",
        "{f}, on a scale of one to 'call my mom', how bad is the headache?",
    ],
    'to_winner': [
        "{f}, that was a goddamn massacre. Do you feel bad at all?",
        "{f}, is it true you told him 'goodnight, bitch' before the finish?",
    ],
    'answer_winner': [
        "Feel bad? I feel fucking AMAZING. He'll feel bad. For like a month.",
        "I don't want to sound arrogant, but I'm the best motherfucker on the planet. Next question.",
        "I'm gonna celebrate with my family. Then without my family. Then probably at a Waffle House.",
    ],
    'answer_loser': [
        "What happened is he punched me in the fucking face a lot. Next question.",
        "I don't remember the second round. Or my PIN number. Somebody text my wife.",
        "I'll be back. Right now I'm gonna go piss blood and think about my life.",
    ],
    'answer_robbed': [
        "I'm not gonna say the judges are corrupt. I'm gonna say they're fucking blind, stupid AND corrupt. Fine me.",
    ],
    'chaos': [
        "{f} answers a question by unzipping their bag, pulling out a full rotisserie chicken and eating it in silence for ninety seconds.",
        "{f} tells a reporter to 'go fuck yourself' so warmly that the reporter says 'thank you'.",
        "{f}'s phone goes off mid-answer. The ringtone is a moaning sound. {f} does not silence it.",
        "{f} leans into the mic and says 'my balls are still numb' and then refuses to elaborate.",
    ],
    'open_rant': [
        "Before we start: the judging tonight was dogshit. Absolute dogshit. I've seen better scorekeeping at a fucking bowling alley.",
        "I want to address the referee. Hey. Fuck you. Okay. Questions.",
    ],
    'open_hype': [
        "What a fucking night! Violence, blood, a guy shit himself in the co-main. That's a perfect card!",
        "This was the best fucking event in the history of the sport and I will fight anybody who disagrees. Not personally. I'll have a guy do it.",
    ],
}

RECAP = {
    'ko_take': [
        "{winner} didn't just knock {loser} out, he knocked him out of his GENERATIONAL WEALTH! His grandkids are gonna wake up concussed!",
        "{loser} got knocked so cold they had to thaw him out with a hair dryer! A HAIR DRYER!",
    ],
    'dec_take': [
        "Fifteen minutes of absolute nonsense. I've had colonoscopies with more excitement. AND BETTER LIGHTING.",
    ],
    'robbery_take': [
        "That decision was a CRIME! I want those judges arrested, tried, and forced to watch the fight again with their EYES OPEN!",
        "I've seen less robbery in a Fast and Furious movie! And they rob a VAULT with CARS!",
    ],
    'biscuit': [
        "Stephen, mate, you're spitting on me. You're actually spitting on me. Fucking hell.",
        "Shut the fuck up, Stephen. Sorry. Shut the HECK up. Producer's looking at me.",
        "I've been knocked out eleven times and I still make more sense than you, you shouty bastard.",
    ],
    'signoff': [
        "That's the show. Stay violent, stay hydrated, and for the love of God, stop texting me, Sandwich.",
    ],
}

SOCIAL = {
    'all_caps_rants': [
        "I'M GONNA FUCK {opp} UP SO BAD HIS GRANDKIDS WILL FEEL IT",
        "EVERYBODY IN THIS DIVISION IS A BUM. I SAID WHAT I SAID. COME GET ME, BITCHES",
        "WHOEVER STOLE MY TUPPERWARE FROM THE GYM FRIDGE I WILL FIND YOU AND I WILL CHOKE YOU UNCONSCIOUS",
    ],
    'thirst_traps': [
        "Weight cut day 4. Ass looking like a national treasure. Link in bio. Not that kind of link. Okay, that kind of link.",
    ],
    'beefing_with_randoms': [
        "Some fat fuck in my mentions says he'd beat me. Address? I'll come to you. I'll bring snacks. For after.",
        "Bro you have 12 followers and one of them is your mom. Sit the fuck down.",
    ],
    'motivational_slop': [
        "Pain is weakness leaving the body. So is diarrhea. Know the difference. Grind never stops.",
        "They laughed at me when I said I'd be a fighter. Now they laugh at me for different reasons. Still grinding.",
    ],
    'fans': [
        "Just put my rent on the underdog. Feeling great. Feeling very great. Somebody hold me.",
        "{promotion} commentary team sounds like three uncles fighting at Thanksgiving and I love every fucking second.",
        "Ref let that fight go so long I aged a year. My kid started walking during round 3.",
        "Bet my truck on the main event. Walking to work Monday. Worth it.",
        "Imagine paying $79.99 to watch two grown men hug for 15 minutes. That's me. I'm imagining it. I did that.",
    ],
    'generic': [
        "Back in the gym. Back in pain. Back in the fucking lab. Let's work.",
        "Just got my blood work back. Doctor said 'how are you alive.' Fight week baby.",
    ],
}

INTERVIEW_TRAITS = [
    "Hothead|{He} has been kicked out of three gyms, two Applebee's and one funeral.",
    "Party Animal|{He} has done a line of pre-workout off a stripper's back and called it 'cardio'.",
    "Trash Talker|{He} once made a priest say 'fuck' at a christening.",
    "Gambler|{He} has bet against {him}self twice. Won once. Lost the fight both times.",
    "Crypto Bro|{He} lost {his} purse, {his} car and {his} marriage to a coin with a dog on it.",
    "Streamer|{He} once streamed {his} own colonoscopy for subs. Peak viewers: 9,000.",
    "Lazy|{He} has been 'starting camp Monday' for nineteen consecutive Mondays.",
    "Diva|{He} demands a dressing room with blue M&Ms, a ring light and a priest. The priest is for the ring light.",
    "Prankster|{He} put laxatives in the team's post-weigh-in smoothies. The team now has a trust problem and a plumbing problem.",
]

LEDGER = [
    "The accountant has started drinking at work. Then at lunch. Then in the car. Then on the toilet. Then at work again.",
    "This week's financials, summarized by the CFO: 'oh, fuck.'",
    "Somebody expensed a strip club as 'scouting'. The receipt says 'VIP scouting'.",
    "The books are balanced the way a drunk is balanced: technically, briefly, and against a wall.",
    "Legal has asked that the words 'creative accounting' stop appearing in the group chat. Legal is also in the group chat.",
]

SLOW_NEWS = [
    "SLOW NEWS WEEK: AREA FIGHTER SHITS SELF ON LIVE STREAM, CHAT CALLS IT 'ON BRAND'",
    "SLOW NEWS WEEK: MAN AT GYM SAYS HE 'COULD TAKE' A HEAVYWEIGHT, IS CURRENTLY BEING FED THROUGH A STRAW",
    "SLOW NEWS WEEK: REFEREE STILL HASN'T STOPPED A FIGHT FROM 2019",
    "SLOW NEWS WEEK: JUDGE WHO SCORED LAST FIGHT 30-27 ADMITS HE 'MOSTLY WATCHED THE RING GIRLS'",
]

NEWS_BODIES = [
    "{promotion} responded to a request for comment with a voicemail that was just {president} saying 'fuck off' and then 'sorry, wrong number.'",
    "Sources describe the mood inside {promotion} as 'a hostage situation with catering.'",
    "When reached for comment, {president} said 'print whatever the fuck you want, it's all promotion,' then asked if we wanted tickets.",
]

HEADLINES = [
    ('ko', "{winner} BEATS {loser} INTO NEXT FUCKING WEEK", 0.3),
    ('ko', "{loser} WAKES UP, ASKS WHAT YEAR IT IS, GETS TOLD 'THE YEAR YOU GOT FUCKED UP'", 0.3),
    ('ko', "{winner} SLEEPS {loser}; {loser}'S MOUTHPIECE FOUND IN PARKING LOT", 0.3),
    ('robbery', "JUDGES SCORE {event} WHILE VISIBLY HAMMERED, HAND {winner} A BULLSHIT DECISION", -0.5),
    ('robbery', "'THOSE JUDGES COULDN'T SCORE IN A WHOREHOUSE': {loser}'S CORNER SPEAKS OUT", -0.5),
    ('upset', "WHO THE FUCK IS {winner}? UNDERDOG SHOCKS {loser}", 0.3),
    ('event', "{event} DELIVERS: 4 KOS, 2 BROKEN ARMS, 1 FAN ARRESTED FOR FIGHTING A BEER VENDOR", 0.1),
    ('event', "{event} WAS SO VIOLENT THE CAGESIDE DOCTOR QUIT MEDICINE", 0.1),
    ('weird', "{subject} GETS 'FUCK THE JUDGES' TATTOOED ON FOREHEAD; MOTHER 'NOT MAD, JUST DISAPPOINTED'", 0.0),
    ('weird', "{subject} SHOWS UP TO WEIGH-INS IN ONLY A FANNY PACK; MAKES WEIGHT", 0.0),
    ('weird', "{subject} CLAIMS HE CUT 30 LBS IN A WEEK 'MOSTLY THROUGH SHITTING'", 0.0),
    ('presser', "{president} TELLS REPORTER TO 'GO FUCK YOURSELF' FOUR TIMES IN ONE ANSWER; RECORD", 0.0),
    ('presser', "PRESS CONFERENCE DEVOLVES INTO 40-MINUTE 'YOUR MOM' EXCHANGE", 0.0),
    ('president_scandal', "{president} SEEN SNORTING SOMETHING OFF A CHAMPIONSHIP BELT; SPOKESPERSON SAYS 'IT WAS PROTEIN'", -0.7),
    ('president_scandal', "LEAKED AUDIO: {president} CALLS OWN FIGHTERS 'MEAT WITH OPINIONS'", -0.7),
    ('president_scandal', "{president}'S EXPENSE REPORT INCLUDES $11K AT 'DIAMOND DOLLS' UNDER 'TALENT SCOUTING'", -0.7),
    ('pay', "PURSE LEAK: {subject} MADE LESS THAN THE GUY WHO MOPS UP THE BLOOD", -0.5),
    ('pay', "{subject} SAYS FIGHT PAY 'WOULDN'T COVER A FUCKING DENTAL BILL'; {subject} NEEDS SEVERAL DENTAL BILLS", -0.5),
    ('feud', "{subjectLast} TELLS {otherLast} 'I'LL FUCK YOUR WHOLE LIFE UP' AT FACE-OFF; STAFF SEPARATES THEM WITH A FOLDING TABLE", 0.2),
    ('callout', "{subjectLast}: '{president} IS A CHEAP BALD BASTARD AND I WANT MY FUCKING MONEY'", 0.3),
    ('weight_miss', "{last} MISSES WEIGHT, BLAMES 'A REALLY BIG SHIT THAT WOULDN'T COME OUT'", -0.2),
    ('injury', "GRUESOME: {fighter}'S {injury} IS SO NASTY NETWORK CUTS TO A CAR COMMERCIAL", -0.2),
    ('ratings', "{promotion} RATINGS UP 40% AFTER COMMENTATOR SAYS 'FUCK' ON LIVE TV NINE TIMES", 0.2),
    ('commentary', "BLOW HOGAN SAYS 'HOLY SHIT' 31 TIMES IN ONE BROADCAST; NETWORK GIVES UP ON BLEEPING", 0.0),
    ('commentary', "SANDWICH CORMIER ACCIDENTALLY READS A FIGHTER'S NUDES TEXT ON AIR", 0.0),
    ('filler', "STUDY: 9 IN 10 MMA FANS HAVE NEVER THROWN A PUNCH, ALL 9 'COULD TAKE HIM THOUGH'", 0.0),
    ('filler', "LOCAL DAD WATCHES ONE JIU-JITSU VIDEO, DISLOCATES BROTHER-IN-LAW'S ELBOW AT BARBECUE", 0.0),
    ('slap', "SLAP LEAGUE CHAMP SLAPPED SO HARD HE NOW ONLY SPEAKS IN CAPS LOCK", 0.0),
    ('gossip', "SPOTTED: {subject} LEAVING A STRIP CLUB AT 7 A.M. WITH A DOGGY BAG AND NO SHOES", -0.1),
    ('fiasco', "{a} VS {b} ENDS WHEN BOTH FIGHTERS SHIT THEMSELVES; DECLARED NO CONTEST", -0.4),
]


def merge(lst, new):
    added = 0
    for x in new:
        if x not in lst:
            lst.append(x)
            added += 1
    return added


def main():
    tp = os.path.join(ROOT, 'data', 'documents', 'templates.json')
    t = json.load(open(tp))
    n = 0
    for k, v in TICKER.items():
        n += merge(t['ticker'].setdefault(k, []), v)
    for k, v in PRESSER.items():
        n += merge(t['presser'].setdefault(k, []), v)
    for k, v in PRESSER_Q.items():
        n += merge(t['presserQ'].setdefault(k, []), v)
    for k, v in RECAP.items():
        n += merge(t['recap'].setdefault(k, []), v)
    for k, v in SOCIAL.items():
        n += merge(t['social'].setdefault(k, []), v)
    n += merge(t['misc']['traitLines'], INTERVIEW_TRAITS)
    n += merge(t['ledgerQuips'], LEDGER)
    n += merge(t['misc']['slowNews'], SLOW_NEWS)
    n += merge(t['misc']['newsBodies'], NEWS_BODIES)
    json.dump(t, open(tp, 'w'), indent=1, ensure_ascii=False)
    hp = os.path.join(ROOT, 'data', 'headlines', 'headlines_extra.json')
    h = json.load(open(hp))
    have = {x['text'] for x in h}
    nh = 0
    for i, (tag, txt, tone) in enumerate(HEADLINES):
        if txt in have:
            continue
        h.append({'id': f'rr_{tag}_{i}', 'tags': [tag], 'text': txt, 'tone': tone})
        nh += 1
    json.dump(h, open(hp, 'w'), indent=1, ensure_ascii=False)
    print(f'added {n} template lines, {nh} headlines')


if __name__ == '__main__':
    main()
