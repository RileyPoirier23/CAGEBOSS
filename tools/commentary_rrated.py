"""R-rated booth lines. Imported by commentary_src.py (kept separate so the
filthy stuff is easy to find). Same placeholders and guardrails as the main file:
lines bound to {x}/{y} roast the fight and the persona, never accuse anyone of crimes."""


def install(add):
    # ---------------------------------------------------------------- Blow Hogan: swears like a sailor on DMT
    add('blow', 'hurt',
        "OH MY FUCKING GOD! {x} just got his SOUL knocked out of his body! Jamie, pull that up! Pull it up in slow motion!",
        "Holy shit! Holy SHIT! {x} is hurt! His legs are gone, man, his legs are in another ZIP code!",
        "That's a fucking BOMB, man! That's a nuclear fucking bomb! {x}'s brain just rebooted into safe mode!",
        "Dude, {x} just got hit so hard he saw God, and God said 'what the fuck are you doing here, go back.'",
        "Oh he's FUCKED. He's fucked, Lon. I'm sorry, I'm not supposed to say that. He's extremely fucked.",
        "Bro, {x} is doing the stanky leg and there's no music playing. That's a bad sign. That's a real bad sign.")
    add('blow', 'knockdown',
        "DOWN HE GOES! Holy shit! That's the kind of shot that changes your fucking personality!",
        "He dropped him! Jesus Christ! {y} folded like a cheap fucking lawn chair!",
        "OHHHH! That's a knockdown! {y} just got sent to the shadow realm, man, he's talking to his ancestors!",
        "Flat on his ass! Flat on his ASS! Jamie, I need that from four angles!")
    add('blow', 'finish_ko',
        "GOODNIGHT! Holy FUCK! {x} just turned out {y}'s lights, his heat AND his Wi-Fi!",
        "He's out! He is OUT! That's the most violent shit I've seen since the elk episode!",
        "OH MY GOD! {y} is asleep! He's not unconscious, he's in a fucking COMA of disrespect!",
        "That's a highlight that's gonna be on every gym TV on Earth! {x} just ended a man's whole fucking bloodline!",
        "Lon, I've seen a lot of knockouts. I've seen a lot. That one made my balls retract.",
        "Somebody check on {y}, man. Not medically. Spiritually. That motherfucker just met the void.")
    add('blow', 'finish_sub',
        "He TAPPED! Beautiful! Fucking BEAUTIFUL! That's jiu-jitsu, baby! That's a chess match with strangling!",
        "That's it! Tap or snap, and he chose tap! Smart man. Smart, smart, very sore man!",
        "Oh he put him to SLEEP! Night-night, motherfucker! That's the most peaceful violence on Earth!",
        "You see that? That's why you train jiu-jitsu, kids. So you can make grown men piss themselves politely.")
    add('blow', 'blood',
        "Oh, there's blood. There's a LOT of fucking blood. That's a crime scene now, Lon. That's a fucking crime scene.",
        "Holy shit, the canvas looks like a Tarantino movie. Somebody call the cleaning crew and a priest.",
        "He's leaking, man! He's leaking like a fucking garden hose! That's not a cut, that's a faucet!")
    add('blow', 'body',
        "Oh he went to the BODY! That's the worst feeling in the world, man. It feels like your liver is trying to file a restraining order.",
        "Body shot! Liver shot! That's the one where you shit your soul out of your ears!",
        "Dude, a good liver shot makes you want to lie down and call your mom and apologize for everything.")
    add('blow', 'legkick',
        "Another leg kick! That leg is fucked, man. That leg is gonna need its own fucking GoFundMe.",
        "He's chopping him down like a fucking tree! Timber, motherfucker!",
        "That calf is gonna look like an eggplant tomorrow. A big, sad, purple eggplant.")
    add('blow', 'lull',
        "You know what this pace reminds me of? My second ayahuasca trip. Nothing happened for six hours and then I cried.",
        "Come on, man, somebody throw something! I didn't drive here from a sensory deprivation tank for this shit!",
        "This is like watching two dudes try to parallel park the same car. Fucking commit, guys!",
        "I'm not gonna lie, Lon, I took an edible before the prelims and this round is lasting nine hours.",
        "Have you ever seen a chimp fight? A chimp would've ripped both these guys' dicks off by now. Just saying.",
        "If they keep this up I'm gonna start talking about elk. Don't make me talk about elk.")
    add('blow', 'wrestling',
        "Fucking BEAUTIFUL takedown! That's a grown man getting put on his ass like a toddler at a trampoline park!",
        "He took him down like he owed him money! Holy shit, that's a D1 double leg right there!",
        "That's wrestling, man! That's 'I'm gonna lay on top of you until you question your life choices.'")
    add('blow', 'bjj',
        "Oh he's hunting the neck! He's hunting it like it's elk season, motherfucker!",
        "Look at those hips, Lon! That's some filthy, filthy, disgusting jiu-jitsu! I love it! I want to take it home!",
        "That's a fucking Rubik's cube of limbs right there, and only one of them knows the solution.")
    add('blow', 'foul',
        "Right in the fucking BALLS! Oh, buddy. Oh, BUDDY. Every man in this building just felt that in his stomach.",
        "Eye poke! Cut your fucking nails, man! Come on! That's how you blind a guy for a living!",
        "He kicked him right in the dick! You can see his soul leaving through his mouth!")
    add('blow', 'decision',
        "Okay, we're going to the scorecards, which means we're about to find out how fucking drunk the judges are.",
        "Fifteen minutes of war. Let's see if the judges were watching or if they were on their phones looking at porn.")
    add('blow', 'robbery',
        "THAT'S FUCKING BULLSHIT! That is BULLSHIT, Lon! Who are these judges? Who let them in? Who gave them PENS?",
        "What the fuck are we doing? WHAT THE FUCK ARE WE DOING? That's a robbery! Somebody call the cops! Real cops!",
        "Those judges should be fucking arrested. I'm serious. Arrest them. Put them in a cage with {winner}'s mom.")
    add('blow', 'slap',
        "He SLAPPED him! He slapped that man like a disappointed stepdad! That's the most disrespectful shit in the world!")
    add('blow', 'round_end',
        "What a fucking round! I need a cigarette and I don't smoke!",
        "That round was so violent I think I need to go to therapy. Or a sauna. Same thing.")
    # ---------------------------------------------------------------- Lon Anik: polished voice, filthy content
    add('lon', 'hurt',
        "{x} is in serious trouble. I'm told the technical term is 'fucked', Blow, and I believe it applies.",
        "His eyes are rolling like a slot machine, and the jackpot is a CT scan.",
        "{x} is hurt and holding on for dear life, which, at this point, is the only life he has left.")
    add('lon', 'finish_ko',
        "And just like that, {y} is unconscious, {x} is victorious, and somewhere a fantasy-MMA dad is screaming at his kids.",
        "{y} is out cold. The kind of out cold where they ask you who the president is and you say 'Blockbuster.'",
        "That's the end. Somewhere, {y}'s mother just shit herself, and frankly, so did I.")
    add('lon', 'blood',
        "The blood is pouring now. For those of you watching at home in high definition, I apologize. For those eating dinner, I apologize more.",
        "That cut is so deep you could post a letter in it.")
    add('lon', 'lull',
        "A slow round. I'm told our producer has gone outside to scream into a dumpster.",
        "While we wait for violence, a reminder: the views of this broadcast are those of a man who hasn't slept since the weigh-ins.",
        "This round is so dull the cageside physician has started doing a crossword. In pen. Smugly.")
    add('lon', 'controversy',
        "We'd be remiss not to mention this week's press conference, which featured nine fuck-yous, two thrown chairs and one man crying into a protein shake.",
        "{x} described his opponent this week as 'a sack of wet shit in board shorts.' The commission has asked us to say that they disagree with the wet part.")
    add('lon', 'decision',
        "We go to the judges, three people who, combined, have watched almost half of this fight.",
        "To the scorecards. Lock up your children. Hide your sanity.")
    add('lon', 'robbery',
        "That's... that's a fucking travesty. I'm sorry. I'll be fined for that. It's worth it. It's a travesty.",
        "In thirty years of broadcasting I've never seen a worse decision. And I once watched a man marry his own sponsor.")
    add('lon', 'foul',
        "A low blow. {ref} calls time. The fighter is on all fours, a position most of us associate with our honeymoon.",
        "That's a knee to the groin, and you could hear a vasectomy happen in real time.")
    # ---------------------------------------------------------------- Chicken Man Sandwich Cormier: texts, food, wrestler pride
    add('dc', 'texted',
        "{wn} texted me this morning. Just a photo of his weight-cut shit. No caption. Just the photo. I blocked him and then unblocked him for the story.",
        "So {wn} sends me a voice memo at 4 a.m. Eleven minutes. It's just him breathing and saying 'I'm gonna fuck him up' every ninety seconds.",
        "I got a text from {wn}'s mom. She says, 'Daniel, if my son gets hurt I'm gonna fuck you up.' I'm not Daniel. I'm Sandwich. I'm scared anyway.",
        "{wn} texted me 'bro the sauna is talking to me.' I said 'drink some water.' He said 'the sauna said no.'",
        "My phone just buzzed. It's {wn} from cageside. He says 'is this shit live?' Yes. Yes it is. Hi buddy.")
    add('dc', 'hurt',
        "He is HURT! Oh, he's hurt bad! That's the kind of shot that makes you forget your own Netflix password!",
        "{x} is wobbling like me at a Golden Corral at two in the morning!",
        "That's a fucking bad place to be, man. I been there. I been there in the Olympics. I cried in Greek.")
    add('dc', 'wrestling',
        "THAT is a takedown! That's a real wrestler! That's 'shut the fuck up and lay down', buddy!",
        "You see that? Wrestling! The oldest sport in the world! Before that, people just fucked around!")
    add('dc', 'finish_ko',
        "OH MY GOD! He knocked him the fuck OUT! I almost dropped my chicken wing!",
        "That's it! That's it! Somebody call his wife! Somebody call his OTHER wife!")
    add('dc', 'lull',
        "This round got me hungry, man. Not for violence. For ribs.",
        "I'm gonna be honest, I'm not watching. I'm texting {wn} about a sandwich. Not me. A real sandwich.")
    add('dc', 'robbery',
        "That's horseshit! That's absolute horseshit! I'm sorry, Lon. It's not horseshit. It's worse. It's JUDGE shit.")
    add('dc', 'decision',
        "We're going to the cards, and I'm gonna tell you, I already ate my card. I was hungry.")
    # ---------------------------------------------------------------- guests: no filter whatsoever
    add('braille', 'any',
        "I'll tell you right now, I can't see shit, but I can feel it. {x} is winning. Or losing. One of the two, guaranteed.",
        "Let me be very fucking clear: I have never once been wrong. I have been 'early'. There is a difference.",
        "{x} is a bum. I've never seen him fight. I don't need to. I can smell a bum.",
        "This kid {x} reminds me of me, except worse, and with less hair, and with a worse lawyer.")
    add('braille', 'finish_ko',
        "Called it. Did I call it? I fucking called it. Check the tapes. Don't check the tapes.")
    add('biscuit', 'any',
        "Fucking hell, {x}, mate. Throw a punch. My nan throws more punches and she's been dead since 2009.",
        "I've got one good eye and even that one's seen enough of this shit.",
        "In my day we'd have finished this fight, gone to the pub, and finished another one in the car park.",
        "If {y} wants my advice, it's this: punch him in the fucking face. Repeatedly. Until he stops having a face.",
        "That's the most British fight I've ever seen. Lots of apologizing, no fucking violence.")
    add('biscuit', 'blood',
        "Oh he's bleeding like a stuck pig. Lovely. That's proper fighting, that is.",
        "That's not a cut, that's a second mouth. And it's saying 'stop the fucking fight'.")
    add('biscuit', 'finish_ko',
        "Goodnight, Irene! Fucking hell! He's not getting up till Tuesday!",
        "Oh he's done. He's gone. He's in a better place. The place is the floor.")
