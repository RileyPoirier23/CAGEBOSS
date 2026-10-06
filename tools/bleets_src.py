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


if __name__ == '__main__':
    main()
