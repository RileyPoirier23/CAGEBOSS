"""Live bleets: what the internet says while you watch a fight.
Run: python3 tools/bleets_src.py  (writes templates.json -> "bleets")

Placeholders: {x} the fighter who did it (last name), {y} the other one, {xh} / {yh} their
handles, {event}, {promotion}. Kinds: fighter (another pro on the roster), media, fan.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..')

B = {
  'open': {
    'fighter': ["Got popcorn. Got a beer. Got a bad feeling about {y}.", "{x} by violence. Don't @ me.", "If {y} wins this I'm retiring. Not really. Maybe.", "Watching from the hotel. Room service is $40 for a burger. This sport owes me money."],
    'media': ["We're LIVE from {event}. {x} vs {y} up next.", "SOURCES: both fighters are in the cage. More as it develops.", "Line movement on {x} all day. Somebody knows something."],
    'fan': ["{x} gonna fold this man like a lawn chair", "I put my rent on {y}. Pray for me.", "who the fuck is {y}", "LETS GOOOOO", "{promotion} better not fuck this one up"],
  },
  'knockdown': {
    'fighter': ["OHHHHH {y} IS DOWN", "That's a grown man's punch right there", "I felt that one from my couch. My couch felt it too.", "{y} hit the floor like a fucking bag of laundry"],
    'media': ["KNOCKDOWN: {x} drops {y} at {event}.", "{y} is down. Clip incoming."],
    'fan': ["DOWN GOES {Y}", "HE'S DONE HE'S DONE HE'S", "my whole bar just stood up", "{y}'s soul just left his body lmao", "BRO WHAT"],
  },
  'rocked': {
    'fighter': ["{y} is doing the noodle walk", "Clinch up {y}. CLINCH UP.", "Legs gone. Seen it a thousand times. Been it twice."],
    'media': ["{y} is badly hurt.", "{x} has {y} in serious trouble."],
    'fan': ["{y} legs on roller skates", "STOP IT REF", "{y} looking for his car keys out there", "{x} cooking rn"],
  },
  'ko': {
    'fighter': ["GOODNIGHT. Holy shit. Somebody check on {y}.", "{x} just put his whole name on the map", "Call me next {x}. Actually don't.", "That's the sickest KO of the year and it's not close"],
    'media': ["{x} def. {y} via KO at {event}. Stunning.", "WOW. {x} finishes {y}. Replay is disgusting.", "Clip of {x}'s knockout already at 2M views."],
    'fan': ["SLEEEEEEEEP", "{y} is in the shadow realm", "SOMEBODY CALL HIS MOM", "I CANNOT BREATHE", "that's going on my ceiling", "{y}'s mouthpiece is in a different timezone"],
  },
  'sub': {
    'fighter': ["That's tight. That's fucking tight.", "TAP {Y} TAP", "Jiu-jitsu is the gentle art of making grown men scream politely"],
    'media': ["{x} locked in a submission on {y}.", "{x} hunting the finish on the ground."],
    'fan': ["TAP TAP TAP", "ARM IS GONE BRO", "{y} turning purple", "Blow Hogan is gonna lose his mind"],
  },
  'tap': {
    'fighter': ["{x} with the sub. Absolute killer on the mat.", "Smart tap. Live to fight another day.", "That's what happens when you sleep on the grappling"],
    'media': ["{x} def. {y} via submission at {event}.", "{y} taps. {x} gets the finish."],
    'fan': ["HE TAPPED LMAOOOO", "{y} tapped faster than my wifi", "jiu jitsu stays undefeated", "{x} is a fucking python"],
  },
  'takedown': {
    'fighter': ["Wrestling. Boring as shit. Wins fights.", "{x} said 'lay down' and {y} listened"],
    'media': ["{x} with a big takedown.", "{x} takes it to the mat."],
    'fan': ["ugh not the lay and pray", "STAND THEM UP", "{x} took him down like he owed him money", "wrestlers are cheat codes"],
  },
  'blood': {
    'fighter': ["That cut is fucking nasty", "Somebody get the doc in there", "{y}'s face looks like a crime scene"],
    'media': ["{y} is bleeding badly.", "Doctor watching {y}'s cut closely."],
    'fan': ["the canvas looks like a horror movie", "{y} leaking like a juice box", "BLOOD MONEY BABY"],
  },
  'round': {
    'fighter': ["10-9 {x}. Easy.", "Close round. Judges gonna fuck it up somehow.", "{y} needs to wake the fuck up"],
    'media': ["Our scorecard: 10-9 {x}.", "Round goes to {x} for us. Close."],
    'fan': ["10-9 {x} if the judges have eyes (they don't)", "this fight is so good", "i'm sweating and i'm not even in it", "{y} needs to throw something lmao"],
  },
  'lull': {
    'fighter': ["Come on boys. Somebody throw something.", "This is a chess match. A really slow chess match."],
    'media': ["Measured pace so far.", "Feeling-out process in this one."],
    'fan': ["boooooring", "wake me up when someone gets hit", "I came here for violence not a staring contest", "kiss already", "Blow Hogan about to start talking about elk"],
  },
  'decision': {
    'fighter': ["Going to the cards. God help us.", "Whoever's judging this better have glasses on"],
    'media': ["This one goes to the judges.", "Scores incoming."],
    'fan': ["please don't rob {x}", "judges about to ruin my night", "I swear if they give it to {y}"],
  },
  'robbery': {
    'fighter': ["ROBBERY. Absolute robbery. Those judges need to be investigated.", "What fight were they watching?", "Disgraceful. {y} won that and everyone knows it."],
    'media': ["Controversial decision at {event}. Fans furious.", "That scorecard is going to be talked about for a while."],
    'fan': ["DAYLIGHT ROBBERY", "the judges are on the payroll i'm calling it", "{promotion} rigged confirmed", "I want my $79.99 back"],
  },
}


def main():
    p = os.path.join(ROOT, 'data', 'documents', 'templates.json')
    t = json.load(open(p))
    t['bleets'] = B
    json.dump(t, open(p, 'w'), indent=1, ensure_ascii=False)
    print('wrote', sum(len(v) for s in B.values() for v in s.values()), 'bleets')




# ------------------------------------------------------------------ the big expansion
# Short, punchy, real-broadcast-timeline energy. {pop_*} placeholders expand to the parody bank,
# so the same template rarely reads the same twice.
MORE = {
  'open': {
    'fighter': ["Locked in for this one", "Pick? Violence.", "{x} by stoppage. Write it down.", "Who y'all got?", "If {y} gets taken down it's over", "Need this one to go 3 rounds for my parlay", "My coach said don't watch this one. Watching it.", "This the fight I been waiting for", "Fighter row is LOUD right now", "Sitting next to {pop_celeb} on fighter row. Weird night."],
    'media': ["Main event lines: {x} slight favourite.", "Fighters are in the cage. Here we go.", "Tale of the tape heavily favours {x} on reach.", "Juiced Butler is ready. Are you?", "Walkouts done. Big energy in the building.", "{x} walked out to {pop_musician}. Bold.", "Doors open, arena near capacity for {event}."],
    'fan': ["IT'S TIIIIIME", "my heart rate is higher than the fighters'", "need {x} to cook", "{y} looking nervous ngl", "bet my {pop_car} on this fight. pray", "who let {pop_celeb} on fighter row lmao", "watching this instead of {pop_show}. no regrets", "{x} walkout song goes HARD", "the octagon girl walked past the camera and chat went insane", "ok but who's actually winning this"],
  },
  'knockdown': {
    'fighter': ["OOF", "That's a fight changer", "Get up get up get up", "He felt that in his ancestors", "Big right hand. Nothing else to say.", "FINISH HIM"],
    'media': ["{y} dropped by a {x} counter.", "Massive knockdown in the round.", "{x} drops {y} and pours it on."],
    'fan': ["OHHHH", "HES HURT HES HURT", "{y} just saw the light", "bro got dropped like a {pop_app} update", "SHOW ME THE REPLAY", "i spilled my {pop_food} everywhere", "the whole bar jumped", "nah {y} is sleeping on his feet", "SWING BABY SWING"],
  },
  'rocked': {
    'fighter': ["He's wobbled", "Tie up. Tie UP.", "Walk him down", "That's the chin tested", "Body is cooked, head's next"],
    'media': ["{y} on unsteady legs.", "{x} sensing the finish."],
    'fan': ["{y} doing the {pop_meme} walk", "legs = jello", "ref watch closely", "{x} smells blood", "he's out on his feet bro", "someone get {y} a {pop_food}"],
  },
  'ko': {
    'fighter': ["GOODNIGHT", "Lights. Out.", "Wow.", "That's a bonus", "Put that one in the museum", "Nah that's diabolical", "I need to see that again", "Somebody check his pulse", "50 grand right there", "Call an ambulance. But not for me.", "Instant replay worthy", "Damn I'm glad that wasn't me"],
    'media': ["{x} finishes {y} by KO.", "KO OF THE NIGHT CONTENDER: {x}.", "{x} stops {y}. Huge result.", "Doctors attending to {y}, who is now sitting up.", "{x}'s first KO in the organisation.", "That's a highlight reel finish from {x}."],
    'fan': ["SLEEEEP", "THAT'S THE CLIP OF THE YEAR", "{y} is in the {pop_movie} universe now", "UNCONSCIOUS", "my neighbours heard me scream", "i've watched that 40 times already", "they gotta give {x} a title shot", "{y} got sent to {pop_game} loading screen", "certified human highlight", "THIS IS WHY WE WATCH", "{x} hits like {pop_athlete} with a grudge", "rip {y}'s phone notifications tonight", "DOWN GOES {Y}"],
  },
  'sub': {
    'fighter': ["Sunk", "That's deep", "Fight it fight it fight it", "Hand fight, hand fight!", "Squeeze!"],
    'media': ["{x} hunting the finish.", "Submission attempt from {x}."],
    'fan': ["SQUEEEEZE", "{y} face turning {pop_brand} red", "jiu jitsu baby", "he's not tapping he's not tapping", "this is {pop_movie} levels of tension", "{x} is a python with a mortgage"],
  },
  'tap': {
    'fighter': ["Jiu jitsu stays undefeated", "Beautiful sub", "Respect for tapping. No shame.", "Black belt shit", "Wrestle him, they said."],
    'media': ["{x} via submission.", "{y} taps. {x} gets the win.", "Submission of the night contender from {x}."],
    'fan': ["TAPPEDDDD", "{y} tapped like he was ordering on {pop_app}", "the arm was GONE", "{x} gonna get that performance bonus", "jiu jitsu is magic"],
  },
  'takedown': {
    'fighter': ["Level change was disgusting", "Wrestling is a cheat code", "Get up {y}", "Ground and pound time"],
    'media': ["{x} completes a takedown.", "{x} drags it to the mat."],
    'fan': ["LAY AND PRAY INCOMING", "booo stand em up", "{x} took him down like {pop_athlete}", "wrestlers always do this smh", "GET UP"],
  },
  'blood': {
    'fighter': ["Cut looks bad", "That's gonna need stitches", "Doc's gonna look at that"],
    'media': ["Nasty cut on {y}.", "Doctor checks {y} between rounds."],
    'fan': ["the mat looks like a {pop_movie} set", "that's a lot of blood bro", "{y} bleeding like a broken {pop_brand} pen", "THE BLOOD MONEY ERA"],
  },
  'round': {
    'fighter': ["Close round", "10-9 {x} for me", "{y} needs to pick it up", "Lot of fight left", "Gas tanks are gonna tell the story", "Feels like {x} is in control"],
    'media': ["Round to {x} on our card.", "Close round. Could go either way.", "Strikes about even through this round."],
    'fan': ["10-9 {x}", "robbery incoming i can feel it", "this is better than {pop_show}", "{y} gotta stop headhunting", "cardio check next round", "great round", "i'm stressed", "corner better be screaming at {y}"],
  },
  'lull': {
    'fighter': ["Somebody throw", "Feeling out round", "Too much respect in there", "Patience. Big shot coming."],
    'media': ["Slow pace in the opening minutes.", "Both fighters measuring distance."],
    'fan': ["this is putting me to sleep", "i came to see violence not {pop_show}", "throw a punch PLEASE", "refreshing {pop_app} while they stare at each other", "kiss already", "{x} {y} staring contest champions"],
  },
  'decision': {
    'fighter': ["Judges please do your job", "I got {x}", "Gonna be close", "Never leave it to the judges"],
    'media': ["To the scorecards.", "We'll go to the judges."],
    'fan': ["oh no the judges", "please don't do it to us again", "{x} won that clearly", "this better not be another robbery"],
  },
  'robbery': {
    'fighter': ["What fight were they watching??", "Judging is a joke", "Robbery. I said it.", "That's crazy. That's actually crazy."],
    'media': ["Split decision sparks outrage online.", "Fans react to a controversial result."],
    'fan': ["ROBBERY OF THE CENTURY", "the judges must be on {pop_app} during rounds", "{promotion} is rigged confirmed", "who paid the judges", "i want my money back"],
  },
}

for sit, kinds in MORE.items():
    for kind, lines in kinds.items():
        B.setdefault(sit, {}).setdefault(kind.strip('"'), []).extend(lines)


if __name__ == '__main__':
    main()
