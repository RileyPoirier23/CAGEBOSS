"""Source for data/documents/commentary.json: ring announcer + commentary booth.

Placeholders (filled by src/sim/commentary.ts):
  {x} {xf} {xfirst} {xn}  subject fighter: last name, full name, first name, nickname (or last)
  {y} {yf}                the other fighter
  {wn}                    a mangled version of {x} (Sandwich Cormier forgets names)
  {home} {country} {gym} {coach} {rec} {streak} {kids} {age}
  {ref} {belt} {event} {venue} {r} {div} {president} {fact}
  {winner} {loser}
Speakers: lon (Lon Anik, play-by-play), blow (Blow Hogan), dc ("Chicken Man" Sandwich Cormier),
          braille (Braille Sonnen, guest), biscuit (Michael Biscuit, guest)
Parody guardrail: no criminal / doping / abuse lines are ever bound to a parody fighter;
`controversy` facts are computed in code and only use safe material for parodies.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..')

SPEAKERS = {
    "lon": {"name": "Lon Anik", "short": "ANIK", "color": "e6dcc4",
            "bio": "Play-by-play. Treats every prelim like the moon landing. Has a stat and a controversy for everyone."},
    "blow": {"name": "Blow Hogan", "short": "HOGAN", "color": "d9a441",
             "bio": "Color. Black belt in jiu-jitsu, white belt in staying on topic. Elk, DMT, chimps, and glazing."},
    "dc": {"name": "\"Chicken Man\" Sandwich Cormier", "short": "SANDWICH", "color": "7fb069",
           "bio": "Color. Two-time Olympic wrestler, one-time chicken-wing world record holder. Gets texts from everyone. Remembers nobody's name."},
    "braille": {"name": "Braille Sonnen", "short": "BRAILLE", "color": "c56a5a",
                "bio": "Guest analyst. Legally blind. Spiritually confident."},
    "biscuit": {"name": "Michael Biscuit", "short": "BISCUIT", "color": "6f9fd8",
                "bio": "Guest analyst. Former champ, one working eye, zero filter. Will take the other one out to make a point."},
}

B = {}  # booth[speaker][situation] = [lines]


def add(sp, sit, *lines):
    B.setdefault(sp, {}).setdefault(sit, []).extend(lines)


# =====================================================================================
# LON ANIK - play-by-play. Polished, dramatic, poetic, human-interest, brings up the drama.
# =====================================================================================
add('lon', 'open_main',
    "Ladies and gentlemen, welcome to the main event of {event}, live from {venue}. If you're just joining us: hello, sit down, don't blink.",
    "Here we go. {xf} and {yf}. A fight that was built on months of trash talk, two cancelled press conferences and one very confusing podcast.",
    "We have arrived at the main event, and the atmosphere here at {venue} is electric. Partly the crowd. Partly a fire marshal violation.",
    "Five rounds. Two fighters. One of them is going home with a bonus and the other is going home with a concussion protocol.",
    "This is the one. The fight we've been talking about all week. The fight the betting public cannot figure out. The fight my mother texted me about.",
    "{event}. The main event. Our broadcast partners are nervous. Our insurance providers are nervous. I am thrilled.")
add('lon', 'open_title',
    "This is for the {belt}. Twenty-five minutes, if needed, to determine the best on the planet. Or at least the best in this building.",
    "Championship gold on the line. {xf} is the defending champion, and {yf} has been calling for this since before the ink dried on the last contract.",
    "A world title fight here at {venue}. History is a strange thing, Blow. It's being written tonight, and it's being written in blood.",
    "The {belt} sits cageside. It weighs eleven pounds. It's worth more than that. It's worth everything to these two.")
add('lon', 'open_prelim',
    "We are underway on the prelims. Grab a drink, grab a seat, this one could steal the show.",
    "Prelim action here at {venue}. The arena is about a third full, and that third is extremely loud.",
    "Our opening bout of the evening. {xf} against {yf}. Remember the names. Or don't. Sandwich won't.",
    "Early action on the card, and I'll say it every time: never sleep on the prelims. Sleep on the commentators, that's fine.")
add('lon', 'open_rematch',
    "These two have met before. {xf} and {yf}, part {meeting}. Unfinished business, and a great deal of it.",
    "It's a rematch. They know each other's tendencies, habits, and, judging by social media, each other's home addresses.",
    "We've seen this movie before, and the sequel has a bigger budget.")
add('lon', 'round_start',
    "Round {r}. Here we go.",
    "Round {r} is underway. {ref} with a word to both, and we're live.",
    "And we go to round {r}. The corners have said their piece. Now it's on the fighters.",
    "Round {r}. Somebody needs to change something, and fast.",
    "Into round {r}. The crowd's settled back into their seats. They will not stay there.")
add('lon', 'wrestling',
    "Beautiful level change from {x}. {x} was a state champion in high school and has reminded everyone at least once a week since.",
    "{x} takes it down. That's the game plan, and {x} is executing it like a tax audit.",
    "Down goes {y}. The wrestling of {x} is a problem for anyone, and a nightmare for {y}.",
    "{x} chains the wrestling. Single leg, then a trip, then a whole lot of being heavy.")
add('lon', 'bjj',
    "{x} hunting for the finish. Remember, nine of {x}'s wins have come by submission. Nine.",
    "{x} is looking for something there, and {y} has to be very careful. One wrong hand position and this is over.",
    "Slick from {x}! A very dangerous grappler, and {y} is playing with fire.")
add('lon', 'flashy',
    "WOW! Where did that come from? {x} with something out of a video game!",
    "{x} with the spectacular! That will be on every highlight reel by morning.",
    "Did you see that? Of course you did. You'll see it again in slow motion in about four seconds.")
add('lon', 'hurt',
    "{y} IS HURT! {x} has to pounce!",
    "OH! {y} is wobbled! Legs gone!",
    "{x} has {y} in all sorts of trouble here!",
    "Big shot from {x}! And {y} is on roller skates!")
add('lon', 'knockdown',
    "DOWN GOES {y}! DOWN GOES {y}!",
    "{y} is down! {x} with the flash knockdown!",
    "He's down! And {x} smells it!")
add('lon', 'finish_ko',
    "AND IT IS ALL OVER! {winner} SLEEPS {loser}!",
    "GOODNIGHT! {winner} with a highlight-reel finish, and {ref} waves it off!",
    "OH MY GOODNESS! IT IS ALL OVER! {winner} has done it in emphatic fashion!",
    "Just like that! {winner} turns out the lights at {venue}!",
    "But that is not the cloth from which {winner} is cut! {winner} does not lose this way! IT IS OVER!")
add('lon', 'finish_tko',
    "AND {ref} HAS SEEN ENOUGH! {winner} gets the stoppage!",
    "It's all over! {ref} steps in and {winner} gets the finish!",
    "{ref} pulls {winner} off and this one is done. A dominant performance.")
add('lon', 'finish_sub',
    "TAP! TAP! TAP! {loser} has to tap and it's all over!",
    "{winner} gets the tap! What a submission! What a grappler!",
    "And {loser} has no choice! {winner} with a beautiful finish on the mat!")
add('lon', 'finish_doc',
    "The doctor has seen the cut and that's it. This one's been stopped on the doctor's advice. {winner} gets the TKO.",
    "A frustrating way for it to end, but the right call. That cut was ugly.")
add('lon', 'finish_dq',
    "This one is over by disqualification. That is not how anybody wanted to see it end.",
    "{ref} has disqualified {loser}. The crowd is furious. So is my producer.")
add('lon', 'decision',
    "We'll go to the judges' scorecards. Both fighters have their arms up. One of them is going to be very disappointed.",
    "Fifteen minutes in the books, and it's in the hands of the judges. Never a comfortable place to be.",
    "That's the final horn. We are going to the scorecards, and frankly, Sandwich, I'm nervous.")
add('lon', 'robbery',
    "That... is a curious decision. I'll leave it there. Actually no I won't. That was a robbery.",
    "The crowd is booing that decision, and I'm not sure they're wrong. Judging remains the sport's great unsolved mystery.",
    "We will be talking about these scorecards for weeks. Possibly in court.")
add('lon', 'blood',
    "And there's the blood. {y} is cut, and it's in the eye.",
    "{x} opens a cut! The cutman is going to earn his money tonight.",
    "That's a nasty gash. You can see it from up here. You can probably see it from space.")
add('lon', 'foul',
    "Oh, that's low. That's very low. Time is stopped.",
    "{ref} with a warning there. One more and he's taking a point.",
    "Foul there, and {y} is not happy about it. Neither is the crowd.")
add('lon', 'lateref',
    "{ref} has to stop this! He's taking unnecessary damage! ... and {ref} is still watching.",
    "Come on, {ref}! He's done! {y} is DONE!")
add('lon', 'standup',
    "{ref} stands them up. The crowd wanted action and {ref} heard them.",
    "And a standup from {ref}. Not everyone at cageside agrees with that.")
add('lon', 'lull',
    "Fun fact: {xfirst}'s parents own a bakery. {xfirst} still gets up at 4am to help with the croissants on fight week.",
    "Some background on {x}: started training at fourteen after getting beat up at a bus stop. Never lost at a bus stop since.",
    "{x} fighting out of {gym}, where head coach {coach} is known for his, let's say, 'unconventional' methods.",
    "Comes in with a record of {rec}. {streak}",
    "I spoke to {x}'s team this week and they say the camp went 'perfectly', which is what every team says right before a disaster.",
    "Brief reset in the action. Let me read a message from our sponsors: please buy things.")
add('lon', 'controversy',
    "And of course, you can't talk about {x} without mentioning {fact}.",
    "It's been a turbulent year for {x}. {fact}. Tonight is a chance to change the story.",
    "We'd be remiss not to mention {fact}. {x} has said they don't want to talk about it. So we will. Briefly.",
    "The elephant in the room: {fact}. {x} says the noise is just fuel.",
    "Lot of talk this week about {fact}. The fight is the only answer that matters now.")
add('lon', 'round_end',
    "And that is the end of round {r}. That round could go either way, and the judges have a history of choosing the third way.",
    "End of round {r}. Clear round for {x}, I think. Sandwich?",
    "That's the horn to end round {r}. Big minute in the corners coming up.")
add('lon', 'showboat',
    "{x} with the showboating! Hands down, talking to {y}!",
    "{x} is taunting! Dropping the hands! Bold strategy, Cotton.")
add('lon', 'stool',
    "And the corner is waving it off! {loser} will not answer the bell!",
    "{loser} stays on the stool. That's a hard decision, and maybe a wise one.")
add('lon', 'injury',
    "Something is wrong with {y}. Something is very wrong.",
    "Ooh, that's an injury. {y} is favouring it badly.")

# =====================================================================================
# BLOW HOGAN - color. Glazes BJJ and wrestling, OH HE'S HURT, DMT, elk, chimps, pull that up.
# =====================================================================================
add('blow', 'open_main',
    "This is the fight, man. This is THE fight. I've been talking about this fight on the podcast for three hours a week for two months.",
    "I'm telling you right now: if {x} gets this to the mat, it's a wrap. And if it stays standing, it's also kind of a wrap. It's entirely possible both of them win.",
    "I watched {x} train this week. Hitting pads at five in the morning, then a cold plunge, then elk. That's a killer's routine.",
    "Everybody's sleeping on {y}. Not me. I'm never sleeping. I had DMT at the hotel.")
add('blow', 'open_title',
    "This is for the belt, man! Twenty-five minutes of the most savage human combat on Earth! I've got goosebumps, look at this. Pull that up. Zoom in on my arm.",
    "If you'd told me in 1997 that we'd be here, watching a title fight like this, I'd have said 'no way, man, the government won't allow it.'",
    "Championship rounds, that's where the killers live. That's where your soul leaves your body and comes back with a mustache.")
add('blow', 'open_prelim',
    "Don't sleep on this one. These are hungry guys. Literally, one of them just made weight.",
    "I love prelim fighters, man. They don't know they're not supposed to be in a war yet.")
add('blow', 'wrestling',
    "LOOK AT THAT DOUBLE LEG! That's world-class wrestling, man! That's the most dominant thing a human being can do to another human being!",
    "That's an Olympic-level shot! The way {x} changes levels, it's like a cheetah, but a cheetah who did Division I.",
    "That's the thing about wrestlers, man. They just... take you down. Wherever they want. You're just in their world now.",
    "You can't teach that. Well, you can. It takes twenty years and you have to cut weight in a sauna suit. But you can't teach it quickly.",
    "{x} is just HEAVY. That's wrestling, man. It's not about strength, it's about making the other guy carry your whole body and all of your problems.",
    "Watch the hips! Watch the hips! It's all about the hips! I've been saying this since 2003!",
    "That is the most beautiful takedown I've seen all year. I'm not even kidding, I might cry.",
    "Wrestlers, man. You know they're getting up at 4am running stairs with a backpack full of rocks. That's the mindset.")
add('blow', 'bjj',
    "OH! LOOK AT THAT! That's high-level jiu-jitsu right there, folks! That's a black belt! That's a black belt under a black belt under a guy who invented it!",
    "{x} is a SAVAGE on the ground, man. A savage! The way {x} moves is like a python. A python with a gi.",
    "That's the beautiful thing about jiu-jitsu, it's like human chess. If chess could break your arm.",
    "Did you see the grip? Did you see that grip?! That's a ten-finger death grip! I've been choked like that! Many times! On purpose!",
    "I'm telling you, that's a rubber guard variation. We used to call that 'the mission control'. It's hard to explain without a whiteboard and some mushrooms.",
    "Oh this is dangerous. This is so dangerous. {y} doesn't even know how much danger they're in. Their body knows. Their body is screaming.",
    "THAT'S A BEAUTIFUL SWEEP! You don't see that in MMA! You see that at like, a tournament in Torrance at 9am!",
    "If {x} gets the back, it's over. It's over! It's not over yet. But it's going to be over. Probably.",
    "Jiu-jitsu is the great equalizer, man. A small person can strangle a large person. Isn't that beautiful? It's horrifying, but it's beautiful.")
add('blow', 'fav_bjj',
    "I love watching {x}, man. {x} is one of the most creative grapplers on the planet. Pull up {x}'s last submission. Jaymee, pull that up.",
    "{x} has, I think, the best guard in this division. Maybe in the world. Maybe in the history of having legs.")
add('blow', 'fav_wrestler',
    "{x}'s wrestling is SO good. You know {x} was a state champion? Pull that up. Jaymee? Yeah. State champ. Look at that.",
    "{x} has that wrestler's pace, man. That's what a wrestler does: they make you tired. They make you sad.")
add('blow', 'flashy',
    "OH MY GOD! DID YOU SEE THAT?! Spinning shit, man! I love the spinning shit!",
    "THAT'S A TAEKWONDO KICK! That's a kick from a strip mall in 1987 and it just landed on a professional athlete!",
    "Who does that?! Who DOES that?! That's like something out of a kung-fu movie, but real, and illegal in four states.",
    "Look at the athleticism! That's a primate, man. That's chimp-level explosiveness. Chimps can rip your face off, did you know that? They're 1.5 times as strong as a human.")
add('blow', 'legkick',
    "Those leg kicks are adding up! {y}'s leg looks like a bruised eggplant!",
    "Oblique kick! Calf kick! That's the most underrated weapon in the sport! You can't run, you can't fight, you can't go to the bathroom with dignity for a week.",
    "You hear that sound? That's a shin hitting a thigh. That's like a baseball bat hitting a ham.")
add('blow', 'body',
    "BODY SHOT! That's to the liver! The liver shot is the worst feeling in the world, man. It's like your body files for divorce.",
    "Go to the body! That's what slows people down. The head is a liar, but the liver tells the truth.")
add('blow', 'hurt',
    "OH! HE'S HURT! HE'S HURT!",
    "OHHH! {y} IS HURT! {y} IS HURT!",
    "OH MY GOD! THAT'S IT! THAT'S... no, {y} is still up. {y} is very hurt though!",
    "OH! OH! That's a big shot! That's a BIG shot! I felt that from here! I felt it in my DNA!",
    "OHHH {y} IS IN TROUBLE!",
    "OH!!! WOW!!! WOOOW!!!")
add('blow', 'knockdown',
    "OH! HE'S DOWN! HE'S DOWN! Jaymee, pull that up! Run it back! RUN IT BACK!",
    "WHAT A SHOT! Oh my god! I just spilled kombucha everywhere!")
add('blow', 'finish_ko',
    "OHHHHHH! WOW! WOW!!! THAT IS ONE OF THE GREATEST KNOCKOUTS I'VE EVER SEEN! I've seen a lot! I've seen thousands!",
    "WHAT A KNOCKOUT! That's a top-five knockout of all time! That's a top-five knockout of the week, minimum!",
    "That's a career-defining moment, man. That's going on the wall. That's going on {winner}'s gravestone. Happily.",
    "I don't know what to say. I literally don't. I'm just going to scream. AAAAAHHH!")
add('blow', 'finish_sub',
    "THAT'S JIU-JITSU, BABY! That's what I'm talking about! That's why you train, kids!",
    "Beautiful! BEAUTIFUL! That's the most beautiful choke I've seen since... last week, but still!",
    "Look at the technique! The way {winner} squeezed... that's like a boa constrictor eating a rabbit. And the rabbit is a professional athlete.")
add('blow', 'finish_tko',
    "Great stoppage. GREAT stoppage. That's how you referee a fight, man.",
    "That's it! {winner} was just a savage there, man. Just a wild animal. A wild animal in tiny shorts.")
add('blow', 'decision',
    "I had it {sa}-{sb} for {winner}. I mean, I think. I was also talking about bears for most of the second round.",
    "That was a close one, man. Judges are gonna judge. Who knows. It's entirely possible they're watching a different fight.")
add('blow', 'robbery',
    "That's a ROBBERY, man! That's ridiculous! Who are these judges?! Are they even human? Pull that up. Jaymee, pull up the judges.",
    "That's crazy! That's absolutely crazy! Somebody needs to look into this. I'm going to do a podcast about it. A long one.")
add('blow', 'lull',
    "You know who would be great at this? A chimp. A chimp would rip both of these guys' arms off. Have you ever seen a chimp fight? It's insane, man.",
    "I hunted an elk this summer, man. Bow and arrow. That's the most humbling thing you can do. Besides this. This is also humbling.",
    "Have you ever tried DMT, Lon? Lon? ...no, okay. We'll talk later.",
    "Ten smart people have explained NFTs to me and I still don't know what they are. Anyway, {x} is doing great.",
    "You know what's crazy? Bears. Bears are crazy. A bear could take this whole card. Pull up a bear. Jaymee. A big one.",
    "I've been doing a seventy-two hour fast. I feel incredible. I can see sounds.",
    "Lion's mane, man. I took some before the broadcast. My neurons are doing cartwheels.",
    "This is a chess match right now. Kind of a boring chess match. But chess.",
    "You know who would be good at MMA? Navy SEALs. I had one on the podcast. He was terrifying. He ate a whole rotisserie chicken during the interview.",
    "It's entirely possible these two are just being careful. It's also entirely possible we're living in a simulation.",
    "Sauna after this, Lon? 220 degrees. It cleans the brain. I've been reading studies. Well, one study. Well, a tweet.",
    "There was a time when people thought a karate guy would beat a boxer. Can you imagine? Pull that up. The old fights. Man.",
    "I used to compete in taekwondo. I was a savage. I was a skinny savage with a mullet.",
    "Hit the back! Get to the back! Somebody do something! I'm getting old over here!",
    "This is the kind of fight where you go to the bathroom and come back and nothing has happened. I'm not going, though. I'm committed.",
    "Do you guys hear that? That's the sound of nobody taking a risk.")
add('blow', 'bias',
    "And I'll be honest, I love {x}. I'm biased. I'm completely biased. But I'm also right.",
    "I don't want to be biased here, but {x} is the greatest athlete I've ever seen. In this fight. So far.",
    "People say I glaze {x}. I don't glaze. I appreciate. Thoroughly. Like a ham.")
add('blow', 'blood',
    "That's a nasty cut, man. That's like a faucet. You could hydrate the whole front row.",
    "Look at that blood! That's the kind of cut you get when you headbutt a coffee table. I would know.")
add('blow', 'foul',
    "Ooh, that's a nut shot. That's the worst feeling in the world. That's worse than the liver. That's worse than divorce.",
    "Eye pokes are a plague, man. Close your fists! Close your fists! It's not that hard! Make a fist!")
add('blow', 'lateref',
    "STOP IT! STOP THE FIGHT! {ref}! Come on, man! That's how people die!",
    "{ref}, you've got to stop that, man. That's just... that's somebody's son.")
add('blow', 'showboat',
    "Look at {x}, man! Hands down! Talking trash! That's a confident fighter. Or a stupid one. Either way: exciting.")
add('blow', 'round_end',
    "That was a great round, man. A great round. I had it for {x}. Ten-nine. Maybe ten-eight. My heart says ten-eight.",
    "That round was close. I don't know. I was looking at a guy in the crowd who looked exactly like my uncle.")
add('blow', 'stool',
    "Smart call by the corner. Live to fight another day. Or go home and do a cold plunge.")
add('blow', 'injury',
    "OH! That's a broken... something. That's broken. Something's broken. I heard it. I'll be hearing it tonight when I sleep.",
    "That leg is done, man. That leg doesn't work anymore. That's a decorative leg now.")
add('blow', 'slap',
    "I'll say it: slap fighting is free brain damage. I don't care who's paying. Free. Brain. Damage.")

# =====================================================================================
# "CHICKEN MAN" SANDWICH CORMIER - texted me, forgot your name, food, wrestling, off-topic
# =====================================================================================
add('dc', 'open_main',
    "I talked to {x} backstage, and you know what {x} told me? 'DC, I'm gonna knock this guy out.' And I said, 'That's great. Have you eaten?'",
    "I got a text message from {x} this week. Three words: 'I am ready.' Then a fourth text: 'Where are you getting wings?'",
    "Let me tell you something about {x}: this is a family person. {x} has {kids}. I've met them. They're all terrifying.",
    "You know, it's a beautiful night here at {venue}. Clear skies outside. Nice temperature. Good night for a walk. ... Oh, we're starting? Okay.",
    "Before we get into it: the catering backstage tonight? Ridiculous. They had a whole chicken station. I'm not saying I visited it four times. I'm saying it was ridiculous.")
add('dc', 'open_title',
    "I've been in that position, man. Walking out for a title with everybody watching. Your legs feel like spaghetti. Your stomach feels like... also spaghetti.",
    "This belt changes your life. I know. I had two of them. I kept one in the kitchen. Next to the wings.",
    "{x} texted me last night, 2 in the morning, just a picture of the belt. No words. Just the belt. I texted back a picture of a chicken sandwich. We understood each other.")
add('dc', 'open_prelim',
    "I gotta be honest with you, Lon, I don't know a lot about this one. I know {x} has a dog. Nice dog. Golden retriever. Anyway, let's watch.",
    "Weather was beautiful today. Did you guys go outside? I went outside. I got a sandwich. Okay, let's talk about this fight.",
    "Good to see {wn} here. Is it {wn}? It's {wn}. I'm pretty sure it's {wn}.")
add('dc', 'texted',
    "{x} texted me earlier in the week and said, 'DC, I'm gonna take this guy down and hold him until he cries.' And look at that, here we are.",
    "I just actually got a text message. It's from {x}'s mom. She says, and I quote, 'Tell my baby to keep the hands up.' Keep the hands up, {xfirst}!",
    "I texted {x} this morning, said 'good luck.' {x} texted back 'who is this.' I don't know why. Same number for ten years.",
    "My phone just buzzed. It's {coach}. 'Tell {x} to stop looping the right hand.' Coach, I'm not in the corner! I'm on TV! I can't tell anybody anything!",
    "{x} called me Wednesday, wanted to talk about cutting weight. We talked for an hour. Forty-five minutes was about a waffle place in {home}.",
    "I got a text from {x} that just said 'pray for me.' Then another one that said 'not like that.' I don't know what that means.",
    "{x} sent me a voice memo at 4am. It was just breathing. Deep breathing. I think it was a sauna. I hope it was a sauna.",
    "You know what {x} texted me? 'DC, I've been watching your old fights.' And I said 'which ones?' and {x} said 'the losses.' That's cold, man.",
    "I've been texting with {y}'s manager all week. Great guy. Can't spell. Every text is just 'ya' and a flexing emoji.",
    "I'm in a group chat with {x}. It's mostly memes. Some of them are about me. I don't like those ones.")
add('dc', 'name_mixup',
    "Great job by {wn} there. I'm sorry: {x}. I said {wn}. I meant {x}. {wn} is someone else.",
    "{wn} is really... sorry, {x} is really pushing the pace. Lon, I gotta get a name card. Can somebody get me a name card?",
    "That's beautiful work by... number... by the one in the red shorts. Lon? Lon, what's the name? {x}. {x}! Yes!",
    "Look at {wn}! Look at... what did I say? I said {wn}? I don't know a {wn}. Forget I said that.")
add('dc', 'wrestling',
    "THAT'S WRESTLING, BABY! That's two-time Olympian talk right there! I know what I'm looking at!",
    "Look at that finish on the single leg! You see how {x} ran the pipe? Run the pipe! That's what I used to tell my guys!",
    "As a wrestler, this is my favorite thing in the world. Besides wings. And my kids. In that order. I'm kidding. Mostly.",
    "The wrestling is the great decider in MMA. Who decides where the fight takes place? The wrestler. Who decides where we eat after? Also the wrestler.",
    "That's a body lock trip! That's old-school Louisiana wrestling right there, they teach you that before you can walk!",
    "Stay heavy, {x}! Make {y} carry your weight! Make {y} pay rent! Make {y} pay the mortgage on that position!")
add('dc', 'bjj',
    "I don't really do the jiu-jitsu stuff. I'm a wrestler. When I see the legs going everywhere like that I just get confused and hungry.",
    "That's a good submission attempt, but {y} is fine. {y} is not fine. Okay, {y} is a little bit not fine.")
add('dc', 'hurt',
    "OHHH! {y} is in trouble! {y} is in TROUBLE!",
    "That's a big shot! I felt that! I felt that in my knees!",
    "OH! I told you! I TOLD you! I said it in the pre-show! Nobody listens!")
add('dc', 'finish_ko',
    "OH MY GOODNESS! OH MY GOODNESS! {winner}! I'm going to go hug {winner}! Somebody hold my chicken!",
    "Lon! LON! Did you see that?! I almost fell out of the chair! I DID fall out of the chair! I'm on the floor!",
    "That's a statement! That's a statement knockout! {winner} just texted the whole division with that one!")
add('dc', 'finish_sub',
    "That's a beautiful submission. I don't understand it. But it's beautiful.",
    "{winner} was squeezing so hard I got tired. I'm hungry now. Is that weird?")
add('dc', 'finish_tko',
    "Good stoppage. Good stoppage. You gotta protect the fighter from himself, and from {winner}.")
add('dc', 'decision',
    "I had it for {winner}. Clear rounds. Clear! If you didn't have it for {winner}, I'll text you. I have everybody's number.",
    "That's a tough one to score. I need to see the replay. And a menu.")
add('dc', 'robbery',
    "No way! NO WAY! I'm not happy about that. I'm not happy about that at all! Who's the judge? I want to text that judge!",
    "That's a bad decision. That's the kind of decision that makes me want to un-retire. I won't. My knees won't let me. But I want to.")
add('dc', 'lull',
    "You know, Lon, this is like a chicken nugget. Not exciting on the outside, but there's something inside. Probably.",
    "I had a fantastic breakfast this morning. Eggs, grits, boudin. That's Louisiana, baby. You can't fight on an empty stomach. You can't commentate on one either.",
    "The weather here is unbelievable. I went out this morning, it was beautiful. Seventy-two degrees. I had a smoothie. That's not related to the fight but I wanted you to know.",
    "Speaking of chicken... nobody was speaking of chicken. But I'm going to.",
    "You know who doesn't like me? {bones}. I don't care what {bones} thinks. I don't. I DON'T. Next question.",
    "Somebody backstage told me {x} has been eating clean for twelve weeks. Twelve weeks! I can't do twelve hours! I respect that.",
    "My son wrestled this weekend. Won three matches. Lost one. Bad ref. I'm not biased.",
    "I'm going to be honest, Lon, I'm not watching this round very closely. I'm thinking about lunch tomorrow. There's a spot.",
    "I said it before and I'll say it again: you cannot cheat the weight cut. You can cheat on your diet, you can cheat on the treadmill. Not the cut.",
    "Somebody in the third row has a sign that says 'DC IS A NUGGET.' I see you. I've seen you every event. I appreciate you.",
    "This is the part of the fight where you start thinking about what you'd do differently. I'd eat more. That's my answer for everything.")
add('dc', 'bias',
    "Look, I like {x}. {x} came to my house, met my family, ate my gumbo. You eat my gumbo, you're family. I'm sorry, {y}.",
    "People say I'm biased because I trained with {x}. That's ridiculous. I'm biased because {x} is great.")
add('dc', 'round_end',
    "Ten-nine {x}. Easy. I've seen enough. Can I go home? No? Okay.",
    "That round was close. Too close. Somebody needs to do more. Like me, at the buffet.")
add('dc', 'blood',
    "That cut's bad. Looks like a hot sauce bottle exploded. Mmm. Hot sauce.",
    "The cutman's gonna need a bigger towel. And maybe a mop. And a hug.")
add('dc', 'foul',
    "That's a foul, but you gotta keep going. When I got hit low I just kept wrestling. That's what you do. Then you cry later in private.")
add('dc', 'lateref',
    "Stop the fight! STOP IT! {ref}, come on! That's not okay, man!")
add('dc', 'stool',
    "Sometimes you gotta know when to stay on the stool. I stayed on a stool once. At a restaurant. They had to close.")
add('dc', 'bones',
    "You know who's watching this? {bones}. And you know what? {bones} can watch. That's all {bones} is good at now. Watching.",
    "And no, I'm not going to talk about {bones}. I'm NOT. ... Okay, one thing.")
add('dc', 'injury',
    "Oh no. Oh, that's bad. That's really bad. I had an injury like that. I iced it with a bag of frozen wings. Don't do that.")

# =====================================================================================
# BRAILLE SONNEN (guest) - blind, confident, wrong, elaborate trash-talk energy
# =====================================================================================
add('braille', 'any',
    "From where I'm sitting, which I'm told is cageside, that looked absolutely devastating.",
    "{x} is dominating this fight. I can hear it. Well, I can hear something. Somebody is dominating something.",
    "I don't actually know what I'm talking about. I can't see shit.",
    "Let me tell you how this ends: {x} climbs up {y}'s stairs in a pair of night-vision goggles, picks the lock and takes that win like a gangster in the night.",
    "Is it still the first round? It feels like the first round. I'm told it's the third. I disagree.",
    "I've been in there with both of these guys. I haven't. But I've been near them. Spiritually.",
    "{y} is in big trouble. I can tell from the crowd noise. Or that might be a guy selling beer.",
    "Who's the one in the red shorts? Is there one in red shorts? There better be. I bet on red.",
    "Lon, describe what's happening. ... No, don't. I already know. I'm a professional.",
    "That's a clean takedown from {x}! ... I'm being told that was the walkout. Still clean.",
    "{x} has the best footwork in the division. I've never seen it, but I believe in it.",
    "I talk a lot, but I always back it up. That's why they call me the blind guy.",
    "Everybody's asking me for a prediction. My prediction is: somebody wins. Write that down. Somebody read it back to me.",
    "Folks, I've got a confession: I'm facing the wrong way. I've been facing the concession stand for two rounds. Great fight, though.",
    "{y} is getting beaten so badly, {y} is going to need a new name. I'd suggest 'Braille Junior'.")

# =====================================================================================
# MICHAEL BISCUIT (guest) - one eye, British, blunt, The Count of Crumpets
# =====================================================================================
add('biscuit', 'any',
    "Bloody hell! I've only got one eye and even I saw that one coming!",
    "{x} is absolutely mullering {y} right now. Mullering. That's a technical term.",
    "I'll take my eye out in a minute if this doesn't pick up. I've done it before. Scared a whole film crew.",
    "You know what they say: an eye for an eye. That's why I don't go to church any more.",
    "That's absolute scenes, that is! Scenes!",
    "{y}'s got to get his hands up, mate. Trust me. I know what happens when you don't. It's why I'm half a pirate.",
    "Look, I fought with one eye for years and nobody knew. So {y} can absolutely fight with a little cut. Stop whinging.",
    "Proper dog fight now! I love this! This is a pub on a Friday night in Manchester!",
    "I'd love to be in there. I wouldn't last a minute, I'm forty-seven with a fake eye and a dodgy knee, but I'd love it.",
    "The Count says: that round goes to {x}. The Count has spoken. The Count would also like a cup of tea.")


# =====================================================================================
# EXPANSION PASS: more lines, more personality, pop-culture parodies ({pop_*})
# =====================================================================================
add('lon', 'lull',
    "{x} told me this week the camp soundtrack was nothing but {pop_musician}. Every day. Six weeks. The sparring partners have asked for counselling.",
    "{x} prepared for this fight by watching {pop_movie} every night. Says it's 'basically a documentary'.",
    "Interesting note: {x} has a sponsorship with {pop_food}. That is a fighter who is being paid in chicken nuggets, and frankly, respect.",
    "{x}'s walkout song tonight was {pop_musician}. Bold choice. The crowd was split between dancing and booing.",
    "I'm told there's a celebrity in attendance tonight: {pop_celeb} is cageside. Wearing sunglasses. Indoors. At night.",
    "Fun fact: {x} has more followers on {pop_app} than the entire population of {home}.",
    "The cards are close, the crowd is restless, and somewhere in the arena a man dressed as {pop_meme} is being escorted out.",
    "{x} is a big fan of {pop_game}, reportedly logs four hours a night. Says it helps with reaction time. Coach says it helps with nothing.",
    "We're getting word that {pop_streamer} is live-streaming this fight from section 104 with six phones. Security is aware. Security is also watching the stream.",
    "Let's take a moment to appreciate the referee, {ref}. He's been doing this for twenty years. He has seen everything. He has stopped very little of it.",
    "Stat for you: {x} lands 4.2 significant strikes per minute. {y} absorbs 4.2 significant strikes per minute. Science.",
    "If you're scoring at home, you're probably doing it better than our judges.",
    "Just a reminder, if you're watching on the free stream, the free stream is in my head now and it's screaming.",
    "{x} drives a {pop_car}, which, I'm told, is currently being booted outside the arena.",
    "Both fighters weighed in right on the number. {y} was so dehydrated at the weigh-ins {y} briefly became a raisin.",
    "We have a little technical issue with the graphics, so here's me reading the stats from a napkin.")
add('lon', 'controversy',
    "The {pop_app} video. We all saw it. {x} says it was taken out of context. The context, unfortunately, was also on video.",
    "And look, the post-fight comments last time were... colorful. The commission sent a letter. The letter was also colorful.",
    "{x} has been critical of the promotion's pay structure, and you know what, we'll leave that for the press conference. Or for a lawyer.")
add('lon', 'stats',
    "{x} has finished {fin} of {wins} wins. That's a finisher. That's a person who does not like the judges either.",
    "{y} has never been finished in professional competition. Never. It's a granite chin, or a very good insurance policy.")
add('lon', 'round_start',
    "Round {r}, and the message from both corners was the same: do more. Very specific coaching.",
    "Round {r}. {x} came out of the corner with a different energy. Possibly a different fighter. We'll check.",
    "Here we go, round {r}. Both fighters touching gloves, which is nice. They're about to stop being nice.")
add('lon', 'hurt',
    "{x} lands something huge and {y}'s legs go on a little vacation!",
    "That one hurt! You don't need replay to know that one hurt!")
add('lon', 'finish_ko',
    "AND IT'S OVER! THE FIGHT IS OVER! {winner} has authored a masterpiece and {loser} is in it, unconscious!",
    "LIGHTS OUT! {winner} delivers the kind of shot they'll show at {winner}'s wedding!",
    "THAT IS ONE FOR THE AGES! {ref} waves it off and {venue} is shaking!")
add('lon', 'finish_sub',
    "Squeeze, squeeze, AND THE TAP! {winner} with a beautiful finish and {loser} has nowhere to go!",
    "OVER! On the mat! {winner} strangles out a win and the crowd loses its collective mind!")

add('blow', 'lull',
    "You ever watch {pop_movie}? Ever? That's what this fight is. That's the vibe. I'm just saying.",
    "I had {pop_celeb} on the podcast last week. Four hours. We talked about aliens for three. Great guy. Thinks the moon is a hologram, which, it's entirely possible.",
    "Somebody sent me a {pop_streamer} clip where he tries a rear naked choke on a mannequin. Terrible technique. Beautiful energy.",
    "I've been eating nothing but elk and {pop_food}. Not together. Well, once together. Don't do that.",
    "I tried {pop_app} for the first time. Bro, it's a hellscape. I saw a video of a raccoon doing jiu-jitsu. Better hip escape than half these guys, by the way.",
    "I've been playing {pop_game} with my kids. I'm terrible. I'm a forty-something black belt who gets choked out by a nine-year-old with a controller.",
    "You know what I watched last night? A documentary about octopuses. Eight arms, man. Imagine the guard. Imagine the GUARD on an octopus!",
    "There's a guy in the third row who looks exactly like {pop_celeb}. It's not. I checked. I yelled at him. Security came. It's fine.",
    "My sauna is so hot, bro, my phone melted. That's dedication. Or a fire hazard. Possibly both.",
    "The moon landing. Real or fake? I'm not saying anything. I'm just asking. Jaymee, pull up the moon.",
    "If you put a gorilla in this cage, man... we'd see some things. A gorilla is like eight times stronger. Pull up gorilla strength. No, the real number.",
    "You know who's really underrated? Ancient Egyptians. They were jacked, man. Pyramids don't build themselves.",
    "I've been reading about stoicism. Very interesting. Basically: be calm when someone is punching you in the face. Very relevant tonight.",
    "{x} posted a picture with {pop_celeb} last week. I texted {x}: 'why didn't you invite me?' No answer. That's fine. I'm fine.",
    "I just want everyone to know I've been drinking {pop_food} and I have never felt more alive. Or more dehydrated.",
    "Someone told me {pop_meme} is a thing now. I don't know what that is. I'm 50% sure it's a sex thing.",
    "Bro, did you see the {pop_movie} trailer? That's what this fight needs. A slow-motion walk. A bald guy with a sniper rifle.",
    "Ten years ago I said slap fighting would never catch on. Now it's on TV. I don't know what's real anymore. Pull up reality, Jaymee.")
add('blow', 'bjj',
    "That's a rubber guard! That's a real rubber guard! Eddie the Enlightened would be crying right now! Someone call him!",
    "Look at the grips! You see the grips?! That's like a monkey holding a banana it really, really likes!",
    "THE BACK! HE'S GOT THE BACK! It's over! It's not over! It's MOSTLY over!",
    "Most people don't understand jiu-jitsu. That's okay. I'll explain it for the next three hours on the podcast.",
    "{x} is like a {pop_movie} villain on the ground. Calm. Patient. Waiting to break your arm while explaining his childhood.")
add('blow', 'wrestling',
    "THAT'S A BEAUTIFUL TAKEDOWN! Look at the drive! That's a wrestler's drive! Like a dump truck with emotions!",
    "When a wrestler gets in your hips it's like the government getting in your bank account. You're not getting rid of them.",
    "Chain wrestling, man! It's like a puzzle where every piece is someone's face on the mat!",
    "I love wrestlers. I respect them. I'm afraid of them. They wake up at 5am to suffer. On purpose. Like monks, but meaner.")
add('blow', 'hurt',
    "OH! OH MY GOD! THAT'S A HUGE SHOT! HE'S WOBBLED! HE'S DOING THE {pop_meme}!",
    "OHHHHHH! HE'S HURT! I SAID HE'S HURT! EVERYBODY RUN BACK TO YOUR TV!",
    "OHHH! That's the kind of shot that changes your name! He doesn't know who he is right now!")
add('blow', 'flashy',
    "WHAT?! That's straight out of {pop_game}! Somebody check the cheat codes!",
    "That looked like {pop_movie}! That looked like a movie! A good one! Not the sequel!")
add('blow', 'finish_ko',
    "OH MY GOD! HE'S OUT! He's out cold! He's seeing {pop_movie} in the afterlife right now! He's fine! He's fine! He's FINE!",
    "THAT IS INSANE! I'm shaking! Look at my hands! I need a cold plunge! I need an elk! I need to call my wife!")
add('blow', 'round_end',
    "I had that round for {x}, but I've also been wrong before. Like in 2009. About crypto. And in 2011. Also about crypto.",
    "Close round, man. Very close. Statistically, it's entirely possible both of them won it.")

add('dc', 'texted',
    "I just got a text from {pop_celeb}. It says 'who is winning?' I don't know who gave {pop_celeb} my number.",
    "{x}'s wife texted me to say he's been eating clean. Then {x} texted me a photo of a {pop_food} bag. So.",
    "I got a text from {x}'s coach that said 'body, body, body.' I don't know if that's advice for the fight or a fitness plan for me.",
    "{x} sent me a meme earlier this week. It was {pop_meme}. With my face on it. I'm not laughing. I'm laughing a little.",
    "{y} texted me 'you're always biased, DC.' And I texted back 'I'm biased toward good wrestling.' Then I sent a thumbs up. Then I sent a chicken.",
    "Group chat is going crazy right now. Every fighter on the roster is texting me 'that was a robbery.' The fight's not over yet, guys!")
add('dc', 'lull',
    "I'm going to {pop_food} after this. Don't follow me. I need to be alone with my thoughts and a family-size bucket.",
    "Did anybody see {pop_movie}? I watched it on the plane. I cried twice. Once at the movie, once at the airplane food.",
    "My daughter showed me {pop_app} this week. I don't understand it. A man was dancing in a kitchen. Why? Who asked him?",
    "Somebody asked me if I'd fight {pop_athlete}. I'd take him down. I'd take him down and sit on him and eat a sandwich.",
    "This is like {pop_show}. You don't know what's happening, everybody's yelling, and somebody's going to get hurt.",
    "I was a two-time Olympian. Did I mention that? I've mentioned that? Okay, three times then.",
    "You know what I miss about fighting? Nothing. I miss the food in fight week. I do not miss the not eating.",
    "When I was champion, I used to visualize my opponent as a chicken wing. That's how I knew I had to eat him.",
    "People ask me, DC, are you a cornerman or a commentator? I'm both. I'm a commentator who yells at the corner.",
    "Who's the guy cageside in the {pop_brand} hat? Is that {pop_celeb}? No. That's a guy. Just a guy. Great hat though.")
add('dc', 'name_mixup',
    "Great work there by... by... the guy with the beard. They both have beards. The one with MORE beard.",
    "{wn}! I mean {x}! I've been calling {x} {wn} all week. {x} hasn't corrected me. I think {x} likes it.")
add('dc', 'wrestling',
    "OHHH, that's a beautiful blast double! I used to hit that in my sleep! Literally! My wife made me sleep on the couch!",
    "You see that? Head position, hand position, hip position. Three positions. That's wrestling. Also how I order at a buffet.",
    "When a wrestler gets your back, it's like when the IRS gets your address. It's over. Just give up and cry.")
add('dc', 'hurt',
    "OHHH! He's hurt! He's hurt like I was hurt when they took the wings off the menu!",
    "That's a BIG shot! Somebody get a medic! And a sandwich! For me!")

add('braille', 'any',
    "This reminds me of {pop_movie}. Which I've never seen. But I've heard it.",
    "{x} is going to end this like {pop_celeb} ended their career: abruptly, and in a way nobody saw. Especially me.",
    "Somebody just told me {pop_streamer} is in the building. I'd like to meet him. Somebody point me toward him. Not like that. Toward him.",
    "I'll say it: {x} is the greatest fighter in history. I'm told it's a prelim. Doesn't matter. I said it.",
    "I've been told the score is close. I've also been told I'm on fire. Somebody please clarify which one.",
    "{y} is getting tooled. Is that the right word? Lon is nodding. Lon, I can't see you nodding.",
    "A blind man can see who's winning this fight. I'm a blind man. I'll get back to you.",
    "I went to the judges' table and asked to see the scorecards. They said 'you can't see anything.' Rude, but accurate.",
    "I'm the only analyst in this sport with no agenda. Also no vision. The two are related.")
add('braille', 'hurt',
    "WHOA! I heard that one! That sounded like {pop_food} hitting a sidewalk!",
    "Big shot! I can tell by the gasps! Or someone dropped their nachos. Either way: big moment.")
add('braille', 'finish_ko',
    "Did someone get knocked out? I'm sensing a knockout. I'm getting a strong knockout vibe.",
    "I called this! I called it this morning! I called somebody, at least. It was a wrong number. But the vibes were right.")

add('biscuit', 'any',
    "This is better than {pop_show}, this is. And I've seen every episode. With one eye. Twice.",
    "Proper scrap! It's like a {pop_food} queue on a Saturday! Elbows everywhere!",
    "If {y} keeps dropping the left hand, I'll come down there and teach him myself. I won't. My knee's held together with chewing gum.",
    "Back in my day, we didn't have nutritionists. We had a kebab and a dream.",
    "I said this on the podcast and I'll say it here: {x} is the real deal. I've been wrong before. Nobody remembers. Don't look it up.",
    "Good on you, {x}! That's how you do it! Absolute scenes, absolute scenes, ABSOLUTE scenes!",
    "I've got one eye on this fight. Literally. The other one is in my pocket.")
add('biscuit', 'blood',
    "Look, I fought with one eye for years and nobody knew. So {y} can absolutely fight with a little cut. Stop whinging.",
    "That's a lovely cut that. Proper claret. My mum would faint. My mum fainted at all of my fights, to be fair.")
add('biscuit', 'hurt',
    "OH HE'S GONE! He's gone! He's not gone! He's... wobbly! Like a pint glass on a pub table!",
    "Bloody hell! He's hurt! I felt that in my fake eye!")
add('biscuit', 'finish_ko',
    "GOODNIGHT, SWEETHEART! Oh, that's a beauty! That's the best thing I've seen since my second eye!",
    "SPARKED! Absolutely sparked! I've been sparked like that! I don't remember it but I've been told!")
add('biscuit', 'round_end',
    "Ten-nine {x}, easy. I'd bet my good eye on it.")

add('lon', 'open_main',
    "Tonight's main event has been described as {pop_movie} meets {pop_show}. I have no idea what that means and I'm thrilled.",
    "Main event time. If you're at home, put down the {pop_food} and turn it up.")
add('blow', 'open_main',
    "I had a dream about this fight, bro. Fully lucid. There was an elk in it. The elk won. I'm picking the elk.",
    "Somebody asked me who I'm picking. I'm picking violence. Violence wins tonight.")
add('dc', 'open_main',
    "I had lunch with {x} on Wednesday. {x} had a salad. I had a salad. Then I had a second lunch. {x} did not. That's discipline.",
    "{y} called me at midnight to ask how to stop the double leg. I said 'don't get taken down.' Free advice. Expensive advice.")

add('lon', 'stool', "The corner has stopped it. That's the toughest decision a coach ever makes, and the right one tonight.")
add('blow', 'foul', "You can't kick the nuts, man! The nuts are sacred! That's the one thing we all agree on!")
add('dc', 'foul', "Ohhh, that's a low blow. I felt that one. Every man in this building felt that one. Some women too.")
add('lon', 'injury', "Something's broken. That's the sound nobody wants to hear, and {venue} just heard it.")
add('dc', 'robbery', "I'm gonna text the commission. I have their number. They have blocked my number. I have a second number.")
add('blow', 'decision', "Look, judging in this sport is like {pop_show}. You never know what's going to happen and somebody's always crying.")

# situations without dedicated banks fall back through this chain
FALLBACK = {
    "flashy": ["hurt"], "legkick": ["lull"], "body": ["hurt"], "sub_attempt": ["bjj"],
    "knockdown": ["hurt"], "finish_doc": ["finish_tko"], "finish_dq": ["foul"],
}

# =====================================================================================
# JUICED BUTLER - ring announcer (Bruce Buffer, but jacked)
# =====================================================================================
BUTLER = {
    "name": "Juiced Butler",
    "open_main": [
        "LADIES AND GENTLEMEN... THIS... IS... THE MAIN EVENT OF THE EVENING!",
        "LADIES AND GENTLEMEN! {VENUE}! ARE YOU... READY?!",
        "FROM {VENUE}... IT IS NOW... THE MOMENT... YOU HAVE ALL BEEN WAITING FOR!",
        "LADIES AND GENTLEMEN, FIGHT FANS AROUND THE WORLD... AND ALSO THE GUY IN SECTION 112 WHO HAS BEEN YELLING AT ME FOR TWO HOURS...",
    ],
    "open_title": [
        "LADIES AND GENTLEMEN... FIVE ROUNDS... FOR THE {BELT}!",
        "THIS... IS... FOR... THE {BELT}! THE WORLD... IS... WATCHING!",
        "LADIES AND GENTLEMEN, THE FOLLOWING CONTEST IS SCHEDULED FOR FIVE ROUNDS, AND IT IS FOR THE {BELT}!",
    ],
    "open_rematch": [
        "THEY'VE DONE IT BEFORE... AND THEY'RE GONNA DO IT AGAIN... THIS IS... {X} VERSUS {Y} {ROMAN}!",
        "UNFINISHED... BUSINESS! LADIES AND GENTLEMEN, PART {ROMAN}!",
    ],
    "open_prelim": [
        "Ladies and gentlemen, the following contest is scheduled for three rounds in the {div} division.",
        "Ladies and gentlemen, three rounds of {div} action!",
        "Fight fans, this one is scheduled for three rounds!",
    ],
    "its_time": [
        "IT'S... TIIIIIIIIIIME!",
        "IT'S... TIIIIIIME... TO GET... JUUUUICED!",
        "{EVENT}... IT'S... TIIIIIIIIME!",
        "LADIES AND GENTLEMEN... I'VE BEEN HOLDING THIS IN ALL NIGHT... IT'S... TIIIIIIIIIIIIIME!",
    ],
    "blue": [
        "Introducing first... FHIGHTING out of the BLUE c-HORNER...",
        "In the BLUE corner...",
        "Introducing first, the challenger, FIGHTING out of the BLUE CORNER...",
    ],
    "red": [
        "And the opponent... FHIGHTING out of the RED c-HORNER...",
        "And now... FIGHTING out of the RED CORNER...",
        "And in the RED corner...",
    ],
    "height": [
        "Standing {height} tall,",
        "{He} stands {height},",
        "At a height of {height},",
    ],
    "weight": [
        "weighing in at {weight} pounds...",
        "and tipping the scales at {weight} pounds...",
        "weighing {weight} pounds... most of it attitude...",
    ],
    "origin": [
        "Originally from {home}, {country}...",
        "Hailing from {home}, {country}...",
        "Born in {home}, {country}...",
    ],
    "gym": [
        "now fighting out of {gym}...",
        "training out of {gym}...",
        "representing {gym}...",
    ],
    "record": [
        "with a professional record of {w} wins, {l} losses{d}...",
        "{He} is {w} and {l}{d}...",
        "With {w} victories, {l} defeats{d}...",
    ],
    "fact_lead": [
        "{fact}...",
        "Fun fact: {fact}...",
        "And ladies and gentlemen, {fact}...",
    ],
    "name_lead": [
        "Presenting...",
        "Heeeeeeee is...",
        "Introducing...",
        "Let's hear it for...",
    ],
    "champ_lead": [
        "AND {HE} IS... THE REIGNING... DEFENDING... UNDISPUTED... {DIV} CHAMPION OF THE WOOOOORLD...",
        "THE CHAMPION! THE KING OF THE {DIV} DIVISION... THE ONE... THE ONLY...",
    ],
    "juiced": [
        "(Juiced Butler flexes. A tuxedo button flies into row three and hits a man in the forehead.)",
        "(He does the 360 spin. The crowd gasps. His lats briefly block the jumbotron.)",
        "(Butler takes a long sip from a gallon jug labelled 'NOT STEROIDS'.)",
        "(He does the 180. Then, overcome by the moment, another 180. He is now facing the wrong way. He doesn't care.)",
        "(A vein in Butler's neck is visible from the upper deck. Fans in the cheap seats can count his pulse.)",
        "(Butler's sleeve tears at the bicep. He was ready for this. He brought a spare tux.)",
        "(He points at the corner so hard he dislocates nothing, because he is built like a refrigerator.)",
        "(Juiced Butler poses for a bodybuilding judge who is not here.)",
        "(He leans into the microphone like it owes him money.)",
        "(He adds the letter H to every word for the next forty seconds. Nobody knows why. Nobody wants him to stop.)",
    ],
    "decision_open": [
        "LADIES AND GENTLEMEN... AFTER {ROUNDS} ROUNDS... WE GO TO THE JUDGES' SCORECARDS FOR A DECISION!",
        "Ladies and gentlemen, after {ROUNDS} rounds, we go to the judges' scorecards!",
        "LADIES AND GENTLEMEN... THE JUDGES HAVE TOTALLED THE SCORECARDS... AND IT IS... A DECISION!",
    ],
    "decision_card": [
        "{judge} scores the contest {sa}-{sb}...",
        "{judge} has it {sa}-{sb}...",
        "Judge {judge} sees it {sa}-{sb}...",
    ],
    "decision_unan": ["For your WINNER... by UNANIMOUS DECISION...", "All three judges agree... your WINNER..."],
    "decision_split": ["We have a SPLIT DECISION! For your WINNER...", "SPLIT DECISION! ... Your WINNER..."],
    "decision_majority": ["We have a MAJORITY DECISION! Your WINNER...", "By MAJORITY DECISION... your WINNER..."],
    "decision_draw": ["Ladies and gentlemen... this contest... is declared a DRAW!", "IT'S A DRAW! Nobody goes home happy! Everybody goes home!"],
    "new_champ": ["AAAAND NEEEEEEW...", "AND THE NEEEEEEEW... {DIV} CHAMPION OF THE WORLD..."],
    "still_champ": ["AND STILLLLLLL...", "AAAAND STIIIIIILLLL... THE {DIV} CHAMPION OF THE WORLD..."],
    "finish": [
        "Ladies and gentlemen, referee {ref} has called a stop to this contest at {time} of round {round}. Your winner, by {method}...",
        "At {time} of round number {round}, your winner by {method}...",
    ],
    # safe, silly facts used when the fighter's file doesn't give the Butler anything better
    "facts_generic": [
        "{he} once ate forty chicken nuggets in one sitting and then went for a run",
        "{he} has never lost an arm-wrestling match to {his} own coach",
        "{he} claims to have been raised by wolves. {his} mother disputes this",
        "{he} sleeps in a hyperbaric chamber shaped like a race car",
        "{he} learned to fight by watching YouTube videos at 0.75 speed",
        "{he} is a certified scuba instructor. Nobody asked. {he} will tell you anyway",
        "{he} has a golden retriever named Knockout who has never knocked anyone out",
        "{he} walks out to the same song every fight and has never once listened to the lyrics",
        "{he} has a tattoo {he} regrets in a language {he} does not speak",
        "{he} once sparred a kangaroo on a working holiday. Result: no contest",
        "{he} has not eaten a vegetable since 2014 and is proud of it",
        "{he} competes in competitive barbecue in the off-season and has a trophy shaped like a pig",
        "{he} believes {he} was a samurai in a previous life. {he} was not",
        "{he} has been banned from two all-you-can-eat buffets on 'moral grounds'",
        "{he} still lives with {his} grandmother, who does {his} laundry and {his} cardio",
        "{he} has a degree in accounting and does {his} own taxes. Badly",
        "{he} once won a hot-dog eating contest on the morning of a fight. {he} won the fight too",
        "{he} names every one of {his} punches. The jab is 'Gary'",
        "{he} has completed a marathon dressed as a hot dog",
        "{he} has an undefeated record in parking-lot disputes",
        "{he} writes poetry. It is mostly about chicken",
        "{he} meditates for two hours a day and still has the temper of a wasp",
        "{he} once mistakenly walked into a ballet class and stayed for six months. Footwork has never been better",
        "{he} is afraid of birds. All birds. Especially pigeons",
        "{he} believes the moon landing was real but that Australia is not",
        "{he} has never seen a single Star Wars movie and fights angry about it",
        "{he} drinks a gallon of milk a day and has been asked to stop by {his} nutritionist, roommate and dentist",
        "{he} once fought with the flu and won. {he} also gave the flu to the referee",
        "{he} can name every US president. {he} can't name {his} opponent",
        "{he} has a pet tortoise named 'Cardio'",
        "{he} has seen {pop_movie} one hundred and twelve times and quotes it during sparring",
        "{he} walks out to {pop_musician} and has never once heard the second verse",
        "{he} is sponsored by {pop_food} and is legally required to mention it. {pop_food}!",
        "{he} once beat {pop_streamer} in an arm-wrestling match on a livestream that crashed the internet in two countries",
        "{he} drives a {pop_car} with a license plate that just says 'OUCH'",
        "{his} favorite TV show is {pop_show}, which {he} watches during the weight cut to 'feel something'",
        "{he} claims to be undefeated at {pop_game}. {his} little brother says otherwise",
        "{he} has more followers on {pop_app} than {pop_celeb}",
        "{he} once got recognised at {pop_food} and the staff gave {him} free fries. {he} fought for that",
        "{he} wears {pop_brand} to every press conference and has never been paid for it",
    ],
}


def main():
    out = {"speakers": SPEAKERS, "booth": B, "fallback": FALLBACK, "butler": BUTLER}
    p = os.path.join(ROOT, 'data', 'documents', 'commentary.json')
    json.dump(out, open(p, 'w'), indent=1, ensure_ascii=False)
    n = sum(len(v) for sp in B.values() for v in sp.values())
    nb = sum(len(v) for k, v in BUTLER.items() if isinstance(v, list))
    print(f"wrote {p}: {n} booth lines, {nb} announcer lines")


if __name__ == '__main__':
    main()
